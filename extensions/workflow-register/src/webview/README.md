# Workflow Builder Webview modules

`workflowBuilderPanel.ts` は VS Code extension 側の WebviewPanel 制御だけを担当する。

Webview の表示とクライアント処理は次のファイルへ分割する。

- `workflowBuilderHtml.ts`: HTML shell、CSP、初期 state 埋め込み。
- `workflowBuilderStyles.ts`: Webview CSS。
- `workflowBuilderClientScript.ts`: Webview 内で動く form state / tab / preview / guardrails UI 処理。
- `workflowBuilderBodyScript.ts`: YAML front matter 以外の Markdown body 編集 UI を追加する補助 script。

`guardrails.requireApproval` の GUI 編集は `workflowBuilderClientScript.ts` の `renderGuardrails()` と `handleFieldEvent()` / click handler で扱う。

`Markdown Body` タブは `workflowBuilderBodyScript.ts` が `renderTabs()` を拡張し、`model.body` を直接編集する。空欄の場合は serializer 側の既存挙動により title / description から既定本文を生成する。
