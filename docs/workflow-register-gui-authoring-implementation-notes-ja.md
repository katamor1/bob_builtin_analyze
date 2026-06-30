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

## Phase 2: 参照関係 UX 強化

Phase 2 では、`resultKey` / `includeState` / `artifacts.producedBy` の関係を GUI 上で把握しやすくした。

追加した内容は次のとおり。

- step カードに参照エラーの警告バッジを表示する。
- step 詳細に「参照チェック OK / 参照チェック」を表示する。
- 削除対象 step の `resultKey` を後続 step が `includeState` している場合、削除前に影響を確認する。
- 削除対象 step を `artifacts.producedBy` が参照している場合、削除前に影響を確認する。
- step 上下移動で `includeState` が前段参照でなくなる場合、移動前に確認する。
- Preview / Diagnostics に参照チェック結果を表示する。
- validator diagnostics のうち `Step '<id>' ...` 形式のものはクリックで該当 step へ移動できるようにする。
- core 側に `workflowAuthoringReferenceAnalysis.ts` を追加し、参照分析をテスト可能にする。

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
extensions/workflow-register/src/core/workflowAuthoringReferenceAnalysis.ts
extensions/workflow-register/src/webview/workflowBuilderPanel.ts
extensions/workflow-register/test/workflowAuthoringSerializer.test.js
extensions/workflow-register/test/workflowAuthoringReferenceAnalysis.test.js
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

### `workflowAuthoringReferenceAnalysis.ts`

GUI で扱う参照関係を分析する。

主な検出対象:

- 重複 step id
- 存在しない `includeState`
- 並べ替えによる前方 `includeState`
- 存在しない `artifacts.producedBy`
- step 削除時の影響
- step 移動時の影響

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
- 参照チェック表示
- 削除・移動時の参照影響確認

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
- producedBy の参照チェック

### guardrails

- allowedCommands
- deniedCommands

### preview / diagnostics

- 生成される `WORKFLOW.md` preview
- `validateWorkflowText` の diagnostics
- validation OK / NG 表示
- 参照チェック結果
- diagnostics から該当 step への移動
- 保存ボタン

## 現時点の制約

この実装は MVP + Phase 2 であり、次はまだ未対応である。

- 既存 `WORKFLOW.md` の GUI 編集。
- AI 提案の GUI 内部分適用。
- provider 別 args schema。
- `requires` / `preflight` の詳細 GUI 編集。
- `completion` の詳細 GUI 編集。
- raw YAML との双方向編集。
- step 削除時の参照自動修復。

## 次の実装候補

1. `workflowRegister.editWorkflowInBuilder` を追加し、既存 `WORKFLOW.md` を GUI に読み込めるようにする。
2. `Design Workflow with AI` の出力を Webview に取り込み、GUI で修正して保存できるようにする。
3. 選択中 step の prompt に対して AI 改善ボタンを追加する。
4. `registerActionProvider` の一覧取得 API を追加し、command provider の候補表示を強化する。
5. step 削除時に参照を外す / producedBy を再選択する補助 UI を追加する。
