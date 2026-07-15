# Workflow Run Retention / Cleanup P1-6 Release Evidence

## 1. Scope

| 項目 | 値 |
| --- | --- |
| Repository | `katamor1/bob_builtin_analyze` |
| Component | `extensions/workflow-register` |
| Pull request | #93 |
| Branch | `agent/workflow-run-retention-p1-6-20260713` |
| Merge base | `f35e7e79b3133f639b80aa9e4b3a5b00fe3b09cc` |
| Latest migration implementation checkpoint | `7d6e38d1`。RC headはTask 5で確定する。 |
| Integration decision | **NO-GO until RC/final-head gates are recorded below** |
| Product Release decision | **NO-GO** |

P1-6は、保存済みworkflow runの件数/容量をread-onlyで確認し、operatorが明示確認したterminal runだけをpreview-first、reference-aware、pin-aware、transaction-safeに整理します。

## 2. Delivered behavior

- `run.json`を正本とするpure deterministic cleanup planner。
- `retention.json` sidecarによるpin/unpin。Malformed/future sidecarはfail-safeでpinned扱い。
- Age、terminal run count（completed/failed）、total bytes、selected run IDによるpolicy。
- Active/recoverable/referenced/pinned/read-only/locked/journaled/physical-unsafe runの保護。
- Bounded physical inventory、directory identity、tree fingerprint、reference-graph completeness、revision/digest binding。
- Cleanup leaseとexecution lockの相互排他。
- Owner guard付きcleanup ownershipとheartbeat。
- Quarantine rename、逆順rollback、typed incomplete error、residual quarantine保全。
- Root-first multi-root選択。Root間で同一run IDを混同しない。
- 6つのmanual commandと4設定。Startup/timerによる自動cleanupなし。
- Inspect/previewはuntrusted workspaceでもread-only。Cleanup/delete/pin/unpinはtrust必須。
- Preview、diagnostics、evidenceはmetadata-only。
- `run.json` schema、新しいruntime dependency、追加の永続本文schemaは変更なし。

## 3. Public contract

### Commands

```text
workflowRegister.inspectRunStorage
workflowRegister.previewRunCleanup
workflowRegister.cleanupCompletedRuns
workflowRegister.deleteSelectedRuns
workflowRegister.pinRun
workflowRegister.unpinRun
```

### Settings

```json
{
  "workflowRegister.runs.retention.enabled": false,
  "workflowRegister.runs.retention.completedDays": 30,
  "workflowRegister.runs.retention.maxCompletedRuns": 100,
  "workflowRegister.runs.retention.maxTotalBytes": 524288000
}
```

`enabled=false`は将来自動化用の予約値です。現在の手動コマンドはこの値に関係なく利用できます。

### Operational paths

```text
.bob/workflows/run-cleanup-leases/<runId>.json
.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json
.bob/workflows/run-cleanup-quarantine/<txId>/<runId>
.bob/workflows/runs/<runId>/run-state-v0.backup.json
.bob/workflows/runs/.<runId>.<pid>.<uuid>.tmp
```

Owner guardの通常解放順はlease JSON、`owner.json`、guard directoryです。Cross-process migration crash pairは自動回復せず、operator-only recoveryとします。詳細は`extensions/workflow-register/docs/workflow-run-retention-ja.md`を正本とします。

## 4. Safety invariants

- Cleanup applyはfresh inventoryから同一policyで再計算し、plan digestとrun/retention/physical evidenceを再検証する。
- Protected runを明示選択してもplannerを迂回しない。
- Cooperative executionはcleanup lease中に開始できない。
- Symlink、junction、workspace escape、hard link、identity changeをfail-closedにする。
- Rollback/purgeを完了できない場合はquarantineを保全し、成功扱いにしない。
- Orphan owner guardを自動reclaimしない。
- Migration crash pairはtemp/backupの`dev`、`ino`、`nlink`、bytes、no-alias、publisher停止をoperatorが証明するまで両linkを保全する。
- Task、artifact、snapshot、state、Bob message本文をreport/evidenceへ含めない。
- `workflowRegister.runs.retention.enabled`からstartup/timer dispatchを行わない。

## 5. Remediation checkpoints

### Windows path portability — `31e09ee9`

- Windows CI run `29418749291`の21 failureをjunction-backed lexical TEMPで決定的に再現。
- Cleanup transaction 18、namespaced durability 1、run-lock root binding 2へ分類。
- Test hookをphysical parent identity + leaf matchingへ統一。Production code変更なし。
- Compile: PASS。
- Alias fixture: 71/71 PASS。
- Five-file focused suite: 100/100 PASS、fail 0、cancelled 0。
- Independent spec/quality review: Critical 0 / Important 0 / Minor 0。

### Migration publication precedence — `9df3ddec` / `7d6e38d1`

- 最初のreview intake: Critical 0 / Important 2 / Minor 0。
- Successful `fs.link`直後にownershipを記録し、以降のmetadata/byte failureでowner-handle-checked rollbackを実行。
- Error priorityをoperation/identity、byte/domain safety、cleanup `rm`、verification/cleanup handle close、owner closeの順に固定。
- Verification close + rollback `rm`、EEXIST cleanup-handle close、post-link metadata EIOの実file regressionを追加。
- 後続reviewで、EEXIST/raced-existing matching-backupのdirect-reader close-only errorがowned-temp cleanup `rm`をmaskするImportant 1件を検出。`7d6e38d1`でdirect readのexact-byte validationとclose-only outcomeを分離し、cleanup `rm`を優先する2 regressionを追加。
- Compile: PASS。
- Migration test file: 34/34 PASS、fail 0、cancelled 0。
- Durability metadata budget: 1/1 PASS、`read=100`、`replace=298`。
- Final targeted independent review (`12a5d90d..7d6e38d1`): Critical 0 / Important 0 / Minor 0。Coordinatorのwhole-diff gateはTask 6で別途記録する。

## 6. Final local verification record

この節の`PENDING`は、文書checkpoint時点で未実施のTask 5を明示する欄です。成功値やrun IDを推測して記入してはいけません。

| Gate | Final result | Evidence |
| --- | --- | --- |
| RC head SHA | **PENDING** | Code + operator docs確定後に記入 |
| `npm.cmd run compile` | **PENDING** | exit code / UTC |
| Five-file path/migration focus | **PENDING** | pass/fail/cancelled |
| Five-file retention focus | **PENDING** | pass/fail/cancelled |
| `npm.cmd test` | **PENDING** | pass/fail/cancelled、またはexact-head hosted authority |
| `dependency:policy` | **PENDING** | exit code |
| `architecture:policy` | **PENDING** | exit code |
| `source:policy` | **PENDING** | exit code |
| `schema:policy` | **PENDING** | exit code |
| `unused:report` | **PENDING** | exit code / advisory |
| `audit:prod` | **PENDING** | exit code / advisory |
| `package` | **PENDING** | exit code |
| `package:policy` | **PENDING** | max `1200000` bytes |
| `git diff --check f35e7e79..RC_HEAD` | **PENDING** | exit code |
| RC worktree | **PENDING** | clean status |

### VSIX artifact

| Field | Value |
| --- | --- |
| File | **PENDING** |
| SHA-256 | **PENDING** |
| Bytes | **PENDING** |
| Generated at UTC | **PENDING** |
| ZIP entry count | **PENDING** |

## 7. Hosted RC matrix

| Workflow / job | Run ID | Job ID | Result |
| --- | ---: | ---: | --- |
| `extensions-quality` RC | **PENDING** | — | **PENDING** |
| Linux `workflow-register` | — | **PENDING** | **PENDING** |
| Windows `workflow-register` | — | **PENDING** | **PENDING** |
| Linux/Windows other extension jobs | — | **PENDING** | **PENDING** |
| Extension source metrics | — | **PENDING** | **PENDING** |
| `workflow-contracts` RC | **PENDING** | — | **PENDING** |
| `code-consistency-review-scaffold` | — | — | **PENDING path applicability** |

RC matrixがGREENになった後、このevidence fileへRC run IDs、local final results、VSIX artifact、review resultを記録してevidence-only commitを作ります。そのcommit後のexact-final-head run IDsは自己参照commitを避けるためPR本文へ記録し、このfileを再変更しません。

## 8. Review and merge decision

| Gate | Status |
| --- | --- |
| Migration remediation review | `12a5d90d..7d6e38d1` final targeted review: Critical 0 / Important 0 / Minor 0。 |
| Windows portability review | Critical 0 / Important 0 / Minor 0。 |
| Docs/spec review | Initial `12a5d90d` review: C0 / I3 / M2。Fact corrections applied; re-review **PENDING**。 |
| Whole diff `f35e7e79..final-head` | **PENDING** |
| Temporary diagnostic/mutation workflow absent | **PENDING final diff check** |
| Exact-final-head all 7 `extensions-quality` jobs | **PENDING** |
| Exact-final-head `workflow-contracts` | **PENDING** |
| PR #93 squash merge | **PENDING** |

Current integration decision: **NO-GO** until every pending final gate is closed. After exact-final-head CI and whole-diff review are GREEN, integration may become GO. Product Release remains NO-GO after merge.

## 9. Deferred Product Release UAT

- 実IBM Bob/Bazaarの代表workflowとretention操作。
- 同一run IDを含むmulti-root分離。
- ReFSのfile identity/link count、Windows AV/indexer contention。
- Cleanup lease/guard/quarantineのoperator recovery。
- Migration crash pairのoperator-only recovery。
- Signed VSIX、配布、upgrade、rollback。
- P2-1 Dry Run、P1-7 layer policy。
