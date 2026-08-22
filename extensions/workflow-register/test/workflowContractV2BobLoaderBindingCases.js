const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("legacy workflow loading supplies the audited six-capability binding explicitly", () => {
  const loader = readSourceSet(["workflowDefinitionLoader.ts"])

  assert.match(loader, /const LEGACY_BOB_TASK_BINDING: BobWorkflowTaskBinding = Object\.freeze\(\{[\s\S]*profileDigest: BOB_2_0_1_PROFILE_DIGEST,[\s\S]*taskCapabilities: BOB_2_0_1_TASK_CAPABILITIES/)
  assert.match(loader, /adaptCoreWorkflowForBob\(\s*coreWorkflow,\s*candidate\.file,\s*LEGACY_BOB_TASK_BINDING\s*\)/)
  assert.doesNotMatch(loader, /compiled\.workflow as/)
  assert.doesNotMatch(loader, /compiledWorkflow\.bobTaskBinding/)
  assert.match(loader, /must not[\s\S]*pretend that compileWorkflowDocument produced v2 lock evidence/)
})

test("the adapter requires a real caller-supplied binding and carries it into the Bob workflow", () => {
  const adapter = readSourceSet(["workflowAdapter.ts"])
  const factory = readSourceSet(["bobWorkflowFactory.ts"])

  assert.match(adapter, /adaptCoreWorkflowForBob\(\s*core: CoreWorkflowDefinition,\s*file: vscode\.Uri,\s*bobTaskBinding: BobWorkflowTaskBinding/)
  assert.match(adapter, /bobTaskBinding\s*\n?\s*\}/)
  assert.match(factory, /const bobTaskBinding = definition\.bobTaskBinding \?\? DEFAULT_BOB_TASK_BINDING/)
  assert.match(factory, /expectedProfileDigest: bobTaskBinding\.profileDigest/)
  assert.match(factory, /requiredCapabilities: bobTaskBinding\.taskCapabilities/)
})

test("Contract v2 binding remains an explicit P4/R5 handoff rather than a legacy compiler cast", () => {
  const source = readSourceSet(["workflowDefinitionLoader.ts", "workflowAdapter.ts"])

  assert.match(source, /Contract v2 P4\/R5 supplies its[\s\S]*plan-specific binding directly to adaptCoreWorkflowForBob/)
  assert.doesNotMatch(source, /type CompiledCoreWorkflow/)
  assert.doesNotMatch(source, /CoreWorkflowWithBobTaskBinding/)
})
