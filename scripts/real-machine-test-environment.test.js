const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const toolRoot = path.join(repoRoot, "tools", "real-machine-test-environment")
const manifestPath = path.join(toolRoot, "scenarios.json")
const bazaarSpec = fs.readFileSync(
  path.join(repoRoot, "extensions", "bob-bazaar-review", "docs", "real-machine-test-spec-ja.md"),
  "utf8"
)
const consistencySpec = fs.readFileSync(
  path.join(repoRoot, "extensions", "bob-code-consistency-review", "docs", "real-machine-test-spec-ja.md"),
  "utf8"
)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function assertSafeRelativePath(value, label) {
  assert.equal(path.isAbsolute(value), false, `${label} must be relative`)
  assert.equal(value.split(/[\\/]+/).includes(".."), false, `${label} must not escape with ..`)
}

function assertTestCaseExists(testCaseId) {
  const source = testCaseId.startsWith("BZR-") ? bazaarSpec : consistencySpec
  assert.match(source, new RegExp(`^#{3,4}\\s+${escapeRegExp(testCaseId)}(?:\\s|$)`, "m"))
}

test("manifest defines the approved P0 + P1 scenarios", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const expectedIds = [
    "bazaar-core",
    "bazaar-run-recovery",
    "consistency-ai-matrix",
    "consistency-traceability",
    "consistency-multilang",
    "consistency-validation-errors"
  ]
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(manifest.groups["p0-p1"], expectedIds)
  assert.deepEqual(manifest.scenarios.map((scenario) => scenario.id), expectedIds)
  assert.equal(new Set(expectedIds).size, expectedIds.length)

  for (const scenario of manifest.scenarios) {
    assert.match(scenario.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.equal(scenario.generator.kind, "existing-launcher")
    assertSafeRelativePath(scenario.generator.path, `${scenario.id}.generator.path`)
    assertSafeRelativePath(scenario.checklistTemplate, `${scenario.id}.checklistTemplate`)
    for (const requiredPath of scenario.requiredRepositoryPaths) assertSafeRelativePath(requiredPath, `${scenario.id}.requiredRepositoryPaths`)
    for (const artifactPath of scenario.expectedArtifacts) assertSafeRelativePath(artifactPath, `${scenario.id}.expectedArtifacts`)
    for (const testCaseId of scenario.testCases) assertTestCaseExists(testCaseId)
    assert.equal(fs.existsSync(path.join(repoRoot, scenario.generator.path)), true)
    assert.equal(fs.existsSync(path.join(repoRoot, scenario.checklistTemplate)), true)
  }
})

test("operator result template contains no automatic result", () => {
  const template = JSON.parse(fs.readFileSync(path.join(toolRoot, "templates", "operator-result.template.json"), "utf8"))
  assert.deepEqual(template, {
    schemaVersion: 1,
    scenarioId: "",
    operator: "",
    startedAt: null,
    completedAt: null,
    results: []
  })
})


test("checklist templates retain every expansion token", () => {
  const tokens = [
    "SCENARIO_ID", "SCENARIO_ROOT", "WORKSPACE_PATH", "BOB_ROOT", "VCS_ROOT",
    "REVIEW_TARGET", "LAUNCH_COMMAND", "TEST_CASES", "EXPECTED_ARTIFACTS"
  ]
  for (const scenario of JSON.parse(fs.readFileSync(manifestPath, "utf8")).scenarios) {
    const source = fs.readFileSync(path.join(repoRoot, scenario.checklistTemplate), "utf8")
    for (const token of tokens) assert.match(source, new RegExp(`\\{\\{${token}\\}\\}`))
  }
})
