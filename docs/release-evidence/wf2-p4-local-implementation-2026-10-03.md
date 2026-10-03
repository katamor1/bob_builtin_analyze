# WF2 P4 local implementation — 2026-10-03

P4 compilerのlocal実装・検証を完了した。現在は独立whole-branch review待ちであり、P4のprogram VERIFIED、公開、main統合、product activationを意味しない。本文とJSONは技術観測であり mutationAuthority:false。

- Execution base: `88c5f2ee7489f45182e74df778896daf66101ffd`。
- 実装commit head: `32830e2a0df48ecceddce0325ddf0ba1661e4b4e`。branch: `codex/v2-p4-compiler`。
- Predecessor: Wave 0B registry recoveryの受入・cleanup完了。hard dependency: `BASE-WF2-A`。
- Source: PR #153 owner-stage `683e794eb4a39eea7bc3630bedbd2a557f4af8af` → `e0766f9448033688964fabbcfa6ae73b3d849ed0`。
- 30 source items / 27 product-test paths。14 source blobsをそのまま再構成し、13 pathsを現行契約・テストに適合した。Workflow Bの他51 itemsを除外した。
- 一回のF3 catalog、opaque roles/environment/handle、immutable raw snapshot、lexical/schema role resolution、F6 exact binding、lock verification、compiled predicate AST lowering、canonical frozen plan、fresh private prompt readを追加した。
- 既存foundation、v1 entrypoint、Bob stable 2.x・optional toSerializable、product manifestは変更していない。P5–P7・R2 invocation・conditional R3–R5は含まない。

## 検証

| 対象 | pass | skip | fail |
| --- | ---: | ---: | ---: |
| P4 compiler: 13 families / 41 top-level cases | 66 | 0 | 0 |
| 既存10 Contract v2 foundation suites | 556 | 1 | 0 |
| workflow-register full (npm test -- --test-concurrency=2) | 1951 | 1 | 0 |
| bob-bazaar-review full | 753 | 1 | 0 |
| bob-code-consistency-review full | 328 | 0 | 0 |

foundation/compilerはworkflow fullに含まれるため二重加算しない。三拡張full合計は3032 pass / 2既存skip / 0 fail。三拡張architecture/source/dependency policy、bazaar unused/artifact policy、branch diff-checkも成功した。

workflow baselineは三拡張のfull suiteを同時・default concurrencyで実行した際、Bob lifecycleの既存10秒timeoutが3件発生した。変更していない同suiteの単独実行は27/27成功し、並行度2のworkflow fullは0 failureになった。timeout値や製品コードを変更していない。

REDは新catalog/role不在 (5 failures)、新compiler不在 (41 top-level / 61 including nested failures)、validated predicate ASTをsourceから再読する境界 (true != false) を確認した。history内の型・test instrumentation/fixtures/assertions差分は以下の判断で適合した。

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

## Reviewと統合境界

独立reviewは実装と本記録を含むbranch全体を対象にする。Critical/Importantはlocalで解消し、Minorとdeclined-to-judgeの処置をexecution workspaceへ記録する。

今回の追加compilerはentrypointから到達せず、UI/manifest変更もない。local段階の検証代替は上記behavioral/foundation/full/policy checksとする。公開・main受入にはcandidateとmerged-mainのexact-head Ubuntu/Windows CIが必要。最終三拡張実機UATは後続programに残す。

新worktreeとignored technical evidenceを継続workspaceとして保管する。公開・main統合・archive/ref削除は承認済みlocal範囲に含まれない。

詳細: [source mapping](wf2-p4-local-source-mapping-2026-10-03.json)、[local implementation observation](wf2-p4-local-implementation-2026-10-03.json)、[P4 plan](../superpowers/plans/2026-10-03-wf2-p4-compiler.md)。
