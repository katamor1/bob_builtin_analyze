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

`fs.link`が成功しても、後続metadata check前にownership flagが立たず、failure時にowner bytesのbackupを残し得ました。

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

### Windows CI 21 failures — test path spelling portability

8.3 short path/junction-backed lexical pathと`realpath`のlong physical pathをtest hooksが文字列比較していました。

Disposition at `31e09ee9`:

- Cleanup hook境界をphysical parent identity + leaf matchingへ統一。
- Durability descendant判定をcanonical workspace rootへbind。
- Run-lock expected rootを`realpath`でcanonicalize。
- Alias retargetで別physical parentを拒否するhelper regressionを追加。
- Production code変更なし。決定的再現21/21 failureからGREEN 71/71、final five-file 100/100。
- Independent spec/quality review: Critical 0 / Important 0 / Minor 0。

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
| Migration initial aggregate | `8adc7cf0..7a7ef937` | Changes requested | C0 / I2 / M0; fixed at `9df3ddec` |
| Migration fix read-only quality | `31e09ee9..9df3ddec` | Approved | C0 / I0 / M0 |
| Migration fresh independent re-review | `31e09ee9..9df3ddec` | **PENDING coordinator record** | **PENDING** |
| Documentation/spec review | Documentation commit | **PENDING** | **PENDING** |
| Whole-diff review | `f35e7e79..final-head` | **PENDING** | **PENDING** |

Minor findings currently recorded: none. A final Minor must be fixed or carry a documented non-blocking disposition before merge.

## 6. Final verification record

| Evidence | Status |
| --- | --- |
| Final local gates | **PENDING Task 5** |
| VSIX SHA-256/bytes/UTC/entry count | **PENDING Task 5** |
| RC Linux/Windows matrix | **PENDING Task 5** |
| Evidence-tail exact-final-head matrix | **PENDING Task 5** |
| Temporary diagnostic/mutation workflow search | **PENDING final diff** |
| PR body final run IDs/review result | **PENDING Task 6** |

## 7. Current decision

- Scoped Windows portability review: **GO**。
- Scoped migration fix review: local read-only quality **GO**; fresh independent coordinator gate **PENDING**。
- Documentation review: **PENDING**。
- Whole-diff review: **PENDING**。
- PR #93 main merge: **NO-GO until pending gates are GREEN**。
- Product Release: **NO-GO** until real IBM Bob/Bazaar、multi-root、ReFS/AV、signing/distribution/rollback/operator-recovery UAT。

Exact-final-head run IDsとfinal review resultはPR本文へ記録し、evidence-only commit後にこのfileを再変更しません。
