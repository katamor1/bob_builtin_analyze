# Workflow Builder Webview modules

`workflowBuilderPanel.ts` は VS Code extension 側の WebviewPanel 制御だけを担当する。

Webview の表示とクライアント処理は次のファイルへ分割する。

- `workflowBuilderHtml.ts`: HTML shell、CSP、初期 state 埋め込み。
- `workflowBuilderStyles.ts`: Webview CSS。
- `workflowBuilderClientScript.ts`: Webview 内で動く form state / tab / preview / guardrails UI 処理。

`guardrails.requireApproval` の GUI 編集は `workflowBuilderClientScript.ts` の `renderGuardrails()` と `handleFieldEvent()` / click handler で扱う。
