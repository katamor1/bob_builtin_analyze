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
.bob/workflows/runs/.cleanup-leases/<runId>.json
```

- cleanup applyは候補runのleaseをrun ID順にexclusive createする
- normal workflow executionはrun lock取得前にcleanup leaseを確認し、存在中は待機／busy errorにする
- cleanupはlease取得後に`run.lock.json`、journal、revision、physical directoryを再確認する
- cleanup終了時はsuccess／failureを問わず所有token一致でleaseを解放する

## Quarantine transaction

```text
plan digest検証
→ 最新inventory再取得
→ 同policyでplan再計算
→ digest一致
→ cleanup lease取得
→ lock／journal／revision／path再確認
→ 全候補を.cleanup-quarantine/<transactionId>/へrename
→ 全rename成功後にquarantine削除
```

途中rename失敗時は移動済みdirectoryを逆順で元へ戻す。Rollbackも失敗した場合はquarantineを保全し、複合errorを返す。

## Commands

- `workflowRegister.inspectRunStorage`
- `workflowRegister.previewRunCleanup`
- `workflowRegister.cleanupCompletedRuns`
- `workflowRegister.deleteSelectedRuns`
- `workflowRegister.pinRun`
- `workflowRegister.unpinRun`

PreviewはMarkdownのみ。Applyは同じplannerで再previewし、modal confirmation後に実行する。初期設定ではautomatic cleanupを無効にし、P1-6ではtimer／startup deletionを実装しない。

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

## Compatibility

- run-state schema変更なし
- existing run directoryはそのまま読める
- `retention.json`なしはunpinned
- command IDs以外の既存public APIを変更しない

## External UAT

Large real workspaces、Windows antivirus／indexer rename contention、multi-root duplicate run IDs、実IBM Bob／Bazaar、signed VSIX installation／rollbackは外部release gateとする。
