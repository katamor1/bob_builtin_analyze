# live-traceability-sidecar 実機テストデータ

このサンプルは、`bob-code-consistency-review` の主GUIと同梱workflowを使い、次の流れを固定データで確認するためのものです。

```text
トレーサビリティ整理
  -> review-input.yaml
  -> review-package
  -> Bob 整合プレレビュー
  -> レビュー結果取り込み
  -> 指摘確認・振り分け
```

## 目的

- `.bob-trace/traceability-catalog.json` に承認済みlinkと未承認候補を混在させる。
- `traceability-ai-draft.input.json` と `traceability-ai-draft.proposed.json` で、sidecar作成前の入力も確認する。
- `main..feature/live-traceability-sidecar` のGit差分からBob用review-packageを生成する。
- OK、NG、確認質問、RT / TSルール指摘の代表caseを含める。
- `整合プレレビュー`の同一panel内で、後段stageへ遷移できることを確認する。

## ファイル構成

| path | 用途 |
|---|---|
| `traceability-ai-draft.input.json` | `prepareAiTraceabilityDraftPrompt` 相当の実行入力。 |
| `traceability-ai-draft.proposed.json` | AIが返すproposed-only draft。workflow actionの取込fixtureとして使う。 |
| `fixtures/workspace-common/.bob-trace/traceability-catalog.json` | 人間承認後のsidecar catalog。未承認候補も1件残している。 |
| `fixtures/workspace-common/review-input.yaml` | 承認済みcatalogから生成したreview-inputの固定版。 |
| `fixtures/workspace-common/docs/` | 要求、基本設計、詳細設計、テスト仕様、台帳、レビュー指摘。 |
| `fixtures/baseline/` | `main` branch相当のコード。 |
| `fixtures/head/` | `feature/live-traceability-sidecar` branch相当のコード。 |
| `bob-output.expected.sample.yaml` | レビュー結果取り込み・検証用の代表YAML。 |
| `expected-outcomes.yaml` | 人間が実機結果を照合する期待結果。 |

## 実機sandboxで使う

repo rootで次を実行します。

```powershell
.\docs\workflows\code-consistency-review\integration\launch-bob-code-consistency-sandbox.ps1 `
  -Sample live-traceability-sidecar
```

VS Code / Bob IDEが開いたら、次を確認します。

1. Command Paletteから `Bob Code Consistency Review: 整合プレレビューを開始` を実行する。
2. 主GUIで対象workspace、Git base / head、関連文書候補を確認する。
3. `トレーサビリティ整理`stageへ進む。
4. `traceability-ai-draft.proposed.json`をworkflowのAI draft取込fixtureとして使い、proposed候補がcatalogへmergeされることを確認する。
5. proposed itemを人間が`accepted` / `rejected` / `deprecated`へ分類する。
6. gate reportを確認し、accepted itemから`review-input.yaml`を作成する。
7. review-packageを生成し、`.bob-review/review-package/bob-input.md`をBobへ渡す。
8. Bobの出力後、同じpanelの`レビュー結果取り込み`stageへ進む。
9. `bob-output.expected.sample.yaml`を貼り付け、保存とevidence検証を行う。
10. `指摘確認・振り分け`stageへ進み、人間decisionとprojectionを保存する。

内部command IDは同梱workflowと自動テストのため登録を維持しますが、通常のoperator手順ではCommand Paletteから直接呼びません。

## オフライン取込だけを確認する場合

1. `整合プレレビュー`を開く。
2. `レビュー結果取り込み`stageへ進む。
3. `bob-output.expected.sample.yaml`の内容を貼り付ける。
4. 保存後、`指摘確認・振り分け`stageへ進む。

保存前にschemaと`evidence-index.json`を検証し、不正なYAMLや未知のevidence IDを正式artifactとして保存しないことを確認します。

## traceability sidecar作成入力

`traceability-ai-draft.input.json`は、workflowがAI用promptを作るときの固定入力です。生成されたpromptは`.bob-trace/ai-traceability-draft/ai-draft-prompt.md`へ保存されます。

`traceability-ai-draft.proposed.json`は全要素が`status: proposed`で、正式ID、`from`、`to`を持ちません。AIは承認状態を確定できず、人間だけがcatalog上の状態を変更できます。

## 期待される代表結果

- `Payment_CalculateLimit`: プレミアム上限の仕様・設計・テストと整合するOK case。
- `Payment_HandleTimeout`: タイムアウト時に`ERR_OK`を返すNG case。
- `Payment_AssessFraudScore`: 不正スコアしきい値変更とテスト不足の確認質問case。
- `Payment_UpdateRealtimeCache`: RT経路に`printf`が入るRT / TSルール指摘case。

## 合格条件

- 4つの代表caseが`expected-outcomes.yaml`と一致する。
- `review-input.yaml`、review-package、Bob output、decision artifactが同じreview IDで結び付く。
- 独立したtraceability / capture / triage panelを作成せず、同じ`bobCodeConsistencyReviewWizard` panelを使う。
- Developer Tools Consoleにuncaught exception、unhandled rejection、CSP violationがない。
