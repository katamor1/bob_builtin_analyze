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
  const cases = [], loadedModules = [], actualRoots = []
  const receipt = { schemaVersion: "bob-builtin-analyze/t14-installed-host/v1", sourceHeadSha: config.sourceHeadSha, sourceTreeSha: config.sourceTreeSha, vscode: vscode.version, node: process.version, state: "failed", productActivationProbe: "not_run", productDeactivationProbe: "not_run", cases, loadedModules }
  async function check(name, operation) { try { const detail = await operation(); cases.push({ name, state: "passed", ...(detail ? { detail } : {}) }) } catch(error) { cases.push({ name, state: "failed", message: String(error?.message ?? error).slice(0,512) }); throw error } }
  try {
    assert.equal(vscode.version, "1.106.1")
    for (const item of config.extensions) {
      const extension = vscode.extensions.getExtension(item.id)
      assert.ok(extension, "artifact development extension must be registered")
      const actual = fs.realpathSync(extension.extensionPath), expected = fs.realpathSync(item.root)
      assert.equal(actual, expected); actualRoots.push(actual)
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
    for(const file of cached)assert.ok(actualRoots.some(root=>{try{assertInstalledRuntimePaths(root,[file]);return true}catch{return false}}),"repo runtime fallback")
    receipt.state="passed"
  } finally { fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"}) }
}
