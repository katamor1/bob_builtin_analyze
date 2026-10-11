# WF2-R1-PROVENANCE detailed design

Status: proposed for the next scope review. This document is planning material; product implementation and publication have not started.

## Outcome and authority

R1 adds exact detached run-plan provenance and authentic live P5 lease lifetime as private internal contracts. Reviewers can exercise those contracts from current-main tests and an installed hashed VSIX. Validation, registration, Operation Hub, authoring and existing v1 execution retain their current behavior and have zero Contract v2 lease acquisition, provider/Bob dispatch, v2 run-directory or artifact effects. These counters concern Contract v2 boundaries; ordinary v1 execution, including its existing provider/Bob and durable behavior, is preserved.

Authority is `2026-08-23-feature-selection-and-sequential-main-integration-design.md` §§7.1, 9, 10.2, 12.2, 16. This supplement resolves the audited historical bodies against current P4–P7 and P6 shadow guards. Source range is `e860d1ebbafe7068fc6871b16c9586a11b4fe19d..66e005faf0046ca931c83abc41ce533488d2f581`.

Planning base main is `5fc1cd30c39102b946f9300a0d77afd306eaaa03`, tree `aaa6f2d8bbfb82b81d11b0e34f536d8c43475253`. Predecessor Gate R composite is VERIFIED; R1 is planned, ordinal 7, minimum risk B. Runtime is inactive. Re-audit recorded open PR=0, four exact previously retained remote heads, 1,425 preservation file hashes, 244 archive file hashes, and six current generator/inventory/bootstrap checks.

The sealed source catalog remains SHA256 `dc215522dfcae4c114740b2411e63a90ded87d2f803a8e946bed47be352881f2`; source universe remains `c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79`. Independent source audit verified 22 R1 family rows, eight test families and 21 distinct raw Git blobs. The temporary augmentation family uses historical-last-existing `dce0daa1b8c08a6e068620f86e7f6a28d6d604d2`, not the owner-stage endpoint; its deleted file stays absent.

## Selected reconstruction

Implement new evidence, lease-context, leased-state and coordinator modules against current interfaces. Preserve the P4 sole compiler, P5 sole environment/cache/lease owner, current single-flight/run-lock owner and current FileRunStateStore durability/revision owner. Retained run references do not create another lease, cache, compiler or provider lookup.

Do not restore archive factory/service acquisition wiring, seven runtime value exports from its public barrel, temporary declaration augmentation, continuation/restart aliases, or R2–R6 implementations. Product provider-lifecycle wiring remains current; private runtime disposal is implemented/tested now, actual product runtime composition remains later R4/activation work. Pure evidence decoding/projection and a type-only barrel export may be consumed by product; private lease context/store/boundary/coordinator have no product value-import path.

Keep `workflowRuntimeFactory.ts`, `workflowRegisterService.ts`, `workflowContractV2Product.ts`, `workflowContractV2ProviderLifecycle.ts`, `core/engine/runState.ts`, `core/engine/runExecutionCoordinator.ts`, and executable `core/modelSchema.ts` unchanged. Add only bounded negative persisted-record guards to the existing public guarded store and run commands. They reject `workflowSchemaVersion === "workflow-register/v2"` or any own `planProvenance` marker before recovery, migration, coordination or writes, including records without a registered workflow/current.json path. Private leases never bypass public guards.

## Evidence-only type and codec

`core/contractV2/runPlanProvenance.ts` exposes the constant `WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION`, type `WorkflowContractV2RunPlanProvenance`, and `decodeWorkflowContractV2RunPlanProvenance(value: unknown): WorkflowContractV2RunPlanProvenance`. It has no runtime context, retained lease map, filesystem or dispatch imports.

The DTO has exactly ten required keys: `schemaVersion` = `workflow-run-plan-provenance/v1`, `workflowId`, `generation`, `planDigest`, `packageDigest`, `lockfileDigest`, `environmentDigest`, `compilerContractVersion` = `workflow-register-compiler/v2`, `providerExactBindings`, `bobProfileBinding`. Generation/digests are `sha256:` plus 64 lowercase hex digits. Provider bindings reuse current locked-provider decoding, have maximum 256 entries and preserve exact IDs/versions/schema evidence/effect/idempotency/capabilities; Bob evidence reuses current locked-Bob decoding. No prompt/schema body, dispatch handle, workspace path or current-pointer field is persisted.

Decoder accepts closed ordinary JSON data, snapshots then deeply freezes it, and rejects unknown/omitted keys, accessors/proxies, symbol/prototype keys, sparse or aliased data and invalid/order-drifted binding evidence without invoking user getters. Nonempty provider/Bob evidence is exercised, not just an empty provider fixture.

`core/modelRuntime.ts` adds `WorkflowRunSchemaVersion = WorkflowSchemaVersion | "workflow-register/v2"` for run interfaces and optional `planProvenance` through one type-only import. Executable `WorkflowSchemaVersion`/CoreWorkflowDefinition remain unchanged. Persistent CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION stays `workflow-register/run-state/v1`; existing newer persistent envelopes remain read-only. Do not conflate the package discriminator `workflow/v2`, the run discriminator `workflow-register/v2`, and persistent run-state versions.

`runStateCodec.ts` validates closed evidence and the workflowId/definitionHash relationship on both decode and prepare-for-write. V2 run evidence is required; legacy/v1 records cannot carry it. Current future-version/read-only/migration semantics are retained. `core/runProvenance.ts` adds bounded plan evidence/control-line projection with existing sanitization, no body contents and v1 parity. The public barrel exports only the new type.

## Authentic P5 lease and context lifetime

Add direct-module `requireActiveWorkflowPlanLease(lease: unknown): WorkflowPlanLease` in existing `planLease.ts`. It uses that owner's private WeakMap before reading any properties, then authenticates the handle as runtime/published/leaseable and unreleased. Copies/wrappers/proxies/released/evidence/staging handles are rejected. No public barrel value export or second authenticity registry is introduced. The existing fixture-only execution-guard acquisition helper uses this assertion too; public product acquisition remains denied.

`runPlanLeaseContext.ts` owns AsyncLocalStorage scope and reference bookkeeping only. Its interfaces are:

```ts
createWorkflowContractV2RunPlanProvenance(lease: unknown): WorkflowContractV2RunPlanProvenance
assertWorkflowContractV2RunPlanProvenanceMatchesLease(provenance: unknown, lease: unknown): void
runWithWorkflowContractV2PlanLease<T>(lease: unknown, operation: () => T | Promise<T>): Promise<T>
currentWorkflowContractV2PlanLease(): WorkflowPlanLease | undefined
bindWorkflowContractV2RunPlanLease(run: WorkflowRunState, lease: unknown): void
prepareWorkflowContractV2RunPlanLeaseForWrite(workspaceRoot: string, run: WorkflowRunState): void
adoptWorkflowContractV2RunPlanLease(workspaceRoot: string, run: WorkflowRunState): void
bindAvailableWorkflowContractV2RunPlanLease(workspaceRoot: string, run: WorkflowRunState): WorkflowPlanLease | undefined
requireWorkflowContractV2RunPlanLease(workspaceRoot: string, run: WorkflowRunState): WorkflowPlanLease
requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot: string, run: WorkflowRunState): WorkflowPlanLease
releaseWorkflowContractV2RunPlanLease(workspaceRoot: string, runId: string): void
releaseAllWorkflowContractV2RunPlanLeases(): void
```

Each lease entry authenticates through P5. Provenance is created from the exact handle/private generation and current exact locked evidence; read-back must match that lease, not merely a plan digest or an equal-looking handle. A normalized workspace/run key has one live owner; one lease cannot be adopted by conflicting keys. Use current workspace identity normalization. Different simultaneous scopes remain isolated; same-lease nesting does not release the outer owner, conflicting nesting rejects and releases only the newly acquired lease. Ended contexts are explicitly closed so detached asynchronous work cannot reuse an inherited AsyncLocalStorage value.

Bind before write and adopt only after successful durable save. Invalidation keeps a live adopted lease; stopped/restarted processes cannot reacquire through current.json or a recorded generation. Disposal snapshots/removes bookkeeping before callbacks, attempts all releases and is idempotent. Operation failure stays the first error if cleanup also fails; cleanup-only failure is reported after all leases are attempted.

## Private creation, persistence and coordination

`runPlanState.ts` defines `CreateWorkflowContractV2RunStateInput = { shell: WorkflowRunState; workflow: CoreWorkflowDefinition; lease: WorkflowPlanLease }` and `createWorkflowContractV2RunState(input): WorkflowRunState`. It validates an authentic current P6 core binding whose handle is that lease's exact handle, derives detached compiled steps/provenance, and enriches the existing shell. It returns that same object and preserves its detached inputs identity.

`workflowContractV2LeasedRunStateStore.ts` exports private `ContractV2LeasedRunStateStore` over current FileRunStateStoreOptions. `createRunFromPlanLease(workflow, lease, inputs)` requires the active exact context before allocation, snapshots ordinary JSON inputs once, calls the current owner's createRun once, and enriches the SAME tracked shell. This preserves runRevisionByObject and explicitRunTargetByInputs; no hand-written alternate durable writer is added. `saveRun` validates shape/workflow/digest/lease/context before delegating, adopts after success, and releases appropriate ownership on failure. `loadRun` refuses unleased v2 before journal recovery, checks raw/pending evidence against an already retained live lease, and delegates only within that authenticated scope. It never repairs a previous-process v2 run by acquiring a new lease.

Private `executeWorkflowContractV2RuntimeBoundary<T>` takes `{ acquireLease: () => Promise<WorkflowPlanLease | undefined>; executeCompiled?: (lease: WorkflowPlanLease) => Promise<T>; executeLegacy: () => Promise<T> }`. Undefined lease alone selects legacy ownership. A genuine v2 lease with no compiled callback fails closed, releases unadopted ownership and does not call legacy. No product factory/service imports this boundary.

Private `coordinateWorkflowContractV2LeasedRunExecution<T>(store: RunStateStore, run: WorkflowRunState, operationKey: string, operation: () => Promise<T>): Promise<T>` wraps the current coordinator/run lock with exact retained-lease scope. Durable final state is loaded and verified under the existing lock after operation/post-save hooks. Completed/failed release after hooks; paused/checkpoint/reviewing/held retain. A callback's arbitrary `{runId,status}` result never proves terminal durability. Error/overlapping cleanup releases exactly once. No R4 executor, R6 recovery callback or product acquisition hook is added.

## Gate R candidate admission and execution

Keep sealed archive catalog/inventory bytes unchanged. Historical family policyState remains historical. Add `gate-r-main-admission.json`, `gateRMainAdmissionPolicy.mjs` and a closed schema under docs/release-evidence/schemas. Admission is reviewed candidate-source evidence, not a VERIFIED status claim or runtime activation authority.

The canonical admission has exactly `schemaVersion=workflow-gate-r-main-admission/v1`, `authority=reviewed_candidate_source`, `baseMainSha`, `baseTreeSha`, `archiveCatalogSha256`, `capabilityId=WF2-R1-PROVENANCE`, `baseFiles`, `deltas`, `activeTestFamilies`. Base rows have exactly `path,mode,blobSha`; deltas have exactly `path,mode,beforeBlobSha,afterBlobSha,familyIds`, with beforeBlobSha=null only for new files. Family rows have exactly `sourceItemId,testPath,requiredCaseNames`. Rows and nested identifiers are sorted/unique; paths are literal repository-relative paths and modes are 100644. Current base snapshot is independently measured from 5fc1cd30 and pinned by the admission digest in policy; it includes the Gate R test absent from the older archive catalog's baseline. Policy contains literal R1 path/family/test allowlists. Require unchanged unselected files and complete selected deltas; reject arbitrary after-paths, unknown family/capability, missing/duplicate/case alias/link/hardlink, canonical drift, broad exports and unapproved runtime imports. Do not require deep Git history in hosted shallow clones. Add individual LF attributes for the new canonical admission and schema; existing catalog/inventory/active attributes remain.

The overlay is generated from actual final source bytes before commit and sealed; it does not include its own file/pinning policy in a digest cycle. Exact CI head verification separately binds that source candidate/actual merged main. Future R1 completion is an output of successful acceptance, never a prerequisite for running acceptance.

Active manifest retains its existing outer schema/authority/catalog fields and has exactly one capability row with keys `capabilityId,testFamilies`. Each test-family row has exactly `sourceItemId,testPath,requiredCaseNames` and equals the pinned admission contract. Selected source families are:

| Family ID | Current-main test |
| --- | --- |
| source-3266621c45ba21fc5873f61d | workflowContractV2ExecutionGuard.test.js |
| source-34c61efc427121c81952998a | workflowContractV2RunProvenanceProjection.test.js |
| source-41c31bf3997087539134b1c2 | workflowContractV2RunLeaseDisposal.test.js |
| source-718be8379c70ab754a9d7484 | workflowContractV2RunSchemaType.test.js |
| source-75c07aaa99be8455bdc3285f | workflowContractV2ExecutionBoundary.test.js |
| source-a5eabe004258ac7de4b9ebdb | workflowContractV2TerminalLeaseRelease.test.js |
| source-ba56f810f0c338c02ff4e864 | workflowContractV2RuntimeLeaseScope.test.js |
| source-fde858a48c84d66184d3513a | workflowContractV2RunProvenance.test.js |

All paths are under extensions/workflow-register/test. The first and fifth already exist; preserve their P6 cases. The CLI runs only those fixed current-main files after fresh compilation; no archive modules, arbitrary command/module/root/output options or npm full-suite recursion. Run one fixed file directly under Node at a time, without --test file-isolation workers; the read-only Node 22.23.2 probe confirmed node:test sync/async TAP completion in this mode. Required suites/support must not spawn subprocesses; type checks use the existing TypeScript API. Pin required case names from the implemented tests; missing/skip/cancel/todo required cases or failed children reject success. Keep existing CLI no-args/--check surface, contained readers, an overall 120-second deadline (each child gets only remaining time), settled child exit and a total bounded 1 MiB captured output. Timeout/overflow/malformed or incomplete TAP fail closed. A fail leaves a failure observation, never an inactive empty-suite PASS.

After eight genuine successes emit canonical result schema `workflow-gate-r-result/v2`: `state=ACTIVE_TEST_SUITES_PASSED`, `inventoryValidation=PASSED`, `runtimeSuiteState=PASSED`, `runtimeSuitesExecuted=8`, activeCapabilityIds=[R1], archiveTestsExecuted=0, runtimeActivation=false, catalogSha256, activeManifestSha256, and measured wiring evidence. The named boundary case emits exactly one `R1_PRODUCT_WIRING_BASE64=` marker with exact keys `schemaVersion,counterScope,observedProductSurfaces,v2ProductLeaseAcquisitions,providerDispatches,bobDispatches,v2ProductRunDirectoryCreations,v2ProductArtifactStages`; schema is `workflow-r1-product-wiring/v1`, scope is `contract_v2_product_paths`, surfaces are the literal ordered `validation,registration,operation_hub,authoring,legacy_v1`, and counters are all 0. Runner decodes it after genuine required-case success, derives the five counters, counterScope and wiringObservationSha256, and rejects missing/duplicate/unknown/malformed/nonzero observations. Result has exactly the ten fixed fields above plus those five measured counters, counterScope and wiringObservationSha256; no timing/path/head-dependent fields. Do not invent counters in the runner. Hosted test emits one `GATE_R_ACTIVE_R1_BASE64=` result marker for raw Ubuntu/Windows comparison; old C5 bootstrap v1 evidence is retained unchanged. Hosted GateR test calls active-eight runner only; full regression/policies/package are external subsequent CI commands.

## Packaging, installed UAT and publication

No dependency, package-lock, VSIX version, engine floor or budget increase. Keep 1,200,000-byte package cap. Baseline frozen VSIX is 1,199,956 bytes; raw read-only inspection measured 8,270 bytes for five build/CI-only scripts. Add explicit .vscodeignore exclusions only for scripts/run-unused-checks.js, recompress-vsix.js, check-vsix-policy.js, check-import-cycles.js, check-export-star-policy.js and the new build-only check-contract-v2-runtime-reachability.js after proving no runtime import closure reaches them. Repository scripts remain present/functioning. If needed use existing AST-token/tree-preserving compactor only for new/changed R1 modules named in the final allowlist. No blanket existing-module transformation. If actual R1 package cannot fit this strategy, preserve the attempt and stop; do not relax the cap.

Freeze/hash the actual new VSIX and exercise its installed code: exact provenance/authenticity/lifetime privately, current validation/registration/Operation Hub/authoring shadow refusal, stale package/provider/environment/Bob evidence, no pre-recovery writes, and v1 run/save compatibility. Use owned workspace/profile fixtures and actual VS Code APIs/commands for product surfaces. Label private factory instrumentation accurately; do not claim unmeasured production Bob server counters. Keep final three-extension program UAT not_run.

Fresh independently committed-spec review precedes implementation writes; a fresh whole-source-candidate review and successful local gates precede conditional publication. Use existing exact-head four-workflow cohorts with four new fixed nonces once each, source automatic quality+UI graph, expected event-specific metric skip, raw successful checkout/nonce proof, both-host fixed fixtures, package/host checks. Merge with exact sha/merge_method=merge, actual parents/tree, ff-only primary sync and successful auto push before manual exact-main cohort. Required failure, graph/head drift or rerun stops admission; no automatic retry/redispatch.

Only after source actual-main acceptance add a separate single-ID closed R1 completion import (one dated observation, individual LF, registry/generator/status/tests). No composite scope promotion. Bind accepted R1 source main separately from metadata main and rehash actual external bytes before pinning. Keep old eight completion records/static catalogs and R1 product subtree unchanged in metadata. Fresh metadata review and exact candidate/main CI (automatic UI plus manual four workflows) precede R1 VERIFIED readback and next descriptor WF2-R2-INVOKE. Runtime/activeSliceIds stay inactive/empty.

## Preservation and scope limits

Use a new managed worktree/branch from the audited base after this plan's review. Retain existing four exact remote heads and prior worktrees/profiles/evidence as authorized preservation exceptions; the proposed C6 scope retains new R1 source/metadata branches too. Do not claim remote main-only cleanup. Any additional unknown remote head/open PR or changed retained identity stops publication. Final mandatory-program topology/cleanup remains a later separately authorized gate.

R2 implementation, R3–R5 activation, R6 import/recovery, generic promotion, alternate compiler/cache, public runtime enable flags, provider/Bob task execution, general product run-directory/artifact staging, static source universe/selection/program changes, manual messages/comments, force/admin/auto-merge/queue, archive modification/execution, profile/branch/worktree deletion and final program UAT claims are excluded. Preserve every failed attempt, ruling and minor with copy-exclusive/hash-verified evidence. Minimum risk B remains a floor; new actual effects require escalation before publication.
