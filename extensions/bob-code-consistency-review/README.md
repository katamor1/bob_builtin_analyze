# Bob Code Consistency Review（コード整合プレレビュー）

`bob-code-consistency-review` は、コード変更と要求書・基本設計書・詳細設計書・テスト仕様書の整合性を、正式レビュー前に IBM Bob / VS Code で確認するための拡張機能です。

差分、文書抜粋、コード解析結果、対応候補、根拠 ID を決定論的な `review-package` にまとめ、Bob にはその範囲だけを渡します。Bob の出力は候補であり、採用・棄却・追加調査・質問への振り分けは人間が行います。

## 公開入口

Command Paletteに常時表示する入口は次の1件だけです。

| 表示名 | Command ID | 開く画面 |
| --- | --- | --- |
| `Bob Code Consistency Review: 整合プレレビューを開始` | `bobCodeConsistency.openReviewWizard` | view type `bobCodeConsistencyReviewWizard`、title `整合プレレビュー` |

`整合プレレビュー` は1つのpanel内で次のstageを扱います。

1. workspace初期化と入力確認
2. 文書・変更箇所・根拠の選択
3. `トレーサビリティ整理`
4. 前処理とreview-package preview
5. `レビュー結果取り込み`
6. `指摘確認・振り分け`

後段stage用の独立した公開panelはありません。workflowから使うcommandは登録・activationを維持しますが、`menus.commandPalette`では`when: "false"`です。

## soft dependency

`package.json`の`main`は`./out/extension.js`です。必須の`extensionDependencies`は持ちません。

- `IBM.bob-code` はBobへの投入・Bob UI連携が必要な場合だけ使うsoft dependencyです。
- `local.workflow-register` は同梱workflowとaction provider連携が必要な場合だけ使うsoft dependencyです。
- optional extensionがない場合も本拡張のactivationを失敗させません。利用できない統合操作は、主GUIで理由を表示して無効化します。

## 主な機能

- Git / Bazaarの変更範囲を収集する。
- Markdown、Word `.docx`、Excel `.xlsx` から要求・設計・テスト根拠を抽出する。
- `REQ-*`、`BD-*`、`DD-*`、`TC-*`、`TICKET-*` などのID候補を検出する。
- 元文書を変更せず、`.bob-trace/traceability-catalog.json`へ候補・関連・承認状態を保存する。
- 人間が`proposed`候補を`accepted` / `rejected` / `deprecated`へ分類する。
- accepted itemから`review-input.yaml`を生成する。
- C / C++の変更関数候補に加え、TypeScript、Python、Javaなどの汎用コード根拠を作る。
- Bob投入用`bob-input.md`とprompt一式を生成する。
- Bob出力YAMLをclipboard、selection、workflow handoff、手動貼付けから取り込む。
- Bob出力をschemaと`evidence-index.json`に照らして検証する。
- 人間decisionと互換projectionを`.bob-review/human-triage`へ保存する。

## 標準フロー

1. `Bob Code Consistency Review: 整合プレレビューを開始`を実行する。
2. workflowが未配置なら、主GUIの初期化操作を実行する。
3. review対象、VCS、base / head、変更種別、文書候補、review focusを確認する。
4. 必要に応じて`トレーサビリティ整理`で候補を承認する。
5. `review-input.yaml`を作成または選択する。
6. 前処理を実行し、`review-package`と`bob-input.md`を確認する。
7. Bobで整合プレレビューを実行する。
8. 同じpanelの`レビュー結果取り込み`で出力を保存・検証する。
9. `指摘確認・振り分け`で人間decisionを保存し、正式レビューや修正作業へ引き継ぐ。

## workspace初期化契約

主GUIの初期化操作と内部command `bobCodeConsistency.initializeWorkspace`は同じserviceを使います。

作成・更新対象:

```text
.bob/
  workflows/
    code-consistency-review/
      WORKFLOW.md
review-input.yaml
docs/
  review-input-placeholder.md
.gitignore
```

安全契約:

- 同梱workflowと既存`WORKFLOW.md`が異なる場合、既存bytesをバックアップしてから同梱workflowへ更新します。
- 既存`review-input.yaml`は上書きしません。内容を変更しないまま、byte-exactなバックアップだけを作成します。
- workflow結果とreview-input結果は、`created` / `updated` / `unchanged`、path、optional backup pathを別々に返します。
- `.bob-review/`、`.bob-trace/ai-traceability-draft/`、`.bob/workflows/runs/`のignore設定はworkspace境界内だけで更新します。

## トレーサビリティ整理

元文書は書き換えず、sidecarを正本にします。

```text
.bob-trace/
  traceability-catalog.json
  gate-report.md
  ai-traceability-draft/
    ai-draft-prompt.md
    ai-draft.json
```

AIは`status: proposed`の候補だけを作れます。人間だけが承認状態を変更できます。内部command `bobCodeConsistency.openTraceabilityPrep`は独立Webviewを開かず、既存の`整合プレレビュー`panelを`トレーサビリティ整理`stageへ移動します。

## `review-input.yaml`

`review-input.yaml`はレビュー対象、比較範囲、文書、review focus、解析上限を定義します。保存前にschemaとworkspace内pathを検証します。

```yaml
schema_version: 1
review:
  id: timeout-bugfix-r1
  title: タイムアウト処理修正の整合プレレビュー
  change_type: bugfix
  purpose: タイムアウト時の戻り値を要求仕様どおりに修正する
  base: HEAD~1
  head: HEAD
  vcs: git
artifacts:
  requirements:
    - path: docs/requirements-timeout.md
      sections: [REQ-TIMEOUT-001]
  basic_design:
    - path: docs/basic-design-timeout.md
      sections: [BD-TIMEOUT-001]
  detailed_design:
    - path: docs/detailed-design-timeout.md
      sections: [DD-TIMEOUT-001]
  test_spec:
    - path: docs/test-spec-timeout.md
      cases: [TC-TIMEOUT-001]
review_focus:
  - requirement-code-consistency
  - design-code-consistency
  - test-gap
```

AI支援は最終YAMLの直接生成ではなく、短い`ReviewInputDraft` JSONの候補作成に限定します。候補path、enum、文書実在性はhost側builder / validatorで再検証します。

## `review-package`

既定の出力先は`.bob-review/review-package`です。

```text
manifest.yaml
input-normalized.json
changed-files.json
changed-symbols.json
document-index.json
evidence-index.json
traceability-map.json
change-summary.md
diff-context.md
document-excerpts.md
deterministic-checks.md
bob-input.md
prompts/
code-slices/
tables/
```

`manifest.yaml`、`evidence-index.json`、生成pathを正本として扱います。Bob出力が参照するevidence IDは保存前に検証します。

## レビュー結果取り込みと指摘確認・振り分け

Bob出力は既定で次へ保存します。

```text
.bob-review/bob-output/bob-output.yaml
```

人間decisionとprojectionは次へ保存します。

```text
.bob-review/human-triage/
  triage-source.yaml
  triage-decisions.yaml
  triage-result.yaml
  accepted-findings.md
  rejected-findings.md
  investigation-items.md
  questions-to-author.md
  follow-up-actions.md
  migration-report.md
```

`triage-source.yaml`はBob output由来のimmutable snapshot、`triage-decisions.yaml`は人間decisionの正本です。保存時はsource hashとdecision revisionを照合し、stale writerによる上書きを拒否します。

## workflow連携用command

次のcommandは同梱workflow、Operation Hub、テスト、API連携向けに登録されています。通常のoperatorは主GUIから操作します。

```text
bobCodeConsistency.initializeWorkspace
bobCodeConsistency.createReviewInput
bobCodeConsistency.prepareAiReviewInputDraft
bobCodeConsistency.applyAiReviewInputDraft
bobCodeConsistency.prepareAiTraceabilityDraft
bobCodeConsistency.captureAiTraceabilityDraft
bobCodeConsistency.applyAiTraceabilityDraft
bobCodeConsistency.openTraceabilityPrep
bobCodeConsistency.validateTraceabilityCatalog
bobCodeConsistency.createReviewInputFromTraceability
bobCodeConsistency.repairReviewInput
bobCodeConsistency.explainReviewInputDiagnostics
bobCodeConsistency.preprocess
bobCodeConsistency.captureBobOutput
bobCodeConsistency.validateOutput
bobCodeConsistency.triage
```

Command ID、workflow action ID、artifact path、schema fieldは技術的な互換契約として維持します。

## 設定

| 設定 | 既定値 | 用途 |
| --- | ---: | --- |
| `bobCodeConsistency.reviewInputPath` | `review-input.yaml` | 入力YAMLのworkspace相対path |
| `bobCodeConsistency.reviewPackagePath` | `.bob-review/review-package` | review-package出力先 |
| `bobCodeConsistency.traceabilityCatalogPath` | `.bob-trace/traceability-catalog.json` | sidecar catalog |
| `bobCodeConsistency.traceabilityGateReportPath` | `.bob-trace/gate-report.md` | gate report |
| `bobCodeConsistency.bobOutputPath` | `.bob-review/bob-output/bob-output.yaml` | Bob出力保存先 |
| `bobCodeConsistency.triagePath` | `.bob-review/human-triage` | decision / projection保存先 |
| `bobCodeConsistency.bzrPath` | `bzr` | Bazaar executable |
| `bobCodeConsistency.vcsCommandTimeoutMs` | `120000` | Git / Bazaar command timeout |
| `bobCodeConsistency.textEncoding` | `auto` | UTF-8 / Shift-JIS系decode |
| `bobCodeConsistency.maxDocumentBytes` | `5242880` | 文書1件の読込上限 |
| `bobCodeConsistency.maxWorkbookSheets` | `20` | XLSX sheet上限 |
| `bobCodeConsistency.maxRowsPerSheet` | `500` | sheetごとの行上限 |
| `bobCodeConsistency.maxExcerptBytesPerDocument` | `65536` | 文書抜粋上限 |
| `bobCodeConsistency.maxRawDiffBytes` | `1048576` | raw diff上限 |
| `bobCodeConsistency.maxBobInputBytes` | `2097152` | `bob-input.md`上限 |

すべての出力pathはworkspace境界、symlink / junction、相対path規則をhost側で再検証します。Bazaar実行には必ず`--no-aliases`を付けます。

## ビルドと検証

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm test
npm run package
npm run package:policy
```

追加のunused report:

```bash
npm run unused:report
```

開発文書はVSIXへ含めません。package policyはVSIXのsize、entry、禁止pathを検査します。

## 関連文書

- `docs/basic-design-ja.md`
- `docs/detailed-design-ja.md`
- `docs/unit-test-spec-ja.md`
- `docs/real-machine-test-spec-ja.md`
- `docs/triage-integrity-ibm-bob-uat-runbook-ja.md`
- `../../docs/workflows/code-consistency-review/README.md`
