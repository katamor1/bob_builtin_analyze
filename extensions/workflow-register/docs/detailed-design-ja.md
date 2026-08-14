# workflow-register 詳細設計書

## 1. 文書の位置付け

本書は`extensions/workflow-register`の現在実装に対応する詳細設計を定義する。対象はworkflow探索・登録、IBM Bob連携、standalone実行、run state、pause / review / branching、task snapshot、artifact、retention、`Bob 操作ハブ`、`ワークフロー作成・編集`、AI補助、diagnostics、公開APIである。

通常operatorの公開入口は次の2件だけである。

| Command ID | 完成表示名 | 用途 |
|---|---|---|
| `workflowRegister.openOperationHub` | `Bob: 操作ハブを開く` | run監視、制御、診断、成果物、retention |
| `workflowRegister.openWorkflowBuilder` | `Bob Workflow: ワークフローを作成・編集` | 標準テンプレートから作成、既存編集、AI補助、保存 |

その他のCommand IDはworkflow、panel action、公開API、互換性、テストのため登録を維持するが、通常のCommand Paletteでは`when: "false"`とする。activation eventに存在することは公開面を意味しない。

## 2. entry pointとactivation

manifestの`main`は`./out/extensionWithAuthoring.js`である。`extensionWithAuthoring.activate()`はcore activationを先に実行し、次の順序で機能を組み立てる。

1. `WorkflowRegisterService`と公開APIを生成する。
2. `OperationHubProvider`を生成する。
3. core commandとBob source registrationを開始する。
4. Builder、validation、run control、retention、process、template、AI補助を登録する。
5. 開いている`WORKFLOW.md`へdiagnosticsを適用する。
6. workflow catalogを非同期reloadする。
7. IBM Bobの遅延activationに備えてbounded再登録を行う。

停止時はservice、panel、watcher、diagnostic collection、timer、provider registrationを`ExtensionContext.subscriptions`から破棄する。late async completionはgeneration tokenを確認し、dispose済みstateへ書き戻さない。

## 3. 実装構成

```text
extensions/workflow-register/
  package.json
  src/
    extension.ts
    extensionWithAuthoring.ts
    workflowRegisterService.ts
    workflowRunCommands.ts
    operationHubMutationTarget.ts
    bobWorkflowFactory.ts
    bobWorkflowRunner.ts
    bobWorkflowMessages.ts
    resultHandoff.ts
    reviewTaskRegistry.ts
    commands/
      openWorkflowBuilder.ts
      createWorkflow.ts
      editWorkflowInBuilder.ts
      validateWorkflow.ts
      workflowDiagnostics.ts
      inspectRunDiagnostics.ts
      runControl.ts
      runRetention.ts
      stepReview.ts
      automaticPauseResumeUi.ts
      designWorkflowWithAi.ts
      improveWorkflowWithAi.ts
      explainWorkflowDiagnostics.ts
      processCommands.ts
      templateCommands.ts
    gui/
      operationHubProvider.ts
      operationHubModel.ts
      operationHubHtml.ts
      operationHubMutationCoordinator.ts
    core/
      model.ts
      engine.ts
      engineTypes.ts
      actionRegistry.ts
      agentProvider.ts
      resultSinkRegistry.ts
      runStateStore.ts
      runControlStore.ts
      taskSnapshots.ts
      artifacts.ts
      heldRunRecovery.ts
      guardrails.ts
      workflowSchema.ts
      workflowValidator.ts
      workspaceRoots.ts
      authoring/
      engine/
      parser/
      runtime/
    webview/
      workflowBuilderPanel.ts
      workflowBuilderHtml.ts
      workflowBuilderStandardTemplateHtml.ts
      workflowBuilderClientScript.ts
      workflowBuilderStyles.ts
    template/
      templateStudioModel.ts
      templateGenerator.ts
      templateValidation.ts
      templateReadiness.ts
```

内部module名は互換性のため維持できるが、利用者向け表示と公開入口は上記2surfaceへ集約する。

## 4. workflow探索とidentity

探索対象は`**/.bob/workflows/*/WORKFLOW.md`である。open workspace folderのうち`.bob` markerを持つrootを優先し、無い場合はworkspace folderを候補とする。

workflow identityは次を区別する。

- logical workflow ID
- source ID
- physical workspace root
- workflow folder name
- workflow file path
- definition hash

multi-rootで同じlogical IDが存在する場合はroot slugとhashでregistration IDを一意化する。UIやcommand inputでrun / workflowを指定された場合も、IDだけで対象を決めずphysical rootと組み合わせて再検証する。

## 5. parser、schema、validator

### 5.1 parse

`parseWorkflowMarkdown()`は先頭のYAML front matterとMarkdown bodyを分離する。

- `schemaVersion: workflow-register/v1`はv1 parserへ渡す。
- schema version省略または明示legacyは互換parserへ渡す。
-未知version、non-string version、malformed YAMLをlegacyへ暗黙fallbackしない。

### 5.2 model

主なtop-level field:

```text
name
description
title / label / menuLabel
mode
workspaceRequired
inputs
requires
preflight
guardrails
stepExecution
stepReview
branching
artifacts
completion
steps
```

step type:

```text
command
agent
manual
result
```

manual stepはform、approval、user actionを持てる。step成功後の遷移は`transition`、戻りloopはtop-level `branching.loops[]`で定義する。

### 5.3 validation

validatorは少なくとも次を検査する。

- required field、型、enum、pattern
- workflow名とfolder名
- step IDの一意性
- `includeState`とproducerの関係
- manual form / approval result key
- artifact ID、path、`producedBy`
- preflight fileとcommand
- allowed / denied commandの衝突
- transition targetとloop
- backward gotoのbounded loop
- result sink type
- workspace外path
- provider IDと同梱workflow contract
- prompt / result / artifactのbyte上限

diagnosticsはfile、line、severity、code、message、次の対応を決定的な順序で返す。

## 6. Bob registration

`WorkflowRegisterService`はvalidated workflowだけをIBM Bob sourceへ登録する。

### 6.1表示方式

`stepExecution.mode`:

| mode | Bob側の表示 |
|---|---|
| `full` | workflow全体を1つの実行単位として表示 |
| `todo` |互換Todo定義を表示 |
| `engineSteps` | `steps[]`をBob上の可視stepへ対応させる |

Bob objectは永続化しない。`run.json`を実行状態の正本とし、Bob taskは現在process内のadapterとして扱う。

### 6.2 registration retry

Bob extensionがactivation時点で未起動の場合はbounded intervalで再登録する。同じAPI identityへの重複登録を避け、API generationが変わった場合は旧registrationをdisposeして新APIへ登録する。

late registration、partial registration、missing API identityはrollbackする。

## 7. execution engine

### 7.1実行方式

|方式|Bob task|用途|
|---|---|---|
| Bob full | あり | workflow全体を続けて実行 |
| Bob single step | あり | 1stepずつ実行 |
| standalone full | なし | 公開API / internal routingから全体実行 |
| standalone single step | なし | 指定stepまたは次stepだけ実行 |

### 7.2 step lifecycle

```text
pending
→ running
→ reviewing / held / completed / failed
```

run statusは`running`、`paused`、`checkpoint`、`reviewing`、`held`、`completed`、`failed`を扱う。

step実行は次の順序を守る。

1. run / workflow identityをreloadする。
2. preflightとguardrailを評価する。
3. execution leaseを取得する。
4. stepをrunningへ保存する。
5. provider / agent / manual / result処理を実行する。
6. result、effect、artifactを検証する。
7. step reviewまたはtransitionを評価する。
8. run stateをpersistする。
9. Bob表示と操作ハブをrefreshする。

### 7.3 command step

command stepは`ActionRegistry`のproviderを呼ぶ。任意shell command文字列を直接実行しない。provider inputのargs、inputs、state、workspace root、run ID、step IDをuntrustedとして再検証する。

### 7.4 agent step

Bob taskのsubagentまたは登録済み`AgentProvider`を使う。promptへ含めるstate、artifact、文書本文にはsize上限を設ける。partial output、cancelled output、provider errorをsuccessful resultへ昇格させない。

### 7.5 manual step

manual form、approval、操作案内を`Bob 操作ハブ`のrun detailから扱う。active Bob task handleが失われたheld runはread-only recovery状態として表示し、task snapshotや保存済みrunから安全な復旧routeを提示する。

### 7.6 result step

resultはliteral、state、agent outputから生成し、registered sinkへ渡す。file sinkはworkspace containment、symlink / junction、existing file expectation、atomic writeを検証する。

## 8. run state

保存先:

```text
.bob/workflows/runs/<runId>/run.json
```

current schema:

```text
workflow-register/run-state/v1
```

`run.json`は次を保持する。

- run / workflow identity
- definition hash、engine version
- inputs、state
- step stateとattempt
- current step、status、error
- timestamps
- review、pause、branching
- effect、artifact、reuse、hydration
- task snapshot import provenance
- definition mismatch metadata

### 8.1 version negotiation

- version省略はhistorical v0としてexact-byte backup後にmigrationする。
- current v1はread / write可能。
- future versionはstable coreを検証できる場合だけread-only表示する。
- foreign / malformed versionはinvalidとして隔離する。

1件のinvalid runが他のrun一覧を壊さない。load diagnosticはrun ID、severity、code、messageをstable orderで返す。

### 8.2 write safety

write前にschema version、revision、directory identity、definition expectationを再確認する。temporary file、fsync、atomic replace、journal、rollbackのruntime contractを維持する。

## 9. run control

保存先:

```text
.bob/workflows/runs/<runId>/control.json
```

`control.json`はoperator control signalの正本であり、`run.json`を置き換えない。

保持項目:

- manual pause request
- reason、requestedBy、mode
- clear / resume note
- automatic limit overrideとexpiry

engineは安全なcheckpointでrequestを評価する。実行中agentやexternal processを一律hard killしてsuccessful stateにしない。

manual requestはautomatic policyより優先する。overrideはautomatic limitだけを抑止し、manual requestを無効にしない。

## 10. review gateとattempt

`stepReview.enabled: true`の対象stepが成功するとrunは`reviewing`へ移る。

操作:

- accept
- accept-and-next
- retry
- current step inspection

retryはcurrent attemptをarchiveし、新attemptへ進める。accepted result、artifact、effectとretry resultを混同しない。review acceptanceはsame root / runでsingle-flight化し、live Bob gateとrun state更新をcoordination APIで接続する。

## 11. branching

step-level `transition`はstateに対する安全な比較だけを許可する。

```text
equals
notEquals
in
exists
truthy
```

backward gotoにはnamed loopを必須とする。loopは`maxIterations`、`extensionSize`、checkpoint messageを持つ。

上限到達時はrunを`checkpoint`へ移し、通常resumeで突破させない。operatorは`Bob 操作ハブ`で診断を確認し、追加loopを承認するか中止する。

back transition時は対象rangeのstep state、result key、artifact effectを再実行可能な状態へ戻し、previous attemptと前回manual inputを監査用metadataへ保存する。

## 12. task snapshot

保存先:

```text
.bob/workflows/runs/<runId>/task-snapshots/*.json
.bob/workflows/runs/<runId>/task-snapshots/latest.json
```

task snapshotは補助証跡であり、run再開の正本ではない。既定ではBob message本文を保存せず、bounded metadata、last assistant text候補、task export候補を扱う。

| 設定 | 既定値 | 責務 |
|---|---:|---|
| `workflowRegister.taskSnapshots.includeMessages` | `false` | Bob chat message本文は既定で保存せず、必要な場合だけoperatorが明示的に有効化する |

artifact importは次の順序で行う。

```text
read-only preview
→ candidate分類
→ operator selection
→ overwrite confirmation
→ run / workflow reload
→ preview再計算とdigest照合
→ execution lease
→ artifact write
→ manifest / run state更新
```

truncated、redacted、existing changed file、unsafe pathは既定選択しない。selection省略時はdefault-safe candidateだけを対象にする。

## 13. artifact reuse

artifact manifestはpath、bytes、SHA-256、producer step、schema、source runを保持する。

source runから開始する場合は次を検証する。

- source runとworkflow identity
- definition hash /許可されたmismatch
- artifact file containment
- bytes / checksum / schema
- target step dependency
- hydrated state key

既存runを変更せず、新しいrunを生成する。artifact本文やstate値を一覧projectionへ表示せず、ID、件数、completion source、timestampだけを表示する。

## 14. `Bob 操作ハブ`

### 14.1 lifecycle

`OperationHubProvider`は単一の`vscode.WebviewPanel`を所有する。

- view type: `workflowRegisterOperationHub`
- title: `Bob 操作ハブ`
- existing panelは再作成せず`reveal()`する
- `retainContextWhenHidden: true`
- dispose時にwatcher、debounce、scheduled refreshを破棄する

### 14.2 model

modelは次を含む。

- workspaceとworkflow root候補
- optional extensionの導入状態
- workflow catalog
- rootごとのrun inventory
- run revision
- held recovery classification
- task snapshot / artifact availability
- current focus target

### 14.3 watcher

rootごとに次を監視する。

```text
.bob/workflows/runs/**/run.json
.bob/workflows/runs/**/control.json
.bob/workflows/runs/**/artifacts/manifest.json
```

create / change / deleteをdebounceしてmodelを再生成する。操作後はbounded staged refreshで非同期state更新を追従する。

### 14.4 action dispatch

Webview messageは`operationHub.action`とallowlist済みaction IDだけを受け付ける。

代表action:

- Builderを開く
- workflowを実行する
- optional review UIを開く
- pause / resume / retry / accept / next
- manual input / approval
- branch checkpoint
- detached held recovery
- task snapshot import
- artifact reuse
- diagnostics / artifact open
- retention inspect / preview / cleanup / pin

### 14.5 mutation safety

mutationはcanonical workspace root、target ID、expected revisionを再検証する。`OperationHubMutationCoordinator`はsame physical root / target / actionの重複処理を直列化する。

workspace変更、stale revision、target消失、unsafe pathではrefresh-required errorとして拒否する。

## 15. `ワークフロー作成・編集`

### 15.1 lifecycleとsession

`WorkflowBuilderPanel`はsingle current panelを管理する。

- view type: `workflowRegisterBuilder`
- title: `ワークフロー作成・編集`
- session identity: root、source ID、editing file、mode
- mode: `empty` / `standard-template` / `edit`

同じsessionはrevealする。別sessionへ切り替える場合はunsaved changeを確認し、old previewをcleanupする。stale generationのresultをcurrent sessionへ適用しない。

### 15.2 mode

- `empty`: 空modelから新規作成。
- `standard-template`: 標準テンプレートから作成、project profile、customization、readiness。
- `edit`: 既存`workflow-register/v1`をloaderでmodel化。

`standard-template` modeが現行のテンプレート調整を担い、template metadataからの候補、typed default、VCS別prompt supplement、preview / diff / readiness、backup付き保存をBuilder内で扱う。標準テンプレート選択やreadinessを別公開surfaceへ分離しない。

### 15.3 previewとsave

save sequence:

1. modelをcanonical化する。
2. Markdownへserializeする。
3. parser / schema / reference validationを実行する。
4. previewとdiagnosticsを更新する。
5. existing fileとの差分を表示する。
6. operatorの明示確認を得る。
7. pathとopen時file expectationを再検証する。
8. target単位のqueueとtransaction lockを取得する。
9. existing fileをbackupする。
10. temporary fileからatomic commitする。
11. preview cleanupとcatalog reloadを行う。

cancel、validation error、external change、symlink escape、workspace escape、stale sessionではno-changeとする。

### 15.4 AI補助

AI設計、AI改善、diagnostics説明はBuilder内actionとして提供する。AI candidateを直接保存せず、host側でschema、reference、path、sizeを再検証し、preview / diff / confirmationを通す。

## 16. retention

設定namespace:

```text
workflowRegister.runs.retention.enabled
workflowRegister.runs.retention.completedDays
workflowRegister.runs.retention.maxCompletedRuns
workflowRegister.runs.retention.maxTotalBytes
```

このnamespaceはsettings互換であり、公開view IDではない。

retention操作は`Bob 操作ハブ`から明示的に開始する。自動timer cleanupを行わない。

処理順:

```text
bounded inventory
→ pure cleanup plan
→ metadata-only preview
→ operator confirmation
→ plan / digest / revision再検証
→ cleanup lease / owner guard
→ quarantine rename
→ commit / purgeまたはrollback
```

running、paused、checkpoint、reviewing、held、recoverable、referenced、pinned、future、invalid、locked runを削除しない。explicit selectionも保護条件を迂回しない。

## 17.公開API

activation return valueは次を含む。

| API | Contract |
|---|---|
| `registerActionProvider(provider)` | owner付きaction provider登録とdispose |
| `registerAgentProvider(provider)` | standalone / Bob adapter用agent登録 |
| `registerResultSink(type, handler)` | result sink登録 |
| `listWorkflows()` | current catalog取得 |
| `runWorkflow(workflowId, inputs)` | standalone full実行 |
| `runWorkflowStep(workflowId, stepId, inputs)` | standalone single-step実行 |
| `runNextStep(runId)` | next pending step実行 |
| `startFromStepWithArtifacts(...)` | validated artifactから新run開始 |
| `importArtifactsFromTaskSnapshots(...)` | preview済みsnapshot候補をimport |
| `acceptBobWorkflowGate(...)` | live Bob review gate承認 |
| `coordinateReviewAcceptance(...)` | review acceptance single-flight |

provider registrationはsource ownerを持つ。同一IDを別ownerが無警告で上書きすることを拒否し、old disposableがnew registrationを解除しない。

## 18. soft dependency

IBM Bobとcompanion extensionはsoft dependencyである。manifestの`extensionDependencies`へ必須登録しない。

- Bob未導入時もvalidation、Builder、standalone engineを利用できる。
- Bazaar / Code Consistency未導入時は対応actionをdisabled reason付きで表示する。
- optional provider登録失敗をcore activation failureへ変えない。
-導入後のactivation / reloadでproviderを重複なく再取得する。

## 19. security and privacy

- pathはphysical workspace containmentで検証する。
- symlink、junction、hard link、alias、workspace escapeを拒否する。
- external processはshellを使わず、timeout、AbortSignal、output limitを適用する。
- WebviewはCSP nonce、HTML escape、message allowlistを維持する。
- browser payload、Bob output、AI candidateをsource of truthにしない。
- secret、task本文、artifact本文、state値をdiagnostic一覧やrelease evidenceへ保存しない。
- write前にrevision、hash、digest、identity、file expectationを再検証する。
- partial writeをsuccessとして扱わずrollbackまたはtyped incomplete stateを残す。

## 20. tests

### 20.1 source / unit

- exact public command inventoryが2件。
- parser、schema version、validator、reference analysis。
- provider ownership、generation、dispose。
- full / single-step / resume / retry / review / branching。
- run state codec、migration、future read-only、invalid isolation。
- pause request、automatic limit、override。
- task snapshot preview、safe default、digest。
- artifact reuse、checksum、hydration、definition mismatch。
- OperationHubProvider lifecycle、watcher、mutation revision、serialization。
- Builder mode、テンプレート調整、render token、preview、diff、backup、atomic save。
- retention inventory、planner、lease、quarantine、rollback。

### 20.2 package / host

Ubuntu / Windowsの同一source headでcompile、architecture、source、schema、dependency、unit、package、VSIX policy、Extension Host smokeを実行する。

### 20.3 IBM Bob実機

- Bob workflow登録と可視step。
- `Bob 操作ハブ`とBuilderのclose / reopen。
- companion stageへのroute。
- keyboard-only、200% zoom、High Contrast。
- Developer Tools Consoleにuncaught exception / unhandled rejectionがない。
- tested commit、VSIX build commit、artifact hashの一致。

詳細は`unit-test-spec-ja.md`と`real-machine-test-spec-ja.md`に定義する。
