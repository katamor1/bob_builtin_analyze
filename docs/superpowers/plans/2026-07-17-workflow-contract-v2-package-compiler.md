# Workflow Contract v2 Package and Single Compiler Implementation Plan

> **Prerequisite:** Foundation F1–F7 are committed, reviewed, and Gate F is green. Follow the master RED/GREEN/review/commit protocol.

**Goal:** Turn an immutable generation into the sole canonical compiled plan, then make all product consumers share it through a plan store and run-safe leases.

**Design:** `../specs/2026-07-17-workflow-contract-v2-design.md`, sections 5–8 and 15–17.

## P1 — Compose the single F4 package shape with pointer and lock shapes

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/packagePointer.ts`
- Create: `extensions/workflow-register/src/core/contractV2/workflowLockShape.ts`
- Create: `extensions/workflow-register/test/workflowContractV2PackageSchema.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/package-schema/valid-minimal.json`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/package-schema/invalid-cases.json`

**Interfaces**

```ts
decodeWorkflowPackagePointer(input: unknown): WorkflowPackagePointer
decodeWorkflowPackageLock(input: unknown): WorkflowPackageLock
```

F4's `parseWorkflowContractV2Yaml` plus `validateWorkflowContractV2PackageShape` is the sole package-document decoder and returns `WorkflowPackageDocumentV2`. P1 does not copy its field tables or add a second semantic pass. Pointer fields are exactly `schemaVersion`, `workflowId`, `generation`, and `packageDigest`. `WorkflowPackageLock`, `WorkflowCompilerPolicyVersions`, provider schema/output/binding evidence, Bob evidence, byte bounds, array order, and literals are exactly the closed interfaces in design section 15; P1 imports those types/constants and its decoder rejects unknown fields rather than maintaining another table with looser types. Lock prompt/schema arrays are each 0–510 and together at most 510 (the loader's 512-file cap minus workflow/lock); providers are 0–256. All arrays are dense and reject over-limit input before entry validation.

- [ ] RED: import F4's accepted document in the package integration fixture and prove P1 exposes no package-document decoder or alternate `WorkflowPackageDocumentV2` definition. Re-run F4's missing/unknown/no-op/variant/predicate/provider/artifact/resume/Bob table through the P4-facing composition path.
- [ ] RED: pointer generation and package digest must be identical `sha256:<hex>` values; workflow id must equal the slot id supplied by the caller.
- [ ] RED: freeze the exact lock record/entry fields from design section 15; reject proxy/accessor/exotic/sparse pointer/lock inputs before semantic reads and prove diagnostics contain no source values.
- [ ] RED: freeze schema identity as exact `{ dialect, id, digest }`, with dialect supplied by the exact JSON-Schema policy literal rather than duplicated per lock entry. Reject a lock/provider/workflow match based only on id, same id with changed digest, equivalent constraints under another id/dialect, and a provider value output whose local schema identity differs at any leaf.
- [ ] GREEN: implement only pointer and lock closed decoders, importing F4's package result type for composition.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2PackageSchema.test.js
```

**Commit:** `feat(workflow): define workflow package v2 schema`

## P2 — Implement the safe slot and generation package loader

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/packageFileSystem.ts`
- Create: `extensions/workflow-register/src/core/contractV2/packageRoot.ts`
- Create: `extensions/workflow-register/src/core/contractV2/packageFileSystemNode.ts`
- Create: `extensions/workflow-register/src/core/contractV2/packageFileSystemVscode.ts`
- Create: `extensions/workflow-register/src/core/contractV2/packageLoader.ts`
- Create: `extensions/workflow-register/test/workflowContractV2PackageLoader.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/packages/minimal-source/files.json`

The fixture describes reviewed logical files. The test harness creates `current.json` and the calculated digest directory in a temporary collection root; do not commit an explanatory file inside a valid generation or hand-copy a stale digest into the plan.

**Interfaces**

```ts
loadCurrentWorkflowPackage(input: {
  readonly fileSystem: WorkflowPackageFileSystem
  readonly collectionRoot: WorkflowPackageRoot
  readonly workflowId: string
}): Promise<LoadWorkflowPackageResult>

loadWorkflowPackageGeneration(input: {
  readonly fileSystem: WorkflowPackageFileSystem
  readonly collectionRoot: WorkflowPackageRoot
  readonly workflowId: string
  readonly generation: string
  readonly expectedPackageDigest?: string
}): Promise<LoadWorkflowPackageResult>

loadWorkflowPackageCandidate(input: {
  readonly fileSystem: WorkflowPackageFileSystem
  readonly collectionRoot: WorkflowPackageRoot
  readonly workflowId: string
  readonly candidate:
    | { readonly kind: "published"; readonly generation: string }
    | { readonly kind: "owned-staging"; readonly name: string; readonly ownershipToken: string }
  readonly expectedPackageDigest?: string
}): Promise<LoadWorkflowPackageResult>

export const WORKFLOW_PACKAGE_V2_LOAD_LIMITS = {
  maxFiles: 512,
  maxDepth: 3,
  maxLogicalPathBytes: 240,
  maxWorkflowBytes: 1_048_576,
  maxLockBytes: 1_048_576,
  maxPromptBytes: 4_194_304,
  maxSchemaBytes: 4_194_304,
  maxTotalBytes: 33_554_432
} as const
```

`WorkflowPackageFileSystem` is a host-neutral, opaque-root interface for lstat/open/read-directory/read-file/realpath/flush/rename operations; it returns logical entry metadata and bytes, never Node paths or VS Code URIs. The Node and VS Code adapters must be behaviorally identical. Load limits are the exported v2 constant and are not caller-adjustable. `loadCurrentWorkflowPackage` and `loadWorkflowPackageGeneration` are narrow wrappers over `loadWorkflowPackageCandidate`. Explicit generation/resume loading never reads `current.json`. Only A2 may request `owned-staging`, and it must present the token from sibling `owner.json`; the loader targets only `.staging-<nonce>/package/`, so ownership metadata is never in raw package files/digests. `RawWorkflowPackage` records `publication: "published" | "staging"`; P5 refuses to cache or lease staging results. Success returns detached bytes/evidence, never a workflow model.

- [ ] RED: load a valid current pointer and explicit generation; assert identical raw bytes, logical paths, file digests, and package digest.
- [ ] RED: reject absolute/backslash/dot-segment paths, symlinks at every component, non-regular files, case-fold/Unicode-normalization duplicates, unexpected physical root files/directories, and generation/pointer digest mismatch. At this layer, do not reject a prompt/schema because it is semantically missing, unreferenced, or used in incompatible roles; P4 owns those checks after F4.
- [ ] RED: use a mutating filesystem double to change a file between metadata/read/enumeration; prove one coherent descriptor/byte snapshot or fail closed, never mixed bytes.
- [ ] RED: enforce exact file count, per-file bytes, total package bytes, depth, and logical-path length limits before allocation where possible.
- [ ] RED: leave a sibling pointer temp file and staging generation; prove normal discovery still reads only valid `current.json` and published digest generations.
- [ ] RED: reject staging loads without an exact ownership token and prove a successfully compiled staging candidate cannot enter the plan store or runtime.
- [ ] GREEN: perform physical containment/snapshot checks through the host-neutral interface, enumerate without following links, and hash exact stored bytes without decoding or normalization. Add a shared adapter-conformance suite and run it against Node and VS Code doubles.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2PackageLoader.test.js test/physicalPathMatcher.test.js test/workflowRunDurabilityPath.test.js
```

**Commit:** `feat(workflow): load immutable workflow package generations`

## P3 — Generate and verify the deterministic lockfile

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/workflowLock.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Lock.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/lock/expected.lock.json`

**Interfaces**

```ts
generateWorkflowPackageLock(input: GenerateWorkflowPackageLockInput): WorkflowPackageLock
verifyWorkflowPackageLock(input: VerifyWorkflowPackageLockInput): VerifyWorkflowPackageLockResult
encodeWorkflowPackageLock(lock: WorkflowPackageLock): Buffer

export const WORKFLOW_COMPILER_CONTRACT_VERSION = "workflow-register-compiler/v2" as const
export const WORKFLOW_COMPILER_POLICY_VERSIONS: WorkflowCompilerPolicyVersions = Object.freeze({
  canonicalJson: "workflow-contract-canonical-json/v1",
  diagnostics: "workflow-contract-diagnostics/v1",
  yaml: "workflow-contract-yaml/v2",
  packageShape: "workflow-contract-package-shape/v2",
  jsonSchema: "workflow-contract-json-schema/2020-12-v1",
  predicate: "workflow-contract-predicate/v2",
  provider: "workflow-contract-provider/v2",
  bob: "workflow-contract-bob/2.0.1",
  artifact: "workflow-contract-artifact/v2"
})
```

- [ ] RED: generate twice from permuted source/provider/capability insertion orders and obtain byte-identical canonical lock bytes/digest. Assert exact section-15 fields/literals, prompt/schema `(id,path)` order, provider id order, capability code-unit order, uniqueness, and every exact byte bound.
- [ ] RED: independently mutate workflow bytes, each prompt, each schema, provider id/requested/exact version/contract/input/output/error schema bytes/digest, unit/value kind, side-effect/idempotency, Bob field/capability, compiler literal, and each of the nine policy literals; assert one sorted `WF2_LOCK_MISMATCH` diagnostic per drift.
- [ ] RED: reconstruct the exact `workflow-register-compiler-environment/v2` preimage from selected locked providers, locked Bob binding, compiler literal, and exact policy record; assert `environmentDigest` equality and reject any omitted/additional/reordered leaf. Prove purpose/private dispatch/unselected registry entries cannot affect it.
- [ ] RED: reject missing/additional lock entries, duplicate logical paths, stale raw lock bytes, and a lock that embeds package digest (which would create a cycle).
- [ ] RED: prove verification performs no writes and registration/runtime cannot call the generator through an exported path.
- [ ] GREEN: construct lock data only from raw package evidence plus frozen provider/Bob/compiler snapshots; encode with F1 and compare exact evidence.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Lock.test.js
```

**Commit:** `feat(workflow): add deterministic workflow package lock`

## P4 — Implement the only executable Contract v2 compiler

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/compiledPlan.ts`
- Create: `extensions/workflow-register/src/core/contractV2/compiler.ts`
- Create: `extensions/workflow-register/src/core/contractV2/compilerEnvironment.ts`
- Create: `extensions/workflow-register/src/core/contractV2/index.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Compiler.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/compiler/valid-source/files.json`

**Interface**

```ts
compileWorkflowPackage(input: {
  readonly rawPackage: RawWorkflowPackage
  readonly environment: WorkflowCompilerEnvironment
}): WorkflowPackageCompileResult

createAuditedWorkflowCompilerEnvironment(input: {
  readonly purpose: "runtime" | "authoring-validation" | "evidence"
  readonly providerCatalog: WorkflowProviderCatalog
  readonly bobProfile: BobContractProfile
}): WorkflowCompilerEnvironment
```

Success is one opaque frozen `CompiledWorkflowPlanHandle`. Its public deeply frozen canonical `plan` records package/lock/environment digests, prompts as `{ id, text, digest }` with normalized UTF-8/LF `text` (never `Buffer`), schema catalog evidence, predicates, artifacts, exact provider/Bob evidence, literal compiler version `workflow-register-compiler/v2`, and the exact nine-key P3 policy record. `plan` has no `planDigest` field. The compiler computes `planDigest = canonicalJsonDigest(plan)` only after freezing `plan` and exposes it beside `plan` on the frozen handle/evidence wrapper. Private handle state retains validator identities, normalized prompt bytes, and the exact dispatch functions selected from F6's branded immutable snapshot.

`createAuditedWorkflowCompilerEnvironment` is the only environment constructor. It imports the P3 literals `workflow-register-compiler/v2` and the exact nine-key `WORKFLOW_COMPILER_POLICY_VERSIONS`; callers cannot supply alternatives. It verifies the F6/F7 private brands/golden constants, freezes the exact section-15 environment preimage, and keeps purpose/dispatches private. `runtime` handles are leasable; staging `authoring-validation` and standalone `evidence` handles are non-leasable. Purpose is excluded from public plan and every digest.

- [ ] RED: table-test the exact pipeline order: raw layout → strict YAML → closed package schema → local schemas → references/predicates → provider/Bob bind → lock → policy → canonical plan/freeze. Use inputs failing two stages and assert only the earlier stage runs.
- [ ] RED: after F4/P1 decoding, reject missing/unreferenced prompt/schema files, duplicate declarations, incompatible schema roles, and reference/role mismatches here—not in P2. Resolve each schema to one exact `{ dialect, id, digest }` identity, retain it in the plan, and require full identity equality for provider value-output compatibility. Assert exact semantic locations.
- [ ] RED: compile predicate placement/dominance exactly: input `requiredWhen` has inputs only; step entry/templates/context/result have strictly earlier lexical value outputs; an outgoing transition alone may see its owning value output. Unit/current-at-entry/future/transient references fail. The compiled transition is marked `postCommit` so no runtime adapter can evaluate it against an entry snapshot.
- [ ] RED: compile a valid package repeatedly with permuted catalog insertion order and assert identical plan bytes/digest and a recursively frozen detached plan. Recompute the digest from `handle.plan`, assert equality with `handle.planDigest`, and assert `"planDigest" in handle.plan` is false.
- [ ] RED: prove public prompt values are JSON strings with LF/no BOM and never Buffers; private prompt bytes render identically. `JSON.stringify(handle.plan)` must include no Node-specific value.
- [ ] RED: mutate/dispose/re-register the live provider registry after the F6 snapshot and compilation; invocation through the handle retains the exact captured dispatch identity and frozen evidence.
- [ ] RED: prove loader output itself cannot be passed to engine/Bob and that no compiler failure registers a plan, creates a run, calls a provider, or writes a lock.
- [ ] RED: assert the plan's runtime template/predicate representation is fully compiled; runtime needs no YAML, Markdown parser, AJV schema source read, provider lookup, or Bob profile lookup.
- [ ] GREEN: normalize/decode semantic text only inside the compiler, keep validators/dispatches/bytes in closure/private `WeakMap`, calculate environment digest from the exact section-15 preimage, freeze public plan, calculate its digest, then freeze the wrapper.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Compiler.test.js
npm run architecture:policy
```

**Commit:** `feat(workflow): add single workflow package compiler`

## P5 — Add plan store, package invalidation, and run leases

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/planStore.ts`
- Create: `extensions/workflow-register/src/core/contractV2/planLease.ts`
- Create: `extensions/workflow-register/test/workflowContractV2PlanStore.test.js`
- Modify: `extensions/workflow-register/src/workflowRuntimeFactory.ts`

**Interface**

```ts
class WorkflowPlanStore {
  acquire(input: AcquireWorkflowPlanInput): Promise<WorkflowPlanLease>
  invalidateSlot(collectionId: string, workflowId: string): void
}

interface WorkflowPlanLease {
  readonly handle: CompiledWorkflowPlanHandle
  readonly released: boolean
  release(): void
}
```

- [ ] RED: coalesce concurrent identical acquisitions into one compile and the same handle instance; key by package plus environment digest.
- [ ] RED: change each package file and assert slot-wide invalidation/new compile. Keep an old lease and prove its handle/digests never change.
- [ ] RED: reject stale-success fallback after a new compile failure; never cache transient failure as an executable plan.
- [ ] RED: evict only unleased entries; reload a recorded immutable generation without consulting `current.json`; fail when generation/exact environment is unavailable.
- [ ] RED: assert `lease.release()` decrements once and every second/subsequent call is an idempotent no-op; after release only `released` inspection and `release()` are legal, while handle/use operations throw a deterministic programmer error. Assert the store exposes no public competing `release(lease)` and reference counts never underflow.
- [ ] GREEN: store immutable handle identity, promise-coalesce compilation, and centralize watcher invalidation at slot granularity.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2PlanStore.test.js test/runtimeWiring.test.js
```

**Commit:** `feat(workflow): cache immutable workflow plan leases`

## P6 — Route all product entry points through the compiler facade

**Files**

- Modify: `extensions/workflow-register/src/workflowDiscovery.ts`
- Modify: `extensions/workflow-register/src/workflowDefinitionLoader.ts`
- Modify: `extensions/workflow-register/src/core/workflowValidator.ts`
- Modify: `extensions/workflow-register/src/workflowRegistrationService.ts`
- Modify: `extensions/workflow-register/src/bobWorkflowFactory.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubProvider.ts`
- Modify: `extensions/workflow-register/src/commands/validateWorkflow.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Entrypoints.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/transitional-legacy-import-allowlist.json`
- Modify: `extensions/workflow-register/test/architectureContracts.test.js`

- [ ] RED: feed one valid and one deliberately invalid generation to validation, workspace registration, run creation, Bob adapter, Operation Hub, and command validation. Assert the same plan digest/handle for success and identical sorted diagnostics for failure.
- [ ] RED: monkey-patch the compiler facade export before loading consumers; assert every named consumer calls it. This check was intentionally deferred from F6 until the owning compiler module exists.
- [ ] RED: source-scan the newly routed v2 consumer files above and reject their direct imports of YAML/parser, F3, predicate compiler, provider binder, Bob binder, lock verifier, or package internals outside `contractV2/compiler.ts` and its explicit helpers. During the additive phase, legacy-only modules may retain imports only when their exact path/import/reason is in the frozen transitional allowlist; a new or widened entry fails review. C7 deletes the allowlist and applies the global zero-legacy assertion.
- [ ] RED: prove a compile failure produces no registered item, run directory, provider invocation, Bob task, or Operation Hub executable action.
- [ ] GREEN: retain plan leases/plan ids in registration and UI view models; format F2 diagnostics only at presentation boundaries.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Entrypoints.test.js test/architectureContracts.test.js test/registrationWiring.test.js test/operationHub.test.js test/bobWorkflowFactory.test.js
```

**Commit:** `refactor(workflow): route all consumers through v2 compiler`

## P7 — Produce deterministic compiled-plan manifests

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/compiledPlanManifest.ts`
- Create: `extensions/workflow-register/scripts/compile-workflow-contract-v2-packages.js`
- Create: `extensions/workflow-register/scripts/lib/workflow-contract-v2-environment.js`
- Create: `extensions/workflow-register/test/workflowContractV2Manifest.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection/sample/current.json`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection/sample/versions/<reviewed-package-digest>/**`
- Modify: `extensions/workflow-register/package.json`

**Manifest**

```json
{
  "schemaVersion": "workflow-compiled-plan-manifest/v1",
  "compilerContractVersion": "workflow-register-compiler/v2",
  "packages": [
    {
      "collection": ".bob/workflows",
      "slot": "...",
      "generation": "sha256:...",
      "packageDigest": "sha256:...",
      "lockfileDigest": "sha256:...",
      "environmentDigest": "sha256:...",
      "planDigest": "sha256:..."
    }
  ]
}
```

- [ ] RED: permute collection/discovery/filesystem enumeration order and assert identical LF canonical bytes. Key, sort, and enforce uniqueness by canonical repository-relative `(collection, slot)`; allow the same child slot id in different collections and reject only duplicate pairs or any package compile failure.
- [ ] RED: require either repeated `--collection <repository-relative-root>` arguments or one `--collections <canonical-json-file>`, plus one explicit `--provider-catalog <repository-relative-canonical-json>`; reject implicit recursive discovery, overlapping roots, absolute/escaping roots/catalog paths, and unbranded/ad-hoc environment input.
- [ ] RED: run the CLI twice into separate files and compare exact bytes; assert paths are repository-relative POSIX and contain no temp/worktree roots.
- [ ] RED: change one prompt/schema/provider/Bob binding and assert only the owning package evidence changes predictably.
- [ ] GREEN: run through P2's Node adapter. `workflow-contract-v2-environment.js` reads the explicit canonical provider contract file, registers compile-only throwing dispatches into F6, snapshots the branded catalog, and calls P4's audited constructor once with the exact F7 Bob profile and `purpose: "evidence"`; the constructor itself supplies the immutable compiler/policy literals. C2 imports this same helper; focused P7 tests use the fixture catalog, while C3 freezes the repository catalog used by conversions/CI. Compile each current plan directly as non-leasable evidence, sort by `(collection, slot)`, and write one canonical manifest after all compiles succeed. Never guess collection roots or construct an ad-hoc compiler environment.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Manifest.test.js
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collection extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection --provider-catalog extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json --manifest /tmp/contract-v2-a.json
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collection extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-collection --provider-catalog extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json --manifest /tmp/contract-v2-b.json
cmp /tmp/contract-v2-a.json /tmp/contract-v2-b.json
```

Before C3 the repository still contains legacy definitions, so the CLI's fixture root is used for GREEN. Repository-root success becomes the C9 gate.

**Commit:** `feat(workflow): emit deterministic compiled plan manifest`

## Package/compiler phase gate

Run master Gate P, record full-suite counts, and obtain independent architecture review. Runtime and authoring plans may start only after consumers share the same compiler handle in P6 and manifest determinism is green in P7.
