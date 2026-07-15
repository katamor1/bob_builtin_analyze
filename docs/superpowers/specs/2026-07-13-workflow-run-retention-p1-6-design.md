# Workflow Run Retention / Cleanup P1-6 Design

## Goal

Persisted workflow runの件数と容量をread-only previewで可視化し、operatorが明示確認したterminal runだけを安全に整理する。Active／recoverable／参照元／pinned／read-only／locked／journaled／物理包含不明runは削除しない。

## Authoritative data

- `.bob/workflows/runs/<runId>/run.json`: run status、updatedAt、provenance、schema version
- `retention.json`: operator pin sidecar
- `run.lock.json`: execution lease
- `run-state.journal.json`: interrupted durability transaction
- run directory tree: physical byte usage

`run.json` schemaは変更しない。Retention metadataはrun directory内の独立sidecarとする。

## Pure planner

`src/core/retention/runRetention.ts`にpure deterministic plannerを置く。

```ts
planWorkflowRunCleanup(inventory, policy): WorkflowRunCleanupPlan
verifyWorkflowRunCleanupPlan(plan): boolean
```

Plan schema:

```text
workflow-register/run-cleanup-plan/v1
```

Policy criteria:

- `completedDays`
- `maxCompletedRuns`
- `maxTotalBytes`
- explicit `selectedRunIds`

Outputにはrunごとの`keep/delete`、reason、blocker、revision、bytesとstable SHA-256 digestを含める。Input順に依存しない。

## Protected runs

必ず保持する。

- `running`、`paused`、`checkpoint`、`reviewing`、`held`
- recoverable run
- artifact reuse／hydration／task-snapshot importから参照されるsource run
- pinned run
- future／read-only run state
- pending journalあり
- execution lockあり
- direct physical directoryでないrun
- symlink／junction／workspace escapeを含むrun
- terminalでない未知status

## Pin metadata

```json
{
  "schemaVersion": "workflow-register/run-retention/v1",
  "pinned": true,
  "updatedAt": "2026-07-13T05:00:00.000Z",
  "note": "Keep for audit"
}
```

Noteは任意、最大256文字、制御文字不可。Malformed／future sidecarはfail-safeでpinnedとして扱う。

## Cleanup lease

Execution lockだけの事後確認ではTOCTOUが残るため、cleanup専用のcross-process leaseを追加する。

```text
.bob/workflows/run-cleanup-leases/<runId>.json
.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json
```

- cleanup applyは候補runのowner guardをrun ID順にatomic `mkdir`し、同じowner tokenのlease JSONをexclusive createする
- normal workflow executionはrun lock取得前にcleanup leaseを確認し、存在中は待機／busy errorにする
- cleanupはlease取得後に`run.lock.json`、journal、revision、physical directoryを再確認する
- cleanup終了時はsuccess／failureを問わず、acquisition時に保持したguard directory identityと、現在のdirect single-linked `owner.json`からdecodeしたrun ID／所有tokenを再検証し、lease JSON、`owner.json`、空guard directoryの順で解放する。`owner.json`のreadはdirect regular file、`nlink=1`、containment/no-alias、path/handle identityを検査するが、acquisition時のowner bytesまたはowner-file identityをlifetime全体へ固定する契約ではない
- new-protocol orphan guardは自動reclaimしない。手動復旧は全writer停止、direct contained path、`dev`／`ino`／`nlink=1`、owner/lease token/bytes、heartbeat停止を確認した後、同じ解放順を再現する

## Quarantine transaction

```text
plan digest検証
→ 最新inventory再取得
→ 同policyでplan再計算
→ digest一致
→ cleanup lease取得
→ lock／journal／revision／path再確認
→ 全候補を.bob/workflows/run-cleanup-quarantine/<transactionId>/へrename
→ 全rename成功後にquarantine削除
```

Quarantineの正確なentry pathは`.bob/workflows/run-cleanup-quarantine/<transactionId>/<runId>`である。途中rename失敗時は移動済みdirectoryを逆順で元へ戻す。Rollback、purge、parent cleanupが失敗した場合は`phase`、`committedRunIds`、`residualRunIds`、`retainedQuarantinePath`を含むtyped errorを返し、quarantineを保全する。Operatorはsource/targetの存在とidentityを1件ずつ照合し、rollback phaseは逆順restore、purge phaseは既purgeとresidualを区別し、空になったtransaction/base directoryだけを内側から削除する。

## Commands

- `workflowRegister.inspectRunStorage`
- `workflowRegister.previewRunCleanup`
- `workflowRegister.cleanupCompletedRuns`
- `workflowRegister.deleteSelectedRuns`
- `workflowRegister.pinRun`
- `workflowRegister.unpinRun`

PreviewはMarkdownのみ。Applyは同じplannerで再previewし、modal confirmation後に実行する。初期設定ではautomatic cleanupを無効にし、P1-6ではtimer／startup deletionを実装しない。

Inspect/previewはuntrusted workspaceでもread-onlyとする。Cleanup/delete/pin/unpinはworkspace root discovery、run selection、service construction、filesystem accessより前にtrustを要求する。Multi-rootではroot selectionをrun selectionより先に行い、同じrun IDを別root間で混同しない。

## Settings

```json
{
  "workflowRegister.runs.retention.enabled": false,
  "workflowRegister.runs.retention.completedDays": 30,
  "workflowRegister.runs.retention.maxCompletedRuns": 100,
  "workflowRegister.runs.retention.maxTotalBytes": 524288000
}
```

`enabled`は将来のautomatic cleanup opt-in用であり、このphaseのcommand apply可否には使わない。Automatic deletionは実装しない。

## Security and privacy

- run IDとpathは既存safe-run-ID／physical containment契約に従う
- symlink／junctionをfollowしない
- previewとevidenceへinput／state／artifact／snapshot／Bob message本文を出さない
- plan applyはdigestとrun revisionの両方を検証する
- no new runtime dependency
- cross-process migration crash pairは自動回復しない。Operatorがexactly one `.<runId>.<pid>.<uuid>.tmp`と`<runId>/run-state-v0.backup.json`についてdirect contained/no-alias、同一`dev`/`ino`、双方`nlink=2`、exact historical bytes、publisher停止を証明した場合だけtemp linkを外し、backupの同一identity、`nlink=1`、exact bytesを再確認する

## Compatibility

- run-state schema変更なし
- existing run directoryはそのまま読める
- `retention.json`なしはunpinned
- command IDs以外の既存public APIを変更しない

## External UAT

Large real workspaces、Windows antivirus／indexer rename contention、multi-root duplicate run IDs、実IBM Bob／Bazaar、signed VSIX installation／rollbackは外部release gateとする。

ReFSのfile identity/link-count、cleanup lease/owner guard/quarantineのmanual recovery、migration crash-pair operator recovery、distribution/upgrade/rollbackもProduct ReleaseのNO-GO条件とする。Main mergeはintegration GOでありProduct Release承認ではない。P2-1 Dry RunとP1-7 layer policyは次期目標として分離する。
