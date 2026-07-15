# Workflow Run Retention / Cleanup P1-6 Release Evidence

## 1. Scope

| 項目 | 値 |
| --- | --- |
| Repository | `katamor1/bob_builtin_analyze` |
| Component | `extensions/workflow-register` |
| Pull request | #93 |
| Branch | `agent/workflow-run-retention-p1-6-20260713` |
| Merge base | `f35e7e79b3133f639b80aa9e4b3a5b00fe3b09cc` |
| RC head | `fdc0efe8b9c44e7bab10131eb0b070ef6cd91664` |
| Integration decision | **GO for evidence-tail progression**。PR mergeはexact-final-head gate完了まで保留。 |
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
- Final targeted independent review (`12a5d90d..7d6e38d1`): Critical 0 / Important 0 / Minor 0。

### RC contract and error-precedence closure — `4ecdc3ae..fdc0efe8`

- `578a32da`でretention settingの件数契約をterminal run（completed/failed）へ統一し、`312e6846`でoperator-facing文書表現を同じ契約へ揃えた。
- `7bf3bffa`、`a0fd08f6`、`b2412edc`でcleanup transaction、cleanup lease、workflow lockのprimary operation / safety cleanup / handle close優先順位を固定した。
- `c9ac8825`、`8df76a9f`、`96b4665e`でdurability file作成、identity validation、cleanup、closeの全経路をsettleし、operation > identity/safety cleanup > closeを固定した。
- `21265742`、`4d2650d0`でcleanup lease/owner guardの失敗publication rollback、replacement guard、same-token foreign replacement、listing後retargetをfail-closedにした。
- `fdc0efe8`でrun-state temp writeのoperation / temp cleanup / close優先順位を固定した。
- Merge base `f35e7e79..fdc0efe8`の独立quality reviewとsafety/spec reviewはともにCritical 0 / Important 0 / Minor 0。Safety/spec verdictは`SPEC_COMPLIANT`。

## 6. Final local verification record

この節はRC head `fdc0efe8b9c44e7bab10131eb0b070ef6cd91664`で取得した結果です。Local full-suiteは外部Node process 164件の負荷下で完走せず、再抽出で識別したfailureは既存`bobGateLifecycle`の5s/10s observer 3件でした。計画どおり同一headのhosted Linux/Windows unit test成功を正式なfull-suite証拠とします。

| Gate | Final result | Evidence |
| --- | --- | --- |
| RC head SHA | **PASS** | `fdc0efe8b9c44e7bab10131eb0b070ef6cd91664` |
| `npm.cmd run compile` | **PASS** | exit 0。UTC `2026-07-15T20:27:26.3348310Z`–`2026-07-15T20:27:35.0011452Z` |
| Five-file path/migration focus | **PASS** | 117/117 pass、fail 0、cancelled 0 |
| Five-file retention focus | **PASS** | 98/98 pass、fail 0、cancelled 0 |
| `npm.cmd test` | **PASS by exact-head hosted authority** | Local attempt 1: 1084/1085 pass、fail 1、cancelled 0。Attempt 2: 1082/1085 pass、fail 3、cancelled 0（識別したfailureは既存`bobGateLifecycle` observer 3件、external Node process 164件）。Hosted Linux: 1084 pass、fail 0、cancelled 0、skipped 1。Hosted Windows: 1085/1085 pass、fail 0、cancelled 0。 |
| `dependency:policy` | **PASS** | exit 0、3/3 |
| `architecture:policy` | **PASS** | exit 0、216 files |
| `source:policy` | **PASS** | exit 0、216 files |
| `schema:policy` | **PASS** | exit 0、5/5 |
| `unused:report` | **PASS** | exit 0、advisory |
| `audit:prod` | **PASS** | exit 0、production vulnerabilities 0 |
| `package` | **PASS** | exit 0、VSIX生成成功 |
| `package:policy` | **PASS** | 1,032,305 bytes / max 1,200,000 bytes |
| `git diff --check f35e7e79..RC_HEAD` | **PASS** | exit 0 |
| RC worktree | **PASS** | verification完了時clean |

### VSIX artifact

| Field | Value |
| --- | --- |
| File | `workflow-register-0.1.0.vsix` |
| SHA-256 | `5b61c00526f5f9064f011ee500ccd0f0c2a49538dcb82ac7d6be07ff7e0bf4f7` |
| Bytes | 1,032,305 |
| Generated at UTC | `2026-07-15T20:26:31.2539661Z` |
| ZIP entry count | 810 |

## 7. Hosted RC matrix

| Workflow / job | Run ID | Job ID | Result |
| --- | ---: | ---: | --- |
| `extensions-quality` RC | `29447947887` | — | **SUCCESS** |
| Extension source metrics | `29447947887` | `87463009652` | **SUCCESS** |
| Linux `workflow-register` | `29447947887` | `87463009667` | **SUCCESS** |
| Linux `bob-code` | `29447947887` | `87463009671` | **SUCCESS** |
| Windows `bob-bazaar` | `29447947887` | `87463009696` | **SUCCESS** |
| Windows `bob-code` | `29447947887` | `87463009709` | **SUCCESS** |
| Linux `bob-bazaar` | `29447947887` | `87463009719` | **SUCCESS** |
| Windows `workflow-register` | `29447947887` | `87463009758` | **SUCCESS** |
| `workflow-contracts` RC | `29447947919` | `87463008567` | **SUCCESS** |
| `code-consistency-review-scaffold` | — | — | **N/A**。変更pathがfilter対象外。 |

RC matrixはexact RC headでGREENです。Workflow差分は`extensions-quality`の恒久的なsmoke追加だけで、temporary diagnostic/mutation workflowはありません。このevidence fileをevidence-only commitにした後のexact-final-head run IDsは、自己参照commitを避けるためPR本文へ記録し、このfileを再変更しません。

## 8. Review and merge decision

| Gate | Status |
| --- | --- |
| Migration remediation review | `12a5d90d..7d6e38d1` final targeted review: Critical 0 / Important 0 / Minor 0。 |
| Windows portability review | Critical 0 / Important 0 / Minor 0。 |
| Docs/spec review | Initial `12a5d90d` review: C0 / I3 / M2。Fact corrections後のfinal re-review: Critical 0 / Important 0 / Minor 0。 |
| Whole diff `f35e7e79..fdc0efe8` | Quality: Approved C0 / I0 / M0。Safety/spec: `SPEC_COMPLIANT` C0 / I0 / M0。 |
| Temporary diagnostic/mutation workflow absent | **PASS**。恒久的smoke追加以外なし。 |
| RC all 7 `extensions-quality` jobs | **SUCCESS** (`29447947887`) |
| RC `workflow-contracts` | **SUCCESS** (`29447947919`) |
| Evidence-only exact-final-head all 7 `extensions-quality` jobs | **PENDING** |
| Evidence-only exact-final-head `workflow-contracts` | **PENDING** |
| PR #93 squash merge | **PENDING** |

Current integration decision: **GO for RC/evidence-tail progression**。Evidence-only commit後のexact-final-head CI、final review/PR本文更新を完了するまでPR mergeはNO-GOです。Product Release remains NO-GO after merge.

## 9. Deferred Product Release UAT

- 実IBM Bob/Bazaarの代表workflowとretention操作。
- 同一run IDを含むmulti-root分離。
- ReFSのfile identity/link count、Windows AV/indexer contention。
- Cleanup lease/guard/quarantineのoperator recovery。
- Migration crash pairのoperator-only recovery。
- Signed VSIX、配布、upgrade、rollback。
- P2-1 Dry Run、P1-7 layer policy。
