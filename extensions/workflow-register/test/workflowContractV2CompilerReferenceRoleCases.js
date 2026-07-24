const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"
const schema = (id, body) => ({ $schema: DIALECT, $id: id, ...body })
const base = (steps, inputs = [], requiredArtifacts = []) => ({
  schemaVersion: "workflow-register/v2",
  id: "minimal",
  name: "Reference workflow",
  description: "Exercises compiler-owned semantic reference and schema-role checks.",
  inputs,
  steps,
  requiredArtifacts,
  resumePolicy: {
    mode: "fail-closed",
    maxAttempts: 1,
    retainCommittedOutputs: true,
    allowArtifactReuse: false
  },
  providers: [],
  bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
})

function environment() {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
}

function compile(files) {
  return compilerSubject().compileWorkflowPackage({
    rawPackage: createLockedRawPackage(files).rawPackage,
    environment: environment()
  })
}

function expectFailure(result, pointer) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_PACKAGE_LAYOUT_INVALID")
  assert.equal(result.diagnostics[0].location.pointer, pointer)
}

function approvalStep() {
  return {
    id: "review",
    title: "Review",
    type: "manual",
    required: true,
    prompt: "prompts/review.md",
    form: {
      fields: [{
        id: "category",
        title: "Category",
        type: "select",
        required: true,
        options: ["alpha", "beta"]
      }]
    },
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
  }
}

function approvalSchema(overrides = {}) {
  return schema("schemas/review.json", {
    type: "object",
    properties: {
      category: { type: "string", enum: ["alpha", "beta"] },
      decision: { type: "string", enum: ["approved", "rejected"] }
    },
    required: ["category", "decision"],
    additionalProperties: false,
    ...overrides
  })
}

test("result and context references must resolve against a lexically visible schema pointer", async (t) => {
  const inputSchema = schema("schemas/input.json", {
    type: "object",
    properties: { known: { type: "string" } },
    required: ["known"],
    additionalProperties: false
  })
  const input = [{ id: "payload", title: "Payload", schema: "schemas/input.json", required: true }]
  const invalidPointer = base([{
    id: "finish",
    title: "Finish",
    type: "result",
    required: true,
    source: { source: "input", id: "payload", pointer: "/missing" },
    artifacts: []
  }], input)
  await t.test("invalid pointer", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(invalidPointer)}\n`,
      "schemas/input.json": `${JSON.stringify(inputSchema)}\n`
    })
    expectFailure(result, "/steps/0/source/pointer")
  })

  const future = base([{
    id: "finish",
    title: "Finish",
    type: "result",
    required: true,
    source: { source: "committedOutput", id: "reviewResult", pointer: "" },
    artifacts: []
  }, approvalStep()])
  await t.test("future output", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(future)}\n`,
      "prompts/review.md": "Review.\n",
      "schemas/review.json": `${JSON.stringify(approvalSchema())}\n`
    })
    expectFailure(result, "/steps/0/source/id")
  })

  const commandTemplate = base([{
    id: "execute",
    title: "Execute",
    type: "command",
    required: true,
    provider: "example.provider",
    input: { source: "input", id: "payload", pointer: "/missing" },
    output: { kind: "unit" },
    artifacts: []
  }], input)
  commandTemplate.providers = [{
    id: "example.provider",
    version: "1.0.0",
    inputSchema: "schemas/input.json",
    output: { kind: "unit" },
    errorSchema: "schemas/error.json",
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: []
  }]
  await t.test("command template pointer", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(commandTemplate)}\n`,
      "schemas/input.json": `${JSON.stringify(inputSchema)}\n`,
      "schemas/error.json": `${JSON.stringify(schema("schemas/error.json", { type: "object" }))}\n`
    })
    expectFailure(result, "/steps/0/input/pointer")
  })

  const agentContext = base([
    approvalStep(),
    {
      id: "summarize",
      title: "Summarize",
      type: "agent",
      required: true,
      prompt: "prompts/agent.md",
      context: [{ source: "committedOutput", id: "reviewResult", pointer: "/missing" }],
      output: { kind: "value", id: "summary", schema: "schemas/summary.json", maxBytes: 4096 },
      artifacts: []
    }
  ])
  await t.test("agent context pointer", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(agentContext)}\n`,
      "prompts/review.md": "Review.\n",
      "prompts/agent.md": "Summarize.\n",
      "schemas/review.json": `${JSON.stringify(approvalSchema())}\n`,
      "schemas/summary.json": `${JSON.stringify(schema("schemas/summary.json", { type: "string" }))}\n`
    })
    expectFailure(result, "/steps/1/context/0/pointer")
  })
})

test("manual output schemas must exactly match form, approval, required, and option contracts", async (t) => {
  const workflow = base([approvalStep()])
  const cases = [
    ["required", approvalSchema({ required: ["decision"] }), "/steps/0/output/schema"],
    ["additional properties", approvalSchema({ additionalProperties: true }), "/steps/0/output/schema"],
    ["select options", approvalSchema({
      properties: {
        category: { type: "string", enum: ["alpha", "gamma"] },
        decision: { type: "string", enum: ["approved", "rejected"] }
      }
    }), "/steps/0/form/fields/0/options"],
    ["decision enum", approvalSchema({
      properties: {
        category: { type: "string", enum: ["alpha", "beta"] },
        decision: { type: "string", enum: ["yes", "no"] }
      }
    }), "/steps/0/approval"]
  ]
  for (const [name, outputSchema, pointer] of cases) await t.test(name, () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(workflow)}\n`,
      "prompts/review.md": "Review.\n",
      "schemas/review.json": `${JSON.stringify(outputSchema)}\n`
    })
    expectFailure(result, pointer)
  })
})

test("text and binary artifact schemas are string-valued while JSON artifacts retain JSON kinds", async (t) => {
  const finish = {
    id: "finish",
    title: "Finish",
    type: "result",
    required: true,
    source: { source: "literal", value: null },
    artifacts: ["report"]
  }
  const artifact = (mediaType) => ({
    id: "report",
    producedBy: "finish",
    path: "report.bin",
    mediaType,
    schema: "schemas/artifact.json",
    maxBytes: 1024,
    owner: "runtime",
    required: true
  })
  const numberSchema = schema("schemas/artifact.json", { type: "number" })
  await t.test("text rejects number schema", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(base([finish], [], [artifact("text/plain")]))}\n`,
      "schemas/artifact.json": `${JSON.stringify(numberSchema)}\n`
    })
    expectFailure(result, "/requiredArtifacts/0/schema")
  })
  await t.test("binary rejects number schema", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(base([finish], [], [artifact("application/octet-stream")]))}\n`,
      "schemas/artifact.json": `${JSON.stringify(numberSchema)}\n`
    })
    expectFailure(result, "/requiredArtifacts/0/schema")
  })
  await t.test("JSON permits number schema", () => {
    const result = compile({
      "workflow.yaml": `${JSON.stringify(base([finish], [], [artifact("application/json")]))}\n`,
      "schemas/artifact.json": `${JSON.stringify(numberSchema)}\n`
    })
    assert.equal(result.ok, true)
  })
})
