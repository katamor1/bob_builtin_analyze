# workflow-register 詳細設計書

## 1. 文書の位置づけ

本書は `extensions/workflow-register` 拡張機能の詳細設計を定義する。現在の実装に合わせ、Bob UI 実行、standalone 実行、中断・再開、step review、task snapshot、Run Control View、GUI Builder、Template Customization Studio、AI 補助、Help / docs 統合の責務を整理する。

## 2. 実装構成

```text
extensions/workflow-register/
  package.json
  README.md
  docs/
    basic-design-ja.md
    detailed-design-ja.md
    unit-test-spec-ja.md
    real-machine-test-spec-ja.md
    workflow-authoring-guide.md
    bob-task-export-recovery-plan-ja.md
    workflow-pause-resume-plan-ja.md
    workflow-pause-resume-phase0-decision-ja.md
  src/
    extensionWithAuthoring.ts
    extension.ts
    agentStep.ts
    bobApi.ts
    bobTaskInputs.ts
    bobWorkflowFactory.ts
    bobWorkflowMessages.ts
    bobWorkflowRunner.ts
    bobWorkflowTypes.ts
    reports.ts
    resultHandoff.ts
    taskSnapshotRecovery.ts
    workflowPromptContext.ts
    workflowRunSelection.ts
    commands/
      createWorkflow.ts
      designWorkflowWithAi.ts
      editWorkflowInBuilder.ts
      explainWorkflowDiagnostics.ts
      improveWorkflowWithAi.ts
      inspectRunDiagnostics.ts
      openWorkflowBuilder.ts
      runControl.ts
      runControlView.ts
      stepReview.ts
      validateWorkflow.ts
      workflowDiagnostics.ts
    core/
      actionRegistry.ts
      agentProvider.ts
      engine.ts
      engineTypes.ts
      guardrails.ts
      inputCollector.ts
      inputResolver.ts
      model.ts
      reportedActionError.ts
      resultSinkRegistry.ts
      runControlStore.ts
      runStateStore.ts
      taskSnapshots.ts
      workflowAiProvider.ts
      workflowAiProviderFactory.ts
      workflowAuthoring*.ts
      workflowScaffold.ts
      workflowSchema.ts
      workflowTemplates.ts
      workflowValidator.ts
      workspaceRoots.ts
      engine/
        manualCompletion.ts
        preflight.ts
        resultWriters.ts
        runPause.ts
        runState.ts
        stepExecutor.ts
        templateRenderer.ts
      parser/
        ...
    template/
      templateGenerator.ts
      templateReadiness.ts
      templateStudioModel.ts
      templateValidation.ts
    webview/
      templateCustomizationStudioClientScript.ts
      templateCustomizationStudioHtml.ts
      templateCustomizationStudioPanel.ts
      templateCustomizationStudioStyles.ts
      workflowBuilderBodyScript.ts
      workflowBuilderClientScript.ts
      workflowBuilderHtml.ts
      workflowBuilderPanel.ts
      workflowBuilderStyles.ts
  test/
    *.test.js
```

`bobWorkflowRunner.ts` から低リスク helper は分離済みである。現在同ファイルに残る主責務は `BobWorkflowEngineRunner` と `StepRuntime` である。

## 3. 起動設計

`package.json` の `main` は `./out/extensionWithAuthoring.js` である。activation event は `onStartupFinished`、`onView:workflowRegister.runs`、各 command の `onCommand` を指定する。

起動時の処理は次の通り。

1. `extensionWithAuthoring.activate(context)` を呼ぶ。
2. `activateCore(context)` を呼び、`WorkflowRegisterService` と core API を作る。
3. core command を登録する。
4. validation / diagnostics / GUI Builder / AI 補助 / step review / run control command を追加登録する。
5. `WorkflowRunControlView` を作成し、Explorer view `workflowRegister.runs` と Status Bar を開始する。
6. 既に開いている `WORKFLOW.md` を diagnostics 対象にする。
7. `WorkflowRegisterService.reload()` を非同期で実行する。
8. Bob 拡張の遅延起動に備えて retry timer を設定する。

## 4. Command entry

| Command ID | 主な用途 |
| --- | --- |
| `workflowRegister.reload` | `.bob/workflows/*/WORKFLOW.md` を再読み込みする。 |
| `workflowRegister.inspect` | 登録状態と diagnostics を Markdown で表示する。 |
| `workflowRegister.runWorkflow` | standalone engine で workflow を実行する。 |
| `workflowRegister.runWorkflowStep` | workflow と step を選択し、`singleStep` で1 step だけ実行する。 |
| `workflowRegister.inspectRuns` | 保存済み run state を一覧表示する。 |
| `workflowRegister.resumeRun` | held / running / paused run を再開する。 |
| `workflowRegister.retryCurrentStep` | current step を再試行する。 |
| `workflowRegister.acceptCurrentStep` | step review 中の current step を承認する。 |
| `workflowRegister.runNextStep` | 保存済み run の次の pending step を1つ実行する。 |
| `workflowRegister.acceptAndRunNextStep` | current step を承認して次 step を実行する。 |
| `workflowRegister.inspectCurrentStep` | current step の状態を表示する。 |
| `workflowRegister.pauseCurrentRun` | 選択 run に pause request を保存する。 |
| `workflowRegister.pauseAfterCurrentStep` | 現在 step 完了後の pause request を保存する。 |
| `workflowRegister.pauseBeforeNextAiCall` | 次の AI 呼び出し前を意図した pause request を保存する。現行 engine では checkpoint 停止として扱う。 |
| `workflowRegister.resumePausedRun` | paused run の pause request を clear し、`resumeRun` を呼ぶ。 |
| `workflowRegister.inspectRunControl` | `control.json` と `workflow.pause` state を表示する。 |
| `workflowRegister.refreshRunsView` | Explorer view `workflowRegister.runs` を更新する。 |
| `workflowRegister.openCurrentStepInBuilder` | current step の workflow 定義を GUI Builder で開く。 |
| `workflowRegister.inspectRunDiagnostics` | run state と task snapshot の診断を表示する。 |
| `workflowRegister.inspectActiveSteps` | Bob UI の手動完了待ち active step を表示する。 |
| `workflowRegister.openManualStepPanel` | held run または active manual step の手動操作 Webview を開く。 |
| `workflowRegister.completeCurrentStep` | Bob UI 経由の current manual step を完了する。 |
| `workflowRegister.completeStep` | `completeCurrentStep` の別名。 |
| `workflowRegister.validateCurrentWorkflow` | active editor の workflow を検証する。 |
| `workflowRegister.validateWorkspaceWorkflows` | workspace 内 workflow を一括検証する。 |
| `workflowRegister.createWorkflowFromTemplate` | template から `WORKFLOW.md` を作成する。 |
| `workflowRegister.openWorkflowBuilder` | Webview GUI で新規 workflow を作成する。 |
| `workflowRegister.editWorkflowInBuilder` | 既存 `workflow-register/v1` workflow を Webview GUI で編集する。 |
| `bobTemplate.validateLibrary` | 標準テンプレートライブラリを検証する。 |
| `bobTemplate.validateProjectProfile` | project profile YAML を検証する。 |
| `bobTemplate.validateCustomization` | customization YAML を検証する。 |
| `bobTemplate.generateWorkflow` | template / profile / customization から workflow を生成し、既存ファイルを backup する。 |
| `bobTemplate.checkReadiness` | checklist、UAT evidence、出力先などの readiness を検査する。 |
| `bobTemplate.openCustomizationStudio` | Template Customization Studio Webview を開く。 |
| `workflowRegister.designWorkflowWithAi` | AI provider で新規 workflow draft を作る。 |
| `workflowRegister.improveWorkflowWithAi` | AI provider で改善案を作り、preview / diff / backup 後に適用する。 |
| `workflowRegister.explainWorkflowDiagnostics` | diagnostics を自然言語で説明する。 |

## 5. 設定設計

| 設定 | 既定値 | 用途 |
| --- | --- | --- |
| `workflowRegister.sourceId` | `workflow-register` | Bob に登録する source ID。 |
| `workflowRegister.sourceName` | `ワークフロー登録` | Bob に表示する source 名。 |
| `workflowRegister.agentCommand` | 空 | standalone agent step を VS Code command に委譲する。 |
| `workflowRegister.aiProviderCommand` | 空 | AI 設計、改善、診断説明に使う。 |
| `workflowRegister.taskSnapshots.enabled` | `true` | Bob UI 実行時に task snapshot を保存する。 |
| `workflowRegister.taskSnapshots.maxBytes` | `262144` | 1 snapshot JSON の最大サイズ。 |
| `workflowRegister.taskSnapshots.maxPerRun` | `50` | 1 run に保持する snapshot 数。 |
| `workflowRegister.taskSnapshots.includeMessages` | `false` | 既定では Bob chat messages を含めない。診断目的で必要な場合だけ明示的に有効化する。 |
| `workflowRegister.taskSnapshots.pruneOnSave` | `true` | 保存時に古い snapshot を削除する。 |

## 6. 公開 API

`activate` の戻り値として `WorkflowRegisterApi` を公開する。

```ts
export interface WorkflowRegisterApi {
  registerActionProvider: (provider: ActionProvider) => void
  registerAgentProvider: (provider: AgentProvider) => void
  registerResultSink: (type: string, handler: Parameters<ResultSinkRegistry["register"]>[1]) => void
  listWorkflows: () => CoreWorkflowDefinition[]
  runWorkflow: (workflowId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  runWorkflowStep: (workflowId?: string, stepId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  runNextStep: (runId?: string) => Promise<unknown>
}
```

公開 API の `runWorkflow` / `runWorkflowStep` / `runNextStep` は standalone 実行である。Bob task は作成されない。

## 7. Workflow 読み込み設計

探索対象は `**/.bob/workflows/*/WORKFLOW.md` である。`workspaceRoots.ts` は `.bob` を持つ root 候補を direct candidate、child candidate、fallback candidate の順で解決する。

読み込み時は workflow root ごとに `WORKFLOW.md` を探し、`parseWorkflowMarkdown()` で `CoreWorkflowDefinition` へ変換する。同じ logical workflow ID が複数 root から見つかった場合は、workflow root の basename と SHA-1 hash を使って workflow ID を一意化する。

## 8. Parser / Schema / Validator

`parseWorkflowMarkdown()` は Markdown 先頭の YAML front matter を抽出し、`schemaVersion: workflow-register/v1` なら v1 parser、そうでなければ legacy parser を使う。

v1 schema の主な制約は次の通り。

- `name` と `description` は必須。
- `name` は英数字で始まり、英数字、`.`、`_`、`-` のみを許可する。
- `stepCompletion` は `auto` または `manual`。
- `stepMessage` は `full` / `current` / `silent` / `step`。
- `stepExecution.mode` は `full` / `todo` / `engineSteps`。
- `stepReview.pauseAfter` は `everyStep` / `agentAndCommand` / `none`。
- `branching.enabled` が true の場合、`branching.loops[]` の `entryStep`、`maxIterations`、`extensionSize` を検証する。
- input `type` は `string` / `number` / `boolean` / `select`。
- step `type` は `command` / `agent` / `manual` / `result`。
- `command` step では `action` を必須とする。
- `result` step では `result` を必須とする。

`workflowValidator.ts` は schema 検証に加え、step ID 重複、Todo と step の対応、`includeState` 前方参照、result source、sink 設定、artifact `producedBy`、input `requiredWhen`、guardrails 衝突を検査する。分岐では decision ID 重複、condition 演算子数、`goto` step の存在、後方 `goto` の loop 指定、loop ID の存在、manual `form.resultKey` / `approval.resultKey` と既存 producer の衝突を検査する。

## 9. Bob 登録設計

`adaptCoreWorkflowForBob()` は `CoreWorkflowDefinition` を Bob adapter 用 model へ変換する。`buildWorkflowSteps()` は次の方針で Bob step を生成する。

| 条件 | Bob step |
| --- | --- |
| `stepExecution.showInBob !== false` かつ `stepExecution.mode === "engineSteps"` | engine `steps[]` ごとの Bob step。 |
| `stepExecution.showInBob !== false` かつ `stepExecution.mode === "todo"` かつ Todo がある | Todo ごとの Bob step。 |
| 上記以外 | 単一 `runWorkflow` step。 |

## 10. WorkflowEngine 詳細

`WorkflowEngineOptions` は、actions、resultSinks、runStore、runControlStore、agentProvider、workspaceAvailable、fileExists、preflightChecks、strictPreflightChecks、hooks、manualCompletion、recoverResultText を持つ。

`runWorkflow()` は次の順で処理する。

1. recoverable run を検索し、無ければ run を作成する。
2. paused run はそのまま返す。
3. input を検証する。
4. `before-preflight` checkpoint で pause request を確認する。
5. preflight を実行する。
6. start index を決定する。
7. step を実行する。
8. step 成功後に artifact 出力、manual completion、step review、pause checkpoint を処理する。
9. step `transition` があれば `run.state` を条件評価し、`next` / `goto` / `end` / `fail` / `checkpoint` を適用する。
10. full 実行で全 step が完了したら run を `completed` にする。

`retryCurrentStep()` は current step を pending に戻し、必要に応じて attempt を保存してから再実行する。`resumeRun()` は `paused` の場合に run control を clear し、`held` の場合は `completeHeldStep` に応じて held step を完了扱いにして続行する。`checkpoint` の run は通常 resume では突破できず、`approveBranchCheckpoint()` または `abortBranchCheckpoint()` で明示処理する。

後方 `goto` は reset 対象範囲の step state を pending に戻し、attempt を archive し、範囲内で生成された `resultKey` / manual result key を `run.state` から削除する。manual form の前回値は `workflow.branching.lastValues.<stepId>.<resultKey>` に退避し、再入力 UI の初期値として利用できる。

## 11. Run State Store

保存場所:

```text
<workflowRoot>/.bob/workflows/runs/<runId>/run.json
```

`FileRunStateStore.saveRun()` は一時ファイルに JSON を書き込み、rename する atomic write で保存する。`findRecoverableRun()` は workflow ID、definition hash、workflow file、canonical inputs が一致する継続可能 run を返す。recoverable status には `checkpoint` も含めるが、engine は通常 resume ではなく専用 checkpoint command の対象として扱う。

## 11A. Workflow Run Retention / Cleanup

### 11A.1 Authority と公開surface

`run.json`をstatus、updatedAt、provenanceの正本とし、run-state schemaは変更しない。Pinはrun directory内の`retention.json` sidecar（`workflow-register/run-retention/v1`）に保存する。Malformed/future sidecarはfail-safeでpinnedとして扱う。

公開commandは次の6つで、すべてmanual-onlyである。

```text
workflowRegister.inspectRunStorage
workflowRegister.previewRunCleanup
workflowRegister.cleanupCompletedRuns
workflowRegister.deleteSelectedRuns
workflowRegister.pinRun
workflowRegister.unpinRun
```

`inspectRunStorage`と`previewRunCleanup`はuntrusted workspaceでもread-onlyで動作する。`cleanupCompletedRuns`、`deleteSelectedRuns`、`pinRun`、`unpinRun`はroot discovery、UI selection、service construction、filesystem accessより前に`requireTrustedWorkspace()`を通す。Multi-rootではroot selectionをrun selectionより先に行い、同じrun IDをroot間で共有しない。

Retention設定は`enabled=false`、`completedDays=30`、`maxCompletedRuns=100`、`maxTotalBytes=524288000`を既定値とする。`maxCompletedRuns`は名前にかかわらずterminal statusの`completed`と`failed`を合算し、上限超過分のeligible terminal runを候補にする。`enabled`は将来の自動cleanup用予約値で、manual commandの可否には使わない。Startup/timer/background cleanupは実装しない。

### 11A.2 Inventory、planner、apply binding

`runRetentionInventory.ts`はdirect physical run treeをbounded scanし、run revision、retention revision、directory identity、bounded tree fingerprint、measurement completeness、reference graph completenessを収集する。Symlink/junctionをfollowせず、hard-linked fileはbytesを計上しても本文を開かず、runをunsafeとしてcleanup対象外にする。

`runRetention.ts`のpure plannerはage、terminal (`completed` / `failed`) count、total bytes、selected run IDからstable decisionとSHA-256 digestを生成する。次をblockerとして保持する。

- Active/recoverable status: `running`、`paused`、`checkpoint`、`reviewing`、`held`
- Artifact reuse、hydration、task-snapshot importから参照されるsource run
- Pinned、future/read-only、unknown、invalid/missing、measurement/reference incomplete
- Execution lock、pending journal
- Symlink/junction/hard link/workspace escape/identity changeなどphysical safety不明

`WorkflowRunRetentionService.apply()`はfresh inventoryから同一policyでplanを再構築し、digestとevidence revisionの一致を要求する。明示選択も同じplannerを通り、protected runを迂回しない。

### 11A.3 Cleanup lease と owner guard

保存場所はruns列挙の外に固定する。

```text
<workflowRoot>/.bob/workflows/run-cleanup-leases/<runId>.json
<workflowRoot>/.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json
```

Run ID順にatomic guard-directory `mkdir`でowner guardを取得し、guard ownerとlease JSONに同じcleanup lease v1 tokenを保存する。Normal executionはrun lock取得前にcleanup guard/leaseを確認する。Cleanupはlease取得後にexecution lock、journal、revision、directory identityを再検証する。

Heartbeatとreleaseはacquisition時に保持したguard directoryの`dev`/`ino`を再検証し、現在のdirect single-linked `owner.json`をcleanup lease v1としてdecodeし、run IDとtokenを照合する。各readはdirect regular file、`nlink=1`、containment/no-alias、path/handle identityを検査するが、acquisition時のowner bytesまたはowner-file `dev`/`ino`をlifetime全体へ固定しない。Lease JSONもcurrent tokenを照合し、heartbeatではそのoperation内のsnapshotとopen handleの`dev`/`ino`/`nlink`を比較する。通常releaseは`<runId>.json`、`owner.json`、`<runId>.guard`の順である。Orphan/new-protocol guardは自動reclaimしない。Owner token不一致、guard identity変更、unexpected entry、alias/hard link、recent/uncertain ownerはfail-closedで保全する。手動復旧もこのowner-checked順を再現しなければならない。

### 11A.4 Quarantine transaction

```text
<workflowRoot>/.bob/workflows/run-cleanup-quarantine/<txId>/<runId>
```

全候補のlease/evidence再検証後、run directoryをtransaction directoryへ順にrenameする。途中rename失敗は移動済みentryを逆順でruns rootへ戻す。全rename成功後、各quarantine entryを再検証して1件ずつpurgeし、最後に空のtransaction/base directoryを削除する。

Rollback、purge、parent cleanupが失敗した場合は`WorkflowRunCleanupIncompleteError`へ`phase`、`committedRunIds`、`residualRunIds`、`retainedQuarantinePath`を保存し、quarantineを削除しない。Node.jsにはidentity-conditional rename/recursive removeがないため、cooperative writerはleaseで排除し、filesystem call直前までidentityを再検証するが、非協調OS actorに対する最終verify-to-call raceは既知の境界として残る。

### 11A.5 Migration publication crash pair

Historical v0 backupは`run-state-v0.backup.json`へcreate-once hard-link publicationする。Tempはruns rootの`.<runId>.<pid>.<uuid>.tmp`である。Initial publicationとrollbackは、operation/identity、byte/domain safety、cleanup `rm`、verification/cleanup handle close、owner closeの順でerrorを選択し、全verification handleのoperation/close settlement後にcleanupへ進む。

Tempとbackupが同一`dev`/`ino`、各`nlink=2`、同一historical bytesのcross-process crash pairとして残っても、自動recoverしない。PID visibilityだけでは別host/container/namespaceのpublisher停止を証明できないためである。Operatorはno-alias、direct containment、exactly one valid temp、`dev`/`ino`/`nlink`、exact bytes、publisher停止を証明した場合だけtemp linkを外し、その直後にbackupの同一identity、`nlink=1`、exact bytesを再確認する。

### 11A.6 Privacy

Inspect/preview/diagnostics/evidenceはrun ID、status、inspection status、bytes、timestamp、blocker、digest/revision、path/identity、件数だけを出力する。Task、artifact、snapshot、state、Bob message本文は出力しない。

## 12. Run Control Store / Pause

保存場所:

```text
<workflowRoot>/.bob/workflows/runs/<runId>/control.json
```

`FileRunControlStore` は次を提供する。

| API | 処理 |
| --- | --- |
| `requestPause(input)` | pause request を保存する。 |
| `clearPause(runId)` | pause request を clear し `clearedAt` を保存する。 |
| `loadControl(runId)` | `control.json` を読む。 |
| `isPauseRequested(runId)` | active pause request の有無を返す。 |
| `recordResumeNote(runId, note)` | resume note を保存する。 |

`pauseRunIfRequested()` は active pause request を検出すると、run status を `paused` にし、次 step があれば `currentStep` に設定し、`run.state["workflow.pause"]` に pause metadata を JSON 文字列で保存し、`onRunPaused` hook を呼ぶ。

## 13. Run Control Commands / View

`runControl.ts` は `pauseCurrentRun`、`pauseAfterCurrentStep`、`pauseBeforeNextAiCall`、`resumePausedRun`、`inspectRunControl` を実装する。run selection は `workflowRunSelection.ts`、`FileRunStateStore`、workspace root candidate を使う。

`runControlView.ts` は `WorkflowRunControlView` を実装する。

- Explorer view ID は `workflowRegister.runs`。
- 15秒間隔と workspace folder 変更時に refresh する。
- 各 item は run ID、status、current step、root、updatedAt を表示する。
- `contextValue` は `workflowRun.<status>`。
- Status Bar は active run を running / paused / reviewing / held 別に集計する。

Branch checkpoint command は active run selection と run store を使い、`approveBranchCheckpoint` で loop の `allowed` を `extensionSize` だけ増やして pending back transition を適用し、`abortBranchCheckpoint` で run を `failed` にする。`inspectBranching` は loop count、allowed、checkpoint、history を Markdown report として表示する。

## 14. Task Snapshot / Recovery

保存場所:

```text
<workflowRoot>/.bob/workflows/runs/<runId>/task-snapshots/
```

各 snapshot は時刻、stepId、reason を含むファイル名で保存される。最新 snapshot は `latest.json` にも保存する。保存 reason は `workflow-start`、`step-start`、`agent-output`、`handoff-failed`、`held`、`failed`、`completed` などである。

`recoverResultTextFromSnapshots()` は `latest.json`、次に最新の `agent-output` snapshot から `lastAssistantText` を探す。workflow ID、run ID、step ID、definition hash が一致する場合だけ利用する。

## 15. StepRuntime

`StepRuntime` は Bob UI 実行で manual step または workflow-level manual completion が必要なときだけ使う。保持する情報は active key、workflow ID、run ID、step ID、Bob task object、step definition、guardrails、action registry、inputs / state の snapshot、message start index、Promise の `resolve` である。

`StepRuntime` は永続状態ではない。VS Code 再起動で失われる。復帰時の正本は `run.json` であり、Bob chat 側の補助情報は task snapshot である。

`completeCurrentStep()` は active step を選択し、必要なら `captureHeldStepResult()` で Bob chat の latest assistant text を result command へ handoff した後、`task.setStepComplete()` と Promise resolve を行う。`completeStepByKey(activeKey)` は Manual Step Panel から指定 key の active step だけを完了するための経路であり、同じ完了 helper を使って result handoff と guardrails を bypass しない。

`manualCompletion` は step が held になった時点で `onHeldStep` callback を呼ぶ。`WorkflowRegisterService` はこの callback から `ManualStepPanelController.show()` を呼び、`steps[].userAction`、`prompt`、run inputs、state snapshot を使って利用者向けメッセージを表示する。active task が残っていない held run では read-only 表示にし、誤って完了扱いにしない。

## 16. Result Handoff / Sink

`executeResultHandoff()` は agent step が出力した text を trim し、互換用 `args[0]` と `latestAssistantText` / `resultText` / `artifactText` に渡す。`file` sink は workspace root 配下のみ許可し、path escape を拒否する。`command` sink は action provider または VS Code command を呼び出す。

## 17. GUI Builder / AI Authoring

GUI Builder の保存処理は、authoring model を Markdown 化し、検証し、error が無ければ既存ファイルを backup して `WORKFLOW.md` を書き込み、`workflowRegister.reload` を実行する。authoring model は `branching`、step `transition`、manual `form` / `approval` を保持し、Preview / Diagnostics / Save で parser と validator の同じ検査を通す。

Step detail は `User action` section を持ち、`steps[].userAction.message`、`completeLabel`、`confirmOnComplete`、`confirmMessage` を編集できる。manual step では `userAction.message` が無い場合に `prompt` へ fallback する。Builder preview は template 変数を未展開のまま表示し、保存前 validation は利用者向けメッセージ欠落、長すぎるボタン文言、確認文の既定 fallback、無効化される `command:` URI を warning / info として出す。

AI provider は `workflowRegister.aiProviderCommand` で指定する。未設定時は mock provider を使う。`improveWorkflowWithAi` は候補 Markdown を `.bob/workflows/.previews/...` に保存し、diff を表示し、明示確認後に backup を作成して適用する。

## 18. Diagnostics

検証タイミングは、`validateCurrentWorkflow`、`validateWorkspaceWorkflows`、`WORKFLOW.md` 保存時、active editor 切替時、GUI Builder preview / save 時である。

`inspectRunDiagnostics` は、run state と task snapshot summary を読み、run ID、status、current step、workflow hash、step 状態、attempt 件数、snapshot 件数、latest snapshot、handoff error、truncated、不一致 warning を表示する。分岐 run では branch history、loop count、pending checkpoint、reset attempt の有無も表示対象にする。

## 19. Multi-root workspace

`.bob` を持つ root を workflow root として扱う。action provider、agent provider、result sink、run store、task snapshot store、run control store には `workflowRoot` / `workflowFile` / `workflowFolderName` を渡す。同じ workflow ID が複数 root から見つかった場合、`<logicalId>.<rootSlug>-<sha1-prefix>` の形式に修飾する。

## 20. Error Handling

| 発生箇所 | 処理 |
| --- | --- |
| YAML parse / schema error | diagnostics として返す。 |
| Bob extension 不在 | 登録を中断し inspect report に記録する。 |
| action provider 不在 | command step を failed にする。 |
| result sink 不在 | result / artifact 書き込みを failed にする。 |
| manual step | `held` として保存する。 |
| step review | `reviewing` として保存する。 |
| pause requested | `paused` として保存し、`onRunPaused` hook を呼ぶ。 |
| completed / failed run の pause | command 側で warning を表示して拒否する。 |
| hook 失敗 | warning に留め、run state 更新を優先する。 |
| snapshot 保存失敗 | hook 失敗扱い。workflow 実行は可能な範囲で継続する。 |

## 21. テスト設計

| 対象 | 観点 |
| --- | --- |
| parser / schema | v1 / legacy parse、diagnostics、step type、input type、stepReview、guardrails。 |
| workflowValidator | state 参照、artifact 参照、guardrail 衝突、requiredWhen。 |
| engine | full / singleStep、preflight、command、agent、manual、result、stepReview。 |
| runStateStore | runId 採番、atomic save、load、list、recoverable run。 |
| runControlStore / runPause | request、clear、load、paused 遷移、`workflow.pause` state、`onRunPaused` hook。 |
| runControl commands | run selection、pause refusal、resumePausedRun、inspectRunControl report。 |
| runControlView | TreeItem、contextValue、icon、Status Bar 集計、refresh。 |
| taskSnapshots | save、latest、size truncation、includeMessages、prune、findLatest。 |
| taskSnapshotRecovery | snapshot からの latest assistant text 復旧。 |
| run retention | pure planner、pin sidecar、physical inventory、reference graph、preview/apply digest、trust split、root-first multi-root、manual-only dispatch。 |
| cleanup lease / transaction | owner guard、execution exclusion、heartbeat/release、rollback/purge、quarantine residual、symlink/junction/hard-link/alias拒否。 |
| migration backup | create-once publication、exact bytes、crash-pair preservation、error precedence、all-handle settlement、operator-only recovery。 |
| resultHandoff | latest assistant text、args 互換、validation failure。 |
| BobWorkflowFactory | Bob workflow object と step array の構築。 |
| BobWorkflowMessages | step message、command result、state block の生成。 |
| BobTaskInputs | metadata / message からの input 抽出。 |
| BobWorkflowEngineRunner | full / singleStep、task input 抽出、hooks、manual completion。 |
| authoring | serializer、loader、reference analysis、Webview module。 |
| Template Customization Studio | template metadata からの候補生成、typed input defaults、VCS別 prompt supplement、readiness、backup、workspace/symlink escape 拒否。 |
| 実機 | VS Code / IBM Bob / workspace / Webview / Explorer view / Status Bar を含む結合動作。 |

詳細な単体テスト仕様は `unit-test-spec-ja.md`、実機テスト仕様は `real-machine-test-spec-ja.md` に定義する。

## 22. 変更時の注意点

- `workflowV1Schema` を変更した場合は parser、validator、README、テンプレート、GUI Builder、テストを同期する。
- Template Customization Studio の template metadata、project profile、customization schema を変更した場合は README、基本設計、詳細設計、単体テスト仕様、実機テスト仕様を同期する。
- `WorkflowEngineOptions` または `WorkflowExecutionHooks` を変更した場合は Bob UI 実行系と standalone 実行系を確認する。
- `RunStateStore` の recoverable 判定を変更した場合は singleStep 継続と resume / retry を確認する。
- `RunControlState` を変更した場合は `runControl.ts`、`runPause.ts`、Run Control View、単体テスト、実機テストを更新する。
- `TaskSnapshotPayload` を変更した場合は run diagnostics、snapshot pruning、復帰候補利用を更新する。
- Retention policy、inventory evidence、lease/guard、quarantineを変更した場合はmanual-only/trust/multi-root/privacy契約、operator recovery、Linux/Windows physical-path testsを同期する。
- Migration backup publicationを変更した場合は`dev`/`ino`/`nlink`/bytes/no-alias、primary/cleanup/close優先順位、cross-process crash-pair保全を同期する。
- active step の永続化を検討する場合も、Bob task object や Promise は保存しない。

<!-- REMEDIATION-2026-07-11 -->
## 2026-07-11 横断修正契約

3拡張の横断レビューに基づき、次をリリース契約とする。

- IBM Bob と companion extension は、機能上必須でない場合は soft dependency とし、未導入でも通常 command を起動できること。
- workflow action provider は所有元 source ID を持ち、同一 ID の無警告上書きを禁止する。登録解除用 disposable を返し、extension 停止時に解除する。
- Git / Bazaar 外部プロセスは shell を使わず、hard timeout、出力上限、AbortSignal、子プロセス終了を必須とする。
- Bazaar repository path は POSIX / Windows の絶対 path、drive-relative path、UNC、device path、dot / traversal / control-character segment を拒否する。
- review processing limit は manifest と runtime で同じ最小・既定・最大値を持つ。UTF-8 切り詰め後の suffix を含めても byte 上限を超えないこと。
- repository 内の全 WORKFLOW.md を strict validation し、provider、preflight、nested command ID、template mirror の契約ずれを CI で拒否する。
- Ubuntu と Windows の両方で compile、unit test、VSIX package、package policy を確認する。IBM Bob 実環境の UI / task / MCP は release candidate 実機ゲートで確認する。

## 自動 Pause evaluator と override

`evaluateAutomaticPause()` は `WorkflowRunState`、次 step、注入時計、workflow / workspace policy、optional override を受け取り、`maxRunMinutes`、`maxAgentStepsPerRun`、`pauseAtLocalTime` の決定を返す。local cutoff は timezone-local の日付と時刻を比較し、run が cutoff 日を越えた後に午前0時へ戻っても停止条件を維持する。

engine は manual request を先に処理し、その後に自動制限を評価する。停止時は `workflow-register/automatic-pause/v1` を `state["workflow.pause"]` に保存し、kind、source、checkpoint、nextStepId、limit、observed、detectedAt を記録する。override は `workflow-register/automatic-pause-override/v1` として `control.json` に保存し、期限切れ後は再び制限を評価する。

active lease の heartbeat による `run.lock.json` の原子的置換は、path identity 検査で観測された場合に限り transient contention として再試行する。symlink、junction、workspace escape、所有 token 変更は引き続き拒否する。
