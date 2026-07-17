const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const toolRoot = path.join(repoRoot, "tools", "real-machine-test-environment")
const manifestPath = path.join(toolRoot, "scenarios.json")
const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8")
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const specs = {
  BZR: read(repoRoot, "extensions", "bob-bazaar-review", "docs", "real-machine-test-spec-ja.md"),
  CCR: read(repoRoot, "extensions", "bob-code-consistency-review", "docs", "real-machine-test-spec-ja.md")
}

function assertSafeRelativePath(value, label) {
  assert.equal(path.isAbsolute(value), false, `${label} must be relative`)
  assert.equal(value.split(/[\\/]+/).includes(".."), false, `${label} must not escape with ..`)
}

function assertFunctionNames(source, names) {
  for (const name of names) assert.match(source, new RegExp(`function ${name}`))
}

test("manifest defines the approved six P0 + P1 scenarios", () => {
  const manifest = JSON.parse(read(manifestPath))
  const expectedIds = [
    "bazaar-core", "bazaar-run-recovery", "consistency-ai-matrix",
    "consistency-traceability", "consistency-multilang", "consistency-validation-errors"
  ]
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(manifest.groups["p0-p1"], expectedIds)
  assert.deepEqual(manifest.scenarios.map(({ id }) => id), expectedIds)
  for (const scenario of manifest.scenarios) {
    assert.match(scenario.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.equal(scenario.generator.kind, "existing-launcher")
    for (const [label, value] of [
      ["generator", scenario.generator.path], ["checklist", scenario.checklistTemplate],
      ...scenario.requiredRepositoryPaths.map((entry) => ["required path", entry]),
      ...scenario.expectedArtifacts.map((entry) => ["artifact", entry])
    ]) assertSafeRelativePath(value, `${scenario.id} ${label}`)
    assert.equal(fs.existsSync(path.join(repoRoot, scenario.generator.path)), true)
    assert.equal(fs.existsSync(path.join(repoRoot, scenario.checklistTemplate)), true)
    for (const testCaseId of scenario.testCases) {
      const family = testCaseId.startsWith("BZR-") ? "BZR" : "CCR"
      assert.match(specs[family], new RegExp(`^#{3,4}\\s+${escapeRegExp(testCaseId)}(?:\\s|$)`, "m"))
    }
  }
})

test("operator template and checklists never pre-pass manual UAT", () => {
  assert.deepEqual(JSON.parse(read(toolRoot, "templates", "operator-result.template.json")), {
    schemaVersion: 1, scenarioId: "", operator: "", startedAt: null, completedAt: null, results: []
  })
  const tokens = [
    "SCENARIO_ID", "SCENARIO_ROOT", "WORKSPACE_PATH", "BOB_ROOT", "VCS_ROOT",
    "REVIEW_TARGET", "LAUNCH_COMMAND", "TEST_CASES", "EXPECTED_ARTIFACTS"
  ]
  for (const scenario of JSON.parse(read(manifestPath)).scenarios) {
    const checklist = read(repoRoot, scenario.checklistTemplate)
    for (const token of tokens) assert.match(checklist, new RegExp(`\\{\\{${token}\\}\\}`))
    assert.match(checklist, /not_run/)
  }
})

test("manifest validation and runner expose only approved interfaces", () => {
  const runner = read(toolRoot, "Invoke-BobReviewTestEnvironment.ps1")
  const manifest = read(toolRoot, "lib", "ScenarioManifest.ps1")
  assertFunctionNames(manifest, [
    "Read-ScenarioManifest", "Assert-ScenarioManifest", "Resolve-ScenarioSelection",
    "Assert-RepositoryRelativePath", "Assert-ScenarioRelativePath", "Test-PathInsideRoot"
  ])
  assert.match(runner, /\[switch\]\$ValidateOnly/)
  assert.match(runner, /\[switch\]\$Open/)
  assert.match(runner, /\[string\]\$OpenScenario/)
  assert.match(runner, /\$selected = @\(Resolve-ScenarioSelection/)
  assert.match(runner, /Manifest validation succeeded/)
  assert.match(manifest, /p0-p1 must list every scenario exactly once in manifest order/)
  assert.match(manifest, /if \(\$fullPath -eq \$pathRoot\) \{ return \$fullPath \}/)
  assert.doesNotMatch(runner + manifest, /Invoke-Expression/)
})

test("execution and evidence modules enforce safe, non-secret generation", () => {
  const execution = read(toolRoot, "lib", "ScenarioExecution.ps1")
  const evidence = read(toolRoot, "lib", "RunEvidence.ps1")
  assertFunctionNames(execution, [
    "Assert-NoReparsePointTraversal", "Assert-SafeOutputRoot", "Get-ScenarioPrerequisiteReport",
    "New-LauncherInvocation", "Invoke-ScenarioLauncher", "Copy-ScenarioFixtureFiles",
    "Test-ExpectedScenarioArtifacts", "Get-ScenarioLaunchDescriptor"
  ])
  assertFunctionNames(evidence, [
    "Write-JsonUtf8", "Get-ToolVersionSnapshot", "Get-RepositorySnapshot", "New-OperatorResult",
    "Expand-ChecklistTemplate", "Write-ScenarioEvidence", "Write-RunEvidence"
  ])
  assert.match(execution, /FileAttributes\]::ReparsePoint/)
  assert.match(execution, /NoLaunch\s*=\s*\$true/)
  assert.match(execution, /\$arguments = \$Invocation\.arguments\s+& \$Invocation\.launcherPath @arguments/s)
  assert.doesNotMatch(execution, /SkipExtensionInstall\s*=/)
  assert.match(evidence, /status = "not_run"/)
  assert.match(evidence, /\[System\.Collections\.IDictionary\]\$ScenarioRecord/)
  assert.match(evidence, /environment-versions\.json/)
  assert.match(evidence, /run-manifest\.json/)
  assert.match(evidence, /run-summary\.md/)
  assert.doesNotMatch(evidence, /Get-ChildItem\s+Env:/i)
})

test("runner isolates scenario failures and opens only one ready target", () => {
  const runner = read(toolRoot, "Invoke-BobReviewTestEnvironment.ps1")
  for (const status of ["not_started", "blocked", "failed", "ready"]) assert.match(runner, new RegExp(`"${status}"`))
  assert.match(runner, /foreach \(\$selectedScenario in \$selected\)/)
  assert.match(runner, /try \{\s*Write-ScenarioEvidence/s)
  assert.match(runner, /Cannot open non-ready scenario/)
  assert.match(runner, /if \(\$blockedCount -gt 0 -or \$failedCount -gt 0\) \{ exit 1 \}/)
})

test("missing VS Code CLI becomes blocked evidence on Windows", {
  skip: process.platform !== "win32" || process.env.RUN_REAL_MACHINE_WINDOWS_PROCESS_TEST !== "1"
}, () => {
  const outputRoot = path.join(os.homedir(), `bob-review-real-machine-${process.pid}-${Date.now()}`)
  try {
    const result = childProcess.spawnSync("pwsh", [
      "-NoProfile", "-File", path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"),
      "-Scenario", "consistency-ai-matrix", "-OutputRoot", outputRoot,
      "-CodeCommand", "__missing_bob_code_command__"
    ], { cwd: repoRoot, encoding: "utf8" })
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    const run = JSON.parse(read(outputRoot, "run-manifest.json"))
    assert.equal(run.scenarios[0].status, "blocked")
    assert.deepEqual(run.scenarios[0].missingCommands, ["__missing_bob_code_command__"])
    const operator = JSON.parse(read(outputRoot, "consistency-ai-matrix", "operator-result.json"))
    assert.ok(operator.results.length > 0)
    assert.ok(operator.results.every(({ status }) => status === "not_run"))
    assert.equal(run.scenarios[0].launchTarget, null)
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true })
  }
})

test("Bazaar recovery seed preserves phase/artifact invariants and isolation", () => {
  const manifest = JSON.parse(read(manifestPath))
  const scenario = manifest.scenarios.find(({ id }) => id === "bazaar-run-recovery")
  assert.equal(scenario.postSeed, "tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1")
  const seed = read(repoRoot, scenario.postSeed)
  assertFunctionNames(seed, ["New-BazaarRecoverySeedPlan", "Assert-BazaarRecoverySeedPlan", "Write-BazaarRecoverySeedPlan"])
  for (const text of [
    "Exactly three valid recovery review runs are required", "Exactly one malformed run is required",
    "Exactly two invalid review results are required", "Bazaar recovery seed paths must be unique",
    "Malformed Review Run must not parse as JSON", "Invalid review result must remain isolated",
    "Schema-error fixture must omit summary", "ID-mismatch fixture payload must differ from its file name"
  ]) assert.match(seed, new RegExp(escapeRegExp(text)))
  for (const artifact of ["reviewPacketPath", "reviewResultJsonPath", "reviewResultMarkdownPath", "triageYamlPath"]) {
    assert.match(seed, new RegExp(artifact))
  }
  assert.match(seed, /throw "\$fieldName is required for completed \$phaseName phase"/)
  assert.match(seed, /Assert-NoReparsePointTraversal -Root \$ScenarioRoot -Target \$target/)
  assert.match(read(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), /& \$seedPath -ValidateOnly/)
})

test("code-consistency invalid fixtures target five distinct isolated failures", () => {
  const scenario = JSON.parse(read(manifestPath)).scenarios.find(({ id }) => id === "consistency-validation-errors")
  assert.equal(scenario.fixtureCopies.length, 5)
  const active = new Set([
    "workspace/review-input.yaml", "workspace/.bob-review/bob-output/bob-output.yaml",
    "workspace/.bob-trace/ai-traceability-draft/ai-draft.json"
  ])
  const destinations = new Set()
  for (const copy of scenario.fixtureCopies) {
    assertSafeRelativePath(copy.source, "fixture source")
    assertSafeRelativePath(copy.destination, "fixture destination")
    assert.match(copy.destination, /^workspace\/test-data\/invalid\/[A-Za-z0-9._-]+$/)
    assert.equal(active.has(copy.destination), false)
    assert.equal(fs.existsSync(path.join(repoRoot, copy.source)), true)
    assert.ok(scenario.expectedArtifacts.includes(copy.destination))
    destinations.add(copy.destination)
  }
  assert.equal(destinations.size, 5)
  const root = path.join(toolRoot, "seeds", "consistency-validation-errors")
  assert.match(read(root, "review-input-missing-required.yaml"), /review_focus:\s*\[\]/)
  assert.match(read(root, "review-input-path-escape.yaml"), /path:\s*\.\.\/outside-requirements\.md/)
  const schemaError = read(root, "bob-output-schema-error.yaml")
  assert.match(schemaError, /result_type:\s*final_review/)
  assert.doesNotMatch(schemaError, /scope_statement:/)
  const unknown = read(root, "bob-output-unknown-evidence.yaml")
  assert.match(unknown, /result_type:\s*pre_review/)
  assert.match(unknown, /final_approval:\s*not_performed/)
  assert.match(unknown, /evidence_id:\s*UNKNOWN-9999/)
  assert.equal(JSON.parse(read(root, "traceability-draft-invalid-status.json")).domains[0].status, "accepted")
  const validator = read(toolRoot, "lib", "ScenarioFixtureValidation.ps1")
  for (const text of [
    "Invalid fixture destination must remain isolated", "Invalid fixture destination must not be an active artifact path",
    "Invalid fixture destination must be listed in expectedArtifacts", "Invalid fixture destinations must be unique"
  ]) assert.match(validator, new RegExp(escapeRegExp(text)))
})

test("README and Windows CI document and validate the safe workflow", () => {
  const readme = read(toolRoot, "README-ja.md")
  for (const pattern of [
    /npm\.cmd run package/, /-ValidateOnly/, /-Scenario all/, /-OpenScenario bazaar-run-recovery/,
    /operator-result\.json/, /Remove-Item .* -Recurse -Force/
  ]) assert.match(readme, pattern)
  const workflow = read(repoRoot, ".github", "workflows", "extensions-quality.yml")
  for (const watchedPath of [
    "tools/real-machine-test-environment/**", "docs/workflows/bazaar-project-rule-review/integration/**",
    "docs/workflows/code-consistency-review/integration/**", "docs/workflows/code-consistency-review/examples/**",
    "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md",
    "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  ]) assert.equal((workflow.match(new RegExp(escapeRegExp(watchedPath), "g")) ?? []).length, 2)
  assert.match(workflow, /real-machine-environment-contracts:/)
  assert.match(workflow, /runs-on:\s*windows-latest/)
  assert.match(workflow, /node --test scripts\/real-machine-test-environment\.test\.js/)
  assert.match(workflow, /Invoke-BobReviewTestEnvironment\.ps1 -ValidateOnly/)
  const job = workflow.split("  real-machine-environment-contracts:")[1].split("  extension-metrics:")[0]
  assert.doesNotMatch(job, /npm (?:ci|install)|npm\.cmd run package|vscode-test|\bbzr\b|IBM Bob/i)
})
