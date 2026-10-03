const { workflowYamlText } = require("./workflowContractV2CompilerTestSupport")
const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")
const { rawPackageFromFiles } = require("./workflowContractV2LockTestSupport")

function compile(rawPackage) {
  const compiler = compilerSubject()
  const environment = compiler.createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  return compiler.compileWorkflowPackage({ rawPackage, environment })
}

function expectFailure(result, code, path) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, code)
  assert.equal(result.diagnostics[0].location.path, path)
}

test("strict YAML failure wins before package-shape and lock verification", () => {
  const fixture = createLockedRawPackage({
    "workflow.yaml": "schemaVersion: workflow-register/v2\nnot: [valid\n"
  })
  expectFailure(compile(fixture.rawPackage), "WF2_PACKAGE_LAYOUT_INVALID", "workflow.yaml")
})

test("closed package-shape failure wins before lock verification", () => {
  const fixture = createLockedRawPackage({
    "workflow.yaml": "schemaVersion: workflow-register/v2\nid: minimal\nname: Minimal workflow\ndescription: A minimal Contract v2 workflow.\ninputs: []\nsteps:\n  - id: finish\n    title: Finish\n    type: result\n    required: true\n    source:\n      source: literal\n      value: null\n    artifacts: []\nrequiredArtifacts: []\nresumePolicy:\n  mode: fail-closed\n  maxAttempts: 1\n  retainCommittedOutputs: false\n  allowArtifactReuse: false\nproviders: []\nbob:\n  profile: bob/2.0.1\n  requiredCapabilities: []\n  taskCapabilities: []\nunknownTop: true\n"
  })
  expectFailure(compile(fixture.rawPackage), "WF2_UNKNOWN_OR_NOOP_FIELD", "workflow.yaml")
})

test("predicate compilation wins before provider and Bob binding", () => {
  const dialect = "https://json-schema.org/draft/2020-12/schema"
  const workflow = {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Pipeline precedence",
    description: "Predicate semantics must fail before provider binding.",
    inputs: [{ id: "payload", title: "Payload", schema: "schemas/input.json", required: true }],
    steps: [{
      id: "execute",
      title: "Execute",
      type: "command",
      required: true,
      when: { kind: "exists", left: { source: "input", id: "payload", pointer: "/missing" } },
      provider: "missing.provider",
      input: { source: "literal", value: {} },
      output: { kind: "unit" },
      artifacts: []
    }],
    requiredArtifacts: [],
    resumePolicy: {
      mode: "fail-closed",
      maxAttempts: 1,
      retainCommittedOutputs: false,
      allowArtifactReuse: false
    },
    providers: [{
      id: "missing.provider",
      version: "1.0.0",
      inputSchema: "schemas/input.json",
      output: { kind: "unit" },
      errorSchema: "schemas/error.json",
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: []
    }],
    bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
  }
  const fixture = createLockedRawPackage({
    "workflow.yaml": `${workflowYamlText(workflow)}`,
    "schemas/input.json": `${JSON.stringify({
      $schema: dialect,
      $id: "schemas/input.json",
      type: "object",
      properties: { known: { type: "string" } },
      required: ["known"],
      additionalProperties: false
    })}\n`,
    "schemas/error.json": `${JSON.stringify({
      $schema: dialect,
      $id: "schemas/error.json",
      type: "object"
    })}\n`
  })
  const result = compile(fixture.rawPackage)
  expectFailure(result, "WF2_PREDICATE_INVALID", "workflow.yaml")
  assert.equal(result.diagnostics[0].location.pointer, "/steps/0/when/left/pointer")
})

test("valid semantics with drifted canonical lock reaches lock verification", () => {
  const fixture = createLockedRawPackage()
  const files = { ...fixture.files, "workflow.lock.json": Buffer.from("{}", "utf8") }
  const rawPackage = rawPackageFromFiles(files)
  expectFailure(compile(rawPackage), "WF2_LOCK_MISMATCH", "workflow.lock.json")
})

test("loader raw evidence cannot be used without the audited compiler environment", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  assert.throws(() => compiler.compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: Object.freeze({})
  }), /environment|audited/i)
})

test("lock verification consumes the exact first compiler raw snapshot rather than the caller object again", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const snapshotModule = require("../out/core/contractV2/workflowLockSnapshot.js")
  const original = snapshotModule.snapshotWorkflowLockGenerationRawPackage
  const inputs = []
  const snapshots = []
  const verificationInputs = []
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const originalVerify = lockModule.verifyWorkflowPackageLock
  lockModule.verifyWorkflowPackageLock = (input) => {
    verificationInputs.push(input.rawPackage)
    return originalVerify(input)
  }
  snapshotModule.snapshotWorkflowLockGenerationRawPackage = (value) => {
    const snapshot = original(value)
    inputs.push(value)
    snapshots.push(snapshot)
    if (inputs.length === 1) {
      const lockFile = fixture.rawPackage.files.find((file) => file.path === "workflow.lock.json")
      lockFile.bytes[0] ^= 0xff
    }
    return snapshot
  }
  try {
    const environment = compiler.createAuditedWorkflowCompilerEnvironment({
      purpose: "runtime",
      providerCatalog: createEmptyProviderCatalog(),
      bobProfile: createBobProfile()
    })
    const result = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment })
    assert.equal(result.ok, true)
    assert.equal(inputs.length, 1)
    assert.equal(verificationInputs.length, 1)
    assert.equal(verificationInputs[0], snapshots[0])
    assert.notEqual(inputs[0], fixture.rawPackage)
    assert.notEqual(verificationInputs[0], fixture.rawPackage)
  } finally {
    snapshotModule.snapshotWorkflowLockGenerationRawPackage = original
    lockModule.verifyWorkflowPackageLock = originalVerify
  }
})
