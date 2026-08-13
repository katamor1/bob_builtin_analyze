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
const readJson = (...parts) => JSON.parse(read(...parts).replace(/^\uFEFF/, ""))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const psLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`
const specs = {
  BZR: read(repoRoot, "extensions", "bob-bazaar-review", "docs", "real-machine-test-spec-ja.md"),
  CCR: read(repoRoot, "extensions", "bob-code-consistency-review", "docs", "real-machine-test-spec-ja.md"),
  PRA: read(repoRoot, "extensions", "bob-bazaar-review", "docs", "project-rule-authoring-windows-uat.md")
}
const consistencyPackage = readJson(repoRoot, "extensions", "bob-code-consistency-review", "package.json")
const consistencyReviewWizardHtml = read(
  repoRoot,
  "extensions",
  "bob-code-consistency-review",
  "src",
  "webview",
  "consistencyReviewWizardHtml.ts"
)
const canonicalTestCaseHeadings = {
  "BZR-RT-004": "`.bob` workspace / workflow template 初期化",
  "BZR-RT-006": "Bazaar レビュー主GUI 起動",
  "BZR-RT-007": "GUI singleRevision target 読み込み",
  "BZR-RT-008": "GUI revisionRange target 読み込み",
  "BZR-RT-009": "GUI workingTreeSinceRevision target 読み込み",
  "BZR-RT-010": "GUI review packet 生成と Bob context 追加",
  "BZR-RT-017": "workflow collectReviewContext",
  "BZR-RT-018": "workflow loadReviewRules",
  "BZR-RT-019": "review-result capture: clipboard",
  "BZR-RT-020": "review-result capture: active editor",
  "BZR-RT-021": "review-result capture: workflow handoff",
  "BZR-RT-022": "invalid review-result capture",
  "BZR-RT-023": "active editor JSON validation OK",
  "BZR-RT-024": "active editor JSON validation error",
  "BZR-RT-025": "MCP initialize / tools/list",
  "BZR-RT-026": "MCP Bazaar tools",
  "BZR-RT-027": "MCP project rules tools",
  "BZR-RT-027A": "MCP allowed roots",
  "BZR-RT-028": "MCP review result tools",
  "BZR-RT-029": "multi-root `.bob` / `.bzr` 分離",
  "BZR-RT-030": "Shift-JIS / CP932 decode",
  "BZR-RT-034": "End-to-End: Bob Workflow UI 経由",
  "BZR-RT-035": "End-to-End: Command Palette 経由",
  "BZR-RT-044": "レビュー実行開始とartifact関連付け",
  "BZR-RT-045": "VS Code再起動後の再開",
  "BZR-RT-046": "decision別の指摘確認・振り分け validation",
  "BZR-RT-047": "Metricsの自動計測と補正",
  "CCR-RT-008": "review-input 診断説明",
  "CCR-RT-010": "トレーサビリティ整理 stage 起動",
  "CCR-RT-011": "トレーサビリティ整理の保存と gate report",
  "CCR-RT-011A": "トレーサビリティ整理の承認 UI と escaping",
  "CCR-RT-012": "traceability catalog 検証",
  "CCR-RT-013": "traceability AI draft prompt 生成",
  "CCR-RT-014": "traceability AI draft JSON 適用",
  "CCR-RT-015": "traceability catalog から review-input 生成",
  "CCR-RT-016": "Git preprocess",
  "CCR-RT-016A": "Git 複数言語 preprocess",
  "CCR-RT-019": "docx 文書抽出",
  "CCR-RT-020": "xlsx 文書抽出",
  "CCR-RT-021A": "汎用コード根拠 fallback",
  "CCR-RT-022": "review-package 内容確認",
  "CCR-RT-023": "Bob Workflow UI から preprocess 実行",
  "CCR-RT-024": "Bob へ bob-input.md を投入する",
  "CCR-RT-025": "Bob output capture: clipboard",
  "CCR-RT-026": "Bob output capture: workflow handoff",
  "CCR-RT-027": "Bob output validation OK",
  "CCR-RT-028": "Bob output validation error",
  "CCR-RT-029": "指摘確認・振り分け成果物の生成",
  "CCR-RT-030": "End-to-End: Command Palette 経由",
  "CCR-RT-031": "End-to-End: Bob Workflow UI 経由",
  "CCR-RT-034": "path escape 防止",
  "PRA-WIN-001": "標準 DOCX / XLSX / text PDF"
}

function assertSafeRelativePath(value, label) {
  assert.equal(path.isAbsolute(value), false, `${label} must be relative`)
  assert.equal(value.split(/[\\/]+/).includes(".."), false, `${label} must not escape with ..`)
}

function assertFunctionNames(source, names) {
  for (const name of names) assert.match(source, new RegExp(`function ${name}`))
}

function readMarkdownSection(source, headingPattern) {
  const heading = source.match(new RegExp(`^#{2,4}\\s+${headingPattern}.*$`, "m"))
  assert.ok(heading, `missing Markdown heading: ${headingPattern}`)
  const tail = source.slice(heading.index)
  const nextHeading = tail.slice(heading[0].length).search(/\n#{2,4}\s+/)
  return nextHeading < 0 ? tail : tail.slice(0, heading[0].length + nextHeading)
}

test("manifest defines the approved six P0 + P1 scenarios", () => {
  const manifest = readJson(manifestPath)
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
      const family = testCaseId.startsWith("BZR-")
        ? "BZR"
        : testCaseId.startsWith("CCR-")
          ? "CCR"
          : "PRA"
      assert.match(specs[family], new RegExp(`^#{3,4}\\s+${escapeRegExp(testCaseId)}(?:\\s|$)`, "m"))
    }
  }
})

test("manifest test cases retain their canonical pre-consolidation meanings", () => {
  const manifest = readJson(manifestPath)
  const referencedIds = [...new Set(manifest.scenarios
    .flatMap(({ testCases }) => testCases)
    .filter((testCaseId) => /^(?:(?:BZR|CCR)-RT-|PRA-WIN-)/.test(testCaseId)))]
    .sort()
  assert.deepEqual(Object.keys(canonicalTestCaseHeadings).sort(), referencedIds)

  for (const testCaseId of referencedIds) {
    const family = testCaseId.startsWith("BZR-")
      ? "BZR"
      : testCaseId.startsWith("CCR-")
        ? "CCR"
        : "PRA"
    const headings = [...specs[family].matchAll(
      new RegExp(`^#{3,4}\\s+${escapeRegExp(testCaseId)}\\s+(.+?)\\s*$`, "gm")
    )]
    assert.equal(headings.length, 1, `${testCaseId} must have exactly one canonical definition`)
    assert.equal(
      headings[0][1],
      canonicalTestCaseHeadings[testCaseId],
      `${testCaseId} must retain its canonical scenario meaning`
    )
  }
})

test("code-consistency UAT uses the production stage inventory and explicit hidden-command routes", () => {
  const commandsById = Object.fromEntries(consistencyPackage.contributes.commands
    .map(({ command, category, title }) => [command, `${category}: ${title}`]))
  const paletteEntries = consistencyPackage.contributes.menus.commandPalette
  const publicCommandIds = paletteEntries
    .filter(({ when }) => when !== "false")
    .map(({ command }) => command)
  assert.deepEqual(publicCommandIds, ["bobCodeConsistency.openReviewWizard"])
  const publicDisplayName = commandsById[publicCommandIds[0]]

  const mainGuiRoutes = {
    "CCR-RT-005": ["レビュー準備", "選択内容から review-input を作成"],
    "CCR-RT-012": ["トレーサビリティ整理", "トレーサビリティを検証"],
    "CCR-RT-015": ["トレーサビリティ整理", "トレーサビリティから review-input を作成"],
    "CCR-RT-016": ["レビュー準備", "Bob に渡すレビュー資料を作成"],
    "CCR-RT-028": ["レビュー結果取り込み", "保存済みの Bob 出力を検証"]
  }
  for (const [testCaseId, routeLabels] of Object.entries(mainGuiRoutes)) {
    const testCase = readMarkdownSection(specs.CCR, escapeRegExp(testCaseId))
    assert.ok(testCase.includes(publicDisplayName), `${testCaseId} must enter through the public primary GUI command`)
    for (const label of routeLabels) {
      assert.ok(testCase.includes(label), `${testCaseId} must route through the primary GUI action: ${label}`)
    }
  }

  const hiddenTechnicalRoutes = {
    "CCR-RT-006": "bobCodeConsistency.prepareAiReviewInputDraft",
    "CCR-RT-007": "bobCodeConsistency.applyAiReviewInputDraft",
    "CCR-RT-009": "bobCodeConsistency.repairReviewInput",
    "CCR-RT-013": "bobCodeConsistency.prepareAiTraceabilityDraft",
    "CCR-RT-014": "bobCodeConsistency.applyAiTraceabilityDraft"
  }
  for (const [testCaseId, commandId] of Object.entries(hiddenTechnicalRoutes)) {
    const testCase = readMarkdownSection(specs.CCR, escapeRegExp(testCaseId))
    assert.equal(
      paletteEntries.find(({ command }) => command === commandId)?.when,
      "false",
      `${commandId} must remain hidden from the Command Palette`
    )
    assert.ok(
      testCase.includes(`vscode.commands.executeCommand("${commandId}")`),
      `${testCaseId} must identify its hidden technical command by ID`
    )
    assert.match(testCase, /技術確認/)
  }

  for (const [, displayName] of specs.CCR.matchAll(
    /`(Bob (?:Code Consistency Review|コード整合プレレビュー): [^`]+)`/g
  )) assert.equal(displayName, publicDisplayName, `operator steps must not advertise a hidden command: ${displayName}`)

  const productionStages = [...consistencyReviewWizardHtml.matchAll(
    /<button\b[^>]*data-stage="[^"]+"[^>]*>([^<]+)<\/button>/g
  )].map(([, label]) => label)
  assert.deepEqual(productionStages, [
    "レビュー準備",
    "トレーサビリティ整理",
    "レビュー結果取り込み",
    "指摘確認・振り分け"
  ])
  const stageSection = readMarkdownSection(specs.CCR, "CCR-EH-004")
  const documentedStages = stageSection.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  assert.deepEqual(documentedStages, productionStages)
  assert.match(stageSection, /レビュー準備[^\n]*input[^\n]*evidence[^\n]*preprocess[^\n]*package preview/i)
})

test("operator template and checklists never pre-pass manual UAT", () => {
  assert.deepEqual(readJson(toolRoot, "templates", "operator-result.template.json"), {
    schemaVersion: 1, scenarioId: "", operator: "", startedAt: null, completedAt: null, results: []
  })
  const tokens = [
    "SCENARIO_ID", "SCENARIO_ROOT", "WORKSPACE_PATH", "BOB_ROOT", "VCS_ROOT",
    "REVIEW_TARGET", "LAUNCH_COMMAND", "TEST_CASES", "EXPECTED_ARTIFACTS"
  ]
  for (const scenario of readJson(manifestPath).scenarios) {
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
  assert.match(runner, /New-Item -ItemType Directory -Force -Path \$outputFull/)
  assert.match(manifest, /p0-p1 must list every scenario exactly once in manifest order/)
  assert.match(manifest, /if \(\$fullPath -eq \$pathRoot\) \{ return \$fullPath \}/)
  assert.doesNotMatch(runner + manifest, /Invoke-Expression/)
})

test("execution and evidence modules enforce safe, non-secret generation", () => {
  const execution = read(toolRoot, "lib", "ScenarioExecution.ps1")
  const evidence = read(toolRoot, "lib", "RunEvidence.ps1")
  assertFunctionNames(execution, [
    "Assert-NoReparsePointTraversal", "Get-NearestExistingAncestor", "Assert-SafeOutputRoot",
    "Get-ScenarioPrerequisiteReport", "New-LauncherInvocation", "Invoke-ScenarioLauncher",
    "Copy-ScenarioFixtureFiles", "Test-ExpectedScenarioArtifacts", "Get-ScenarioLaunchDescriptor"
  ])
  assertFunctionNames(evidence, [
    "Write-JsonUtf8", "Get-ToolVersionSnapshot", "Get-RepositorySnapshot", "New-OperatorResult",
    "Expand-ChecklistTemplate", "Write-ScenarioEvidence", "Write-RunEvidence"
  ])
  assert.match(execution, /FileAttributes\]::ReparsePoint/)
  assert.match(execution, /NoLaunch\s*=\s*\$true/)
  assert.match(execution, /\$arguments = \$Invocation\.arguments\s+& \$Invocation\.launcherPath @arguments/s)
  assert.match(execution, /Get-NearestExistingAncestor \$parent/)
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

test("missing VS Code CLI becomes blocked evidence under a new nested output root on Windows", {
  skip: process.platform !== "win32"
}, () => {
  const testRoot = path.join(os.homedir(), `bob-review-real-machine-${process.pid}-${Date.now()}`)
  const outputRoot = path.join(testRoot, "missing-parent", "nested", "run")
  try {
    const result = childProcess.spawnSync("pwsh", [
      "-NoProfile", "-File", path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"),
      "-Scenario", "consistency-ai-matrix", "-OutputRoot", outputRoot,
      "-CodeCommand", "__missing_bob_code_command__"
    ], { cwd: repoRoot, encoding: "utf8" })
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    const run = readJson(outputRoot, "run-manifest.json")
    assert.equal(run.scenarios[0].status, "blocked")
    assert.deepEqual(run.scenarios[0].missingCommands, ["__missing_bob_code_command__"])
    const operator = readJson(outputRoot, "consistency-ai-matrix", "operator-result.json")
    assert.ok(operator.results.length > 0)
    assert.ok(operator.results.every(({ status }) => status === "not_run"))
    assert.equal(run.scenarios[0].launchTarget, null)
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true })
  }
})

test("scenario launcher splats NoLaunch and captures output on Windows", {
  skip: process.platform !== "win32"
}, () => {
  const testRoot = path.join(os.homedir(), `bob-review-launcher-${process.pid}-${Date.now()}`)
  const launcherPath = path.join(testRoot, "fake-launcher.ps1")
  const logPath = path.join(testRoot, "logs", "launcher.log")
  const markerPath = path.join(testRoot, "marker.json")
  try {
    fs.mkdirSync(testRoot, { recursive: true })
    fs.writeFileSync(launcherPath, [
      "param([string]$RepoRoot, [string]$SandboxRoot, [string]$CodeCommand, [switch]$NoLaunch, [string]$Sample)",
      "[ordered]@{ repoRoot = $RepoRoot; sandboxRoot = $SandboxRoot; codeCommand = $CodeCommand; noLaunch = [bool]$NoLaunch; sample = $Sample } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $SandboxRoot 'marker.json') -Encoding utf8NoBOM",
      "Write-Output 'fake-launcher-ok'"
    ].join("\n"), "utf8")
    const command = [
      `. ${psLiteral(path.join(toolRoot, "lib", "ScenarioExecution.ps1"))}`,
      `$invocation = [pscustomobject]@{ launcherPath = ${psLiteral(launcherPath)}; arguments = [ordered]@{ RepoRoot = 'repo'; SandboxRoot = ${psLiteral(testRoot)}; CodeCommand = 'code'; NoLaunch = $true; Sample = 'ai-verification-matrix' } }`,
      `$result = Invoke-ScenarioLauncher -Invocation $invocation -LogPath ${psLiteral(logPath)}`,
      "if (-not $result.succeeded) { throw $result.error }"
    ].join("; ")
    const result = childProcess.spawnSync("pwsh", ["-NoProfile", "-Command", command], {
      cwd: repoRoot,
      encoding: "utf8"
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const marker = readJson(markerPath)
    assert.equal(marker.noLaunch, true)
    assert.equal(marker.sample, "ai-verification-matrix")
    assert.equal(marker.sandboxRoot, testRoot)
    assert.match(read(logPath), /fake-launcher-ok/)
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true })
  }
})

test("Bazaar recovery seed preserves phase/artifact invariants and isolation", () => {
  const manifest = readJson(manifestPath)
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
  const scenario = readJson(manifestPath).scenarios.find(({ id }) => id === "consistency-validation-errors")
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
  assert.equal(readJson(root, "traceability-draft-invalid-status.json").domains[0].status, "accepted")
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
  assert.match(
    workflow,
    /node --test scripts\/real-machine-test-environment\.test\.js scripts\/real-machine-input-document-fixtures\.test\.js/
  )
  assert.match(workflow, /Invoke-BobReviewTestEnvironment\.ps1 -ValidateOnly/)
  const job = workflow.split("  real-machine-environment-contracts:")[1].split("  extension-metrics:")[0]
  assert.doesNotMatch(job, /npm (?:ci|install)|npm\.cmd run package|vscode-test|\bbzr\b|IBM Bob/i)
})


test("only the approved scenarios opt into fixed document profiles", () => {
  const manifest = readJson(manifestPath)
  const mapped = manifest.scenarios
    .filter((scenario) => Object.hasOwn(scenario, "documentFixtureProfile"))
    .map(({ id, documentFixtureProfile }) => [id, documentFixtureProfile])
  assert.deepEqual(mapped, [
    ["bazaar-core", "bazaar-core"],
    ["consistency-ai-matrix", "consistency-ai-matrix"]
  ])

  const bazaar = manifest.scenarios.find(({ id }) => id === "bazaar-core")
  assert.ok(bazaar.testCases.includes("PRA-WIN-001"))
  for (const artifact of [
    "input-documents/project-review-rules.docx",
    "input-documents/review-traceability-ledger.xlsx",
    "input-documents/system-review-guidelines.pdf",
    "input-documents/document-fixture-manifest.json",
    "input-documents/EXPECTED_DOCUMENT_INPUTS.md"
  ]) assert.ok(bazaar.expectedArtifacts.includes(artifact))

  const consistency = manifest.scenarios.find(({ id }) => id === "consistency-ai-matrix")
  assert.ok(consistency.testCases.includes("CCR-RT-019"))
  assert.ok(consistency.testCases.includes("CCR-RT-020"))
  for (const artifact of [
    "workspace/docs/input-documents/requirements-and-design.docx",
    "workspace/docs/input-documents/verification-matrix.xlsx",
    "workspace/docs/input-documents/supplemental-reference.pdf",
    "workspace/docs/input-documents/document-fixture-manifest.json",
    "workspace/docs/input-documents/EXPECTED_DOCUMENT_EXTRACTION.md"
  ]) assert.ok(consistency.expectedArtifacts.includes(artifact))
})

test("runner controls document generation and validates profiles without writes", () => {
  const manifestModule = read(toolRoot, "lib", "ScenarioManifest.ps1")
  const execution = read(toolRoot, "lib", "ScenarioExecution.ps1")
  const runner = read(toolRoot, "Invoke-BobReviewTestEnvironment.ps1")

  assert.match(manifestModule, /documentFixtureProfile/)
  assert.match(manifestModule, /project-rule-authoring-windows-uat\.md/)
  assert.match(execution, /function Invoke-DocumentFixtureProfileValidation/)
  assert.match(execution, /IncludeDocumentFixtures\s*=\s*\$true/)
  assert.match(execution, /"--validate-only"/)
  assert.match(runner, /Invoke-DocumentFixtureProfileValidation/)
  assert.doesNotMatch(JSON.stringify(readJson(manifestPath)), /IncludeDocumentFixtures/)
})

test("operator docs describe document inputs and the optional Poppler boundary", () => {
  const bazaarChecklist = read(toolRoot, "checklists", "bazaar-core.md")
  for (const pattern of [
    /input-documents/,
    /bobBazaar\.authorProjectRulesFromDocuments/,
    /project-review-rules\.docx/,
    /review-traceability-ledger\.xlsx/,
    /system-review-guidelines\.pdf/,
    /PRA-WIN-001/,
    /Poppler unavailable/,
    /blocked/,
    /bob-managed/,
    /bazaar-source/
  ]) assert.match(bazaarChecklist, pattern)

  const consistencyChecklist = read(toolRoot, "checklists", "consistency-ai-matrix.md")
  for (const pattern of [
    /requirements-and-design\.docx/,
    /verification-matrix\.xlsx/,
    /supplemental-reference\.pdf/,
    /REQ-DOC-001/,
    /REQ-DOC-002/,
    /BD-DOC-001/,
    /TC-DOC-001/,
    /TC-DOC-002/,
    /document-index\.json/,
    /document-excerpts\.md/
  ]) assert.match(consistencyChecklist, pattern)
  assert.match(consistencyChecklist, /PDF.*参照.*しない|参照対象外/)

  const readme = read(toolRoot, "README-ja.md")
  assert.match(readme, /文書fixture/)
  assert.match(readme, /pdftotext/)
  assert.match(readme, /PRA-WIN-001/)
  assert.match(readme, /not_run/)
})
