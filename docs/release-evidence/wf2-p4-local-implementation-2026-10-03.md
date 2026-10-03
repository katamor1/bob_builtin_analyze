# WF2 P4 local implementation — 2026-10-03

P4 compilerのlocal実装、独立whole-branch reviewと指摘修正、全体検証を完了した。PR #178へ候補9325e2c2を公開したが、CIは未受入。Ubuntu 2 jobsの同一test defectをlocal修正・再検証済み。修正候補の公開、P4のprogram VERIFIED、main統合、product activationは未実施。本文とJSONは技術観測であり mutationAuthority:false。

- Execution base: 88c5f2ee7489f45182e74df778896daf66101ffd。branch: codex/v2-p4-compiler。
- 独立review head: d7669b6a06f2ae0f63fd2f33df9b1bdcb8ec6114。review指摘修正head: ebd902b2f8045835a698477ae10ee1864f77dc0f。CI test修正を含む実装head: aa1f8ec2f5b2769659bc0c8caecfc774e3032365。
- 30 source items / 27 product-test paths。11 source blobsをそのまま再構成し、16 pathsを現行契約に適合。Workflow Bの他51 itemsを除外。
- 一回のF3 catalog、opaque roles/environment/handle、immutable raw snapshot、lexical/schema role resolution、F6 exact binding、lock verification、validated predicate AST lowering、canonical frozen plan、fresh private prompt readsを追加。
- 既存foundation、v1 entrypoint、Bob stable 2.xとoptional toSerializable、manifest/UIは変更していない。

## 検証

| 対象 | pass | skip | fail |
| --- | ---: | ---: | ---: |
| P4 compiler: 13 families / 41 top-level cases | 72 | 0 | 0 |
| 既存10 Contract v2 foundation suites | 556 | 1 | 0 |
| workflow-register full (npm test -- --test-concurrency=2) | 1957 | 1 | 0 |
| bob-bazaar-review full | 753 | 1 | 0 |
| bob-code-consistency-review full | 328 | 0 | 0 |

compiler/foundationはworkflow fullに含まれるため二重加算しない。三拡張full合計3040 tests / 3038 pass / 2既存skip / 0 failure。三拡張architecture/source/dependency、bazaar unused/artifact、workflow schema policy、branch diff-checkも成功。

変更のない他二拡張は既に成功した全体結果を再利用し、review修正後はcompiler、foundation、workflow fullと影響policyを再実行した。全27 pathsの実bytesとGit blob identityをsource mappingに再結合した。

workflow baselineは三拡張同時・default concurrency時に既存Bob lifecycle 10秒timeoutが3件発生。同suite単独27/27成功、最終workflow fullは並行度2で0 failure。timeout値や既存製品コードは変更していない。

| Local VSIX | bytes | 上限 | policy |
| --- | ---: | ---: | --- |
| workflow-register 0.1.0 | 1191671 | 1200000 | passed |
| bob-bazaar-review 0.3.0 | 3767456 | 12000000 | passed |
| bob-code-consistency-review 0.1.0 | 3721538 | 11000000 | passed |

VSIXは承認済みfixture root内へ生成し、upload/activationは行っていない。Bazaarは未変更policyのVSIX入力pathだけをadapterでfixtureへ向け、original package-lock/production dependency rootsの検証も維持した。JSONに実VSIX・policy・adapterのSHA256を保持する。

## 独立reviewと修正

独立reviewは31変更pathsを対象にし、Critical 0 / Important 2 / Minor 0、verdict With fixes。既存12 Rulingsとsource/log identitiesは妥当と確認された。

1. 128 form fieldsにapprovalを加えるとrole上限128を超えて失敗。回帰RED後、128 forms＋1 approvalを許可し、129 formsや複数approvalは引き続き拒否。
2. manual schemaのsole local field/root referenceを未解決のtype/enumで比較して失敗。回帰RED後、catalog-owned detached stateから解決。root chains、別schema document、escaped pointer tokens、annotation、select/approval enum、不正enum、mixed validation sibling拒否、caller変更への耐性、original digest bindingを検証。

修正は一回のlocal passで実施し、72/72 compilerとworkflow fullで検証。executing-plansに従い再reviewは行っていない。Critical/Importantの未解決件数は0。Deferred minors: none。

## 候補CIの失敗とlocal修正 — 2026-10-04

[PR #178](https://github.com/katamor1/bob_builtin_analyze/pull/178)の公開headは 9325e2c22043a359eb6c8c5571c1b95432e78cbe。通常PR 2 runsとmanual exact-head 4 runsが完了し、18 successful jobs / 2 failed jobs / 1 expected skip。18成功jobsと失敗2 jobsのactual checkout SHAを確認した。mainはexecution baseのまま。CI全体を成功扱いしていない。

失敗は[通常PR Ubuntu workflow-register](https://github.com/katamor1/bob_builtin_analyze/actions/runs/37135498469/job/111239085537)と[manual Ubuntu workflow-register](https://github.com/katamor1/bob_builtin_analyze/actions/runs/37135682983/job/111239630417)の同じCore intrinsic test。全stack中のP4祖先に反応し、未変更foundationのworkflowLockBob.filterを拒否して /bob/taskCapabilities diagnosticへ変わる。元のWindows guardはseparator不一致で検査が働かなかった。historical sourceにも同じ欠陥がある。

修正はowned Core test 1 pathのみ。11 P4 moduleのdirect callerを両separatorで判定し、foundation/AJV callerにP4祖先がある場合を許可する。same-realm VMで5 intrinsic × 2 path stylesのlive-call 10 controlsを確実に拒否。実compileにはschemaとCRLF/CR promptを加え、LF text・baseline plan・digest一致を確認。Windowsで元の誤判定をRED再現し、修正後GREEN。compiler 72/72、workflow full 1957 pass / 1 skip / 0 failureを新規実行した。

read-only独立assessmentはP4所有範囲への修正を妥当と判断。memory-only live-sort mutantもguardが拒否しcompile failureになった。foundation/AJV全体のprototype変更耐性はP4保証に含めていない。修正済み候補のhosted Ubuntu/Windows検証は未実施。

既存foundation・他二拡張・product sourceのGit identityと保存log hashes、VSIX/policy hashesが変わらないことを照合し、それらの成功結果を再利用した。JSONに新旧logと公開CIの技術identityを保持する。


## 判断記録

- Ruling: Retain the continuous P4 workspace and technical test/review evidence — user-approved proposal excludes cleanup and publication requires exact candidate evidence — cost if wrong: later native cleanup must preserve ignored evidence before archive.

- Ruling: Preserve AJV non-enumerable __esModule in the construction-count test replacement — historical object spread loses the marker, so TS default import receives a non-constructor and fails before catalog behavior — cost if wrong: construction-count assertion and real-schema success/pointer checks detect invalid instrumentation. Reproduced standalone RED (1/2 failed); production foundation unchanged.

- Ruling: Use explicit Git Bash and Node check runners — system bash uses WSL path semantics and unsigned PowerShell fixture scripts cannot execute — cost if wrong: failing check is not recorded by task-done; no policy/config changes.

- Ruling: Use block YAML for semantic workflow test fixtures — current strict F4 rejects historical JSON flow mapping fixtures before their intended semantics; schema/lock fixtures remain JSON and malformed YAML fixtures unchanged — cost if wrong: semantic error-location assertions and successful pipeline/schema cases expose wrong serialization. No alternate parser or foundation edit.

- Ruling: Isolate AJV construction counter in a child process — deleting cached catalog creates a second private WeakMap and breaks existing opaque roles; reproduced same-suite failure — cost if wrong: child process assertion fails, while parent role/provider cases retain their original module identity.

- Ruling: First lock snapshot input is detached, not caller identity — historical Pipeline assertion contradicts Review Focus 1 and Snapshot case — cost if wrong: caller bytes are mutated after first snapshot and successful compile plus downstream non-identity assertions prove no reread.

- Ruling: Lock receives the already-validated Bob binding's three-field subset and structural narrowing handles predicate groups — source snapshot has TypeScript errors against pinned current type checker — cost if wrong: exact Bob lock comparison/predicate cases fail; no unsafe evidence cast or foundation change.

- Ruling: Observe the verifier's actual argument instead of module-local resnapshot count — lock verifier calls its own lexical snapshot, so historical export-hook expected a second hook call incorrectly — cost if wrong: mutated caller lock bytes cause failure or verifier argument identity assertion fails.

- Ruling: Preserve earlier P1 diagnostics for invisible predicates and output-kind mismatch, compare public provider evidence canonically, and read prompt bytes through the fresh-copy helper — historical assertions conflict with closed P1 precedence, null-prototype canonical JSON, and hardened private prompt boundary — cost if wrong: exact pointer/canonical equality/fresh-byte behavioral checks fail.

- Ruling: Lower the successful F5 AST rather than raw source predicate nodes — requirement forbids raw predicate remnants; remove only private catalog pointer prefixes — cost if wrong: validated-AST boundary RED and actual predicate evaluation on owning committed values detect source reuse or pointer drift. RED first case true != false confirmed.

- Ruling: Verify stored full-check results and exact product bytes through task-done instead of rerunning completed suites — developer instructions avoid redundant passing checks; compiler regression rerun covers the subsequent whitespace-only test change — cost if wrong: log counters, source mapping hashes, or final branch ownership checks detect incomplete evidence; no behavioral full-suite claim on changed production bytes.

- Ruling: Commit the implementation before the one final whole-branch review — executing-plans calls for a fresh immutable branch review after tasks, while Task 2 combines review/commit in its last step — cost if wrong: review issues remain local and must be fixed before publication; Task 2 Step 8 stays unchecked until the review disposition is complete.

- Final: Ruling: P5 cache/lease, P6 routing, and P7 manifest behavior remain later-slice gates — users get a passive compiler with no product consumer and no claim of later runtime behavior — cost if wrong: integration cannot accept P4 as sufficient for runtime; later slices must test those contracts before activation.

- Final: Ruling: Live provider/Bob execution and run/artifact transactions remain prohibited activation and later runtime work — this slice compiles without dispatching or creating runs; zero-side-effect tests cover its observable behavior — cost if wrong: future invocation/transaction regressions remain undetected here and must block activation until separately verified.

- Final: Ruling: Remote publication/main acceptance, hosted Ubuntu/Windows CI, and real-machine UAT remain separate future gates — local results prove local compiler behavior only; programVerified stays false and no product entrypoint/UI/manifest changed — cost if wrong: cross-platform or real-host problems escape local tests; candidate/main CI and final three-extension UAT must still gate acceptance.

- Final: Ruling: Workspace archival and ref cleanup remain deferred — the authorized continuous local workspace retains source, ignored logs, and packages for publication/review follow-up — cost if wrong: local storage persists and later cleanup must preserve needed ignored evidence before native archival and guarded ref removal.

- Ruling: Adapt only the Bazaar policy's VSIX input path to the approved fixture output — its CLI otherwise expects the VSIX beside package-lock and installed production dependencies; execute unchanged policy source against original dependency roots and redirect only exact VSIX exists/stat/read — cost if wrong: packaging validation could inspect different bytes; require three input redirections and bind policy source, adapter, and actual VSIX hashes. No product policy modification.

- Ruling: Present one concrete candidate publication proposal instead of the generic finishing-branch menu — repository risk-tier design section 4-C requires canonical targets and separate execution-time confirmation for remote/main/cleanup effects; the approved local proposal excludes those effects — cost if wrong: an additional integration choice is needed; retain the local branch and perform no unconfirmed remote or main action.

- Ruling: Scope the captured-intrinsic guard to direct calls from the 11 P4-owned modules, with Windows/POSIX path calibration and a nonempty schema/prompt fixture — the inherited whole-stack guard wrongly rejects unchanged foundation calls on Ubuntu and silently misses Windows separators; P4 preserves foundation and does not promise whole-dependency prototype hardening — cost if wrong: foundation/AJV global prototype tampering remains outside this guarantee; prove all five live-call controls fail for both path styles and require unchanged compiled plan/digest under the actual guard. Hosted validation of the repaired revision is still pending.

## 残る受入境界

P5/P6/P7、live provider/Bob/run/artifact executionは後続slice/activation設計の対象。新compilerはentrypointから未到達でUI/manifest変更もないため、local代替検証はbehavioral/foundation/full/policy/package checks。candidateとmerged-mainのexact-head Ubuntu/Windows CIおよび最終三拡張実機UATを後続受入gateに残す。

worktreeとignored technical evidenceはcontinuous-slice workspaceとして保管。修正候補のpush/PR更新・main統合・archive/ref cleanupは別対象のC確認を要する。

詳細: [source mapping](wf2-p4-local-source-mapping-2026-10-03.json)、[local implementation observation](wf2-p4-local-implementation-2026-10-03.json)、[P4 plan](../superpowers/plans/2026-10-03-wf2-p4-compiler.md)。
