# Workflow Run Retention / Cleanup 運用ガイド

## 1. 目的と適用範囲

P1-6 は、workspace に保存された workflow run の件数と物理使用量を可視化し、operator が明示確認した terminal run だけを整理する機能です。`run.json` を正本とし、run-state schema は変更しません。Pin は独立した `retention.json` sidecar に保存します。

P1-6の6操作は`Bob 操作ハブ`から明示的に開始します。内部Command IDはhost routing用に登録を維持しますが、通常のCommand Paletteには表示しません。拡張機能の起動時、timer、background taskからcleanupを自動実行しません。`workflowRegister.runs.retention.enabled=false`は将来の自動化に備えた予約値であり、`false`のままでも操作ハブの手動retention操作を利用できます。

## 2. 操作ハブのretention actionsと内部Command ID

| 操作ハブのaction | 内部Command ID | Workspace trust | 処理 |
| --- | --- | --- | --- |
| 実行ストレージを確認 | `workflowRegister.inspectRunStorage` | 不要 | 件数、byte数、status、blockerなどのmetadataをread-only表示する。 |
| クリーンアップをプレビュー | `workflowRegister.previewRunCleanup` | 不要 | 現在のpolicyでcleanup planを作り、対象、除外理由、digestをread-only表示する。 |
| 完了済み実行をクリーンアップ | `workflowRegister.cleanupCompletedRuns` | 必須 | default policyをpreviewし、modal確認後に同じplanを再検証して適用する。 |
| 選択した実行を削除 | `workflowRegister.deleteSelectedRuns` | 必須 | rootを選んだ後にrunを複数選択し、plannerが許可したrunだけを確認後に削除する。 |
| 実行を保持 | `workflowRegister.pinRun` | 必須 | 選択した既存runへ任意note付きのpin metadataを設定する。 |
| 実行の保持を解除 | `workflowRegister.unpinRun` | 必須 | 選択した既存runのpinを解除する。 |

実行ストレージ確認とcleanup previewはuntrusted workspaceでもread-onlyで利用できます。cleanup、明示削除、pin、unpinは、workspace rootの探索、run選択、service生成、filesystem accessより前にtrustを要求します。

## 3. 設定

| 設定 | 既定値 | 現在の契約 |
| --- | ---: | --- |
| `workflowRegister.runs.retention.enabled` | `false` | 将来自動化用の予約値。手動コマンドの利用可否には使わない。 |
| `workflowRegister.runs.retention.completedDays` | `30` | 完了から指定日数を超えたterminal runを候補にする。 |
| `workflowRegister.runs.retention.maxCompletedRuns` | `100` | Terminal run（`completed`と`failed`）の合計保持数を超えた古いeligible runを候補にする。 |
| `workflowRegister.runs.retention.maxTotalBytes` | `524288000` | run storage全体のbyte目安を超えた場合に候補を追加する。 |

`completedDays`、`maxCompletedRuns`、`maxTotalBytes` はcleanup候補を決めるpolicyです。候補になっても、保護条件に該当するrunは削除されません。

## 4. Multi-root と選択順序

Multi-root workspaceでは、必ずworkflow rootを先に選択し、そのrootのinventoryだけからrunを選択します。Command inputに`workspaceRoot`が指定された場合も、現在のroot候補と一致するものだけを受け入れます。

同じrun IDが複数rootに存在しても、別rootのrunとして扱います。別rootのinventory、pin、lease、quarantine、preview digestを混在させません。Root選択を省略してrun IDだけでmutation対象を決めてはいけません。

## 5. Preview、保護条件、apply binding

Cleanupは次の順で進みます。

1. 物理的に包含されたrun inventoryをbounded scanで取得する。
2. Pure plannerがpolicy、run revision、retention revision、directory identity、tree fingerprint、参照graphを使ってplanとSHA-256 digestを作る。
3. Metadata-only previewを表示する。
4. Operatorがmodal確認する。
5. Apply直前にinventoryと同じpolicyからplanを作り直し、digestと各revisionが一致することを確認する。
6. Run ID順にcleanup leaseを取得し、execution lock、journal、path identityを再確認する。
7. 全候補をtransaction quarantineへrenameし、全rename成功後にpurgeする。

次のrunは必ず保持します。

- `running`、`paused`、`checkpoint`、`reviewing`、`held`
- recoverable run
- artifact reuse、hydration、task-snapshot importから参照されるsource run
- pinned run
- future/read-only、invalid、missing、unknown、measurement incompleteなrun
- pending `run-state.journal.json` またはactive `run.lock.json`があるrun
- symlink、junction、hard link、workspace escape、directory identity不一致など物理安全性を証明できないrun

明示選択したrunも同じplannerを通ります。選択は保護条件を迂回しません。

## 6. 保存場所とtransaction

| 種別 | 保存場所 | 用途 |
| --- | --- | --- |
| Run正本 | `.bob/workflows/runs/<runId>/run.json` | Status、updatedAt、provenanceなどの正本。 |
| Pin sidecar | `.bob/workflows/runs/<runId>/retention.json` | Pin状態と任意note。 |
| Cleanup lease | `.bob/workflows/run-cleanup-leases/<runId>.json` | Cleanup ownership metadata。runs列挙の外に置く。 |
| Owner guard | `.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json` | Atomic `mkdir`で取得する権威あるownership guard。 |
| Quarantine | `.bob/workflows/run-cleanup-quarantine/<txId>/<runId>` | Commit前rename先。rollback/purge失敗時は保全する。 |
| Migration backup | `.bob/workflows/runs/<runId>/run-state-v0.backup.json` | Historical v0 bytesのcreate-once backup。 |
| Migration temp | `.bob/workflows/runs/.<runId>.<pid>.<uuid>.tmp` | Backup publication中だけ存在するowner temp。 |

Owner guardが存在する間、同じrun IDの新しいcleanupはfail-closedになります。通常のrelease順序は、owner tokenとguard identityを再検証しながら、`<runId>.json`、`owner.json`、`<runId>.guard`の順です。Quarantine renameが途中で失敗した場合は移動済みrunを逆順に戻します。Rollbackまたはpurgeを完了できない場合は、typed errorとquarantineを残します。

## 7. Cleanup lease / guard の手動復旧

Orphan guardは自動reclaimしません。次の全条件を証明できない場合は削除せず、workspaceをread-onlyにして保全・エスカレーションしてください。

1. 対象workspaceでworkflow-registerを使う全IDE、CLI、agent、別host/containerのcleanupを停止する。`hostname`と`pid`だけで停止を推測せず、共有filesystemへ接続する全可視性ドメインを確認する。
2. `<runId>.json`と`<runId>.guard/owner.json`を変更せずに退避し、path、UTC、size、hash、`dev`、`ino`、`nlink`を記録する。親directoryを含め、direct pathでworkspace内にあり、symlink/junction/aliasでなく、各JSONがregular fileかつ`nlink=1`であることを確認する。
3. `owner.json`がcleanup lease v1としてdecodeでき、`runId`がpathと一致することを確認する。Lease JSONが存在する場合は、`schemaVersion`、`runId`、`token`、`pid`、`hostname`、`createdAt`、`heartbeatAt`がownerと一致し、採取中にbytes、identity、mtimeが変化していないことを再確認する。
4. Run directory、execution lock、journal、quarantineの有無を確認し、cleanupが進行中でないことを確認する。Owner不一致、recent heartbeat、想定外entry、identity変化が1つでもあれば何も削除しない。
5. 証拠が一致した場合だけ、実装のowner-checked releaseと同じ順で、まず`.bob/workflows/run-cleanup-leases/<runId>.json`を削除する。削除後も`owner.json`のtokenとguard directory identityが変わっていないことを確認する。
6. 次に`<runId>.guard/owner.json`を削除し、guard directoryが空であることを確認してから`<runId>.guard`を削除する。親`run-cleanup-leases`は空の場合だけ削除する。
7. `Bob 操作ハブ`で実行ストレージを再確認し、対象run、lock、journal、quarantineを確認する。Mutationを再実行する場合は新しいpreviewから始める。

Guard directoryを先に消す、token不一致のleaseを消す、想定外entryを含むguardをrecursive deleteする操作は禁止です。

## 8. Quarantine の手動復旧

`WorkflowRunCleanupIncompleteError`が返った場合は、`phase`、`committedRunIds`、`residualRunIds`、`retainedQuarantinePath`を証跡として保存します。次の順で復旧します。

1. 対象rootのworkflow実行とcleanupを全process/hostで停止し、quarantine全体を変更せずに退避する。
2. Errorに記録された`<txId>`だけを対象にし、各`<runId>`についてruns側とquarantine側の存在、direct-directory identity、revision、fingerprintを確認する。Symlink/junction/別identity、両側同時存在、記録外entryがあれば停止する。
3. `rollback` phaseでは、runs側が不在でquarantine側のidentityがpreview evidenceと一致するresidual runだけを、transactionで移動した逆順に`.bob/workflows/runs/<runId>`へrenameする。各rename後にidentityを再確認する。
4. `purge` phaseでは、両側から消えたrunは既にcommit済みとして復元しない。Quarantineに残るrunをrestoreするかpurgeするかをoperatorが明示決定し、いずれもidentity/revisionを再検証して1件ずつ処理する。自動的に全件成功扱いにしない。
5. `parent-cleanup` phaseではrun削除はcommit済みです。Transaction directoryとbase directoryは、空であることを確認した場合だけ内側から順に削除する。
6. Transaction directoryを消すのは全entryの行き先を確認し、空になった後だけです。最後に新しいinventory/previewを取得し、release evidenceへ操作記録を残します。

## 9. Cross-process migration crash pair の手動復旧

`.<runId>.<pid>.<uuid>.tmp`と`<runId>/run-state-v0.backup.json`が同じinodeへの2つのhard linkとして残った場合、拡張機能はpublisher PIDが見えなくても自動復旧しません。PID visibilityは別host、container、namespaceのowner停止を証明できないためです。

Operator recoveryは、workspaceの保全copy上で次の順に行います。

1. 対象workspaceへの全writerを全process/host/containerで停止し、runの現在の`run.json`、temp、backupをread-onlyで退避する。
2. Temp名が正確に`.<runId>.<positive-pid>.<uuid-v4>.tmp`であり、対象runに対応する候補が1件だけであることを確認する。
3. Tempとbackupの双方がdirect regular fileで、symlink/junction/aliasを経由せず、canonical workspace内にあることを確認する。
4. 両pathの`dev`と`ino`が等しく、双方の`nlink`が正確に`2`で、余分なhard linkがないことを確認する。確認の前後でidentityとlink countが変わっていないことを確認する。
5. No-followで双方を開き、handleの`dev`、`ino`、`nlink`をpath証拠と照合する。双方のbytesが完全一致し、migration前の期待historical bytesとも完全一致することを確認する。Hashだけ、sizeだけ、JSON parse結果だけで代用しない。
6. Temp名のPIDを含むpublisherが全可視性ドメインで停止し、open handleも残っていないことを確認する。証明できない場合は両linkを保全して終了する。
7. 上記をすべて満たす場合だけtemp側1 linkを削除する。Backup側は削除・rename・上書きしない。
8. 直後にbackupを再度no-followで開き、同じ`dev`/`ino`、`nlink=1`、期待historical bytes、direct contained pathを確認する。いずれかが不一致ならそれ以上変更せず証跡を保全する。
9. 拡張機能を再開し、migration/read diagnosticsを確認する。新しいbackupを手作業で生成しない。

Candidateが0件または複数、`nlink`が2以外、identity/bytes不一致、alias、extra link、publisher停止不明の場合はoperator recovery不可です。両pathをそのまま保全します。

## 10. Privacy と証跡

Inspect、preview、diagnostics、release evidenceへ含めてよいのは、run ID、status、inspection status、bytes、timestamp、revision/digest、blocker、件数、path/identityなどのmetadataだけです。Task本文、artifact本文、snapshot本文、`run.state`の値、Bob message本文は含めません。

Pin noteには本文やsecretを転記しないでください。Evidence採取時も、内容一致はhash/byte比較結果として記録し、historical JSON本文そのものを貼り付けません。

## 11. Release gate と既知の境界

PR #93の`main`統合はintegration GOであり、Product Release承認ではありません。次はProduct ReleaseのNO-GO条件として残します。

- 実IBM Bob/Bazaarでの代表workflow、retention、recovery確認
- 同一run IDを含むmulti-root実機確認
- ReFSのfile identity/link-countとWindows AV/indexer contention
- Signed VSIX、配布、upgrade、rollback UAT
- Quarantine/guard/migration crash-pairのoperator recovery UAT

Node.jsにはidentity-conditional renameやhandle-relative identity-conditional recursive deleteがありません。Cooperative writerはleaseで排除し、各filesystem call直前まで再検証しますが、非協調OS actorに対する最終verify-to-call raceを完全には除去しません。

P2-1 Dry RunとP1-7 layer policyは次期目標です。P1-6では新しいdependency、自動cleanup、追加の永続本文schemaを導入しません。
