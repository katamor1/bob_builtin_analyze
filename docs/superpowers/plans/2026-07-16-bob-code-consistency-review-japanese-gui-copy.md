# Bob Code Consistency Review 日本語 GUI 文言 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bob-code-consistency-review` の整合プレレビュー、Bob 出力取り込み、人による判定、トレーサビリティ確認、コマンド・設定表示を日本語主表示へ改訂する。

**Architecture:** review focus、変更種別、資料種別、判定、重大度などの動的表示を純粋なラベル関数へ集約し、`value` と保存値は変更しない。Traceability Prep のクライアント側表示には同じ固定マップを持たせ、既存の catalog approval、revision token、CSP、host-owned save を維持する。

**Tech Stack:** TypeScript、Node.js test runner、VS Code Extension API、VS Code Webview、YAML、既存 traceability / human-triage models。

## Global Constraints

- `bobCodeConsistency.*` コマンド ID、Webview `type` / `action`、`data-*`、review-input YAML、traceability catalog、Bob output YAML、triage 保存値は変更しない。
- `Result Capture` は「Bob 出力の取り込み」、`Human Triage` は「人による判定」、`Traceability Prep` は「トレーサビリティ確認」と表示する。
- `review_id`、`change_type`、`base`、`head` などの内部キーは必要に応じて補助表示に残し、日本語を主ラベルにする。
- 未知の表示値は `不明（<内部値>）` とする。
- CSP、nonce、HTML エスケープ、source SHA、decision revision、catalog revision、backup、path containment を変更しない。
- 新規ランタイム依存と `package.nls.json` は追加しない。

---

### Task 1: Add consistency-review display-label mappings

**Files:**
- Create: `extensions/bob-code-consistency-review/src/webview/displayLabels.ts`
- Create: `extensions/bob-code-consistency-review/test/japaneseDisplayLabels.test.js`

**Interfaces:**
- Produces `reviewFocusLabel`, `changeTypeLabel`, `artifactKindLabel`, `traceabilityStatusLabel`, `humanDecisionLabel`, `severityLabel`, `confidenceLabel`, and `sourceTypeLabel`.
- Functions return display text only; the original internal values remain in DOM `value` and persisted artifacts.

- [ ] **Step 1: Write the failing tests**

```js
const assert = require("node:assert/strict")
const { test } = require("node:test")
const labels = require("../out/webview/displayLabels")

test("consistency review values use Japanese labels", () => {
  assert.equal(labels.reviewFocusLabel("requirement-code-consistency"), "要求とコードの整合")
  assert.equal(labels.changeTypeLabel("spec_change"), "仕様変更")
  assert.equal(labels.artifactKindLabel("basic_design"), "基本設計")
  assert.equal(labels.traceabilityStatusLabel("proposed"), "未承認")
  assert.equal(labels.humanDecisionLabel("needs_investigation"), "要調査")
  assert.equal(labels.severityLabel("critical"), "緊急")
  assert.equal(labels.confidenceLabel("medium"), "中")
  assert.equal(labels.sourceTypeLabel("question"), "確認事項")
})

test("unknown consistency values use a safe fallback", () => {
  assert.equal(labels.reviewFocusLabel("future"), "不明（future）")
  assert.equal(labels.severityLabel("future"), "不明（future）")
})
```

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-code-consistency-review && npm run compile && node --test test/japaneseDisplayLabels.test.js`

Expected: missing `out/webview/displayLabels.js`.

- [ ] **Step 3: Implement map-backed functions**

Use these exact mappings:

```text
requirement-code-consistency / design-code-consistency / test-gap / document-update-gap
要求とコードの整合 / 設計とコードの整合 / テスト不足 / 文書更新漏れ

unintended-change / interface-impact / rt-ts-rule / shared-memory-impact
意図しない変更 / インターフェース影響 / RT・TS 規約 / 共有メモリー影響

bugfix / feature / spec_change / refactor / performance / maintenance
不具合修正 / 機能追加 / 仕様変更 / リファクタリング / 性能改善 / 保守変更

requirements / basic_design / detailed_design / test_spec / ledgers / tickets
要求仕様 / 基本設計 / 詳細設計 / テスト仕様 / 管理台帳 / チケット

proposed / accepted / rejected / deprecated
未承認 / 採用 / 却下 / 廃止

accepted / rejected / needs_investigation / deferred / question
採用 / 却下 / 要調査 / 保留 / 確認依頼

critical / high / medium / low / info
緊急 / 高 / 中 / 低 / 情報

finding / question
指摘 / 確認事項
```

Implement one private `labelOrUnknown` helper and one exported function per map.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/japaneseDisplayLabels.test.js
git add src/webview/displayLabels.ts test/japaneseDisplayLabels.test.js
git commit -m "test: define consistency GUI Japanese labels"
```

---

### Task 2: Localize the Consistency Review Wizard

**Files:**
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardHtml.ts`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`
- Create: `extensions/bob-code-consistency-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve `createReviewInput`, `openTraceabilityPrep`, `preprocess`, draft keys, checkbox values, VCS values, and review-input output.

- [ ] **Step 1: Add RED wizard assertions**

Update `guiFirstSurfaces.test.js` to require `整合プレレビューを開始`, `変更範囲`, `関連資料の選択`, `確認観点`, `トレーサビリティ`, `Bob に渡す資料`, and absence of `Consistency Review Wizard`, `Evidence Picker`, `Review Focus`, and `Package Preview`.

Create `japaneseGuiCopy.test.js` using `readSourceSet` and `readJson`; scan the four Webview renderers, Traceability assets, host controllers, and `package.json` for required Japanese screen names and forbidden old titles.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-code-consistency-review && npm run compile && node --test test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply exact wizard copy**

```text
Consistency Review Wizard -> 整合プレレビューを開始
VCS / Revision             -> 変更範囲
review_id                  -> レビュー ID
title                      -> 表示名
change_type                -> 変更種別
base                       -> 比較元
head                       -> 比較先
Evidence Picker            -> 関連資料の選択
Review Focus               -> 確認観点
Traceability               -> トレーサビリティ
Package Preview            -> Bob に渡す資料
Status                     -> 実行結果
Traceability Prep を開く   -> トレーサビリティ確認を開く
Traceability から review-input -> トレーサビリティから review-input を作成
Traceability を検証        -> トレーサビリティを検証
選択内容から review-input を生成 -> 選択内容から review-input を作成
Bob 用パッケージを作成     -> Bob に渡すレビュー資料を作成
Result Capture へ進む      -> Bob 出力の取り込みへ進む
Human Triage へ進む        -> 人による判定へ進む
```

Render VCS options as `Git`, `Bazaar`, `Bazaar（bzr）`; render change types and review-focus labels through Task 1 helpers while preserving each option/checkbox value. Render document kind through `artifactKindLabel`.

Change the panel title in `consistencyReviewWizard.ts` to `整合プレレビューを開始`, picker title to `コード整合プレレビューのワークスペースを選択`, and success messages to concrete outcomes such as `Bob に渡すレビュー資料を更新しました。` and `操作が完了しました。次の画面を確認してください。`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/webview/consistencyReviewWizard*.ts test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize consistency review wizard"
```

---

### Task 3: Localize Bob output capture

**Files:**
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyResultCapture.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyResultCaptureHtml.ts`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-code-consistency-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve capture actions, YAML validation, evidence-index validation, clipboard flow, and transition to Human Triage.

- [ ] **Step 1: Add RED assertions**

Require `Bob 出力の取り込み`, `Bob 出力（YAML）`, `クリップボードから取り込む`, `保存済みの Bob 出力を検証`, `人による判定へ進む`; forbid `Code Consistency Result Capture`, `Result Capture`, and `Bob output YAML` as primary headings.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-code-consistency-review && npm run compile && node --test test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js`

- [ ] **Step 3: Apply exact copy**

```text
Code Consistency Result Capture -> Bob 出力の取り込み
Result Capture                  -> Bob 出力の取り込み
Bob output YAML                 -> Bob 出力（YAML）
clipboard から取り込む          -> クリップボードから取り込む
保存済み YAML を検証            -> 保存済みの Bob 出力を検証
Human Triage へ進む             -> 人による判定へ進む
検証結果                        -> 取り込み結果
```

Rewrite the helper text as `保存前に YAML の形式と、根拠 ID の参照先を確認します。`. Change the panel title to `Bob 出力の取り込み`; translate host messages to `Bob 出力（YAML）を貼り付けてください。`, `人による判定を開きました。`, and a Japanese status/error/warning summary.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js
git add src/webview/consistencyResultCapture*.ts test/guiFirstSurfaces.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize consistency result capture"
```

---

### Task 4: Localize consistency Human Triage

**Files:**
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyHumanTriage.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyHumanTriageHtml.ts`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageWebviewLifecycle.test.js`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageBoundaries.test.js`
- Modify: `extensions/bob-code-consistency-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve `sourceSha256`, `decisionRevision`, decision values, severity values, follow-up fields, and save conflict protection.

- [ ] **Step 1: Add RED renderer assertions**

Require screen title `指摘・確認事項の判定`, section `指摘・確認事項の判定`, Japanese decision/severity option text, and unchanged option values such as `value="needs_investigation"` and `value="critical"`.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-code-consistency-review && npm run compile && node --test test/guiFirstSurfaces.test.js test/humanTriageWebviewLifecycle.test.js test/humanTriageBoundaries.test.js`

- [ ] **Step 3: Apply exact Human Triage copy**

```text
Code Consistency Human Triage -> 指摘・確認事項の判定
Human Triage                  -> 人による判定
Finding / Question 採否判断  -> 指摘・確認事項の判定
triage を生成                 -> 判定一覧を作成
すべて保存                    -> 判定内容を保存
Result Capture へ戻る         -> Bob 出力の取り込みへ戻る
source                        -> 元データ
decision revision             -> 判定版
severity / confidence         -> 重大度 / 確信度
Bob reason                    -> Bob の判断理由
impact                        -> 影響
recommended action            -> 推奨対応
suggested owner               -> 推奨担当者
human check                   -> 人による確認ポイント
decision                      -> 判定
final severity                -> 最終重大度
owner                         -> 担当者
suggested recipient           -> 連絡先候補
human reason                  -> 判定理由
review comment                -> レビューコメント
follow-up required            -> 後続対応が必要
follow-up action              -> 後続対応
due                           -> 期限
evidence                      -> 根拠
```

Render decision, severity, confidence, and source type through Task 1 helpers. Keep the empty values `未判断` and `未設定`. Change the panel title to `指摘・確認事項の判定`, picker title to `コード整合プレレビューの判定用ワークスペースを選択`, and success text to `判定内容と生成成果物を保存しました。`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/humanTriageWebviewLifecycle.test.js test/humanTriageBoundaries.test.js test/japaneseDisplayLabels.test.js test/japaneseGuiCopy.test.js
git add src/webview/consistencyHumanTriage*.ts test/guiFirstSurfaces.test.js test/humanTriage*.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize consistency human triage"
```

---

### Task 5: Localize Traceability Prep

**Files:**
- Modify: `extensions/bob-code-consistency-review/src/webview/traceabilityPrepWebview.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/traceabilityPrepWebviewAssets.ts`
- Modify: `extensions/bob-code-consistency-review/test/traceabilityPrepWebview.test.js`
- Modify: `extensions/bob-code-consistency-review/test/traceabilityPrepWebviewAssets.test.js`
- Modify: `extensions/bob-code-consistency-review/test/traceabilityPrepConcurrency.test.js`
- Modify: `extensions/bob-code-consistency-review/test/japaneseGuiCopy.test.js`

**Interfaces:** Preserve action objects (`approveItem`, `rejectItem`, `deprecateItem`, `restoreItem`, link/decision/domain actions), save ownership in the extension host, revision checks, backup, and gate-report generation.

- [ ] **Step 1: Add RED traceability assertions**

Require `トレーサビリティ確認`, `開いた時点に戻す`, `保存`, `分類`, `項目`, `関連`, `判断`, `検証レポート`, `レビュー入力プレビュー`, and action labels `採用`, `却下`, `廃止`, `元に戻す`, `未確定として保留`. Keep assertions for `data-action`, message schemas, and absence of inline handlers.

- [ ] **Step 2: Verify RED**

Run: `cd extensions/bob-code-consistency-review && npm run compile && node --test test/traceabilityPrepWebview.test.js test/traceabilityPrepWebviewAssets.test.js test/traceabilityPrepConcurrency.test.js`

- [ ] **Step 3: Apply exact static copy**

```text
Traceability Prep          -> トレーサビリティ確認
sidecar catalog approval   -> 補助台帳の確認・承認
Rollback to Original       -> 開いた時点に戻す
Save                       -> 保存
Domains                    -> 分類
Items                      -> 項目
Links                      -> 関連
Decisions                  -> 判断
Gate Report                -> 検証レポート
Review Input Preview       -> レビュー入力プレビュー
```

- [ ] **Step 4: Localize client-rendered status and actions**

Keep action IDs unchanged and change only labels:

```text
Approve / Reject / Deprecate / Restore Original / Defer as TBD
採用 / 却下 / 廃止 / 元に戻す / 未確定として保留

status / errors / warnings / proposed items / changed rows
状態 / エラー / 警告 / 未承認項目 / 変更行

No changes to restore. -> 元に戻す変更はありません。
Saved:                 -> 保存しました:
Errors / Warnings      -> エラー / 警告
none                   -> なし
```

Translate the restore confirmation and host message `Opened catalog state restored. Save to write it to disk.` to `画面を開いた時点の内容に戻しました。ディスクへ反映するには「保存」を押してください。`.

- [ ] **Step 5: Verify and commit**

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/traceabilityPrepWebview.test.js test/traceabilityPrepWebviewAssets.test.js test/traceabilityPrepConcurrency.test.js test/japaneseGuiCopy.test.js
git add src/webview/traceabilityPrepWebview*.ts test/traceabilityPrep*.test.js test/japaneseGuiCopy.test.js
git commit -m "feat: localize traceability approval UI"
```

---

### Task 6: Finish package metadata, docs, and cross-extension verification

**Files:**
- Modify: `extensions/bob-code-consistency-review/package.json`
- Modify: `extensions/bob-code-consistency-review/README.md`
- Modify: `extensions/bob-code-consistency-review/docs/README-ja.md`
- Modify: `extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md`
- Modify: `extensions/bob-code-consistency-review/test/japaneseGuiCopy.test.js`

- [ ] **Step 1: Add package-copy assertions**

Require command category `Bob コード整合プレレビュー` and exact major titles: `整合プレレビューを開始`, `Bob 出力の取り込みを開く`, `指摘・確認事項の判定を開く`, `整合プレレビュー用ファイルを初期化`, `トレーサビリティ確認を開く`, `トレーサビリティ台帳を検証`, `Bob に渡すレビュー資料を作成`, `Bob 出力を取り込む`, `Bob 出力を検証`, `人による判定一覧を作成`.

- [ ] **Step 2: Update metadata and settings descriptions**

Keep display name `Bob コード整合プレレビュー`. Set description to `コード変更と要求・設計・テスト仕様の整合性を確認するための Bob 向けレビュー資料、トレーサビリティ、出力検証、人による判定を提供します。日本語と Shift-JIS 系テキストに対応します。`.

Replace `AI draft`, `traceability catalog`, `sidecar catalog`, `review-package`, `triage`, `bytes`, `sheet`, `data row`, and `fallback` in visible descriptions with Japanese-first explanations while preserving setting keys, defaults, and limits.

- [ ] **Step 3: Align documentation terminology**

Use exactly: `整合プレレビューを開始`, `関連資料の選択`, `確認観点`, `Bob に渡す資料`, `Bob 出力の取り込み`, `指摘・確認事項の判定`, `トレーサビリティ確認`.

- [ ] **Step 4: Run extension verification and residual scan**

```bash
cd extensions/bob-code-consistency-review
grep -RInE 'Consistency Review Wizard|Evidence Picker|Review Focus|Package Preview|Result Capture|Human Triage|Traceability Prep|Rollback to Original|>Approve<|>Reject<' src package.json README.md test || true
npm run architecture:policy
npm run source:policy
npm run dependency:policy
npm test
npm run package:policy
npm run package
```

Expected: no user-visible obsolete primary labels; every verification command exits 0.

- [ ] **Step 5: Run the three-extension regression set after all three plans are implemented**

```bash
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (cd "extensions/$extension" && npm test)
done
```

Expected: all three suites pass without command-ID, schema, or artifact changes.

- [ ] **Step 6: Commit docs and metadata**

```bash
git add extensions/bob-code-consistency-review/package.json \
  extensions/bob-code-consistency-review/README.md \
  extensions/bob-code-consistency-review/docs/README-ja.md \
  extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md \
  extensions/bob-code-consistency-review/test/japaneseGuiCopy.test.js
git commit -m "docs: align consistency GUI Japanese terminology"
```
