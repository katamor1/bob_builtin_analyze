# Workflow Pause / Resume 現行実装状況

## 方針

workflow-registerは、実行中のagent / command / processを強制停止しない**graceful pause**を正式方式とする。

- manual pause requestを`control.json`へ保存する。
- engineの安全なcheckpointで`paused`へ遷移する。
- in-flight operationは完了を待つ。
- provider cancellation、hard cancel、実行中subagentへのsteering prompt注入は行わない。
- run stateの正本は`run.json`、操作者制御の正本は`control.json`である。

## Bob UI導線

Bob chatへ`Workflow controls` blockを出し、run ID付きの操作情報を表示する。

主なinternal command:

```text
workflowRegister.pauseAfterCurrentStep
workflowRegister.pauseBeforeNextAiCall
workflowRegister.inspectRunControl
workflowRegister.inspectCurrentStep
workflowRegister.openCurrentStepInBuilder
workflowRegister.resumePausedRun
```

これらはworkflow / Bob UI / `Bob 操作ハブ`から呼べるよう登録を維持するが、通常operatorのCommand Palette入口は`workflowRegister.openOperationHub`である。

command URIを直接実行できないBob環境でも、control blockにrun IDと操作名を表示し、`Bob 操作ハブ`から同じrunへ到達できるようにする。

## graceful pause

採用方式:

1. pause requestを保存する。
2. 現在実行中のAI応答またはcommandは完了させる。
3. `before-preflight`、`before-step`、`after-step`、次agent call前などのcheckpointでrequestを確認する。
4. runを`paused`へ更新する。
5. `run.state["workflow.pause"]`へsource、kind、checkpoint、next step、detectedAtを保存する。
6. Bob chat、snapshot、`Bob 操作ハブ`を更新する。

保留・非採用:

- cooperative interrupt prompt
- hard cancel
- provider cancellation token / abort controllerの強制注入
- command step child processの一律kill
- partial agent outputをresultKey / artifact / sinkへ成功として保存すること

## automatic pause

manual requestを先に評価し、その後にworkflow policyとworkspace settingを同じpure evaluatorで評価する。

対応する制限:

- `maxRunMinutes`
- `maxAgentStepsPerRun`
- `pauseAtLocalTime`
- IANA timezone
- 期限付きoverride

`0`または空値は無効を表す。overrideはautomatic limitだけを抑止し、manual requestを無効化しない。期限切れ後は再び制限を評価する。

## Bob 操作ハブ

`Bob 操作ハブ`がpause / resumeの単一operator UIである。

run cardで次を表示・操作する。

- status、current step、updatedAt
- pause requestとautomatic pause provenance
- pause
- resume
- retry
- accept / accept-and-next
- run control inspection
- diagnostics

run mutationはworkspace root、run ID、表示時revisionを再検証し、同じrunへの操作を直列化する。`run.json`と`control.json`のwatcherでpanelを更新する。

独立したrun tree view、Status Bar monitor、manual refresh commandは現行operator surfaceではない。

## snapshot

pause発生時は`paused` reasonのtask snapshotを保存できる。snapshotは`run.json` / `control.json`の代替ではない。

既定ではBob chat messagesを保存しない。pause provenance、run ID、workflow ID、step ID、timestampなどbounded metadataだけを診断へ使う。

## Windows lock heartbeat

`run.lock.json` heartbeatのatomic replacement中に観測する一時的なidentity change、`ENOENT`、`ENOTDIR`は、acquisition timeout内でbounded retryする。

次はtransient扱いしない。

- workspace containment failure
- symlink / junction / alias
- ownership token mismatch
- unsupported schema
- stable malformed recent lock

## verification

- manual requestの保存 / clear
- checkpointでのpaused遷移
- resume後のcontrol clear
- manual request precedence
- automatic limit境界
- timezone / date rollover
- override expiry
- standalone / Bob runnerのpolicy parity
- hub revision check / mutation serialization
- lock heartbeat contention
- Linux / Windows Extension Host smoke
