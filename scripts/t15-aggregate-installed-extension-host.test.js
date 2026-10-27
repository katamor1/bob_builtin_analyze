"use strict"
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),Module=require("node:module");
const {assertInstalledRuntimePaths,resolveInstalledParserEntries,runGuiProbe}=require("./t14-bounded-document-installed-extension-host.test.js");
Object.assign(exports,{assertInstalledRuntimePaths,resolveInstalledParserEntries,runGuiProbe});
const modules=["generatedProcessingBudgetDefinition","processingBudgetError","processingBudgetProfile","processingBudgetLedger","index","boundedDocumentError","boundedDocumentRequest","boundedDocumentFile","boundedDocumentIo","ooxmlPreflight","ooxmlParserInput","validatedOoxml","documentBudget","workbookBudget"];
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
exports.run = async function run() {
  const vscode = require("vscode"), config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"))
  const cases = [], loadedModules = [], actualRoots = [], parserIdentities = []
  const receipt = { schemaVersion: "bob-builtin-analyze/t15-installed-host/v1", sourceHeadSha: config.sourceHeadSha, sourceTreeSha: config.sourceTreeSha, vscode: vscode.version, node: process.version, state: "failed", productActivationProbe: "not_run", productDeactivationProbe: "not_run", cases, loadedModules, parserIdentities }
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
      const create=sharedB.createRuleDocumentOperation;let observed;sharedB.createRuleDocumentOperation=(...args)=>{observed=create(...args);return observed};try{const result=await bazaar.extractRuleDocument({filePath:documentPath("normal.docx")});assert.ok(result.chunks.length>0);assert.equal(usage(observed,"total_document_bytes"),original.get("normal.docx").length);assert.equal(usage(observed,"document_count"),1);await bazaar.extractRuleDocument({filePath:documentPath("legacy.doc")});assert.equal(usage(observed,"total_document_bytes"),original.get("legacy.doc").length)}finally{sharedB.createRuleDocumentOperation=create}
      const operation=sharedC.createReviewDocumentOperation(1,cLimits),result=await consistency.extractDocuments(review("normal.xlsx"),{workspaceRoot:config.workspaceRoot,operation});assert.ok(result.evidence.length>0);assert.equal(usage(operation,"total_document_bytes"),original.get("normal.xlsx").length);assert.equal(usage(operation,"total_sheets"),2);assert.equal(usage(operation,"total_rows"),3);
    });
    for(const [name,bytes]of original)assert.ok(fs.readFileSync(documentPath(name)).equals(bytes));

    for (const root of actualRoots) {
      const manifest=JSON.parse(fs.readFileSync(path.join(root,"out/shared-processing-budget-runtime/manifest.json"),"utf8"))
      for(const name of modules){const file=fs.realpathSync(require.resolve(path.join(root,"out/shared-processing-budget-runtime",name+".js")));assertInstalledRuntimePaths(root,[file]);const bytes=fs.readFileSync(file),expected=manifest.payload.find(x=>x.path===name+".js");assert.equal(sha(bytes),expected.sha256);assert.equal(bytes.length,expected.bytes);loadedModules.push({extensionRoot:root,moduleName:name,path:file,bytes:bytes.length,sha256:sha(bytes)})}
    }
    const cached=Object.keys(require.cache).filter(file=>/[\\/](?:shared-processing-budget-runtime[\\/]|processing-budget-runtime[\\/]out[\\/])/.test(file))
    for(const file of cached)assert.ok(actualRoots.some(root=>{try{assertInstalledRuntimePaths(root,[file]);return true}catch{return false}}),"repo runtime fallback")
    for (const file of Object.keys(require.cache).filter(file => config.extensions.some(item => item.parsers.some(parser => file.split(path.sep).join("/").includes("/node_modules/" + parser.name + "/"))))) {
      const physical=fs.realpathSync(file).replace(/^[a-z]:/,drive=>drive.toUpperCase());assert.ok(config.extensions.some(item=>item.parsers.some(parser=>physical.startsWith(path.join(fs.realpathSync(item.root).replace(/^[a-z]:/,drive=>drive.toUpperCase()),"node_modules",parser.name)+path.sep))),"artifact parser cache fallback")
    }
    receipt.state="passed"
  } finally { fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"}) }
}
