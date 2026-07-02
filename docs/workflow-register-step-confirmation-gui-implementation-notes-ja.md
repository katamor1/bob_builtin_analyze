# workflow-register Step 確定前確認 GUI 実装メモ

## 実装範囲

`docs/workflow-register-step-confirmation-gui-plan-ja.md` の Phase 1〜3 を中心に、Step detail の仮編集と確定前チェックを追加した。

## 追加した主な機能

- Step detail の入力を `draftStep` として保持し、main `WorkflowAuthoringModel` へ即時反映しない。
- `Apply changes` / `Discard` / `Validate step` を Step detail の先頭に表示する。
- 未確定変更がある場合、step カードに `未確定` バッジを表示する。
- error が残っている draft は `Apply changes` を disabled にする。
- warning だけの場合は確認後に Apply できる。
- 未確定のまま別 step / 別 tab / template 反映 / step 操作へ移動しようとした場合、破棄確認を出す。
- command / result / agent / manual の type 別チェックを Webview 内で即時表示する。
- `id` / `resultKey` 変更が `artifacts.producedBy` や後続 `includeState` に与える影響を Apply 前に表示する。

## 追加ファイル

```text
extensions/workflow-register/src/core/workflowAuthoringStepDraftValidation.ts
extensions/workflow-register/src/webview/workflowBuilderStepDraftScript.ts
extensions/workflow-register/test/workflowAuthoringStepDraftValidation.test.js
extensions/workflow-register/test/workflowBuilderStepDraftScript.test.js
```

## 変更ファイル

```text
extensions/workflow-register/src/webview/workflowBuilderHtml.ts
extensions/workflow-register/src/webview/workflowBuilderStyles.ts
extensions/workflow-register/src/webview/README.md
```

## Core validation

`workflowAuthoringStepDraftValidation.ts` は、Webview から独立してテスト可能な step draft 検証ロジックである。

主な検出対象:

- step id / title / type / maxResultBytes の基本チェック。
- `stateRequired: true` なのに `includeState` が空。
- command step の `action.provider` 欠落。
- `provider: vscode.executeCommand` なのに `args[0]` が空。
- `sendResult: true` なのに `resultKey` が空、または `maxResultBytes` が未設定。
- result step の `source: state` で `stateKey` が空。
- result step の file sink path 欠落。
- `resultKey` 変更で後続 `includeState` / `result.stateKey` が孤立する。
- `id` 変更で `artifacts.producedBy` が孤立する。

## Webview integration

`workflowBuilderStepDraftScript.ts` は、既存 `workflowBuilderClientScript.ts` を全面改修せず、後段の script fragment として合成する。

`workflowBuilderHtml.ts` の合成順序は次のとおり。

```text
renderWorkflowBuilderClientScript()
renderWorkflowBuilderStepDraftScript()
renderWorkflowBuilderGuidedHelpScript()
renderWorkflowBuilderBodyScript()
renderWorkflowBuilderHelpScript()
```

Step draft script は、既存の `handleFieldEvent` を一度 remove し、Step detail に関係する field だけ draftStep へ反映する wrapper を再登録する。Step 以外の inputs / requires / preflight / artifacts / guardrails / completion は既存 handler へ委譲する。

## 今後の残件

- host 側で `validateWorkflowText` を使う step draft preview message を追加する。
- warning 表示から対象 field へ focus するリンクを追加する。
- `id` / `resultKey` 変更時の参照自動修復 option を追加する。
- provider 別 args schema が取得できるようになったら、command step の args UI を provider ごとに分ける。

