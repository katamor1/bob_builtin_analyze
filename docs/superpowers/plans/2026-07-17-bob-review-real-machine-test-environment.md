# Bob Review Real-Machine Test Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bob-bazaar-review` と `bob-code-consistency-review` の P0 + P1 実機テスト用データ環境を、既存 sandbox launcher と fixture を再利用して 1 コマンドで再現可能に生成する。

**Architecture:** Repository-level の PowerShell runner が `scenarios.json` を検証し、既存 Bazaar / code-consistency launcher を必ず `-NoLaunch` で呼び出す。Scenario ごとの prerequisite、post-seed、expected artifact、operator checklist、結果記録を共通化し、Bazaar Review Run の中断・再開データと code-consistency の異常系 fixture だけを追加する。Extension runtime や既存 launcher の repository 生成処理は変更しない。

**Tech Stack:** PowerShell 7、Node.js 22 built-in test runner、JSON、YAML fixture、Git / Bazaar CLI、VS Code CLI、GitHub Actions Windows runner。

## Global Constraints

- Approved design `docs/superpowers/specs/2026-07-17-bob-review-real-machine-test-environment-design.md` を実装の正本とする。
- 初版の対象は `bazaar-core`、`bazaar-run-recovery`、`consistency-ai-matrix`、`consistency-traceability`、`consistency-multilang`、`consistency-validation-errors` の 6 scenario とする。
- 既存 `docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1` と `docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1` の Git / Bazaar repository 生成処理を再実装しない。
- 既存 launcher は共通 runner から常に `NoLaunch = true` で呼び出す。複数 scenario 生成時に複数の VS Code window を自動起動しない。
- GUI を起動する場合は `-Open` または `-OpenScenario` で明示した 1 scenario だけを開く。
- Generated scenario は最初から final path に作る。Bazaar workspace が保持する absolute path を壊すため、`.partial` から完成名への rename を行わない。
- `OutputRoot` は repository root 配下および既存 path を拒否する。初版では `-Force`、update、overwrite、reuse を提供しない。
- 1 scenario の失敗で独立した残り scenario を止めない。不足前提は `blocked`、生成異常は `failed` として記録し、1 件でも `blocked` または `failed` があれば process exit code を非 0 にする。
- Manifest から arbitrary executable、shell command、script body を指定できる設計にしない。許可する launcher は既存 2 file だけとし、`Invoke-Expression` を使用しない。
- `RepoRoot`、`SandboxRoot`、`CodeCommand`、`BzrCommand`、`NoLaunch = true` は runner が注入し、manifest から上書きできない。
- Repository-relative path と scenario-relative path を分離し、absolute path、`..` escape、symlink / junction escape を拒否する。
- Invalid fixture は active artifact path に自動配置しない。`test-data/invalid` 配下から operator が明示的に clipboard、editor、または一時コピーで利用する。
- Environment generator は実機テスト結果を自動で `pass` にしない。`operator-result.json` の初期 status はすべて `not_run` とする。
- Environment variable dictionary、token、credential、clipboard contents を log または manifest に保存しない。
- IBM Bob への自動 prompt 投入、AI output の semantic 自動採点、Webview automation、screenshot 自動取得、CLI / VSIX 自動 install は行わない。
- `bob-bazaar-review`、`bob-code-consistency-review`、`workflow-register` の runtime dependency、command ID、workflow provider ID、VSIX version を変更しない。
- Production code の前に focused contract test を追加し、RED を確認してから最小実装を行う。

## Planned File Structure

| Path | Responsibility |
| --- | --- |
| `tools/real-machine-test-environment/scenarios.json` | 6 scenario、generator、prerequisite、testcase、artifact、post-seed / fixture copy の source of truth |
| `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1` | CLI entrypoint、selection、validation、generation loop、任意起動、exit code |
| `tools/real-machine-test-environment/lib/ScenarioManifest.ps1` | Manifest parse、allowlist、path / testcase / group validation |
| `tools/real-machine-test-environment/lib/ScenarioExecution.ps1` | Prerequisite probe、launcher invocation、logging、fixture copy、artifact verification、launch descriptor |
| `tools/real-machine-test-environment/lib/RunEvidence.ps1` | Tool / repository snapshot、run / scenario manifest、summary、checklist、operator result |
| `tools/real-machine-test-environment/checklists/*.md` | Scenario 固有の実機操作と期待結果の template |
| `tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1` | Review Run recovery plan、artifact invariant 検証、filesystem write、Bazaar invalid result fixture |
| `tools/real-machine-test-environment/seeds/consistency-validation-errors/*` | Code-consistency の隔離された invalid input / output fixture |
| `tools/real-machine-test-environment/templates/operator-result.template.json` | Operator result の固定 shape |
| `tools/real-machine-test-environment/README-ja.md` | Package、validate、generate、open、record、cleanup の操作手順 |
| `scripts/real-machine-test-environment.test.js` | Repository-level manifest / fixture / launcher / seed contract test |
| `.github/workflows/extensions-quality.yml` | Tooling 関連 path filter と Windows validation job |

---

### Task 1: Scenario manifest, checklist templates, and repository contract baseline

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

- Produce: manifest schema version `1` with group `p0-p1` and exactly six unique scenario IDs.
- Produce: scenario fields `id`, `extension`, `priorities`, `generator`, `requiredCommands`, `requiredRepositoryPaths`, `checklistTemplate`, `testCases`, `expectedArtifacts`.
- Reserve for later tasks: optional `postSeed` and `fixtureCopies` fields.
- Produce: checklist tokens `{{SCENARIO_ID}}`, `{{SCENARIO_ROOT}}`, `{{WORKSPACE_PATH}}`, `{{BOB_ROOT}}`, `{{VCS_ROOT}}`, `{{REVIEW_TARGET}}`, `{{LAUNCH_COMMAND}}`, `{{TEST_CASES}}`, `{{EXPECTED_ARTIFACTS}}`.
- Produce: operator result shape with statuses `not_run`, `pass`, `fail`, `blocked`.

- [ ] **Step 1: Write the failing repository-level manifest test**

Create `scripts/real-machine-test-environment.test.js` with path and testcase validation before the manifest files exist:

```js
const assert = require("node:assert/strict")
const fs = require("node:fs")
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

function assertSafeRelativePath(value, label) {
  assert.equal(path.isAbsolute(value), false, `${label} must be relative`)
  assert.equal(value.split(/[\\/]+/).includes(".."), false, `${label} must not escape with ..`)
}

function assertTestCaseExists(testCaseId) {
  const source = testCaseId.startsWith("BZR-") ? bazaarSpec : consistencySpec
  const escaped = testCaseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  assert.match(source, new RegExp(`^#{3,4}\\s+${escaped}(?:\\s|$)`, "m"), `${testCaseId} must exist in its real-machine spec`)
}

test("real-machine manifest defines the approved P0 + P1 scenarios", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(manifest.groups["p0-p1"], [
    "bazaar-core",
    "bazaar-run-recovery",
    "consistency-ai-matrix",
    "consistency-traceability",
    "consistency-multilang",
    "consistency-validation-errors"
  ])
  const ids = manifest.scenarios.map((scenario) => scenario.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids, manifest.groups["p0-p1"])

  for (const scenario of manifest.scenarios) {
    assert.match(scenario.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.equal(scenario.generator.kind, "existing-launcher")
    assertSafeRelativePath(scenario.generator.path, `${scenario.id}.generator.path`)
    assertSafeRelativePath(scenario.checklistTemplate, `${scenario.id}.checklistTemplate`)
    for (const requiredPath of scenario.requiredRepositoryPaths) {
      assertSafeRelativePath(requiredPath, `${scenario.id}.requiredRepositoryPaths`)
    }
    for (const artifactPath of scenario.expectedArtifacts) {
      assertSafeRelativePath(artifactPath, `${scenario.id}.expectedArtifacts`)
    }
    for (const testCaseId of scenario.testCases) assertTestCaseExists(testCaseId)
    assert.equal(fs.existsSync(path.join(repoRoot, scenario.generator.path)), true)
    assert.equal(fs.existsSync(path.join(repoRoot, scenario.checklistTemplate)), true)
  }
})

test("operator result template starts without automatic pass results", () => {
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

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL with `ENOENT` for `tools/real-machine-test-environment/scenarios.json`.

- [ ] **Step 3: Create the six-scenario manifest**

Create `scenarios.json` with exact IDs, launchers, required repository paths, testcase IDs, and base expected artifacts:

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

- [ ] **Step 4: Create the operator-result shape and scenario-specific checklist templates**

Create `templates/operator-result.template.json` exactly as asserted by the test. Create six checklist templates using the shared tokens and these scenario-specific operation blocks:

```markdown
<!-- bazaar-core.md -->
# {{SCENARIO_ID}} 実機チェックリスト

- Scenario root: `{{SCENARIO_ROOT}}`
- Bob root: `{{BOB_ROOT}}`
- Bazaar root: `{{VCS_ROOT}}`
- Review target: {{REVIEW_TARGET}}
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. Bazaar Review GUI を開き、Bob root と Bazaar root が分離して表示されることを確認する。
2. revision range `1..2` を読み込み、packet を生成する。
3. Bob Workflow UI から `bazaar-project-rule-review` を実行する。
4. valid / invalid review-result の capture と validation を行う。
5. MCP `initialize`、`tools/list`、readonly Bazaar tools、allowed roots を確認する。
6. Shift-JIS fixture が packet で大きく文字化けしないことを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に結果と evidence path を記録する。
```

```markdown
<!-- bazaar-run-recovery.md -->
# {{SCENARIO_ID}} 実機チェックリスト

- Scenario root: `{{SCENARIO_ROOT}}`
- Bob root: `{{BOB_ROOT}}`
- Bazaar root: `{{VCS_ROOT}}`
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. Review GUI の未完了 run 一覧を開く。
2. `resume-result-capture` が結果取り込みへ再開することを確認する。
3. `resume-human-triage` が人による判定へ再開することを確認する。
4. `resume-finalize` が finalize へ再開することを確認する。
5. `malformed-run-hidden` が通常一覧に表示されないことを確認する。
6. `test-data/invalid` の schema error と review ID mismatch を capture / validate し、正式 result directory に保存されないことを確認する。
7. decision ごとの必須値と metrics 補正 validation を確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}
```

```markdown
<!-- consistency-ai-matrix.md -->
# {{SCENARIO_ID}} 実機チェックリスト

- Workspace: `{{WORKSPACE_PATH}}`
- Review target: {{REVIEW_TARGET}}
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. Review Wizard または Bob Workflow UI から preprocess を実行する。
2. `changed-files.json`、`evidence-index.json`、`bob-input.md` を確認する。
3. 実 AI では OK / NG / N/A / question の代表ケースを確認する。
4. Offline smoke では同梱 expected output を capture、validate、triage する。
5. Human triage artifacts と Developer Tools Console を確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}
```

```markdown
<!-- consistency-traceability.md -->
# {{SCENARIO_ID}} 実機チェックリスト

- Workspace: `{{WORKSPACE_PATH}}`
- Review target: {{REVIEW_TARGET}}
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. Traceability AI draft prompt を生成する。
2. proposed-only JSON を catalog に反映する。
3. Traceability Prep で accepted / rejected / deprecated を人間が判断する。
4. Gate report を生成し、accepted item から review-input を作る。
5. Preprocess、Bob output capture、validate、triage を順に実行する。
6. HTML / script 風文字列が UI text として escape されることを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}
```

```markdown
<!-- consistency-multilang.md -->
# {{SCENARIO_ID}} 実機チェックリスト

- Workspace: `{{WORKSPACE_PATH}}`
- Review target: {{REVIEW_TARGET}}
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. `main..feature/multi-language-git-review` を対象に preprocess を実行する。
2. `changed-files.json` に TypeScript、Python、Java が含まれることを確認する。
3. `evidence-index.json` と `code-slices/*.md` に `SRC-*` evidence があることを確認する。
4. `bob-input.md` に汎用コード変更根拠が含まれることを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}
```

```markdown
<!-- consistency-validation-errors.md -->
# {{SCENARIO_ID}} 実機チェックリスト

- Workspace: `{{WORKSPACE_PATH}}`
- Invalid fixtures: `{{WORKSPACE_PATH}}/test-data/invalid`
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. `review-input-missing-required.yaml` を editor で開き diagnostics を実行する。
2. `review-input-path-escape.yaml` を一時的に active input path へコピーし、workspace 外 path が拒否されることを確認してから元の input を復元する。
3. `bob-output-schema-error.yaml` を capture / validate し、schema error を確認する。
4. `bob-output-unknown-evidence.yaml` を validate し、unknown evidence ID を確認する。
5. `traceability-draft-invalid-status.json` を適用し、proposed-only contract rejection を確認する。
6. Invalid fixture が正式 artifact path に残っていないことを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/templates/operator-result.template.json \
  tools/real-machine-test-environment/checklists \
  scripts/real-machine-test-environment.test.js
git commit -m "test: define real-machine environment scenarios"
```

### Task 2: Manifest validation module and write-free `-ValidateOnly`

**Files:**

- Create: `tools/real-machine-test-environment/lib/ScenarioManifest.ps1`
- Create: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- Produce: `Read-ScenarioManifest -RepoRoot <string> -ManifestPath <string>`.
- Produce: `Assert-ScenarioManifest -RepoRoot <string> -Manifest <pscustomobject>`.
- Produce: `Resolve-ScenarioSelection -Manifest <pscustomobject> -Scenario <string>` returning an array of scenario records.
- Produce: `Assert-RepositoryRelativePath` and `Assert-ScenarioRelativePath`.
- Produce: runner parameters `RepoRoot`, `OutputRoot`, `Scenario`, `CodeCommand`, `BzrCommand`, `Open`, `OpenScenario`, `ValidateOnly`.
- Guarantee: `-ValidateOnly` performs no output directory creation, launcher execution, fixture write, or GUI launch.

- [ ] **Step 1: Add failing static contracts for the runner and module**

Append to `scripts/real-machine-test-environment.test.js`:

```js
test("runner exposes the approved write-free validation interface", () => {
  const runner = fs.readFileSync(path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1"), "utf8")
  const manifestModule = fs.readFileSync(path.join(toolRoot, "lib", "ScenarioManifest.ps1"), "utf8")
  assert.match(runner, /\[switch\]\$ValidateOnly/)
  assert.match(runner, /\[switch\]\$Open/)
  assert.match(runner, /\[string\]\$OpenScenario/)
  assert.match(runner, /Resolve-ScenarioSelection/)
  assert.match(runner, /Manifest validation succeeded/)
  assert.doesNotMatch(runner, /Invoke-Expression/)
  assert.match(manifestModule, /function Read-ScenarioManifest/)
  assert.match(manifestModule, /function Assert-ScenarioManifest/)
  assert.match(manifestModule, /function Assert-RepositoryRelativePath/)
  assert.match(manifestModule, /function Assert-ScenarioRelativePath/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because the runner and manifest module do not exist.

- [ ] **Step 3: Implement repository/scenario path validation and testcase lookup**

Create `ScenarioManifest.ps1` with strict mode and these concrete functions:

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
  return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Test-PathInsideRoot {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Candidate
  )
  $rootPath = Get-NormalizedFullPath $Root
  $candidatePath = Get-NormalizedFullPath $Candidate
  $relative = [System.IO.Path]::GetRelativePath($rootPath, $candidatePath)
  return $relative -eq "." -or (
    -not [System.IO.Path]::IsPathRooted($relative) -and
    $relative -ne ".." -and
    -not $relative.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")
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
  if (($RelativePath -split "[\\/]+") -contains "..") { throw "$FieldName must not escape with ..: $RelativePath" }
  $resolved = Get-NormalizedFullPath (Join-Path $RepoRoot $RelativePath)
  if (-not (Test-PathInsideRoot $RepoRoot $resolved)) { throw "$FieldName resolves outside RepoRoot: $RelativePath" }
  if ($MustExist -and -not (Test-Path -LiteralPath $resolved)) { throw "$FieldName not found: $RelativePath" }
  return $resolved
}

function Assert-ScenarioRelativePath {
  param(
    [Parameter(Mandatory)][string]$RelativePath,
    [Parameter(Mandatory)][string]$FieldName
  )
  if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw "$FieldName must be scenario-relative: $RelativePath" }
  if (($RelativePath -split "[\\/]+") -contains "..") { throw "$FieldName must not escape with ..: $RelativePath" }
  return $RelativePath
}

function Assert-TestCaseExists {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$TestCaseId
  )
  $specPath = if ($TestCaseId.StartsWith("BZR-")) {
    Join-Path $RepoRoot "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
  } elseif ($TestCaseId.StartsWith("CCR-")) {
    Join-Path $RepoRoot "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  } else {
    throw "Unsupported real-machine testcase prefix: $TestCaseId"
  }
  $content = [System.IO.File]::ReadAllText($specPath)
  $pattern = "(?m)^#{3,4}\s+$([regex]::Escape($TestCaseId))(?:\s|$)"
  if ($content -notmatch $pattern) { throw "Testcase not found in real-machine specification: $TestCaseId" }
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

function Assert-ScenarioManifest {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][pscustomobject]$Manifest
  )
  if ($Manifest.schemaVersion -ne 1) { throw "Unsupported manifest schemaVersion: $($Manifest.schemaVersion)" }
  $ids = @($Manifest.scenarios | ForEach-Object { [string]$_.id })
  if ($ids.Count -ne (@($ids | Select-Object -Unique)).Count) { throw "Scenario IDs must be unique" }
  foreach ($scenario in $Manifest.scenarios) {
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
      foreach ($name in $argumentNames) {
        if ($name -ne "Sample") { throw "Unsupported code-consistency manifest argument: $name" }
      }
      if ($script:AllowedSamples -notcontains [string]$scenario.generator.arguments.Sample) {
        throw "Unsupported code-consistency Sample: $($scenario.generator.arguments.Sample)"
      }
    }
    foreach ($testCaseId in $scenario.testCases) { Assert-TestCaseExists $RepoRoot ([string]$testCaseId) }
  }
  $groupIds = @($Manifest.groups."p0-p1")
  if ($groupIds.Count -ne (@($groupIds | Select-Object -Unique)).Count) { throw "p0-p1 group must not contain duplicates" }
  foreach ($groupId in $groupIds) {
    if ($ids -notcontains [string]$groupId) { throw "p0-p1 references unknown scenario: $groupId" }
  }
}

function Resolve-ScenarioSelection {
  param(
    [Parameter(Mandatory)][pscustomobject]$Manifest,
    [Parameter(Mandatory)][string]$Scenario
  )
  $requestedIds = if ($Scenario -eq "all") { @($Manifest.groups."p0-p1") } else { @($Scenario) }
  $selected = foreach ($id in $requestedIds) {
    $match = @($Manifest.scenarios | Where-Object { $_.id -eq $id })
    if ($match.Count -ne 1) { throw "Unknown scenario: $id" }
    $match[0]
  }
  return @($selected)
}
```

- [ ] **Step 4: Implement the runner parameter gate and write-free validation branch**

Create `Invoke-BobReviewTestEnvironment.ps1` with no generation behavior yet:

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

throw "Generation is not implemented until Task 4; use -ValidateOnly"
```

- [ ] **Step 5: Verify GREEN without filesystem writes**

Run:

```powershell
$before = Get-ChildItem $env:TEMP -Filter "bob-review-real-machine-*" -ErrorAction SilentlyContinue
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
$after = Get-ChildItem $env:TEMP -Filter "bob-review-real-machine-*" -ErrorAction SilentlyContinue
if ($after.Count -ne $before.Count) { throw "ValidateOnly created an output directory" }
```

Expected output includes `Manifest validation succeeded: 6 scenarios; selected=6`; no output directory is created.

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: validate real-machine environment manifest"
```

### Task 3: Prerequisite probing, safe launcher invocation, artifact validation, and launch descriptors

**Files:**

- Create: `tools/real-machine-test-environment/lib/ScenarioExecution.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- Produce: `Get-ScenarioPrerequisiteReport -RepoRoot -Scenario -CodeCommand -BzrCommand`.
- Produce: `New-LauncherInvocation -RepoRoot -ScenarioRoot -Scenario -CodeCommand -BzrCommand`.
- Produce: `Invoke-ScenarioLauncher -Invocation -LogPath`.
- Produce: `Test-ExpectedScenarioArtifacts -ScenarioRoot -ExpectedArtifacts`.
- Produce: `Copy-ScenarioFixtureFiles -RepoRoot -ScenarioRoot -FixtureCopies`.
- Produce: `Get-ScenarioLaunchDescriptor -RepoRoot -ScenarioRoot -Scenario -CodeCommand`.
- Guarantee: launcher argument splatting injects `NoLaunch = $true` and never uses manifest-provided `RepoRoot`, `SandboxRoot`, `CodeCommand`, `BzrCommand`, or `SkipExtensionInstall`.

- [ ] **Step 1: Add failing execution contract tests**

Append static assertions:

```js
test("scenario execution enforces launcher injection and avoids shell evaluation", () => {
  const source = fs.readFileSync(path.join(toolRoot, "lib", "ScenarioExecution.ps1"), "utf8")
  assert.match(source, /function Get-ScenarioPrerequisiteReport/)
  assert.match(source, /function New-LauncherInvocation/)
  assert.match(source, /NoLaunch\s*=\s*\$true/)
  assert.match(source, /function Invoke-ScenarioLauncher/)
  assert.match(source, /function Test-ExpectedScenarioArtifacts/)
  assert.match(source, /function Get-ScenarioLaunchDescriptor/)
  assert.doesNotMatch(source, /Invoke-Expression/)
  assert.doesNotMatch(source, /SkipExtensionInstall\s*=/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because `ScenarioExecution.ps1` is absent.

- [ ] **Step 3: Implement prerequisite and invocation construction**

Create `ScenarioExecution.ps1` with these concrete contracts:

```powershell
Set-StrictMode -Version Latest

$script:PackageHints = @{
  "extensions/workflow-register/workflow-register-0.1.0.vsix" = "cd extensions/workflow-register; npm.cmd run package"
  "extensions/bob-bazaar-review/bob-bazaar-review-0.3.0.vsix" = "cd extensions/bob-bazaar-review; npm.cmd run package"
  "extensions/bob-code-consistency-review/bob-code-consistency-review-0.1.0.vsix" = "cd extensions/bob-code-consistency-review; npm.cmd run package"
  "bob2/bob-code" = "Restore the expanded IBM Bob extension at bob2/bob-code"
}

function Get-ScenarioPrerequisiteReport {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][string]$CodeCommand,
    [Parameter(Mandatory)][string]$BzrCommand
  )
  $missingCommands = @()
  foreach ($commandName in $Scenario.requiredCommands) {
    $probeName = if ($commandName -eq "code") { $CodeCommand } elseif ($commandName -eq "bzr") { $BzrCommand } else { [string]$commandName }
    if (-not (Get-Command $probeName -ErrorAction SilentlyContinue)) { $missingCommands += $probeName }
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
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][string]$CodeCommand,
    [Parameter(Mandatory)][string]$BzrCommand
  )
  $launcherPath = Join-Path $RepoRoot ([string]$Scenario.generator.path)
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
  return [pscustomobject]@{ launcherPath = $launcherPath; arguments = $arguments }
}
```

- [ ] **Step 4: Implement logged execution, fixture copy, artifact containment, and launch descriptor**

Append:

```powershell
function Invoke-ScenarioLauncher {
  param(
    [Parameter(Mandatory)][pscustomobject]$Invocation,
    [Parameter(Mandatory)][string]$LogPath
  )
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

function Copy-ScenarioFixtureFiles {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [object[]]$FixtureCopies = @()
  )
  foreach ($copy in $FixtureCopies) {
    $source = Assert-RepositoryRelativePath $RepoRoot ([string]$copy.source) "fixtureCopies.source" -MustExist
    Assert-ScenarioRelativePath ([string]$copy.destination) "fixtureCopies.destination" | Out-Null
    $destination = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot ([string]$copy.destination)))
    if (-not (Test-PathInsideRoot $ScenarioRoot $destination)) { throw "Fixture destination escapes scenario root: $destination" }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

function Test-ExpectedScenarioArtifacts {
  param(
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][object[]]$ExpectedArtifacts
  )
  $checks = foreach ($relativePathValue in $ExpectedArtifacts) {
    $relativePath = Assert-ScenarioRelativePath ([string]$relativePathValue) "expectedArtifacts"
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot $relativePath))
    $contained = Test-PathInsideRoot $ScenarioRoot $candidate
    $exists = $contained -and (Test-Path -LiteralPath $candidate)
    [pscustomobject]@{ path = $relativePath; resolvedPath = $candidate; contained = $contained; exists = $exists }
  }
  return [pscustomobject]@{
    valid = @($checks | Where-Object { -not $_.contained -or -not $_.exists }).Count -eq 0
    checks = @($checks)
  }
}

function Get-ScenarioLaunchDescriptor {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][string]$CodeCommand
  )
  $isBazaar = [string]$Scenario.generator.path -like "*bazaar-project-rule-review*"
  $target = if ($isBazaar) {
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

`ScenarioExecution.ps1` dot-sources `ScenarioManifest.ps1` at its top so containment helpers are available:

```powershell
. (Join-Path $PSScriptRoot "ScenarioManifest.ps1")
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

Run an in-memory argument probe:

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

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/lib/ScenarioExecution.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: execute real-machine environment scenarios safely"
```

### Task 4: Run evidence, operator artifacts, generation loop, failure isolation, and single-window launch

**Files:**

- Create: `tools/real-machine-test-environment/lib/RunEvidence.ps1`
- Modify: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- Produce: `Get-RepositorySnapshot`, `Get-ToolVersionSnapshot`, `Write-JsonUtf8`, `New-OperatorResult`, `Expand-ChecklistTemplate`, `Write-ScenarioEvidence`, `Write-RunEvidence`.
- Runner status values: `not_started`, `ready`, `blocked`, `failed`.
- Scenario result fields: `id`, `status`, `root`, `launchTarget`, `logPath`, `missingCommands`, `missingPaths`, `packageHints`, `error`, `artifactChecks`.
- Guarantee: blocked and failed scenarios do not stop later scenarios.
- Guarantee: blocked / failed scenarios still receive diagnostic evidence under their final scenario path.

- [ ] **Step 1: Add a failing blocked-scenario integration test**

Append a Windows-only test that selects one scenario with an intentionally missing VS Code command and checks generated evidence:

```js
const childProcess = require("node:child_process")
const os = require("node:os")

test("runner records a missing command as blocked without invoking a launcher", { skip: process.platform !== "win32" }, () => {
  const outputRoot = path.join(os.tmpdir(), `bob-review-real-machine-test-${process.pid}-${Date.now()}`)
  const runner = path.join(toolRoot, "Invoke-BobReviewTestEnvironment.ps1")
  const result = childProcess.spawnSync("pwsh", [
    "-NoProfile", "-File", runner,
    "-Scenario", "consistency-ai-matrix",
    "-OutputRoot", outputRoot,
    "-CodeCommand", "__missing_bob_code_command__"
  ], { cwd: repoRoot, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  const manifest = JSON.parse(fs.readFileSync(path.join(outputRoot, "run-manifest.json"), "utf8"))
  assert.equal(manifest.scenarios[0].status, "blocked")
  assert.deepEqual(manifest.scenarios[0].missingCommands, ["__missing_bob_code_command__"])
  assert.equal(fs.existsSync(path.join(outputRoot, "consistency-ai-matrix", "scenario-manifest.json")), true)
  assert.equal(fs.existsSync(path.join(outputRoot, "consistency-ai-matrix", "operator-result.json")), true)
  assert.equal(manifest.scenarios[0].launchTarget, null)
  fs.rmSync(outputRoot, { recursive: true, force: true })
})
```

- [ ] **Step 2: Verify RED**

Run on Windows:

```powershell
node --test scripts/real-machine-test-environment.test.js
```

Expected: blocked-scenario test fails because generation is not implemented.

- [ ] **Step 3: Implement evidence helpers**

Create `RunEvidence.ps1`:

```powershell
Set-StrictMode -Version Latest

function Write-JsonUtf8 {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)]$Value)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $json = $Value | ConvertTo-Json -Depth 50
  [System.IO.File]::WriteAllText($Path, "$json`n", [System.Text.UTF8Encoding]::new($false))
}

function Invoke-VersionProbe {
  param([Parameter(Mandatory)][string]$Command, [Parameter(Mandatory)][string[]]$Arguments)
  try {
    $output = & $Command @Arguments 2>&1 | ForEach-Object { [string]$_ }
    $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
    return [pscustomobject]@{
      available = $exitCode -eq 0
      exitCode = $exitCode
      normalized = if ($output.Count -gt 0) { $output[0].Trim() } else { "" }
      rawOutput = @($output)
    }
  } catch {
    return [pscustomobject]@{ available = $false; exitCode = $null; normalized = "unavailable"; rawOutput = @($_.Exception.Message) }
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
  param([Parameter(Mandatory)][string]$RepoRoot)
  $commit = (& git -C $RepoRoot rev-parse HEAD 2>$null | Select-Object -First 1)
  $branch = (& git -C $RepoRoot branch --show-current 2>$null | Select-Object -First 1)
  $dirtyLines = @(& git -C $RepoRoot status --porcelain 2>$null)
  return [ordered]@{
    root = $RepoRoot
    commit = if ($commit) { $commit.Trim() } else { "unavailable" }
    branch = if ($branch) { $branch.Trim() } else { "detached-or-unavailable" }
    dirty = $dirtyLines.Count -gt 0
  }
}

function New-OperatorResult {
  param([Parameter(Mandatory)][pscustomobject]$Scenario)
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
  param(
    [Parameter(Mandatory)][string]$Template,
    [Parameter(Mandatory)][hashtable]$Tokens
  )
  $expanded = $Template
  foreach ($name in $Tokens.Keys) { $expanded = $expanded.Replace("{{$name}}", [string]$Tokens[$name]) }
  if ($expanded -match "\{\{[A-Z0-9_]+\}\}") { throw "Checklist contains unresolved token: $($Matches[0])" }
  return $expanded
}

function Write-ScenarioEvidence {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$ScenarioRoot,
    [Parameter(Mandatory)][pscustomobject]$Scenario,
    [Parameter(Mandatory)][hashtable]$ScenarioRecord,
    [Parameter(Mandatory)][hashtable]$ChecklistTokens
  )
  New-Item -ItemType Directory -Force -Path $ScenarioRoot | Out-Null
  $templatePath = Join-Path $RepoRoot ([string]$Scenario.checklistTemplate)
  $template = [System.IO.File]::ReadAllText($templatePath)
  $checklist = Expand-ChecklistTemplate -Template $template -Tokens $ChecklistTokens
  [System.IO.File]::WriteAllText((Join-Path $ScenarioRoot "operator-checklist.md"), $checklist, [System.Text.UTF8Encoding]::new($false))
  Write-JsonUtf8 (Join-Path $ScenarioRoot "operator-result.json") (New-OperatorResult $Scenario)
  Write-JsonUtf8 (Join-Path $ScenarioRoot "scenario-manifest.json") $ScenarioRecord
}

function Write-RunEvidence {
  param(
    [Parameter(Mandatory)][string]$OutputRoot,
    [Parameter(Mandatory)]$Repository,
    [Parameter(Mandatory)]$Versions,
    [Parameter(Mandatory)][object[]]$ScenarioRecords
  )
  Write-JsonUtf8 (Join-Path $OutputRoot "environment-versions.json") $Versions
  $normalizedTools = [ordered]@{}
  foreach ($name in @("code", "node", "git", "bzr")) { $normalizedTools[$name] = $Versions[$name].normalized }
  $runManifest = [ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    repository = $Repository
    tools = $normalizedTools
    scenarios = $ScenarioRecords
  }
  Write-JsonUtf8 (Join-Path $OutputRoot "run-manifest.json") $runManifest
  $rows = @($ScenarioRecords | ForEach-Object {
    "| $($_.id) | $($_.status) | $([string]::Join(', ', @($_.missingCommands))) | $([string]::Join(', ', @($_.missingPaths))) |"
  })
  $summary = @(
    "# Bob Review Real-Machine Environment",
    "",
    "- Repository commit: `$($Repository.commit)`",
    "- Branch: `$($Repository.branch)`",
    "- Dirty: `$($Repository.dirty)`",
    "",
    "| Scenario | Status | Missing commands | Missing paths |",
    "| --- | --- | --- | --- |",
    $rows,
    "",
    "## Package hints",
    "",
    @($ScenarioRecords.packageHints | Select-Object -Unique | ForEach-Object { "- `$_`" })
  ) -join "`n"
  [System.IO.File]::WriteAllText((Join-Path $OutputRoot "run-summary.md"), "$summary`n", [System.Text.UTF8Encoding]::new($false))
}
```

- [ ] **Step 4: Replace the runner's generation placeholder with the isolated scenario loop**

Dot-source both new modules after `ScenarioManifest.ps1`:

```powershell
. (Join-Path $PSScriptRoot "lib\ScenarioExecution.ps1")
. (Join-Path $PSScriptRoot "lib\RunEvidence.ps1")
```

After the `-ValidateOnly` branch, implement output-root safety and generation:

```powershell
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $env:TEMP ("bob-review-real-machine-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
}
$repoFull = Get-NormalizedFullPath $RepoRoot
$outputFull = Get-NormalizedFullPath $OutputRoot
if (Test-PathInsideRoot $repoFull $outputFull) { throw "OutputRoot must be outside RepoRoot: $outputFull" }
if (Test-Path -LiteralPath $outputFull) { throw "OutputRoot already exists: $outputFull" }
New-Item -ItemType Directory -Path $outputFull | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputFull "_logs") | Out-Null

$repositorySnapshot = Get-RepositorySnapshot $RepoRoot
$versions = Get-ToolVersionSnapshot -CodeCommand $CodeCommand -BzrCommand $BzrCommand
$scenarioRecords = [System.Collections.Generic.List[object]]::new()

foreach ($selectedScenario in $selected) {
  $scenarioRoot = Join-Path $outputFull ([string]$selectedScenario.id)
  $logPath = Join-Path $outputFull ("_logs\{0}.log" -f $selectedScenario.id)
  $prerequisites = Get-ScenarioPrerequisiteReport -RepoRoot $RepoRoot -Scenario $selectedScenario -CodeCommand $CodeCommand -BzrCommand $BzrCommand
  $launch = $null
  $errorMessage = $null
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
        if ($selectedScenario.psobject.Properties.Name -contains "fixtureCopies") {
          Copy-ScenarioFixtureFiles -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -FixtureCopies @($selectedScenario.fixtureCopies)
        }
        if ($selectedScenario.psobject.Properties.Name -contains "postSeed") {
          $seedPath = Assert-RepositoryRelativePath $RepoRoot ([string]$selectedScenario.postSeed) "$($selectedScenario.id).postSeed" -MustExist
          & $seedPath -ScenarioRoot $scenarioRoot
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
    artifactChecks = @($artifactResult.checks)
    testCases = @($selectedScenario.testCases)
  }
  $tokens = @{
    SCENARIO_ID = $selectedScenario.id
    SCENARIO_ROOT = $scenarioRoot
    WORKSPACE_PATH = if ($selectedScenario.extension -eq "bob-bazaar-review") { (Join-Path $scenarioRoot "bob-bazaar-review.code-workspace") } else { (Join-Path $scenarioRoot "workspace") }
    BOB_ROOT = if ($selectedScenario.extension -eq "bob-bazaar-review") { (Join-Path $scenarioRoot "bob-managed") } else { (Join-Path $scenarioRoot "workspace") }
    VCS_ROOT = if ($selectedScenario.extension -eq "bob-bazaar-review") { (Join-Path $scenarioRoot "bazaar-source") } else { (Join-Path $scenarioRoot "workspace") }
    REVIEW_TARGET = if ($selectedScenario.extension -eq "bob-bazaar-review") { "revision range 1..2" } else { [string]$selectedScenario.generator.arguments.Sample }
    LAUNCH_COMMAND = if ($launch) { $launch.commandLine } else { "blocked: prerequisites are missing" }
    TEST_CASES = (@($selectedScenario.testCases | ForEach-Object { "- `$_`" }) -join "`n")
    EXPECTED_ARTIFACTS = (@($selectedScenario.expectedArtifacts | ForEach-Object { "- `$_`" }) -join "`n")
  }
  Write-ScenarioEvidence -RepoRoot $RepoRoot -ScenarioRoot $scenarioRoot -Scenario $selectedScenario -ScenarioRecord $record -ChecklistTokens $tokens
  if ($status -eq "failed") { Write-JsonUtf8 (Join-Path $scenarioRoot "generation-failure.json") ([ordered]@{ scenarioId = $selectedScenario.id; error = $errorMessage; logPath = $logPath }) }
  $scenarioRecords.Add([pscustomobject]$record)
}

Write-RunEvidence -OutputRoot $outputFull -Repository $repositorySnapshot -Versions $versions -ScenarioRecords @($scenarioRecords)
```

Implement one-window launch after all evidence is written:

```powershell
$requestedOpenId = if ($Open) { [string]$selected[0].id } else { $OpenScenario }
if ($requestedOpenId) {
  $record = @($scenarioRecords | Where-Object id -eq $requestedOpenId)[0]
  if ($record.status -ne "ready") { throw "Cannot open non-ready scenario: $requestedOpenId ($($record.status))" }
  $descriptor = Get-ScenarioLaunchDescriptor -RepoRoot $RepoRoot -ScenarioRoot $record.root -Scenario (@($selected | Where-Object id -eq $requestedOpenId)[0]) -CodeCommand $CodeCommand
  Start-Process -FilePath $descriptor.command -ArgumentList $descriptor.arguments
}

$unready = @($scenarioRecords | Where-Object { $_.status -eq "blocked" -or $_.status -eq "failed" })
if ($unready.Count -gt 0) { exit 1 }
```

- [ ] **Step 5: Verify GREEN and no automatic pass results**

Run on Windows:

```powershell
node --test scripts/real-machine-test-environment.test.js
```

Expected: blocked scenario test passes.

Inspect its generated `operator-result.json` before cleanup by temporarily commenting out the test cleanup or running manually:

```powershell
$root = Join-Path $env:TEMP "bob-review-blocked-check"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -OutputRoot $root `
  -CodeCommand __missing_bob_code_command__
$result = Get-Content "$root\consistency-ai-matrix\operator-result.json" -Raw | ConvertFrom-Json
if (@($result.results | Where-Object status -ne "not_run").Count -ne 0) { throw "Generator marked an operator result automatically" }
```

Expected: runner exits non-zero, scenario status is `blocked`, all operator results remain `not_run`.

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/lib/RunEvidence.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: generate real-machine environment evidence"
```

### Task 5: Bazaar Review Run recovery seed and invalid review-result fixtures

**Files:**

- Create: `tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1`
- Modify: `tools/real-machine-test-environment/scenarios.json`
- Modify: `tools/real-machine-test-environment/lib/ScenarioManifest.ps1`
- Modify: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- Produce: `New-BazaarRecoverySeedPlan -ScenarioRoot <string>` returning deterministic file records without writing.
- Produce: `Assert-BazaarRecoverySeedPlan -Plan <object[]>` checking completed phase artifact invariants.
- Produce: `Write-BazaarRecoverySeedPlan -ScenarioRoot -Plan` writing UTF-8 without BOM.
- Script parameters: `ScenarioRoot`, `ValidateOnly`.
- Recovery campaign: `real-machine-recovery`.
- Recovery review IDs: `resume-result-capture`, `resume-human-triage`, `resume-finalize`, `malformed-run-hidden`.
- Invalid result files: `review-result-schema-error.json`, `review-result-id-mismatch.json` under `bob-managed/test-data/invalid`.

- [ ] **Step 1: Add failing seed contracts and manifest expectation**

Append:

```js
test("Bazaar recovery scenario declares a validated post-seed", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const scenario = manifest.scenarios.find((entry) => entry.id === "bazaar-run-recovery")
  assert.equal(scenario.postSeed, "tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1")
  assert.equal(fs.existsSync(path.join(repoRoot, scenario.postSeed)), true)
  assert.ok(scenario.expectedArtifacts.includes("bob-managed/.bob-review-records/campaigns/real-machine-recovery/records/resume-result-capture/review-run.json"))
  assert.ok(scenario.expectedArtifacts.includes("bob-managed/test-data/invalid/review-result-schema-error.json"))
})

test("Bazaar recovery seed contains deterministic recovery and invalid-result cases", () => {
  const seed = fs.readFileSync(path.join(toolRoot, "seeds", "bazaar-run-recovery", "Seed-BazaarRunRecovery.ps1"), "utf8")
  for (const id of ["resume-result-capture", "resume-human-triage", "resume-finalize", "malformed-run-hidden"]) {
    assert.match(seed, new RegExp(id))
  }
  assert.match(seed, /function New-BazaarRecoverySeedPlan/)
  assert.match(seed, /function Assert-BazaarRecoverySeedPlan/)
  assert.match(seed, /reviewPacketPath is required/)
  assert.match(seed, /reviewResultJsonPath is required/)
  assert.match(seed, /triageYamlPath is required/)
  assert.match(seed, /review-result-schema-error\.json/)
  assert.match(seed, /review-result-id-mismatch\.json/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because `postSeed` and the seed script do not exist.

- [ ] **Step 3: Implement deterministic seed-plan construction**

Create the seed script with a fixed base time and helpers that mirror current `ReviewRunContext` fields:

```powershell
param(
  [string]$ScenarioRoot,
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:CampaignId = "real-machine-recovery"
$script:BaseTime = [DateTimeOffset]::Parse("2026-07-17T00:00:00.000Z")

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
    [hashtable]$Artifacts,
    [hashtable]$Phases,
    [int]$BobReviewSeconds,
    [int]$HumanTriageSeconds
  )
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
    metrics = [ordered]@{
      bobReviewSeconds = $BobReviewSeconds
      humanTriageSeconds = $HumanTriageSeconds
      timingSource = "auto_wall_clock"
      correctedByUser = $false
      bobReviewStartedAt = "2026-07-17T00:00:10.000Z"
      humanTriageStartedAt = if ($BobReviewSeconds -gt 0) { "2026-07-17T00:01:00.000Z" } else { $null }
    }
    issues = @()
  }
}
```

Build three valid run cases with exact phase/artifact combinations, plus one malformed file. Artifact paths are workspace-relative with `/` separators:

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
    $run = New-ReviewRun -WorkspaceRoot $workspaceRoot -RepositoryRoot $repositoryRoot -ReviewId $reviewId -Phase $definition.phase -UpdatedAt $definition.updated -Artifacts $artifacts -Phases $phases -BobReviewSeconds ($(if ($definition.result) { 50 } else { 0 })) -HumanTriageSeconds ($(if ($definition.triage) { 60 } else { 0 }))
    $files.Add([pscustomobject]@{ relativePath = "bob-managed/$recordDir/review-run.json"; content = ConvertTo-JsonText $run; kind = "review-run" })
    $files.Add([pscustomobject]@{ relativePath = "bob-managed/$packetPath"; content = "# Bazaar Revision Review Request`n`nSeeded recovery packet for $reviewId.`n"; kind = "packet" })
    if ($definition.result) {
      $files.Add([pscustomobject]@{ relativePath = "bob-managed/$resultJsonPath"; content = ConvertTo-JsonText (New-ValidReviewResult $reviewId); kind = "result-json" })
      $files.Add([pscustomobject]@{ relativePath = "bob-managed/$resultMarkdownPath"; content = "# Review Result`n`nSeeded valid result for $reviewId.`n"; kind = "result-markdown" })
    }
    if ($definition.triage) {
      $triage = @"
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
      $files.Add([pscustomobject]@{ relativePath = "bob-managed/$triagePath"; content = $triage; kind = "triage" })
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
  $idMismatch = New-ValidReviewResult "different-payload-review-id"
  $files.Add([pscustomobject]@{ relativePath = "bob-managed/test-data/invalid/review-result-id-mismatch.json"; content = ConvertTo-JsonText $idMismatch; kind = "invalid-result" })
  return @($files)
}
```

- [ ] **Step 4: Implement invariant validation and write separation**

Append:

```powershell
function Assert-BazaarRecoverySeedPlan {
  param([Parameter(Mandatory)][object[]]$Plan)
  $paths = @($Plan.relativePath)
  foreach ($runFile in @($Plan | Where-Object kind -eq "review-run")) {
    $run = $runFile.content | ConvertFrom-Json -Depth 50
    $artifactRequirements = [ordered]@{
      packet = "reviewPacketPath"
      result = @("reviewResultJsonPath", "reviewResultMarkdownPath")
      triage = "triageYamlPath"
      record = "recordYamlPath"
      summary = @("summaryJsonPath", "summaryMarkdownPath")
    }
    foreach ($phaseName in $artifactRequirements.Keys) {
      if ($run.phases.$phaseName.status -ne "completed") { continue }
      foreach ($fieldName in @($artifactRequirements[$phaseName])) {
        if (-not $run.artifacts.$fieldName) { throw "$fieldName is required for completed $phaseName phase" }
        $plannedPath = "bob-managed/$($run.artifacts.$fieldName)"
        if ($paths -notcontains $plannedPath) { throw "Planned artifact is missing for completed $phaseName phase: $plannedPath" }
      }
    }
  }
  if (@($Plan | Where-Object kind -eq "malformed-run").Count -ne 1) { throw "Exactly one malformed run is required" }
  if (@($Plan | Where-Object kind -eq "invalid-result").Count -ne 2) { throw "Exactly two invalid review-result fixtures are required" }
}

function Write-BazaarRecoverySeedPlan {
  param([Parameter(Mandatory)][string]$ScenarioRoot, [Parameter(Mandatory)][object[]]$Plan)
  foreach ($file in $Plan) {
    $target = [System.IO.Path]::GetFullPath((Join-Path $ScenarioRoot ([string]$file.relativePath)))
    $root = [System.IO.Path]::GetFullPath($ScenarioRoot)
    $relative = [System.IO.Path]::GetRelativePath($root, $target)
    if ([System.IO.Path]::IsPathRooted($relative) -or $relative -eq ".." -or $relative.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")) {
      throw "Seed target escapes ScenarioRoot: $target"
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    [System.IO.File]::WriteAllText($target, [string]$file.content, [System.Text.UTF8Encoding]::new($false))
  }
}

$validationRoot = if ($ScenarioRoot) { $ScenarioRoot } else { Join-Path $env:TEMP "bob-review-seed-validation-placeholder" }
$plan = New-BazaarRecoverySeedPlan -ScenarioRoot $validationRoot
Assert-BazaarRecoverySeedPlan -Plan $plan
if ($ValidateOnly) {
  Write-Host "Bazaar recovery seed plan valid: 4 recovery cases; 2 invalid review results"
  return
}
if (-not $ScenarioRoot) { throw "ScenarioRoot is required unless -ValidateOnly is used" }
Write-BazaarRecoverySeedPlan -ScenarioRoot $ScenarioRoot -Plan $plan
```

- [ ] **Step 5: Wire `postSeed`, expected artifacts, and write-free seed validation**

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

In `Assert-ScenarioManifest`, validate `postSeed` when present:

```powershell
if ($scenario.psobject.Properties.Name -contains "postSeed") {
  Assert-RepositoryRelativePath $RepoRoot ([string]$scenario.postSeed) "$($scenario.id).postSeed" -MustExist | Out-Null
}
```

In the runner's `-ValidateOnly` branch, invoke post-seed scripts with `-ValidateOnly` after manifest validation:

```powershell
foreach ($validationScenario in $selected) {
  if ($validationScenario.psobject.Properties.Name -contains "postSeed") {
    $seedPath = Assert-RepositoryRelativePath $RepoRoot ([string]$validationScenario.postSeed) "$($validationScenario.id).postSeed" -MustExist
    & $seedPath -ValidateOnly
  }
}
```

- [ ] **Step 6: Verify RED/GREEN behavior and no validation writes**

Run:

```powershell
$validationRoot = Join-Path $env:TEMP "bob-recovery-seed-validate-only"
Remove-Item $validationRoot -Recurse -Force -ErrorAction SilentlyContinue
pwsh -NoProfile -File tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1 `
  -ScenarioRoot $validationRoot `
  -ValidateOnly
if (Test-Path $validationRoot) { throw "Seed ValidateOnly wrote to the filesystem" }
```

Expected: `Bazaar recovery seed plan valid: 4 recovery cases; 2 invalid review results`; path does not exist.

Run a standalone write test without invoking the Bazaar launcher:

```powershell
$root = Join-Path $env:TEMP "bob-recovery-seed-write"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$root\bob-managed", "$root\bazaar-source" | Out-Null
pwsh -NoProfile -File tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1 -ScenarioRoot $root
Get-Content "$root\bob-managed\.bob-review-records\campaigns\real-machine-recovery\records\resume-finalize\review-run.json" -Raw | ConvertFrom-Json | Out-Null
Remove-Item $root -Recurse -Force
```

Expected: JSON parses and invariant validation has already passed.

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/real-machine-test-environment/seeds/bazaar-run-recovery/Seed-BazaarRunRecovery.ps1 \
  tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "test: seed Bazaar review run recovery scenarios"
```

### Task 6: Code-consistency invalid fixtures and isolated fixture copy contract

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

- Manifest field `fixtureCopies`: array of `{ source: repository-relative, destination: scenario-relative }`.
- All five destinations are under `workspace/test-data/invalid/`.
- No invalid fixture destination equals `workspace/review-input.yaml`, `.bob-review/bob-output/bob-output.yaml`, or `.bob-trace/ai-traceability-draft/ai-draft.json`.
- Unknown evidence fixture is schema-valid but refers to `UNKNOWN-9999`, so Bob output validation fails at evidence lookup rather than JSON/YAML schema parsing.

- [ ] **Step 1: Add failing invalid-fixture contract tests**

Append:

```js
test("consistency validation fixtures are isolated from active artifact paths", () => {
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

test("unknown-evidence output remains schema-shaped and names the intended missing ID", () => {
  const source = fs.readFileSync(
    path.join(toolRoot, "seeds", "consistency-validation-errors", "bob-output-unknown-evidence.yaml"),
    "utf8"
  )
  assert.match(source, /schema_version:\s*1/)
  assert.match(source, /result_type:\s*pre_review/)
  assert.match(source, /final_approval:\s*not_performed/)
  assert.match(source, /evidence_id:\s*UNKNOWN-9999/)
  assert.match(source, /coverage_notes:/)
  assert.match(source, /rejected_or_uncertain:/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because fixture files and `fixtureCopies` do not exist.

- [ ] **Step 3: Create exact invalid fixture contents**

`review-input-missing-required.yaml`:

```yaml
schema_version: 1
review:
  id: INVALID-MISSING-REQUIRED
  title: 必須項目不足
artifacts: {}
review_focus: []
```

`review-input-path-escape.yaml` is schema-shaped but fails workspace containment:

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

`bob-output-schema-error.yaml` deliberately violates required summary fields and constants:

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

- [ ] **Step 4: Wire repository/source and scenario/destination validation**

Add `fixtureCopies` to `consistency-validation-errors`:

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

Append those five destinations to `expectedArtifacts`.

In `Assert-ScenarioManifest`, validate both halves independently:

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

- [ ] **Step 5: Verify GREEN and isolated copy behavior**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

Run the generic copy function against a temporary scenario root:

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
if (-not (Test-Path "$root\workspace\test-data\invalid\bob-output-unknown-evidence.yaml")) { throw "Fixture copy failed" }
if (Test-Path "$root\workspace\.bob-review\bob-output\bob-output.yaml") { throw "Fixture polluted the active output path" }
Remove-Item $root -Recurse -Force
```

Expected: all five fixtures are copied only under `workspace/test-data/invalid`.

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/seeds/consistency-validation-errors \
  tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "test: add code consistency validation fixtures"
```

### Task 7: Operator documentation and full local generation contract

**Files:**

- Create: `tools/real-machine-test-environment/README-ja.md`
- Modify: `scripts/real-machine-test-environment.test.js`
- Modify: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`

**Interfaces:**

- Document exact package commands for all three VSIX files.
- Document `-ValidateOnly`, single scenario, all scenarios, `-Open`, `-OpenScenario`, fixed `-OutputRoot`, result recording, and cleanup.
- Add a runner startup summary showing selected scenarios and output root.
- Add a final summary showing ready / blocked / failed counts and the `run-summary.md` path.

- [ ] **Step 1: Add failing README command contracts**

Append:

```js
test("README documents validation, generation, and explicit single-window launch", () => {
  const readme = fs.readFileSync(path.join(toolRoot, "README-ja.md"), "utf8")
  assert.match(readme, /npm\.cmd run package/)
  assert.match(readme, /-ValidateOnly/)
  assert.match(readme, /-Scenario all/)
  assert.match(readme, /-OpenScenario bazaar-run-recovery/)
  assert.match(readme, /operator-result\.json/)
  assert.match(readme, /blocked/)
  assert.match(readme, /failed/)
  assert.match(readme, /Remove-Item .* -Recurse -Force/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because `README-ja.md` does not exist.

- [ ] **Step 3: Write the operator README with exact commands**

Create `README-ja.md` with these sections and commands:

```markdown
# Bob Review 実機テスト用データ環境

`bob-bazaar-review` と `bob-code-consistency-review` の P0 + P1 用 sandbox を repository 外に生成します。実機操作の合否は自動判定せず、各 scenario の `operator-result.json` に記録します。

## 1. VSIX を package

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

## 2. 書き込みなしの contract 検証

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

## 3. P0 + P1 の全環境を生成

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -Scenario all
```

全生成では VS Code を自動起動しません。

## 4. 1 scenario を生成して開く

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -Open
```

## 5. 全生成後に 1 scenario だけ開く

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario all `
  -OpenScenario bazaar-run-recovery
```

## 6. 出力先を固定

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario bazaar-core `
  -OutputRoot C:\bob-uat\run-001
```

既存 path と repository 配下は拒否します。

## 7. 結果記録

- `run-manifest.json`: repository revision、tool version summary、scenario status。
- `run-summary.md`: `ready` / `blocked` / `failed` と package hint。
- `<scenario>/scenario-manifest.json`: launcher、artifact、post-seed、log の結果。
- `<scenario>/operator-checklist.md`: 実機操作手順。
- `<scenario>/operator-result.json`: testcase ごとの `not_run` / `pass` / `fail` / `blocked`。

Generator は `pass` を自動設定しません。

## 8. Invalid fixture

Invalid fixture は `test-data/invalid` に隔離されています。Checklist の手順に従って明示的に利用し、active input / output を復元してください。

## 9. Cleanup

結果と再現用 evidence が不要になった場合だけ、生成時に表示された output root を削除します。

```powershell
Remove-Item C:\bob-uat\run-001 -Recurse -Force
```
```

- [ ] **Step 4: Add concise start/end console output**

Before generation loop:

```powershell
Write-Host "Output root: $outputFull"
Write-Host "Selected scenarios: $(@($selected.id) -join ', ')"
```

After `Write-RunEvidence`:

```powershell
$readyCount = @($scenarioRecords | Where-Object status -eq "ready").Count
$blockedCount = @($scenarioRecords | Where-Object status -eq "blocked").Count
$failedCount = @($scenarioRecords | Where-Object status -eq "failed").Count
Write-Host "Ready: $readyCount; Blocked: $blockedCount; Failed: $failedCount"
Write-Host "Summary: $(Join-Path $outputFull 'run-summary.md')"
```

- [ ] **Step 5: Verify documentation and runner contracts**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

Run:

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: manifest and seed plans validate with no output directory creation.

- [ ] **Step 6: Commit**

```bash
git add tools/real-machine-test-environment/README-ja.md \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "docs: add real-machine environment runbook"
```

### Task 8: Windows CI contract and change-detection paths

**Files:**

- Modify: `.github/workflows/extensions-quality.yml`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**

- Add path filters for the tool, both existing integration launcher directories, code-consistency examples, and both real-machine specifications.
- Add job `real-machine-environment-contracts` on `windows-latest` with Node.js 22.
- Run only repository-level Node contracts and PowerShell `-ValidateOnly`; do not package extensions or generate full environments in this job.

- [ ] **Step 1: Add a failing workflow contract test**

Append:

```js
test("extensions-quality watches and validates real-machine environment contracts", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "extensions-quality.yml"), "utf8")
  for (const watchedPath of [
    "tools/real-machine-test-environment/**",
    "docs/workflows/bazaar-project-rule-review/integration/**",
    "docs/workflows/code-consistency-review/integration/**",
    "docs/workflows/code-consistency-review/examples/**",
    "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md",
    "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  ]) assert.match(workflow, new RegExp(watchedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(workflow, /real-machine-environment-contracts:/)
  assert.match(workflow, /runs-on:\s*windows-latest/)
  assert.match(workflow, /node --test scripts\/real-machine-test-environment\.test\.js/)
  assert.match(workflow, /Invoke-BobReviewTestEnvironment\.ps1 -ValidateOnly/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because workflow paths and job are absent.

- [ ] **Step 3: Extend both pull_request and push path filters**

Add these exact entries under both `on.pull_request.paths` and `on.push.paths`:

```yaml
      - "tools/real-machine-test-environment/**"
      - "docs/workflows/bazaar-project-rule-review/integration/**"
      - "docs/workflows/code-consistency-review/integration/**"
      - "docs/workflows/code-consistency-review/examples/**"
      - "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
      - "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
```

- [ ] **Step 4: Add the Windows validation job**

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

Do not install npm dependencies, package VSIX files, invoke Bazaar, start VS Code, or call IBM Bob in this job.

- [ ] **Step 5: Verify GREEN and existing integration launcher tests**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
node --test extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
node --test extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

Expected: all tests pass.

Run:

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: exit code 0 with six scenarios and valid Bazaar seed plan.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/extensions-quality.yml \
  scripts/real-machine-test-environment.test.js
git commit -m "ci: validate real-machine environment contracts"
```

### Task 9: Full local generation, focused regression, and implementation evidence

**Files:**

- Modify only if verification exposes a defect: files already introduced in Tasks 1–8.
- Create: `docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md`

**Interfaces:**

- Produce verification evidence with repository commit, OS, PowerShell, Node, Git, Bazaar, VS Code versions, commands, scenario statuses, focused tests, and observed limitations.
- No acceptance claim is made for GUI testcase IDs that remain `not_run`; the verification document distinguishes environment generation from operator execution.

- [ ] **Step 1: Run the complete repository-level contract suite**

```bash
node --test scripts/real-machine-test-environment.test.js
node --test extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
node --test extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run write-free PowerShell validation**

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: manifest, testcase, path, checklist, fixture, and Bazaar recovery plan validations pass without creating an output root.

- [ ] **Step 3: Package the three extension VSIX files without changing versions**

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

Expected when `code`, `node`, `git`, `bzr`, all three VSIX files, and `bob2/bob-code` are available: six `ready` scenarios and exit code 0.

When an external prerequisite is intentionally unavailable, expected behavior is scenario-specific `blocked`, non-zero exit, complete `run-manifest.json`, and continued generation of independent scenarios. Record the actual condition rather than converting it to a pass.

- [ ] **Step 5: Verify generated recovery and invalid-fixture evidence**

```powershell
$recoveryRoot = Join-Path $outputRoot "bazaar-run-recovery\bob-managed"
Get-Content (Join-Path $recoveryRoot ".bob-review-records\campaigns\real-machine-recovery\records\resume-result-capture\review-run.json") -Raw | ConvertFrom-Json | Out-Null
Get-Content (Join-Path $recoveryRoot ".bob-review-records\campaigns\real-machine-recovery\records\resume-human-triage\review-run.json") -Raw | ConvertFrom-Json | Out-Null
Get-Content (Join-Path $recoveryRoot ".bob-review-records\campaigns\real-machine-recovery\records\resume-finalize\review-run.json") -Raw | ConvertFrom-Json | Out-Null
if (-not (Test-Path (Join-Path $recoveryRoot "test-data\invalid\review-result-id-mismatch.json"))) { throw "Bazaar invalid fixture missing" }

$invalidRoot = Join-Path $outputRoot "consistency-validation-errors\workspace\test-data\invalid"
if ((Get-ChildItem $invalidRoot -File).Count -ne 5) { throw "Expected five consistency invalid fixtures" }
if (Test-Path (Join-Path $outputRoot "consistency-validation-errors\workspace\.bob-review\bob-output\bob-output.yaml")) {
  throw "Generator must not activate an invalid Bob output"
}
```

Expected: all checks pass; malformed run remains intentionally unparsable and is not parsed by this command.

- [ ] **Step 6: Verify explicit opening targets exactly one scenario**

Use a disposable second output root:

```powershell
$openRoot = Join-Path $env:TEMP ("bob-review-real-machine-open-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -OutputRoot $openRoot `
  -Open
```

Expected: one VS Code window opens with the generated `workspace`; no other scenario directory or window is created.

Close the disposable window. Do not mark GUI testcase IDs as pass from this launch smoke alone.

- [ ] **Step 7: Write the implementation verification record**

Create `docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md` with this concrete structure and actual outputs:

```markdown
# Bob Review Real-Machine Test Environment Verification

## Revision

- Commit: `<tested commit SHA>`
- Branch: `<tested branch>`
- Dirty: `<true or false>`

## Environment

| Tool | Version |
| --- | --- |
| Windows | `<actual version>` |
| PowerShell | `<actual version>` |
| Node.js | `<actual version>` |
| Git | `<actual version>` |
| Bazaar | `<actual version>` |
| VS Code / Bob IDE CLI | `<actual version>` |

## Automated checks

| Command | Result |
| --- | --- |
| `node --test scripts/real-machine-test-environment.test.js` | PASS / FAIL with exact count |
| Bazaar integration sandbox contract | PASS / FAIL with exact count |
| Code-consistency integration sandbox contract | PASS / FAIL with exact count |
| `-ValidateOnly` | PASS / FAIL |

## Generated scenarios

| Scenario | Status | Root | Notes |
| --- | --- | --- | --- |
| bazaar-core | ready / blocked / failed | `<actual path>` | `<actual note>` |
| bazaar-run-recovery | ready / blocked / failed | `<actual path>` | `<actual note>` |
| consistency-ai-matrix | ready / blocked / failed | `<actual path>` | `<actual note>` |
| consistency-traceability | ready / blocked / failed | `<actual path>` | `<actual note>` |
| consistency-multilang | ready / blocked / failed | `<actual path>` | `<actual note>` |
| consistency-validation-errors | ready / blocked / failed | `<actual path>` | `<actual note>` |

## Evidence checked

- Review Run result-capture, human-triage, and finalize seed files parse.
- Malformed Review Run remains intentionally malformed.
- Bazaar invalid result fixtures remain outside `.bob/review/results`.
- Five code-consistency invalid fixtures remain under `test-data/invalid`.
- Operator result files contain only `not_run` before manual execution.
- Single-scenario `-Open` launches one window.

## Manual UAT status

Environment generation is verified. Individual `BZR-RT-*` and `CCR-RT-*` results remain `not_run` until an operator executes each generated checklist.
```

Replace angle-bracket fields with actual evidence; do not leave literal placeholder text in the committed record.

- [ ] **Step 8: Re-run final verification after any fix**

```bash
node --test scripts/real-machine-test-environment.test.js
node --test extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
node --test extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

```powershell
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: all commands pass.

- [ ] **Step 9: Commit**

```bash
git add docs/implementation/bob-review-real-machine-test-environment-verification-2026-07-17.md
git commit -m "docs: record real-machine environment verification"
```

## Final Review Checklist

Before requesting code review, verify each item directly:

- [ ] `scenarios.json` contains exactly the approved six scenario IDs and no arbitrary command fields.
- [ ] Manifest validation distinguishes repository-relative source paths from scenario-relative destination paths.
- [ ] Runtime-injected launcher arguments cannot be overridden from the manifest.
- [ ] Existing launchers are invoked with `NoLaunch = true` and remain directly usable.
- [ ] `OutputRoot` cannot be existing or inside the repository.
- [ ] Blocked and failed scenarios preserve evidence and do not stop independent scenarios.
- [ ] No invalid fixture is copied to an active input or output path.
- [ ] Review Run completed phases have all required planned artifacts.
- [ ] Resume fixtures cover result capture, human triage, and finalize.
- [ ] The malformed run is excluded by existing runtime behavior rather than silently repaired.
- [ ] Operator results begin with `not_run`; generation never writes `pass`.
- [ ] Environment and log output do not include environment variable dictionaries, credentials, tokens, or clipboard contents.
- [ ] Windows CI runs Node contracts and PowerShell `-ValidateOnly`, but not full GUI generation.
- [ ] Existing Bazaar and code-consistency integration sandbox contract tests pass.
- [ ] Verification evidence distinguishes generated-environment readiness from manual UAT completion.
