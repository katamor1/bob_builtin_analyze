# workflow-register GUI ワークフロー作成 MVP 実装メモ

## 実装範囲

`docs/workflow-register-gui-authoring-plan-ja.md` の Phase 1 を中心に、GUI で新規 `WORKFLOW.md` を作成する MVP を実装した。

追加した主な機能は次のとおり。

- Command Palette から `Bob ワークフロー: GUI で作成` を起動する。
- VS Code Webview に `Bob Workflow Builder` を表示する。
- テンプレートを選び、基本情報、steps、inputs、artifacts、guardrails を編集する。
- step を `agent` / `command` / `manual` / `result` として追加・削除・複製・上下移動する。
- `includeState` は前段 step の `resultKey` から候補選択する。
- `artifacts.producedBy` は既存 step id から候補選択する。
- GUI 内部モデルから `WORKFLOW.md` を生成する。
- 保存前に既存 `validateWorkflowText` を実行し、error がある場合は保存しない。
- 既存ファイルを上書きする場合は `WORKFLOW.backup-<timestamp>.md` を作成する。
- 保存後に `workflowRegister.reload` を実行する。

## 追加コマンド

| command | title | 用途 |
| --- | --- | --- |
| `workflowRegister.openWorkflowBuilder` | `Bob ワークフロー: GUI で作成` | Webview ベースのワークフロー作成画面を開く。 |

## 追加・変更ファイル

```text
extensions/workflow-register/package.json
extensions/workflow-register/src/extensionWithAuthoring.ts
extensions/workflow-register/src/commands/openWorkflowBuilder.ts
extensions/workflow-register/src/core/workflowAuthoringModel.ts
extensions/workflow-register/src/core/workflowAuthoringDefaults.ts
extensions/workflow-register/src/core/workflowAuthoringSerializer.ts
extensions/workflow-register/src/webview/workflowBuilderPanel.ts
extensions/workflow-register/test/workflowAuthoringSerializer.test.js
docs/workflow-register-gui-authoring-plan-ja.md
docs/workflow-register-gui-authoring-implementation-notes-ja.md
```

## 内部構成

### `WorkflowAuthoringModel`

GUI 用の中間モデル。`WorkflowDesignDraft` より詳細に、GUI で編集する `inputs`、`steps`、`artifacts`、`guardrails` を保持する。

```text
Webview form state
  -> WorkflowAuthoringModel
  -> serializeAuthoringModelToMarkdown
  -> validateWorkflowText
  -> .bob/workflows/<name>/WORKFLOW.md
```

### `workflowAuthoringDefaults.ts`

既存テンプレート種別から GUI 初期モデルを作る。

対象テンプレート:

- `simple-agent`
- `command-then-agent`
- `manual-checklist`
- `input-driven-agent`
- `preflight-files`
- `artifact-output`
- `guarded-command`
- `review-workflow`

### `workflowAuthoringSerializer.ts`

`WorkflowAuthoringModel` を `schemaVersion: workflow-register/v1` の YAML front matter と Markdown body に変換する。

保存前にはこの Markdown を `validateWorkflowText` に渡す。

## MVP で対応した UI

### 基本情報

- template
- workflow name
- title
- description
- workspaceRequired

### steps

- `agent` / `command` / `manual` / `result` の追加
- 削除
- 複製
- 上下移動
- `id`
- `title`
- `type`
- `required`
- `stateRequired`
- `resultKey`
- `maxResultBytes`
- `includeState`
- prompt
- command provider / command ID / extra args
- result source / stateKey / literal text / file sink path

### inputs

- id
- type
- title
- required
- select options

### artifacts

- id
- producedBy
- path

### guardrails

- allowedCommands
- deniedCommands

### preview / diagnostics

- 生成される `WORKFLOW.md` preview
- `validateWorkflowText` の diagnostics
- validation OK / NG 表示
- 保存ボタン

## 現時点の制約

この実装は MVP であり、次はまだ未対応である。

- 既存 `WORKFLOW.md` の GUI 編集。
- AI 提案の GUI 内部分適用。
- provider 別 args schema。
- `requires` / `preflight` の詳細 GUI 編集。
- `completion` の詳細 GUI 編集。
- raw YAML との双方向編集。
- step 削除時の参照自動削除確認ダイアログ。

## 次の実装候補

1. `workflowRegister.editWorkflowInBuilder` を追加し、既存 `WORKFLOW.md` を GUI に読み込めるようにする。
2. step 削除・並べ替え時に `includeState` / `producedBy` の影響分析を表示する。
3. `Design Workflow with AI` の出力を Webview に取り込み、GUI で修正して保存できるようにする。
4. 選択中 step の prompt に対して AI 改善ボタンを追加する。
5. `registerActionProvider` の一覧取得 API を追加し、command provider の候補表示を強化する。
