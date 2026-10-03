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

function environment(purpose = "runtime") {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose,
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
}

test("compiler publication and generation come from the same detached top-level raw-package snapshot", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const originalGeneration = fixture.rawPackage.generation
  const snapshotModule = require("../out/core/contractV2/workflowLockSnapshot.js")
  const compiledPlan = require("../out/core/contractV2/compiledPlan.js")
  const originalSnapshot = snapshotModule.snapshotWorkflowLockGenerationRawPackage
  const inputs = []
  snapshotModule.snapshotWorkflowLockGenerationRawPackage = (value) => {
    inputs.push(value)
    if (inputs.length === 1) {
      fixture.rawPackage.publication = "staging"
      fixture.rawPackage.generation = ".staging-race-replacement"
    }
    return originalSnapshot(value)
  }
  try {
    const result = compiler.compileWorkflowPackage({
      rawPackage: fixture.rawPackage,
      environment: environment()
    })
    assert.equal(result.ok, true)
    assert.notEqual(inputs[0], fixture.rawPackage)
    const state = compiledPlan.requireCompiledWorkflowPlanState(result.handle)
    assert.equal(state.publication, "published")
    assert.equal(state.generation, originalGeneration)
    assert.equal(compiledPlan.isCompiledWorkflowPlanLeasable(result.handle), true)
  } finally {
    snapshotModule.snapshotWorkflowLockGenerationRawPackage = originalSnapshot
  }
})

test("compiled prompt bytes are available only through fresh detached reads", () => {
  const compiler = compilerSubject()
  const workflow = {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Prompt bytes",
    description: "Exercises the private prompt byte boundary.",
    inputs: [],
    steps: [{
      id: "review",
      title: "Review",
      type: "manual",
      required: true,
      prompt: "prompts/review.md",
      approval: {
        message: "Approve?",
        approveLabel: "Approve",
        rejectLabel: "Reject"
      },
      output: {
        kind: "value",
        id: "reviewResult",
        schema: "schemas/review.json",
        maxBytes: 4096
      }
    }],
    requiredArtifacts: [],
    resumePolicy: {
      mode: "fail-closed",
      maxAttempts: 1,
      retainCommittedOutputs: false,
      allowArtifactReuse: false
    },
    providers: [],
    bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
  }
  const schema = {
    $schema: DIALECT,
    $id: "schemas/review.json",
    type: "object",
    properties: { decision: { type: "string", enum: ["approved", "rejected"] } },
    required: ["decision"],
    additionalProperties: false
  }
  const fixture = createLockedRawPackage({
    "workflow.yaml": `${workflowYamlText(workflow)}`,
    "prompts/review.md": "Review the result.\n",
    "schemas/review.json": `${JSON.stringify(schema)}\n`
  })
  const result = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: environment() })
  assert.equal(result.ok, true)

  const compiledPlan = require("../out/core/contractV2/compiledPlan.js")
  const state = compiledPlan.requireCompiledWorkflowPlanState(result.handle)
  assert.equal("bytes" in state.prompts[0], false)

  const first = compiledPlan.readCompiledWorkflowPromptBytes(result.handle, "review")
  const second = compiledPlan.readCompiledWorkflowPromptBytes(result.handle, "review")
  assert.equal(first instanceof Uint8Array, true)
  assert.deepEqual(Buffer.from(first), Buffer.from("Review the result.\n", "utf8"))
  assert.deepEqual(Buffer.from(second), Buffer.from(first))
  assert.notEqual(first, second)

  first[0] ^= 0xff
  assert.deepEqual(
    Buffer.from(compiledPlan.readCompiledWorkflowPromptBytes(result.handle, "review")),
    Buffer.from("Review the result.\n", "utf8")
  )
  assert.throws(
    () => compiledPlan.readCompiledWorkflowPromptBytes(result.handle, "missing"),
    /prompt|missing|unavailable/i
  )
})
