const { workflowYamlText } = require("./workflowContractV2CompilerTestSupport")
const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"
function schema(id, type, extra = {}) { return { $schema: DIALECT, $id: id, type, ...extra } }
function predicateWorkflow() {
  return {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Predicate workflow",
    description: "Exercises placement-specific predicates.",
    inputs: [
      { id: "gate", title: "Gate", schema: "schemas/gate.json", required: true },
      {
        id: "threshold",
        title: "Threshold",
        schema: "schemas/threshold.json",
        required: false,
        requiredWhen: {
          kind: "equals",
          left: { source: "input", id: "gate", pointer: "" },
          right: true
        }
      }
    ],
    steps: [
      {
        id: "review",
        title: "Review",
        type: "manual",
        required: true,
        prompt: "prompts/review.md",
        approval: { message: "Approve?", approveLabel: "Approve", rejectLabel: "Reject" },
        output: { kind: "value", id: "reviewResult", schema: "schemas/review.json", maxBytes: 4096 },
        transition: {
          decisions: [{
            id: "approved",
            when: {
              kind: "equals",
              left: { source: "committedOutput", id: "reviewResult", pointer: "/decision" },
              right: "approved"
            },
            goto: "finish"
          }],
          default: { goto: "$fail" }
        }
      },
      {
        id: "finish",
        title: "Finish",
        type: "result",
        required: true,
        when: {
          kind: "exists",
          left: { source: "committedOutput", id: "reviewResult", pointer: "" }
        },
        source: { source: "committedOutput", id: "reviewResult", pointer: "" },
        artifacts: []
      }
    ],
    requiredArtifacts: [],
    resumePolicy: { mode: "fail-closed", maxAttempts: 1, retainCommittedOutputs: true, allowArtifactReuse: false },
    providers: [],
    bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
  }
}
function filesFor(document) {
  return {
    "workflow.yaml": `${workflowYamlText(document)}`,
    "prompts/review.md": "Review the result.\n",
    "schemas/gate.json": `${JSON.stringify(schema("schemas/gate.json", "boolean"))}\n`,
    "schemas/threshold.json": `${JSON.stringify(schema("schemas/threshold.json", "number"))}\n`,
    "schemas/review.json": `${JSON.stringify(schema("schemas/review.json", "object", {
      properties: { decision: { type: "string", enum: ["approved", "rejected"] } },
      required: ["decision"],
      additionalProperties: false
    }))}\n`
  }
}
function environment() {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
}
function compile(document) {
  return compilerSubject().compileWorkflowPackage({
    rawPackage: createLockedRawPackage(filesFor(document)).rawPackage,
    environment: environment()
  })
}

test("predicate placements compile into explicit entry and post-commit plan records", () => {
  const result = compile(predicateWorkflow())
  assert.equal(result.ok, true)
  const predicates = result.handle.plan.predicates
  assert.equal(predicates.length, 3)
  assert.deepEqual(predicates.map((entry) => entry.phase), ["entry", "postCommit", "entry"])
  assert.deepEqual(predicates.map((entry) => entry.placement.kind), [
    "inputRequiredWhen",
    "stepTransition",
    "stepEntry"
  ])
  assert.equal(predicates[1].location.pointer, "/steps/0/transition/decisions/0/when")
  assert.equal(predicates[1].predicate.left.id, "reviewResult")
  assert.equal(Object.isFrozen(predicates[1]), true)

  const workflow = result.handle.plan.workflow
  assert.equal(workflow.schemaVersion, "workflow-compiled-workflow/v2")
  assert.equal("requiredWhen" in workflow.inputs[1], false)
  assert.equal(workflow.inputs[1].requiredWhenPredicate, 0)
  assert.equal("when" in workflow.steps[0].transition.decisions[0], false)
  assert.equal(workflow.steps[0].transition.decisions[0].predicate, 1)
  assert.equal("when" in workflow.steps[1], false)
  assert.equal(workflow.steps[1].entryPredicate, 2)

  const evaluator = require("../out/core/contractV2/predicate.js")
  assert.equal(evaluator.evaluateWorkflowPredicate(predicates[1].predicate, {
    inputs: { gate: true, threshold: 1 }, committedOutputs: { reviewResult: { decision: "approved" } }
  }), true)
  assert.equal(evaluator.evaluateWorkflowPredicate(predicates[1].predicate, {
    inputs: { gate: true, threshold: 1 }, committedOutputs: { reviewResult: { decision: "rejected" } }
  }), false)

  // Verify that lowering consumes the validator's successful AST rather than rereading source nodes.
  const originalCompile = evaluator.compileWorkflowPredicate
  evaluator.compileWorkflowPredicate = (input) => originalCompile(input.placement.kind === "inputRequiredWhen"
    ? { ...input, predicate: { ...input.predicate, right: false } }
    : input)
  try {
    const document = predicateWorkflow()
    const lowered = compile(document)
    assert.equal(lowered.ok, true)
    assert.equal(document.inputs[1].requiredWhen.right, true)
    assert.equal(lowered.handle.plan.predicates[0].predicate.right, false)
    assert.equal(lowered.handle.plan.predicates[0].predicate.left.pointer, "")
    assert.equal(lowered.handle.plan.predicates[1].predicate.left.pointer, "/decision")
  } finally {
    evaluator.compileWorkflowPredicate = originalCompile
  }
})

test("current-step outputs are forbidden at entry and input predicates cannot read outputs", async (t) => {
  const entry = predicateWorkflow()
  entry.steps[0].when = {
    kind: "exists",
    left: { source: "committedOutput", id: "reviewResult", pointer: "" }
  }
  const requiredWhen = predicateWorkflow()
  requiredWhen.inputs[1].requiredWhen = {
    kind: "exists",
    left: { source: "committedOutput", id: "reviewResult", pointer: "" }
  }
  for (const [name, document] of [["current entry", entry], ["input requiredWhen", requiredWhen]]) {
    await t.test(name, () => {
      const result = compile(document)
      assert.equal(result.ok, false)
      assert.equal(result.diagnostics.length, 1)
      assert.equal(result.diagnostics[0].code, "WF2_PACKAGE_LAYOUT_INVALID")
      assert.equal(result.diagnostics[0].location.pointer, name === "current entry"
        ? "/steps/0/when/left/id" : "/inputs/1/requiredWhen/left/source")
    })
  }
})
