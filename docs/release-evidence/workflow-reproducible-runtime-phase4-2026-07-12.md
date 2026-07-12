# Workflow Reproducible Runtime Phase 4 証跡

## 1. 判定

| 項目 | 値 |
| --- | --- |
| 実施日 | 2026-07-12 |
| Repository | `katamor1/bob_builtin_analyze` |
| Component | `extensions/workflow-register` |
| Original Phase 4 code head | `cf326016f60ca39fa74bc5f16acc0e022781b97e` |
| Main integration head | `ac1aa3943e60673583c1a2a6f7851b421f6e84dd` |
| Hardening branch | `agent/workflow-reproducible-runtime-phase4-20260712` |
| Hardening status | journal ancestry、read-only diagnostic、control契約を修正 |
| Latest isolated verification | strict TypeScript compile PASS、journal 13/13 PASS |
| GitHub-hosted runner | **復旧済み — checkout以降のstep開始を確認** |
| Final hardening CI | 新しいmain向けDraft PRで実施 |
| Merge / Release | **NO-GO（hardening branchのfull gate待ち）** |

Phase 4 coreは`main`へ取り込まれている。現在のbranchは、最終レビューで見つかったjournal ancestry、future read-only diagnostic、`control.json`契約のhardening deltaとoperator文書を追加する。

## 2. Phase contract

| Phase | 実装 |
| --- | --- |
| Phase 1 | `run.json` schema v1、historical migration、future read-only protection |
| Phase 2 | full-snapshot hash-chained `events.ndjson` |
| Phase 3 | `run-state.journal.json`、crash recovery、file/directory fsync |
| Phase 4 | `run.lock.json`、heartbeat/stale recovery、full-operation lease、optimistic revision CAS |

`run.json`はPhase 4でもmaterialized current stateである。event logはimmutable evidenceであり、通常loadをevent replayへ全面移行してはいない。

## 3. Persisted files

```text
.bob/workflows/runs/<runId>/
  run.json
  control.json
  events.ndjson
  run-state.journal.json
  run.lock.json
  run-state-v0.backup.json
```

Current schema:

```text
workflow-register/run-state/v1
workflow-register/run-event/v1
workflow-register/run-journal/v1
workflow-register/run-lock/v1
```

## 4. Main-integrated core

### Immutable events

- sequenceとevent ID
- full `WorkflowRunState` snapshot
- exact formatted `run.json` hash
- previous event hash
- previous run hash
- event hash
- duplicate ID、truncated line、blank line、future schema、tamperingの拒否
- direct contained append-only fileとfsync

### Crash journal

Commit order:

```text
journal → fsync → run.json → fsync → event append → fsync → journal remove → fsync
```

Recoveryは、materialized runとevent headがpreviousまたはnext evidenceのどちらに一致するかで決定し、conflict時は証跡を保存する。

### Cross-process lease

- exclusive create
- physical workspace root + run ID identity
- same-chain reentrancy
- heartbeat
- bounded wait
- live same-host PID protection
- dead same-host PID recovery
- stale foreign-host recovery
- malformed recent lock protection
- ownership token付きrelease

### Stale-write prevention

load時のexact `run.json` hashをprocess-local `WeakMap`へ関連付ける。save前にcurrent hashと比較し、不一致ならjournal作成前に拒否する。

## 5. Final hardening findings

### 5.1 Journal ancestry was under-constrained

旧parserは次を個別に検証していた。

- journal `previousEventHash`とnext event `previousEventHash`
- `nextRunHash`とnext event `runHash`
- next event snapshotと`nextRunHash`

ただしnext eventの`previousRunHash`をjournalの`previousRunHash`へ結び付けず、first/subsequent eventのsequence条件もparserで固定していなかった。

#### Regression-first change

Test commit:

```text
18e4ca9770733274dac008927366bbebb89fb6ac
```

追加した要求:

- `nextEvent.previousRunHash === journal.previousRunHash`
- previous eventなしならsequence 1
- previous eventありならfirst sequenceを許可しない
- recovery append時は実event headの`sequence + 1`と一致

#### Production change

Final journal hardening commits:

```text
7c71369b... initial ancestry binding
f65859a4f255431ae18ac0d26f5baf778bdacec8 diagnostic-order hardening
```

具体的には、`validateJournalEvent()`へjournal previous-run hashを渡し、exact equalityを確認する。recovery時は実event log headからexpected sequenceを計算する。

### 5.2 Read-only diagnostic could be overwritten

future runをloadすると`read-only` warningになるが、旧`saveRun()`はwrite rejectionをcatchし、generic durability failureとして`invalid`へ置換する経路があった。

#### Regression-first change

Test commit:

```text
718f97c9dd69f2c2f1e0930cd1e178c2e607a369
```

future save拒否直後に`getLoadDiagnostics()`を確認し、既存`read-only` warningが維持されることを要求した。

#### Production change

Commit:

```text
42128cca9c3bd8700f6b23f4e42b26d9faa4d47e
```

`assertWorkflowRunStateWritable(run)`をdurability failure catchより前に実行する。期待されたread-only boundaryはload failureとして再分類しない。

### 5.3 `control.json` contract mismatch

旧design/planはcontrol mutationもexecution leaseを取得すると記載していた。しかし、その契約では長時間provider/agent call中にpause requestを記録できない。

実装契約を次へ確定した。

| Data | Concurrency contract |
| --- | --- |
| `run.json` | full-operation cross-process lease + journal + event + revision CAS |
| `control.json` | execution leaseと独立したoperator signal、atomic replacement + identity CAS + fsync |

future-version runはcontrol mutation不可。current runでは、execution lease中でもpause requestを記録できる。

Design correction commit:

```text
f9c3eb81f43c403d3a4c09aa4edbd069b80b5bc8
```

Operator guide:

```text
extensions/workflow-register/docs/reproducible-runtime-phase4-ja.md
```

## 6. TDD and isolated verification

### 6.1 RED observation

GitHub-hosted runnerが利用不能だった期間は、test-only commitsを作成してもrunner stepが開始されず、REDをGitHub上で観測できなかった。hardeningでは変更前sourceを隔離harnessへ配置し、新regressionが旧実装を拒否することを確認した。

確認したfailure:

```text
journal previousRunHash mismatch was accepted
journal event ancestry sequence mismatch was accepted
future save rejection replaced read-only diagnostic
```

### 6.2 Fresh isolated GREEN

変更したjournal moduleとupdated testを同内容で隔離strict TypeScript projectへ配置した。

```text
TypeScript strict compile: PASS
workflowRunJournal.test.js: 13 passed / 0 failed / 0 skipped
```

対象:

1. journal schema/run/hash agreement
2. journal previous-run ancestry binding
3. first/subsequent sequence binding
4. crash after journal write
5. crash after run replacement
6. crash after event append
7. idempotent second recovery
8. materialized-run conflict preservation
9. event-head conflict preservation

### 6.3 Isolated verification limitations

隔離harnessは次の代替ではない。

- repository full TypeScript graph
- full `workflow-register` test suite
- real `runDurabilityPath` symlink/junction behaviorの全platform確認
- VS Code Extension Host
- policy/package/VSIX gates
- independent whole-diff review

## 7. GitHub-hosted runner restoration

2026-07-12の再実行で、従来の`steps: null` / `logs_url: null`状態は解消した。

確認できたstep:

- Checkout
- Setup Node.js
- npm install
- dependency / architecture / source / schema policies
- unit tests
- package / VSIX policy
- Extension Host smoke

したがって、Actions利用枠・billing・runner割当の外部blockerは現在の主blockerではない。

既存PRの再実行ではLinux jobsのgreenと、Windowsで再現する既存test failureの両方が得られた。これはrunner failureではなく、実test結果として扱う。

hardening deltaの最終判定は、main向けDraft PRで生成されるfresh runに基づく。

## 8. CI cleanup

巨大TAP logを切り分けるため、PR #70/#71 branchへ一時diagnostic workflowを追加したが、両PRはその前にmerge済みだった。branch refsはmerge時のoriginal headへ戻し、一時変更をmainへ含めていない。

## 9. Required final gates

次を同じhardening headで完了する。

```text
npm.cmd run compile
node --test \
  test/workflowRunEventLog.test.js \
  test/workflowRunDurabilityPath.test.js \
  test/workflowRunJournal.test.js \
  test/workflowRunLock.test.js \
  test/workflowRunDurableStore.test.js \
  test/workflowRunCrossProcessCas.test.js \
  test/workflowRunControlConcurrentPause.test.js \
  test/workflowCheckpointLease.test.js \
  test/workflowRunDurabilityDiagnostics.test.js \
  test/workflowRunState*.test.js \
  test/workflowRunExecutionCoordinator.test.js \
  test/runControlStorePathBoundary.test.js

npm.cmd test
npm.cmd run dependency:policy
npm.cmd run architecture:policy
npm.cmd run source:policy
npm.cmd run schema:policy
npm.cmd run unused:report
npm.cmd run audit:prod
npm.cmd run package
npm.cmd run package:policy
git diff --check
```

さらに次を要求する。

- Ubuntu workflow-register green
- Windows workflow-register green
- package / VSIX policy green
- Extension Host smoke green
- focused independent diff reviewでCritical 0 / Important 0

## 10. Residual risks

- arbitrary external provider side effectはjournal rollback対象外
- hardware/OS crash後のstorage guaranteeはfilesystem/deviceに依存
- directory fsync非対応platformでは対応errorだけを許容
- same-user TOCTOUを完全なkernel transactionにはしていない
- event compaction/retentionは未実装
- complete event-sourced runtimeへの移行は未実装
- AI timeout/cancel/token budget/model provenanceは後続phase

## 11. Current release decision

Phase 4 coreとhardening codeは実装済みである。しかし、hardening deltaのfresh repository full suite、Windows、package、Extension Host、independent reviewが同一headで完了するまで、Merge / Releaseは**NO-GO**とする。
