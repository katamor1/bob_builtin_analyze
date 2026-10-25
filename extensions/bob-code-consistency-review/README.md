# Bob Code Consistency Review（コード整合プレレビュー）

`bob-code-consistency-review`は、コード変更と要求、基本設計、詳細設計、テスト仕様の整合性を、正式レビュー前にIBM Bob / VS Codeで確認するための拡張機能です。

差分、文書抜粋、コード根拠、対応候補を決定論的な`review-package`へまとめ、Bobにはその範囲だけを渡します。Bobの出力は候補であり、採用、棄却、追加調査、確認依頼への振り分けは人間が行います。

## 公開入口

Command Paletteに常時表示する入口は次の1件だけです。

| 完成表示名 | Command ID | panel |
|---|---|---|
| `Bob Code Consistency Review: 整合プレレビューを開始` | `bobCodeConsistency.openReviewWizard` | view type `bobCodeConsistencyReviewWizard`、title `整合プレレビュー` |

主GUIは1つのpanel内で次のstageを扱います。

1. workspace初期化とレビュー入力
2. 文書、変更箇所、根拠の選択
3. `トレーサビリティ整理`
4. 前処理とreview-package preview
5. `レビュー結果取り込み`
6. `指摘確認・振り分け`

後段stage用の独立公開panelはありません。workflow用の内部Command IDは登録・activationを維持しますが、通常のCommand Paletteでは`when: "false"`です。

## soft dependency

`package.json`の`main`は`./out/extension.js`です。必須`extensionDependencies`はありません。

- `IBM.bob-code`はBob投入とBob UI連携が必要な場合だけ使用します。
- `local.workflow-register`は同梱workflowとaction provider連携が必要な場合だけ使用します。
- optional extensionがなくてもactivationを失敗させません。
- 利用できない統合操作は、主GUIまたは`Bob 操作ハブ`で理由を表示して無効化します。

## 標準フロー

1. `Bob Code Consistency Review: 整合プレレビューを開始`を実行する。
2. workflowが未配置なら主GUIの初期化操作を実行する。
3. review ID、VCS、base / head、変更種別、文書候補、review focusを確認する。
4. 必要に応じて`トレーサビリティ整理`でproposed itemを承認・棄却・廃止する。
5. `review-input.yaml`を作成または選択する。
6. 前処理を実行し、`review-package`と`bob-input.md`を確認する。
7. Bobで整合プレレビューを実行する。
8. 同じpanelの`レビュー結果取り込み`で出力を保存・検証する。
9. `指摘確認・振り分け`で人間decisionを保存する。
10. 正式レビュー、修正作業、文書更新へ引き継ぐ。

## workspace初期化

主GUIの初期化操作と内部Command ID `bobCodeConsistency.initializeWorkspace`は同じserviceを使います。

作成・更新対象:

```text
.bob/workflows/code-consistency-review/WORKFLOW.md
review-input.yaml
docs/review-input-placeholder.md
.gitignore
```

安全契約:

- 同梱workflowと既存`WORKFLOW.md`が異なる場合、既存bytesをbackupしてから更新します。
- 既存`review-input.yaml`を上書きせずbackupだけ作成します。内容は変更しません。
- workflow結果とreview-input結果は`created` / `updated` / `unchanged`、path、optional backup pathを別々に返します。
- `.bob-review/`、`.bob-trace/ai-traceability-draft/`、`.bob/workflows/runs/`のignore設定はworkspace境界内だけで更新します。
- stale file expectation、workspace escape、symlink / junctionを拒否します。

## `review-input.yaml`

`review-input.yaml`はreview identity、比較範囲、文書、focus、解析上限を定義します。

```yaml
schema_version: 1
review:
  id: timeout-bugfix-r1
  title: タイムアウト処理修正の整合プレレビュー
  change_type: bugfix
  base: HEAD~1
  head: HEAD
  vcs: git
artifacts:
  requirements:
    - path: docs/requirements-timeout.md
      sections: [REQ-TIMEOUT-001]
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
analysis_options:
  max_call_depth: 1
```

AI支援は短い`ReviewInputDraft` JSONの候補作成に限定します。候補path、enum、文書実在性はhost側builder / validatorで再検証します。

`review-input.yaml`の対話生成とAI draft適用のcommand処理は`src/commands/reviewInputCommands.ts`に分離されています。

## トレーサビリティ整理

元文書は変更せず、sidecarを正本にします。

```text
.bob-trace/
  traceability-catalog.json
  gate-report.md
  ai-traceability-draft/
    ai-draft-prompt.md
    ai-draft.json
```

AIは`status: proposed`の候補だけを作れます。人間だけがaccepted / rejected / deprecatedを確定できます。

`トレーサビリティ整理画面`は独立Webviewではありません。内部Command ID `bobCodeConsistency.openTraceabilityPrep`は、既存の`整合プレレビュー`panelを`トレーサビリティ整理`stageへ移動します。

## VCSと文書

- Gitはargument array、timeout、output上限を使います。
- Bazaarは必ず`bzr --no-aliases`を使います。
- shell文字列連結を行いません。
- Markdown、`.docx`、`.xlsx`からbounded excerptを生成します。
- UTF-8を優先し、設定済みfallbackでShift-JIS / CP932系をdecodeします。
- absolute local path、未選択文書、secretをBob inputへ含めません。

## review-package

既定の出力先は`.bob-review/review-package`です。

```text
manifest.yaml
review-input.normalized.yaml
changed-files.json
changed-symbols.json
document-index.json
evidence-index.json
traceability-map.yaml
change-summary.md
diff-context.md
document-excerpts.md
deterministic-checks.md
bob-input.md
prompts/
code-slices/
tables/
```

`manifest.yaml`の`artifact_metadata`と`evidence-index.json`をpackage identityの正本として扱います。Bob outputが参照するevidence IDは保存前に検証します。

## レビュー結果取り込み

Bob output YAMLはresult handoff、clipboard、selection、editor、手動貼付けから候補を抽出します。

保存前に次を検証します。

- schema version
- review ID / package ID
- finding / question shape
- severity / confidence enum
- evidence ID membership
- duplicate ID
- output bytes

検証済みoutputだけを次へ保存します。

```text
.bob-review/bob-output/bob-output.yaml
```

## 指摘確認・振り分け

sourceと人間decisionを分離します。

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

- `triage-source.yaml`はBob output由来のimmutable snapshotです。
- `triage-decisions.yaml`は`source_id` keyed human decisionの正本です。
- `triage-result.yaml`とMarkdownはgenerated projectionです。
- source hash mismatchは`TRIAGE_SOURCE_CHANGED`です。
- stale decision revisionは`TRIAGE_REVISION_CONFLICT`です。
- successful saveごとにrevisionを1増やします。
- staged multi-file replacementとrollbackを行います。
- legacy resultはmatching IDだけ一度移行します。

Bobはdecisionを自動確定しません。

内部Command ID `bobCodeConsistency.triage`（表示名`指摘確認・振り分け一覧を作成`）は、主GUIの`指摘確認・振り分け`stageから呼び出され、独立panelを開かず一覧成果物を生成・更新します。

## workflow連携

同梱workflowと`workflow-register` action providerは、初期化、review-input、traceability、preprocess、Bob output、decision serviceを呼び出します。

provider / Command IDは技術的な互換契約として維持します。通常operatorは主GUIまたは`Bob 操作ハブ`から操作し、内部IDをCommand Paletteの入口として使いません。

## 設定

| 設定 | 既定値 | 用途 |
|---|---:|---|
| `bobCodeConsistency.reviewInputPath` | `review-input.yaml` | 入力YAML |
| `bobCodeConsistency.reviewPackagePath` | `.bob-review/review-package` | package出力先 |
| `bobCodeConsistency.traceabilityCatalogPath` | `.bob-trace/traceability-catalog.json` | sidecar catalog |
| `bobCodeConsistency.traceabilityGateReportPath` | `.bob-trace/gate-report.md` | gate report |
| `bobCodeConsistency.bobOutputPath` | `.bob-review/bob-output/bob-output.yaml` | Bob output |
| `bobCodeConsistency.triagePath` | `.bob-review/human-triage` | decision / projection |
| `bobCodeConsistency.bzrPath` | `bzr` | Bazaar executable |
| `bobCodeConsistency.vcsCommandTimeoutMs` | `120000` | VCS timeout |
| `bobCodeConsistency.textEncoding` | `auto` | text decode |
| `bobCodeConsistency.maxDocumentBytes` | `5242880` | 文書1件の上限 |
| `bobCodeConsistency.maxRawDiffBytes` | `1048576` | diff上限 |
| `bobCodeConsistency.maxBobInputBytes` | `2097152` | Bob input上限 |

すべての出力pathはworkspace containment、symlink / junction、相対path規則をhost側で再検証します。

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

Ubuntu / Windowsの同一source headでExtension Host smokeまで実行します。実IBM Bob UATではkeyboard-only、200% zoom、High Contrast、Developer Tools Console、result handoffを確認します。

## 保守・配布ポリシー

### 生成物

主な生成物は`.bob-review/review-package`、`.bob-review/bob-output/`、`.bob-review/human-triage/`、`.bob-trace/traceability-catalog.json`、`.bob-trace/gate-report.md`です。review-packageにはmanifest、document excerpts、diff context、evidence index、Bob投入用`bob-input.md`が含まれます。コード、文書抜粋、Bob出力、triage判断を含むため、共有前に内容を確認してください。

### VSIX サイズ

`npm run package:policy`はVSIX サイズの上限を`11000000` bytesとして確認します。配布前は`npm run package`と`npm run package:policy`を続けて実行してください。`out/**/*.map`と開発用の`docs/**`はVSIXに同梱しません。

### 暗黙依存

`IBM.bob-code`と`workflow-register`はoptional integrationです。Bob投入、workflow action provider、Bob output captureを使う場合だけ、必要な連携先が導入済みであることを確認してください。Excel読み取りはproduction dependencyの`read-excel-file`を使い、既知脆弱性のある`xlsx`には依存しません。

### 必要 CLI

差分取得には`git`またはBazaar CLIが必要です。Bazaarを使う場合はaliasの影響を避けるため`bzr --no-aliases`を前提にします。開発と検証にはNode.jsとnpmが必要です。

```powershell
npm ci
npm run dependency:policy
npm run architecture:policy
npm run unused:report
npm run audit:prod
npm test
npm run package
npm run package:policy
```

### Trusted Workspace

`review-input.yaml`、文書path、review-package path、Bob output path、triage path、traceability catalog pathはworkspace内を基準に検証します。Trusted Workspaceでない環境では、外部path opt-inやVCS command実行の設定を確認してから前処理を実行してください。

## 関連文書

- `docs/basic-design-ja.md`
- `docs/detailed-design-ja.md`
- `docs/unit-test-spec-ja.md`
- `docs/real-machine-test-spec-ja.md`
- `docs/triage-integrity-ibm-bob-uat-runbook-ja.md`
- `../../docs/workflows/code-consistency-review/README.md`

開発時はリポジトリの `packages/processing-budget-runtime` と本拡張で先に `npm ci` を実行してください。`npm run compile` はローカルの `scripts/build-shared-runtime.js` から共有packageの固定compilerによるbuild、本拡張のcompile、検証済みruntimeのコピーを順に実行します。実行時は本拡張の `out/shared-processing-budget-runtime` のみを読み込み、開発用sourceへのfallbackや暗黙installは行いません。VSIXには12個のruntime JSとmanifestが含まれます。

`fflate` 0.8.3 はXLSXのstyles/sharedStringsが両方欠ける場合だけ本拡張が遅延ロードする互換処理用の直接依存です。
