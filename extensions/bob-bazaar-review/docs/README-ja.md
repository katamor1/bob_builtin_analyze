# bob-bazaar-review ドキュメント

このディレクトリには`bob-bazaar-review`の設計、運用、テスト、履歴証跡を配置する。

## 現在の公開入口

通常operatorがCommand Paletteから使用する入口は次の2件だけである。

```text
Bob Bazaar Review: レビューを開始
Bob Bazaar Review: 資料からプロジェクト規約を作成
```

`Bob Bazaar Review: レビューを開始`はview type `bobBazaarReviewGui`の主GUIを開く。主GUI内でレビュー対象、レビュー資料、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績`を同じ`review-run.json` identityで扱う。

保存、検証、record生成、summary生成などの内部Command IDはworkflow、host action、互換API用に登録を維持するが、通常operatorの入口としてCommand Paletteへ列挙しない。

## 現在の実装構成

| 領域 | 主な責務 | 主なdirectory / file |
|---|---|---|
| composition root | command、panel、provider、serviceの組立 | `src/extension.ts` |
| Bazaar主GUI | single-panel lifecycleとstage route | `src/ui/reviewGui.ts` |
| review session | review identity、stage、artifact path、resume | `src/reviewRuns/` |
| Bazaar collection | revision / rangeの収集、packet表示・保存、Bob context連携 | `src/bazaar/bazaarReviewCommands.ts` |
| result validation | active editorのreview-result JSON検証とMarkdown summary表示 | `src/projectRules/reviewResultValidationCommand.ts` |
| result / decision UI | レビュー結果取り込み、指摘確認・振り分け | `src/projectRules/`, `src/ui/` |
| レビュー実績 | record、triage、metrics、campaign summary | `src/records/*` |
| 規約作成 | source抽出、proposal、decision、safe apply | `src/ruleAuthoring/`, `src/ui/` |
| workflow連携 | soft dependencyの解決、provider inputとworkflow stateの変換 | `src/workflow/workflowRegisterBridge.ts`、`src/workflow/` |
| workspace | `.bob`初期化、template refresh、root解決 | `src/workspace/` |
| MCP | read tools、write opt-in、allowed roots | `src/mcp/` |

`IBM.bob-code`と`local.workflow-register`はsoft dependencyである。未導入でもlocal UIとserviceを利用できる。

## 正本成果物

```text
.bob/review/results/<reviewId>.json
.bob/review/results/<reviewId>.md
.bob/review/results/<review_id>.artifact-metadata.json

.bob-review-records/
  campaigns/<campaignId>/
    records/<reviewId>/
      review-run.json
      record.yaml
      triage.yaml
      metrics.json
      review-packet.md
    summary.json
    summary.md
```

`review-run.json`は主GUIのstageとresume identityを保持する。review-result、decision、record、metrics本体の正本を置き換えない。

result sidecarの`producer_version`は固定値ではなく、extension package versionを正本として記録する。

## MCP安全境界

- `BOB_BAZAAR_ALLOWED_ROOTS`はMCP toolが受け付けるcwdをreal pathで限定し、未設定時は既定拒否する。
- `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`は副作用を持つwrite toolを明示的に有効化するが、cwd検証を迂回しない。
- `BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD=1`はallowed roots未設定時の拒否を解除する明示的な手動検証用例外であり、通常運用では使用しない。

## 設計書

- `basic-design-ja.md`  
  公開入口、single-panel UI、review session、Bazaar安全実行、workflow provider、template refresh、MCP、安全境界を定義する。

- `detailed-design-ja.md`  
  lifecycle、stage model、message boundary、`review-run.json`、result / decision / metrics、規約作成transaction、provider retry、MCP、test gateを定義する。

- `workflow-action-contracts-ja.md`  
  `workflow-register`へ公開するreview provider IDの互換性境界を定義する。

## テスト仕様書

- `unit-test-spec-ja.md`  
  public command inventory、主GUI lifecycle、review session、Bazaar subprocess、result、decision、record、provider、template refresh、MCPの単体contractを定義する。

  record coreのcampaign初期化、record / triage保存、summary生成、path containmentは`test/reviewRecordsCore.test.js`へ対応付ける。

- `real-machine-test-spec-ja.md`  
  Ubuntu / Windows、VS Code、IBM Bob、Bazaar CLI、主GUI、MCP、multi-root、200% zoom、High Contrast、keyboard、Consoleを含む実機gateを定義する。

## 履歴文書

次は過去のIteration設計・統合証跡であり、現在のoperator routeではない。旧画面名や旧Command IDがある文書は冒頭の`Replaced:` / `Superseded:`通知に従う。

- `review-run-v3-iteration1-ja.md`
- `review-run-v3-iteration2-ja.md`
- `review-run-v3-iteration3-dashboard-ja.md`
- `review-run-v3-acceptance-ja.md`
- `review-run-v3-integration-result-ja.md`

## 運用メモ

- `review-run-id-allocation-ja.md`  
  campaign内のcollision-safe review ID予約を定義する。

- `review-run-command-boundary-ja.md`  
  workspace、review ID、resume、stage transitionのhost-side再検証を定義する。

- `project-rule-authoring.md`  
  source selection、AI consent、proposal decision、diff preview、backup、transaction recoveryを定義する。

## 関連文書

- `../README.md`
- `../../../docs/workflows/code-consistency-review/README.md`
- `../../../docs/workflow-action-contracts-ja.md`
- `../../../docs/ops/bob-workflow-security-privacy-ja.md`
