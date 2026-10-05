const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

function readDoc(...segments) {
  return fs.readFileSync(path.join(extensionRoot, "docs", ...segments), "utf8")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function fencedInterfaceBlock(contract, interfaceName) {
  const match = contract.match(new RegExp(
    "```(?:ts|typescript)\\r?\\n(interface\\s+" + escapeRegExp(interfaceName) + "\\s*\\{[\\s\\S]*?\\r?\\n\\})\\r?\\n```"
  ))
  assert.ok(match, `${interfaceName} must be documented in a fenced TypeScript block`)
  return match[1]
}

function assertWorkflowExecutionInputContract(contract) {
  const actionInput = fencedInterfaceBlock(contract, "ActionExecutionInput")
  for (const field of ["latestAssistantText", "resultText", "artifactText"]) {
    assert.match(
      actionInput,
      new RegExp(`^\\s*${field}\\?: string\\s*$`, "m"),
      `ActionExecutionInput must define optional ${field}`
    )
  }
  assert.doesNotMatch(
    actionInput,
    /^\s*(?:bobRoot|workspaceRoot)\??\s*:/m,
    "ActionExecutionInput must not document stale bobRoot or workspaceRoot fields"
  )

  const agentInput = fencedInterfaceBlock(contract, "AgentExecutionInput")
  for (const [field, shape] of [
    ["workflowId", "string"],
    ["runId", "string"],
    ["stepId", "string"],
    ["prompt", "string"],
    ["inputs", "Record<string, unknown>"],
    ["state", "Record<string, string>"]
  ]) {
    assert.match(
      agentInput,
      new RegExp(`^\\s*${field}: ${escapeRegExp(shape)}\\s*$`, "m"),
      `AgentExecutionInput must define required ${field}`
    )
  }
  for (const field of ["logicalWorkflowId", "workflowRoot", "workflowFile", "workflowFolderName"]) {
    assert.match(
      agentInput,
      new RegExp(`^\\s*${field}\\?: string\\s*$`, "m"),
      `AgentExecutionInput must define optional ${field}`
    )
  }
}

test("workflow action contract docs describe workflow-register public API and execution inputs", () => {
  const contract = readDoc("workflow-action-contracts-ja.md")

  for (const phrase of [
    "registerActionProvider",
    "registerAgentProvider",
    "registerResultSink",
    "runWorkflow",
    "runWorkflowStep",
    "runNextStep",
    "result sink",
    "失敗"
  ]) {
    assert.ok(contract.includes(phrase), `workflow action contract must document: ${phrase}`)
  }
  assertWorkflowExecutionInputContract(contract)
})

test("workflow execution input assertions reject stale interface field shapes", () => {
  const contract = readDoc("workflow-action-contracts-ja.md").replace(/\r\n/g, "\n")
  const missingActionFieldsContract = contract.replace(
    [
      "  latestAssistantText?: string",
      "  resultText?: string",
      "  artifactText?: string"
    ].join("\n"),
    ""
  )
  const staleActionFieldsContract = contract.replace(
    "  latestAssistantText?: string",
    [
      "  bobRoot?: string",
      "  workspaceRoot?: string",
      "  latestAssistantText?: string"
    ].join("\n")
  )
  const staleAgentContract = contract.replace(
    ["  runId: string", "  stepId: string"].join("\n"),
    ["  runId?: string", "  stepId?: string"].join("\n")
  )

  assert.notEqual(missingActionFieldsContract, contract, "ActionExecutionInput missing-field fixture must change the interface")
  assert.throws(
    () => assertWorkflowExecutionInputContract(missingActionFieldsContract),
    /ActionExecutionInput must define optional latestAssistantText/
  )
  assert.notEqual(staleActionFieldsContract, contract, "ActionExecutionInput stale-field fixture must change the interface")
  assert.throws(
    () => assertWorkflowExecutionInputContract(staleActionFieldsContract),
    /ActionExecutionInput must not document stale bobRoot or workspaceRoot fields/
  )
  assert.notEqual(staleAgentContract, contract, "AgentExecutionInput mutation fixture must change the interface")
  assert.throws(
    () => assertWorkflowExecutionInputContract(staleAgentContract),
    /AgentExecutionInput must define required runId/
  )
})

test("artifact metadata contract docs define additive cross-extension metadata", () => {
  const contract = readDoc("artifact-metadata-contract-ja.md")

  for (const phrase of [
    "artifact_metadata",
    ".artifact-metadata.json",
    "producer_extension",
    "producer_version",
    "workflow_run_id",
    "source_vcs",
    "source_revision",
    "input_hash",
    "contains_sensitive_context",
    "human_review_required",
    "破壊的 schema 変更ではない"
  ]) {
    assert.ok(contract.includes(phrase), `artifact metadata contract must document: ${phrase}`)
  }
})

test("workflow-register README is synchronized with the split runtime and task snapshot defaults", () => {
  const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8")

  assert.match(readme, /src\/bobStepRuntime\.ts[\s\S]*StepRuntime/)
  assert.doesNotMatch(readme, /今後の分割候補は `StepRuntime`/)
  assert.match(readme, /workflowRegister\.taskSnapshots\.includeMessages`\s*\|\s*`false`/)
  assert.match(readme, /既定では Bob chat messages を含めません/)
})

test("workflow-register docs cover template customization and snapshot defaults", () => {
  const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8")
  const basicDesign = fs.readFileSync(path.join(extensionRoot, "docs", "basic-design-ja.md"), "utf8")
  const detailedDesign = fs.readFileSync(path.join(extensionRoot, "docs", "detailed-design-ja.md"), "utf8")
  const unitTestSpec = fs.readFileSync(path.join(extensionRoot, "docs", "unit-test-spec-ja.md"), "utf8")
  const realMachineSpec = fs.readFileSync(path.join(extensionRoot, "docs", "real-machine-test-spec-ja.md"), "utf8")

  for (const [name, text] of [
    ["README", readme],
    ["basic design", basicDesign],
    ["detailed design", detailedDesign],
    ["unit test spec", unitTestSpec],
    ["real machine test spec", realMachineSpec]
  ]) {
    assert.match(text, /テンプレート調整/, `${name} must document テンプレート調整`)
  }

  assert.match(detailedDesign, /workflowRegister\.taskSnapshots\.includeMessages`\s*\|\s*`false`/)
  assert.match(unitTestSpec, /WR-UT-036[\s\S]*WR-UT-039/)
  assert.match(realMachineSpec, /WR-RT-036[\s\S]*bzr --no-aliases/)
})

const frozenLegacyImports = [
 ['src/workflowDefinitionLoader.ts','./core/workflowCompiler','legacy-v1-document-compilation'],
 ['src/workflowDefinitionLoader.ts','./workflowAdapter','legacy-v1-bob-adaptation'],
 ['src/core/workflowValidator.ts','./workflowCompiler','legacy-v1-validator-export-compatibility'],
 ['src/commands/validateWorkflow.ts','../core/workflowCompiler','legacy-v1-editor-validation'],
 ['src/bobWorkflowFactory.ts','./core/contractV2/bobProfile','audited-F7-task-probe']
].map(([path,importName,reason]) => ({path,import:importName,reason}))
const consumerPaths = ['workflowContractV2Entrypoint','workflowContractV2Product','workflowContractV2ProviderLifecycle','workflowContractV2View','workflowContractV2ExecutionGuard','workflowContractV2RunStateStore','workflowDefinitionLoader','workflowRegistrationService','workflowRegisterService','workflowRuntimeFactory','workflowRunCommands','workflowDiscovery','bobWorkflowFactory','workflowBobTaskBinding','extension','extensionWithAuthoring','commands/validateWorkflow','gui/operationHubProvider','gui/operationHubModel'].map(p=>'src/'+p+'.ts')
const privateImports = /(?:^|\/)(?:workflowCompiler|parser|predicateCompiler|providerRegistry|bobProfile|packageLoader|packageFileSystemNode|packageRoot|yaml|ajv)$/

test('V2 consumer architecture freezes legacy exceptions and rejects private compilation paths',()=>{
 const allowlist=JSON.parse(fs.readFileSync(path.join(extensionRoot,'test/fixtures/workflow-contract-v2/transitional-legacy-import-allowlist.json'),'utf8'))
 const sources=Object.fromEntries(consumerPaths.map(p=>[p,fs.readFileSync(path.join(extensionRoot,p),'utf8')]))
 assertConsumerImports(sources,allowlist)
 assert.throws(()=>assertConsumerImports({...sources,'src/workflowContractV2View.ts':sources['src/workflowContractV2View.ts']+'\nimport { compileWorkflowDocument } from "./core/workflowCompiler"'},allowlist),/private import/)
 assert.throws(()=>assertConsumerImports({...sources,'src/workflowContractV2View.ts':sources['src/workflowContractV2View.ts']+'\nimport yaml from "js-yaml"'},allowlist),/private import/)
 assert.throws(()=>assertConsumerImports({...sources,'src/workflowContractV2View.ts':sources['src/workflowContractV2View.ts']+'\nimport { compile } from "./core/contractV2/compiler"'},allowlist),/private import/)
 assert.throws(()=>assertConsumerImports(sources,[...allowlist,{path:'src/workflowContractV2View.ts',import:'./core/workflowCompiler',reason:'new exception'}]),/frozen/)
 assert.throws(()=>assertConsumerImports(sources,allowlist.map((x,i)=>i?x:{...x,reason:'broader reason'})),/frozen/)
})

function assertConsumerImports(sources,allowlist) {
 assert.deepEqual(allowlist,frozenLegacyImports,'transitional legacy import allowlist is frozen')
 const ts=require('typescript')
 const productAuthority=new Set(['./core/contractV2/packageLoader','./core/contractV2/packageFileSystemNode','./core/contractV2/packageRoot','./core/contractV2/bobProfile'])
 for(const [file,source] of Object.entries(sources)) {
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)
  const check=(name)=>{
   const allowed=/core\/contractV2\/diagnostics$/.test(name)||allowlist.some(x=>x.path===file&&x.import===name)
    || (file==='src/workflowContractV2Product.ts'&&productAuthority.has(name))
    || (file==='src/workflowBobTaskBinding.ts'&&name==='./core/contractV2/bobProfile')
   if((privateImports.test(name)||/(?:^|\/)(?:js-yaml|yaml|ajv)(?:$|\/)/.test(name)||name==='./workflowAdapter'||/core\/contractV2\//.test(name))&&!allowed) throw Error('private import '+file+': '+name)
  }
  const visit=node=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
    const clause=node.importClause
    const typeOnly=node.isTypeOnly||clause?.isTypeOnly||(clause&&!clause.name&&clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.every(e=>e.isTypeOnly))
    if(!typeOnly)check(node.moduleSpecifier.text)
   }
   if(ts.isCallExpression(node)&&node.arguments.length&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')))check(node.arguments[0].text)
   ts.forEachChild(node,visit)
  }
  visit(tree)
 }
}
