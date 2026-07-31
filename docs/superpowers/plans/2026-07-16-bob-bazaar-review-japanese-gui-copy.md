Replaced: `workflowRegister.openOperationHub`, `workflowRegister.openWorkflowBuilder`, `bobBazaar.openReviewGui`, and `bobCodeConsistency.openReviewWizard` are the current operator routes; the legacy Result Capture, Human Triage, and Campaign Dashboard labels below are retained only as historical terminology-migration context.

# Bob Bazaar Review 日本語 GUI 文言 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bob-bazaar-review` のレビュー開始、結果取り込み、人による判定、キャンペーン集計、規約資料取り込み、規約案確認を日本語主表示へ改訂する。

**Architecture:** 保存値と Webview 操作値は英語識別子のまま維持し、サーバー側レンダラーでは純粋な表示ラベル関数、クライアント側で更新される箇所では固定ラベルマップを使用する。既存の remote-safe view model、CSP、HTML エスケープ、パス境界、transaction recovery を変更しない。

**Tech Stack:** TypeScript、Node.js test runner、VS Code Extension API、VS Code Webview、AJV、既存 Review Run / rule-authoring models。

## Global Constraints

- `bobBazaar.*` コマンド ID、Webview `type` / `action`、`data-*`、review-run JSON、review-result JSON、triage YAML、保存列挙値は変更しない。
- `Review Run` は「レビュー実行」、`campaign` は「レビューキャンペーン」、`packet` は「レビュー資料」、`triage` は「人による判定」、`finding` は「指摘」と表示する。
- `campaign_id`、`review_id` は内部名を残せるが、主ラベルは「キャンペーン ID」「レビュー ID」とする。
- 未知の表示値は `不明（<内部値>）` とする。
- `--no-aliases`、MCP read-only、allowed-root、remote-safe text、CSP、nonce、transaction lock を変更しない。
- 新規ランタイム依存と `package.nls.json` は追加しない。

---

### Task 1: Add Bazaar UI display-label mappings

**Files:**
- Create: `extensions/bob-bazaar-review/src/ui/displayLabels.ts`
- Create: `extensions/bob-bazaar-review/test/japaneseDisplayLabels.test.js`

**Interfaces:**
- Produces `reviewRunPhaseLabel`, `reviewRunStatusLabel`, `reviewDecisionLabel`, `targetModeLabel`, `nextReviewActionLabel`, `extractionStatusLabel`, `proposalOperationLabel`, `confidenceLabel`, and `severityLabel`.
- Functions return display text only; internal values remain unchanged.

- [ ] **Step 1: Write the failing tests**

```js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const labels = require("../out/ui/displayLabels")

test("Bazaar review values use Japanese display labels", () => {
  assert.equal(labels.reviewRunPhaseLabel("packet"), "レビュー資料")
  assert.equal(labels.reviewRunStatusLabel("in_progress"), "実行中")
  assert.equal(labels.reviewDecisionLabel("needs_investigation"), "要調査")
  assert.equal(labels.targetModeLabel("revisionRange"), "リビジョン範囲")
  assert.equal(labels.nextReviewActionLabel("humanTriage"), "人による判定")
  assert.equal(labels.extractionStatusLabel("requires_ocr"), "OCR が必要")
  assert.equal(labels.proposalOperationLabel("retire"), "廃止")
  assert.equal(labels.confidenceLabel("high"), "高")
})

test("unknown Bazaar UI values use a safe fallback", () => {
  assert.equal(labels.reviewRunPhaseLabel("future"), "不明（future）")
  assert.equal(labels.reviewDecisionLabel("future"), "不明（future）")
})
```

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-bazaar-review && npm run compile && node --test test/japaneseDisplayLabels.test.js`

Expected: missing `out/ui/displayLabels.js`.

- [ ] **Step 3: Implement the mappings**

Create map-backed pure functions with these exact values:

```text
target / packet / result / triage / record / summary
レビュー対象 / レビュー資料 / 結果の取り込み / 人による判定 / 実績記録 / 集計レポート

not_started / in_progress / completed / failed / blocked
未開始 / 実行中 / 完了 / 失敗 / 続行不可

accepted / rejected / needs_investigation / deferred / pending / accept / reject / edit
採用 / 却下 / 要調査 / 保留 / 未判定 / 採用 / 却下 / 編集済み

singleRevision / revisionRange / workingTreeSinceRevision
1リビジョン / リビジョン範囲 / 未コミット差分

review / resultCapture / humanTriage / finalize / none
レビューを実行 / 結果を取り込む / 人による判定 / 完了処理 / なし

success / partial / blocked / failed / requires_conversion / requires_ocr / duplicate / selected
抽出済み / 一部のみ抽出 / 抽出不可 / 抽出失敗 / ファイル変換が必要 / OCR が必要 / 重複 / 未抽出

add / update / retire
追加 / 更新 / 廃止

high / medium / low / error / warning / info
高 / 中 / 低 / エラー / 警告 / 情報
```

Implement one private `labelOrUnknown` helper and one exported function per map.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/japaneseDisplayLabels.test.js
git add src/ui/displayLabels.ts test/japaneseDisplayLabels.test.js
git commit -m "test: define Bazaar GUI Japanese labels"
```

---

### Task 2: Localize the Bazaar review launcher and resume flow

**Files:**
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Create: `extensions/bob-bazaar-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve `reviewTarget`, `resumeReviewRun`, `recoverLegacyReview`, `campaignId`, `reviewId`, target values, and Review Run state transitions.

- [ ] **Step 1: Add RED launcher assertions**

Update `guiFirstSurfaces.test.js` to require `レビュー手順`, `キャンペーン ID`, `レビュー ID`, `途中のレビューを再開`, `レビュー結果の取り込みを開く`, `人による判定を開く`, and absence of `Wizard v3`, `Result Capture`, `Human Triage`, and `Campaign Dashboard` as primary button text.

Create `japaneseGuiCopy.test.js` using `readSourceSet` and `readJson`; scan the six UI renderers plus `package.json` for required Japanese screen names and forbidden old screen titles.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-bazaar-review && npm run compile && node --test test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply exact launcher copy**

```text
Bob Bazaar レビュー                 -> Bazaar レビューを開始
Wizard v3 / Review Run              -> レビュー手順
campaign                            -> レビューキャンペーン
campaign_id                         -> キャンペーン ID
review_id                           -> レビュー ID
target                              -> レビュー対象
packet                              -> レビュー資料
result                              -> 結果の取り込み
triage                              -> 人による判定
record / summary                    -> 実績保存・集計
未完了のReview Runを再開            -> 途中のレビューを再開
Review Run                          -> レビュー実行
Result Capture を開く               -> レビュー結果の取り込みを開く
Human Triage を開く                 -> 人による判定を開く
Campaign Dashboard を開く           -> レビューキャンペーン ダッシュボードを開く
Review Run を開始して Bob に追加    -> レビューを開始して Bob に渡す
Revno                               -> リビジョン番号
Committer                           -> コミッター
メッセージ / status                 -> コミットメッセージ／状態
Legacy Review Recovery              -> 既存成果物からレビューを復旧
legacy成果物から復旧                -> 既存成果物から復旧
```

Inside the Webview script, keep `phases = ["target", ...]` and message payloads unchanged. Add client-side `phaseLabel`, `phaseStatusLabel`, and `nextActionLabel` maps matching Task 1, and use them in `runState`, resume details, phase cards, success text, and target-resume guidance.

In `reviewGui.ts`, translate workspace selection, initialization, recovery, mismatch, progress, and fallback messages. Each error must end with the next action, for example: `.bob が未初期化です。先に「.bob を初期化」を実行してください。` Keep the Bob extension fallback behavior unchanged.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/ui/reviewGui*.ts test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize Bazaar review launcher"
```

---

### Task 3: Localize Result Capture and Human Triage

**Files:**
- Modify: `extensions/bob-bazaar-review/src/ui/resultCaptureGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/resultCaptureGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-bazaar-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve capture actions, review ID validation, decision values, metric fields, and finalize ordering.

- [ ] **Step 1: Add RED assertions**

Require screen titles `レビュー結果の取り込み` and `人による判定`; require Japanese decision options `採用`, `却下`, `要調査`, `保留`; assert option `value` attributes remain `accepted`, `rejected`, `needs_investigation`, and `deferred`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-bazaar-review && npm run compile && node --test test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply Result Capture copy**

```text
Bazaar Result Capture       -> Bazaar レビュー結果の取り込み
Result Capture              -> レビュー結果の取り込み
Active Review Run           -> 現在のレビュー
Standalone mode             -> 単独実行モード
Bob 出力候補                -> Bob のレビュー結果
候補から取り込む            -> 見つかった候補を取り込む
開いている JSON を検証      -> 開いているレビュー結果を検証
Human Triage へ進む         -> 人による判定へ進む
手動貼り付け                -> JSON を貼り付けて取り込む
検証結果                    -> 取り込み結果
```

Rewrite the candidate explanation as: `選択範囲、開いているファイル、クリップボードの順に候補を探します。保存前に JSON の形式とチェックリストとの整合を確認します。`

- [ ] **Step 4: Apply Human Triage copy**

```text
Bazaar Human Triage       -> Bazaar レビューの人による判定
Human Triage              -> 人による判定
Active Review Run         -> 現在のレビュー
Finding 採否判断          -> 指摘の判定
finding / rule_id         -> 指摘 / 規約 ID
decision / owner          -> 判定 / 担当者
action / reason           -> 対応内容 / 理由
Review Run Metrics        -> レビュー時間
baseline review           -> 従来レビュー
Bob review                -> Bob レビュー
Human Triage              -> 人による判定
metricsを保存             -> レビュー時間を保存
triage 雛形を生成         -> 判定一覧を作成
triage を検証             -> 判定内容を検証
record を作成             -> 実績記録を作成
summary 生成              -> 集計レポートを作成
Review Runを完了して集計 -> レビューを完了して集計
```

Render option labels through `reviewDecisionLabel` while preserving their values. Render phase cards through `reviewRunPhaseLabel` / `reviewRunStatusLabel`. Translate client validation messages so they say `採用には担当者または対応内容が必要です`, `却下には理由が必要です`, `要調査には担当者と対応内容が必要です`, and `保留には理由が必要です`.

- [ ] **Step 5: Verify and commit**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/ui/resultCaptureGui*.ts src/ui/humanTriageGui*.ts test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize Bazaar result and triage UI"
```

---

### Task 4: Localize Campaign Dashboard

**Files:**
- Modify: `extensions/bob-bazaar-review/src/ui/campaignDashboardGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/campaignDashboardGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/test/campaignDashboardGui.test.js`
- Modify: `extensions/bob-bazaar-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve dashboard schema, export formats, campaign selection messages, and rate calculations.

- [ ] **Step 1: Change dashboard tests to Japanese headings**

Require `レビューキャンペーン ダッシュボード`, `概要`, `判定待ち`, `レビュー実行`, `規約別の傾向`, `変更種別の傾向`, `所要時間`, `注意事項`; keep action assertions for `refresh`, `selectCampaign`, and `export`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-bazaar-review && npm run compile && node --test test/campaignDashboardGui.test.js`

- [ ] **Step 3: Apply dashboard copy and dynamic labels**

```text
Campaign Dashboard              -> レビューキャンペーン ダッシュボード
Overview                        -> 概要
Human Triage Pending            -> 判定待ち
Review Runs                     -> レビュー実行
Rule Trends                     -> 規約別の傾向
Change Type Trends              -> 変更種別の傾向
Time                            -> 所要時間
Warnings                        -> 注意事項
JSON / Markdown / CSV export    -> JSON／Markdown／CSV で書き出す
Exports                         -> 書き出したファイル
Baseline review                 -> 従来レビュー
Bob review                      -> Bob レビュー
Human Triage                    -> 人による判定
Estimated saved                 -> 推定削減時間
Schema validation               -> 形式検証率
Finding acceptance/rejection/resolution -> 指摘の採用率／却下率／判定完了率
```

Use Task 1 labels for run status, target mode, next action, triage status, and decision-related table columns. Use `有効`, `無効`, `未確認` for schema validity. Preserve numeric values and percentages.

Translate controller notifications to `ダッシュボードを読み込みました`, `再読み込みしました`, `ファイルへ書き出しました`, and actionable workspace errors.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardGui.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/ui/campaignDashboardGui*.ts test/campaignDashboardGui.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize Bazaar campaign dashboard"
```

---

### Task 5: Localize project-rule source and proposal GUIs

**Files:**
- Modify: `extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/ruleAuthoringGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/ruleProposalTriageGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/ruleProposalTriageGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/test/ruleAuthoringGui.test.js`
- Modify: `extensions/bob-bazaar-review/test/ruleProposalTriageGui.test.js`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-bazaar-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve remote-safe allowlists, message schemas, decision overlay, evidence locators, preview binding, transaction recovery, and apply confirmation ordering.

- [ ] **Step 1: Add RED renderer assertions**

Require `規約資料の取り込み`, `実行環境`, `資料の選択`, `抽出内容と対象範囲`, `AI に送る内容の確認`, `規約案の確認・採否`, `採用`, `却下`, `競合`, `反映プレビュー`, and `未完了の反映処理を復旧`. Forbid old screen titles and English-only action buttons. Keep all CSP and private-data assertions.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-bazaar-review && npm run compile && node --test test/ruleAuthoringGui.test.js test/ruleProposalTriageGui.test.js test/guiFirstSurfaces.test.js`

- [ ] **Step 3: Apply rule-source wizard copy**

```text
Project Rule Source Wizard    -> 規約資料の取り込み
Environment                   -> 実行環境
Workspace                     -> ワークスペース
Bob extension                 -> Bob 拡張機能
Configured Bob model route    -> 設定済みの Bob モデル経路
Source Selection              -> 資料の選択
Choose source files           -> 資料を選択
Extract selected sources      -> 選択した資料を読み取る
Extraction Preview / Scope    -> 抽出内容と対象範囲
AI Payload / Consent          -> AI に送る内容の確認
Logical source names          -> 資料名
Selected chunks               -> 選択した範囲
Confirm AI payload            -> この内容で AI に渡す
Cancel                        -> 中止
Resume an incomplete run      -> 途中の取り込みを再開
Remove                        -> 選択から外す
```

Use `extractionStatusLabel` for status display. Translate conversion, OCR, partial extraction, blocked extraction, scope overflow, and exclusion approval guidance without exposing local paths or source text.

- [ ] **Step 4: Apply rule-proposal triage copy**

```text
Project Rule Proposal Triage     -> 規約案の確認・採否
Apply preview and completion     -> 反映プレビューと完了処理
Every candidate has...           -> すべての候補を判定済みです。
Decision required...             -> すべての候補について採用、却下、または編集を選んでください。
Regenerate apply preview         -> 反映プレビューを更新
Apply approved operations        -> 採用した変更を反映
Close                            -> 閉じる
Inspect locator                  -> 根拠を開く
Optional reject reason           -> 却下理由（任意）
Accept / Reject                  -> 採用 / 却下
Edit proposed rule               -> 規約案を編集
Validate and save edit           -> 検証して編集内容を保存
Conflicts                        -> 競合
Transaction recovery required    -> 未完了の反映処理を復旧
Complete commit / Rollback       -> 反映処理を完了 / 変更前に戻す
Open full comparison             -> 全文比較を開く
```

Render operation, confidence, severity, and decision badges through Task 1 labels. Keep `data-decision="accept|reject"`, transaction actions, evidence indices, and confirmation guards unchanged.

- [ ] **Step 5: Verify and commit**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/ruleAuthoringGui.test.js test/ruleProposalTriageGui.test.js test/guiFirstSurfaces.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/ui/ruleAuthoringGui*.ts src/ui/ruleProposalTriageGui*.ts test/ruleAuthoringGui.test.js test/ruleProposalTriageGui.test.js test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize Bazaar rule authoring UI"
```

---

### Task 6: Finish package metadata, docs, and full verification

**Files:**
- Modify: `extensions/bob-bazaar-review/package.json`
- Modify: `extensions/bob-bazaar-review/README.md`
- Modify: `extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/project-rule-authoring-windows-uat.md`
- Modify: `extensions/bob-bazaar-review/test/japaneseGuiCopy.test.js`

- [ ] **Step 1: Add package-copy assertions**

Require display name `Bob Bazaar レビュー`, command category `Bob Bazaar レビュー`, and exact major titles: `Bazaar レビューを開始`, `レビューキャンペーン ダッシュボードを開く`, `レビュー結果の取り込みを開く`, `人による判定を開く`, `規約資料からプロジェクト規約を作成`, `実績キャンペーンを初期化`, `実績記録を作成`, `人による判定一覧を作成`, `集計レポートを生成`.

- [ ] **Step 2: Update metadata and settings descriptions**

Set description to `IBM Bob 向けの Bazaar レビュー、プロジェクト規約、レビュー実績管理、MCP 連携を提供します。日本語と Shift-JIS 系の Bazaar 出力に対応します。`. Replace `packet`, `checklist`, `schema`, `host hard maximum`, `chunk`, `proposal agent`, and `byte` in settings descriptions with Japanese-first explanations while preserving keys, values, and limits.

- [ ] **Step 3: Align documentation screen names**

Use exactly: `Bazaar レビューを開始`, `レビュー結果の取り込み`, `人による判定`, `レビューキャンペーン ダッシュボード`, `規約資料の取り込み`, `規約案の確認・採否`.

- [ ] **Step 4: Scan and run full verification**

```bash
cd extensions/bob-bazaar-review
grep -RInE 'Wizard v3|Result Capture|Human Triage|Campaign Dashboard|Project Rule Source Wizard|Project Rule Proposal Triage' src package.json README.md test || true
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run dependency:policy
npm test
npm run package:policy
npm run package:smoke
npm run package
```

Expected: no user-visible obsolete primary labels; every verification command exits 0.

- [ ] **Step 5: Commit docs and metadata**

```bash
git add extensions/bob-bazaar-review/package.json extensions/bob-bazaar-review/README.md \
  extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md \
  extensions/bob-bazaar-review/docs/project-rule-authoring-windows-uat.md \
  extensions/bob-bazaar-review/test/japaneseGuiCopy.test.js
git commit -m "docs: align Bazaar GUI Japanese terminology"
```
