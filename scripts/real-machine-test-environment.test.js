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

test("runner exposes the approved validation interface", () => {
  const runner = fs.readFileSync(path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), "utf8")
  const source = fs.readFileSync(path.join(toolRoot, "lib", "ScenarioManifest.ps1"), "utf8")
  assert.match(runner, /\[switch\]\$ValidateOnly/)
  assert.match(runner, /\[switch\]\$Open/)
  assert.match(runner, /\[string\]\$OpenScenario/)
  assert.match(runner, /\$selected = @\(Resolve-ScenarioSelection/)
  assert.match(runner, /Manifest validation succeeded/)
  assert.doesNotMatch(runner, /Invoke-Expression/)
  for (const name of [
    "Read-ScenarioManifest",
    "Assert-ScenarioManifest",
    "Resolve-ScenarioSelection",
    "Assert-RepositoryRelativePath",
    "Assert-ScenarioRelativePath",
    "Test-PathInsideRoot"
  ]) assert.match(source, new RegExp(`function ${name}`))
  assert.match(source, /p0-p1 must list every scenario exactly once in manifest order/)
  assert.match(source, /if \(\$fullPath -eq \$pathRoot\) \{ return \$fullPath \}/)
})

test("execution module injects NoLaunch and validates reparse-point traversal", () => {
  const source = fs.readFileSync(path.join(toolRoot, "lib", "ScenarioExecution.ps1"), "utf8")
  for (const name of [
    "Assert-NoReparsePointTraversal",
    "Assert-SafeOutputRoot",
    "Get-ScenarioPrerequisiteReport",
    "New-LauncherInvocation",
    "Invoke-ScenarioLauncher",
    "Copy-ScenarioFixtureFiles",
    "Test-ExpectedScenarioArtifacts",
    "Get-ScenarioLaunchDescriptor"
  ]) assert.match(source, new RegExp(`function ${name}`))
  assert.match(source, /FileAttributes\]::ReparsePoint/)
  assert.match(source, /NoLaunch\s*=\s*\$true/)
  assert.match(source, /\$arguments = \$Invocation\.arguments\s+& \$Invocation\.launcherPath @arguments/s)
  assert.doesNotMatch(source, /Invoke-Expression/)
  assert.doesNotMatch(source, /SkipExtensionInstall\s*=/)
  assert.match(source, /Assert-NoReparsePointTraversal -Root \$ScenarioRoot -Target \$destination/)
})

test("evidence module preserves manual operator status and complete run records", () => {
  const source = fs.readFileSync(path.join(toolRoot, "lib", "RunEvidence.ps1"), "utf8")
  for (const name of [
    "Write-JsonUtf8", "Get-ToolVersionSnapshot", "Get-RepositorySnapshot",
    "New-OperatorResult", "Expand-ChecklistTemplate", "Write-ScenarioEvidence", "Write-RunEvidence"
  ]) assert.match(source, new RegExp(`function ${name}`))
  assert.match(source, /status = "not_run"/)
  assert.match(source, /\[System\.Collections\.IDictionary\]\$ScenarioRecord/)
  assert.match(source, /environment-versions\.json/)
  assert.match(source, /run-manifest\.json/)
  assert.match(source, /run-summary\.md/)
  assert.doesNotMatch(source, /Get-ChildItem\s+Env:/i)
})

test("runner isolates scenario statuses and opens only an explicit ready target", () => {
  const source = fs.readFileSync(path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), "utf8")
  for (const status of ["not_started", "blocked", "failed", "ready"]) assert.match(source, new RegExp(`"${status}"`))
  assert.match(source, /foreach \(\$selectedScenario in \$selected\)/)
  assert.match(source, /try \{\s*Write-ScenarioEvidence/s)
  assert.match(source, /Write-RunEvidence/)
  assert.match(source, /Cannot open non-ready scenario/)
  assert.match(source, /if \(\$blockedCount -gt 0 -or \$failedCount -gt 0\) \{ exit 1 \}/)
})

test("runner records a missing command as blocked without invoking a launcher", { skip: process.platform !== "win32" }, () => {
  const outputRoot = path.join(os.tmpdir(), `bob-review-real-machine-${process.pid}-${Date.now()}`)
  const result = childProcess.spawnSync("pwsh", [
    "-NoProfile", "-File", path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"),
    "-Scenario", "consistency-ai-matrix",
    "-OutputRoot", outputRoot,
    "-CodeCommand", "__missing_bob_code_command__"
  ], { cwd: repoRoot, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  const run = JSON.parse(fs.readFileSync(path.join(outputRoot, "run-manifest.json"), "utf8"))
  assert.equal(run.scenarios[0].status, "blocked")
  assert.deepEqual(run.scenarios[0].missingCommands, ["__missing_bob_code_command__"])
  const operator = JSON.parse(fs.readFileSync(path.join(outputRoot, "consistency-ai-matrix", "operator-result.json"), "utf8"))
  assert.ok(operator.results.length > 0)
  assert.ok(operator.results.every((entry) => entry.status === "not_run"))
  assert.equal(run.scenarios[0].launchTarget, null)
  fs.rmSync(outputRoot, { recursive: true, force: true })
})

test("Bazaar recovery scenario declares deterministic post-seed artifacts", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const scenario = manifest.scenarios.find((entry) => entry.id === "bazaar-run-recovery")
  assert.equal(scenario.postSeed, "tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1")
  assert.equal(fs.existsSync(path.join(repoRoot, scenario.postSeed)), true)
  for (const pathValue of [
    "bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-result-capture/review-run.json",
    "bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-human-triage/review-run.json",
    "bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-finalize/review-run.json",
    "bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/malformed-run-hidden/review-run.json",
    "bob-managed/test-data/invalid/review-result-schema-error.json",
    "bob-managed/test-data/invalid/review-result-id-mismatch.json"
  ]) assert.ok(scenario.expectedArtifacts.includes(pathValue))
})

test("Bazaar recovery seed validates completed phase artifacts", () => {
  const source = fs.readFileSync(path.join(toolRoot, "seeds", "bazaar-run-recovery", "Seed-BazaarRunRecovery.ps1"), "utf8")
  for (const name of ["New-BazaarRecoverySeedPlan", "Assert-BazaarRecoverySeedPlan", "Write-BazaarRecoverySeedPlan"]) {
    assert.match(source, new RegExp(`function ${name}`))
  }
  for (const fieldName of ["reviewPacketPath", "reviewResultJsonPath", "reviewResultMarkdownPath", "triageYamlPath"]) {
    assert.match(source, new RegExp(fieldName))
  }
  assert.match(source, /throw "\$fieldName is required for completed \$phaseName phase"/)
  assert.match(source, /Exactly three valid recovery review runs are required/)
  assert.match(source, /Exactly one malformed run is required/)
  assert.match(source, /Exactly two invalid review results are required/)
  assert.match(source, /Bazaar recovery seed paths must be unique/)
  assert.match(source, /Malformed Review Run must not parse as JSON/)
  assert.match(source, /Invalid review result must remain isolated/)
  assert.match(source, /Schema-error fixture must omit summary/)
  assert.match(source, /ID-mismatch fixture payload must differ from its file name/)
  assert.match(source, /Assert-NoReparsePointTraversal -Root \$ScenarioRoot -Target \$target/)
})

test("ValidateOnly invokes declared post-seeds without creating an output root", () => {
  const runner = fs.readFileSync(path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), "utf8")
  assert.match(runner, /if \(\$ValidateOnly\) \{[\s\S]*& \$seedPath -ValidateOnly[\s\S]*Manifest validation succeeded/)
  assert.match(runner, /if \(\$ValidateOnly\)[\s\S]*return[\s\S]*if \(-not \$OutputRoot\)/)
})

test("consistency invalid fixtures are isolated from active paths", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const scenario = manifest.scenarios.find((entry) => entry.id === "consistency-validation-errors")
  assert.equal(scenario.fixtureCopies.length, 5)
  const activePaths = new Set([
    "workspace/review-input.yaml",
    "workspace/.bob-review/bob-output/bob-output.yaml",
    "workspace/.bob-trace/ai-traceability-draft/ai-draft.json"
  ])
  const destinations = new Set()
  for (const copy of scenario.fixtureCopies) {
    assertSafeRelativePath(copy.source, "fixture source")
    assertSafeRelativePath(copy.destination, "fixture destination")
    assert.match(copy.destination, /^workspace\/test-data\/invalid\/[A-Za-z0-9._-]+$/)
    assert.equal(activePaths.has(copy.destination), false)
    assert.equal(fs.existsSync(path.join(repoRoot, copy.source)), true)
    assert.ok(scenario.expectedArtifacts.includes(copy.destination))
    destinations.add(copy.destination)
  }
  assert.equal(destinations.size, 5)
})

test("unknown-evidence output keeps the intended validation boundary", () => {
  const source = fs.readFileSync(path.join(toolRoot, "seeds", "consistency-validation-errors", "bob-output-unknown-evidence.yaml"), "utf8")
  assert.match(source, /schema_version:\s*1/)
  assert.match(source, /result_type:\s*pre_review/)
  assert.match(source, /final_approval:\s*not_performed/)
  assert.match(source, /scope_statement:/)
  assert.match(source, /evidence_id:\s*UNKNOWN-9999/)
  assert.match(source, /coverage_notes:/)
  assert.match(source, /rejected_or_uncertain:/)
})

test("invalid fixtures each target a distinct validation layer", () => {
  const root = path.join(toolRoot, "seeds", "consistency-validation-errors")
  assert.match(fs.readFileSync(path.join(root, "review-input-missing-required.yaml"), "utf8"), /review_focus:\s*\[\]/)
  assert.match(fs.readFileSync(path.join(root, "review-input-path-escape.yaml"), "utf8"), /path:\s*\.\.\/outside-requirements\.md/)
  const schemaError = fs.readFileSync(path.join(root, "bob-output-schema-error.yaml"), "utf8")
  assert.match(schemaError, /result_type:\s*final_review/)
  assert.doesNotMatch(schemaError, /scope_statement:/)
  const traceability = JSON.parse(fs.readFileSync(path.join(root, "traceability-draft-invalid-status.json"), "utf8"))
  assert.equal(traceability.domains[0].status, "accepted")
})

test("manifest validator enforces isolated unique fixture destinations", () => {
  const source = fs.readFileSync(path.join(toolRoot, "lib", "ScenarioFixtureValidation.ps1"), "utf8")
  assert.match(source, /Invalid fixture destination must remain isolated/)
  assert.match(source, /Invalid fixture destination must not be an active artifact path/)
  assert.match(source, /Invalid fixture destination must be listed in expectedArtifacts/)
  assert.match(source, /Invalid fixture destinations must be unique/)
  const runner = fs.readFileSync(path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), "utf8")
  assert.match(runner, /Assert-ScenarioFixtureCopies -RepoRoot \$RepoRoot -Manifest \$manifest/)
})
