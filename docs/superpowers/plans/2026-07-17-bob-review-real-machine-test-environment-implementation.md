# Bob Review Real-Machine Test Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bob-bazaar-review` と `bob-code-consistency-review` の P0 + P1 実機テスト用データ環境を、既存 sandbox launcher と fixture を再利用して 1 コマンドで再現可能に生成する。

**Architecture:** Repository-level の PowerShell runner が宣言的な `scenarios.json` を検証し、既存 Bazaar / code-consistency launcher を必ず `-NoLaunch` で呼び出す。Manifest validation、execution、evidence、scenario-specific seed を小さな module に分け、Bazaar Review Run の中断・再開データと code-consistency の異常系 fixture だけを追加する。Extension runtime、command ID、workflow provider、既存 launcher の repository 生成処理は変更しない。

**Tech Stack:** PowerShell 7、Node.js 22 built-in test runner、JSON、YAML fixture、Git / Bazaar CLI、VS Code CLI、GitHub Actions Windows runner。

## Global Constraints

- Approved design `docs/superpowers/specs/2026-07-17-bob-review-real-machine-test-environment-design.md` を実装の正本とする。
- 初版の対象は `bazaar-core`、`bazaar-run-recovery`、`consistency-ai-matrix`、`consistency-traceability`、`consistency-multilang`、`consistency-validation-errors` の 6 scenario とする。
- 既存 `docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1` と `docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1` の Git / Bazaar repository 生成処理を再実装しない。
- 共通 runner は既存 launcher を常に `NoLaunch = $true` で呼び出す。複数 scenario 生成時に複数の VS Code window を自動起動しない。
- GUI を起動する場合は `-Open` または `-OpenScenario` で明示した 1 scenario だけを開く。
- Scenario は最初から final path に生成する。Bazaar workspace 内の absolute path を壊すため、`.partial` directory から完成名への rename を行わない。
- `OutputRoot` は repository 配下、既存 path、symlink / junction を経由して repository 配下へ解決される path を拒否する。初版では `-Force`、update、overwrite、reuse を提供しない。
- 1 scenario の失敗で独立した残り scenario を止めない。不足前提は `blocked`、生成異常は `failed` として記録し、1 件でも `blocked` または `failed` があれば process exit code を非 0 にする。
- Manifest から arbitrary executable、shell command、script body を指定できる設計にしない。許可する launcher は既存 2 file だけとし、`Invoke-Expression` を使用しない。
- `RepoRoot`、`SandboxRoot`、`CodeCommand`、`BzrCommand`、`NoLaunch = $true` は runner が注入し、manifest から上書きできない。`SkipExtensionInstall` は共通 runner から渡さない。
- Repository-relative source path と scenario-relative destination path を分離し、absolute path、`..` escape、symlink / junction escape を拒否する。
- Invalid fixture は active artifact path に自動配置しない。`test-data/invalid` 配下から operator が明示的に clipboard、editor、または一時コピーで利用する。
- Generator は実機テスト結果を自動で `pass` にしない。`operator-result.json` の初期 status はすべて `not_run` とする。
- Environment variable dictionary、token、credential、clipboard contents を log または manifest に保存しない。
- IBM Bob への自動 prompt 投入、AI output の semantic 自動採点、Webview automation、screenshot 自動取得、CLI / VSIX 自動 install は行わない。
- `bob-bazaar-review`、`bob-code-consistency-review`、`workflow-register` の runtime dependency、command ID、workflow provider ID、VSIX version を変更しない。
- Production code の前に focused contract test を追加し、RED を確認してから最小実装を行う。

## File Map

| Path | Responsibility |
| --- | --- |
| `tools/real-machine-test-environment/scenarios.json` | 6 scenario、generator、prerequisite、testcase、artifact、post-seed / fixture copy の source of truth |
| `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1` | CLI entrypoint、selection、validation、generation loop、single-window launch、exit code |
| `tools/real-machine-test-environment/lib/ScenarioManifest.ps1` | Manifest parse、launcher allowlist、path / group / testcase validation |
| `tools/real-machine-test-environment/lib/ScenarioExecution.ps1` | Prerequisite probe、reparse-point-safe path validation、launcher execution、fixture copy、artifact verification |
| `tools/real-machine-test-environment/lib/RunEvidence.ps1` | Repository / tool snapshot、run / scenario manifest、summary、checklist、operator result |
| `tools/real-machine-test-environment/checklists/*.md` | Scenario-specific operator instructions |
| `tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1` | Deterministic Review Run recovery plan、artifact invariant validation、invalid Bazaar result fixture |
| `tools/real-machine-test-environment/seeds/consistency-validation-errors/*` | Isolated invalid code-consistency inputs and outputs |
| `tools/real-machine-test-environment/templates/operator-result.template.json` | Operator result fixed shape |
| `tools/real-machine-test-environment/README-ja.md` | Package、validate、generate、open、record、cleanup runbook |
| `scripts/real-machine-test-environment.test.js` | Repository-level static and focused process contracts |
| `.github/workflows/extensions-quality.yml` | Relevant path filters and Windows validation job |
| `docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md` | Actual implementation verification evidence generated from command results |

---

### Task 1: Define the six scenarios, checklist templates, and baseline contract tests

**Files:**

- Create: `tools/real-machine-test-environment/scenarios.json`
- Create: `tools/real-machine-test-environment/templates/operator-result.template.json`
- Create: `tools/real-machine-test-environment/checklists/bazaar-core.md`
- Create: `tools/real-machine-test-environment/checklists/bazaar-run-recovery.md`
- Create: `tools/real-machine-test-environment/checklists/consistency-ai-matrix.md`
- Create: `tools/real-machine-test-environment/checklists/consistency-traceability.md`
- Create: `tools/real-machine-test-environment/checklists/consistency-multilang.md`
- Create: `tools/real-machine-test-environment/checklists/consistency-validation-errors.md`
- Create: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- Produce manifest schema version `1` and group `p0-p1` with the approved six IDs in execution order.
- Produce scenario fields `id`, `extension`, `priorities`, `generator`, `requiredCommands`, `requiredRepositoryPaths`, `checklistTemplate`, `testCases`, `expectedArtifacts`.
- Later tasks add optional `postSeed` and `fixtureCopies` without changing the base shape.
- Checklist tokens are `SCENARIO_ID`, `SCENARIO_ROOT`, `WORKSPACE_PATH`, `BOB_ROOT`, `VCS_ROOT`, `REVIEW_TARGET`, `LAUNCH_COMMAND`, `TEST_CASES`, `EXPECTED_ARTIFACTS`.
- Operator result fields are `schemaVersion`, `scenarioId`, `operator`, `startedAt`, `completedAt`, and `results`.

- [ ] **Step 1: Write the failing manifest contract test**

Create `scripts/real-machine-test-environment.test.js`:

```js
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
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL with `ENOENT` for `tools/real-machine-test-environment/scenarios.json`.

- [ ] **Step 3: Create `scenarios.json` with the final base entries**

Use this complete manifest; `postSeed` and `fixtureCopies` are added in Tasks 5 and 6:

```json
{
  "schemaVersion": 1,
  "groups": {
    "p0-p1": [
      "bazaar-core",
      "bazaar-run-recovery",
      "consistency-ai-matrix",
      "consistency-traceability",
      "consistency-multilang",
      "consistency-validation-errors"
    ]
  },
  "scenarios": [
    {
      "id": "bazaar-core",
      "extension": "bob-bazaar-review",
      "priorities": ["P0", "P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1",
        "arguments": {}
      },
      "requiredCommands": ["code", "node", "bzr"],
      "requiredRepositoryPaths": [
        "bob2/bob-code",
        "extensions/workflow-register/workflow-register-0.1.0.vsix",
        "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix"
      ],
      "checklistTemplate": "tools/real-machine-test-environment/checklists/bazaar-core.md",
      "testCases": [
        "BZR-RT-004", "BZR-RT-006", "BZR-RT-007", "BZR-RT-008", "BZR-RT-009", "BZR-RT-010",
        "BZR-RT-017", "BZR-RT-018", "BZR-RT-019", "BZR-RT-020", "BZR-RT-021", "BZR-RT-022",
        "BZR-RT-023", "BZR-RT-024", "BZR-RT-025", "BZR-RT-026", "BZR-RT-027", "BZR-RT-027A",
        "BZR-RT-028", "BZR-RT-029", "BZR-RT-030", "BZR-RT-034", "BZR-RT-035"
      ],
      "expectedArtifacts": [
        "bob-bazaar-review.code-workspace",
        "bob-managed/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
        "bob-managed/.bob/review/checklist.json",
        "bob-managed/EXPECTED_BAZAAR_REVIEW_FINDINGS.md",
        "bazaar-source/.bzr"
      ]
    },
    {
      "id": "bazaar-run-recovery",
      "extension": "bob-bazaar-review",
      "priorities": ["P0", "P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1",
        "arguments": {}
      },
      "requiredCommands": ["code", "node", "bzr"],
      "requiredRepositoryPaths": [
        "bob2/bob-code",
        "extensions/workflow-register/workflow-register-0.1.0.vsix",
        "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix"
      ],
      "checklistTemplate": "tools/real-machine-test-environment/checklists/bazaar-run-recovery.md",
      "testCases": ["BZR-RT-022", "BZR-RT-044", "BZR-RT-045", "BZR-RT-046", "BZR-RT-047"],
      "expectedArtifacts": [
        "bob-bazaar-review.code-workspace",
        "bob-managed/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
        "bazaar-source/.bzr"
      ]
    },
    {
      "id": "consistency-ai-matrix",
      "extension": "bob-code-consistency-review",
      "priorities": ["P0", "P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1",
        "arguments": { "Sample": "ai-verification-matrix" }
      },
      "requiredCommands": ["code", "node", "git"],
      "requiredRepositoryPaths": [
        "bob2/bob-code",
        "extensions/workflow-register/workflow-register-0.1.0.vsix",
        "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix",
        "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix"
      ],
      "checklistTemplate": "tools/real-machine-test-environment/checklists/consistency-ai-matrix.md",
      "testCases": [
        "CCR-RT-016", "CCR-RT-022", "CCR-RT-023", "CCR-RT-024", "CCR-RT-025", "CCR-RT-026",
        "CCR-RT-027", "CCR-RT-028", "CCR-RT-029", "CCR-RT-030", "CCR-RT-031"
      ],
      "expectedArtifacts": [
        "workspace/.git",
        "workspace/review-input.yaml",
        "workspace/.bob/workflows/code-consistency-review/WORKFLOW.md"
      ]
    },
    {
      "id": "consistency-traceability",
      "extension": "bob-code-consistency-review",
      "priorities": ["P0", "P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1",
        "arguments": { "Sample": "live-traceability-sidecar" }
      },
      "requiredCommands": ["code", "node", "git"],
      "requiredRepositoryPaths": [
        "bob2/bob-code",
        "extensions/workflow-register/workflow-register-0.1.0.vsix",
        "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix",
        "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix"
      ],
      "checklistTemplate": "tools/real-machine-test-environment/checklists/consistency-traceability.md",
      "testCases": [
        "CCR-RT-010", "CCR-RT-011", "CCR-RT-011A", "CCR-RT-012", "CCR-RT-013", "CCR-RT-014",
        "CCR-RT-015", "CCR-RT-023", "CCR-RT-024", "CCR-RT-025", "CCR-RT-026", "CCR-RT-027",
        "CCR-RT-028", "CCR-RT-029", "CCR-RT-031"
      ],
      "expectedArtifacts": [
        "workspace/.git",
        "workspace/review-input.yaml",
        "workspace/.bob-trace/traceability-catalog.json",
        "workspace/.bob/workflows/code-consistency-review/WORKFLOW.md"
      ]
    },
    {
      "id": "consistency-multilang",
      "extension": "bob-code-consistency-review",
      "priorities": ["P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1",
        "arguments": { "Sample": "multi-language-git-review" }
      },
      "requiredCommands": ["code", "node", "git"],
      "requiredRepositoryPaths": [
        "bob2/bob-code",
        "extensions/workflow-register/workflow-register-0.1.0.vsix",
        "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix",
        "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix"
      ],
      "checklistTemplate": "tools/real-machine-test-environment/checklists/consistency-multilang.md",
      "testCases": ["CCR-RT-016A", "CCR-RT-021A"],
      "expectedArtifacts": [
        "workspace/.git",
        "workspace/review-input.yaml",
        "workspace/.bob/workflows/code-consistency-review/WORKFLOW.md"
      ]
    },
    {
      "id": "consistency-validation-errors",
      "extension": "bob-code-consistency-review",
      "priorities": ["P0", "P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1",
        "arguments": { "Sample": "ai-verification-matrix" }
      },
      "requiredCommands": ["code", "node", "git"],
      "requiredRepositoryPaths": [
        "bob2/bob-code",
        "extensions/workflow-register/workflow-register-0.1.0.vsix",
        "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix",
        "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix"
      ],
      "checklistTemplate": "tools/real-machine-test-environment/checklists/consistency-validation-errors.md",
      "testCases": ["CCR-RT-008", "CCR-RT-012", "CCR-RT-028", "CCR-RT-034"],
      "expectedArtifacts": [
        "workspace/.git",
        "workspace/review-input.yaml",
        "workspace/.bob/workflows/code-consistency-review/WORKFLOW.md"
      ]
    }
  ]
}
```

- [ ] **Step 4: Create the operator result template**

Create `templates/operator-result.template.json`:

```json
{
  "schemaVersion": 1,
  "scenarioId": "",
  "operator": "",
  "startedAt": null,
  "completedAt": null,
  "results": []
}
```

- [ ] **Step 5: Create all checklist templates with concrete operations**

Each checklist begins with this shared header and ends with the shared evidence instruction:

```markdown
# {{SCENARIO_ID}} 実機チェックリスト

- Scenario root: `{{SCENARIO_ROOT}}`
- Workspace: `{{WORKSPACE_PATH}}`
- Bob root: `{{BOB_ROOT}}`
- VCS root: `{{VCS_ROOT}}`
- Review target: {{REVIEW_TARGET}}
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
```

Insert the following operation section before `Expected artifacts` in each file:

`bazaar-core.md`:

```markdown
## 操作
1. Bazaar Review GUI を開き、Bob root と Bazaar root が別 root として表示されることを確認する。
2. revision range `1..2` を読み込み、project rules 付き packet を生成する。
3. Bob Workflow UI から `bazaar-project-rule-review` を実行する。
4. valid / invalid review-result の capture と validation を行う。
5. MCP `initialize`、`tools/list`、readonly Bazaar tools、allowed roots を確認する。
6. Shift-JIS fixture が packet で大きく文字化けしないことを確認する。
```

`bazaar-run-recovery.md`:

```markdown
## 操作
1. Review GUI の未完了 run 一覧を開く。
2. `resume-result-capture` が結果取り込みへ再開することを確認する。
3. `resume-human-triage` が人による判定へ再開することを確認する。
4. `resume-finalize` が finalize へ再開することを確認する。
5. `malformed-run-hidden` が通常一覧に表示されないことを確認する。
6. `test-data/invalid` の schema error と review ID mismatch を capture / validate し、正式 result directory に保存されないことを確認する。
7. Decision ごとの必須値と metrics 補正 validation を確認する。
```

`consistency-ai-matrix.md`:

```markdown
## 操作
1. Review Wizard または Bob Workflow UI から preprocess を実行する。
2. `changed-files.json`、`evidence-index.json`、`bob-input.md` を確認する。
3. 実 AI では OK / NG / N/A / question の代表ケースを確認する。
4. Offline smoke では同梱 expected output を capture、validate、triage する。
5. Human triage artifacts と Developer Tools Console を確認する。
```

`consistency-traceability.md`:

```markdown
## 操作
1. Traceability AI draft prompt を生成する。
2. proposed-only JSON を catalog に反映する。
3. Traceability Prep で accepted / rejected / deprecated を人間が判断する。
4. Gate report を生成し、accepted item から review-input を作る。
5. Preprocess、Bob output capture、validate、triage を順に実行する。
6. HTML / script 風文字列が UI text として escape されることを確認する。
```

`consistency-multilang.md`:

```markdown
## 操作
1. `main..feature/multi-language-git-review` を対象に preprocess を実行する。
2. `changed-files.json` に TypeScript、Python、Java が含まれることを確認する。
3. `evidence-index.json` と `code-slices/*.md` に `SRC-*` evidence があることを確認する。
4. `bob-input.md` に汎用コード変更根拠が含まれることを確認する。
```

`consistency-validation-errors.md`:

```markdown
## 操作
1. `review-input-missing-required.yaml` を editor で開き diagnostics を実行する。
2. `review-input-path-escape.yaml` を一時的に active input path へコピーし、workspace 外 path が拒否されることを確認して元の input を復元する。
3. `bob-output-schema-error.yaml` を capture / validate し、schema error を確認する。
4. `bob-output-unknown-evidence.yaml` を validate し、unknown evidence ID を確認する。
5. `traceability-draft-invalid-status.json` を適用し、proposed-only contract rejection を確認する。
6. Invalid fixture が正式 artifact path に残っていないことを確認する。
```

- [ ] **Step 6: Run the baseline contracts and confirm GREEN**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/templates/operator-result.template.json \
  tools/real-machine-test-environment/checklists \
  scripts/real-machine-test-environment.test.js
git commit -m "test: define real-machine environment scenarios"
```

### Task 2: Implement manifest validation and write-free `-ValidateOnly`

**Files:**

- Create: `tools/real-machine-test-environment/lib/ScenarioManifest.ps1`
- Create: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- `Read-ScenarioManifest -RepoRoot -ManifestPath` returns the parsed manifest.
- `Assert-ScenarioManifest -RepoRoot -Manifest` throws an aggregated, actionable validation error.
- `Resolve-ScenarioSelection -Manifest -Scenario` returns an array in manifest order.
- `Assert-RepositoryRelativePath` validates repository source paths and may require existence.
- `Assert-ScenarioRelativePath` validates generated destination syntax before a scenario root exists.
- `Test-PathInsideRoot` is the shared lexical containment predicate.
- Runner parameters: `RepoRoot`, `OutputRoot`, `Scenario`, `CodeCommand`, `BzrCommand`, `Open`, `OpenScenario`, `ValidateOnly`.

- [ ] **Step 1: Add failing runner/module static contracts**

Append:

```js
test("runner exposes the approved validation interface", () => {
  const runner = fs.readFileSync(path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), "utf8")
  const source = fs.readFileSync(path.join(toolRoot, "lib", "ScenarioManifest.ps1"), "utf8")
  assert.match(runner, /\[switch\]\$ValidateOnly/)
  assert.match(runner, /\[switch\]\$Open/)
  assert.match(runner, /\[string\]\$OpenScenario/)
  assert.match(runner, /Resolve-ScenarioSelection/)
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
})
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because the runner and module do not exist.

- [ ] **Step 3: Implement safe path syntax, launcher allowlist, and testcase lookup**

Create `ScenarioManifest.ps1`:

```powershell
Set-StrictMode -Version Latest

$script:AllowedLauncherPaths = @(
  "docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1",
  "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1"
)
$script:AllowedSamples = @(
  "simple-timeout-bugfix",
  "ai-verification-matrix",
  "live-traceability-sidecar",
  "multi-language-git-review"
)

function Get-NormalizedFullPath {
  param([Parameter(Mandatory)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Test-PathInsideRoot {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Candidate
  )
  $relative = [System.IO.Path]::GetRelativePath(
    (Get-NormalizedFullPath $Root),
    (Get-NormalizedFullPath $Candidate)
  )
  return $relative -eq "." -or (
    -not [System.IO.Path]::IsPathRooted($relative) -and
    $relative -ne ".." -and
    -not $relative.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)") -and
    -not $relative.StartsWith("..$([System.IO.Path]::AltDirectorySeparatorChar)")
  )
}

function Assert-RepositoryRelativePath {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$FieldName,
    [switch]$MustExist
  )
  if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw "$FieldName must be repository-relative: $RelativePath" }
  if (($RelativePath -split "[\\/]+") -contains "..") { throw "$FieldName must not contain ..: $RelativePath" }
  $resolved = Get-NormalizedFullPath (Join-Path $RepoRoot $RelativePath)
  if (-not (Test-PathInsideRoot $RepoRoot $resolved)) { throw "$FieldName resolves outside RepoRoot: $RelativePath" }
  if ($MustExist) {
    if (-not (Test-Path -LiteralPath $resolved)) { throw "$FieldName not found: $RelativePath" }
    $realPath = (Resolve-Path -LiteralPath $resolved).Path
    if (-not (Test-PathInsideRoot $RepoRoot $realPath)) { throw "$FieldName escapes RepoRoot after resolution: $RelativePath" }
  }
  return $resolved
}

function Assert-ScenarioRelativePath {
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$FieldName
  )
  if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw "$FieldName must be scenario-relative: $RelativePath" }
  if (($RelativePath -split "[\\/]+") -contains "..") { throw "$FieldName must not contain ..: $RelativePath" }
  return $RelativePath
}

function Assert-TestCaseExists {
  param([string]$RepoRoot, [string]$TestCaseId)
  $specPath = if ($TestCaseId.StartsWith("BZR-")) {
    Join-Path $RepoRoot "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
  } elseif ($TestCaseId.StartsWith("CCR-")) {
    Join-Path $RepoRoot "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  } else {
    throw "Unsupported testcase prefix: $TestCaseId"
  }
  $content = [System.IO.File]::ReadAllText($specPath)
  if ($content -notmatch "(?m)^#{3,4}\s+$([regex]::Escape($TestCaseId))(?:\s|$)") {
    throw "Testcase not found in real-machine specification: $TestCaseId"
  }
}

function Read-ScenarioManifest {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [string]$ManifestPath = "tools/real-machine-test-environment/scenarios.json"
  )
  $resolved = Assert-RepositoryRelativePath $RepoRoot $ManifestPath "ManifestPath" -MustExist
  try {
    return [System.IO.File]::ReadAllText($resolved) | ConvertFrom-Json -Depth 50
  } catch {
    throw "Unable to parse scenario manifest ${ManifestPath}: $($_.Exception.Message)"
  }
}
```

- [ ] **Step 4: Implement complete manifest validation and selection**

Append:

```powershell
function Assert-ScenarioManifest {
  param([string]$RepoRoot, [pscustomobject]$Manifest)
  $errors = [System.Collections.Generic.List[string]]::new()
  if ($Manifest.schemaVersion -ne 1) { $errors.Add("Unsupported schemaVersion: $($Manifest.schemaVersion)") }
  $ids = @($Manifest.scenarios | ForEach-Object { [string]$_.id })
  if ($ids.Count -ne @($ids | Select-Object -Unique).Count) { $errors.Add("Scenario IDs must be unique") }

  foreach ($scenario in $Manifest.scenarios) {
    try {
      if ([string]$scenario.id -notmatch "^[a-z0-9][a-z0-9-]*$") { throw "Unsafe scenario ID: $($scenario.id)" }
      if ($scenario.generator.kind -ne "existing-launcher") { throw "Unsupported generator kind: $($scenario.generator.kind)" }
      $launcher = [string]$scenario.generator.path
      if ($script:AllowedLauncherPaths -notcontains $launcher) { throw "Launcher is not allowlisted: $launcher" }
      Assert-RepositoryRelativePath $RepoRoot $launcher "$($scenario.id).generator.path" -MustExist | Out-Null
      Assert-RepositoryRelativePath $RepoRoot ([string]$scenario.checklistTemplate) "$($scenario.id).checklistTemplate" -MustExist | Out-Null
      foreach ($requiredPath in $scenario.requiredRepositoryPaths) {
        Assert-RepositoryRelativePath $RepoRoot ([string]$requiredPath) "$($scenario.id).requiredRepositoryPaths" | Out-Null
      }
      foreach ($artifactPath in $scenario.expectedArtifacts) {
        Assert-ScenarioRelativePath ([string]$artifactPath) "$($scenario.id).expectedArtifacts" | Out-Null
      }
      $argumentNames = @($scenario.generator.arguments.psobject.Properties.Name)
      if ($launcher -like "*bazaar-project-rule-review*") {
        if ($argumentNames.Count -ne 0) { throw "Bazaar manifest arguments are not allowed" }
      } else {
        foreach ($name in $argumentNames) { if ($name -ne "Sample") { throw "Unsupported manifest argument: $name" } }
        if ($script:AllowedSamples -notcontains [string]$scenario.generator.arguments.Sample) {
          throw "Unsupported Sample: $($scenario.generator.arguments.Sample)"
        }
      }
      foreach ($testCaseId in $scenario.testCases) { Assert-TestCaseExists $RepoRoot ([string]$testCaseId) }
    } catch {
      $errors.Add("$($scenario.id): $($_.Exception.Message)")
    }
  }

  $groupIds = @($Manifest.groups."p0-p1")
  if ($groupIds.Count -ne @($groupIds | Select-Object -Unique).Count) { $errors.Add("p0-p1 contains duplicate IDs") }
  foreach ($groupId in $groupIds) { if ($ids -notcontains [string]$groupId) { $errors.Add("p0-p1 references unknown scenario: $groupId") } }
  if ($errors.Count -gt 0) { throw "Scenario manifest is invalid:`n- $($errors -join "`n- ")" }
}

function Resolve-ScenarioSelection {
  param([pscustomobject]$Manifest, [string]$Scenario)
  $requestedIds = if ($Scenario -eq "all") { @($Manifest.groups."p0-p1") } else { @($Scenario) }
  return @($requestedIds | ForEach-Object {
    $id = [string]$_
    $matches = @($Manifest.scenarios | Where-Object { $_.id -eq $id })
    if ($matches.Count -ne 1) { throw "Unknown scenario: $id" }
    $matches[0]
  })
}
```

- [ ] **Step 5: Implement the runner parameter gate and write-free validation branch**

Create `Invoke-BobReviewTestEnvironment.ps1`:

```powershell
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$OutputRoot,
  [string]$Scenario = "all",
  [string]$CodeCommand = "code",
  [string]$BzrCommand = "bzr",
  [switch]$Open,
  [string]$OpenScenario,
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\ScenarioManifest.ps1")

if ($Open -and $OpenScenario) { throw "-Open and -OpenScenario cannot be used together" }
if ($ValidateOnly -and ($Open -or $OpenScenario)) { throw "-ValidateOnly cannot launch VS Code" }

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$manifest = Read-ScenarioManifest -RepoRoot $RepoRoot
Assert-ScenarioManifest -RepoRoot $RepoRoot -Manifest $manifest
$selected = Resolve-ScenarioSelection -Manifest $manifest -Scenario $Scenario

if ($Open -and $selected.Count -ne 1) { throw "-Open requires exactly one selected scenario" }
if ($OpenScenario -and (@($selected.id) -notcontains $OpenScenario)) {
  throw "-OpenScenario must identify a selected scenario: $OpenScenario"
}

if ($ValidateOnly) {
  Write-Host "Manifest validation succeeded: $($manifest.scenarios.Count) scenarios; selected=$($selected.Count)"
  return
}

throw "Generation modules are introduced in Tasks 3 and 4; run -ValidateOnly at this checkpoint"
```

- [ ] **Step 6: Verify GREEN and prove `-ValidateOnly` does not write**

```powershell
$before = @(Get-ChildItem $env:TEMP -Filter "bob-review-real-machine-*" -ErrorAction SilentlyContinue).Count
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
$after = @(Get-ChildItem $env:TEMP -Filter "bob-review-real-machine-*" -ErrorAction SilentlyContinue).Count
if ($after -ne $before) { throw "ValidateOnly created an output directory" }
```

Expected: `Manifest validation succeeded: 6 scenarios; selected=6`; counts are equal.

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: validate real-machine environment manifest"
```

### Task 3: Implement reparse-point-safe execution and artifact validation

**Files:**

- Create: `tools/real-machine-test-environment/lib/ScenarioExecution.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- `Assert-NoReparsePointTraversal -Root -Target -AllowMissingLeaf` checks every existing descendant with `Get-Item -Force`, rejects `FileAttributes.ReparsePoint`, and verifies resolved containment.
- `Assert-SafeOutputRoot -RepoRoot -OutputRoot` rejects existing roots, lexical containment, resolved-parent containment, and reparse-point traversal.
- `Get-ScenarioPrerequisiteReport -RepoRoot -Scenario -CodeCommand -BzrCommand` returns `ready`, `missingCommands`, `missingPaths`, `packageHints`.
- `New-LauncherInvocation` returns `launcherPath` and an `OrderedDictionary` of runner-injected arguments.
- `Invoke-ScenarioLauncher` returns `succeeded`, `error`, and writes UTF-8 log output.
- `Copy-ScenarioFixtureFiles` performs repository-source and scenario-destination safety checks before every write.
- `Test-ExpectedScenarioArtifacts` validates existence and reparse-point-safe containment.
- `Get-ScenarioLaunchDescriptor` returns command, argument array, target, and display command line.

- [ ] **Step 1: Add failing execution and path-safety contracts**

Append:

```js
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
  assert.doesNotMatch(source, /Invoke-Expression/)
  assert.doesNotMatch(source, /SkipExtensionInstall\s*=/)
})
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because `ScenarioExecution.ps1` does not exist.

- [ ] **Step 3: Implement reparse-point and output-root safety**

Create `ScenarioExecution.ps1` and dot-source the manifest module:

```powershell
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "ScenarioManifest.ps1")

function Assert-NoReparsePointTraversal {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Target,
    [switch]$AllowMissingLeaf
  )
  $rootFull = Get-NormalizedFullPath $Root
  $targetFull = Get-NormalizedFullPath $Target
  if (-not (Test-PathInsideRoot $rootFull $targetFull)) { throw "Path is outside root: $targetFull" }
  $rootReal = (Resolve-Path -LiteralPath $rootFull).Path
  $relative = [System.IO.Path]::GetRelativePath($rootFull, $targetFull)
  $current = $rootFull
  foreach ($segment in @($relative -split "[\\/]+" | Where-Object { $_ -and $_ -ne "." })) {
    $current = Join-Path $current $segment
    if (-not (Test-Path -LiteralPath $current)) {
      if ($AllowMissingLeaf) { return }
      throw "Path does not exist: $current"
    }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Path must not traverse a symlink or junction: $current"
    }
    $currentReal = (Resolve-Path -LiteralPath $current).Path
    if (-not (Test-PathInsideRoot $rootReal $currentReal)) { throw "Path escapes root after resolution: $current" }
  }
}

function Assert-SafeOutputRoot {
  param([string]$RepoRoot, [string]$OutputRoot)
  $repoFull = Get-NormalizedFullPath $RepoRoot
  $outputFull = Get-NormalizedFullPath $OutputRoot
  if (Test-Path -LiteralPath $outputFull) { throw "OutputRoot already exists: $outputFull" }
  if (Test-PathInsideRoot $repoFull $outputFull) { throw "OutputRoot must be outside RepoRoot: $outputFull" }
  $parent = Split-Path -Parent $outputFull
  if (-not (Test-Path -LiteralPath $parent)) { throw "OutputRoot parent does not exist: $parent" }
  Assert-NoReparsePointTraversal -Root (Get-NormalizedFullPath ([System.IO.Path]::GetPathRoot($parent))) -Target $parent
  $parentReal = (Resolve-Path -LiteralPath $parent).Path
  $candidateReal = Join-Path $parentReal (Split-Path -Leaf $outputFull)
  if (Test-PathInsideRoot (Resolve-Path -LiteralPath $repoFull).Path $candidateReal) {
    throw "OutputRoot resolves inside RepoRoot: $outputFull"
  }
  return $outputFull
}
```

- [ ] **Step 4: Implement prerequisite, invocation, and logging contracts**

Append:

```powershell
$script:PackageHints = @{
  "extensions/workflow-register/workflow-register-0.1.0.vsix" = "cd extensions/workflow-register; npm.cmd run package"
  "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix" = "cd extensions/bob-bazaar-review; npm.cmd run package"
  "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix" = "cd extensions/bob-code-consistency-review; npm.cmd run package"
  "bob2/bob-code" = "Restore the expanded IBM Bob extension at bob2/bob-code"
}

function Get-ScenarioPrerequisiteReport {
  param([string]$RepoRoot, [pscustomobject]$Scenario, [string]$CodeCommand, [string]$BzrCommand)
  $missingCommands = @()
  foreach ($commandName in $Scenario.requiredCommands) {
    $probe = if ($commandName -eq "code") { $CodeCommand } elseif ($commandName -eq "bzr") { $BzrCommand } else { [string]$commandName }
    if (-not (Get-Command $probe -ErrorAction SilentlyContinue)) { $missingCommands += $probe }
  }
  $missingPaths = @()
  $hints = @()
  foreach ($relativePath in $Scenario.requiredRepositoryPaths) {
    $resolved = Join-Path $RepoRoot ([string]$relativePath)
    if (-not (Test-Path -LiteralPath $resolved)) {
      $missingPaths += [string]$relativePath
      if ($script:PackageHints.ContainsKey([string]$relativePath)) { $hints += $script:PackageHints[[string]$relativePath] }
    }
  }
  return [pscustomobject]@{
    ready = $missingCommands.Count -eq 0 -and $missingPaths.Count -eq 0
    missingCommands = $missingCommands
    missingPaths = $missingPaths
    packageHints = @($hints | Select-Object -Unique)
  }
}

function New-LauncherInvocation {
  param([string]$RepoRoot, [string]$ScenarioRoot, [pscustomobject]$Scenario, [string]$CodeCommand, [string]$BzrCommand)
  $arguments = [ordered]@{
    RepoRoot = $RepoRoot
    SandboxRoot = $ScenarioRoot
    CodeCommand = $CodeCommand
    NoLaunch = $true
  }
  if ([string]$Scenario.generator.path -like "*bazaar-project-rule-review*") {
    $arguments.BzrCommand = $BzrCommand
  } else {
    $arguments.Sample = [string]$Scenario.generator.arguments.Sample
  }
  return [pscustomobject]@{
    launcherPath = Join-Path $RepoRoot ([string]$Scenario.generator.path)
    arguments = $arguments
  }
}

function Invoke-ScenarioLauncher {
  param([pscustomobject]$Invocation, [string]$LogPath)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
  $lines = [System.Collections.Generic.List[string]]::new()
  try {
    & $Invocation.launcherPath @Invocation.arguments 2>&1 | ForEach-Object {
      $text = [string]$_
      $lines.Add($text)
      Write-Host $text
    }
    [System.IO.File]::WriteAllLines($LogPath, $lines, [System.Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ succeeded = $true; error = $null }
  } catch {
    $lines.Add("ERROR: $($_.Exception.Message)")
    [System.IO.File]::WriteAllLines($LogPath, $lines, [System.Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ succeeded = $false; error = $_.Exception.Message }
  }
}
```

- [ ] **Step 5: Implement safe fixture copy, artifact validation, and launch descriptors**

Append:

```powershell
function Copy-ScenarioFixtureFiles {
  param([string]$RepoRoot, [string]$ScenarioRoot, [object[]]$FixtureCopies = @())
  foreach ($copy in $FixtureCopies) {
    $source = Assert-RepositoryRelativePath $RepoRoot ([string]$copy.source) "fixtureCopies.source" -MustExist
    Assert-NoReparsePointTraversal -Root $RepoRoot -Target $source
    Assert-ScenarioRelativePath ([string]$copy.destination) "fixtureCopies.destination" | Out-Null
    $destination = Get-NormalizedFullPath (Join-Path $ScenarioRoot ([string]$copy.destination))
    if (-not (Test-PathInsideRoot $ScenarioRoot $destination)) { throw "Fixture destination escapes scenario root: $destination" }
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target (Split-Path -Parent $destination) -AllowMissingLeaf
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target (Split-Path -Parent $destination)
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

function Test-ExpectedScenarioArtifacts {
  param([string]$ScenarioRoot, [object[]]$ExpectedArtifacts)
  $checks = foreach ($value in $ExpectedArtifacts) {
    $relativePath = Assert-ScenarioRelativePath ([string]$value) "expectedArtifacts"
    $candidate = Get-NormalizedFullPath (Join-Path $ScenarioRoot $relativePath)
    $exists = Test-Path -LiteralPath $candidate
    $safe = $false
    $errorMessage = $null
    try {
      if ($exists) { Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target $candidate; $safe = $true }
    } catch { $errorMessage = $_.Exception.Message }
    [pscustomobject]@{
      path = $relativePath
      resolvedPath = $candidate
      exists = $exists
      safe = $safe
      error = $errorMessage
    }
  }
  return [pscustomobject]@{
    valid = @($checks | Where-Object { -not $_.exists -or -not $_.safe }).Count -eq 0
    checks = @($checks)
  }
}

function Get-ScenarioLaunchDescriptor {
  param([string]$RepoRoot, [string]$ScenarioRoot, [pscustomobject]$Scenario, [string]$CodeCommand)
  $target = if ([string]$Scenario.generator.path -like "*bazaar-project-rule-review*") {
    Join-Path $ScenarioRoot "bob-bazaar-review.code-workspace"
  } else {
    Join-Path $ScenarioRoot "workspace"
  }
  $arguments = @(
    "--user-data-dir", (Join-Path $ScenarioRoot "user-data"),
    "--extensions-dir", (Join-Path $ScenarioRoot "extensions"),
    "--extensionDevelopmentPath", (Join-Path $RepoRoot "bob2/bob-code"),
    $target
  )
  return [pscustomobject]@{
    command = $CodeCommand
    arguments = $arguments
    target = $target
    commandLine = "$CodeCommand $($arguments -join ' ')"
  }
}
```

- [ ] **Step 6: Verify GREEN and injected arguments**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

```powershell
pwsh -NoProfile -Command '
  . ./tools/real-machine-test-environment/lib/ScenarioManifest.ps1
  . ./tools/real-machine-test-environment/lib/ScenarioExecution.ps1
  $m = Read-ScenarioManifest -RepoRoot (Get-Location).Path
  Assert-ScenarioManifest -RepoRoot (Get-Location).Path -Manifest $m
  $s = @($m.scenarios | Where-Object id -eq "consistency-ai-matrix")[0]
  $i = New-LauncherInvocation -RepoRoot (Get-Location).Path -ScenarioRoot "C:\temp\scenario" -Scenario $s -CodeCommand code -BzrCommand bzr
  if (-not $i.arguments.NoLaunch) { throw "NoLaunch was not injected" }
  if ($i.arguments.Contains("SkipExtensionInstall")) { throw "SkipExtensionInstall must not be injected" }
'
```

Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add tools/real-machine-test-environment/lib/ScenarioExecution.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: execute real-machine scenarios safely"
```

### Task 4: Generate run evidence, isolate failures, and open one ready scenario

**Files:**

- Create: `tools/real-machine-test-environment/lib/RunEvidence.ps1`
- Modify: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- `Write-JsonUtf8` writes UTF-8 without BOM.
- `Get-ToolVersionSnapshot` records exit code, normalized first line, and raw output for `code`, `node`, `git`, `bzr` without environment variables.
- `Get-RepositorySnapshot` records root, commit, branch, and dirty boolean.
- `New-OperatorResult` emits one `not_run` item per manifest testcase.
- `Expand-ChecklistTemplate` rejects unresolved tokens.
- `Write-ScenarioEvidence` accepts `System.Collections.IDictionary` for ordered scenario records.
- `Write-RunEvidence` emits `environment-versions.json`, `run-manifest.json`, and `run-summary.md`.
- Runner statuses are `not_started`, `ready`, `blocked`, `failed`.

- [ ] **Step 1: Add a failing blocked-scenario integration test**

Append:

```js
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
```

- [ ] **Step 2: Run on Windows and confirm RED**

```powershell
node --test scripts/real-machine-test-environment.test.js
```

Expected: blocked scenario test fails because generation is not implemented.

- [ ] **Step 3: Implement evidence helpers with consistent dictionary types**

Create `RunEvidence.ps1`:

```powershell
Set-StrictMode -Version Latest

function Write-JsonUtf8 {
  param([string]$Path, $Value)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  [System.IO.File]::WriteAllText(
    $Path,
    "$(($Value | ConvertTo-Json -Depth 50))`n",
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Invoke-VersionProbe {
  param([string]$Command, [string[]]$Arguments)
  try {
    $output = @(& $Command @Arguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
    return [ordered]@{
      available = $exitCode -eq 0
      exitCode = $exitCode
      normalized = if ($output.Count -gt 0) { $output[0].Trim() } else { "" }
      rawOutput = $output
    }
  } catch {
    return [ordered]@{ available = $false; exitCode = $null; normalized = "unavailable"; rawOutput = @($_.Exception.Message) }
  }
}

function Get-ToolVersionSnapshot {
  param([string]$CodeCommand, [string]$BzrCommand)
  return [ordered]@{
    code = Invoke-VersionProbe $CodeCommand @("--version")
    node = Invoke-VersionProbe "node" @("--version")
    git = Invoke-VersionProbe "git" @("--version")
    bzr = Invoke-VersionProbe $BzrCommand @("--version")
  }
}

function Get-RepositorySnapshot {
  param([string]$RepoRoot)
  $commit = @(& git -C $RepoRoot rev-parse HEAD 2>$null)[0]
  $branch = @(& git -C $RepoRoot branch --show-current 2>$null)[0]
  $dirtyLines = @(& git -C $RepoRoot status --porcelain 2>$null)
  return [ordered]@{
    root = $RepoRoot
    commit = if ($commit) { $commit.Trim() } else { "unavailable" }
    branch = if ($branch) { $branch.Trim() } else { "detached-or-unavailable" }
    dirty = $dirtyLines.Count -gt 0
  }
}

function New-OperatorResult {
  param([pscustomobject]$Scenario)
  return [ordered]@{
    schemaVersion = 1
    scenarioId = [string]$Scenario.id
    operator = ""
    startedAt = $null
    completedAt = $null
    results = @($Scenario.testCases | ForEach-Object {
      [ordered]@{ testCaseId = [string]$_; status = "not_run"; notes = ""; evidencePaths = @() }
    })
  }
}

function Expand-ChecklistTemplate {
  param([string]$Template, [System.Collections.IDictionary]$Tokens)
  $expanded = $Template
  foreach ($name in $Tokens.Keys) { $expanded = $expanded.Replace("{{$name}}", [string]$Tokens[$name]) }
  if ($expanded -match "\{\{[A-Z0-9_]+\}\}") { throw "Checklist contains unresolved token: $($Matches[0])" }
  return $expanded
}
```

- [ ] **Step 4: Implement scenario and run evidence writers**

Append:

```powershell
function Write-ScenarioEvidence {
  param(
    [string]$RepoRoot,
    [string]$ScenarioRoot,
    [pscustomobject]$Scenario,
    [System.Collections.IDictionary]$ScenarioRecord,
    [System.Collections.IDictionary]$ChecklistTokens
  )
  New-Item -ItemType Directory -Force -Path $ScenarioRoot | Out-Null
  $template = [System.IO.File]::ReadAllText((Join-Path $RepoRoot ([string]$Scenario.checklistTemplate)))
  $checklist = Expand-ChecklistTemplate -Template $template -Tokens $ChecklistTokens
  [System.IO.File]::WriteAllText((Join-Path $ScenarioRoot "operator-checklist.md"), $checklist, [System.Text.UTF8Encoding]::new($false))
  Write-JsonUtf8 (Join-Path $ScenarioRoot "operator-result.json") (New-OperatorResult $Scenario)
  Write-JsonUtf8 (Join-Path $ScenarioRoot "scenario-manifest.json") $ScenarioRecord
}

function Write-RunEvidence {
  param(
    [string]$OutputRoot,
    [System.Collections.IDictionary]$Repository,
    [System.Collections.IDictionary]$Versions,
    [object[]]$ScenarioRecords
  )
  Write-JsonUtf8 (Join-Path $OutputRoot "environment-versions.json") $Versions
  $tools = [ordered]@{}
  foreach ($name in @("code", "node", "git", "bzr")) { $tools[$name] = $Versions[$name].normalized }
  Write-JsonUtf8 (Join-Path $OutputRoot "run-manifest.json") ([ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    repository = $Repository
    tools = $tools
    scenarios = $ScenarioRecords
  })

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# Bob Review Real-Machine Environment")
  $lines.Add("")
  $lines.Add("- Repository commit: ``$($Repository.commit)``")
  $lines.Add("- Branch: ``$($Repository.branch)``")
  $lines.Add("- Dirty: ``$($Repository.dirty)``")
  $lines.Add("")
  $lines.Add("| Scenario | Status | Missing commands | Missing paths |")
  $lines.Add("| --- | --- | --- | --- |")
  foreach ($record in $ScenarioRecords) {
    $lines.Add("| $($record.id) | $($record.status) | $([string]::Join(', ', @($record.missingCommands))) | $([string]::Join(', ', @($record.missingPaths))) |")
  }
  $lines.Add("")
  $lines.Add("## Package hints")
  $lines.Add("")
  $hints = @($ScenarioRecords | ForEach-Object { @($_.packageHints) } | Select-Object -Unique)
  if ($hints.Count -eq 0) { $lines.Add("- None") } else { foreach ($hint in $hints) { $lines.Add("- ``$hint``") } }
  [System.IO.File]::WriteAllLines((Join-Path $OutputRoot "run-summary.md"), $lines, [System.Text.UTF8Encoding]::new($false))
}
```

- [ ] **Step 5: Replace the runner checkpoint with the complete isolated generation loop**

Dot-source the two modules:

```powershell
. (Join-Path $PSScriptRoot "lib\ScenarioExecution.ps1")
. (Join-Path $PSScriptRoot "lib\RunEvidence.ps1")
```

After `-ValidateOnly`, add:

```powershell
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $env:TEMP ("bob-review-real-machine-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
}
$outputFull = Assert-SafeOutputRoot -RepoRoot $RepoRoot -OutputRoot $OutputRoot
New-Item -ItemType Directory -Path $outputFull | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputFull "_logs") | Out-Null

Write-Host "Output root: $outputFull"
Write-Host "Selected scenarios: $(@($selected.id) -join ', ')"

$repositorySnapshot = Get-RepositorySnapshot $RepoRoot
$versions = Get-ToolVersionSnapshot -CodeCommand $CodeCommand -BzrCommand $BzrCommand
$scenarioRecords = [System.Collections.Generic.List[object]]::new()

foreach ($selectedScenario in $selected) {
  $scenarioRoot = Join-Path $outputFull ([string]$selectedScenario.id)
  $logPath = Join-Path $outputFull ("_logs\{0}.log" -f $selectedScenario.id)
  $prerequisites = Get-ScenarioPrerequisiteReport -RepoRoot $RepoRoot -Scenario $selectedScenario -CodeCommand $CodeCommand -BzrCommand $BzrCommand
  $launch = $null
  $errorMessage = $null
  $postSeedResult = $null
  $artifactResult = [pscustomobject]@{ valid = $false; checks = @() }
  $status = "not_started"

  if (-not $prerequisites.ready) {
    $status = "blocked"
    New-Item -ItemType Directory -Force -Path $scenarioRoot | Out-Null
  } else {
    $invocation = New-LauncherInvocation -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -CodeCommand $CodeCommand -BzrCommand $BzrCommand
    $execution = Invoke-ScenarioLauncher -Invocation $invocation -LogPath $logPath
    if (-not $execution.succeeded) {
      $status = "failed"
      $errorMessage = $execution.error
      New-Item -ItemType Directory -Force -Path $scenarioRoot | Out-Null
    } else {
      try {
        Assert-NoReparsePointTraversal -Root $outputFull -Target $scenarioRoot
        if ($selectedScenario.psobject.Properties.Name -contains "fixtureCopies") {
          Copy-ScenarioFixtureFiles -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -FixtureCopies @($selectedScenario.fixtureCopies)
        }
        if ($selectedScenario.psobject.Properties.Name -contains "postSeed") {
          $seedPath = Assert-RepositoryRelativePath $RepoRoot ([string]$selectedScenario.postSeed) "$($selectedScenario.id).postSeed" -MustExist
          Assert-NoReparsePointTraversal -Root $RepoRoot -Target $seedPath
          & $seedPath -ScenarioRoot $scenarioRoot
          $postSeedResult = [ordered]@{ path = $seedPath; status = "completed" }
        }
        $artifactResult = Test-ExpectedScenarioArtifacts -ScenarioRoot $scenarioRoot -ExpectedArtifacts @($selectedScenario.expectedArtifacts)
        if (-not $artifactResult.valid) { throw "Expected artifact validation failed" }
        $launch = Get-ScenarioLaunchDescriptor -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -CodeCommand $CodeCommand
        $status = "ready"
      } catch {
        $status = "failed"
        $errorMessage = $_.Exception.Message
      }
    }
  }

  $record = [ordered]@{
    id = [string]$selectedScenario.id
    extension = [string]$selectedScenario.extension
    status = $status
    root = $scenarioRoot
    launchTarget = if ($launch) { $launch.target } else { $null }
    launchCommand = if ($launch) { $launch.commandLine } else { $null }
    logPath = $logPath
    missingCommands = @($prerequisites.missingCommands)
    missingPaths = @($prerequisites.missingPaths)
    packageHints = @($prerequisites.packageHints)
    error = $errorMessage
    postSeed = $postSeedResult
    artifactChecks = @($artifactResult.checks)
    testCases = @($selectedScenario.testCases)
  }
  $tokens = [ordered]@{
    SCENARIO_ID = $selectedScenario.id
    SCENARIO_ROOT = $scenarioRoot
    WORKSPACE_PATH = if ($selectedScenario.extension -eq "bob-bazaar-review") { Join-Path $scenarioRoot "bob-bazaar-review.code-workspace" } else { Join-Path $scenarioRoot "workspace" }
    BOB_ROOT = if ($selectedScenario.extension -eq "bob-bazaar-review") { Join-Path $scenarioRoot "bob-managed" } else { Join-Path $scenarioRoot "workspace" }
    VCS_ROOT = if ($selectedScenario.extension -eq "bob-bazaar-review") { Join-Path $scenarioRoot "bazaar-source" } else { Join-Path $scenarioRoot "workspace" }
    REVIEW_TARGET = if ($selectedScenario.extension -eq "bob-bazaar-review") { "revision range 1..2" } else { [string]$selectedScenario.generator.arguments.Sample }
    LAUNCH_COMMAND = if ($launch) { $launch.commandLine } else { "blocked: prerequisites are missing" }
    TEST_CASES = @($selectedScenario.testCases | ForEach-Object { "- ``$_``" }) -join "`n"
    EXPECTED_ARTIFACTS = @($selectedScenario.expectedArtifacts | ForEach-Object { "- ``$_``" }) -join "`n"
  }
  Write-ScenarioEvidence -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -ScenarioRecord $record -ChecklistTokens $tokens
  if ($status -eq "failed") {
    Write-JsonUtf8 (Join-Path $scenarioRoot "generation-failure.json") ([ordered]@{ scenarioId = $selectedScenario.id; error = $errorMessage; logPath = $logPath })
  }
  $scenarioRecords.Add([pscustomobject]$record)
}

Write-RunEvidence -OutputRoot $outputFull -Repository $repositorySnapshot -Versions $versions -ScenarioRecords @($scenarioRecords)
```

Add explicit launch and final exit behavior:

```powershell
$requestedOpenId = if ($Open) { [string]$selected[0].id } else { $OpenScenario }
if ($requestedOpenId) {
  $record = @($scenarioRecords | Where-Object id -eq $requestedOpenId)[0]
  if ($record.status -ne "ready") { throw "Cannot open non-ready scenario: $requestedOpenId ($($record.status))" }
  $scenarioRecord = @($selected | Where-Object id -eq $requestedOpenId)[0]
  $descriptor = Get-ScenarioLaunchDescriptor -RepoRoot $RepoRoot -ScenarioRoot $record.root -Scenario $scenarioRecord -CodeCommand $CodeCommand
  Start-Process -FilePath $descriptor.command -ArgumentList $descriptor.arguments
}

$readyCount = @($scenarioRecords | Where-Object status -eq "ready").Count
$blockedCount = @($scenarioRecords | Where-Object status -eq "blocked").Count
$failedCount = @($scenarioRecords | Where-Object status -eq "failed").Count
Write-Host "Ready: $readyCount; Blocked: $blockedCount; Failed: $failedCount"
Write-Host "Summary: $(Join-Path $outputFull 'run-summary.md')"
if ($blockedCount -gt 0 -or $failedCount -gt 0) { exit 1 }
```

- [ ] **Step 6: Verify blocked scenario behavior and no automatic pass**

```powershell
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass on Windows; the process test is skipped on non-Windows.

Manual check:

```powershell
$root = Join-Path $env:TEMP "bob-review-blocked-contract"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -OutputRoot $root `
  -CodeCommand __missing_bob_code_command__
$operator = Get-Content "$root\consistency-ai-matrix\operator-result.json" -Raw | ConvertFrom-Json
if (@($operator.results | Where-Object status -ne "not_run").Count -ne 0) { throw "Generator changed operator results" }
```

Expected: non-zero exit, `blocked` manifest, all results `not_run`.

- [ ] **Step 7: Commit**

```bash
git add tools/real-machine-test-environment/lib/RunEvidence.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: generate real-machine environment evidence"
```

### Task 5: Seed Bazaar Review Run recovery and invalid result cases

**Files:**

- Create: `tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1`
- Modify: `tools/real-machine-test-environment/scenarios.json`
- Modify: `tools/real-machine-test-environment/lib/ScenarioManifest.ps1`
- Modify: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- `New-BazaarRecoverySeedPlan -ScenarioRoot` returns file records without filesystem writes.
- `Assert-BazaarRecoverySeedPlan -Plan` verifies required artifact fields and matching planned files for every completed phase.
- `Write-BazaarRecoverySeedPlan -ScenarioRoot -Plan` writes only under the selected scenario root and rejects reparse-point traversal.
- Script parameters are `ScenarioRoot` and `ValidateOnly`.
- Campaign ID is `real-machine-recovery`.
- Recovery IDs are `resume-result-capture`, `resume-human-triage`, `resume-finalize`, `malformed-run-hidden`.
- Invalid Bazaar results are `review-result-schema-error.json` and `review-result-id-mismatch.json` under `bob-managed/test-data/invalid`.

- [ ] **Step 1: Add failing seed contracts**

Append:

```js
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
  assert.match(source, /function New-BazaarRecoverySeedPlan/)
  assert.match(source, /function Assert-BazaarRecoverySeedPlan/)
  assert.match(source, /function Write-BazaarRecoverySeedPlan/)
  for (const text of ["reviewPacketPath is required", "reviewResultJsonPath is required", "triageYamlPath is required"]) {
    assert.match(source, new RegExp(text))
  }
})
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because `postSeed` and the script are absent.

- [ ] **Step 3: Implement deterministic review result, phase, and run builders**

Create the seed script:

```powershell
param([string]$ScenarioRoot, [switch]$ValidateOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:CampaignId = "real-machine-recovery"

function ConvertTo-JsonText { param($Value) return "$(($Value | ConvertTo-Json -Depth 50))`n" }
function New-PhaseProgress {
  param([string]$Status, [string]$StartedAt, [string]$CompletedAt)
  $result = [ordered]@{ status = $Status }
  if ($StartedAt) { $result.startedAt = $StartedAt }
  if ($CompletedAt) { $result.completedAt = $CompletedAt }
  return $result
}
function Get-RelativeReviewDirectory { param([string]$ReviewId) return ".bob-review-records/campaigns/$script:CampaignId/records/$ReviewId" }
function New-ValidReviewResult {
  param([string]$ReviewId)
  return [ordered]@{
    review_id = $ReviewId
    vcs = [ordered]@{ type = "bazaar"; repository = "bazaar-source"; revision_mode = "revisionRange"; base_revision = "1"; target_revision = "2" }
    checklist_results = @([ordered]@{
      rule_id = "RT-001"; title = "RT path must not use console I/O"; status = "fail"; severity = "warning"; confidence = "high"
      evidence = @([ordered]@{ file = "src/rt_control.c"; start_line = 1; end_line = 40; summary = "printf is present in RT_CONTROL" })
      reason = "Human triage is required for the seeded recovery run."
    })
    findings = @([ordered]@{
      id = "F-RT-001"; rule_id = "RT-001"; severity = "warning"; file = "src/rt_control.c"; start_line = 1; end_line = 40
      title = "Console I/O in RT path"; description = "The seeded result exercises Review Run resume and triage."
    })
    summary = [ordered]@{ pass = 0; fail = 1; unknown = 0; not_applicable = 0; blocked = 0 }
  }
}
function New-ReviewRun {
  param(
    [string]$WorkspaceRoot,
    [string]$RepositoryRoot,
    [string]$ReviewId,
    [string]$Phase,
    [string]$UpdatedAt,
    [System.Collections.IDictionary]$Artifacts,
    [System.Collections.IDictionary]$Phases,
    [int]$BobReviewSeconds,
    [int]$HumanTriageSeconds
  )
  $metrics = [ordered]@{
    bobReviewSeconds = $BobReviewSeconds
    humanTriageSeconds = $HumanTriageSeconds
    timingSource = "auto_wall_clock"
    correctedByUser = $false
    bobReviewStartedAt = "2026-07-17T00:00:10.000Z"
  }
  if ($BobReviewSeconds -gt 0) { $metrics.humanTriageStartedAt = "2026-07-17T00:01:00.000Z" }
  return [ordered]@{
    schemaVersion = "bazaar-review-run/v1"
    workspaceRoot = $WorkspaceRoot
    campaignId = $script:CampaignId
    reviewId = $ReviewId
    phase = $Phase
    status = "in_progress"
    createdAt = "2026-07-17T00:00:00.000Z"
    updatedAt = $UpdatedAt
    target = [ordered]@{ mode = "revisionRange"; repositoryRoot = $RepositoryRoot; baseRevision = "1"; targetRevision = "2" }
    artifacts = $Artifacts
    phases = $Phases
    metrics = $metrics
    issues = @()
  }
}
```

- [ ] **Step 4: Build the three valid recovery cases, malformed case, and invalid results**

Implement `New-BazaarRecoverySeedPlan` using these fixed definitions:

```powershell
function New-BazaarRecoverySeedPlan {
  param([string]$ScenarioRoot)
  $workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot "bob-managed"))
  $repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot "bazaar-source"))
  $files = [System.Collections.Generic.List[object]]::new()
  $definitions = @(
    [ordered]@{ id = "resume-result-capture"; phase = "result"; updated = "2026-07-17T00:01:00.000Z"; result = $false; triage = $false },
    [ordered]@{ id = "resume-human-triage"; phase = "triage"; updated = "2026-07-17T00:02:00.000Z"; result = $true; triage = $false },
    [ordered]@{ id = "resume-finalize"; phase = "triage"; updated = "2026-07-17T00:03:00.000Z"; result = $true; triage = $true }
  )

  foreach ($definition in $definitions) {
    $reviewId = [string]$definition.id
    $recordDir = Get-RelativeReviewDirectory $reviewId
    $packetPath = "$recordDir/review-packet.md"
    $resultJsonPath = ".bob/review/results/$reviewId.json"
    $resultMarkdownPath = ".bob/review/results/$reviewId.md"
    $triagePath = "$recordDir/triage.yaml"
    $artifacts = [ordered]@{ reviewPacketPath = $packetPath }
    if ($definition.result) { $artifacts.reviewResultJsonPath = $resultJsonPath; $artifacts.reviewResultMarkdownPath = $resultMarkdownPath }
    if ($definition.triage) { $artifacts.triageYamlPath = $triagePath }
    $phases = [ordered]@{
      target = New-PhaseProgress "completed" "2026-07-17T00:00:00.000Z" "2026-07-17T00:00:00.000Z"
      packet = New-PhaseProgress "completed" "2026-07-17T00:00:05.000Z" "2026-07-17T00:00:10.000Z"
      result = if ($definition.result) { New-PhaseProgress "completed" "2026-07-17T00:00:10.000Z" "2026-07-17T00:01:00.000Z" } else { New-PhaseProgress "in_progress" "2026-07-17T00:00:10.000Z" $null }
      triage = if ($definition.triage) { New-PhaseProgress "completed" "2026-07-17T00:01:00.000Z" "2026-07-17T00:02:00.000Z" } elseif ($definition.result) { New-PhaseProgress "in_progress" "2026-07-17T00:01:00.000Z" $null } else { New-PhaseProgress "not_started" $null $null }
      record = New-PhaseProgress "not_started" $null $null
      summary = New-PhaseProgress "not_started" $null $null
    }
    $bobSeconds = if ($definition.result) { 50 } else { 0 }
    $triageSeconds = if ($definition.triage) { 60 } else { 0 }
    $run = New-ReviewRun -WorkspaceRoot $workspaceRoot -RepositoryRoot $repositoryRoot -ReviewId $reviewId -Phase $definition.phase -UpdatedAt $definition.updated -Artifacts $artifacts -Phases $phases -BobReviewSeconds $bobSeconds -HumanTriageSeconds $triageSeconds
    $files.Add([pscustomobject]@{ relativePath = "bob-managed/$recordDir/review-run.json"; content = ConvertTo-JsonText $run; kind = "review-run" })
    $files.Add([pscustomobject]@{ relativePath = "bob-managed/$packetPath"; content = "# Bazaar Revision Review Request`n`nSeeded recovery packet for $reviewId.`n"; kind = "packet" })
    if ($definition.result) {
      $files.Add([pscustomobject]@{ relativePath = "bob-managed/$resultJsonPath"; content = ConvertTo-JsonText (New-ValidReviewResult $reviewId); kind = "result-json" })
      $files.Add([pscustomobject]@{ relativePath = "bob-managed/$resultMarkdownPath"; content = "# Review Result`n`nSeeded valid result for $reviewId.`n"; kind = "result-markdown" })
    }
    if ($definition.triage) {
      $files.Add([pscustomobject]@{
        relativePath = "bob-managed/$triagePath"
        kind = "triage"
        content = @"
schema_version: bazaar-review-triage/v1
review_id: $reviewId
triaged_by: real-machine-fixture
triaged_at: 2026-07-17T00:02:00.000Z
items:
  - finding_id: F-RT-001
    rule_id: RT-001
    decision: accepted
    owner: rt-team
    action: remove console I/O from RT_CONTROL
summary:
  accepted: 1
  rejected: 0
  needs_investigation: 0
  deferred: 0
"@
      })
    }
  }

  $files.Add([pscustomobject]@{
    relativePath = "bob-managed/.bob-review-records/campaigns/$script:CampaignId/records/malformed-run-hidden/review-run.json"
    content = '{"schemaVersion":"bazaar-review-run/v1","reviewId":'
    kind = "malformed-run"
  })
  $schemaError = New-ValidReviewResult "review-result-schema-error"
  $schemaError.Remove("summary")
  $files.Add([pscustomobject]@{ relativePath = "bob-managed/test-data/invalid/review-result-schema-error.json"; content = ConvertTo-JsonText $schemaError; kind = "invalid-result" })
  $files.Add([pscustomobject]@{ relativePath = "bob-managed/test-data/invalid/review-result-id-mismatch.json"; content = ConvertTo-JsonText (New-ValidReviewResult "different-payload-review-id"); kind = "invalid-result" })
  return @($files)
}
```

- [ ] **Step 5: Validate artifact invariants and safe writes**

Append:

```powershell
function Assert-BazaarRecoverySeedPlan {
  param([object[]]$Plan)
  $paths = @($Plan.relativePath)
  $requirements = [ordered]@{
    packet = @("reviewPacketPath")
    result = @("reviewResultJsonPath", "reviewResultMarkdownPath")
    triage = @("triageYamlPath")
    record = @("recordYamlPath")
    summary = @("summaryJsonPath", "summaryMarkdownPath")
  }
  foreach ($runFile in @($Plan | Where-Object kind -eq "review-run")) {
    $run = $runFile.content | ConvertFrom-Json -Depth 50
    foreach ($phaseName in $requirements.Keys) {
      if ($run.phases.$phaseName.status -ne "completed") { continue }
      foreach ($fieldName in $requirements[$phaseName]) {
        if (-not $run.artifacts.$fieldName) { throw "$fieldName is required for completed $phaseName phase" }
        if ($paths -notcontains "bob-managed/$($run.artifacts.$fieldName)") { throw "Planned artifact is missing: $($run.artifacts.$fieldName)" }
      }
    }
  }
  if (@($Plan | Where-Object kind -eq "malformed-run").Count -ne 1) { throw "Exactly one malformed run is required" }
  if (@($Plan | Where-Object kind -eq "invalid-result").Count -ne 2) { throw "Exactly two invalid review results are required" }
}

function Write-BazaarRecoverySeedPlan {
  param([string]$ScenarioRoot, [object[]]$Plan)
  . (Join-Path $PSScriptRoot "..\..\lib\ScenarioManifest.ps1")
  . (Join-Path $PSScriptRoot "..\..\lib\ScenarioExecution.ps1")
  foreach ($file in $Plan) {
    Assert-ScenarioRelativePath ([string]$file.relativePath) "seed.relativePath" | Out-Null
    $target = Get-NormalizedFullPath (Join-Path $ScenarioRoot ([string]$file.relativePath))
    if (-not (Test-PathInsideRoot $ScenarioRoot $target)) { throw "Seed target escapes ScenarioRoot: $target" }
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target (Split-Path -Parent $target) -AllowMissingLeaf
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Assert-NoReparsePointTraversal -Root $ScenarioRoot -Target (Split-Path -Parent $target)
    [System.IO.File]::WriteAllText($target, [string]$file.content, [System.Text.UTF8Encoding]::new($false))
  }
}

$validationRoot = if ($ScenarioRoot) { $ScenarioRoot } else { Join-Path $env:TEMP "bob-review-seed-validation-root" }
$plan = New-BazaarRecoverySeedPlan -ScenarioRoot $validationRoot
Assert-BazaarRecoverySeedPlan -Plan $plan
if ($ValidateOnly) {
  Write-Host "Bazaar recovery seed plan valid: 4 recovery cases; 2 invalid review results"
  return
}
if (-not $ScenarioRoot) { throw "ScenarioRoot is required unless -ValidateOnly is used" }
Write-BazaarRecoverySeedPlan -ScenarioRoot $ScenarioRoot -Plan $plan
```

- [ ] **Step 6: Wire `postSeed`, expected artifacts, and write-free validation**

Add to `bazaar-run-recovery`:

```json
"postSeed": "tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1"
```

Append these expected artifacts:

```json
"bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-result-capture/review-run.json",
"bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-human-triage/review-run.json",
"bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-finalize/review-run.json",
"bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/malformed-run-hidden/review-run.json",
"bob-managed/test-data/invalid/review-result-schema-error.json",
"bob-managed/test-data/invalid/review-result-id-mismatch.json"
```

In `Assert-ScenarioManifest`:

```powershell
if ($scenario.psobject.Properties.Name -contains "postSeed") {
  Assert-RepositoryRelativePath $RepoRoot ([string]$scenario.postSeed) "$($scenario.id).postSeed" -MustExist | Out-Null
}
```

In the runner's `-ValidateOnly` branch, before returning:

```powershell
foreach ($validationScenario in $selected) {
  if ($validationScenario.psobject.Properties.Name -contains "postSeed") {
    $seedPath = Assert-RepositoryRelativePath $RepoRoot ([string]$validationScenario.postSeed) "$($validationScenario.id).postSeed" -MustExist
    & $seedPath -ValidateOnly
  }
}
```

- [ ] **Step 7: Verify GREEN without validation writes**

```powershell
$root = Join-Path $env:TEMP "bob-recovery-seed-validate-only"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
pwsh -NoProfile -File tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1 -ScenarioRoot $root -ValidateOnly
if (Test-Path $root) { throw "Seed ValidateOnly wrote files" }
```

Expected: `Bazaar recovery seed plan valid: 4 recovery cases; 2 invalid review results`; root absent.

Standalone write check:

```powershell
$root = Join-Path $env:TEMP "bob-recovery-seed-write"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$root\bob-managed", "$root\bazaar-source" | Out-Null
pwsh -NoProfile -File tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1 -ScenarioRoot $root
Get-Content "$root\bob-managed\.bob-review-records\campaigns\real-machine-recovery\records\resume-finalize\review-run.json" -Raw | ConvertFrom-Json | Out-Null
Remove-Item $root -Recurse -Force
```

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1 \
  tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "test: seed Bazaar review run recovery scenarios"
```

### Task 6: Add isolated code-consistency validation fixtures

**Files:**

- Create: `tools/real-machine-test-environment/seeds/consistency-validation-errors/review-input-missing-required.yaml`
- Create: `tools/real-machine-test-environment/seeds/consistency-validation-errors/review-input-path-escape.yaml`
- Create: `tools/real-machine-test-environment/seeds/consistency-validation-errors/bob-output-schema-error.yaml`
- Create: `tools/real-machine-test-environment/seeds/consistency-validation-errors/bob-output-unknown-evidence.yaml`
- Create: `tools/real-machine-test-environment/seeds/consistency-validation-errors/traceability-draft-invalid-status.json`
- Modify: `tools/real-machine-test-environment/scenarios.json`
- Modify: `tools/real-machine-test-environment/lib/ScenarioManifest.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- `fixtureCopies` is an array of `{ source, destination }`.
- `source` is repository-relative and must exist without reparse-point escape.
- `destination` is scenario-relative and must begin with `workspace/test-data/invalid/`.
- No destination equals active `review-input.yaml`, Bob output, or traceability AI draft path.
- Unknown evidence fixture is schema-shaped and refers to `UNKNOWN-9999`, causing evidence lookup rejection after YAML/schema parsing.

- [ ] **Step 1: Add failing fixture isolation tests**

Append:

```js
test("consistency invalid fixtures are isolated from active paths", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const scenario = manifest.scenarios.find((entry) => entry.id === "consistency-validation-errors")
  assert.equal(scenario.fixtureCopies.length, 5)
  const activePaths = new Set([
    "workspace/review-input.yaml",
    "workspace/.bob-review/bob-output/bob-output.yaml",
    "workspace/.bob-trace/ai-traceability-draft/ai-draft.json"
  ])
  for (const copy of scenario.fixtureCopies) {
    assertSafeRelativePath(copy.source, "fixture source")
    assertSafeRelativePath(copy.destination, "fixture destination")
    assert.match(copy.destination, /^workspace\/test-data\/invalid\//)
    assert.equal(activePaths.has(copy.destination), false)
    assert.equal(fs.existsSync(path.join(repoRoot, copy.source)), true)
  }
})

test("unknown-evidence output keeps the intended validation boundary", () => {
  const source = fs.readFileSync(path.join(toolRoot, "seeds", "consistency-validation-errors", "bob-output-unknown-evidence.yaml"), "utf8")
  assert.match(source, /schema_version:\s*1/)
  assert.match(source, /result_type:\s*pre_review/)
  assert.match(source, /final_approval:\s*not_performed/)
  assert.match(source, /evidence_id:\s*UNKNOWN-9999/)
  assert.match(source, /coverage_notes:/)
  assert.match(source, /rejected_or_uncertain:/)
})
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because fixture files and `fixtureCopies` are absent.

- [ ] **Step 3: Create the exact invalid fixture files**

`review-input-missing-required.yaml`:

```yaml
schema_version: 1
review:
  id: INVALID-MISSING-REQUIRED
  title: 必須項目不足
artifacts: {}
review_focus: []
```

`review-input-path-escape.yaml`:

```yaml
schema_version: 1
review:
  id: INVALID-PATH-ESCAPE
  title: workspace 外参照
  change_type: maintenance
  purpose: artifact path containment を確認する
  base: main
  head: feature/ai-verification-matrix
  vcs: git
artifacts:
  requirements:
    - path: ../outside-requirements.md
      sections:
        - REQ-OUTSIDE-001
review_focus:
  - requirement-code-consistency
analysis_options:
  include_callers: true
  include_callees: true
  include_global_access: true
  include_struct_impact: true
  include_ledgers: true
  max_call_depth: 1
  max_code_context_lines: 80
  language:
    - c
```

`bob-output-schema-error.yaml`:

```yaml
schema_version: 1
review_summary:
  review_id: INVALID-SCHEMA
  target_range: main..feature/ai-verification-matrix
  result_type: final_review
  final_approval: approved
findings: []
questions: []
coverage_notes: []
rejected_or_uncertain: []
```

`bob-output-unknown-evidence.yaml`:

```yaml
schema_version: 1
review_summary:
  review_id: REVIEW-AI-MATRIX-001
  target_range: main..feature/ai-verification-matrix
  result_type: pre_review
  final_approval: not_performed
  scope_statement: unknown evidence ID の validation を確認する固定出力。
findings:
  - id: PRE-999
    category: requirement-code-consistency
    severity: medium
    confidence: high
    summary: 存在しない evidence を参照する。
    evidence:
      - evidence_id: UNKNOWN-9999
        type: code
        ref: MissingSymbol
    reason: schema validation 後の evidence lookup failure を確認するため。
    impact: 不正な根拠参照を正式成果物へ通さない。
    recommended_action: evidence-index に存在する ID だけを使用する。
    human_check: validation error が UNKNOWN-9999 を示すことを確認する。
questions: []
coverage_notes:
  - id: COV-999
    type: checked
    summary: fixture shape の確認のみ実施した。
rejected_or_uncertain: []
```

`traceability-draft-invalid-status.json`:

```json
{
  "schema_version": 1,
  "documents": [
    {
      "document_id": "RS001",
      "display_id": "要求仕様 INVALID-001",
      "source_path": "docs/requirements-ai-matrix.md",
      "id_source": "extracted"
    }
  ],
  "domains": [
    {
      "code": "PAY",
      "label": "決済",
      "description": "invalid status fixture",
      "status": "accepted"
    }
  ],
  "items": [],
  "links": [],
  "decisions": []
}
```

- [ ] **Step 4: Add `fixtureCopies`, expected artifacts, and manifest validation**

Add to `consistency-validation-errors`:

```json
"fixtureCopies": [
  {
    "source": "tools/real-machine-test-environment/seeds/consistency-validation-errors/review-input-missing-required.yaml",
    "destination": "workspace/test-data/invalid/review-input-missing-required.yaml"
  },
  {
    "source": "tools/real-machine-test-environment/seeds/consistency-validation-errors/review-input-path-escape.yaml",
    "destination": "workspace/test-data/invalid/review-input-path-escape.yaml"
  },
  {
    "source": "tools/real-machine-test-environment/seeds/consistency-validation-errors/bob-output-schema-error.yaml",
    "destination": "workspace/test-data/invalid/bob-output-schema-error.yaml"
  },
  {
    "source": "tools/real-machine-test-environment/seeds/consistency-validation-errors/bob-output-unknown-evidence.yaml",
    "destination": "workspace/test-data/invalid/bob-output-unknown-evidence.yaml"
  },
  {
    "source": "tools/real-machine-test-environment/seeds/consistency-validation-errors/traceability-draft-invalid-status.json",
    "destination": "workspace/test-data/invalid/traceability-draft-invalid-status.json"
  }
]
```

Append the five destinations to `expectedArtifacts`.

In `Assert-ScenarioManifest`:

```powershell
if ($scenario.psobject.Properties.Name -contains "fixtureCopies") {
  foreach ($copy in $scenario.fixtureCopies) {
    Assert-RepositoryRelativePath $RepoRoot ([string]$copy.source) "$($scenario.id).fixtureCopies.source" -MustExist | Out-Null
    Assert-ScenarioRelativePath ([string]$copy.destination) "$($scenario.id).fixtureCopies.destination" | Out-Null
    if ([string]$copy.destination -notmatch "^workspace/test-data/invalid/") {
      throw "Invalid fixture destination must remain isolated: $($copy.destination)"
    }
  }
}
```

- [ ] **Step 5: Verify GREEN and generic safe copy behavior**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

```powershell
$root = Join-Path $env:TEMP "bob-consistency-invalid-copy"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$root\workspace" | Out-Null
pwsh -NoProfile -Command "
  . ./tools/real-machine-test-environment/lib/ScenarioManifest.ps1
  . ./tools/real-machine-test-environment/lib/ScenarioExecution.ps1
  `$m = Read-ScenarioManifest -RepoRoot '$((Get-Location).Path)'
  `$s = @(`$m.scenarios | Where-Object id -eq 'consistency-validation-errors')[0]
  Copy-ScenarioFixtureFiles -RepoRoot '$((Get-Location).Path)' -ScenarioRoot '$root' -FixtureCopies @(`$s.fixtureCopies)
"
if ((Get-ChildItem "$root\workspace\test-data\invalid" -File).Count -ne 5) { throw "Expected five invalid fixtures" }
if (Test-Path "$root\workspace\.bob-review\bob-output\bob-output.yaml") { throw "Fixture polluted the active output path" }
Remove-Item $root -Recurse -Force
```

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/seeds/consistency-validation-errors \
  tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "test: add code consistency validation fixtures"
```

### Task 7: Add the operator runbook and Windows CI contract

**Files:**

- Create: `tools/real-machine-test-environment/README-ja.md`
- Modify: `.github/workflows/extensions-quality.yml`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- README documents exact package, validate, all-scenario, individual, open, result recording, and cleanup commands.
- Workflow path filters cover tool files, both integration launcher directories, code-consistency examples, and both real-machine specifications for pull requests and pushes.
- CI job `real-machine-environment-contracts` runs on `windows-latest`, Node.js 22, and performs only Node contracts plus `-ValidateOnly`.

- [ ] **Step 1: Add failing README and workflow tests**

Append:

```js
test("README documents safe generation and explicit launch", () => {
  const readme = fs.readFileSync(path.join(toolRoot, "README-ja.md"), "utf8")
  for (const pattern of [/npm\.cmd run package/, /-ValidateOnly/, /-Scenario all/, /-OpenScenario bazaar-run-recovery/, /operator-result\.json/, /Remove-Item .* -Recurse -Force/]) {
    assert.match(readme, pattern)
  }
})

test("extensions-quality watches and validates environment contracts", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "extensions-quality.yml"), "utf8")
  for (const watchedPath of [
    "tools/real-machine-test-environment/**",
    "docs/workflows/bazaar-project-rule-review/integration/**",
    "docs/workflows/code-consistency-review/integration/**",
    "docs/workflows/code-consistency-review/examples/**",
    "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md",
    "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  ]) assert.match(workflow, new RegExp(escapeRegExp(watchedPath)))
  assert.match(workflow, /real-machine-environment-contracts:/)
  assert.match(workflow, /runs-on:\s*windows-latest/)
  assert.match(workflow, /node --test scripts\/real-machine-test-environment\.test\.js/)
  assert.match(workflow, /Invoke-BobReviewTestEnvironment\.ps1 -ValidateOnly/)
})
```

- [ ] **Step 2: Run and confirm RED**

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because README and workflow changes are absent.

- [ ] **Step 3: Write the exact operator runbook**

Create `README-ja.md`:

```markdown
# Bob Review 実機テスト用データ環境

`bob-bazaar-review` と `bob-code-consistency-review` の P0 + P1 sandbox を repository 外に生成します。実機操作の合否は自動判定せず、各 scenario の `operator-result.json` に記録します。

## VSIX を package

```powershell
Push-Location extensions\workflow-register
npm.cmd run package
Pop-Location
Push-Location extensions\bob-bazaar-review
npm.cmd run package
Pop-Location
Push-Location extensions\bob-code-consistency-review
npm.cmd run package
Pop-Location
```

## 書き込みなしの contract 検証

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

## P0 + P1 の全環境を生成

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -Scenario all
```

全生成では VS Code を自動起動しません。

## 1 scenario を生成して開く

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -Open
```

## 全生成後に 1 scenario だけ開く

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario all `
  -OpenScenario bazaar-run-recovery
```

## 出力先を固定

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario bazaar-core `
  -OutputRoot C:\bob-uat\run-001
```

既存 path と repository 配下は拒否します。

## 結果記録

- `run-manifest.json`: repository revision、tool version summary、scenario status。
- `run-summary.md`: `ready` / `blocked` / `failed` と package hint。
- `<scenario>/scenario-manifest.json`: launcher、artifact、post-seed、log の結果。
- `<scenario>/operator-checklist.md`: 実機操作手順。
- `<scenario>/operator-result.json`: testcase ごとの `not_run` / `pass` / `fail` / `blocked`。

Generator は `pass` を自動設定しません。Invalid fixture は `test-data/invalid` に隔離されます。

## Cleanup

結果と再現用 evidence が不要になった場合だけ、生成時に表示された output root を削除します。

```powershell
Remove-Item C:\bob-uat\run-001 -Recurse -Force
```
```

- [ ] **Step 4: Extend both workflow path filters**

Add under both `on.pull_request.paths` and `on.push.paths`:

```yaml
      - "tools/real-machine-test-environment/**"
      - "docs/workflows/bazaar-project-rule-review/integration/**"
      - "docs/workflows/code-consistency-review/integration/**"
      - "docs/workflows/code-consistency-review/examples/**"
      - "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
      - "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
```

- [ ] **Step 5: Add the Windows validation job**

Add before `extension-metrics`:

```yaml
  real-machine-environment-contracts:
    name: Real-machine environment contracts
    runs-on: windows-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

      - name: Setup Node.js
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: "22"

      - name: Verify repository contracts
        run: node --test scripts/real-machine-test-environment.test.js

      - name: Verify PowerShell manifest and seed plans
        shell: pwsh
        run: pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

The job does not install npm dependencies, package VSIX files, invoke Bazaar, start VS Code, or call IBM Bob.

- [ ] **Step 6: Verify GREEN and existing launcher contracts**

```bash
node --test scripts/real-machine-test-environment.test.js
node --test extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
node --test extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: all commands pass; no output directory is created by validation.

- [ ] **Step 7: Commit**

```bash
git add tools/real-machine-test-environment/README-ja.md \
  .github/workflows/extensions-quality.yml \
  scripts/real-machine-test-environment.test.js
git commit -m "ci: validate real-machine environment contracts"
```

### Task 8: Run full local generation and record actual verification evidence

**Files:**

- Modify only when a verification command exposes a defect: files created in Tasks 1–7.
- Create: `docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md`

**Interfaces:**

- Verification record contains values read from the tested repository, `environment-versions.json`, `run-manifest.json`, and command result logs.
- It distinguishes environment generation readiness from manual `BZR-RT-*` / `CCR-RT-*` execution.
- It contains no unfilled field markers; the PowerShell command below generates every value from actual state.

- [ ] **Step 1: Run all focused contracts**

```bash
node --test scripts/real-machine-test-environment.test.js
node --test extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
node --test extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run write-free validation**

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: manifest, testcase, path, checklist, fixture, and recovery-plan validation pass without creating an output root.

- [ ] **Step 3: Package the three existing VSIX versions**

```powershell
Push-Location extensions\workflow-register
npm.cmd run package
Pop-Location
Push-Location extensions\bob-bazaar-review
npm.cmd run package
Pop-Location
Push-Location extensions\bob-code-consistency-review
npm.cmd run package
Pop-Location
```

Expected files:

```text
extensions/workflow-register/workflow-register-0.1.0.vsix
extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix
extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix
```

- [ ] **Step 4: Generate all six environments without opening VS Code**

```powershell
$outputRoot = Join-Path $env:TEMP ("bob-review-real-machine-verification-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario all `
  -OutputRoot $outputRoot
$run = Get-Content (Join-Path $outputRoot "run-manifest.json") -Raw | ConvertFrom-Json
$run.scenarios | Format-Table id, status, launchTarget
```

Expected when all external prerequisites exist: six `ready` scenarios and exit code 0. When a prerequisite is unavailable, preserve the actual `blocked` result, non-zero exit, and evidence instead of converting it to a pass.

- [ ] **Step 5: Verify recovery, invalid fixtures, and operator defaults**

```powershell
$recoveryRoot = Join-Path $outputRoot "bazaar-run-recovery\bob-managed"
Get-Content (Join-Path $recoveryRoot ".bob-review-records\campaigns\real-machine-recovery\records\resume-result-capture\review-run.json") -Raw | ConvertFrom-Json | Out-Null
Get-Content (Join-Path $recoveryRoot ".bob-review-records\campaigns\real-machine-recovery\records\resume-human-triage\review-run.json") -Raw | ConvertFrom-Json | Out-Null
Get-Content (Join-Path $recoveryRoot ".bob-review-records\campaigns\real-machine-recovery\records\resume-finalize\review-run.json") -Raw | ConvertFrom-Json | Out-Null
if (-not (Test-Path (Join-Path $recoveryRoot "test-data\invalid\review-result-id-mismatch.json"))) { throw "Bazaar invalid fixture missing" }

$invalidRoot = Join-Path $outputRoot "consistency-validation-errors\workspace\test-data\invalid"
if ((Get-ChildItem $invalidRoot -File).Count -ne 5) { throw "Expected five consistency invalid fixtures" }
if (Test-Path (Join-Path $outputRoot "consistency-validation-errors\workspace\.bob-review\bob-output\bob-output.yaml")) { throw "Generator activated an invalid Bob output" }

foreach ($scenario in $run.scenarios) {
  $operator = Get-Content (Join-Path $scenario.root "operator-result.json") -Raw | ConvertFrom-Json
  if (@($operator.results | Where-Object status -ne "not_run").Count -ne 0) { throw "Generator changed operator results for $($scenario.id)" }
}
```

Expected: all checks pass; malformed run remains intentionally unparsable and is not read by this command.

- [ ] **Step 6: Verify explicit single-scenario opening**

```powershell
$openRoot = Join-Path $env:TEMP ("bob-review-real-machine-open-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -OutputRoot $openRoot `
  -Open
```

Expected: one VS Code window opens with the generated `workspace`; no other scenario directory is generated. Close the disposable window. This launch smoke does not mark GUI testcase IDs as pass.

- [ ] **Step 7: Generate the verification document from actual state**

Run this from the repository root after Step 4. It writes actual values and does not emit unfilled field markers:

```powershell
$verificationPath = "docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md"
$run = Get-Content (Join-Path $outputRoot "run-manifest.json") -Raw | ConvertFrom-Json
$versions = Get-Content (Join-Path $outputRoot "environment-versions.json") -Raw | ConvertFrom-Json
$testCommit = (& git rev-parse HEAD).Trim()
$testBranch = (& git branch --show-current).Trim()
$dirty = @(& git status --porcelain).Count -gt 0
$pwshVersion = $PSVersionTable.PSVersion.ToString()
$windowsVersion = [System.Environment]::OSVersion.VersionString

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Bob Review Real-Machine Test Environment Verification")
$lines.Add("")
$lines.Add("## Revision")
$lines.Add("")
$lines.Add("- Commit: ``$testCommit``")
$lines.Add("- Branch: ``$testBranch``")
$lines.Add("- Dirty: ``$dirty``")
$lines.Add("")
$lines.Add("## Environment")
$lines.Add("")
$lines.Add("| Tool | Version |")
$lines.Add("| --- | --- |")
$lines.Add("| Windows | $windowsVersion |")
$lines.Add("| PowerShell | $pwshVersion |")
$lines.Add("| Node.js | $($versions.node.normalized) |")
$lines.Add("| Git | $($versions.git.normalized) |")
$lines.Add("| Bazaar | $($versions.bzr.normalized) |")
$lines.Add("| VS Code / Bob IDE CLI | $($versions.code.normalized) |")
$lines.Add("")
$lines.Add("## Automated checks")
$lines.Add("")
$lines.Add("- Repository-level environment contracts: PASS")
$lines.Add("- Bazaar integration sandbox contract: PASS")
$lines.Add("- Code-consistency integration sandbox contract: PASS")
$lines.Add("- PowerShell ``-ValidateOnly``: PASS")
$lines.Add("")
$lines.Add("## Generated scenarios")
$lines.Add("")
$lines.Add("| Scenario | Status | Root | Notes |")
$lines.Add("| --- | --- | --- | --- |")
foreach ($scenario in $run.scenarios) {
  $noteParts = @()
  if ($scenario.missingCommands.Count -gt 0) { $noteParts += "missing commands: $($scenario.missingCommands -join ', ')" }
  if ($scenario.missingPaths.Count -gt 0) { $noteParts += "missing paths: $($scenario.missingPaths -join ', ')" }
  if ($scenario.error) { $noteParts += "error: $($scenario.error)" }
  $notes = if ($noteParts.Count -gt 0) { $noteParts -join "; " } else { "generated and artifact-validated" }
  $lines.Add("| $($scenario.id) | $($scenario.status) | ``$($scenario.root)`` | $notes |")
}
$lines.Add("")
$lines.Add("## Evidence checked")
$lines.Add("")
$lines.Add("- Review Run result-capture, human-triage, and finalize seed JSON files parse.")
$lines.Add("- Malformed Review Run remains intentionally malformed.")
$lines.Add("- Bazaar invalid result fixtures remain outside ``.bob/review/results``.")
$lines.Add("- Five code-consistency invalid fixtures remain under ``test-data/invalid``.")
$lines.Add("- Operator result files contain only ``not_run`` before manual execution.")
$lines.Add("- Single-scenario ``-Open`` launches one window.")
$lines.Add("")
$lines.Add("## Manual UAT status")
$lines.Add("")
$lines.Add("Environment generation is verified. Individual ``BZR-RT-*`` and ``CCR-RT-*`` results remain ``not_run`` until an operator executes each generated checklist.")
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $verificationPath) | Out-Null
[System.IO.File]::WriteAllLines($verificationPath, $lines, [System.Text.UTF8Encoding]::new($false))
```

Open the generated document and correct only statements that conflict with the actual command results. If a focused test failed, do not run this script until the defect is fixed and the full focused suite passes.

- [ ] **Step 8: Re-run final checks after every verification fix**

```bash
node --test scripts/real-machine-test-environment.test.js
node --test extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
node --test extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: all commands pass.

- [ ] **Step 9: Commit the verification record**

```bash
git add docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md
git commit -m "docs: record real-machine environment verification"
```

## Final Review Checklist

- [ ] Manifest contains exactly the approved six scenario IDs and no arbitrary command fields.
- [ ] Repository source paths and scenario destination paths use different validators.
- [ ] Runtime-injected launcher arguments cannot be overridden from the manifest.
- [ ] Existing launchers are invoked with `NoLaunch = $true` and remain directly usable.
- [ ] `OutputRoot` cannot be existing, repository-contained, or reparse-point redirected into the repository.
- [ ] Fixture writes and expected artifact checks reject symlink / junction traversal.
- [ ] Blocked and failed scenarios preserve evidence and do not stop independent scenarios.
- [ ] No invalid fixture is copied to an active input or output path.
- [ ] Review Run completed phases have matching required planned artifacts.
- [ ] Resume fixtures cover result capture, human triage, and finalize.
- [ ] Malformed Review Run is excluded by existing runtime behavior rather than repaired.
- [ ] Operator results begin with `not_run`; generation never writes `pass`.
- [ ] Logs and manifests do not include environment variable dictionaries, credentials, tokens, or clipboard contents.
- [ ] Windows CI runs Node contracts and PowerShell `-ValidateOnly`, not full GUI generation.
- [ ] Existing Bazaar and code-consistency integration sandbox tests pass.
- [ ] Verification evidence distinguishes generated-environment readiness from manual UAT completion.
