"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const Ajv = require("ajv")

const schemaPath = path.join(__dirname, "..", "schema", "workflow-contract-report.v1.schema.json")

function loadReportModule() {
  return require("../out/core/workflowContractReport")
}

function digest(character) {
  return character.repeat(64)
}

function reportFixture() {
  return {
    schema_version: "workflow-contract-report/v1",
    commit_sha: "1".repeat(40),
    tree_sha: "2".repeat(40),
    worktree_clean: true,
    manifests: [{
      owner: "local.fixture",
      version: "1.0.0",
      path: "extensions/fixture/contracts/workflow-contributions.json",
      sha256: digest("a"),
      schemas: [{ path: "extensions/fixture/schema/input.json", sha256: digest("b") }]
    }],
    workflows: [
      { path: "WORKFLOW.md", owner: "local.fixture", classification: "claim", role: "production" },
      { path: "test/fixtures/WORKFLOW.md", owner: "local.fixture", classification: "exclusion", reason: "fixture" }
    ],
    resolutions: [
      {
        workflow_path: "WORKFLOW.md",
        kind: "action_provider",
        location: "steps/collect",
        id: "fixture.collect",
        owner: "local.fixture",
        contract_version: "fixture.collect/v1"
      },
      {
        workflow_path: "WORKFLOW.md",
        kind: "command",
        location: "steps/collect/args/0",
        id: "fixture.capture",
        owner: "local.fixture",
        source: "product",
        package_path: "extensions/fixture/package.json"
      }
    ],
    vsix: [{ owner: "local.fixture", archive_path: "artifacts/fixture.vsix", sha256: digest("c"), status: "passed" }],
    checks: ["command", "discovery", "mirror", "strict-compile", "vsix"].map((name) => ({ name, status: "passed" })),
    warnings: []
  }
}

test("workflow contract report schema is present, closed, and accepts the canonical fixture", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"))
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)
  const report = reportFixture()
  assert.equal(validate(report), true, JSON.stringify(validate.errors))
  assert.equal(validate({ ...report, unknown: true }), false)
})

test("runtime and shipped schema reject the same overlong but pattern-valid owner", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"))
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)
  const { validateWorkflowContractReport } = loadReportModule()
  const report = reportFixture()
  const overlongOwner = `${"a".repeat(100)}.${"b".repeat(102)}`
  report.manifests[0].owner = overlongOwner
  report.workflows.forEach((record) => { record.owner = overlongOwner })
  report.resolutions.forEach((record) => { record.owner = overlongOwner })
  report.vsix[0].owner = overlongOwner
  assert.equal(validate(report), false)
  assert.equal(validateWorkflowContractReport(report).ok, false)
})

test("runtime limits exactly match every shipped schema collection and text bound", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"))
  const { WORKFLOW_CONTRACT_REPORT_LIMITS: limits } = loadReportModule()
  assert.deepEqual({
    manifests: schema.properties.manifests.maxItems,
    schemasPerManifest: schema.definitions.manifest.properties.schemas.maxItems,
    workflows: schema.properties.workflows.maxItems,
    resolutions: schema.properties.resolutions.maxItems,
    vsix: schema.properties.vsix.maxItems,
    checks: schema.properties.checks.maxItems,
    textCodePoints: schema.definitions.text.maxLength,
    pathCodePoints: schema.definitions.path.maxLength,
    ownerCodePoints: schema.definitions.owner.maxLength,
    semverCodePoints: schema.definitions.semver.maxLength,
    contractCodePoints: schema.definitions.contractVersion.maxLength
  }, {
    manifests: limits.manifests,
    schemasPerManifest: limits.schemasPerManifest,
    workflows: limits.workflows,
    resolutions: limits.resolutions,
    vsix: limits.vsix,
    checks: limits.checks,
    textCodePoints: limits.textCodePoints,
    pathCodePoints: limits.pathCodePoints,
    ownerCodePoints: limits.ownerCodePoints,
    semverCodePoints: limits.semverCodePoints,
    contractCodePoints: limits.contractCodePoints
  })
})

test("semantic validation caps adversarial diagnostics deterministically", () => {
  const { validateWorkflowContractReport, WORKFLOW_CONTRACT_REPORT_LIMITS: limits } = loadReportModule()
  const report = reportFixture()
  report.resolutions = []
  report.workflows = Array.from({ length: 2000 }, (_unused, index) => ({
    path: `workflows/${String(index).padStart(4, "0")}/WORKFLOW.md`,
    owner: "local.unknown",
    classification: "claim",
    role: "production"
  }))
  const result = validateWorkflowContractReport(report)
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, limits.diagnostics + 1)
  assert.equal(result.diagnostics.at(-1), "additional diagnostics omitted")
})

test("serialization counts lone surrogate JSON escapes and rejects an oversized valid report before JSON.stringify", () => {
  const { serializeWorkflowContractReport, WORKFLOW_CONTRACT_REPORT_LIMITS: limits } = loadReportModule()
  const report = reportFixture()
  const owner = `${"a".repeat(99)}.${"b".repeat(100)}`
  const adversarial = "\ud800"
  const workflowPath = `root/${adversarial.repeat(limits.pathCodePoints - "root//WORKFLOW.md".length)}/WORKFLOW.md`
  report.manifests[0] = { owner, version: "1.0.0", path: "extensions/fixture/contracts/workflow-contributions.json", sha256: digest("a"), schemas: [] }
  report.workflows = [{ path: workflowPath, owner, classification: "claim", role: adversarial.repeat(limits.textCodePoints) }]
  report.vsix = [{ owner, archive_path: "artifacts/fixture.vsix", sha256: digest("c"), status: "passed" }]
  const id = `i${adversarial.repeat(limits.textCodePoints - 1)}`
  const contractVersion = `${"c".repeat(limits.contractCodePoints - 3)}/v1`
  report.resolutions = Array.from({ length: 5200 }, (_unused, index) => ({
    workflow_path: workflowPath,
    kind: "command",
    location: `${adversarial.repeat(limits.textCodePoints - 8)}${String(index).padStart(8, "0")}`,
    id,
    owner,
    source: "external",
    contract_version: contractVersion,
    declared_workflow_path: workflowPath
  }))
  const original = JSON.stringify
  let calls = 0
  JSON.stringify = function (...args) { calls += 1; return original.apply(this, args) }
  try {
    assert.throws(() => serializeWorkflowContractReport(report), /generation byte budget|byte limit/i)
    assert.equal(calls, 0)
  } finally {
    JSON.stringify = original
  }
})

for (const [name, mutate, pattern] of [
  ["missing tracked workflow", (report) => { report.workflows.shift() }, /workflow.*missing|expected workflow/i],
  ["missing manifest digest", (report) => { delete report.manifests[0].sha256 }, /sha256|manifest/i],
  ["missing schema digest", (report) => { delete report.manifests[0].schemas[0].sha256 }, /sha256|schema/i],
  ["stale commit", (report) => { report.commit_sha = "3".repeat(40) }, /commit/i],
  ["stale tree", (report) => { report.tree_sha = "4".repeat(40) }, /tree/i],
  ["warning", (report) => { report.warnings.push("unsafe") }, /warning/i],
  ["failed check", (report) => { report.checks[0].status = "failed" }, /check|passed/i],
  ["unknown exclusion owner", (report) => { report.workflows[1].owner = "local.unknown" }, /owner/i],
  ["duplicate workflow", (report) => { report.workflows.push({ ...report.workflows[1] }) }, /duplicate|order/i],
  ["duplicate resolution", (report) => { report.resolutions.push({ ...report.resolutions[1] }) }, /duplicate|order/i],
  ["duplicate manifest owner", (report) => {
    report.manifests.push({ ...report.manifests[0], path: "extensions/fixture-two/contracts/workflow-contributions.json" })
    report.manifests.sort((left, right) => left.owner < right.owner ? -1 : left.owner > right.owner ? 1 : left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  }, /manifest.*owner|duplicate owner/i],
  ["duplicate manifest path", (report) => {
    report.manifests.push({ ...report.manifests[0], owner: "local.fixture-two" })
    report.manifests.sort((left, right) => left.owner < right.owner ? -1 : left.owner > right.owner ? 1 : left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    report.vsix.push({ ...report.vsix[0], owner: "local.fixture-two", archive_path: "artifacts/fixture-two.vsix" })
    report.vsix.sort((left, right) => left.owner < right.owner ? -1 : left.owner > right.owner ? 1 : 0)
  }, /manifest.*path|duplicate path/i],
  ["external command declared path drift", (report) => {
    report.resolutions[1] = {
      workflow_path: "WORKFLOW.md", kind: "command", location: "steps/collect/args/0", id: "fixture.external",
      owner: "local.fixture", source: "external", contract_version: "fixture.external/v1", declared_workflow_path: "test/fixtures/WORKFLOW.md"
    }
  }, /declared_workflow_path|external command/i],
  ["product command package provenance drift", (report) => { report.resolutions[1].package_path = "extensions/other/package.json" }, /package_path|product command/i],
  ["noncanonical ordering", (report) => { report.resolutions.reverse() }, /canonical|order/i]
]) {
  test(`semantic report validation rejects ${name}`, () => {
    const { validateWorkflowContractReport } = loadReportModule()
    const report = reportFixture()
    mutate(report)
    const result = validateWorkflowContractReport(report, {
      expectedCommitSha: "1".repeat(40),
      expectedTreeSha: "2".repeat(40),
      expectedWorkflowPaths: ["WORKFLOW.md", "test/fixtures/WORKFLOW.md"]
    })
    assert.equal(result.ok, false)
    assert.match(result.diagnostics.join("\n"), pattern)
  })
}

test("canonical serialization is byte-identical across repeated calls", () => {
  const { serializeWorkflowContractReport } = loadReportModule()
  const report = reportFixture()
  const first = serializeWorkflowContractReport(report)
  const second = serializeWorkflowContractReport(report)
  assert.ok(Buffer.isBuffer(first))
  assert.deepEqual(second, first)
  assert.equal(first.at(-1), 0x0a)
})

test("report and expectation accessors are rejected without invocation", () => {
  const { validateWorkflowContractReport } = loadReportModule()
  const report = reportFixture()
  let reportReads = 0
  Object.defineProperty(report, "warnings", { enumerable: true, get() { reportReads += 1; return [] } })
  const reportResult = validateWorkflowContractReport(report)
  assert.equal(reportResult.ok, false)
  assert.equal(reportReads, 0)

  let expectationReads = 0
  const expectations = {}
  Object.defineProperty(expectations, "expectedCommitSha", { enumerable: true, get() { expectationReads += 1; return "1".repeat(40) } })
  const expectationResult = validateWorkflowContractReport(reportFixture(), expectations)
  assert.equal(expectationResult.ok, false)
  assert.equal(expectationReads, 0)
})

module.exports = { reportFixture }
