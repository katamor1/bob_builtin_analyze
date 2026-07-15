# Workflow Run Retention / Cleanup P1-6 Review Evidence

## 1. Scope

- Pure cleanup planner、policy、digest、protected-run rules。
- Retention sidecar、pin/unpin。
- Physical inventory、bounded measurement、reference graph。
- Cleanup lease、owner guard、execution exclusion、heartbeat/release。
- Quarantine transaction、rollback、purge、incomplete-state reporting。
- Six commands、four settings、workspace trust、root-first multi-root behavior。
- Migration backup publication、crash-pair preservation、error precedence。
- Windows 8.3/junction/alias test portability。
- Tests、operator guide、design、plan、roadmap、release evidence。

## 2. Review method

1. `run.json`が正本のままか、新しいrun-state schema/runtime dependencyがないか確認する。
2. Previewとapplyが同じplanner/policy/digest/revisionsへbindされているか確認する。
3. Active、recoverable、referenced、pinned、read-only、locked、journaled、physical-unsafe runが保護されるか確認する。
4. Lease/guardがexecution lockと相互排他で、owner token/identityを失ったreleaseやheartbeatを成功扱いしないか確認する。
5. Quarantine rename/rollback/purgeがpartial failureをtyped errorとresidual pathで保全するか確認する。
6. Inspect/previewとdestructive commandのtrust境界、root-first multi-root選択を確認する。
7. Report、preview、diagnostics、evidenceがmetadata-onlyか確認する。
8. Migration publicationのprimary/byte/cleanup/close優先順位と全handle settlementを確認する。
9. Windowsのlexical/physical path差がproduction contractではなくtest hookだけで吸収されるか確認する。
10. Final diff、local gates、Linux/Windows hosted matrix、package/VSIX evidenceをexact final headで確認する。

## 3. Findings and dispositions

### Important — linked publication ownership was recorded after fallible checks

`fs.link`が成功しても、後続metadata check前にownership flagが立たず、failure時にowned publication bytesを持つbackupを残し得ました。

Disposition at `9df3ddec`:

- `fs.link`成功直後にpublication ownershipを記録。
- Live temp owner handleをrollback完了まで保持。
- Backup cleanupはowner/path handleの`dev`、`ino`、`nlink`、containmentを照合し、foreign replacementを保全。
- Post-link metadata EIO + in-place byte mutation regressionで両owned path cleanupとclean retryを確認。

### Important — close-only failure could mask cleanup failure; cleanup path close was swallowed

Linked verification close errorがprimary扱いになり、その後のrollback `rm` errorをmaskしていました。EEXIST cleanup pathのverification handle close errorは成功として返っていました。

Disposition at `9df3ddec`:

- Operation/identity、byte/domain safety、cleanup `rm`、verification close、cleanup path close、owner closeを別々にsettle。
- `cleanup rm > close-only`を固定し、全handle settle後にerrorを選択。
- Verification-close + rollback-rmとEEXIST cleanup-closeの実file regressionを追加。

### Important — matching-backup direct-reader close-only failure could mask cleanup removal

最初の修正後も、EEXISTとraced-existingのmatching-backup branchはpublic direct readerのraw close-only errorをprimary failureとして扱っていました。その後にowned temp cleanup `rm`が失敗しても、低優先度のdirect-reader close errorが観測されました。

Disposition at `7d6e38d1`:

- Matching-backup readをinternal validated direct-reader pathへ通し、exact-byte validationとclose-only outcomeを別々にsettle。
- Successful direct-reader close-only failureをlinked verification close-only failureと同じ低優先度に分類。
- EEXIST/raced-existingの2 real-filesystem regressionで、owned-temp cleanup `rm`がdirect-reader close-only errorより優先されることを確認。
- Migration file 34/34、compile、metadata budgetをGREENにし、`12a5d90d..7d6e38d1`のfinal targeted independent reviewでCritical 0 / Important 0 / Minor 0を確認。

### Windows CI 21 failures — test path spelling portability

8.3 short path/junction-backed lexical pathと`realpath`のlong physical pathをtest hooksが文字列比較していました。

Disposition at `31e09ee9`:

- Cleanup hook境界をphysical parent identity + leaf matchingへ統一。
- Durability descendant判定をcanonical workspace rootへbind。
- Run-lock expected rootを`realpath`でcanonicalize。
- Alias retargetで別physical parentを拒否するhelper regressionを追加。
- Production code変更なし。決定的再現21/21 failureからGREEN 71/71、final five-file 100/100。
- Independent spec/quality review: Critical 0 / Important 0 / Minor 0。

### RC whole-diff follow-up — contract alignment and failure precedence

RC前のwhole-diff reviewで検出したcontract mismatchとFileHandle/cleanup failure precedenceを、`4ecdc3ae..fdc0efe8`で閉じた。

Disposition:

- `578a32da` / `312e6846`: `maxCompletedRuns`の対象をterminal run（completed/failed）へ統一し、setting、test、operator-facing文書を同じ契約へ揃えた。
- `7bf3bffa`: cleanup transactionのrename/identity failureをoptional quarantine-parent cleanupより優先し、suppressed outcomeを保持した。
- `a0fd08f6`: cleanup lease operation > release > parent cleanupの順序を固定した。
- `b2412edc`: workflow lock operation > heartbeat > releaseの順序と、create後lease-check failure時のowned-lock cleanupを固定した。
- `c9ac8825` / `8df76a9f` / `96b4665e`: durability create/touch/directory-syncのoperation、identity/safety cleanup、closeを全settleし、replacementやunsafe aliasを削除しないことを固定した。
- `21265742` / `4d2650d0`: cleanup lease/owner guard publication失敗のrollback、same-token replacement、first-probe replacement、listing後retargetをidentity-boundかつfail-closedにした。
- `fdc0efe8`: run-state temp writeのoperation > temp cleanup > close優先順位を固定した。
- Merge base `f35e7e79..fdc0efe8`の独立quality reviewはApproved、独立safety/spec reviewは`SPEC_COMPLIANT`。両reviewともCritical 0 / Important 0 / Minor 0で、temporary diagnostic/mutation workflowも検出されなかった。

## 4. Required invariants

- Six commandはmanual-only。Startup/timer/background auto-deleteなし。
- `retention.enabled=false`でもmanual command利用可。
- Inspect/previewはuntrustedでread-only。Cleanup/delete/pin/unpinはfilesystem/root discovery前にtrust必須。
- Multi-rootはroot selectionがrun selectionより先。同一run IDをroot間で共有しない。
- Plan applyはfresh inventory、同一policy、digest、run/retention/physical revisionsを再検証。
- Owner guardは`.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json`、quarantineは`.bob/workflows/run-cleanup-quarantine/<txId>/<runId>`。
- Orphan guardとcross-process migration crash pairを自動回復しない。
- Migration crash pairのoperator recoveryはtemp/backupのno-alias、`dev`、`ino`、`nlink=2`、exact bytes、publisher停止を要求し、tempだけunlink後にbackupの`nlink=1`/bytesを再確認。
- Preview/diagnostics/evidenceへ本文を含めない。
- Main mergeとProduct Release承認を分離する。

## 5. Review gates

| Review | Range / head | Result | Open findings |
| --- | --- | --- | --- |
| Windows portability spec | `4d100cda..31e09ee9` | Spec compliant | C0 / I0 / M0 |
| Windows portability quality | `4d100cda..31e09ee9` | Approved | C0 / I0 / M0 |
| Migration initial aggregate | `8adc7cf0..7a7ef937` | Changes requested | C0 / I2 / M0; first remediation at `9df3ddec` |
| Migration follow-up intake | Matching-backup direct-reader paths at `9df3ddec` | Changes requested | C0 / I1 / M0; fixed at `7d6e38d1` |
| Migration final targeted re-review | `12a5d90d..7d6e38d1` | Approved | C0 / I0 / M0 |
| Documentation/spec initial review | `12a5d90d` | Changes requested; fact corrections applied | C0 / I3 / M2 |
| Documentation/spec final re-review | Corrected RC documentation | Approved | C0 / I0 / M0 |
| Whole-diff quality review | `f35e7e79..fdc0efe8` | Approved | C0 / I0 / M0 |
| Whole-diff safety/spec review | `f35e7e79..fdc0efe8` | `SPEC_COMPLIANT` | C0 / I0 / M0 |

Initial docs reviewのImportant 3件（migration evidence、owner guard guarantee、partial-purge contract）とMinor 2件（PR #75 merge type、`maxCompletedRuns` terminal scope）はfact-correctionで修正し、final re-reviewでopen finding 0を確認した。

## 6. Final verification record

| Evidence | Status |
| --- | --- |
| RC local gates | **PASS**。Compile exit 0、path/migration 117/117、retention 98/98、policies/package/diff check GREEN。Local full attemptsは外部Node process 164件下で1084/1085（fail 1）と1082/1085（fail 3）、cancelled 0。再抽出で識別したfailureは既存`bobGateLifecycle`の5s/10s observer 3件。timeoutは変更していない。 |
| Exact-RC-head hosted full-suite authority | **PASS**。Linux 1084 pass / fail 0 / cancelled 0 / skipped 1、Windows 1085/1085 pass / fail 0 / cancelled 0。 |
| VSIX SHA-256/bytes/UTC/entry count | **PASS**。`5b61c00526f5f9064f011ee500ccd0f0c2a49538dcb82ac7d6be07ff7e0bf4f7` / 1,032,305 / `2026-07-15T20:26:31.2539661Z` / 810。 |
| RC Linux/Windows matrix | **PASS**。`extensions-quality` run `29447947887`全7 jobs SUCCESS、`workflow-contracts` run `29447947919` SUCCESS。 |
| Evidence-tail exact-final-head matrix | **PENDING after evidence-only commit** |
| Temporary diagnostic/mutation workflow search | **PASS**。恒久的な`extensions-quality` smoke追加以外なし。 |
| PR body final run IDs/review result | **PENDING after exact-final-head CI** |

## 7. Current decision

- Scoped Windows portability review: **GO**。
- Migration remediation review: final targeted independent review **GO** (Critical 0 / Important 0 / Minor 0)。
- Documentation review: **GO** (Critical 0 / Important 0 / Minor 0)。
- RC whole-diff review: **GO**。Quality Approved、safety/spec `SPEC_COMPLIANT`、Critical 0 / Important 0 / Minor 0。
- RC/evidence-tail progression: **GO**。
- PR #93 main merge: **NO-GO** until evidence-only exact-final-head CI、final review、PR本文更新がGREEN。
- Product Release: **NO-GO** until real IBM Bob/Bazaar、multi-root、ReFS/AV、signing/distribution/rollback/operator-recovery UAT。

Exact-final-head run IDsとfinal review resultはPR本文へ記録し、evidence-only commit後にこのfileを再変更しません。
