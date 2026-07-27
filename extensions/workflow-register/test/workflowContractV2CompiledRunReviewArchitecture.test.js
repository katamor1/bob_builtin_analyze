const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const sourceRoot = path.join(__dirname, "..", "src", "core", "contractV2")

function source(name) {
  return fs.readFileSync(path.join(sourceRoot, name), "utf8")
}

function before(text, left, right) {
  const leftIndex = text.indexOf(left)
  const rightIndex = text.indexOf(right)
  assert.ok(leftIndex >= 0, `missing source marker: ${left}`)
  assert.ok(rightIndex >= 0, `missing source marker: ${right}`)
  assert.ok(leftIndex < rightIndex, `${left} must precede ${right}`)
}

test("single-step and artifact support are checked before run creation", () => {
  const executor = source("compiledRunExecutor.ts")
  before(executor, "assertCompiledRequiredArtifactSupport(handle.plan)", "createRunFromPlanLease")
  before(executor, "compiledStartIndex(handle.plan, options)", "createRunFromPlanLease")
})

test("entry predicates are evaluated before attempt evidence", () => {
  const executor = source("compiledRunExecutor.ts")
  before(executor, "if (!compiledEntryPredicateAllows", "stepState.attempt =")
  before(executor, "if (!compiledEntryPredicateAllows", "stepState.startedAt =")
})

test("single-step mode evaluates the selected transition before pausing or completing", () => {
  const executor = source("compiledRunExecutor.ts")
  before(executor, "const transition = selectCompiledTransition", "if (options.executionMode === \"singleStep\")")
  assert.match(executor, /transition\.kind === "fail"/)
  assert.match(executor, /transition\.kind === "checkpoint"/)
})

test("terminal compiled runs release their adopted plan lease", () => {
  const executor = source("compiledRunExecutor.ts")
  assert.match(executor, /releaseWorkflowContractV2RunPlanLease/)
  assert.match(executor, /async function completeRun[\s\S]*saveRun\(run\)[\s\S]*releaseWorkflowContractV2RunPlanLease/)
  assert.match(executor, /async function failRun[\s\S]*saveRun\(run\)[\s\S]*releaseWorkflowContractV2RunPlanLease/)
})

test("workspace-write output and artifact evidence share the visibility save boundary", () => {
  const steps = source("compiledRunSteps.ts")
  const transaction = steps.indexOf("commitWorkflowArtifactTransaction(transaction")
  const callback = steps.indexOf("await commitCompiledStepState({", transaction)
  assert.ok(transaction >= 0 && callback > transaction)
  assert.doesNotMatch(
    steps.slice(steps.indexOf("const invoked ="), transaction),
    /persistCompiledOutputs\(input\.run/
  )
})

test("agent output supports strict JSON before the string fallback", () => {
  const steps = source("compiledRunSteps.ts")
  before(steps, "parseStrictJson(bytes, \"Compiled workflow agent output\")", "push(candidates, text)")
  before(steps, "snapshotBoundedWorkflowProviderEnvelope", "validateLocalJsonSchemaViewValue")
})

test("idempotency evidence includes the stable logical effect ordinal", () => {
  const values = source("compiledRunValues.ts")
  assert.match(values, /logicalEffectOrdinal: input\.logicalEffectOrdinal/)
  assert.match(values, /compiledLogicalEffectOrdinal/)
  const steps = source("compiledRunSteps.ts")
  assert.match(steps, /const logicalEffectOrdinal = compiledLogicalEffectOrdinal/)
  assert.match(steps, /compiledProviderIdempotencyKey\([\s\S]*logicalEffectOrdinal/)
})
