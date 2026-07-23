const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("workflow loading carries compiled Bob task binding into every Bob workflow", () => {
  const loader = readSourceSet(["workflowDefinitionLoader.ts"])
  const adapter = readSourceSet(["workflowAdapter.ts"])

  assert.match(loader, /const LEGACY_BOB_TASK_BINDING: BobWorkflowTaskBinding = Object\.freeze\(\{[\s\S]*profileDigest: BOB_2_0_1_PROFILE_DIGEST,[\s\S]*taskCapabilities: BOB_2_0_1_TASK_CAPABILITIES/)
  assert.match(loader, /bobTaskBinding: compiledWorkflow\.bobTaskBinding \?\? LEGACY_BOB_TASK_BINDING/)
  assert.match(loader, /const workflow = adaptCoreWorkflowForBob\(coreWorkflow, candidate\.file\)/)
  assert.match(adapter, /export type CoreWorkflowWithBobTaskBinding = CoreWorkflowDefinition & \{[\s\S]*readonly bobTaskBinding: BobWorkflowTaskBinding/)
  assert.match(adapter, /bobTaskBinding: core\.bobTaskBinding/)
})

test("workflow loading preserves a narrower compiled binding instead of replacing it", () => {
  const source = readSourceSet(["workflowDefinitionLoader.ts", "workflowAdapter.ts", "bobWorkflowFactory.ts"])

  assert.match(source, /compiledWorkflow\.bobTaskBinding \?\? LEGACY_BOB_TASK_BINDING/)
  assert.match(source, /const bobTaskBinding = definition\.bobTaskBinding \?\? DEFAULT_BOB_TASK_BINDING/)
  assert.match(source, /expectedProfileDigest: bobTaskBinding\.profileDigest/)
  assert.match(source, /requiredCapabilities: bobTaskBinding\.taskCapabilities/)
})
