# workflow-register 詳細設計書

## 1. 文書の位置づけ

本書は `extensions/workflow-register` の現在実装に対応する詳細設計を定義する。
対象は、workflow探索・登録、Bob UI実行、standalone実行、run state、pause / review / branching、task snapshot、artifact reuse、run retention、`Bob 操作ハブ`、`ワークフロー作成・編集`、AI補助、diagnostics、公開APIである。

run engine、provider、artifact、`run.json` の互換性を維持したまま、利用者向け入口だけを次の2commandへ集約する。

| Command ID | panel viewType | title |
| --- | --- | --- |
| `workflowRegister.openOperationHub` | `workflowRegisterOperationHub` | `Bob 操作ハブ` |
| `workflowRegister.openWorkflowBuilder` | `workflowRegisterBuilder` | `ワークフロー作成・編集` |

## 2. entry point と起動

`package.json` の `main` は `./out/extensionWithAuthoring.js` である。
`extensionWithAuthoring.activate()` は `extension.activate()` を先に呼び、core serviceと公開APIを作成した後、authoring、validation、run control、retention、process、template、AI commandを追加登録する。

`activationEvents` には `onStartupFinished` と、公開・内部双方のcommand activationが含まれる。activation eventに存在することはCommand Palette公開を意味しない。公開面はmanifestのcommand/menu契約で別に制御する。

起動順序は次の通り。

1. `WorkflowRegisterService`を作成する。
2. `WorkflowRegisterApi`をcomposition rootで構築する。
3. `OperationHubProvider`を作成する。
4. core commandを登録する。
5. validation、builder、step review、run control、retention、process、template、AI commandを登録する。
6. 開いている`WORKFLOW.md`へdiagnosticsを適用する。
7. `service.reload({ showReport: false })`を非同期実行する。
8. IBM Bobの遅延activationに備え、3秒、10秒、30秒、60秒、120秒後に再登録を試行する。

extension停止時は`ExtensionContext.subscriptions`がservice、panel provider、command、listener、timerを破棄する。

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
    bobWorkflowRunner.ts
    bobWorkflowFactory.ts
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

## 4. command surface

### 4.1 Command Paletteへ公開するcommand

公開するのは次の2件だけである。

| Command ID | 表示名 | category |
| --- | --- | --- |
| `workflowRegister.openOperationHub` | `操作ハブを開く` | `Bob` |
| `workflowRegister.openWorkflowBuilder` | `ワークフロー作成・編集を開く` | `Bob` |

### 4.2 内部command

workflow definition、companion extension、panel action、公開API、テストから呼ぶ内部commandは登録を維持する。代表groupは次の通り。

- catalog: reload、inspect、validate
- execution: run、single step、next step、resume、retry
- review: accept、accept-and-next、inspect current step
- pause: request、resume、inspect、automatic limit override
- held recovery: manual panel、detached held recovery、task snapshot import
- branching: checkpoint approve / abort、branch diagnostics
- artifact reuse: source runからの再開、manifest検証
- retention: inspect、preview、cleanup、delete、pin、unpin
- authoring: template作成、既存編集、AI設計、AI改善、diagnostics説明
- process / template provider command

内部commandは`when: "false"`相当のmenu policyでCommand Paletteから隠す。activation eventとregistrationは互換性のため残し、公開入口の重複には数えない。

## 5. `Bob 操作ハブ`

### 5.1 lifecycle

`OperationHubProvider`は単一の`vscode.WebviewPanel`を所有する。

- viewType: `workflowRegisterOperationHub`
- title: `Bob 操作ハブ`
- column: `ViewColumn.One`
- `enableScripts: true`
- `retainContextWhenHidden: true`
- 既存panelがある場合は再作成せず`reveal()`する
- dispose時にpanel、watcher、debounce timer、action refresh timerを破棄する

`workflowRegister.refreshOperationHub`はpanel内部やテストから利用する非公開commandである。panelが無い場合はopenへ委譲し、存在する場合はmodelを再読込する。

### 5.2 model

`buildOperationHubModel()`へ次を渡す。

- open workspace名とworkflow root候補
- IBM Bob、Bazaar Review、Code Consistency Reviewの導入状態
- workflow catalog
- rootごとの`FileRunStateStore.listRuns()`結果
- run state revision
- held recovery分類
- task snapshot利用可否
- artifact manifest利用可否
- active manual step利用可否
- focus対象run / workspace root

workflow rootは`.bob` markerを持つ候補を優先し、無い場合はopen workspace folderをfallback候補にする。multi-rootでは物理pathのcanonical identityでfocus対象を照合する。

### 5.3 自動更新

次のpathをrootごとにwatchする。

```text
.bob/workflows/runs/**/run.json
.bob/workflows/runs/**/control.json
.bob/workflows/runs/**/artifacts/manifest.json
```

create / change / deleteを150ms debounceし、panelを再renderする。操作後は300ms、1秒、2.5秒、5秒の段階refreshを予約し、非同期処理のstate反映を追従する。同じcontextのbackground refresh errorは繰り返し通知しない。

### 5.4 action dispatch

Webview messageは`type: "operationHub.action"`とallowlist済みaction IDだけを受け付ける。未知message、未知action、必要field欠落は拒否する。

代表actionは次の通り。

- Builderを開く
- workspace workflowを検証する
- Bazaar review / Code Consistency reviewを開く
- workflowを実行する
- artifact source runから開始する
- detached held runを復旧する
- task snapshot artifactをimportする
- pause / resume / retry / accept / next step
- manual step panelを開く
- run controlを確認する
- artifactを開く

optional extensionが無いactionは、command実行エラーへ流さず利用不可理由を表示する。

### 5.5 mutation safety

runまたはworkflowを変更するactionは次を満たす。

1. `workspaceRoot`をopen workspace folderのcanonical physical pathへ検証する。
2. target IDの存在を確認する。
3. workflow targetは現在catalogのworkflow rootと一致することを確認する。
4. run targetは`expectedRevision`と現在revisionを比較する。
5. `OperationHubMutationCoordinator`が同じphysical root / target / actionの重複mutationを直列化する。
6. stale revision、workspace変更、target消失はrefresh-required errorとして拒否する。
7. commandへは`source: "operationHub"`、canonical workspace root、target ID、expected revisionを渡す。

artifactを開く場合も、候補root配下のcontained pathだけを許可する。

## 6. `ワークフロー作成・編集`

### 6.1 openとsession

`openWorkflowBuilder()`はworkspace rootを選択し、`WorkflowBuilderPanel.createOrShow()`を呼ぶ。

- viewType: `workflowRegisterBuilder`
- title: `ワークフロー作成・編集`
- single current panel
- mode: `empty` / `standard-template` / `edit`
- root、source ID、editing file、focus stepをsession identityとして扱う

同一sessionを再openした場合はpanelをrevealする。未保存変更がある状態で外部から新しい内容を渡された場合は、編集内容を上書きせずwarningを表示する。別sessionへ切り替える場合は旧previewをcleanupし、generationを更新する。

### 6.2 mode

`empty`は空modelから新規作成する。
`standard-template`は標準テンプレート一覧、project profile、customization、preview、diff、readinessを扱う。
`edit`は既存`workflow-register/v1`をparser / loaderでmodel化する。

`標準テンプレートから作成`は別panelや別公開commandではなく、同じBuilder内のmodeである。

### 6.3 messageとconcurrency

Webview messageはrender tokenとsession generationを検証する。対応actionは次の通り。

- mode選択
- template一覧 / 読込 / reset
- project profile / customization検証
- workflow preview / diff
- readiness確認 / report open
- authoring preview / diff / save
- step draft検証
- skip / resume readiness preview / apply

stale generationの結果はcurrent sessionへ適用しない。saveはtarget path単位のqueueとtransaction lockで直列化する。

### 6.4 save safety

保存時は次の順で処理する。

1. authoring modelをcanonical化する。
2. Markdownへserializeする。
3. parser / validatorと同じ契約で検証する。
4. workflow document pathがworkspace root内であることを検証する。
5. open時に取得したfile expectationが現在も一致するか確認する。
6. transaction lockを取得する。
7. 既存fileをbackupする。
8. temporary fileからatomic commitする。
9. previewをcleanupする。
10. workflow catalogをreloadする。

外部変更、symlink escape、workspace escape、stale session、validation errorでは保存しない。

## 7. workflow探索・parser・validator

探索対象は`**/.bob/workflows/*/WORKFLOW.md`である。`.bob`を持つroot候補を優先し、同一logical workflow IDが複数rootにある場合はroot slugとhashで一意化する。

`parseWorkflowMarkdown()`は先頭YAML front matterを抽出し、`schemaVersion: workflow-register/v1`ならv1 parser、そうでなければlegacy parserを使う。

validatorは次を検査する。

- required fieldとfield type
- workflow / step ID
- duplicate step / decision ID
- Todoとengine stepの対応
- `includeState`のproducerと前方参照
- result source / sink
- artifact `producedBy`
- input `requiredWhen`
- guardrail衝突
- branch targetとbackward loop宣言
- manual form / approval result key衝突
- nested command IDとprovider参照

repository内のworkflow template mirrorも同じstrict validationへ通す。

## 8. Bob登録と実行adapter

`WorkflowRegisterService.reload()`はrootごとにworkflowを読み、Bob sourceへ登録する。IBM Bobが未導入または未activationの場合は通常commandとstandalone engineを維持し、Bob登録だけを保留してretryする。

`buildWorkflowSteps()`は次の規則でBob visible stepを生成する。

| 条件 | Bob step |
| --- | --- |
| `showInBob !== false`かつ`mode === "engineSteps"` | engine stepごと |
| `showInBob !== false`かつ`mode === "todo"`かつTodoあり | Todoごと |
| その他 | 単一full-run step |

`BobWorkflowEngineRunner`はtask metadata / messagesからinputを抽出し、subagent、message、step completion、task snapshot、review gate、manual completionをengineへ接続する。

## 9. `WorkflowEngine`

`runWorkflow()`の主要順序は次の通り。

1. recoverable runを検索し、無ければ新規runを作成する。
2. paused / checkpoint状態を判定する。
3. inputを解決・検証する。
4. `before-preflight` checkpointでmanual pauseとautomatic pauseを評価する。
5. preflightを実行する。
6. start indexを決める。
7. stepを実行する。
8. result / artifact、effect record、manual completion、review gateを処理する。
9. step後checkpointでpauseを評価する。
10. transitionを`next` / `goto` / `end` / `fail` / `checkpoint`へ決定する。
11. full実行で全step完了時に`completed`へ移す。

backward `goto`は対象範囲のstepをpendingへ戻し、attemptをarchiveし、その範囲のstate producerをcleanupする。loop上限到達時は専用checkpoint承認またはabortを要求する。

## 10. run state とphysical safety

### 10.1 authority

```text
<workflowRoot>/.bob/workflows/runs/<runId>/run.json
```

`run.json`はstatus、current step、inputs、state、step records、attempt、transition history、artifact/effect provenance、timestampsの正本である。Bob task object、Promise、callbackは保存しない。

`FileRunStateStore.saveRun()`は同directoryのtemporary fileへ書き、renameでcommitする。run pathはdirect containment、symlink / junction拒否、identity確認を通す。

### 10.2 recoverable run

workflow ID、definition hash、workflow file、canonical inputsが一致する継続可能runだけをreuseする。paused、held、reviewing、checkpointはそれぞれ専用操作契約を通し、通常full executionから暗黙突破しない。

## 11. run control とautomatic pause

```text
<workflowRoot>/.bob/workflows/runs/<runId>/control.json
```

`control.json`はpause request、reason、requestedBy、mode、clear、resume note、automatic-pause overrideを保持する。

manual requestを先に評価し、その後にworkflow / workspace automatic policyを同じpure evaluatorで評価する。対象は最大run時間、agent step数、IANA timezone上のlocal cutoffである。

停止時は`workflow.pause` stateへkind、source、checkpoint、nextStepId、limit、observed、detectedAtを保存する。実行中のcommand、process、Bob subagentを強制停止せず、安全なcheckpointで状態遷移する。

## 12. review gate・manual completion・held recovery

step review対象stepは`reviewing`で停止する。accept operationはdurable run updateとlive Bob gate reconciliationを同じworkspace root / run ID単位でcoordinateする。

manual stepは`held`で保存し、live `StepRuntime`がある場合だけcompletionをBob taskへ返す。`StepRuntime`はprocess memory上の補助であり、再起動後の正本は`run.json`である。

held recovery分類は次を組み合わせる。

- live Bob task
- active manual step
- valid artifact manifest
- matching task snapshot
- current workflow definition

recovery sourceが不足する場合は誤ってcompletedへ進めず、read-only説明または明示的なdetached recoveryを要求する。

## 13. task snapshot とresult handoff

```text
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/*.json
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/latest.json
```

snapshotはrun/workflow/step identity、reason、assistant text、optional task export、bounded metadataを保持する。既定上限は1件262,144 bytes、1 run 50件で、manifestとruntimeを同期する。

size判定は整形済みJSONと末尾改行を含むUTF-8 byteで行う。超過時はoptional dataを順に削減し、必須identityだけでも上限を超える場合は書き込まない。

result handoffはcurrent live outputを優先し、失敗復旧時だけidentityとdefinition hashが一致するsnapshotからassistant textを取得する。`file` sinkはworkspace root外を拒否し、`command` sinkはregistered action providerまたはVS Code commandへ渡す。

## 14. artifact reuse

artifact manifestはproducer run、workflow identity、definition hash、inputs、artifact path、hash、source stepを保持する。reuse開始時はmanifest schema、current workflow、canonical inputs、contained artifact pathを検証する。

source runがretention cleanup対象にならないようreference graphへ含める。task snapshot importも同じartifact manifest authorityへ追加し、raw chat textだけをrun stateへ埋め込まない。

## 15. run retention / cleanup

### 15.1 surface

retention関連commandはmanual-onlyの内部commandであり、Command Paletteの公開入口ではない。operatorはBob 操作ハブまたは明示的な内部呼び出しからinspect、preview、cleanup、delete、pin、unpinを実行する。

settings namespaceは`workflowRegister.runs.retention.*`を維持する。
既定は`enabled=false`、`completedDays=30`、`maxCompletedRuns=100`、`maxTotalBytes=524288000`である。`enabled`は将来自動cleanup用の予約値で、startup / timer / background cleanupは行わない。

### 15.2 planner

inventoryはdirect physical run treeをbounded scanし、run revision、retention revision、directory identity、tree fingerprint、measurement completeness、reference graph completenessを収集する。

pure plannerはage、terminal count、total bytes、selected run IDからstable decisionとSHA-256 digestを作る。次はcleanup blockerである。

- running / paused / checkpoint / reviewing / held
- artifact reuse、hydration、task snapshot importから参照されるsource run
- pinned、future / unknown / malformed state
- measurementまたはreference incomplete
- execution lock、pending journal
- symlink、junction、hard link、workspace escape、identity change

apply時はfresh inventoryから同じplanを再構築し、digestとevidence revision一致を要求する。

### 15.3 lease / owner guard

```text
<workflowRoot>/.bob/workflows/run-cleanup-leases/<runId>.json
<workflowRoot>/.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json
```

run ID順にatomic directory作成でowner guardを取得する。guard ownerとlease JSONへ同じtokenを保存し、normal executionもrun lock取得前にguard / leaseを確認する。

heartbeatとreleaseはcurrent owner token、direct regular file、single link、containment、path / handle identityを再検証する。owner不一致、identity変更、unexpected entry、alias、recent / uncertain ownerはfail closedとする。

### 15.4 quarantine transaction

```text
<workflowRoot>/.bob/workflows/run-cleanup-quarantine/<txId>/<runId>
```

全候補のlease / evidence再検証後にrun directoryをquarantineへrenameする。途中失敗は逆順rollbackする。全rename成功後に各entryを再検証してpurgeする。

rollback、purge、parent cleanupが失敗した場合はphase、committed run、residual run、retained quarantine pathをerrorへ保持し、残存quarantineを削除しない。

### 15.5 migration backup

historical v0 backupはcreate-once publicationを使う。cross-process crash pairが残った場合はPID visibilityだけで自動recoverせず、operatorがno-alias、identity、link count、exact bytes、publisher停止を証明した場合だけcleanupする。

### 15.6 privacy

inspect / preview / diagnosticsはrun ID、status、bytes、timestamp、blocker、digest、revision、path identity、件数だけを表示する。task本文、artifact本文、snapshot本文、state本文、Bob message本文は出力しない。

## 16. 公開APIとsoft dependency

`WorkflowRegisterApi`は次を公開する。

- action provider登録とdisposable返却
- agent provider登録
- result sink登録
- workflow一覧
- full / single-step実行
- artifact reuse開始
- task snapshot artifact import
- next step実行
- branch checkpoint approve / abort / inspect
- live Bob review gate accept / metadata付きaccept
- run単位のreview acceptance coordination

companion extensionは`local.workflow-register`をsoft dependencyとして扱う。manifestのrequired `extensionDependencies`へ追加しない。未導入時は連携actionを説明付きで無効化し、各extensionの通常commandを維持する。

providerはowner source IDを持ち、同一IDの無警告上書きを拒否する。登録disposableはextension停止時に必ず解除する。

## 17. diagnostics とerror handling

validationはactive editor切替、`WORKFLOW.md`保存、明示検証、Builder preview / saveで実行する。

run diagnosticsはrun identity、status、current step、definition hash、step state、attempt、snapshot、handoff error、truncation、branch history、loop count、pending checkpoint、artifact/effect provenanceを表示する。

| 発生箇所 | 処理 |
| --- | --- |
| YAML / schema error | diagnosticsへ返し、登録対象から除外する。 |
| IBM Bob不在 | Bob登録を保留し、standalone機能を維持する。 |
| provider / sink不在 | stepをfailedにする。 |
| manual step | heldとして保存する。 |
| review gate | reviewingとして保存する。 |
| pause | pausedとして保存する。 |
| stale panel mutation | stateを変更せず、refreshを要求する。 |
| snapshot保存失敗 | warningとして記録し、可能な範囲でrunを継続する。 |
| hook失敗 | warningとして記録し、durable state更新を優先する。 |

## 18. security boundary

- external processはshellを使わず、argument array、timeout、output cap、AbortSignalを使う。
- file / artifact / workflow / run pathはworkspace containmentとphysical identityを検証する。
- symlink / junction / hard-link ambiguityはwrite / cleanup対象から除外する。
- Webviewはnonce付きCSPとmessage action allowlistを使う。
- panel mutationはcanonical root、target identity、revision、coordinatorを通す。
- untrusted workspaceではread-only inspect / previewだけを許可する。
- destructive retention operationはworkspace trustをfilesystem access前に要求する。
- secret、credential、task本文、Bob message本文をdiagnostics / retention evidenceへ出さない。

## 19. test contract

### 19.1 automated

- manifest `main`が`./out/extensionWithAuthoring.js`
- Command Palette公開が2件だけ
- hidden command登録とactivation eventの維持
-廃止済みcommand / view / panel identifierがlive codeに存在しない
- `workflowRegister.runs.retention.*`が誤って廃止ID扱いされない
- OperationHubProviderのsingle panel lifecycle、title、viewType、message allowlist
- run watcher、debounce、段階refresh、dispose
- canonical workspace root、revision、target identity、mutation serialization
- optional extension不在理由
- WorkflowBuilderPanelのsingle panel、mode、dirty session保護、generation、save queue
- parser / validator / authoring round trip
- engine full / single step / resume / retry / review / pause / branching
- run state atomic writeとphysical path safety
- task snapshot cap、prune、identity付きrecovery
- artifact manifest、reuse、reference graph
- retention planner、lease、owner guard、quarantine、migration backup、privacy
- package policyとVSIX内容

### 19.2 Extension Host / real machine

UbuntuとWindowsの同一SHAで次を確認する。

- `workflowRegister.openOperationHub`を実行するとviewType `workflowRegisterOperationHub`、title `Bob 操作ハブ`のpanelが開く
- `workflowRegister.openWorkflowBuilder`を実行するとviewType `workflowRegisterBuilder`、title `ワークフロー作成・編集`のpanelが開く
- 公開5command全体とworkflow-register内部代表commandが登録される
- optional extension不在時に理由が表示される
- panel close後にdangling callback / unhandled rejectionがない
- keyboard操作、focus、200% zoom、High Contrast、長文表示を手動確認する
- compile、unit、package、package policyをLinux / Windowsで通す

詳細なcase IDは`unit-test-spec-ja.md`と`real-machine-test-spec-ja.md`に定義する。

## 20. 変更時の同期範囲

- command surface変更時: manifest、composition root、cross-extension契約、Extension Host smoke、README、基本/詳細設計、単体/実機仕様
- OperationHub action変更時: model、HTML、allowlist、command mapping、mutation target、coordinator、watcher tests
- Builder model変更時: serializer、loader、validator、HTML、client script、save transaction tests
- run state変更時: schema、store、engine、diagnostics、retention inventory、artifact reference graph
- run control変更時: store、pause evaluator、resume UI、operation hub、Linux / Windows tests
- retention変更時: planner、inventory、lease / guard、quarantine、privacy、operator recovery
- public API変更時: companion extension integration、soft dependency behavior、disposable ownership
