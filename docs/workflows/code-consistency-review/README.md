# コード変更と要求・設計整合プレレビュー 詳細仕様

このディレクトリは、コード変更と要求書・設計書・テスト仕様書の整合プレレビューを実装・運用するための詳細仕様、schema、prompt、fixtureをまとめる。

現行runtimeの正本は`extensions/bob-code-consistency-review/`である。このディレクトリ直下のschema / prompt / package仕様はruntimeと同期する公開仕様として扱う。`mvp-*`と`scaffold/`は初期設計・fixture・検討経緯の参照用であり、現行operator導線ではない。

## 現行operator導線

常時表示するCommand Palette入口は次の1件だけである。

```text
Bob Code Consistency Review: 整合プレレビューを開始
bobCodeConsistency.openReviewWizard
```

`整合プレレビュー`主GUIは、同じ`bobCodeConsistencyReviewWizard` panel内で次を扱う。

1. workspace初期化
2. review対象・文書・変更箇所の選択
3. `トレーサビリティ整理`
4. review-input / review-package preview
5. `レビュー結果取り込み`
6. `指摘確認・振り分け`

workflow用commandは登録を維持するが、Command Paletteでは非表示である。`bobCodeConsistency.openTraceabilityPrep`も独立Webviewを作らず、既存panelを`トレーサビリティ整理`stageへ移動する。

## soft dependency

runtime拡張の`main`は`./out/extension.js`であり、必須`extensionDependencies`を持たない。

- `IBM.bob-code`はBob実行時だけ使うsoft dependencyである。
- `local.workflow-register`はworkflow / provider連携時だけ使うsoft dependencyである。
- optional extensionがない場合もactivationを継続し、主GUIで利用不可理由を示す。

## 文書一覧

| 文書 | 内容 |
|---|---|
| `../code-requirement-design-consistency-review.md` | 全体の詳細フロー |
| `../code-requirement-design-consistency-review-plan-skeleton.md` | 計画の骨格 |
| `review-input-schema.md` | 人間またはbuilderが生成する入力YAMLの仕様 |
| `review-package-spec.md` | Bob投入前に作る根拠package仕様 |
| `bob-prompt-template.md` | Bobへ渡すprompt template |
| `bob-output-schema.md` | Bobの構造化出力YAML仕様 |
| `human-triage-spec.md` | 人間decisionとprojectionのdomain仕様 |
| `c-cpp-analysis-scope.md` | C / C++コード解析対象 |
| `document-extraction-spec.md` | Word / Excel / Markdown文書抽出仕様 |
| `traceability-sidecar-catalog.md` | 元文書非改変のsidecar catalog、ID、工程間link、gate、review-input統合 |
| `implementation-assets.md` | 実装コードから参照するschema / template一覧 |
| `schemas/review-input.schema.json` | `review-input.yaml`検証用JSON Schema |
| `schemas/bob-output.schema.json` | `bob-output.yaml`検証用JSON Schema |
| `templates/prompts/consistency-review-v1/` | Bob投入用prompt template |
| `templates/triage/triage-result.template.yaml` | decision projectionの互換template |
| `examples/` | E2E / multi-language / traceability fixture |
| `mvp-*` | 初期MVP設計の履歴参照 |
| `scaffold/` | 初期CLI / validator / CI検討の履歴参照 |
| `../../../extensions/bob-code-consistency-review/` | 実行可能なVS Code拡張実装 |

## 現行runtimeのゴール

1件のコード変更に対して次を実現する。

- 関連文書候補を収集し、AI draft用promptにまとめる。
- 元文書を変更せず、`.bob-trace/traceability-catalog.json`に仕様単位、ID候補、工程間link、人間の承認状態を保持する。
- gateで未承認、欠落、stale、未対応レビュー指摘を検出する。
- accepted catalog itemから`review-input.yaml`を生成する。
- Git / Bazaar差分、rename、空白入りpath、binary numstatを抽出する。
- C / C++は変更関数や周辺候補を抽出し、その他の主要言語はdiff hunk単位の汎用コード根拠を生成する。
- Word / Excel / Markdownから関連文書の抜粋を作る。
- 要求・設計・コード・テストの対応候補を作る。
- Bob投入用`review-package`と`bob-input.md`を生成する。
- Bob出力をYAMLとして保存・検証する。
- 人間decisionをsource snapshotと分離して保存する。

## workflowの開始地点

現行`.bob/workflows/code-consistency-review/WORKFLOW.md`は、`review-input.yaml`完成済みだけを入口にしない。

```text
文書候補収集
  -> traceability AI draft prompt生成
  -> AIがproposed-only catalog JSONを作成
  -> AI draft JSONをsidecar catalogへmerge
  -> 整合プレレビュー主GUIのトレーサビリティ整理stageで人間が承認 / 棄却 / 廃止
  -> traceability gate検証
  -> accepted itemからreview-input.yaml生成
  -> review-package / bob-input.md生成
  -> Bob整合プレレビュー
  -> レビュー結果取り込み
  -> Bob出力検証
  -> 指摘確認・振り分け
  -> 正式レビュー引き継ぎ
```

AIが作成できるのは`status: proposed`の候補だけである。`accepted`、`rejected`、`deprecated`への遷移は人間だけが行う。

## 実行可能な拡張実装

runtime実装は`extensions/bob-code-consistency-review/`に配置する。

- VS Code拡張ID: `local.bob-code-consistency-review`
- composition root: `src/extension.ts`
- `workflow-register` provider登録: `src/workflowProviderRegistration.ts`
- review-input command群: `src/commands/reviewInputCommands.ts`
- traceability command群: `src/traceabilityCommands.ts`
- review実行command群: `src/reviewExecutionCommands.ts`
- workspace初期化: `src/workspaceInitializer.ts`
- primary panel controller: `src/webview/consistencyReviewWizard.ts`
- embedded stage services:
  - `src/webview/traceabilityPrepWebview.ts`
  - `src/webview/consistencyResultCapture.ts`
  - `src/webview/consistencyHumanTriage.ts`
- domain / pipeline: `src/core/`, `src/analyzers/`, `src/triage/`

`src/extension.ts`はcommand登録とcompositionに集中し、各domain処理を重複実装しない。内部module名、artifact path、schema fieldは互換性のため技術名称を維持する。

## workspace初期化

主GUIの初期化操作と`bobCodeConsistency.initializeWorkspace`は同じserviceを使う。

- 同梱workflowと既存fileが異なる場合、既存bytesをバックアップしてから更新する。
- 既存`review-input.yaml`は上書きせず、内容を変更しないままバックアップだけ作成する。
- workflowとreview-inputの結果を別々のtyped outcomeとして返す。
- `.gitignore`更新はworkspace境界内で行う。

## artifactの正本

```text
review-input.yaml
.bob-trace/traceability-catalog.json
.bob-trace/gate-report.md
.bob-review/review-package/manifest.yaml
.bob-review/review-package/evidence-index.json
.bob-review/bob-output/bob-output.yaml
.bob-review/human-triage/triage-source.yaml
.bob-review/human-triage/triage-decisions.yaml
```

- `review-input.yaml`は対象・比較範囲・文書・review focusの正本である。
- `manifest.yaml`と`evidence-index.json`はBobへ渡した範囲の正本である。
- `triage-source.yaml`はBob出力由来のimmutable snapshotである。
- `triage-decisions.yaml`は人間decisionの正本である。
- Markdownと`triage-result.yaml`は再生成可能なprojectionである。

## CLI / scaffold

次のCLI例はscaffoldと自動化検討用のlegacy/referenceである。現行Bob workflowはruntime拡張のproviderを呼ぶ。

```bash
bob-review preprocess --input review-input.yaml --out .bob-review/review-package
bob-review validate-output --package .bob-review/review-package --bob-output .bob-review/bob-output/bob-output.yaml
bob-review triage --package .bob-review/review-package --bob-output .bob-review/bob-output/bob-output.yaml --out .bob-review/human-triage
```

## Bob結合確認sandbox

`integration/launch-bob-code-consistency-sandbox.ps1`は、repo rootを汚さず一時workspaceを作る。

- 3拡張のVSIXをisolated `--extensions-dir`へinstallする。
- `bob2/bob-code`は`--extensionDevelopmentPath`で読み込む。
- sample `review-input.yaml`とworkflowをsandboxへコピーする。
- multi-language fixtureから実Git repositoryを構築できる。
- `-NoLaunch`で構築と起動command表示だけを行える。

## 検証

repository contract:

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/extension-host-smoke-contract.test.js
```

extension gate:

```bash
cd extensions/bob-code-consistency-review
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm test
npm run package
npm run package:policy
```

Ubuntu / WindowsのExtension Host gateは、activation、公開command、代表hidden command、`整合プレレビュー`panel、stage route、unhandled rejection不在を同一SHAで確認する。
