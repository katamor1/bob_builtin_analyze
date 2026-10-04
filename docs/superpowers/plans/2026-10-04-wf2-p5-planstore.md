# WF2 P5 Plan Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `WF2-P5-PLANSTORE`を実装し、正確なprivate environmentごとのcompile共有、slot失効、published runtime専用leaseを一つのownerに集約する。

**Architecture:** P4のsole compilerとbranded handleを利用し、detached request、process-wide slot epoch、environment別WeakMap cache、opaque leaseを追加する。既存WorkflowRuntimeFactoryは一つのprocess-wide storeへ三操作を委譲する。P2 loaderが取得済みのrawPackageを入力とする。

**Tech Stack:** TypeScript、Node.js 22、CommonJS、node:test、既存canonical JSON/SHA-256、module-private WeakMap/Map。新規dependencyなし。

**Spec:** `docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md` §16–17、`2026-07-24-workflow-contract-v2-generation-directory-amendment.md`、`2026-08-23-feature-selection-and-sequential-main-integration-design.md` §7.1・§10.2・§11–12、`2026-08-31-wave0a-risk-tiered-approval-and-evidence-design.md`。詳細は `docs/superpowers/plans/2026-07-17-workflow-contract-v2-package-compiler.md` P5と `2026-09-28-v2-migration-remaining-work.md` M2。既存承認済みV2設計の実装計画であり、設計変更はない。

**Status:** local実装・検証・独立whole-branch review完了（Critical/Important/Minor 0、新規P5 suites 34/34を独立実行）。三extension全体3074件（3072 pass/2 skip/0 fail）、P5関連focused 55/55、root UI/documentation/CI contracts 68/68、policy/package成功。Workflow全体はtest concurrency=2で成功し、先行unbounded実行の既存timeoutとisolated 27/27成功を保全。実main/baseはSource and Admission Bindingのcaf37d28のまま。P5はLOCAL、未公開・未統合・未activation。candidate/actual-main exact-head CIと後続最終UATはpending。

## Global Constraints

- `ONE_ACTIVE_SLICE`、`ONE_CONTINUOUS_SLICE_WORKSPACE`。sliceは `WF2-P5-PLANSTORE`、hard dependencyは `WF2-P4-COMPILER`。先行sliceがVERIFIEDのときだけ開始する。
- `SOLE_IMMUTABLE_COMPILER`、`no_provider_lookup`。compileは `compileWorkflowPackage()`のみ。P5以外にplan cache/lease ownerを作らない。
- `maxAuthorizedActivation: shadow`、`productReachability: separate_activation_required`、explicit omissionは `persisted_lease`。P5追加APIを現行product経路で呼び出さず、activation状態を進めない。
- private environment identityは正確なbranded object。public digestが等しくても別object・registry・snapshot・dispatch登録generation・purposeのhandleを共有しない。
- `getOrCompile`は `runtime` / `authoring-validation` / `evidence`で利用可。`acquire`はprivate purposeが `runtime`、handle publicationが `published`の場合だけ。
- compiler versionは `workflow-register-compiler/v2`。public planの中へ `planDigest`、Buffer、clock、host path、live registry、provider dispatch functionを加えない。
- evidenceは `sha256:<64hex>`、physical generation directoryは `sha256-<64hex>`。physical encodingはP2が所有する。
- current v1 command、public API、persistence、GUI/authoring composition、`Bob 操作ハブ`を非互換変更しない。P6/P7、R1/R2以降、run作成、provider/Bob実行、artifact stagingは別slice。
- archive/sourceはread-only。Workflow B全carrierのapply/cherry-pick、旧branch再作成、archive更新、旧approval capture/hash/claim/receipt/provider transcriptの保存・実行をしない。新検証記録はtechnical-only、`mutationAuthority:false`。
- package上限はworkflow-register `1,200,000 bytes`、Bazaar `12,000,000 bytes`、Code Consistency `11,000,000 bytes`。上限変更で通過させない。

## Review Focus

1. cache hitでもawait後にslotが失効したらhandle/leaseを返さない。Task 1の二つの `cache-hit invalidation before ... continuation` とin-flight caseで固定する。
2. 同じpublic evidenceのprovider dispose/re-register、別purpose、published/stagingを混同しない。Task 1の `equal provider evidence across re-registration never shares a private handle` とpurpose/publication casesで固定する。
3. 呼出し直後にcallerがraw bytes/publication/generationを変更してもrequestは一回のdetached snapshot。Task 1の `plan request snapshots caller-owned bytes and identity before scheduling compilation` で固定する。
4. stale successやcached failureへfallbackしない。Task 1のfailure retry、compiler identity、`pinned generation reload ignores current pointer and fails closed on missing generation or exact binding` で固定する。
5. release callbackがthrowしても解放は一回だけで他のlive leaseを失効させない。Task 1の `lease release remains idempotent after its owner callback throws` とmultiple lease casesで固定する。

## Source and Admission Binding

planning/execution baseは実main caf37d28195898a0893dce7f1d565666c48c12ba、tree 63d4964ea0174ac580c1b6f2b4c3ea7cbfed3151。2026-10-04のread-only照合でremote headsはそのmain一件、open PR=0、primary tracked cleanを確認。primaryの三つの既存untracked pathsには触れない。

historical sourceは旧PR #154 owner-stage `e0766f9448033688964fabbcfa6ae73b3d849ed0` → `45260e0b5a96e50bf01b820b71103b33f2067d8c`。正本は `docs/release-evidence/feature-selection-ledger-2026-08-23.json` と `tools/main-consolidation/feature-selection-source-universe.json` のP5八items。tranche `workflow-b` 全体はP4–P7を含むので採用範囲にしない。historical filesを現行P4の改善済み契約へ合わせて再構成する。

original manifest SHA `36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31`、remote recovery manifest SHA `bcdb61aad397ef4c6463eaa789d5d278b9d1bcad34015bc472c1dfc97773e476`、carrier patch SHA `59eca51331f3c580a63435021e03c05780ffbe6b65db76949cb0d4bff8c428c7`は実bytesを照合済み。original `bundles/repository-all-refs.bundle` とrecovery `bundles/remote-heads-before-main-unification.bundle` は双方でP5 exact headのlist-heads bindingとmanifest記載sizeを確認した。bundle全体の再hashは今回未実施。下表八blobはsource universeとGit objectで一致する。

以下のfile pathsは `extensions/workflow-register/` 相対。

| Task | Path | Source item | Owner-stage blob | Responsibility |
| --- | --- | --- | --- | --- |
| 1 | `src/core/contractV2/planLease.ts` | source-1921ef22a041d98667b357ee | 3948750e9f58dac0a77e6d258a9536170d5b4b8b | opaque leaseと解放境界 |
| 1 | `src/core/contractV2/planStore.ts` | source-2bb96ca222954ef7996b2e41 | 05a1937c233496d02f3ccd51f7b9a42301bde4ad | cache/coalescing/lease accounting |
| 1 | `src/core/contractV2/planStoreInput.ts` | source-418c99dff76ec8aa8c971638 | c8490eecf29a60bf9d4b68b12e6df450bba83eec | detached requestとslot epoch |
| 1 | `test/workflowContractV2PlanStore.test.js` | source-4f000b9390bc293973eefa7d | 35d400ce5c7c92e5d2188262f416fd551468d6d1 | store/leaseのbehavioral cases |
| 1 | `test/workflowContractV2PlanStoreIdentity.test.js` | source-f7af99547f1c8bfbb41c9f16 | d0975f469317df5160c692d539156a7c9742055f | compiler戻り値のidentity拒否 |
| 2 | `src/core/contractV2/index.ts` | source-501ab87205e94c950750ca70 | bdfd4920d73a952c2d930ec1cc0101b7470f6d9e | 限定public facade |
| 2 | `src/workflowRuntimeFactory.ts` | source-9d3b8054b264f92bd285309d | 35745120153ba176daa7f542cbab5bc5f4a1afef | process-wide ownerへ委譲 |
| 2 | `test/workflowContractV2PlanStoreRuntimeWiring.test.js` | source-beda9c4e8baebbfbfc49b093 | 937da17f5c0b7667d49de29b9d82242603a4c59e | singleton/delegation behavior |

## Local Execution Scope

- repository: `katamor1/bob_builtin_analyze`。workspace: `C:\Users\stell\.codex\worktrees\v2-p5-planstore\bob_builtin_analyze`。branch: `codex/v2-p5-planstore`。native managed worktreeと新規local branchは作成済み。
- 所有範囲は上表八product/test files、本計画、新規technical evidence root `.superpowers/sdd/2026-10-04-wf2-p5-planstore/`。Taskごとに明示stageしてlocal commitする。P4 compiler/foundation、package.json/lock、CI、static ledger/statusは変更しない。
- generated output rootsは上記workspace内の三extension各directory（workflow-register、bob-bazaar-review、bob-code-consistency-review）の `out/`、`node_modules/`、各default VSIX file。事前にVSIX不存在を確認し、このtask生成物だけを再生成する。package/hash/size/logsはtechnical evidence rootへ記録する。
- npm cache、npmのempty user/global config、TEMP/TMPとfresh filesystem fixturesはtechnical evidence root配下へ固定する。既存保全物、primaryのuser files、他worktreeの生成物を利用・上書きしない。
- networkは `https://registry.npmjs.org` へのcredentialなしlockfile dependency取得とproduction audit（公開依存情報の照合）。GitHubは対象repoのread-only状態確認だけ。公開endpoint取得以外のdependency更新は行わない。
- local実装・RED/GREEN・全検証・同範囲の修正・独立reviewまでを一つのB範囲とする。remote push、PR作成/merge、main更新、branch/worktree削除、VSIX install/publishは後で実対象を示すC操作。

### Task 1: Private Plan Store and Runtime Lease Contract

**Files:** 上表Task 1の五filesをcreate。本計画を最初のtask commitへ含める。既存test supportは変更せずrequireする。

**Consumes:**

- `compileWorkflowPackage({ rawPackage: RawWorkflowPackage, environment: WorkflowCompilerEnvironment }): WorkflowPackageCompileResult`。
- `snapshotWorkflowLockGenerationRawPackage(value: unknown): WorkflowLockRawPackageSnapshot`。
- `requireWorkflowCompilerEnvironmentState(environment: unknown): WorkflowCompilerEnvironmentState`。
- `requireCompiledWorkflowPlanState(handle)`、`compiledWorkflowPlanBelongsToEnvironment(handle, environment): boolean`、`isCompiledWorkflowPlanLeasable(handle): boolean`（P4 private moduleからのみ）。

**Produces:**

```ts
interface GetOrCompileWorkflowPlanInput {
  readonly collectionId: string
  readonly workflowId: string
  readonly rawPackage: RawWorkflowPackage
  readonly environment: WorkflowCompilerEnvironment
}
type AcquireWorkflowPlanInput = GetOrCompileWorkflowPlanInput
class WorkflowPlanStore {
  getOrCompile(input: GetOrCompileWorkflowPlanInput): Promise<CompiledWorkflowPlanHandle>
  acquire(input: AcquireWorkflowPlanInput): Promise<WorkflowPlanLease>
  invalidateSlot(collectionId: string, workflowId: string): void
}
interface WorkflowPlanLease {
  readonly handle: CompiledWorkflowPlanHandle
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly released: boolean
  release(): void
}
```

Internal interfaces are `snapshotWorkflowPlanRequest(input: unknown): SnapshotWorkflowPlanRequest`、`invalidateWorkflowPlanSlot(collectionId: string, workflowId: string): void`、`currentWorkflowPlanSlotEpoch(slotKey: string): number`、`isWorkflowPlanRequestCurrent(request: SnapshotWorkflowPlanRequest): boolean`、`createWorkflowPlanLease(input: { readonly handle: CompiledWorkflowPlanHandle; readonly onRelease: () => void }): WorkflowPlanLease`。snapshotはcollectionId/workflowId/slotKey/epoch/publication/generation/packageDigest/rawPackage/environmentを持ち、readonly fieldsの型は順にstring/string/string/number/"published" | "staging"/string/Sha256Digest/RawWorkflowPackage/WorkflowCompilerEnvironment。これらとprivate stateをbarrelへexportしない。

- [x] **Step 1: Establish isolated baseline.** B承認後、依存install前にmain/head/tree、P4 VERIFIED、remote main-only/open PR=0、native attachmentと八source bindingsを再確認し、technical-only admission recordを新規保存する。三extensionでlockfileに従い `npm ci`。四selection/status generatorの `--check`、workflow-register compileとP1–P4 focused groupsを実行し、baseline failureを新契約REDに混ぜない。
- [x] **Step 2: Write failing store/lease tests.** historical十五caseを次表assertionsで再構成し、gap casesも同じ二test filesへ追加する。compile回数・競合順序はcompiler moduleの一時差替えと真正P4 handleを使い、必ずfinallyで元export/cacheを戻す。実compilerのintegration caseも実施する。新production test hookを作らない。

| Test name / case | Required assertions |
| --- | --- |
| same environment coalesces concurrent compilation and distinct environments never share handles | `assert.equal(a,b); assert.equal(calls,1); assert.notEqual(other,a); assert.equal(other.planDigest,a.planDigest)` |
| getOrCompile supports every purpose while acquire is runtime-only before compilation | 三purposeでcompile可。`authoring-validation` と `evidence` のacquireは `assert.rejects(...,TypeError)`、calls増加0 |
| runtime leases expose evidence until one idempotent release and then fail closed | digestはhandleと一致、frozen lease。`assert.equal(typeof store.release,'undefined')`。release後四getterは `assert.throws(...,{name:'TypeError',message:'Workflow plan lease has been released.'})`、再release可 |
| slot invalidation recompiles unleased entries while preserving a live lease | 二namespaceを同slotでcompile後invalidate。双方のnew handleはoldと別、old live leaseのhandle/digestsは同一 |
| a failed recompile never falls back to stale success and failures are not cached | old success後invalidate、valid raw evidenceだがsemantic/lock failureとなる新packageを二回要求。`assert.rejects(...,WorkflowPlanCompilationError)` 二回、compile回数3、旧handleを返さない |
| staging packages may compile but cannot acquire a runtime lease | `getOrCompile(staging)`成功。`assert.rejects(acquire(staging),TypeError)`、leaseなし |
| store requests reject proxy and accessor inputs without behavior invocation | outer/raw/environment/fileのproxy/accessor、unknown/symbol/nonenumerable fields、workflowId mismatchを拒否。`assert.equal(traps,0); assert.equal(getters,0); assert.equal(calls,0)` |
| slot epochs are process-wide across store instances | store Bのinvalidate後、store Aのcacheを再利用せず `assert.notEqual(newHandle,oldHandle)`。異なるcollection/slotは保持 |
| in-flight invalidation rejects the pending result instead of publishing stale success | pendingを直後invalidate。`assert.rejects(pending,WorkflowPlanInvalidatedError)`、次requestは新compileで成功 |
| cache-hit invalidation before getOrCompile continuation rejects the stale handle | cache hit promise作成後同期invalidate。`assert.rejects(pending,WorkflowPlanInvalidatedError)`、余分なcompileなし |
| cache-hit invalidation before acquire continuation never creates a stale lease | 同順序で `assert.rejects(pending,WorkflowPlanInvalidatedError)`、lease作成なし |
| published and staging identities with identical bytes never share private handles | 同environment/digestでもpublishedと二staging generationは `assert.notEqual`、public planは同一。staging acquire拒否 |
| multiple leases share one handle and release counts never underflow | 二leaseで `assert.equal(first.handle,second.handle)`。invalidate→first.releaseでもsecond使用可、重複release無害、次compile成功 |
| lease factory rejects proxy and accessor input without invoking behavior | `assert.throws(...,TypeError); assert.equal(traps,0); assert.equal(getters,0)`。偽handle/proxy callbackも拒否 |
| plan store uses captured Promise and collection intrinsics after module load | module load後にguardしたPromise/Map/WeakMap/String/RegExp/Buffer intrinsicsでもrequestとrelease成功。Windows/Linux path双方でguard有効、finally復元 |
| plan request snapshots caller-owned bytes and identity before scheduling compilation | 呼出し直後に元bytes/publication/generationを変更。`assert.deepEqual(seenBytes,originalByteCopy); assert.notEqual(seenBytes,callerBytes); assert.equal(seenPublication,'published'); assert.equal(seenGeneration,originalGeneration)` |
| equal provider evidence across re-registration never shares a private handle | 同registryのdispose→同evidence再登録から別environment。public digestは等しいが `assert.notEqual(newHandle,oldHandle)`、private bound handle/generationが別。dispatch呼出し0 |
| lease release remains idempotent after its owner callback throws | 真正runtime handleからinternal factoryでlease作成。初回callback throw後 `assert.equal(lease.released,true); lease.release(); assert.equal(callbackCalls,1)`、四getterはreleased error |
| pinned generation reload ignores current pointer and fails closed on missing generation or exact binding | P2/P4実integration。Aをlease→invalidate/release後currentをBへ変え、Aをexplicit load/acquire。A digest/planを回復、新fs logの `current.json` access数0。A generation不足はloader拒否、A lockのexact provider不足はcompile拒否、B/old成功へfallback0 |
| plan store rejects compiler handles with mismatched private identity | identity suiteでenvironment/publication/generation/packageDigest/workflowId、非branded handleを差替え。`assert.rejects(...)`、lease/handleなし。次の真正結果はretry成功しfailure未cache |

- [x] **Step 3: Run RED.** extension rootで `npm run compile` → `node --test test/workflowContractV2PlanStore.test.js test/workflowContractV2PlanStoreIdentity.test.js`。baseline成功後の新module/API不在の失敗を保存する。GREENでは上表behaviorが実際に走ったことを確認する。
- [x] **Step 4: Implement detached request and lease.** `planStoreInput.ts`はclosed own-data fieldsだけを認め、P3 snapshotからbytesをdetachしpublication/generationを保持。collectionIdは1–240 UTF-8 bytes、pattern `^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$`、`//` とdot/dotdot segments拒否。workflowIdは1–128 chars、pattern `^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$`。length-prefix slot keyとmodule-private process-wide epoch Mapを使う。`planLease.ts`は真正handleとprivate stateを使い、frozen getterはreleased guard、releaseはcallback前にreleasedを確定して一回だけownerへ返す。
- [x] **Step 5: Implement the sole store.** instance-private `WeakMap<WorkflowCompilerEnvironment, NamespaceCache>`でnamespaceを先に分離。request identityはslot/epoch/publication/generation/packageDigest、成功evidence keyはpackageDigest/environmentDigest。pending promiseは同namespace・同requestだけ共有しfinallyで消す。P4 successのbrand/environment/workflowId/packageDigest/publication/generationを検証し、compile後とawait continuation後の双方でepochを再確認。compiler failureは `WorkflowPlanCompilationError(diagnostics: readonly WorkflowContractV2Diagnostic[])`（extends Error、readonly diagnosticsを保持）（message `Workflow plan compilation failed with diagnostics.`）、staleは `WorkflowPlanInvalidatedError()`（message `Workflow plan request was invalidated before compilation completed.`）。新diagnostic codeなし、failure/stale successをcacheしない。acquireはnonruntimeをcompile前に拒否しpublished leaseabilityも確認。stale unleased entryだけevictしlive leaseをlast releaseまで保持。既存private boundary/intrinsics保護を弱めない。
- [x] **Step 6: Run GREEN and check package margin.** compile→Task 1二suite→P1–P4 focused groups→architecture/source policyを成功させる。workflow-register `npm run package` → `npm run package:policy` で初期sizeを記録。P4 historical VSIXは1,191,671 bytesで残り8,329 bytesだったため、超過なら八file scopeで不要な重複/出力を解消し、上限変更や既存契約削除で回避しない。
- [x] **Step 7: Commit.** 五Task 1 filesと本計画だけを明示stage、`git diff --cached --check`、`feat(workflow): cache immutable workflow plan leases`。実RED/GREEN commands/result counts/source adoption/追加gap coverageをtechnical evidenceへ保存。

P2/P4 integration fixtureは `createLockedRawPackage(overrides)` のvalid files、`MemoryPackageFileSystem`、`installPublished(fileSystem,'minimal',files)`、`createWorkflowPackageRoot`を再利用。explicit `loadWorkflowPackageGeneration({fileSystem,collectionRoot,workflowId:'minimal',generation:A,expectedPackageDigest:A})` の戻り値をstore入力へ渡す。storeにfs/pointer readerやresume APIを追加しない。exact provider不足fixtureは既存CompilerProviderCasesの登録・lock生成手順を同test内で利用する。

### Task 2: Process-Wide Runtime Facade and Regression Verification

**Files:** 上表Task 2の三files。index/runtime factoryをmodify、runtime wiring testをcreate。

**Consumes:** Task 1の `WorkflowPlanStore`、両input types、`WorkflowPlanLease`、P4 `CompiledWorkflowPlanHandle`。

**Produces:**

```ts
WorkflowRuntimeFactory.getOrCompileWorkflowPlan(input: GetOrCompileWorkflowPlanInput): Promise<CompiledWorkflowPlanHandle>
WorkflowRuntimeFactory.acquireWorkflowPlan(input: AcquireWorkflowPlanInput): Promise<WorkflowPlanLease>
WorkflowRuntimeFactory.invalidateWorkflowPlanSlot(collectionId: string, workflowId: string): void
```

- [x] **Step 1: Write failing behavioral wiring tests.** `workflow runtime factory owns one process-wide plan store and exposes only delegated operations` は既存AutomaticPauseRuntimeWiringのvscode stub/Module._load restoration方式を利用。factory moduleだけの `./core/contractV2` importにfake storeを注入し、二factoryから三操作を呼ぶ。`assert.equal(constructedStores.length,1)`、各callの同一receiver、正確なinput identity/collectionId/workflowId、sentinel handle/leaseを変更せず返すことをassert。constructorと既存V1 engine作成だけではstore operation call数0。source textのregex一致をsingleton証明にしない。`public plan store facade does not expose private factories or state` はruntime barrel exportsが既存二facade＋store/二errorだけで、private lease factory/slot snapshot/state/accessorを公開しないことをassert。
- [x] **Step 2: Run RED.** `npm run compile` → `node --test test/workflowContractV2PlanStoreRuntimeWiring.test.js`。Task 1はGREENのまま、新factory methods/barrel不在の新failureを保存。
- [x] **Step 3: Implement delegation/public barrel.** module-level `const processWorkflowPlanStore = new WorkflowPlanStore()` とprivate instance referenceを追加して三操作をそのままdelegate。workspace/constructor単位でstoreをnewせずpublic store getterは作らない。barrelへ三runtime exportsと `AcquireWorkflowPlanInput` / `GetOrCompileWorkflowPlanInput` / `WorkflowPlanLease` type exportsだけ追加。V1 method bodiesとconsumer呼出し箇所は変更しない。
- [x] **Step 4: Run focused GREEN.** compile→三P5 suites＋`test/runtimeWiring.test.js`＋`test/workflowAutomaticPauseRuntimeWiring.test.js` がfailure 0。P1 package schema、P2 loader、P3 lock、P4 compilerのfocused groupsを再実行し回帰なしを確認。
- [x] **Step 5: Run full/policy/package gates.** 下記local commandsを順に実行しfailure 0、三VSIXのhash/bytes/policyを保存。actual test countsを記録し、P6/P7未存在をPASS扱いしない。Gate P全体はP7までpending。
- [x] **Step 6: Commit and independent review.** 三Task 2 filesを明示stage、`git diff --cached --check`、`feat(workflow): delegate plan store through runtime factory`。最後のexact local head/treeに独立whole-branch reviewを実施しCritical/Important 0。同B scopeの修正はlocal commitして必要な検証とreviewを更新。八target surfaces、P4契約維持、zero activation、package上限、source omission/adoptionをreview recordへ結合。

## Local Verification Commands

extension rootで実行し、PowerShellでは各exit codeを確認してfailure後に後続成功だけを採らない。

```text
npm run compile
node --test test/workflowContractV2PlanStore.test.js test/workflowContractV2PlanStoreIdentity.test.js test/workflowContractV2PlanStoreRuntimeWiring.test.js test/runtimeWiring.test.js test/workflowAutomaticPauseRuntimeWiring.test.js
node --test test/workflowContractV2PackageSchema.test.js test/workflowContractV2PackageLoader.test.js test/workflowContractV2Lock.test.js test/workflowContractV2Compiler.test.js
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run unused:report
npm run audit:prod
npm run package
npm run package:policy
```

三拡張qualityは現行 `.github/workflows/extensions-quality.yml` の各extensionに存在する同名policy/test/package commandsをlocalで実行（未定義scriptを捏造しない）。影響のない二extensionはsource変更なしを確認してfull/quality/package regressionを行う。rootでは四generatorの `--check` と `git diff --check`、八paths以外のproduct diff 0、new facadeへのproduct call sites 0を照合。

## Integration and Handoff

local実装・review後にactual candidate head/tree、diff、tests、三VSIX hashesとC対象を提示。publication/integrationの確認はlocal承認から推測しない。candidate exact-head CI→独立review→merge commit→actual-main exact-head CI→外部保全→exact remote lease delete/native archive/local cleanup→main-only照合の完了でだけP5をVERIFIEDとする。

required CIは現行exact-head contractに従うUbuntu/Windowsと四workflow。raw checkout SHA/run/job/nonceを結合し、`gh pr checks`だけで代替しない。future CI/run/merge SHAや承認結果をstatic ledgerへ先書きしない。API-only P5でlocal実機UAT非該当と判断するならzero product reachabilityの根拠と代替検証をindependent reviewに残す。最終三拡張実機UATは省略しない。

P5がVERIFIEDになるまでP6を開始しない。lease永続化、pointer watcher接続、run provenance/invocation、V2 activation、V1削除を完了条件へ混入させない。

## Plan Self-Review — 2026-10-04

八source items/target surfacesをTask 1五files＋Task 2三filesに一意分割し、source blobとbundle head bindingsを照合。§17のenvironment partition/coalescing/all-purpose get/nonruntime拒否/global epoch/live lease保持/failure retry/pinned reload/idempotent releaseをTask 1へ、sole runtime ownerをTask 2へ対応させた。historical十五behavior familiesとidentity/wiring familyを維持し、Review Focus五条件には追加assertionsを置いた。wiringは実装regexからbehavioral delegationへ改善する。Task 1は未作成barrel/factory APIに依存せずdirect module testsで完結。計画時の四generator checkは成功、product実装テストは未実施。

## Local Execution Result — 2026-10-04

Task 1 commitは21ff9ce46aac5aa407ea7f3f0f07d727a337e336、Task 2 product commitは196650b12f0d580b2ebda274de5b1d8269ce75f9。独立reviewはbase caf37d28からTask 2 head/treeに結合し、八selected source itemsの採用とzero product call sitesを確認。最終plan tracking差分はdocs-onlyとして八product/test blobs不変を照合してfinal candidateへ結合する。technical-only evidenceは本計画専用 .superpowers/sdd/2026-10-04-wf2-p5-planstore/ に保全しmutationAuthority:false。三VSIXはworkflow-register 1,197,265 bytes、Bazaar 3,767,456 bytes、Code Consistency 3,721,538 bytesで全て上限内。hash/source bindingと先行失敗・再検証・判断は専用technical recordsへ保存済み。実機UATの非該当はAPI-only P5 localだけであり、final program UATを免除しない。
