'use strict';
// Versioned adaptation of the M0 T14/T15/T16 baseline. All original files stay byte-fixed.
// Preserve baseline cases and allow the verified Workflow path module in the shared host cache.
const nativeRequire=require;
let baseline14,baseline15,baseline16;
function virtualRequire(name){if(name==='./t14-bounded-document-installed-extension-host.test.js')return baseline14;if(name==='./t15-aggregate-installed-extension-host.test.js')return baseline15;return nativeRequire(name);}
function load14(){const module={exports:{}};(function(module,exports,require,__dirname){
"use strict"
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), Module = require("node:module")
const modules = ["generatedProcessingBudgetDefinition", "processingBudgetError", "processingBudgetProfile", "processingBudgetLedger", "index", "boundedDocumentError", "boundedDocumentRequest", "boundedDocumentFile", "boundedDocumentIo", "ooxmlPreflight", "ooxmlParserInput", "validatedOoxml"]
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const safeMessage = "規約資料の取り込みを安全に続行できなかったため停止しました。入力資料とワークスペースを確認して再実行してください。"
function assertInstalledRuntimePaths(extensionRoot, paths) {
  try {
    const physical = file => fs.realpathSync(file).replace(/^[a-z]:/, drive => drive.toUpperCase())
    const prefix = path.join(physical(extensionRoot), "out/shared-processing-budget-runtime") + path.sep
    if (!Array.isArray(paths) || paths.length === 0 || paths.some(file => typeof file !== "string" || !physical(file).startsWith(prefix))) throw new Error("invalid runtime path")
  } catch { throw new Error("artifact runtime path escaped installed extension") }
}
exports.assertInstalledRuntimePaths = assertInstalledRuntimePaths

function resolveInstalledParserEntries(extensionRoot, parsers) {
  const physical = file => fs.realpathSync(file).replace(/^[a-z]:/, drive => drive.toUpperCase())
  const root = physical(extensionRoot), local = Module.createRequire(path.join(root, "package.json"))
  return parsers.map(parser => {
    const file = physical(local.resolve(parser.specifier)), prefix = path.join(root, "node_modules", parser.name) + path.sep
    if (!file.startsWith(prefix)) throw new Error("artifact parser path escaped installed extension")
    const metadata = JSON.parse(fs.readFileSync(path.join(prefix, "package.json"), "utf8"))
    if (metadata.name !== parser.name || metadata.version !== parser.version) throw new Error("artifact parser version mismatch")
    const relativePath = path.relative(root, file).split(path.sep).join("/"), expected = parser.payload?.find(row => row.path === relativePath), bytes = fs.readFileSync(file)
    if (!expected || bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) throw new Error("artifact parser entry hash mismatch")
    return { extensionRoot, name: parser.name, version: parser.version, integrity: parser.integrity, path: file, relativePath, bytes: bytes.length, sha256: sha(bytes) }
  })
}
exports.resolveInstalledParserEntries = resolveInstalledParserEntries

exports.runGuiProbe = async function runGuiProbe(extensionRoot, workspaceRoot) {
  const entry = path.join(extensionRoot, "out/ui/ruleAuthoringGui.js"), originalError = new Error("private fixture path must not reach the UI"), reported = [], displayed = []
  const messageListeners = [], disposeListeners = []
  let panel, renders = 0, disposed = false
  const turn = () => new Promise(resolve => setImmediate(resolve))
  const uri = file => ({ fsPath: file, path: file, scheme: "file", toString: () => "file://" + file })
  const fake = {
    ViewColumn: { One: 1 }, Uri: { file: uri },
    workspace: { workspaceFolders: [{ uri: uri(workspaceRoot), name: "artifact workspace", index: 0 }] },
    window: {
      createWebviewPanel() {
        panel = { webview: { cspSource: "vscode-resource:", html: "", postMessage: async () => true, onDidReceiveMessage(listener) { messageListeners.push(listener); return { dispose() {} } } }, onDidDispose(listener) { disposeListeners.push(listener); return { dispose() {} } }, dispose() { if (!disposed) { disposed = true; disposeListeners.forEach(fn => fn()) } } }
        return panel
      },
      showErrorMessage: async message => { displayed.push(message) }, showWarningMessage: async () => undefined
    },
    commands: { executeCommand: async () => undefined }
  }
  const originalLoad = Module._load
  delete require.cache[entry]
  Module._load = function(request, parent, isMain) { return request === "vscode" ? fake : originalLoad.call(this, request, parent, isMain) }
  let gui
  try { gui = require(entry) } finally { Module._load = originalLoad }
  const phases = ["sources", "extraction", "evidence_selection", "proposal", "human_review", "apply", "completed"]
  const host = gui.createRuleAuthoringGuiHost({
    createNonce: () => "artifact-probe-nonce", reportHostError: error => reported.push(error),
    findIncompleteRuleApplyTransactions: async () => [], listIncompleteRuleAuthoringRuns: async () => [],
    createRuleAuthoringRun: async input => ({ schemaVersion: "bob-bazaar-review/rule-authoring-run/v1", workspaceRoot, runId: input.runId, currentPhase: "sources", phases: Object.fromEntries(phases.map((phase,index) => [phase,index === 0 ? {status:"in_progress",startedAt:"2026-10-24T00:00:00.000Z"} : {status:"not_started"}])), artifacts: {}, warnings: [], issues: [], createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z" }),
    renderRuleAuthoringGuiHtml: () => { renders++; if (renders === 2) throw originalError; return "<!doctype html><html><body>artifact probe</body></html>" }
  })
  const result = host.openRuleAuthoringGui({ subscriptions: [], extensionUri: uri(extensionRoot) }, { workspaceRoot, bobExtensionAvailable: false })
  for (let count = 0; count < 30 && !panel; count++) await turn()
  assert.ok(panel, "artifact GUI panel must initialize")
  async function emit(type) { for (const listener of messageListeners) await listener({ type }); await turn() }
  await emit("unknownOperation")
  assert.deepEqual(reported, [originalError]); assert.deepEqual(displayed, [safeMessage])
  const before = renders
  await emit("unknownOperation")
  assert.equal(renders, before + 1); assert.equal(reported.length, 1)
  await emit("cancelRun"); assert.equal((await result).status, "cancelled")
  const modulePath = fs.realpathSync(require.resolve(entry))
  assert.ok(modulePath.startsWith(fs.realpathSync(extensionRoot) + path.sep))
  return { guiLoggedOriginalErrorCount: reported.length, nextQueuedOperationSucceeded: renders === before + 1, modulePath }
}

exports.run = async function run() {
  const vscode = require("vscode"), config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"))
  const cases = [], loadedModules = [], actualRoots = [], parserIdentities = []
  const receipt = { schemaVersion: "bob-builtin-analyze/t14-installed-host/v1", sourceHeadSha: config.sourceHeadSha, sourceTreeSha: config.sourceTreeSha, vscode: vscode.version, node: process.version, state: "failed", productActivationProbe: "not_run", productDeactivationProbe: "not_run", cases, loadedModules, parserIdentities }
  async function check(name, operation) { try { const detail = await operation(); cases.push({ name, state: "passed", ...(detail ? { detail } : {}) }) } catch(error) { cases.push({ name, state: "failed", message: String(error?.message ?? error).slice(0,512) }); throw error } }
  try {
    assert.equal(vscode.version, "1.106.1")
    for (const item of config.extensions) {
      const extension = vscode.extensions.getExtension(item.id)
      assert.ok(extension, "artifact development extension must be registered")
      const actual = fs.realpathSync(extension.extensionPath), expected = fs.realpathSync(item.root)
      assert.equal(actual, expected); actualRoots.push(actual)
      parserIdentities.push(...resolveInstalledParserEntries(actual, item.parsers))
    }
    const [bazaarRoot, consistencyRoot] = actualRoots
    const bazaar = require(path.join(bazaarRoot, "out/ruleAuthoring/extraction/documentExtractor.js")), consistency = require(path.join(consistencyRoot, "out/analyzers/documentExtractor.js"))
    const documentPath = name => path.join(config.workspaceRoot, name)
    const original = new Map(config.fixtures.map(item => [item.name, fs.readFileSync(documentPath(item.name))]))
    const review = name => ({ schema_version: 1, review: { id: "artifact", title: "artifact", change_type: "bugfix", purpose: "test", base: "a", head: "b" }, artifacts: { requirements: [{path:name}] }, review_focus: [] })
    let normalXlsx
    await check("normal_docx", async () => {
      const b = await bazaar.extractRuleDocument({ filePath: documentPath("normal.docx") }), c = await consistency.extractDocuments(review("normal.docx"), {workspaceRoot:config.workspaceRoot})
      assert.ok(b.chunks.some(chunk => chunk.text.includes("Review every change"))); assert.ok(c.evidence.length > 0); assert.equal(c.warnings.some(x=>x.includes("failed to extract")),false)
    })
    await check("normal_xlsx", async () => {
      normalXlsx = await bazaar.extractRuleDocument({filePath:documentPath("normal.xlsx")})
      const c = await consistency.extractDocuments(review("normal.xlsx"), {workspaceRoot:config.workspaceRoot}); assert.ok(c.evidence.length > 0); assert.equal(c.warnings.some(x=>x.includes("failed to extract")),false)
    })
    await check("missing_both_xlsx", async () => {
      const b = await bazaar.extractRuleDocument({filePath:documentPath("missing-both.xlsx")}), c = await consistency.extractDocuments(review("missing-both.xlsx"), {workspaceRoot:config.workspaceRoot})
      assert.deepEqual(b.chunks.map(x=>[x.locator.sheet,x.locator.row,x.text]),normalXlsx.chunks.map(x=>[x.locator.sheet,x.locator.row,x.text])); assert.ok(c.evidence.length > 0)
    })
    await check("crc_rejected", async () => {
      const adapter = require(path.join(bazaarRoot,"out/ruleAuthoring/extraction/docxExtractor.js")), originalParser = adapter.extractDocx; let calls = 0
      adapter.extractDocx = async () => { calls++; throw Error("unexpected parser") }
      try { await assert.rejects(()=>bazaar.extractRuleDocument({filePath:documentPath("bad-crc.docx")}),error=>error.code==="bounded_document_archive_invalid"); assert.equal(calls,0) } finally { adapter.extractDocx = originalParser }
      const c = await consistency.extractDocuments(review("bad-crc.docx"),{workspaceRoot:config.workspaceRoot}); assert.equal(c.evidence.length,0); assert.ok(c.warnings.some(x=>x.includes("bounded document archive invalid")))
    })
    await check("oversize_rejected", async () => {
      const file = documentPath("oversize.docx"), handle = fs.openSync(file,"wx"); try { fs.ftruncateSync(handle,25*1048576+1) } finally { fs.closeSync(handle) }
      await assert.rejects(()=>bazaar.extractRuleDocument({filePath:file}),error=>error.code==="bounded_document_source_invalid")
      const c=await consistency.extractDocuments(review("source.md"),{workspaceRoot:config.workspaceRoot,limits:{maxDocumentBytes:1}});assert.deepEqual([c.evidence.length,c.excerptsMarkdown],[0,""])
    })
    await check("mutation_discarded", async () => {
      for (const [root,relative,method,isBazaar] of [[bazaarRoot,"ruleAuthoring/extraction/docxExtractor.js","extractDocx",true],[consistencyRoot,"analyzers/documentDocxExtractor.js","extractDocxChunks",false]]) {
        const name=isBazaar?"changed-bazaar.docx":"changed-consistency.docx",file=documentPath(name),bytes=Buffer.from(original.get("normal.docx"));fs.writeFileSync(file,bytes,{flag:"wx"});const adapter=require(path.join(root,"out",relative)),parse=adapter[method]
        adapter[method]=async buffer=>{assert.ok(Buffer.isBuffer(buffer));const changed=Buffer.from(bytes);changed[40]^=1;fs.writeFileSync(file,changed);return isBazaar?{chunks:[],status:"success",warnings:[],extractor:{id:"mutation",version:"1"}}:[{evidenceType:"requirement",ref:"REQ-MUTATED",text:"must discard"}]}
        try { if(isBazaar)await assert.rejects(()=>bazaar.extractRuleDocument({filePath:file}),error=>error.code==="bounded_document_source_changed");else {const result=await consistency.extractDocuments(review(name),{workspaceRoot:config.workspaceRoot});assert.deepEqual([result.evidence.length,result.excerptsMarkdown],[0,""]);assert.ok(result.warnings.some(x=>x.includes("bounded document source changed")))} } finally {adapter[method]=parse}
      }
    })
    await check("locators_preserved", async () => { assert.deepEqual(normalXlsx.chunks.map(x=>[x.locator.sheet,x.locator.row,x.locator.cell_range]),[["Second",1,"B1:D1"],["Second",3,"A3:C3"],["First",2,"A2:A2"]]) })
    await check("source_unchanged", async () => { for(const [name,bytes]of original)assert.ok(fs.readFileSync(documentPath(name)).equals(bytes)) })
    await check("installed_gui_error_is_logged_once_and_queue_recovers",()=>exports.runGuiProbe(bazaarRoot,config.workspaceRoot))
    for (const root of actualRoots) {
      const manifest=JSON.parse(fs.readFileSync(path.join(root,"out/shared-processing-budget-runtime/manifest.json"),"utf8"))
      for(const name of modules){const file=fs.realpathSync(require.resolve(path.join(root,"out/shared-processing-budget-runtime",name+".js")));assertInstalledRuntimePaths(root,[file]);const bytes=fs.readFileSync(file),expected=manifest.payload.find(x=>x.path===name+".js");assert.equal(sha(bytes),expected.sha256);assert.equal(bytes.length,expected.bytes);loadedModules.push({extensionRoot:root,path:file,bytes:bytes.length,sha256:sha(bytes)})}
    }
    const cached=Object.keys(require.cache).filter(file=>/[\\/](?:shared-processing-budget-runtime[\\/]|processing-budget-runtime[\\/]out[\\/])/.test(file))
    for(const file of cached){
      const companion=actualRoots.some(root=>{try{assertInstalledRuntimePaths(root,[file]);return true}catch{return false}});
      const driveCase=entry=>fs.realpathSync(entry).replace(/^[a-z]:/,drive=>drive.toUpperCase());
      const workflow=config.workflowRuntimePath&&driveCase(file)===driveCase(config.workflowRuntimePath);
      assert.ok(companion||workflow,"repo runtime fallback: "+file);
    }
    for (const file of Object.keys(require.cache).filter(file => config.extensions.some(item => item.parsers.some(parser => file.split(path.sep).join("/").includes("/node_modules/" + parser.name + "/"))))) {
      const physical=fs.realpathSync(file).replace(/^[a-z]:/,drive=>drive.toUpperCase());assert.ok(config.extensions.some(item=>item.parsers.some(parser=>physical.startsWith(path.join(fs.realpathSync(item.root).replace(/^[a-z]:/,drive=>drive.toUpperCase()),"node_modules",parser.name)+path.sep))),"artifact parser cache fallback")
    }
    receipt.state="passed"
  } finally { fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"}) }
}

})(module,module.exports,virtualRequire,__dirname);return module.exports;}
function load15(){const module={exports:{}};(function(module,exports,require,__dirname){
"use strict"
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),Module=require("node:module");
const {assertInstalledRuntimePaths,resolveInstalledParserEntries,runGuiProbe}=require("./t14-bounded-document-installed-extension-host.test.js");
Object.assign(exports,{assertInstalledRuntimePaths,resolveInstalledParserEntries,runGuiProbe});
const modules=["generatedProcessingBudgetDefinition","processingBudgetError","processingBudgetProfile","processingBudgetLedger","index","boundedDocumentError","boundedDocumentRequest","boundedDocumentFile","boundedDocumentIo","ooxmlPreflight","ooxmlParserInput","validatedOoxml","documentBudget","workbookBudget","deadlineCancellation","pathPolicy"];
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
exports.run = async function run() {
  const vscode = require("vscode"), config = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-config.json"), "utf8"))
  const cases = [], loadedModules = [], actualRoots = [], parserIdentities = []
  const receipt = { schemaVersion: "bob-builtin-analyze/t17-adapted-baseline17/v1", sourceHeadSha: config.sourceHeadSha, sourceTreeSha: config.sourceTreeSha, vscode: vscode.version, node: process.version, state: "failed", productActivationProbe: "not_run", productDeactivationProbe: "not_run", cases, loadedModules, parserIdentities }
  async function check(name, operation) { try { const detail = await operation(); cases.push({ name, state: "passed", ...(detail ? { detail } : {}) }) } catch(error) { cases.push({ name, state: "failed", message: String(error?.message ?? error).slice(0,512) }); throw error } }
  try {
    assert.equal(vscode.version, "1.106.1")
    for (const item of config.extensions) {
      const extension = vscode.extensions.getExtension(item.id)
      assert.ok(extension, "artifact development extension must be registered")
      const actual = fs.realpathSync(extension.extensionPath), expected = fs.realpathSync(item.root)
      assert.equal(actual, expected); actualRoots.push(actual)
      parserIdentities.push(...resolveInstalledParserEntries(actual, item.parsers))
    }
    const [bazaarRoot, consistencyRoot] = actualRoots
    const bazaar = require(path.join(bazaarRoot, "out/ruleAuthoring/extraction/documentExtractor.js")), consistency = require(path.join(consistencyRoot, "out/analyzers/documentExtractor.js"))
    const documentPath = name => path.join(config.workspaceRoot, name)
    const original = new Map(config.fixtures.map(item => [item.name, fs.readFileSync(documentPath(item.name))]))
    const review = name => ({ schema_version: 1, review: { id: "artifact", title: "artifact", change_type: "bugfix", purpose: "test", base: "a", head: "b" }, artifacts: { requirements: [{path:name}] }, review_focus: [] })
    let normalXlsx
    await check("normal_docx", async () => {
      const b = await bazaar.extractRuleDocument({ filePath: documentPath("normal.docx") }), c = await consistency.extractDocuments(review("normal.docx"), {workspaceRoot:config.workspaceRoot})
      assert.ok(b.chunks.some(chunk => chunk.text.includes("Review every change"))); assert.ok(c.evidence.length > 0); assert.equal(c.warnings.some(x=>x.includes("failed to extract")),false)
    })
    await check("normal_xlsx", async () => {
      normalXlsx = await bazaar.extractRuleDocument({filePath:documentPath("normal.xlsx")})
      const c = await consistency.extractDocuments(review("normal.xlsx"), {workspaceRoot:config.workspaceRoot}); assert.ok(c.evidence.length > 0); assert.equal(c.warnings.some(x=>x.includes("failed to extract")),false)
    })
    await check("missing_both_xlsx", async () => {
      const b = await bazaar.extractRuleDocument({filePath:documentPath("missing-both.xlsx")}), c = await consistency.extractDocuments(review("missing-both.xlsx"), {workspaceRoot:config.workspaceRoot})
      assert.deepEqual(b.chunks.map(x=>[x.locator.sheet,x.locator.row,x.text]),normalXlsx.chunks.map(x=>[x.locator.sheet,x.locator.row,x.text])); assert.ok(c.evidence.length > 0)
    })
    await check("crc_rejected", async () => {
      const adapter = require(path.join(bazaarRoot,"out/ruleAuthoring/extraction/docxExtractor.js")), originalParser = adapter.extractDocx; let calls = 0
      adapter.extractDocx = async () => { calls++; throw Error("unexpected parser") }
      try { await assert.rejects(()=>bazaar.extractRuleDocument({filePath:documentPath("bad-crc.docx")}),error=>error.code==="bounded_document_archive_invalid"); assert.equal(calls,0) } finally { adapter.extractDocx = originalParser }
      await assert.rejects(()=>consistency.extractDocuments(review("bad-crc.docx"),{workspaceRoot:config.workspaceRoot}),error=>error.code==="bounded_document_archive_invalid")
    })
    await check("oversize_rejected", async () => {
      const file = documentPath("oversize.docx"), handle = fs.openSync(file,"wx"); try { fs.ftruncateSync(handle,25*1048576+1) } finally { fs.closeSync(handle) }
      await assert.rejects(()=>bazaar.extractRuleDocument({filePath:file}),error=>error.code==="bounded_document_source_invalid")
      const c=await consistency.extractDocuments(review("source.md"),{workspaceRoot:config.workspaceRoot,limits:{maxDocumentBytes:1}});assert.deepEqual([c.evidence.length,c.excerptsMarkdown],[0,""])
    })
    await check("mutation_discarded", async () => {
      for (const [root,relative,method,isBazaar] of [[bazaarRoot,"ruleAuthoring/extraction/docxExtractor.js","extractDocx",true],[consistencyRoot,"analyzers/documentDocxExtractor.js","extractDocxChunks",false]]) {
        const name=isBazaar?"changed-bazaar.docx":"changed-consistency.docx",file=documentPath(name),bytes=Buffer.from(original.get("normal.docx"));fs.writeFileSync(file,bytes,{flag:"wx"});const adapter=require(path.join(root,"out",relative)),parse=adapter[method]
        adapter[method]=async buffer=>{assert.ok(Buffer.isBuffer(buffer));const changed=Buffer.from(bytes);changed[40]^=1;fs.writeFileSync(file,changed);return isBazaar?{chunks:[],status:"success",warnings:[],extractor:{id:"mutation",version:"1"}}:[{evidenceType:"requirement",ref:"REQ-MUTATED",text:"must discard"}]}
        try { if(isBazaar)await assert.rejects(()=>bazaar.extractRuleDocument({filePath:file}),error=>error.code==="bounded_document_source_changed");else await assert.rejects(()=>consistency.extractDocuments(review(name),{workspaceRoot:config.workspaceRoot}),error=>error.code==="bounded_document_source_changed") } finally {adapter[method]=parse}
      }
    })
    await check("locators_preserved", async () => { assert.deepEqual(normalXlsx.chunks.map(x=>[x.locator.sheet,x.locator.row,x.locator.cell_range]),[["Second",1,"B1:D1"],["Second",3,"A3:C3"],["First",2,"A2:A2"]]) })
    await check("source_unchanged", async () => { for(const [name,bytes]of original)assert.ok(fs.readFileSync(documentPath(name)).equals(bytes)) })
    await check("installed_gui_error_is_logged_once_and_queue_recovers",()=>exports.runGuiProbe(bazaarRoot,config.workspaceRoot))
    const sharedB=require(path.join(bazaarRoot,"out/sharedProcessingBudgetRuntime.js")),sharedC=require(path.join(consistencyRoot,"out/sharedProcessingBudgetRuntime.js"));
    const bLimits=require(path.join(bazaarRoot,"out/ruleAuthoring/ruleAuthoringLimits.js")).DEFAULT_RULE_AUTHORING_LIMITS,cLimits=require(path.join(consistencyRoot,"out/core/limits.js")).DEFAULT_REVIEW_PROCESSING_LIMITS;
    const usage=(operation,category)=>operation.snapshot().categories.find(row=>row.category===category).committed;
    async function countedIo(operation){const promises=require("node:fs/promises"),saved=[];let calls=0;for(const [owner,keys]of [[fs,["existsSync","lstatSync","statSync","realpathSync","openSync","readFileSync"]],[promises,["open","lstat","realpath"]]])for(const key of keys){const original=owner[key];owner[key]=Object.assign(function(file,...args){if(typeof file==="string"&&(file===config.workspaceRoot||file.startsWith(config.workspaceRoot+path.sep)))calls++;return original.call(this,file,...args)},original);saved.push(()=>{owner[key]=original})}try{await operation();return calls}finally{for(const restore of saved.reverse())restore()}}
    await check("document_count_rejected_before_io",async()=>{
      const calls=await countedIo(async()=>{await assert.rejects(()=>bazaar.extractRuleDocuments(Array.from({length:21},()=>({filePath:documentPath("absent.docx")}))),error=>error.code==="processing_budget_exceeded"&&error.details.constrainedCategory==="document_count");const input=review("absent.docx");input.artifacts.requirements.push({path:"also-absent.docx"});await assert.rejects(()=>consistency.extractDocuments(input,{workspaceRoot:config.workspaceRoot,processingBudgetLimits:{document_count:1}}),error=>error.code==="processing_budget_exceeded"&&error.details.constrainedCategory==="document_count")});assert.equal(calls,0);
    });
    await check("raw_aggregate_counts_duplicate_selections",async()=>{
      const size=original.get("normal.docx").length,requests=[{filePath:documentPath("normal.docx")},{filePath:documentPath("normal.docx")}];await assert.rejects(()=>bazaar.extractRuleDocuments(requests,undefined,{...bLimits,maxAggregateSourceBytes:2*size-1}),error=>error.details?.constrainedCategory==="total_document_bytes");const batch=await bazaar.extractRuleDocuments(requests,undefined,{...bLimits,maxAggregateSourceBytes:2*size});assert.equal(batch.duplicates.length,1);
      const textSize=original.get("source.md").length,input=review("source.md");input.artifacts.requirements.push({path:"source.md"});await assert.rejects(()=>consistency.extractDocuments(input,{workspaceRoot:config.workspaceRoot,processingBudgetLimits:{total_document_bytes:2*textSize-1}}),error=>error.details?.constrainedCategory==="total_document_bytes");const result=await consistency.extractDocuments(input,{workspaceRoot:config.workspaceRoot,processingBudgetLimits:{total_document_bytes:2*textSize}});assert.equal(result.documents.length,2);
    });
    await check("pre_cancelled_document_has_no_parser",async()=>{
      const controller=new AbortController(),reason=new Error("artifact pre-cancel");controller.abort(reason);const calls=await countedIo(async()=>{await assert.rejects(()=>bazaar.extractRuleDocument({filePath:documentPath("absent.docx"),signal:controller.signal}),error=>error===reason);await assert.rejects(()=>consistency.extractDocuments(review("absent.docx"),{workspaceRoot:config.workspaceRoot,signal:controller.signal}),error=>error===reason)});assert.equal(calls,0);
    });
    await check("sparse_xlsx_rejected_before_parser",async()=>{
      for(const [root,relative,method,isBazaar]of [[bazaarRoot,"ruleAuthoring/extraction/xlsxExtractor.js","extractXlsx",true],[consistencyRoot,"analyzers/documentXlsxExtractor.js","extractXlsxChunks",false]]){const adapter=require(path.join(root,"out",relative)),parse=adapter[method];let calls=0;adapter[method]=async(...args)=>{calls++;return parse(...args)};try{await assert.rejects(()=>isBazaar?bazaar.extractRuleDocument({filePath:documentPath("sparse.xlsx")}):consistency.extractDocuments(review("sparse.xlsx"),{workspaceRoot:config.workspaceRoot}),error=>error.details?.constrainedCategory==="rows_per_sheet");assert.equal(calls,0)}finally{adapter[method]=parse}}
    });
    await check("unselected_sheet_budget_is_enforced",async()=>{const input=review("unselected-over-budget.xlsx");input.artifacts.requirements[0].sheets=["First"];await assert.rejects(()=>consistency.extractDocuments(input,{workspaceRoot:config.workspaceRoot}),error=>error.details?.constrainedCategory==="rows_per_sheet")});
    await check("parser_await_cancellation_discards_result",async()=>{
      for(const [root,isBazaar]of [[bazaarRoot,true],[consistencyRoot,false]]){const controller=new AbortController(),reason=new Error("artifact parser cancellation"),sdk=Module.createRequire(path.join(root,"package.json"))("mammoth"),parse=sdk.convertToHtml;let calls=0;sdk.convertToHtml=async(...args)=>{calls++;const result=await parse(...args);controller.abort(reason);return result};try{await assert.rejects(()=>isBazaar?bazaar.extractRuleDocument({filePath:documentPath("normal.docx"),signal:controller.signal}):consistency.extractDocuments(review("normal.docx"),{workspaceRoot:config.workspaceRoot,signal:controller.signal}),error=>error===reason);assert.equal(calls,1)}finally{sdk.convertToHtml=parse}}
    });
    await check("ordinary_failure_warns_and_aggregate_failure_throws",async()=>{
      const input=review("legacy.doc");input.artifacts.requirements.push({path:"source.md"});const ordinary=await consistency.extractDocuments(input,{workspaceRoot:config.workspaceRoot});assert.ok(ordinary.warnings.some(message=>message.includes("unsupported document extension")));assert.deepEqual(ordinary.documents.map(row=>row.document_id),["DOC-REQ-0001","DOC-REQ-0002"]);assert.ok(ordinary.evidence.length>0);await assert.rejects(()=>consistency.extractDocuments(review("source.md"),{workspaceRoot:config.workspaceRoot,processingBudgetLimits:{total_document_bytes:1}}),error=>error.details?.constrainedCategory==="total_document_bytes");const legacy=await bazaar.extractRuleDocument({filePath:documentPath("legacy.doc")});assert.equal(legacy.status,"requires_conversion");
    });
    await check("source_admission_raw_is_charged_once",async()=>{
      const create=sharedB.createProcessingOperation;let observed;sharedB.createProcessingOperation=(...args)=>{observed=create(...args);return observed};try{const result=await bazaar.extractRuleDocument({filePath:documentPath("normal.docx")});assert.ok(result.chunks.length>0);assert.equal(usage(observed,"total_document_bytes"),original.get("normal.docx").length);assert.equal(usage(observed,"document_count"),1);await bazaar.extractRuleDocument({filePath:documentPath("legacy.doc")});assert.equal(usage(observed,"total_document_bytes"),original.get("legacy.doc").length)}finally{sharedB.createProcessingOperation=create}
      const operation=sharedC.createReviewDocumentOperation(1,cLimits),result=await consistency.extractDocuments(review("normal.xlsx"),{workspaceRoot:config.workspaceRoot,operation});assert.ok(result.evidence.length>0);assert.equal(usage(operation,"total_document_bytes"),original.get("normal.xlsx").length);assert.equal(usage(operation,"total_sheets"),2);assert.equal(usage(operation,"total_rows"),3);
    });
    for(const [name,bytes]of original)assert.ok(fs.readFileSync(documentPath(name)).equals(bytes));

    for (const root of actualRoots) {
      const manifest=JSON.parse(fs.readFileSync(path.join(root,"out/shared-processing-budget-runtime/manifest.json"),"utf8"))
      for(const name of modules){const file=fs.realpathSync(require.resolve(path.join(root,"out/shared-processing-budget-runtime",name+".js")));assertInstalledRuntimePaths(root,[file]);const bytes=fs.readFileSync(file),expected=manifest.payload.find(x=>x.path===name+".js");assert.equal(sha(bytes),expected.sha256);assert.equal(bytes.length,expected.bytes);loadedModules.push({extensionRoot:root,moduleName:name,path:file,bytes:bytes.length,sha256:sha(bytes)})}
    }
    const cached=Object.keys(require.cache).filter(file=>/[\\/](?:shared-processing-budget-runtime[\\/]|processing-budget-runtime[\\/]out[\\/])/.test(file))
    for(const file of cached){
      const companion=actualRoots.some(root=>{try{assertInstalledRuntimePaths(root,[file]);return true}catch{return false}});
      const driveCase=entry=>fs.realpathSync(entry).replace(/^[a-z]:/,drive=>drive.toUpperCase());
      const workflow=config.workflowRuntimePath&&driveCase(file)===driveCase(config.workflowRuntimePath);
      assert.ok(companion||workflow,"repo runtime fallback: "+file);
    }
    for (const file of Object.keys(require.cache).filter(file => config.extensions.some(item => item.parsers.some(parser => file.split(path.sep).join("/").includes("/node_modules/" + parser.name + "/"))))) {
      const physical=fs.realpathSync(file).replace(/^[a-z]:/,drive=>drive.toUpperCase());assert.ok(config.extensions.some(item=>item.parsers.some(parser=>physical.startsWith(path.join(fs.realpathSync(item.root).replace(/^[a-z]:/,drive=>drive.toUpperCase()),"node_modules",parser.name)+path.sep))),"artifact parser cache fallback")
    }
    receipt.state="passed"
  } finally { fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"}) }
}

})(module,module.exports,virtualRequire,__dirname);return module.exports;}
function load16(){const module={exports:{}};(function(module,exports,require,__dirname){
"use strict"
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');

// The byte-fixed T15 probe exercises the old document-only call once. Adapt
// that call at its boundary using the installed owner API, without rebuilding a
// ledger from a snapshot or changing either the probe or product module bytes.
async function runBaselineWithPairedOwner(config){
 const root=config.extensions[1].root,shared=require(path.join(root,'out/sharedProcessingBudgetRuntime.js')),extractor=require(path.join(root,'out/analyzers/documentExtractor.js'));
 const create=shared.createReviewDocumentOperation,extract=extractor.extractDocuments,owners=new WeakMap();
 shared.createReviewDocumentOperation=(count,limits,overrides,signal)=>{const owner=shared.createProcessingOperation({profile:shared.createReviewDocumentProfile(limits,overrides),signal}),document=owner.documents(count);owners.set(document,owner);return document;};
 extractor.extractDocuments=(input,options)=>{const owner=options.operation&&owners.get(options.operation);return extract(input,owner&&!options.processingOperation?{...options,processingOperation:owner,signal:owner.signal,deadline:owner.deadline}:options);};
 try{await require('./t15-aggregate-installed-extension-host.test.js').run();}
 finally{extractor.extractDocuments=extract;shared.createReviewDocumentOperation=create;}
}

exports.run=async function run(){
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline-stage-config.json'),'utf8')),baseConfig=JSON.parse(fs.readFileSync(config.baselineConfigPath,'utf8')),vscode=require('vscode');
 const receipt={schemaVersion:'bob-builtin-analyze/t17-adapted-baseline25/v1',sourceHeadSha:config.sourceHeadSha,sourceTreeSha:config.sourceTreeSha,vscode:vscode.version,node:process.version,state:'failed',productActivationProbe:'not_run',productDeactivationProbe:'not_run',cases:[],loadedModules:[],parserIdentities:[]};
 async function check(name,operation){try{const detail=await operation();receipt.cases.push({name,state:'passed',...(detail?{detail}:{})});}catch(error){receipt.cases.push({name,state:'failed',message:String(error?.message??error).slice(0,512)});throw error;}}
 try{
  await runBaselineWithPairedOwner(baseConfig);
  const baseline=JSON.parse(fs.readFileSync(config.baselineHostReceiptPath,'utf8'));assert.equal(baseline.state,'passed');assert.equal(baseline.cases.length,17);
  receipt.cases.push(...baseline.cases);receipt.loadedModules=baseline.loadedModules;receipt.parserIdentities=baseline.parserIdentities;
  const root=baseConfig.extensions[1].root,workspace=baseConfig.workspaceRoot,load=name=>require(path.join(root,'out',name+'.js'));
  const factory=load('core/processingBudgetPipeline'),limits=load('core/limits').normalizeReviewProcessingLimits(),builder=load('core/reviewPackageBuilder');
  const used=(owner,id)=>owner.snapshot().categories.find(row=>row.category===id).committed;
  const review=JSON.parse(fs.readFileSync(path.join(workspace,'review-input.yaml'),'utf8'));
  function packageInput(outDir,operation){return{workspaceRoot:workspace,outDir,reviewInput:review,diff:{vcs:'git',vcsRoot:workspace,base:'a',head:'b',files:[],unifiedDiff:'',warnings:[]},documents:{documents:[],excerptsMarkdown:'日本語 α\n',evidence:[],warnings:[]},codeAnalysis:{changedSymbols:[],functions:[],defines:[],globals:[],callGraph:[],rtForbiddenCandidates:[],codeSlices:[],evidence:[],summaryMarkdown:'',warnings:[]},traceability:{rows:[],warnings:[],markdown:''},processingOperation:operation};}

  await check('shared_operation_all_input_stages',async()=>{
   fs.mkdirSync(path.join(workspace,'src'),{recursive:true});fs.writeFileSync(path.join(workspace,'src/t16.c'),'int t16(void) { return 1; }\n');
   const create=factory.createPipelineProcessingOperation,owners=[];factory.createPipelineProcessingOperation=(...args)=>{const owner=create(...args);owners.push(owner);return owner;};
   try{const result=await load('core/pipeline').preprocessReview({workspaceRoot:workspace,inputPath:'review-input.yaml',outDir:'.bob-review/t16-shared',diffFixturePath:'diff-fixture.json'});assert.equal(result.status,'ok');assert.equal(owners.length,1);const owner=owners[0],out=path.join(workspace,'.bob-review/t16-shared'),rawInput=fs.statSync(path.join(workspace,'review-input.yaml')).size,rawSource=fs.statSync(path.join(workspace,'source.md')).size,rawDiff=Buffer.byteLength(JSON.parse(fs.readFileSync(path.join(workspace,'diff-fixture.json'),'utf8')).unifiedDiff),excerpt=fs.statSync(path.join(out,'document-excerpts.md')).size,bob=fs.statSync(path.join(out,'bob-input.md')).size;assert.equal(used(owner,'total_operation_input_bytes'),rawInput+rawSource+rawDiff+excerpt+bob);assert.equal(used(owner,'managed_artifact_bytes'),await builder.computeManagedReviewPackageBytes(out));assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));return{rawInput,rawSource,rawDiff,excerpt,bob};}finally{factory.createPipelineProcessingOperation=create;}
  });
  const runner=load('core/externalProcessRunner'),nodeOptions={command:process.execPath,cwd:workspace,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},deadline:load('sharedProcessingBudgetRuntime').createAbsoluteDeadline(10000)};
  await check('independent_stdout_stderr_exact',async()=>{const result=await runner.runExternalProcess({...nodeOptions,args:['-e',"process.stdout.write(Buffer.alloc(32,97));process.stderr.write(Buffer.alloc(262144,98));"],maxStdoutBytes:32});assert.equal(result.stdout.length,32);assert.equal(result.stderr.length,262144);});
  await check('stdout_overflow_waits_for_child_exit',async()=>{
   const spawn=cp.spawn;let child,exited=false;cp.spawn=(...args)=>{const spawned=spawn(...args);if(args[0]===process.execPath){child=spawned;child.once('exit',()=>{exited=true;});}return spawned;};
   try{await assert.rejects(()=>runner.runExternalProcess({...nodeOptions,args:['-e',"process.stdout.write(Buffer.alloc(4096));setInterval(()=>{},1000);"],maxStdoutBytes:32}),error=>error.kind==='bufferExceeded'&&error.outputStream==='stdout'&&error.stdout.length<=32);assert.ok(child?.pid);let alive=false;try{process.kill(child.pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')throw error;}assert.equal(alive,false);return{aliveAfterRejection:alive,exitEventObserved:exited};}finally{cp.spawn=spawn;}
  });
  await check('git_overflow_preserves_complete_metadata',async()=>{
   const repository=path.join(workspace,'t16-git');fs.mkdirSync(repository);const git=(...args)=>cp.execFileSync('git',args,{cwd:repository,encoding:'utf8',windowsHide:true});git('init','-q');for(const name of ['one.c','two.c'])fs.writeFileSync(path.join(repository,name),'old\n');git('add','--','one.c','two.c');const commit=()=>git('-c','user.name=T16 Host','-c','user.email=t16@example.invalid','commit','-qm','fixture');commit();const base=git('rev-parse','HEAD').trim();for(const name of ['one.c','two.c'])fs.writeFileSync(path.join(repository,name),'new long line\n'.repeat(1000));git('add','--','one.c','two.c');commit();const head=git('rev-parse','HEAD').trim();
   const result=await load('core/gitDiffCollector').collectGitDiff({...review,review:{...review.review,base,head,vcs:'git',vcs_root:'t16-git'}},{workspaceRoot:workspace,limits:{maxRawDiffBytes:128},processingBudgetLimits:{raw_diff_bytes:128}});assert.deepEqual(result.files.map(row=>row.path),['one.c','two.c']);assert.ok(Buffer.byteLength(result.unifiedDiff)<=128);assert.ok(result.warnings.some(row=>row.includes('maxRawDiffBytes')));
  });
  await check('excerpt_parent_budget_is_fatal',async()=>{
   const bytes=fs.statSync(path.join(workspace,'source.md')).size,overrides={total_operation_input_bytes:1000,document_excerpt_bytes:400},owner=factory.createPipelineProcessingOperation(limits,overrides),operation=owner.documents(1);owner.reserve('raw_diff_bytes',1000-bytes-1).commit();
   await assert.rejects(()=>load('analyzers/documentExtractor').extractDocuments(review,{workspaceRoot:workspace,processingOperation:owner,operation,processingBudgetLimits:overrides}),error=>error.details?.constrainedCategory==='total_operation_input_bytes');assert.equal(used(owner,'total_document_bytes'),bytes);assert.equal(used(owner,'document_excerpt_bytes'),0);assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));
  });
  await check('mandatory_bob_metadata_survives_clipping',async()=>{
   const owner=factory.createPipelineProcessingOperation(limits),out=path.join(workspace,'.bob-review/t16-clipped'),input=packageInput(out,owner);input.documents.excerptsMarkdown='optional line\n'.repeat(10000);input.limits={maxBobInputBytes:65536};const warnings=await builder.buildReviewPackage(input),warning=warnings.find(row=>row.includes('bob-input.md')),text=fs.readFileSync(path.join(out,'bob-input.md'),'utf8'),templates=await load('templates/templateLoader').loadPromptTemplates();assert.ok(warning);assert.ok(text.includes(review.review.id));assert.ok(text.includes(warning));for(const prompt of [templates.system,templates.task,templates.outputFormat])assert.ok(text.includes(prompt));assert.ok(Buffer.byteLength(text)<=65536);for(const file of ['deterministic-checks.md','manifest.yaml'])assert.ok(fs.readFileSync(path.join(out,file),'utf8').includes(file==='manifest.yaml'?JSON.stringify(warning):warning));
   const pure=load('core/reviewPackageBudgets');assert.throws(()=>pure.assembleMandatoryFirstBobInput({maximumBytes:10,template:'{{future_metadata}}{{document_excerpts}}',values:{future_metadata:'required text',document_excerpts:'optional'},truncatableKeys:['document_excerpts']}),error=>error.code==='processing_budget_exceeded');
  });
  await check('artifact_failure_releases_pending',async()=>{
   const owner=factory.createPipelineProcessingOperation(limits,{managed_artifact_bytes:1024}),out=path.join(workspace,'.bob-review/t16-artifact-failure');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'notes.txt'),'user data');await assert.rejects(()=>builder.buildReviewPackage(packageInput(out,owner)),error=>error.details?.constrainedCategory==='managed_artifact_bytes');assert.equal(used(owner,'bob_input_bytes'),0);assert.equal(used(owner,'managed_artifact_bytes'),0);assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));assert.deepEqual(fs.readdirSync(out),['notes.txt']);
  });
  await check('utf8_package_bytes_and_unmanaged_file_are_preserved',async()=>{
   const owner=factory.createPipelineProcessingOperation(limits),out=path.join(workspace,'.bob-review/t16-utf8');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'notes.txt'),'user data');await builder.buildReviewPackage(packageInput(out,owner));function bytes(directory){return fs.readdirSync(directory,{withFileTypes:true}).reduce((sum,entry)=>{if(directory===out&&entry.name==='notes.txt')return sum;const file=path.join(directory,entry.name);return sum+(entry.isDirectory()?bytes(file):fs.statSync(file).size);},0);}assert.equal(used(owner,'managed_artifact_bytes'),bytes(out));assert.equal(used(owner,'bob_input_bytes'),fs.statSync(path.join(out,'bob-input.md')).size);assert.equal(fs.readFileSync(path.join(out,'document-excerpts.md'),'utf8'),'日本語 α\n');assert.equal(fs.readFileSync(path.join(out,'notes.txt'),'utf8'),'user data');
  });
  // Re-observe all bound files after the additional cases as well.
  for(const row of [...receipt.loadedModules,...receipt.parserIdentities]){const bytes=fs.readFileSync(row.path);assert.equal(bytes.length,row.bytes);assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),row.sha256);}
  receipt.state='passed';
 }finally{fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
}

})(module,module.exports,virtualRequire,__dirname);return module.exports;}

Object.assign(virtualRequire,{cache:nativeRequire.cache,resolve:nativeRequire.resolve});
baseline14=load14();baseline15=load15();baseline16=load16();
exports.run=async function(){const fs=nativeRequire('node:fs'),path=nativeRequire('node:path'),config=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline-config.json'),'utf8')),owners=[],restore=[];try{for(const extension of config.extensions){const shared=nativeRequire(path.join(extension.root,'out/sharedProcessingBudgetRuntime.js')),create=shared.createProcessingOperation;shared.createProcessingOperation=(...args)=>{const owner=create(...args);owners.push(owner);return owner;};restore.push(()=>{shared.createProcessingOperation=create;});}await baseline16.run();}finally{for(const rollback of restore.reverse())rollback();for(const owner of owners)owner.dispose();}};

exports.runGuiProbe=baseline14.runGuiProbe;
