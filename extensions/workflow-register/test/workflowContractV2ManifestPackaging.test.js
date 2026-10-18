const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const Module = require("node:module")
const { test } = require("node:test")
function subject() {
  let value = {}
  try { value = require("../scripts/lib/compact-manifest-module.js") }
  catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error }
  assert.equal(typeof value.compactManifestModule, "function", "P7 AST-preserving packaging compaction is not implemented")
  return value.compactManifestModule
}
function evaluate(source) { const context = { module: { exports: {} } }; vm.runInNewContext(source, context); return JSON.stringify(context.module.exports) }

test("packaging compaction preserves literals, regexes, template expressions and operator boundaries", () => {
  const compact = subject()
  const source = `// comment\n"use strict";\nlet x = 2, y = 3;\nconst text = "http://example/ a b";\nmodule.exports = { text, rx: /a b/.test("a b"), numeric: 1 .toString(), plus: x++ + +y, template: \`a \${x + y} b\` };`
  const result = compact(source)
  assert.ok(result.length < source.length)
  assert.equal(evaluate(result), evaluate(source))
  const asi = "function answer(){return\n{value:1}}; module.exports={value:answer()};"
  assert.equal(evaluate(compact(asi)), evaluate(asi))
  assert.throws(() => compact("module.exports=(;"))
})

test("packaged compact codec retains real trusted-handle and canonical manifest behavior", () => {
  const compact = subject(), filename = path.resolve(__dirname, "../out/core/contractV2/compiledPlanManifest.js")
  const source = fs.readFileSync(filename, "utf8"), code = compact(source)
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(code, filename)
  const support = require("./workflowContractV2CompilerTestSupport"), fixture = support.createLockedRawPackage()
  const environment = support.compilerSubject().createAuditedWorkflowCompilerEnvironment({ purpose: "evidence", providerCatalog: support.createEmptyProviderCatalog(), bobProfile: support.createBobProfile() })
  const compiled = support.compilerSubject().compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment })
  assert.equal(compiled.ok, true)
  const original = require(filename), a = original.createCompiledWorkflowPlanManifestPackage({ collection: "collections/a", slot: "minimal", generation: fixture.rawPackage.generation, handle: compiled.handle })
  const b = loaded.exports.createCompiledWorkflowPlanManifestPackage({ collection: "collections/a", slot: "minimal", generation: fixture.rawPackage.generation, handle: compiled.handle })
  assert.deepEqual(loaded.exports.encodeCompiledWorkflowPlanManifest(loaded.exports.createCompiledWorkflowPlanManifest({ packages: [b] })), original.encodeCompiledWorkflowPlanManifest(original.createCompiledWorkflowPlanManifest({ packages: [a] })))
  assert.throws(() => loaded.exports.createCompiledWorkflowPlanManifestPackage({ collection: "collections/a", slot: "minimal", generation: fixture.rawPackage.generation, handle: { ...compiled.handle } }))
  assert.ok(code.length < source.length)
})
test("VSIX packaging compacts only P7 modules, preserves all other payloads and is repeatable", async t => {
  const os = require("node:os"), cp = require("node:child_process"), yazl = require("yazl"), yauzl = require("yauzl")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p7-manifest-zip-"))
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    assert.match(path.basename(root), /^p7-manifest-zip-/)
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false)
    fs.rmSync(root, { recursive: true, force: true })
  })
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "test-extension", version: "1.0.0" }))
  const modules = ["core/contractV2/compiledPlanManifest.js", "core/contractV2/index.js", "core/actionRegistry.js", "core/contractV2/compilerEnvironment.js"]
  const contents = new Map(modules.map(name => ["extension/out/" + name, fs.readFileSync(path.join(__dirname, "../out", name))]))
  contents.set("extension/out/core/contractV2/compiledPlanManifest.js.backup", Buffer.from("// keep this\nmodule.exports = 'unchanged';\n"))
  contents.set("extension/package.json", Buffer.from("{}"))
  const zip = new yazl.ZipFile()
  for (const [name, bytes] of contents) zip.addBuffer(bytes, name, { compressionLevel: 1, mtime: new Date("2026-01-01"), mode: 0o100644 })
  zip.end()
  const parts = []
  await new Promise((resolve, reject) => zip.outputStream.on("data", bytes => parts.push(bytes)).on("end", resolve).on("error", reject))
  const target = path.join(root, "test-extension-1.0.0.vsix")
  fs.writeFileSync(target, Buffer.concat(parts))
  async function entries() {
    return new Promise((resolve, reject) => yauzl.open(target, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error)
      const rows = []
      archive.on("error", reject).on("end", () => resolve(rows)).on("entry", entry => archive.openReadStream(entry, (error, stream) => {
        if (error) return reject(error)
        const chunks = []
        stream.on("error", reject).on("data", chunk => chunks.push(chunk)).on("end", () => {
          rows.push({ name: entry.fileName, raw: Buffer.concat(chunks), mode: entry.externalFileAttributes, time: entry.lastModFileTime, date: entry.lastModFileDate })
          archive.readEntry()
        })
      }))
      archive.readEntry()
    }))
  }
  const before = await entries()
  const run = () => cp.spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/recompress-vsix.js")], { cwd: root, encoding: "utf8", windowsHide: true })
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const after = await entries(), compact = subject()
  assert.deepEqual(after.map(({ raw, ...metadata }) => metadata), before.map(({ raw, ...metadata }) => metadata))
  for (const row of after) {
    const original = contents.get(row.name)
    const expected = modules.some(name => row.name === "extension/out/" + name) ? Buffer.from(compact(original.toString("utf8"))) : original
    assert.equal(row.raw.equals(expected), true, row.name)
  }
  const bytes = fs.readFileSync(target)
  assert.equal(run().status, 0)
  assert.deepEqual(fs.readFileSync(target), bytes)
})

require('node:test').test('R2 direct dependency compaction retains independent AST signatures',()=>{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
 const {compactManifestModule}=require('../scripts/lib/compact-manifest-module');
 const signature=code=>{const source=ts.createSourceFile('subject.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(source.parseDiagnostics.length,0);const visit=node=>{const children=node.getChildren(source);return[node.kind,children.length?children.map(visit):node.getText(source)]};return JSON.stringify(visit(source))};
 assert.notEqual(signature('const result=1;'),signature('const result=2;'));
 for(const name of ['providerRegistry','compiledPlan','jsonSchemaCatalog','jsonSchema','jsonValue','canonicalJson']){const original=fs.readFileSync(path.join(__dirname,'../out/core/contractV2',name+'.js'),'utf8'),compact=compactManifestModule(original);assert.equal(signature(compact),signature(original),name);}
});

require('node:test').test('approved R2 amendment retains fourteen independent AST signatures',()=>{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
 const {compactManifestModule}=require('../scripts/lib/compact-manifest-module');
 const signature=code=>{const source=ts.createSourceFile('subject.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(source.parseDiagnostics.length,0);const visit=node=>{const children=node.getChildren(source);return[node.kind,children.length?children.map(visit):node.getText(source)]};return JSON.stringify(visit(source))};
 assert.notEqual(signature('const result=1;'),signature('const result=2;'));
 for(const name of ["packageShape","predicate","diagnostics","bobProfile","compilerWorkflow","packageLoaderInput","jsonSchemaRole","yamlDocument","compiler","compilerFiles","packageLoaderSnapshot","packageFileSystemNode","packageLoaderIo","workflowLockSnapshotUtilities"]){const original=fs.readFileSync(path.join(__dirname,'../out/core/contractV2',name+'.js'),'utf8'),compact=compactManifestModule(original);assert.equal(signature(compact),signature(original),name);}
});
