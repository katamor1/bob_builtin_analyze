# Bob Workflow Register

`workflow-register` は、IBM Bob 用の workflow 定義をワークスペースから読み込み、Bob の Workflow UI に登録するための VS Code 拡張機能です。`.bob/workflows/*/WORKFLOW.md` を読み込み、作成、検証、実行、再開、診断、AI 補助のコマンドを提供します。

## できること

- `.bob/workflows/*/WORKFLOW.md` を Bob workflow として登録する。
- `schemaVersion: workflow-register/v1` の workflow 定義を検証する。
- テンプレートから新しい workflow を作成する。
- 手動 step、command step、agent step、result step を順番に実行する。
- step の結果を workflow state に保存し、後続 step へ渡す。
- run state を保存し、診断、再開、再試行を行う。
- AI provider command が設定されている場合、workflow の設計、改善、診断説明を補助する。

## 前提

- VS Code / Bob IDE: `^1.106.1`
- IBM Bob 拡張: `IBM.bob-code`
- Node.js / npm
- TypeScript

## workflow の配置

workflow は workspace 直下の `.bob/workflows` に配置します。

```text
<workspace>/
  .bob/
    workflows/
      workflow-name/
        WORKFLOW.md
```

読み込み対象は次のパターンだけです。

```text
.bob/workflows/*/WORKFLOW.md
```

`workflow-name` と front matter の `name` は一致させることを推奨します。

## 最短手順

1. Bob IDE / VS Code で対象 workspace を開く。
2. Command Palette で `Bob Workflow Register: Create Workflow from Template` を実行する。
3. テンプレート、workflow 名、表示タイトル、説明を入力する。
4. 生成された `.bob/workflows/<name>/WORKFLOW.md` を編集する。
5. `Bob Workflow Register: Validate Current Workflow` で検証する。
6. `Bob Workflow Register: Reload Bob Workflow Files` で再読み込みする。
7. Bob の `Start Workflow` または `Bob Workflow Register: Run Workflow` から実行する。

## テンプレート

| テンプレート | 用途 |
| --- | --- |
| `simple-agent` | 1 つの AI step で完結する基本形。 |
| `command-then-agent` | VS Code command で情報を集め、AI step に渡す。 |
| `manual-checklist` | 人間の確認 step を順番に進める。 |
| `input-driven-agent` | 実行前に入力値を集めて prompt に使う。 |
| `preflight-files` | 必須ファイルを確認してから実行する。 |
| `artifact-output` | AI 結果をファイル成果物として保存する。 |
| `guarded-command` | command 実行のガードレールと承認を明示する。 |
| `review-workflow` | レビュー対象の収集、分析、結果出力をまとめる。 |

## 推奨フォーマット

新規 workflow では `schemaVersion: workflow-register/v1` を指定してください。

```md
---
schemaVersion: workflow-register/v1
name: sample-review
description: "サンプル対象をレビューする"
title: "Sample Review"
mode: agent
workspaceRequired: true
steps:
  - id: analyze
    title: Analyze
    type: agent
    prompt: |
      対象を確認し、結果を日本語で要約してください。
---
# Sample Review

## Goal

サンプル対象をレビューする。
```

必須フィールドは `name` と `description` です。`name` は英数字、`.`、`_`、`-` を使い、先頭は英数字にしてください。

## 主な top-level フィールド

| フィールド | 説明 |
| --- | --- |
| `schemaVersion` | 推奨値は `workflow-register/v1`。省略時は legacy 形式。 |
| `id` | Bob に渡す完全 ID。省略時は `<sourceId>.<name>`。 |
| `name` | 安定した workflow 名。フォルダ名と一致推奨。 |
| `description` | Bob UI と検証レポートに出る説明。 |
| `title` / `label` / `menuLabel` | 表示名。`label` は `title` より優先。 |
| `mode` | Bob の実行モード。既定は `agent`。 |
| `permissions` | Bob approval permissions。Todo 有効時は `todo` が追加されます。 |
| `workspaceRequired` | workspace がある時だけ有効にするか。既定は `true`。 |
| `inputs` | 実行前入力。`string` / `number` / `boolean` / `select` を指定可能。 |
| `requires` | workspace、Bob 最小バージョン、必須ファイルなど。 |
| `preflight` | 実行前チェック。 |
| `guardrails` | 許可 command、禁止 command、承認メッセージ。 |
| `artifacts` | 生成成果物の宣言。 |
| `completion` | 完了時の要約、成果物表示、結果検証。 |
| `steps` | 実行 step 本体。新規 workflow ではこの形式を推奨。 |

## step の種類

| type | 用途 |
| --- | --- |
| `agent` | Bob / agent に prompt を送って処理させる。 |
| `command` | VS Code command や action provider を実行する。 |
| `manual` | 人間が確認して完了させる。 |
| `result` | state や literal から結果を作り、file / command sink に渡す。 |

### command step

```yaml
steps:
  - id: collect-context
    title: Collect context
    type: command
    action:
      provider: vscode.executeCommand
      args:
        - example.collectContext
    resultKey: collectedContext
    required: true
    sendResult: true
```

`vscode.executeCommand` を使う場合、`args` の先頭に VS Code command ID を置きます。`resultKey` を指定すると command の戻り値を workflow state に保存できます。

### agent step

```yaml
steps:
  - id: analyze
    title: Analyze
    type: agent
    includeState:
      - collectedContext
    prompt: |
      collectedContext を使って分析してください。
```

`includeState` には、前段 step の `resultKey` で保存した値だけを指定できます。

### manual step

```yaml
stepCompletion: manual
steps:
  - id: confirm-input
    title: Confirm input
    type: manual
    prompt: |
      入力値と前提条件を確認してください。
```

手動 step を進めるには、`Workflow Step: Complete Current Step` または `Bob Workflow Register: Complete Current Bob Workflow Step` を実行します。

### result step

```yaml
artifacts:
  - id: report
    producedBy: write-report
    path: .bob/artifacts/sample-report.md
completion:
  includeArtifacts: true
steps:
  - id: analyze
    title: Analyze
    type: agent
    resultKey: analysisReport
    prompt: |
      Markdown レポートを作成してください。
  - id: write-report
    title: Write report
    type: result
    result:
      source: state
      stateKey: analysisReport
      sinks:
        - type: file
          path: .bob/artifacts/sample-report.md
```

`file` sink は workspace 外への書き込みを拒否します。

## inputs

```yaml
inputs:
  target:
    type: string
    title: Target path or topic
    required: true
  outputStyle:
    type: select
    title: Output style
    required: true
    options:
      - concise
      - detailed
steps:
  - id: analyze
    title: Analyze input
    type: agent
    prompt: |
      Target: {{inputs.target}}
      Output style: {{inputs.outputStyle}}
```

`select` input には `options` が必要です。

## legacy 形式

既存互換のため、Markdown の `## Todo` と `## Step: <id>` による legacy 形式もサポートしています。新規 workflow では `schemaVersion: workflow-register/v1` と `steps:` の使用を推奨します。

~~~~md
## Todo

- [ ] collect-context: コンテキストを集める
- [ ] analyze: 分析する

## Step: collect-context

```workflow-step
command: bobBazaar.collectReviewContext
sendResult: true
resultKey: reviewContext
required: true
```
~~~~

## 検証

| コマンド | 用途 |
| --- | --- |
| `Bob Workflow Register: Validate Current Workflow` | 開いている `WORKFLOW.md` だけを検証する。 |
| `Bob Workflow Register: Validate Workspace Workflows` | workspace 内の workflow をまとめて検証する。 |

主な検証内容:

- YAML front matter があるか。
- `name` / `description` があるか。
- `schemaVersion: workflow-register/v1` の構造が schema に合っているか。
- step ID が重複していないか。
- `includeState` が存在する `resultKey` を参照しているか。
- `result.source: state` の `stateKey` が存在するか。
- `artifact.producedBy` が存在する step を参照しているか。
- `select` input に `options` があるか。
- `guardrails.allowedCommands` と `guardrails.deniedCommands` が衝突していないか。

保存時と active editor 切り替え時にも `WORKFLOW.md` は diagnostics の対象になります。

## 実行と運用

| コマンド | 用途 |
| --- | --- |
| `Bob Workflow Register: Reload Bob Workflow Files` | workflow ファイルを再読み込みして Bob に登録する。 |
| `Bob Workflow Register: Inspect Bob Workflow Registration` | 登録状況と診断を Markdown で確認する。 |
| `Bob Workflow Register: Run Workflow` | workflow を選択して実行する。 |
| `Bob Workflow Register: Inspect Workflow Runs` | run state を確認する。 |
| `Bob Workflow Register: Resume Workflow Run` | 中断または保持された run を再開する。 |
| `Bob Workflow Register: Retry Current Workflow Step` | 現在 step を再試行する。 |
| `Bob Workflow Register: Inspect Workflow Run Diagnostics` | run 診断を確認する。 |
| `Bob Workflow Register: Inspect Active Bob Workflow Steps` | 手動完了待ち step を確認する。 |
| `Bob Workflow Register: Complete Current Bob Workflow Step` | 現在の手動 step を完了する。 |

run state は workspace 内の `.bob/workflows/runs/<runId>/run.json` に保存されます。

## AI 補助

| コマンド | 用途 |
| --- | --- |
| `Bob Workflow Register: Design Workflow with AI` | 目的とテンプレート候補から新しい `WORKFLOW.md` を作る。 |
| `Bob Workflow Register: Improve Workflow with AI` | 開いている workflow の検証結果をもとに修正案を作る。 |
| `Bob Workflow Register: Explain Workflow Diagnostics` | 診断結果を説明する。 |

AI provider は `workflowRegister.aiProviderCommand` で指定します。未設定時は mock provider が使われます。

`Improve Workflow with AI` は候補 Markdown を preview し、`.bob/workflows/.previews/...` に保存し、diff を表示します。明示確認後に backup を作成して適用します。

## 拡張ポイント

別拡張は `workflow-register` の API を使って処理を差し込めます。

| API | 用途 |
| --- | --- |
| `registerActionProvider(provider)` | `command` step で使う action provider を追加する。 |
| `registerAgentProvider(provider)` | standalone engine 用 agent provider を追加する。 |
| `registerResultSink(type, handler)` | `result` step の sink を追加する。 |
| `listWorkflows()` | 読み込み済み workflow 定義を取得する。 |
| `runWorkflow(workflowId, inputs)` | workflow をプログラムから実行する。 |

## 設定

| 設定 | 既定値 | 説明 |
| --- | --- | --- |
| `workflowRegister.sourceId` | `workflow-register` | Bob に登録する source ID。 |
| `workflowRegister.sourceName` | `Workflow Register` | Bob に表示する source 名。 |
| `workflowRegister.agentCommand` | 空 | standalone engine の agent step を実行する VS Code command。 |
| `workflowRegister.aiProviderCommand` | 空 | AI 設計、改善、診断説明に使う VS Code command。 |

## ビルド

```powershell
cd extensions\workflow-register
npm install
npm run compile
npm run test
npm run package
```

生成される VSIX 名は次の形式です。

```text
workflow-register-0.1.0.vsix
```

## トラブルシュート

| 症状 | 確認ポイント |
| --- | --- |
| Bob の Workflow UI に出ない | `.bob/workflows/*/WORKFLOW.md` の配置、`hidden`、`workspaceRequired`、Bob 側 workspace を確認する。 |
| `missing YAML front matter` | ファイル先頭が `---` で始まり、front matter が `---` で閉じているか確認する。 |
| `invalid YAML` | インデント、リストの `-`、引用符、タブ混入を確認する。 |
| `includeState references unknown resultKey` | 参照先より前の step に `resultKey` があるか確認する。 |
| `Unsupported action provider` | provider ID が登録済みか、または `vscode.executeCommand` を使っているか確認する。 |
| `select but has no options` | `inputs.<name>.options` に候補を追加する。 |
| 手動 step が進まない | `Complete Current Bob Workflow Step` または `Workflow Step: Complete Current Step` を実行する。 |

## 関連ドキュメント

- `docs/workflow-authoring-guide-ja.md`
- `extensions/bob-bazaar-review/README.md`
- `extensions/README.md`
