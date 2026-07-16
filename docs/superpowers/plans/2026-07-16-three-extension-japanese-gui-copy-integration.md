# 3拡張機能 日本語 GUI 横断仕上げ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan after the three extension-specific plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3拡張の個別計画で扱う主要 Webview に加え、Runs View、Run Control、Markdown 診断、Quick Pick、通知、確認ダイアログを日本語化し、用語・互換性・パッケージ表示を横断検証する。

**Architecture:** 既存の画面・コマンド単位の表示処理を維持し、ユーザー可視文字列だけを変更する。内部 ID、状態値、アクション、保存形式、セキュリティ境界を一切変更せず、生成 HTML、VS Code contribution、TreeItem、通知呼び出しをテストで直接確認する。

**Tech Stack:** TypeScript、Node.js test runner、VS Code Extension API、VS Code Tree View / Status Bar / Markdown reports、既存3拡張の品質ゲート。

## Execution Order

1. `2026-07-16-workflow-register-japanese-gui-copy.md`
2. `2026-07-16-bob-bazaar-review-japanese-gui-copy.md`
3. `2026-07-16-bob-code-consistency-review-japanese-gui-copy.md`
4. 本計画

## Global Constraints

- コマンド ID、設定キー、Webview メッセージ、保存値、schema、ファイル名、パス境界は変更しない。
- ユーザー可視の英語を検出する対象は、生成 HTML、VS Code contributions、パネルタイトル、TreeItem、Status Bar、Quick Pick、Input Box、通知、確認ダイアログ、Markdown レポートに限定する。
- 型名、関数名、コメント、テスト名、コマンド ID、JSON・YAML キーに含まれる英語は許容する。
- エラー文は「何が起きたか」に続けて「次に何をするか」を示す。

---

### Task 1: Localize Workflow Runs View and Run Control surfaces

**Files:**
- Modify: `extensions/workflow-register/src/commands/runControlView.ts`
- Modify: `extensions/workflow-register/src/commands/runControl.ts`
- Modify: `extensions/workflow-register/src/commands/runControlReport.ts`
- Modify: `extensions/workflow-register/src/commands/inspectRunDiagnostics.ts`
- Modify: `extensions/workflow-register/src/commands/stepReview.ts`
- Modify: `extensions/workflow-register/src/workflowRunCommands.ts`
- Modify: `extensions/workflow-register/test/runControlViewReuseProvenance.test.js`
- Modify: `extensions/workflow-register/test/workflowRunStateReadOnlyView.test.js`
- Modify: `extensions/workflow-register/test/workflowAutomaticPauseRunControlReport.test.js`
- Create: `extensions/workflow-register/test/japaneseRunSurfaces.test.js`

**Interfaces:** Consume the display helpers created by the workflow-register plan; preserve `contextValue`, command IDs, run status values, run revision validation, and report data.

- [ ] **Step 1: Write failing Runs View tests**

```js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("run surfaces use Japanese operator copy", () => {
  const source = readSourceSet([
    "commands/runControlView.ts",
    "commands/runControl.ts",
    "commands/runControlReport.ts",
    "commands/inspectRunDiagnostics.ts",
    "commands/stepReview.ts",
    "workflowRunCommands.ts"
  ])
  for (const label of [
    "Bob ワークフロー実行",
    "読み取り専用",
    "現在のステップ",
    "実行を一時停止",
    "ワークフロー実行制御",
    "実行診断"
  ]) assert.match(source, new RegExp(label))
  for (const obsolete of [
    "Bob Workflow Runs",
    "Inspect Run Control",
    "Pause Workflow Run",
    "Workflow Run Control",
    "No workflow run selected"
  ]) assert.doesNotMatch(source, new RegExp(obsolete))
})
```

In `runControlViewReuseProvenance.test.js`, change assertions to require `再利用: 1ステップ`, `再利用元の実行: source-run`, `復元した状態キー: context`, `確認済みの成果物: context-artifact`, and `定義の差異を許可: はい`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/workflow-register && npm run compile && node --test test/runControlViewReuseProvenance.test.js test/workflowRunStateReadOnlyView.test.js test/workflowAutomaticPauseRunControlReport.test.js test/japaneseRunSurfaces.test.js`

Expected: assertions fail on current English TreeItem, Status Bar, Quick Pick, and report labels.

- [ ] **Step 3: Localize Runs View and Status Bar**

Use the workflow status-label helper for `treeItem.description`. Use these exact labels:

```text
read-only                         -> 読み取り専用
runId                             -> 実行 ID
workflow                          -> ワークフロー
status                            -> 状態
run state schema                  -> 実行状態スキーマ
run state access                  -> 実行状態へのアクセス
currentStep                       -> 現在のステップ
root                              -> ワークスペース
updatedAt                         -> 更新日時
Inspect Run Control               -> 実行の詳細を確認
reused N                          -> 再利用: Nステップ
snapshot N                        -> 保存済みタスクから取り込み: N件
artifacts                         -> 再利用できる成果物あり
```

Set Status Bar tooltip to `Bob ワークフロー実行`. Replace abbreviated status text such as `1r/0p/0v/0h` with a compact Japanese count: `実行中 1／一時停止 0／確認待ち 0／手動待ち 0`. Translate provenance tooltips without changing IDs or paths.

- [ ] **Step 4: Localize Run Control, diagnostics, and review dialogs**

Use exact screen/report titles:

```text
Workflow Run Control -> ワークフロー実行制御
Run Diagnostics      -> 実行診断
Pause Workflow Run   -> 実行を一時停止
```

Translate warning and success messages as follows, inserting the actual run ID/status where applicable:

```text
Workflow run not found: X
-> 実行 X が見つかりません。実行一覧を更新してから再度選択してください。

No workflow run selected.
-> 実行が選択されていません。実行一覧から対象を選択してください。

Workflow run is not paused: X (status)
-> 実行 X は一時停止中ではありません（状態: <日本語状態>）。実行の詳細を確認してください。

Workflow run cannot be paused: X (status)
-> 実行 X は状態が <日本語状態> のため一時停止できません。別の実行を選択してください。

Pause requested for workflow run X. It will stop at the next checkpoint.
-> 実行 X の一時停止を予約しました。次の安全な区切りで停止します。
```

In Markdown reports, keep raw field keys in code formatting when needed, but put a Japanese explanation first, for example `- 実行 ID（runId）: ...`, `- 状態（runStatus）: ...`, `- 一時停止理由（pauseReason）: ...`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/runControlViewReuseProvenance.test.js test/workflowRunStateReadOnlyView.test.js test/workflowAutomaticPauseRunControlReport.test.js test/japaneseRunSurfaces.test.js
git add src/commands/runControlView.ts src/commands/runControl.ts src/commands/runControlReport.ts \
  src/commands/inspectRunDiagnostics.ts src/commands/stepReview.ts src/workflowRunCommands.ts \
  test/runControlViewReuseProvenance.test.js test/workflowRunStateReadOnlyView.test.js \
  test/workflowAutomaticPauseRunControlReport.test.js test/japaneseRunSurfaces.test.js
git commit -m "feat: localize workflow run control surfaces"
```

---

### Task 2: Audit and localize remaining host-owned dialogs

**Files:**
- Modify as findings require: `extensions/workflow-register/src/**/*.ts`
- Modify as findings require: `extensions/bob-bazaar-review/src/**/*.ts`
- Modify as findings require: `extensions/bob-code-consistency-review/src/**/*.ts`
- Create: `extensions/workflow-register/test/japaneseHostMessages.test.js`
- Create: `extensions/bob-bazaar-review/test/japaneseHostMessages.test.js`
- Create: `extensions/bob-code-consistency-review/test/japaneseHostMessages.test.js`

**Interfaces:** Preserve button return-value comparisons by changing the displayed item and the comparison literal together. Do not translate internal error codes or values that flow into schemas.

- [ ] **Step 1: Build failing source inventories**

Each extension test reads only files containing `showInformationMessage`, `showWarningMessage`, `showErrorMessage`, `showQuickPick`, `showInputBox`, or `createWebviewPanel`. It asserts that approved Japanese screen names are present and rejects this bounded list of operator-facing fragments:

```js
const forbidden = [
  /No (?:workflow )?run selected/i,
  /Workflow run not found/i,
  /validation failed/i,
  /generation failed/i,
  /is required/i,
  /already exists/i,
  /changed outside/i,
  /Apply changes/i,
  /Overwrite/i,
  /Continue/i,
  /Rollback to Original/i
]
```

Do not scan model validation modules or schema diagnostics where English field names are intentionally part of the contract.

- [ ] **Step 2: Verify RED separately**

```bash
cd extensions/workflow-register && npm run compile && node --test test/japaneseHostMessages.test.js
cd ../bob-bazaar-review && npm run compile && node --test test/japaneseHostMessages.test.js
cd ../bob-code-consistency-review && npm run compile && node --test test/japaneseHostMessages.test.js
```

Expected: each suite reports the remaining operator-facing English fragments and their source file.

- [ ] **Step 3: Replace messages file by file**

For every finding:

1. Confirm the string reaches a VS Code UI API or panel title.
2. Translate the message into natural Japanese.
3. Add the next operator action to errors and warnings.
4. Preserve interpolated IDs, paths, and technical names.
5. When a modal button is compared, update both sides atomically.
6. Add a focused assertion to the extension’s `japaneseHostMessages.test.js`.

Expected common button labels:

```text
Continue      -> 続行
Apply changes -> 変更を反映
Overwrite     -> 上書き
Create        -> 作成
Recover       -> 復旧
Rollback      -> 変更前に戻す
Cancel        -> 中止
```

- [ ] **Step 4: Verify all three host-message tests**

```bash
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (cd "extensions/$extension" && npm run compile && node --test test/japaneseHostMessages.test.js)
done
```

Expected: 0 failures, and no command IDs or persisted values changed.

- [ ] **Step 5: Commit by extension**

```bash
git add extensions/workflow-register/src extensions/workflow-register/test/japaneseHostMessages.test.js
git commit -m "feat: localize workflow host messages"

git add extensions/bob-bazaar-review/src extensions/bob-bazaar-review/test/japaneseHostMessages.test.js
git commit -m "feat: localize Bazaar host messages"

git add extensions/bob-code-consistency-review/src extensions/bob-code-consistency-review/test/japaneseHostMessages.test.js
git commit -m "feat: localize consistency host messages"
```

Before each commit, inspect `git diff --cached --stat` and `git diff --cached` to ensure only display strings and matching tests changed.

---

### Task 3: Add cross-extension terminology and compatibility tests

**Files:**
- Create: `scripts/check-japanese-gui-copy.js`
- Modify: `.github/workflows/extensions-quality.yml`
- Create: `docs/implementation/three-extension-japanese-gui-copy-verification-2026-07-16.md`

**Interfaces:** The script is a source/metadata policy check only. It must not import extension runtime modules or inspect generated user artifacts.

- [ ] **Step 1: Write the policy script with an intentional failing fixture**

Implement `scripts/check-japanese-gui-copy.js` to:

```js
const fs = require("node:fs")
const path = require("node:path")

const roots = [
  "extensions/workflow-register",
  "extensions/bob-bazaar-review",
  "extensions/bob-code-consistency-review"
]

const requiredByExtension = {
  "workflow-register": ["Bob 操作センター", "実行状況", "ワークフロー作成・編集"],
  "bob-bazaar-review": ["Bazaar レビューを開始", "レビュー結果の取り込み", "人による判定"],
  "bob-code-consistency-review": ["整合プレレビューを開始", "Bob 出力の取り込み", "トレーサビリティ確認"]
}

const forbiddenVisibleLabels = [
  "Bob Operation Hub",
  "Run Monitor",
  "Wizard v3 / Review Run",
  "Project Rule Source Wizard",
  "Project Rule Proposal Triage",
  "Consistency Review Wizard",
  "Evidence Picker",
  "Rollback to Original"
]
```

The implementation must parse `package.json` and scan an explicit allowlist of renderer/controller files. It must report `file:line: message`, ignore command IDs/comments/type names, and exit 1 on missing required labels or forbidden visible literals.

- [ ] **Step 2: Verify RED before the final copy changes land**

Run: `node scripts/check-japanese-gui-copy.js`

Expected: exit 1 with at least one current English primary label.

- [ ] **Step 3: Add CI wiring after the script passes locally**

Add one named step to `.github/workflows/extensions-quality.yml`:

```yaml
- name: Check Japanese GUI copy policy
  run: node scripts/check-japanese-gui-copy.js
```

Place it before packaging so copy regressions fail early.

- [ ] **Step 4: Add contract assertions**

The policy script must also verify:

- Every contributed command ID before/after matches the approved ID inventory committed in the verification note.
- Every Webview action/message literal used by the three main GUI test suites remains present.
- `package.json` setting keys, enums, defaults, patterns, and numeric limits are unchanged from the base manifest captured in the verification note.
- No new runtime dependency was added to any extension.

Use normalized JSON projections rather than comparing whole files.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/check-japanese-gui-copy.js
node --check scripts/check-japanese-gui-copy.js
git add scripts/check-japanese-gui-copy.js .github/workflows/extensions-quality.yml \
  docs/implementation/three-extension-japanese-gui-copy-verification-2026-07-16.md
git commit -m "test: enforce Japanese GUI copy policy"
```

Expected: both commands exit 0.

---

### Task 4: Perform final package and visual-language verification

**Files:**
- Modify if required: `docs/gui-first-operation-operator-uat-guide-ja.md`
- Create: `docs/release-evidence/three-extension-japanese-gui-copy-2026-07-16.md`

- [ ] **Step 1: Run the full three-extension gate**

```bash
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (
    cd "extensions/$extension"
    npm run architecture:policy
    npm run source:policy
    npm run dependency:policy
    npm test
    npm run package:policy
    npm run package
  )
done
```

For `workflow-register`, additionally run `npm run schema:policy`. For `bob-bazaar-review`, additionally run `npm run unused:policy` and `npm run package:smoke`.

Expected: every command exits 0. Record exact command output summaries and VSIX names in the release-evidence file.

- [ ] **Step 2: Run compatibility projections**

```bash
node scripts/check-japanese-gui-copy.js
git diff main...HEAD -- \
  extensions/workflow-register/package.json \
  extensions/bob-bazaar-review/package.json \
  extensions/bob-code-consistency-review/package.json
```

Confirm manually that only display metadata/descriptions changed; IDs, keys, defaults, enums, patterns, limits, and dependencies remain unchanged.

- [ ] **Step 3: Perform Japanese operator UAT**

Using the three packaged VSIX files in a disposable VS Code profile, capture results for:

1. Narrow Explorer sidebar and wide `Bob 操作センター` panel.
2. Workflow Builder tabs, long Japanese button labels, and validation navigation.
3. Bazaar review launcher → result capture → human decision → dashboard.
4. Rule-source selection and proposal decision screens.
5. Consistency wizard → Bob output capture → human decision.
6. Traceability approval tabs, restore confirmation, and save result.
7. Runs View, Status Bar, Run Control report, and a forced error with a repair action.

For each, record pass/fail, clipped or ambiguous labels, and screenshots’ local evidence paths. Do not commit screenshots containing workspace-sensitive data.

- [ ] **Step 4: Update operator guide and release evidence**

Use the final screen names and include a compact terminology table. Record any untranslated technical identifiers intentionally retained and why.

- [ ] **Step 5: Commit final evidence**

```bash
git add docs/gui-first-operation-operator-uat-guide-ja.md \
  docs/release-evidence/three-extension-japanese-gui-copy-2026-07-16.md
git commit -m "docs: record Japanese GUI copy verification"
```

- [ ] **Step 6: Final review checkpoint**

Run:

```bash
git status --short
git log --oneline --decorate main..HEAD
git diff --check main...HEAD
```

Expected: clean working tree, intended commit series only, and no whitespace errors. Do not claim release readiness unless the package gates and Japanese operator UAT both passed and are recorded.
