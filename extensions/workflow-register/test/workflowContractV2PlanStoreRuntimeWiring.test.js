const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

test('workflow runtime factory owns one process-wide plan store and exposes only delegated operations', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'workflowRuntimeFactory.ts'), 'utf8')

  assert.match(source, /const processWorkflowPlanStore = new WorkflowPlanStore\(\)/)
  assert.match(source, /private readonly workflowPlanStore = processWorkflowPlanStore/)
  assert.match(source, /getOrCompileWorkflowPlan\(input: GetOrCompileWorkflowPlanInput\): Promise<CompiledWorkflowPlanHandle> \{\s*return this\.workflowPlanStore\.getOrCompile\(input\)\s*\}/)
  assert.match(source, /acquireWorkflowPlan\(input: AcquireWorkflowPlanInput\): Promise<WorkflowPlanLease> \{\s*return this\.workflowPlanStore\.acquire\(input\)\s*\}/)
  assert.match(source, /invalidateWorkflowPlanSlot\(collectionId: string, workflowId: string\): void \{\s*this\.workflowPlanStore\.invalidateSlot\(collectionId, workflowId\)\s*\}/)
  assert.doesNotMatch(source, /constructor\([\s\S]{0,600}new WorkflowPlanStore\(\)/)
  assert.doesNotMatch(source, /getWorkflowPlanStore\(\)|readonly workflowPlanStore:/)
})
