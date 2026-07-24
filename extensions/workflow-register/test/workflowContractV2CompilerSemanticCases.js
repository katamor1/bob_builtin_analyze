const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")
const { rawPackageFromFiles } = require("./workflowContractV2LockTestSupport")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function environment() {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
}

function compileFixture(fixture) {
  return compilerSubject().compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: environment()
  })
}

function manualWorkflow() {
  return {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Review",
    description: "Review a generated result.",
    inputs: [],
    steps: [{
      id: "review",
      title: "Review",
      type: "manual",
      required: true,
      prompt: "prompts/review.md",
      approval: {
        message: "Approve the result?",
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
    bob: {
      profile: "bob/2.0.1",
      requiredCapabilities: [],
      taskCapabilities: []
    }
  }
}

function reviewSchema() {
  return {
    $schema: DIALECT,
    $id: "schemas/review.json",
    type: "object",
    properties: {
      decision: { type: "string", enum: ["approved", "rejected"] }
    },
    required: ["decision"],
    additionalProperties: false
  }
}

test("prompt text is strict UTF-8, normalized to LF, and kept as JSON text in the public plan", () => {
  const workflow = manualWorkflow()
  const fixture = createLockedRawPackage({
    "workflow.yaml": `${JSON.stringify(workflow)}\n`,
    "prompts/review.md": Buffer.from("Line one\r\nLine two\rLine three\n", "utf8"),
    "schemas/review.json": `${JSON.stringify(reviewSchema())}\n`
  })
  const result = compileFixture(fixture)
  assert.equal(result.ok, true)
  assert.deepEqual(result.handle.plan.prompts.map((value) => ({ ...value })), [{
    id: "review",
    text: "Line one\nLine two\nLine three\n",
    digest: fixture.rawPackage.files.find((file) => file.path === "prompts/review.md").digest
  }])
  assert.deepEqual(result.handle.plan.schemas.map((value) => ({ ...value })), [{
    dialect: DIALECT,
    id: "schemas/review.json",
    digest: result.handle.plan.schemas[0].digest
  }])
  assert.equal(Buffer.isBuffer(result.handle.plan.prompts[0].text), false)
  assert.equal(result.handle.plan.prompts[0].text instanceof Uint8Array, false)

  const state = require("../out/core/contractV2/compiledPlan.js").requireCompiledWorkflowPlanState(result.handle)
  assert.equal(Buffer.from(state.prompts[0].bytes).toString("utf8"), "Line one\nLine two\nLine three\n")
})

test("missing and unreferenced prompt or schema files fail before lock verification", async (t) => {
  const workflow = manualWorkflow()
  const cases = [
    ["missing prompt", {
      "workflow.yaml": `${JSON.stringify(workflow)}\n`,
      "schemas/review.json": `${JSON.stringify(reviewSchema())}\n`
    }],
    ["unreferenced prompt", {
      "workflow.yaml": `${JSON.stringify({ ...workflow, steps: [{ id: "finish", title: "Finish", type: "result", required: true, source: { source: "literal", value: null }, artifacts: [] }] })}\n`,
      "prompts/unused.md": "unused\n"
    }],
    ["missing schema", {
      "workflow.yaml": `${JSON.stringify(workflow)}\n`,
      "prompts/review.md": "review\n"
    }],
    ["unreferenced schema", {
      "workflow.yaml": `${JSON.stringify({ ...workflow, steps: [{ id: "finish", title: "Finish", type: "result", required: true, source: { source: "literal", value: null }, artifacts: [] }] })}\n`,
      "schemas/unused.json": `${JSON.stringify({ ...reviewSchema(), $id: "schemas/unused.json" })}\n`
    }]
  ]
  for (const [name, files] of cases) await t.test(name, () => {
    const result = compileFixture(createLockedRawPackage(files))
    assert.equal(result.ok, false)
    assert.equal(result.diagnostics.length, 1)
    assert.equal(result.diagnostics[0].code, "WF2_PACKAGE_LAYOUT_INVALID")
  })
})

test("prompt BOM and invalid UTF-8 are rejected without exposing content", async (t) => {
  const workflow = manualWorkflow()
  const schema = `${JSON.stringify(reviewSchema())}\n`
  const cases = [
    ["BOM", Buffer.from([0xef, 0xbb, 0xbf, 0x61])],
    ["invalid UTF-8", Buffer.from([0xc3, 0x28])]
  ]
  for (const [name, bytes] of cases) await t.test(name, () => {
    const fixture = createLockedRawPackage({
      "workflow.yaml": `${JSON.stringify(workflow)}\n`,
      "prompts/review.md": bytes,
      "schemas/review.json": schema
    })
    const result = compileFixture(fixture)
    assert.equal(result.ok, false)
    assert.equal(result.diagnostics[0].location.path, "prompts/review.md")
    assert.equal(result.diagnostics[0].message.includes(Buffer.from(bytes).toString("hex")), false)
  })
})

test("pipeline reports YAML, package-shape, schema, then lock failures in that order", async (t) => {
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const cases = []

  const invalidYaml = createLockedRawPackage({ "workflow.yaml": "not valid workflow yaml\n" })
  cases.push(["YAML before lock", invalidYaml.rawPackage, "WF2_PACKAGE_LAYOUT_INVALID"])

  const invalidShape = createLockedRawPackage({
    "workflow.yaml": `${JSON.stringify({ schemaVersion: "workflow-register/v9", id: "minimal", steps: [] })}\n`
  })
  cases.push(["shape before schema or lock", invalidShape.rawPackage, "WF2_PACKAGE_LAYOUT_INVALID"])

  const schemaWorkflow = manualWorkflow()
  const invalidSchema = createLockedRawPackage({
    "workflow.yaml": `${JSON.stringify(schemaWorkflow)}\n`,
    "prompts/review.md": "review\n",
    "schemas/review.json": "{not-json"
  })
  cases.push(["schema before lock", invalidSchema.rawPackage, "WF2_PACKAGE_LAYOUT_INVALID"])

  const valid = createLockedRawPackage()
  const files = Object.fromEntries(valid.rawPackage.files.map((file) => [file.path, Buffer.from(file.bytes)]))
  const drifted = JSON.parse(files["workflow.lock.json"].toString("utf8"))
  drifted.compilerContractVersion = "workflow-register-compiler/v9"
  files["workflow.lock.json"] = Buffer.from(JSON.stringify(drifted), "utf8")
  const lockMismatch = rawPackageFromFiles(files)
  cases.push(["lock after semantic stages", lockMismatch, "WF2_LOCK_MISMATCH"])

  for (const [name, rawPackage, code] of cases) await t.test(name, () => {
    const result = compilerSubject().compileWorkflowPackage({ rawPackage, environment: environment() })
    assert.equal(result.ok, false)
    assert.equal(result.diagnostics.length, 1)
    assert.equal(result.diagnostics[0].code, code)
  })
})
