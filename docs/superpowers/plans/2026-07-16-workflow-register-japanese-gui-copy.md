# Workflow Register 日本語 GUI 文言 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `workflow-register` の操作センター、ワークフロー作成・編集、手動ステップ、テンプレート調整、コマンド・設定表示を日本語主表示へ改訂する。

**Architecture:** 動的な実行状態だけを純粋な表示ラベル関数へ集約し、静的コピーは各レンダラーの近くで直接変更する。コマンド ID、Webview メッセージ、保存値、モデルキー、CSP、パス境界は維持する。

**Tech Stack:** TypeScript、Node.js test runner、VS Code Extension API、VS Code Webview、`package.json` contributions。

## Global Constraints

- コマンド ID、設定キー、`type` / `action` / `data-*`、JSON・YAML キー、保存列挙値は変更しない。
- `workflow` は「ワークフロー」、`run` は「実行」、`step` は「ステップ」、`artifact` は「成果物」、`diagnostics` は「診断結果」と表示する。
- 内部識別子は `出力キー（resultKey）` のように日本語を先に置く。
- 未知の表示値は `不明（<内部値>）` とする。
- `package.nls.json` と新規ランタイム依存は追加しない。
- 既存の CSP、nonce、HTML エスケープ、single-flight mutation、run revision 検証を変更しない。

---

### Task 1: Add pure display-label mappings

**Files:**
- Create: `extensions/workflow-register/src/ui/displayLabels.ts`
- Create: `extensions/workflow-register/test/japaneseDisplayLabels.test.js`

**Interfaces:**
- Produces `workflowRunStatusLabel(value)`, `workflowStepStatusLabel(value)`, and `workflowStepCompletionLabel(completion, runStatus)`.
- Returned labels are display-only and must never be written to run state.

- [ ] **Step 1: Write the failing tests**

```js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  workflowRunStatusLabel,
  workflowStepStatusLabel,
  workflowStepCompletionLabel
} = require("../out/ui/displayLabels")

test("known workflow statuses use Japanese labels", () => {
  assert.equal(workflowRunStatusLabel("running"), "実行中")
  assert.equal(workflowRunStatusLabel("reviewing"), "人による確認待ち")
  assert.equal(workflowRunStatusLabel("held"), "手動操作待ち")
  assert.equal(workflowRunStatusLabel("completed"), "完了")
  assert.equal(workflowStepStatusLabel("pending"), "未開始")
  assert.equal(workflowStepCompletionLabel("reused", "completed"), "再利用")
})

test("unknown statuses use a safe fallback", () => {
  assert.equal(workflowRunStatusLabel("future"), "不明（future）")
  assert.equal(workflowStepStatusLabel("future"), "不明（future）")
})
```

- [ ] **Step 2: Verify RED**

Run: `cd extensions/workflow-register && npm run compile && node --test test/japaneseDisplayLabels.test.js`

Expected: missing `out/ui/displayLabels.js` or missing exports.

- [ ] **Step 3: Implement the minimal module**

```ts
const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  running: "実行中",
  paused: "一時停止",
  checkpoint: "分岐確認待ち",
  reviewing: "人による確認待ち",
  held: "手動操作待ち",
  completed: "完了",
  failed: "失敗"
}

const STEP_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "未開始",
  running: "実行中",
  reviewing: "人による確認待ち",
  held: "手動操作待ち",
  completed: "完了",
  failed: "失敗",
  skipped: "省略"
}

function labelOrUnknown(value: string, labels: Readonly<Record<string, string>>): string {
  return labels[value] ?? `不明（${value}）`
}

export function workflowRunStatusLabel(value: string): string {
  return labelOrUnknown(value, RUN_STATUS_LABELS)
}

export function workflowStepStatusLabel(value: string): string {
  return labelOrUnknown(value, STEP_STATUS_LABELS)
}

export function workflowStepCompletionLabel(completion: string, runStatus: string): string {
  return completion === "reused" ? "再利用" : workflowStepStatusLabel(runStatus)
}
```

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/japaneseDisplayLabels.test.js
git add src/ui/displayLabels.ts test/japaneseDisplayLabels.test.js
git commit -m "test: define workflow GUI Japanese labels"
```

---

### Task 2: Localize Bob Operation Hub

**Files:**
- Modify: `extensions/workflow-register/src/gui/operationHubHtml.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubModel.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubProvider.ts`
- Modify: `extensions/workflow-register/package.json`
- Modify: `extensions/workflow-register/test/operationHub.test.js`
- Modify: `extensions/workflow-register/test/operationHubStepProvenance.test.js`
- Create: `extensions/workflow-register/test/japaneseGuiCopy.test.js`

**Interfaces:** Consumes Task 1 labels and preserves `OperationHubActionId`, command IDs, `data-action`, run IDs, paths, and revision guards.

- [ ] **Step 1: Add RED assertions**

Add a rendered-HTML test requiring `Bob 操作センター`, `実行状況`, and `実行中または最近の実行はありません`, while forbidding `Run Monitor`. Update the Explorer view assertion from `Bob Operation Hub` to `Bob 操作センター`.

Create a source-scan test using `readSourceSet` and `readJson` that requires `Bob 操作センター`, `実行状況`, `ワークフロー一覧`, `セットアップ`, and forbids `Bob Operation Hub`, `Run Monitor`, and `Bob Workflow Runs` in user-visible source and contributions.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/workflow-register && npm run compile && node --test test/operationHub.test.js test/operationHubStepProvenance.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply exact copy mapping**

```text
Bob Operation Hub                      -> Bob 操作センター
Run Monitor                            -> 実行状況
実行中または直近の run はありません。 -> 実行中または最近の実行はありません。
workflow N / active run N              -> ワークフロー N件 / 実行中 N件
N step / updated                       -> Nステップ / 更新
progress                               -> 進捗
Held run recovery                      -> 中断した実行の復旧
N more step(s); see Run Diagnostics    -> ほかNステップ。詳しくは実行診断を確認してください。
No workspace                           -> ワークスペースが開かれていません
```

In `operationHubModel.ts`, import Task 1 helpers. Use `workflowStepCompletionLabel` for provenance and `workflowRunStatusLabel` for ordinary run states. Keep the pending special case as `次のステップを実行できます`.

Translate dynamic summaries exactly:

```text
Skipped by artifact reuse   -> 成果物を再利用したため省略
from <run>                   -> 再利用元: <run>
Artifact verified           -> 成果物を確認済み
Imported from task snapshot -> 保存済みタスクから取り込み
artifacts <ids>              -> 成果物: <ids>
hydrated <keys>              -> 復元した状態キー: <keys>
Bob Todo: synced             -> Bob Todo: 同期済み
Bob Todo: repair pending     -> Bob Todo: 修復待ち
Bob Todo: not linked yet     -> Bob Todo: まだ関連付けられていません
Reusable artifacts: N       -> 再利用できる成果物: N件
```

In `operationHubProvider.ts`, use panel title `Bob 操作センター`; label the specialist extensions `Bob Bazaar レビュー` and `Bob コード整合プレレビュー`.

In `package.json`, preserve IDs but set `displayName` to `Bob ワークフロー管理`, description to `IBM Bob ワークフローの作成、実行、再開、診断、成果物管理を行います。`, command category to `Bob ワークフロー`, and views to `Bob 操作センター` / `Bob ワークフロー実行`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/operationHub.test.js test/operationHubStepProvenance.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/gui package.json test/operationHub*.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize workflow operation hub"
```

---

### Task 3: Localize Workflow Builder and help

**Files:**
- Modify: `extensions/workflow-register/src/webview/workflowBuilderHtml.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderCoreRendererScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderStepRendererScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderTabRenderersScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderPreviewScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderHelpCatalog.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderHelpCatalogExtended.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`
- Modify: `extensions/workflow-register/test/workflowBuilderWebviewModules.test.js`
- Modify: `extensions/workflow-register/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve every `data-tab`, `data-action`, help ID, model field, and serialized `WORKFLOW.md` key.

- [ ] **Step 1: Add RED assertions**

Require `実行条件`, `安全制限`, `Markdown 本文`, `プレビューと診断`, `ステップ種別`, and `ステップ設定`; forbid the old primary headings `Bob Workflow Builder`, `Step detail`, `Inputs`, `Requires`, `Preflight`, `Branching`, `Artifacts`, `Guardrails`, `Completion`, and `Preview / Diagnostics`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/workflow-register && npm run compile && node --test test/workflowBuilderWebviewModules.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply exact copy mapping**

```text
Bob Workflow Builder  -> Bob ワークフロー作成・編集
workflow name         -> ワークフロー名
Steps                 -> ステップ
+ AI step             -> AI ステップを追加
+ Command             -> コマンドステップを追加
+ Manual              -> 手動ステップを追加
+ Result              -> 保存ステップを追加
Step detail           -> ステップ設定
Inputs                -> 入力項目
Requires              -> 実行条件
Preflight             -> 事前確認
Branching             -> 分岐・ループ
Artifacts             -> 成果物
Guardrails            -> 安全制限
Completion            -> 完了時の処理
Markdown Body         -> Markdown 本文
Preview / Diagnostics -> プレビューと診断
User action           -> 実行時の案内
Manual Form           -> 入力フォーム
Manual Approval       -> 承認・差戻し
Transition            -> 次の遷移
Result sinks          -> 保存先
Show Diff             -> 差分を表示
Validate              -> 内容を検証
Save WORKFLOW.md      -> WORKFLOW.md を保存
Validation OK         -> 検証に合格しました
```

Use Japanese-first internal labels: `ステップ ID`, `ステップ種別`, `出力キー（resultKey）`, `前のステップから引き継ぐ値（includeState）`, `出力上限（maxResultBytes）`, `実行プロバイダー（action.provider）`, `追加引数（JSON 配列）`.

Set panel titles to `Bob ワークフロー作成・編集` and `Bob ワークフロー作成・編集: 編集`. Translate save, overwrite, conflict, diff, and validation notifications; when a modal item changes, update its returned-string comparison in the same block.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowBuilderWebviewModules.test.js test/workflowBuilderStepDraftScript.test.js test/workflowBuilderSkipResumeReadinessWebview.test.js test/japaneseGuiCopy.test.js
git add src/webview/workflowBuilder*.ts test/workflowBuilder*.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize workflow builder UI"
```

---

### Task 4: Localize Manual Step and Template Studio

**Files:**
- Modify: `extensions/workflow-register/src/webview/manualStepPanel.ts`
- Modify: `extensions/workflow-register/src/webview/manualStepPanelHtml.ts`
- Modify: `extensions/workflow-register/src/webview/templateCustomizationStudioPanel.ts`
- Modify: `extensions/workflow-register/src/webview/templateCustomizationStudioHtml.ts`
- Modify: `extensions/workflow-register/src/webview/templateCustomizationStudioClientScript.ts`
- Modify: `extensions/workflow-register/test/manualStepPanel.test.js`
- Modify: `extensions/workflow-register/test/templateCustomizationStudio.test.js`
- Modify: `extensions/workflow-register/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve `completeManualStep`, `activeKey`, Template Studio message types, model keys, and generated artifacts.

- [ ] **Step 1: Add RED copy assertions**

For Manual Step, require `Bob 手動ステップ`, `ワークフロー:`, `実行 ID:`, `ステップ:`, `状態:`, and absence of `Run Control View`.

For Template Studio, require `テンプレート一覧`, `プロジェクト設定`, `適用準備状況`, `チェックリストのパス`, `Bob への補足指示`, and absence of headings `Template Library`, `Customize`, and `Readiness`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/workflow-register && npm run compile && node --test test/manualStepPanel.test.js test/templateCustomizationStudio.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply Manual Step copy**

```text
Bob Workflow Manual Step -> Bob 手動ステップ
Workflow:                 -> ワークフロー:
Run ID:                   -> 実行 ID:
Step:                     -> ステップ:
Status:                   -> 状態:
参考情報                   -> 参照情報
workflowFile              -> ワークフロー定義
state keys                -> 状態キー
none                      -> なし
処理中...                 -> 処理中…
```

Display status values as `操作待ち`, `完了`, `エラー`, `接続の復旧が必要`. Replace disconnected guidance with `この実行は手動操作待ちですが、現在の Bob タスクには接続できません。操作センターの復旧操作を使用してください。`.

- [ ] **Step 4: Apply Template Studio copy**

```text
Template Customization Studio -> テンプレート調整
Template Library              -> テンプレート一覧
Customize                     -> プロジェクト設定
Readiness                     -> 適用準備状況
Project Profile               -> プロジェクト情報
Workflow Customization        -> ワークフロー設定
checklist path                -> チェックリストのパス
phase artifact root           -> 工程成果物の出力先
UAT evidence path             -> UAT 証跡のパス
input defaults                -> 入力項目の既定値
prompt supplement             -> Bob への補足指示
human gate                    -> 人による確認
stepReview pauseAfter         -> ステップ後の一時停止
Preview / Diagnostics         -> プレビューと診断
```

Format readiness output as `状態: 合格|注意|要対応`, `スコア: N`, `確認項目`, `次の対応`, and `次の対応はありません。`. Translate panel notifications for missing templates, generation failure/success, preview failure, and missing readiness report.

- [ ] **Step 5: Verify and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/manualStepPanel.test.js test/manualStepPanelLifecycle.test.js test/templateCustomizationStudio.test.js test/templateCommands.test.js test/japaneseGuiCopy.test.js
git add src/webview/manualStepPanel*.ts src/webview/templateCustomizationStudio*.ts test/manualStepPanel.test.js test/templateCustomizationStudio.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize workflow auxiliary GUIs"
```

---

### Task 5: Finish command and settings metadata

**Files:**
- Modify: `extensions/workflow-register/package.json`
- Modify: `extensions/workflow-register/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve IDs, activation events, menu entries, defaults, enums, patterns, and limits.

- [ ] **Step 1: Add RED package assertions**

Assert every command category is `Bob ワークフロー`, and these titles match exactly: `保存済みタスクから成果物を取り込む`, `実行を一時停止`, `一時停止した実行を再開`, `実行履歴の削除候補を確認`, `完了済みの実行履歴を整理`, `テンプレートの適用準備状況を確認`, `テンプレート調整を開く`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/workflow-register && node --test test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply exact metadata replacements**

```text
Task Snapshot から成果物を取り込む -> 保存済みタスクから成果物を取り込む
実行中 run を中断                  -> 実行を一時停止
現在ステップ後に中断              -> 現在のステップ後に一時停止
次のAI呼び出し前に中断            -> 次の AI 呼び出し前に一時停止
中断 run を再開                   -> 一時停止した実行を再開
実行ストレージを確認              -> 実行履歴の保存状況を確認
実行クリーンアップをプレビュー    -> 実行履歴の削除候補を確認
完了済み実行をクリーンアップ      -> 完了済みの実行履歴を整理
テンプレート Readiness を確認      -> テンプレートの適用準備状況を確認
テンプレートカスタマイズ Studio    -> テンプレート調整を開く
```

Rewrite settings descriptions so the effect comes first. For example, `sourceId` becomes `IBM Bob にワークフローを登録するときの内部識別子です。通常は変更しません。`; `agentCommand` becomes `単独実行時に AI ステップを処理する任意の VS Code コマンド ID です。`; retention descriptions use `実行履歴`, `件`, and `整理候補` instead of `run`, `terminal run`, and `cleanup`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/workflow-register
npm run compile
node --test test/operationHub.test.js test/templateCommands.test.js test/japaneseGuiCopy.test.js
git add package.json test/japaneseGuiCopy.test.js
git commit -m "feat: localize workflow commands and settings"
```

---

### Task 6: Update documentation and run full verification

**Files:**
- Modify: `extensions/workflow-register/README.md`
- Modify: `docs/gui-first-operation-operator-uat-guide-ja.md`
- Modify: `docs/workflow-builder-guided-help-ja.md`

- [ ] **Step 1: Align documentation terminology**

Use exactly: `Bob 操作センター`, `Bob ワークフロー作成・編集`, `Bob 手動ステップ`, `テンプレート調整`, `実行状況`, `プレビューと診断`, `適用準備状況`.

- [ ] **Step 2: Scan obsolete primary labels**

Run: `cd extensions/workflow-register && grep -RInE 'Bob Operation Hub|Run Monitor|Bob Workflow Builder|Bob Workflow Manual Step|Template Customization Studio|Preview / Diagnostics' src package.json README.md test || true`

Expected: no user-visible matches. Command IDs, type names, comments, and historical references are allowed only when not rendered.

- [ ] **Step 3: Run full verification**

```bash
cd extensions/workflow-register
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run dependency:policy
npm test
npm run package:policy
npm run package
```

Expected: every command exits 0.

- [ ] **Step 4: Inspect metadata and commit docs**

```bash
cd extensions/workflow-register
node -e 'const p=require("./package.json"); console.log(p.displayName); console.log(p.contributes.views.explorer); console.log(p.contributes.commands.map(({command,title,category})=>({command,title,category})))'
git add README.md ../../docs/gui-first-operation-operator-uat-guide-ja.md ../../docs/workflow-builder-guided-help-ja.md
git commit -m "docs: align workflow GUI Japanese terminology"
```

Expected: visible metadata is Japanese-first and command IDs are unchanged.
