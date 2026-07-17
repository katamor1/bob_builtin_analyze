# Bob Review 実機テスト用データ環境 設計

**Date:** 2026-07-17  
**Status:** Design approved; written specification awaiting review  
**Scope:** `bob-bazaar-review` と `bob-code-consistency-review` の P0 + P1 実機テスト用データ環境  
**Base branch:** `main` at design branch creation

## 1. Goal

`bob_builtin_analyze` に、`bob-bazaar-review` と `bob-code-consistency-review` の実機テスト環境を再現可能に生成する共通入口を追加する。

この環境は次を満たす。

- 既存の integration sandbox と fixture を再利用する。
- P0 + P1 の代表シナリオを 1 コマンドで生成できる。
- Git / Bazaar の実履歴、multi-root、Shift-JIS / CP932、traceability、Bob 出力取り込み、validation、triage、中断・再開を扱える。
- 正常系と異常系を分離し、正常系 workspace を意図しない不正データで汚染しない。
- GUI 操作を自動合格扱いにせず、operator checklist と結果記録テンプレートを生成する。
- repository root を汚さず、既定では `%TEMP%` 配下に環境を作る。

## 2. Existing assets and identified gap

### 2.1 Bazaar review sandbox

`docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1` は次を生成する。

- `.bob` を持つ Bob workspace と `.bzr` を持つ Bazaar repository の分離
- 実 Bazaar revision 履歴
- revision range の review target
- project rules と MCP 設定
- Shift-JIS / CP932 の固定データ
- 期待指摘一覧
- isolated VS Code user data / extensions directory

### 2.2 Code consistency review sandbox

`docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1` は次の sample を扱う。

- `simple-timeout-bugfix`
- `ai-verification-matrix`
- `live-traceability-sidecar`
- `multi-language-git-review`

後者 3 件は fixture から実 Git repository、baseline commit、feature branch、head commit を作る。

### 2.3 Gap

不足しているのは fixture 自体ではなく、次を横断して管理する共通環境である。

- scenario の選択と一括生成
- test case ID と生成データの対応
- 前提 CLI / VSIX の診断
- 中断・再開用の Review Run seed
- Bazaar review-result 異常系データ
- code consistency validation error 用の隔離 fixture
- run manifest、operator checklist、結果記録
- repository-level contract test

## 3. Confirmed decisions

- 既存 launcher の上に薄い共通 orchestrator を追加する。
- 既存 launcher の Git / Bazaar repository 生成処理を再実装しない。
- P0 + P1 の初版は 6 scenario とする。
- 共通 runner は既存 launcher を必ず `-NoLaunch` で実行する。
- 複数 scenario 生成時に VS Code を複数自動起動しない。
- 起動する場合は明示された 1 scenario だけを開く。
- Bazaar sandbox は absolute path を workspace file と入力 file に保存するため、生成後に scenario directory を rename しない。
- 各 scenario は最初から最終 path に生成する。
- 既存 output root は上書きしない。
- 1 scenario の失敗で、独立した残り scenario の生成を中止しない。
- 不足前提は `blocked`、生成異常は `failed` として記録する。
- 自動生成処理は実機テスト結果を `pass` にしない。
- AI への自動投入、AI 出力の自動採点、Webview 自動操作は初版に含めない。
- 既存 2 launcher の共通 module 化は本変更に含めない。

## 4. Considered approaches

### A. Thin orchestrator over existing launchers

既存 launcher をそのまま利用し、manifest、post-seed、evidence、checklist だけを共通化する。

**Advantages**

- 既存の実 Git / 実 Bazaar 生成契約を維持できる。
- 変更範囲が小さい。
- individual sandbox の利用方法を壊さない。
- scenario を独立して追加できる。

**Disadvantages**

- path helper や process helper の一部重複は残る。

### B. Refactor both launchers into a common PowerShell module

既存 launcher の path 解決、VSIX install、process execution、repository 生成を共通 module に移す。

**Advantages**

- 長期的な重複を減らせる。

**Disadvantages**

- 安定している 2 launcher を同時に変更する。
- 実機環境追加より先に大規模 refactor が必要になる。
- 回帰範囲が大きい。

### C. Commit fully generated workspaces

`.git` / `.bzr` を含む生成済み workspace を固定データとして保存する。

**Advantages**

- 起動時の生成処理が少ない。

**Disadvantages**

- absolute path、VCS metadata、OS 差分、stale 化、repository 肥大化が避けにくい。

**Decision:** Approach A を採用する。

## 5. Repository layout

```text
tools/
  real-machine-test-environment/
    Invoke-BobReviewTestEnvironment.ps1
    scenarios.json
    README-ja.md

    lib/
      ScenarioManifest.ps1
      ScenarioExecution.ps1
      RunEvidence.ps1

    checklists/
      bazaar-core.md
      bazaar-run-recovery.md
      consistency-ai-matrix.md
      consistency-traceability.md
      consistency-multilang.md
      consistency-validation-errors.md

    seeds/
      bazaar-run-recovery/
        Seed-BazaarRunRecovery.ps1
        review-result-schema-error.json
        review-result-id-mismatch.json
      consistency-validation-errors/
        review-input-missing-required.yaml
        review-input-path-escape.yaml
        bob-output-schema-error.yaml
        bob-output-unknown-evidence.yaml
        traceability-draft-invalid-status.json

    templates/
      operator-result.template.json

scripts/
  real-machine-test-environment.test.js
```

既存 launcher は原則変更しない。

```text
docs/workflows/bazaar-project-rule-review/integration/
  launch-bob-bazaar-review-sandbox.ps1

docs/workflows/code-consistency-review/integration/
  launch-bob-code-consistency-sandbox.ps1
```

## 6. Component responsibilities

| Component | Responsibility |
| --- | --- |
| `Invoke-BobReviewTestEnvironment.ps1` | CLI entrypoint、scenario 選択、前提確認、launcher 実行、post-seed、artifact 検証、任意起動 |
| `ScenarioManifest.ps1` | `scenarios.json` の parse、schema / path / group / testcase contract 検証 |
| `ScenarioExecution.ps1` | child process 実行、stdout / stderr log、scenario status、failure evidence |
| `RunEvidence.ps1` | Git revision、tool versions、run/scenario manifest、summary、operator result 生成 |
| `checklists/*.md` | 実機操作、test case ID、期待結果、保存する evidence の定義 |
| `Seed-BazaarRunRecovery.ps1` | Review Run artifact 不変条件を満たす中断・再開データと Bazaar 異常系データの配置 |
| validation error fixtures | clipboard、editor、入力差し替えで利用する意図的不正データ |
| Node contract test | manifest、path、testcase、launcher、fixture 配置の自動検証 |

各 module は責務を 1 つに限定し、メイン script へ manifest 検証、process 実行、evidence 出力を集中させない。

## 7. P0 + P1 scenarios

| Scenario ID | Base generator | Post-seed | Primary purpose | Representative testcase IDs |
| --- | --- | --- | --- | --- |
| `bazaar-core` | Bazaar launcher | なし | 実 Bazaar revision range、multi-root、GUI、Workflow UI、packet、capture、MCP、Shift-JIS | `BZR-RT-004`, `BZR-RT-006`–`010`, `BZR-RT-017`–`030`, `BZR-RT-034`, `BZR-RT-035` |
| `bazaar-run-recovery` | Bazaar launcher | recovery run と invalid review-result | packet 後中断、result 後中断、triage 後 finalize、malformed run 除外、invalid result rejection | `BZR-RT-022`, `BZR-RT-044`–`047` |
| `consistency-ai-matrix` | Code consistency launcher / `ai-verification-matrix` | なし | 実 Git 差分、OK / NG / N/A / question、preprocess、capture、validate、triage | `CCR-RT-016`, `CCR-RT-022`–`031` |
| `consistency-traceability` | Code consistency launcher / `live-traceability-sidecar` | なし | AI draft、sidecar catalog、人間承認、gate、review-input、review-package | `CCR-RT-010`–`015`, `CCR-RT-023`–`031` |
| `consistency-multilang` | Code consistency launcher / `multi-language-git-review` | なし | TypeScript / Python / Java と `SRC-*` fallback evidence | `CCR-RT-016A`, `CCR-RT-021A` |
| `consistency-validation-errors` | Code consistency launcher / `ai-verification-matrix` | isolated invalid fixtures | schema error、unknown evidence、invalid review-input、path escape | `CCR-RT-008`, `CCR-RT-012`, `CCR-RT-028`, `CCR-RT-034` |

`testCases` の正確な列挙は manifest に置き、repository-level contract test が各 ID の実機テスト仕様書内での存在を検証する。

## 8. Scenario manifest contract

`scenarios.json` を生成定義の source of truth とする。

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
      "id": "consistency-ai-matrix",
      "extension": "bob-code-consistency-review",
      "priorities": ["P0", "P1"],
      "generator": {
        "kind": "existing-launcher",
        "path": "docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1",
        "arguments": {
          "Sample": "ai-verification-matrix"
        }
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
        "CCR-RT-016",
        "CCR-RT-022",
        "CCR-RT-023",
        "CCR-RT-024",
        "CCR-RT-025",
        "CCR-RT-027",
        "CCR-RT-029",
        "CCR-RT-031"
      ],
      "expectedArtifacts": [
        "workspace/.git",
        "workspace/review-input.yaml",
        "workspace/.bob/workflows/code-consistency-review/WORKFLOW.md"
      ]
    }
  ]
}
```

Source manifest には生成日時、absolute path、実行結果を保存しない。それらは実行時に `run-manifest.json` と `scenario-manifest.json` へ解決して保存する。

### 8.1 Scenario ID

ID は次に一致させる。

```text
^[a-z0-9][a-z0-9-]*$
```

次を拒否する。

- 重複 ID
- group 内の重複
- 存在しない scenario への group 参照
- path separator を含む ID

### 8.2 Repository-relative paths

次の field は repository root 配下へ解決できる relative path だけを許可する。

- `generator.path`
- `postSeed`
- `checklistTemplate`
- `fixtureSources`
- `requiredRepositoryPaths`

absolute path、`..` escape、realpath 解決後の repository 外 path を拒否する。

### 8.3 Scenario-relative paths

`expectedArtifacts` は生成後の scenario root を基準にする。

- absolute path を拒否する。
- `..` escape を拒否する。
- symlink / junction を解決した結果が scenario root 外になる場合は失敗する。
- file と directory の両方を検証できる。

### 8.4 Generator allowlist

初版で許可する generator は次だけである。

```json
{ "kind": "existing-launcher" }
```

Manifest から arbitrary executable、script body、shell command を指定できる設計にはしない。許可する launcher path は既存の 2 file に限定する。

### 8.5 Manifest arguments and runtime-injected arguments

Manifest が `generator.arguments` で指定できる値は次に限定する。

Bazaar launcher:

```text
なし
```

Code consistency launcher:

```text
Sample
```

次は runner が検証済み値を必ず注入し、manifest から上書きできない。

Bazaar launcher:

```text
RepoRoot
SandboxRoot
CodeCommand
BzrCommand
NoLaunch = true
```

Code consistency launcher:

```text
RepoRoot
SandboxRoot
CodeCommand
NoLaunch = true
```

`SkipExtensionInstall` は初版の共通 runner では使用しない。`Invoke-Expression` は使わず、検証済み argument array と call operator で実行する。

### 8.6 Missing repository prerequisites

`requiredRepositoryPaths` の不足は launcher failure ではなく `blocked` とする。

Runner は不足 path に応じて、固定された package hint を `run-summary.md` に表示する。Manifest 内の文字列を command として実行しない。

## 9. Runner interface

初版の entrypoint は次を提供する。

```powershell
param(
  [string]$RepoRoot,
  [string]$OutputRoot,
  [string]$Scenario = "all",
  [string]$CodeCommand = "code",
  [string]$BzrCommand = "bzr",
  [switch]$Open,
  [string]$OpenScenario,
  [switch]$ValidateOnly
)
```

`RepoRoot` を省略した場合は script location から repository root を解決する。`OutputRoot` を省略した場合は `%TEMP%/bob-review-real-machine-<yyyyMMdd-HHmmss>` を使用する。

### 9.1 Selection rules

- `-Scenario all` は manifest group `p0-p1` を生成する。
- `-Scenario <id>` は 1 scenario だけを生成する。
- 不明な ID は生成前に拒否する。
- `-Open` は単一 scenario 選択時だけ許可する。
- 複数 scenario で起動する場合は `-OpenScenario <id>` を必須とする。
- `-OpenScenario` は選択された scenario の ID だけを受け付ける。
- `-Open` と `-OpenScenario` の同時指定を拒否する。
- `-ValidateOnly` と起動 option の同時指定を拒否する。

### 9.2 Example commands

```powershell
# P0 + P1 の全環境を生成し、GUI は開かない
.\tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario all

# 1 scenario を生成して開く
.\tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario consistency-ai-matrix `
  -Open

# 全環境を生成し、指定した 1 scenario だけを開く
.\tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario all `
  -OpenScenario bazaar-run-recovery

# 出力先を固定する
.\tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -Scenario bazaar-core `
  -OutputRoot C:\bob-uat\run-001

# 書き込みなしで contract を検証する
.\tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -ValidateOnly
```

## 10. Generation flow

```text
scenarios.json を読み込む
  -> manifest 全体を検証する
  -> selection を解決する
  -> run root が新規で repository 外であることを確認する
  -> tool version と repository revision を収集する
  -> scenario ごとに prerequisite を確認する
  -> final scenario path へ既存 launcher を -NoLaunch で実行する
  -> scenario 固有の post-seed を実行する
  -> expectedArtifacts を検証する
  -> scenario-manifest.json を生成する
  -> operator-checklist.md を生成する
  -> operator-result.json を生成する
  -> run-manifest.json / run-summary.md を更新する
  -> 指定された 1 scenario だけを任意で起動する
```

### 10.1 No staging rename

Bazaar launcher は `.code-workspace`、`review-inputs.json`、MCP 設定に absolute path を含める。そのため次を禁止する。

```text
<scenario>.partial を生成
  -> 完成後に <scenario> へ rename
```

Scenario は最初から final path に生成する。失敗した directory は診断用に残し、manifest で `failed` とする。

### 10.2 Repository state

Runner は repository commit、branch、dirty state を記録する。Dirty state は生成を block しないが、再現性 warning として `run-summary.md` に表示する。

## 11. Output layout

```text
bob-review-real-machine-<timestamp>/
  _logs/
    <scenario-id>.log

  run-manifest.json
  run-summary.md
  environment-versions.json

  bazaar-core/
    user-data/
    extensions/
    bob-managed/
    bazaar-source/
    bob-bazaar-review.code-workspace
    scenario-manifest.json
    operator-checklist.md
    operator-result.json

  bazaar-run-recovery/
    ...

  consistency-ai-matrix/
    ...

  consistency-traceability/
    ...

  consistency-multilang/
    ...

  consistency-validation-errors/
    ...
```

`environment-versions.json` は version command の exit code と raw output を保存する。`run-manifest.json` はそこから得た normalized summary と scenario status を保存する。

## 12. Run and scenario evidence

### 12.1 `run-manifest.json`

```json
{
  "schemaVersion": 1,
  "createdAt": "2026-07-17T00:00:00.000Z",
  "repository": {
    "root": "C:\\...\\bob_builtin_analyze",
    "commit": "<git-sha>",
    "branch": "<branch>",
    "dirty": false
  },
  "tools": {
    "code": "<normalized-version-or-unavailable>",
    "node": "<normalized-version-or-unavailable>",
    "git": "<normalized-version-or-unavailable>",
    "bzr": "<normalized-version-or-unavailable>"
  },
  "scenarios": [
    {
      "id": "bazaar-core",
      "status": "ready",
      "root": "C:\\...\\bazaar-core",
      "launchTarget": "C:\\...\\bob-bazaar-review.code-workspace",
      "logPath": "C:\\...\\_logs\\bazaar-core.log"
    }
  ]
}
```

Environment variable values、tokens、GitHub credentials、clipboard contents は記録しない。

### 12.2 `scenario-manifest.json`

各 scenario には次を記録する。

- source manifest schema version
- scenario ID と extension
- resolved launcher path
- sanitized launcher arguments
- generatedAt
- scenario status
- resolved workspace / Bob root / VCS root
- launch target
- test case IDs
- expected artifact の検証結果
- post-seed の実行結果
- log path

`NoLaunch = true` は記録してよいが、secret を含む environment values は記録しない。

### 12.3 `operator-result.json`

```json
{
  "schemaVersion": 1,
  "scenarioId": "consistency-ai-matrix",
  "operator": "",
  "startedAt": null,
  "completedAt": null,
  "results": [
    {
      "testCaseId": "CCR-RT-016",
      "status": "not_run",
      "notes": "",
      "evidencePaths": []
    }
  ]
}
```

Allowed status:

```text
not_run
pass
fail
blocked
```

Environment generator は `pass` を自動設定しない。

## 13. Bazaar recovery and invalid-result seed

`Seed-BazaarRunRecovery.ps1` は、既存 Bazaar launcher が生成した Bob workspace に Review Run fixture と invalid review-result fixture を追加する。

### 13.1 Recovery cases

| Review ID | Persisted phase state | Expected next action |
| --- | --- | --- |
| `resume-result-capture` | target `completed`; packet `completed`; result `in_progress`; remaining phases `not_started` | `resultCapture` |
| `resume-human-triage` | target / packet / result `completed`; triage `in_progress`; record / summary `not_started` | `humanTriage` |
| `resume-finalize` | target / packet / result / triage `completed`; record / summary `not_started` | `finalize` |
| `malformed-run-hidden` | malformed `review-run.json` | 通常 resume list に表示しない |

### 13.2 Artifact invariants

Completed phase に対応する実 artifact を必ず作成する。

| Phase | Required artifacts |
| --- | --- |
| packet | `review-packet.md` |
| result | review-result JSON / Markdown |
| triage | `triage.yaml` |
| record | `record.yaml` |
| summary | summary JSON / Markdown |

Status だけを `completed` にして artifact を省略しない。

### 13.3 Deterministic ordering

`updatedAt` 降順を確認できるように、seed 内の基準 timestamp と固定 offset で時刻を生成する。

- 現在時刻への連続依存を避ける。
- filesystem enumeration order に依存しない。
- duplicate timestamp を作らない。

### 13.4 Invalid review-result fixtures

次を `bob-managed/test-data/invalid/` に配置する。

- required field を欠く `review-result-schema-error.json`
- file name と payload の `review_id` が一致しない `review-result-id-mismatch.json`

Active result directory へ自動配置しない。Operator が clipboard または editor から capture / validation を実行し、不正成果物が正式保存されないことを確認する。

## 14. Code consistency validation error fixtures

`consistency-validation-errors` は `ai-verification-matrix` を正常な base workspace として生成し、不正データだけを次へ追加する。

```text
workspace/
  test-data/
    invalid/
      review-input-missing-required.yaml
      review-input-path-escape.yaml
      bob-output-schema-error.yaml
      bob-output-unknown-evidence.yaml
      traceability-draft-invalid-status.json
```

不正データは active artifact path に直接配置しない。`operator-checklist.md` は次を明示する。

- clipboard にコピーする fixture
- editor で開く fixture
- 一時的に active path へコピーする場合の手順
- 実行する command
- 期待する rejection / diagnostic
- 正常 artifact が作成されないことの確認
- 異常系実行後に正常系へ戻す手順

## 15. Prerequisite and failure behavior

Scenario status:

| Status | Meaning |
| --- | --- |
| `not_started` | manifest 全体の異常などで開始されなかった |
| `ready` | launcher、post-seed、artifact 検証が完了 |
| `blocked` | 必須 CLI、VSIX、template、expanded Bob extension が不足 |
| `failed` | launcher、post-seed、または artifact 検証が失敗 |

Rules:

- manifest 自体が不正なら、run root を作成せず全体を失敗させる。
- `bzr` 不足では Bazaar scenario を `blocked` にし、Git scenario は続行する。
- 対象 VSIX または expanded Bob extension 不足では該当 scenario を `blocked` にする。
- `run-summary.md` に不足 path と固定 package hint を表示する。
- launcher failure では stdout / stderr を `_logs/<scenario>.log` に残す。
- scenario root が存在する場合は `generation-failure.json` を残す。
- expected artifact 不足は `failed` とする。
- completed scenario への rename は行わない。
- 1 件でも `blocked` または `failed` があれば process exit code を非 0 にする。
- 既存 output root は上書きしない。
- 初版では `-Force` を提供しない。

## 16. Path and execution safety

- `OutputRoot` は `RepoRoot` 配下を拒否する。
- `OutputRoot` は既存 path を拒否する。
- `RepoRoot` は repository marker と必要 launcher の存在で確認する。
- Repository-relative manifest path は realpath containment を検証する。
- Scenario-relative artifact path は scenario root containment を検証する。
- Scenario ID を path concatenation に使う前に pattern 検証する。
- `Invoke-Expression` を使用しない。
- 外部 command は executable と argument array を分けて実行する。
- Log に environment variable dictionary や secret を出力しない。
- Fixture post-seed は選択 scenario root 内だけへ書き込む。
- Symlink / junction 経由で output root 外へ書き出さない。
- Existing repository file、source fixture、VSIX を変更しない。

## 17. Operator checklist contract

各 scenario の `operator-checklist.md` は次を含む。

- scenario ID と目的
- 対象 extension
- 起動 command
- workspace path
- Bob root、VCS root、review target
- 対応する `BZR-RT-*` / `CCR-RT-*`
- GUI / Command Palette / Workflow UI の操作順
- expected artifacts
- expected warnings / failures
- Developer Tools Console の未処理例外確認
- evidence として保存する path
- cleanup ではなく再現用に環境を保持する方針

Checklist template は repository に commit し、実行時に absolute path と resolved revision を埋め込む。

## 18. Automated tests

### 18.1 Repository-level Node contract test

`scripts/real-machine-test-environment.test.js` は Node standard test runner だけを使う。

Checks:

1. `scenarios.json` が valid JSON である。
2. `schemaVersion` が supported version である。
3. scenario ID と group reference が一意である。
4. `p0-p1` の 6 scenario が存在する。
5. launcher、checklist、post-seed、fixture path が存在する。
6. repository-relative path が repository 外へ escape しない。
7. scenario-relative `expectedArtifacts` が absolute path または `..` を含まない。
8. `BZR-RT-*` が Bazaar 実機テスト仕様書に存在する。
9. `CCR-RT-*` が Code Consistency 実機テスト仕様書に存在する。
10. 既存 launcher が required parameters を維持する。
11. 既存 launcher が `-NoLaunch` で起動を抑止できる。
12. Bazaar launcher が Bob root と Bazaar root を分離する。
13. Bazaar command path が `--no-aliases` contract を維持する。
14. Invalid fixture が active artifact path に置かれていない。
15. Operator result template の status enum と testcase IDs が正しい。

### 18.2 `-ValidateOnly`

```powershell
.\tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 `
  -ValidateOnly
```

`-ValidateOnly` が行うこと:

- manifest parse
- group / scenario / path validation
- testcase existence validation
- launcher parameter contract validation
- checklist / seed / fixture existence validation
- Bazaar recovery seed の in-memory plan 生成
- completed phase と required artifact plan の整合性検証
- malformed run と invalid fixture が active path に入らないことの検証

Recovery seed module は plan 生成と filesystem write を分離する。`-ValidateOnly` は plan を検証するが、filesystem へ書き込まない。

`-ValidateOnly` が行わないこと:

- output directory 作成
- VSIX install
- Git / Bazaar repository 生成
- post-seed write
- VS Code 起動

## 19. CI integration

`.github/workflows/extensions-quality.yml` の path filter に次を追加する。

```yaml
- "tools/real-machine-test-environment/**"
- "docs/workflows/bazaar-project-rule-review/integration/**"
- "docs/workflows/code-consistency-review/integration/**"
- "docs/workflows/code-consistency-review/examples/**"
- "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
- "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
```

Repository-level test file 変更でも起動するよう、既存 `scripts/*.js` filter を利用する。

新しい Windows job:

```text
real-machine-environment-contracts
  runs-on: windows-latest
```

Steps:

1. repository checkout
2. Node.js 22 setup
3. `node --test scripts/real-machine-test-environment.test.js`
4. `pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly`

CI では次を実行しない。

- IBM Bob UI の実操作
- Webview automation
- 実 AI request
- full environment generation
- Bazaar CLI が必須となる GUI E2E

CI は生成定義と fixture contract を検証し、実機操作結果は generated operator result で記録する。

## 20. Compatibility boundaries

- Existing launcher parameters and direct usage remain supported.
- Existing VSIX names and package versions are not changed by this work.
- Existing command IDs and workflow provider IDs are not changed.
- Existing real-machine test specifications remain the testcase source of truth.
- Existing extension-specific integration sandbox tests remain in place.
- No new runtime dependency is added to either VS Code extension.
- The new environment tooling is repository tooling, not extension runtime code.

## 21. Non-goals

初版には次を含めない。

- IBM Bob への自動 prompt 投入
- AI output の semantic 自動採点
- VS Code Webview の自動操作
- screenshot の自動取得
- CLI / VSIX の自動 install または package
- P2 / P3 全ケース
- macOS / Linux 向けの生成保証
- 既存 launcher の共通 module 化
- Generated environment の update / overwrite / reuse
- Environment upload や artifact server への公開
- Production workspace を入力として直接変更する機能

## 22. Acceptance criteria

- 1 command で P0 + P1 の 6 environment を独立生成できる。
- `-Scenario <id>` で individual environment を生成できる。
- `-Scenario all` で複数 GUI を自動起動しない。
- `-Open` または `-OpenScenario` で指定した 1 environment だけを開ける。
- CLI、VSIX、template 不足を scenario 単位の `blocked` として記録できる。
- Bazaar environment で `.bob` と `.bzr` が別 root のまま維持される。
- Existing launcher の absolute path reference が生成後も有効である。
- Recovery scenario の phase と artifact が矛盾しない。
- Resume list が result capture、human triage、finalize の各状態を再現できる。
- Malformed Review Run が通常 resume list から除外される。
- Invalid Bazaar review-result が正式保存されないことを確認できる。
- Invalid code consistency fixture が正常系実行を汚染しない。
- Run manifest、scenario manifest、operator checklist、operator result が生成される。
- Environment generator が実機結果を自動で `pass` にしない。
- Repository-level Node contract test が成功する。
- Windows `-ValidateOnly` job が成功する。
- Existing integration sandbox tests に回帰がない。

## 23. Implementation boundary

本仕様の承認後、別の implementation plan で次を task 分解する。

- manifest と contract test
- runner validation mode
- existing launcher orchestration
- run evidence
- six scenario definitions
- Bazaar recovery / invalid-result seed
- code consistency validation error fixtures
- operator checklist generation
- CI integration
- end-to-end local verification

Implementation plan 作成前に、この written specification の内容を利用者がレビューする。