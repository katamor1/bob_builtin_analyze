const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("legacy workflow loading supplies the five required task capabilities explicitly", () => {
  const loader = readSourceSet(["workflowDefinitionLoader.ts", "workflowBobTaskBinding.ts"])

  assert.match(loader, /const LEGACY_BOB_TASK_BINDING: BobWorkflowTaskBinding = Object\.freeze\(\{[\s\S]*profileDigest: BOB_2_0_1_PROFILE_DIGEST,[\s\S]*taskCapabilities: BOB_REQUIRED_TASK_CAPABILITIES/)
  assert.match(loader, /adaptCoreWorkflowForBob\(\s*coreWorkflow,\s*candidate\.file,\s*LEGACY_BOB_TASK_BINDING\s*\)/)
  assert.doesNotMatch(loader, /compiled\.workflow as/)
  assert.doesNotMatch(loader, /compiledWorkflow\.bobTaskBinding/)
  const { LEGACY_BOB_TASK_BINDING } = require("../out/workflowBobTaskBinding")
  const { BOB_REQUIRED_TASK_CAPABILITIES } = require("../out/core/contractV2/bobProfile")
  assert.deepEqual(LEGACY_BOB_TASK_BINDING.taskCapabilities, BOB_REQUIRED_TASK_CAPABILITIES)
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

  assert.match(source, /adaptCompiledWorkflowForProduct\(\{[\s\S]*handle: result\.handle,[\s\S]*rawPackage: result\.rawPackage/)
  assert.doesNotMatch(source, /type CompiledCoreWorkflow/)
  assert.doesNotMatch(source, /CoreWorkflowWithBobTaskBinding/)
})
