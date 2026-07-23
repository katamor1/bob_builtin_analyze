# workflow-register 基本設計書

## 1. 目的

`workflow-register` は、VS Code / IBM Bob 環境で `.bob/workflows/*/WORKFLOW.md` に定義されたワークフローを検出し、IBM Bob の Workflow UI、公開API、または内部commandから実行できるようにする基盤拡張機能である。

個別拡張が持つ前処理、レビュー、結果保存、成果物生成、検証、triageを、共通のworkflow定義、step実行、run state、run control、result handoffへ接続する。

利用者向けの公開入口は次の2画面へ集約する。

- `Bob 操作ハブ` — run一覧、実行状況、再開、pause、step review、診断、成果物確認
- `ワークフロー作成・編集` — 標準テンプレートから作成、既存workflow編集、preview、diff、backup付き保存、AI補助

## 2. 背景と課題

- `.bob/workflows` 配下の定義をBob Workflow UIへ動的に登録したい。
- `command`、`agent`、`manual`、`result`を一連のstepとして扱いたい。
- Bob UI上のTodo / visible stepとengine `steps[]`を使い分けたい。
- 実行状態を壊れにくく保存し、再起動や中断後に再利用したい。
- AI出力後に保存や検証だけ失敗した場合、Bob chat側の出力を救済したい。
- 長いworkflowをcheckpointで中断し、後で再開したい。
- run操作、実行診断、成果物、retentionを単一のoperator surfaceで扱いたい。
- workflow作成、テンプレート調整、AI補助、Diagnostics、Helpを単一のauthoring surfaceで扱いたい。
- 他拡張がaction provider / agent provider / result sinkをsoft dependencyとして追加できるようにしたい。

## 3. スコープ

### 3.1 対象範囲

- `.bob/workflows/*/WORKFLOW.md`の探索、解析、検証、登録
- `schemaVersion: workflow-register/v1`とlegacy workflowの読み込み
- IBM Bob Workflow UIへのsource / workflow登録
- Bob UIからのfull実行、Todo単位の`singleStep`実行、engine step単位の実行
- 公開APIまたは内部commandからのstandalone実行
- `command` / `agent` / `manual` / `result` stepの実行
- `stepReview`によるレビュー停止、承認、再試行、attempt保存
- `run.json`によるrun state保存とrecoverable run再利用
- `control.json`によるpause request保存、checkpoint停止、paused run再開
- task snapshotによるBob chat文脈、metadata、last assistant textの補助保存
- result handoff、file / command result sink、artifact出力
- Bob 操作ハブによるrun監視、制御、診断、成果物確認
- ワークフロー作成・編集による新規作成と既存v1 workflow編集
- 標準テンプレート選択、project profile / customization、readiness検査
- AI設計、AI改善、diagnostics説明
- action provider / agent provider / result sinkの公開API

### 3.2 対象外

- IBM Bob本体のUI実装
- 個別業務処理そのものの実装
- OS commandの自由実行
- workspace root外への成果物保存
- 複数ユーザー間のrun state同期
- Bob task object、Promise、callbackの永続化
- legacy workflowのGUI編集

## 4. 利用者と利用シーン

| 利用者 | 主な用途 |
| --- | --- |
| 開発者 | `.bob/workflows`にworkflowを定義し、Bob UIまたは公開APIから実行する。 |
| レビュー担当者 | Bob Workflow UIのTodo / Stepを進め、step reviewで結果を承認・再試行する。 |
| operator | Bob 操作ハブでrunの実行状況、pause、再開、診断、成果物を確認する。 |
| 拡張機能開発者 | action provider、agent provider、result sinkを登録する。 |
| ワークフロー設計者 | ワークフロー作成・編集で標準テンプレート、既存定義、AI補助を扱う。 |

## 5. 全体構成

```text
VS Code Extension Host
  └─ extensionWithAuthoring
       ├─ WorkflowRegisterService
       │    ├─ Parser / Schema / Validator
       │    ├─ BobWorkflowFactory
       │    ├─ BobWorkflowEngineRunner
       │    └─ WorkflowEngine
       │         ├─ ActionRegistry
       │         ├─ AgentProvider
       │         ├─ ResultSinkRegistry
       │         ├─ FileRunStateStore      -> .bob/workflows/runs/<runId>/run.json
       │         ├─ FileRunControlStore    -> .bob/workflows/runs/<runId>/control.json
       │         └─ FileTaskSnapshotStore  -> .bob/workflows/runs/<runId>/task-snapshots/
       ├─ Bob 操作ハブ Webview
       ├─ ワークフロー作成・編集 Webview
       ├─ Diagnostics / Help commands
       └─ AI authoring commands
```

manifestのentry pointは`./out/extensionWithAuthoring.js`で固定する。core activationだけの旧entryへ戻さない。

## 6. 主要コンポーネント

| コンポーネント | 主な責務 |
| --- | --- |
| Extension Entry | VS Code command登録、Bob連携、公開API返却 |
| WorkflowRegisterService | workflow探索、Bob source登録、run操作、provider管理 |
| BobWorkflowFactory | Bob workflow object / visible step arrayの構築 |
| BobWorkflowEngineRunner | Bob taskを`WorkflowEngine`へ接続するUI adapter |
| WorkflowEngine | full / singleStep / resume / retry / stepReview / pause / branching |
| Run State Store | `run.json`の作成、保存、一覧、recoverable run探索 |
| Run Control Store | pause request、clear、resume noteを`control.json`へ保存 |
| Task Snapshot | Bob task snapshot保存、latest、pruning、復帰候補取得 |
| Parser / Validator | `WORKFLOW.md`解析、schema validation、参照検証 |
| Action / Agent / Sink | command step、agent step、result / artifact出力 |
| Result Handoff | Bob assistant出力をcommand sinkへ渡す |
| Bob 操作ハブ | run一覧、状態、操作、診断、step provenance、artifact表示 |
| ワークフロー作成・編集 | template作成、既存編集、preview、diff、backup、save |
| AI Authoring | workflow設計、改善、diagnostics説明 |

## 7. ワークフロー定義モデル

workflowは`WORKFLOW.md`のYAML front matterとMarkdown bodyで定義する。新規定義では`schemaVersion: workflow-register/v1`を使用する。

主な要素は`name`、`description`、`title` / `label` / `menuLabel`、`mode`、`workspaceRequired`、`inputs`、`requires`、`preflight`、`guardrails`、`stepExecution`、`stepReview`、`branching`、`artifacts`、`completion`、`steps`、Markdown bodyである。

| step種別 | 説明 |
| --- | --- |
| `command` | action providerを呼び出し、戻り値を`resultKey`へ保存できる。 |
| `agent` | agent providerまたはBob taskのsubagentへpromptを渡す。 |
| `manual` | 人間の確認完了を待つ。 |
| `result` | state / literal / agent結果をresult sinkへ渡す。 |

`includeState`は前段stepの`resultKey`、manual `form.resultKey`、manual `approval.resultKey`を参照する。ワークフロー作成・編集は参照切れ、前方参照、`artifact.producedBy`不整合を保存前に警告する。

`branching`はstep成功後の決定的な遷移制御を定義する。過去stepへの`goto`には`branching.loops[]`を必須とし、上限到達時はrunをcheckpointへ移す。

## 8. 実行方式

| 実行方式 | Bob task | 主な用途 |
| --- | --- | --- |
| Bob UI full | あり | Bob UIからworkflow全体を実行する。 |
| Bob UI singleStep | あり | Todoまたはengine stepを1つずつ実行する。 |
| Standalone full / singleStep | なし | 公開APIまたは内部commandから実行する。 |

`stepReview`が有効な場合、対象step成功後にrunは`reviewing`で停止する。operatorはBob 操作ハブから承認、再試行、次step実行を選ぶ。

分岐実行では`run.json`を現在位置の正本とし、Bob chat、Bob 操作ハブ、diagnosticsへ同じcurrent stepを表示する。

## 9. 実行状態とrun control

### 9.1 run state

```text
<workflowRoot>/.bob/workflows/runs/<runId>/run.json
```

`run.json`はrun ID、workflow identity、schema version、definition hash、engine version、inputs、state、steps、current step、status、error、timestampsを保持する。branching loop、pending checkpoint、transition history、attempt effect、artifact provenanceもここへ記録する。

### 9.2 run control

```text
<workflowRoot>/.bob/workflows/runs/<runId>/control.json
```

`control.json`はpause request、reason、requestedBy、mode、clear、resume note、期限付きoverrideを保持する。engineは安全なcheckpointでだけpause requestと自動制限を評価し、実行中processやsubagentを強制停止しない。

### 9.3 task snapshot

```text
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/*.json
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/latest.json
```

task snapshotは`run.json`の代替ではなく、`lastAssistantText`救済、handoff失敗調査、Bob UIとの不整合診断に使う。

### 9.4 retention

retention設定は`workflowRegister.runs.retention.*`に保持する。このsettings namespaceは公開view IDではなく、既存workspace設定との互換性のため維持する。

## 10. 公開UIとcommand surface

### 10.1 公開command

workflow-registerがCommand Paletteへ公開するcommandは次の2件だけである。

| Command ID | 表示名 | 用途 |
| --- | --- | --- |
| `workflowRegister.openOperationHub` | `Bob: 操作ハブを開く` | run監視、制御、診断、成果物確認 |
| `workflowRegister.openWorkflowBuilder` | `Bob Workflow: ワークフローを作成・編集` | 標準テンプレートから作成、既存編集、AI補助 |

他のworkflow操作commandは内部登録を維持できるが、Command Paletteの公開面には出さない。

### 10.2 Bob 操作ハブ

Bob 操作ハブは単一panel内で次を扱う。

- running / paused / reviewing / held / failed / completedの実行状況
- pause、resume、retry、accept、next step
- run diagnostics、active step、definition hash、task snapshot
- step provenance、attempt、effect、artifact
- retention対象とmanual cleanup

### 10.3 ワークフロー作成・編集

ワークフロー作成・編集は単一panel内で次を扱う。

- 標準テンプレートから作成
- project profile / customization入力
- 既存`workflow-register/v1`の編集
- reference analysis、preview、diagnostics、diff
- backup後のatomic save
- AI設計、AI改善、diagnostics説明

## 11. 公開APIとsoft dependency

activation return valueは次を公開する。

| API | 用途 |
| --- | --- |
| `registerActionProvider(provider)` | `command` step providerを追加する。 |
| `registerAgentProvider(provider)` | standalone engineまたはBob adapterのagent実行を差し替える。 |
| `registerResultSink(type, handler)` | `result.sinks[].type`で参照できるsinkを追加する。 |
| `listWorkflows()` | 読み込み済みworkflow定義を取得する。 |
| `runWorkflow(workflowId, inputs)` | workflowをstandalone実行する。 |
| `runWorkflowStep(workflowId, stepId, inputs)` | workflow stepを`singleStep`で実行する。 |
| `runNextStep(runId)` | 保存済みrunの次のpending stepを1つ実行する。 |

`IBM.bob-code`とcompanion extensionはsoft dependencyとし、manifestの`extensionDependencies`へ必須登録しない。未導入でも通常command、authoring、standalone engineを利用できる。

provider登録は所有元source IDを持ち、同一IDの無警告上書きを禁止する。登録解除用disposableを返し、extension停止時に解除する。

## 12. セキュリティとエラー処理

- command stepはaction provider経由で実行する。
- guardrailsで許可・禁止commandを検査する。
- `file` result sinkはworkspace root外への書き込みを拒否する。
- task snapshotとrun controlはworkspace root配下へ保存する。
- Bob task object、Promise、callbackは保存しない。
- parse失敗は登録対象から除外し、diagnosticsへ出す。
- preflight error、provider未登録、result sink失敗はrun / stepを`failed`にする。
- manual stepは`held`、step reviewは`reviewing`、pause request検出時は`paused`として保存する。
- Git / Bazaar外部processはshellを使わず、hard timeout、出力上限、AbortSignal、子process終了を必須とする。
- repository内の全`WORKFLOW.md`をstrict validationし、provider、preflight、nested command ID、template mirrorのずれをCIで拒否する。

## 13. テスト方針

- parserのv1 / legacy解析
- schema validationと参照検証
- engineのfull / singleStep / resume / retry / stepReview / branching
- run controlのrequest / clear / paused遷移 / resume / automatic limits
- task snapshotの保存、latest、pruning、診断、復帰候補
- result handoffとartifact provenance
- Bob workflow factory / messages / task input helper
- authoring serializer / loader / reference analysis
- 標準テンプレート、typed defaults、prompt supplement、backup、workspace / symlink境界
- Bob 操作ハブのrun表示、操作、diagnostics、step provenance
- 公開commandが正確に2件であることと廃止IDが存在しないこと
- Ubuntu / Windowsでcompile、unit test、VSIX package、package policy
- IBM Bob実環境でBob UI step、Webview、MCP、multi-root workspaceをrelease candidate gateとして確認

詳細は`unit-test-spec-ja.md`と`real-machine-test-spec-ja.md`に定義する。
