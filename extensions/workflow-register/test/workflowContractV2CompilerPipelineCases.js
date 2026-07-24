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
