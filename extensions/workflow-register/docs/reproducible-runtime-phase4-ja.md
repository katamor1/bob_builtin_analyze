# Reproducible Runtime Phase 4 運用ガイド

## 1. 目的

この文書は、`workflow-register` が Phase 4 までに追加した run 永続化・復旧・排他制御の運用契約を説明します。

対象となる機構は次のとおりです。

- `run.json` schema version と historical migration
- immutable event log
- crash recovery journal
- file / directory durability barrier
- cross-process run lease
- stale-write detection
- Run Diagnostics による証跡確認

`run.json` は Phase 4 でも現在状態の materialized source of truth です。`events.ndjson` は監査・整合検証・復旧証跡であり、現時点では event replay だけで通常実行状態を再構築する設計ではありません。

## 2. Run directory

各 run は次のdirectoryを使用します。

```text
.bob/workflows/runs/<runId>/
  run.json
  control.json
  events.ndjson
  run-state.journal.json
  run.lock.json
  run-state-v0.backup.json
```

| File | 役割 | 正常終了後 |
| --- | --- | --- |
| `run.json` | 現在の実行状態 | 残る |
| `control.json` | pause / resume operator signal | 必要に応じて残る |
| `events.ndjson` | hash-chain付きimmutable snapshot event | 残る |
| `run-state.journal.json` | `run.json`とeventをまたぐcommitの復旧情報 | 消える |
| `run.lock.json` | 同一runのcross-process execution lease | 消える |
| `run-state-v0.backup.json` | unversioned v0 migration前のexact bytes | 残る |

`run-state.journal.json`または`run.lock.json`が残っている場合、直前processが正常終了しなかった可能性があります。手動削除する前にRun Diagnosticsを確認してください。

## 3. Persisted schema

### 3.1 Run state

Current writable schema:

```text
workflow-register/run-state/v1
```

| `schemaVersion` | 動作 |
| --- | --- |
| 省略 | historical v0としてbackup付きmigration |
| `workflow-register/run-state/v1` | current / writable |
| `workflow-register/run-state/v2`以降 | inspectable / read-only |
| foreign・malformed・non-string | invalidとして隔離 |

future-version runは一覧・診断で確認できますが、save、resume、retry、checkpoint操作、artifact reuse、control mutationの対象にはなりません。

### 3.2 Event

Current event schema:

```text
workflow-register/run-event/v1
```

各lineはfull run snapshotを持ち、次を検証できます。

- sequence
- event ID uniqueness
- run ID
- previous event hash
- previous run hash
- current run hash
- snapshot schema
- event自身のhash

`events.ndjson`は最終newlineを必要とします。truncated line、blank line、sequence gap、hash不一致、future event schemaはmutationをfail closedにします。

### 3.3 Journal

Current journal schema:

```text
workflow-register/run-journal/v1
```

journalは次を1 transactionとして結び付けます。

- previous `run.json` hash
- next `run.json` hash
- previous event head
- next event
- next run snapshot

next eventの`previousRunHash`はjournalの`previousRunHash`と一致しなければなりません。また、event headがない場合はsequence 1、既存headがある場合はその次のsequenceでなければなりません。

### 3.4 Lease

Current lease schema:

```text
workflow-register/run-lock/v1
```

leaseは次のownership情報を持ちます。

- random token
- PID
- hostname
- created timestamp
- heartbeat timestamp

同じphysical workspace rootとrun IDに対し、同時に1つのexecution ownerだけが入れます。

## 4. Commit order

`run.json` mutationはexecution lease内で次の順序を使います。

```text
1. 既存journalを復旧
2. caller revisionを検証
3. next run / next eventを構築
4. journalをatomic replace
5. journalとdirectoryをfsync
6. run.jsonをatomic replace
7. run.jsonとdirectoryをfsync
8. eventをappend
9. event fileとdirectoryをfsync
10. journalをexpected-bytes付きで削除
11. directoryをfsync
```

caller objectの`schemaVersion`と`updatedAt`はcommit成功後にだけ更新されます。

## 5. Crash recovery

有効なjournalが見つかった場合、load前にleaseを取得して次を判定します。

### 5.1 `run.json`

- current hashが`previousRunHash`ならnext snapshotを書きます。
- current hashが`nextRunHash`なら書き直しません。
- どちらでもなければconflictとして停止します。

### 5.2 Event log

- headが`previousEventHash`なら、expected next sequenceを確認してnext eventをappendします。
- headがすでに`nextEvent.hash`ならappendしません。
- どちらでもなければconflictとして停止します。

### 5.3 Cleanup

`run.json`とevent headの両方がnext stateと一致した後だけjournalを削除します。

conflict時はjournal、run、event evidenceを自動削除しません。別のwriterまたは手動変更が介入した可能性があるためです。

## 6. Cross-process lease

### 6.1 通常取得

`run.lock.json`をexclusive createします。同一async execution chainの再入は、同じownerとして処理されます。

他processがlockを保持している場合はbounded polling後にstable busy errorになります。

### 6.2 Heartbeat

長時間のprovider / agent実行中はheartbeatを更新します。heartbeat更新とreleaseはownership tokenを再確認します。古いownerは、新ownerのlockを削除できません。

### 6.3 Stale recovery

| 状態 | 回収 |
| --- | --- |
| 同一host・live PID | 回収しない |
| 同一host・dead PID | identity再検証後に回収 |
| foreign host | heartbeatがstale intervalを超えた場合だけ回収 |
| malformed recent lock | 回収しない |
| malformed stale lock | mtimeとidentity再検証後に回収 |

回収した事実は`lock-reclaimed` diagnosticとして残ります。

## 7. Stale-write protection

loadしたrun objectには、読み込んだexact `run.json` bytesのSHA-256をprocess-localで関連付けます。

save直前にcurrent bytesを再読し、revisionが変わっていた場合はjournal作成前に拒否します。

```text
Workflow run '<runId>' changed since it was loaded;
stale revision cannot be written.
```

新規run objectは「fileがまだ存在しない」ことをexpected revisionとして持ちます。

## 8. `control.json`はexecution leaseと分離する

`control.json`は`run.json` transactionの一部ではなく、operatorが次のsafe checkpointへpause signalを送る独立contractです。

そのため、`requestPause()`、`clearPause()`、`recordResumeNote()`はexecution leaseを取得しません。

代わりに次を行います。

1. 対象runがcurrent writable schemaであることを確認
2. direct / contained pathを確認
3. destination identityを比較
4. unique temp fileからatomic replace
5. fileとrun directoryをfsync

これにより、長時間のprovider / agent callがexecution leaseを保持していても、利用者はpause requestを記録できます。engineは次のstepまたはAI call前のsafe checkpointでsignalを消費します。

同時control writeでは、最後に正常commitしたsignalが現在値です。future-version runへはcontrolを書きません。

## 9. Run Diagnostics

Run Diagnosticsは次を表示します。

```text
Run durability:
- immutable events: <count>
- event head: <sha256 | none>
- journal: none | pending
- execution lease: none | present
```

主なdiagnostic code:

| Code | 意味 |
| --- | --- |
| `migrated` | historical runをv1へmigrationした |
| `read-only` | future run-stateをinspection専用でloadした |
| `event-log-invalid` | event chainまたはevent documentが不正 |
| `journal-recovered` | interrupted transactionを復旧した |
| `journal-conflict` | journalとrun/event evidenceが競合 |
| `lock-reclaimed` | stale/dead owner lockを回収した |
| `lock-busy` | 他processがrunを所有中 |
| `stale-write` | load後に別writerがrunを更新した |
| `invalid` | その他のinvalid run document / I/O failure |

Diagnosticsはstate value、prompt、provider payload、artifact本文を表示しません。

## 10. Troubleshooting

### `busy or locked by another process`

- 別VS Code windowまたはExtension Hostが同じrunを実行していないか確認します。
- live ownerがいる場合、lockを手動削除しません。
- owner processが終了している場合は、次回取得時のstale/dead-owner recoveryを確認します。

### `stale revision cannot be written`

- UIとrun一覧をrefreshします。
- 古いrun objectを再利用せず、`run.json`を再loadして操作をやり直します。
- `run.json`を手動上書きしません。

### `journal materialized run hash conflict`

- `run-state.journal.json`、`run.json`、`events.ndjson`を保存します。
- Run Diagnosticsを採取します。
- 3ファイルのhashとevent headを比較するまでjournalを削除しません。

### `event log head does not match the materialized run revision`

- event logと`run.json`のどちらかに外部変更またはpartial copyがないか確認します。
- 自動的に空event logへ置き換えません。

## 11. Evidence collection

問題報告時は、機密内容を除外したうえで次を記録します。

- extension version
- OS / Node.js / VS Code version
- run ID
- `run.json.schemaVersion`
- event countとhead hash
- journal有無
- lock有無とhostname/PID/heartbeat age
- Run Diagnostics全文
- 実行したcommandとerror family

`run.json`、snapshot、artifact本文には業務情報が含まれる可能性があります。原文添付が不要な場合はhashとdiagnosticだけを共有してください。

## 12. 明示的な非対象

Phase 4は次を保証しません。

- providerが外部systemへ行った任意の副作用のrollback
- distributed consensus
- machine crash後のhardware-level storage guarantee
- event-log compaction / retention
- AI timeout / cooperative cancellation / token budget
- `run.json`を廃止した完全event-sourced runtime

これらは後続phaseで個別に扱います。
