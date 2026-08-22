# Workflow Contract v2 Atomic Authoring Implementation Plan

> **Prerequisite:** Package/compiler P1–P7 are reviewed. Runtime R1 may proceed in parallel, but A5 waits for R6. Follow the master RED/GREEN/review/commit protocol.

**Goal:** Make every authoring save publish one complete immutable generation and atomically switch `current.json`, including Windows failure behavior, while authoring only Contract v2 packages.

**Design:** `../specs/2026-07-17-workflow-contract-v2-design.md`, sections 5, 15, and 19–20.

## A1 — Implement slot, generation, and pointer storage operations

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/slotStore.ts`
- Create: `extensions/workflow-register/src/core/contractV2/atomicPointer.ts`
- Create: `extensions/workflow-register/test/workflowContractV2SlotStore.test.js`
- Modify: `extensions/workflow-register/src/core/runtime/workspaceFileTransaction.ts`

**Interfaces**

```ts
class WorkflowPackageSlotStore {
  inspect(input: InspectSlotInput): Promise<WorkflowPackageSlotInspection>
  createStaging(input: CreateStagingInput): Promise<WorkflowPackageStagingWriter>
  publishGeneration(input: PublishGenerationInput): Promise<PublishedGeneration>
  replaceCurrent(input: ReplaceCurrentPointerInput): Promise<void>
}
```

- [ ] RED: create a slot only under a validated collection root/id. Exclusively create `versions/.staging-<nonce>/owner.json` plus sibling `package/`; write package files only below `package/`. The owner record is control metadata, never an allowed package file.
- [ ] RED: reject absolute/dot/backslash/alias/symlink paths, existing foreign staging, digest-directory overwrite with different bytes, pointer outside the slot, and unresolved environment/glob targets.
- [ ] RED: publish identical package bytes twice and idempotently reuse the exact digest generation; different bytes never overwrite an existing digest directory. No operation edits a published generation; a normal product-authoring correction calls A2 with a complete new file map and yields a new digest.
- [ ] RED: pointer replacement writes canonical JSON to a sibling temp, flushes it, atomically replaces `current.json`, and leaves no state where readers see partial JSON. Exercise the filesystem adapter's POSIX and Windows branches.
- [ ] GREEN: keep physical operations in this store and semantic checks in P2/P4. Reuse safe path validation and workspace transaction primitives rather than shell/delete commands.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2SlotStore.test.js test/workspaceFileTransaction.test.js test/workflowRunDurabilityPath.test.js
```

**Commit:** `feat(workflow): add immutable workflow slot storage`

## A2 — Save by staging compile and atomic pointer replacement

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/packageSave.ts`
- Create: `extensions/workflow-register/src/core/contractV2/packageSaveFaults.ts`
- Create: `extensions/workflow-register/test/workflowContractV2AtomicSave.test.js`
- Modify: `extensions/workflow-register/src/core/workflowAuthoringSerializer.ts`

**Interface**

```ts
saveWorkflowPackage(input: {
  readonly fileSystem: WorkflowPackageFileSystem
  readonly collectionRoot: WorkflowPackageRoot
  readonly workflowId: string
  readonly files: ReadonlyMap<string, Buffer>
  readonly expectedCurrent?: string
  readonly compilerEnvironment: WorkflowCompilerEnvironment
  readonly faultController?: WorkflowPackageSaveTestFaultController
}): Promise<SaveWorkflowPackageResult>
```

The fault controller type is available only from a test-support module and cannot be activated by configuration/environment in production.

`saveWorkflowPackage` is the normal product authoring transaction and owns its pointer replacement. C2 repository migration must not call it and then update migration evidence separately; C2 validates the complete candidate, calls A1 `publishGeneration`, and uses its script-only durable journal to switch the pointer/evidence pair.

- [ ] RED: assert the exact order: exclusive staging control/owner → `package/` files → file flushes → package/control directory flushes → P2 owned-`package/` load → P4 authoring-validation compile → rename only `package/` to digest → remove staging control → pointer temp write/flush → pointer replace → success notification. Assert `owner.json` is absent from loader files, lock evidence, package digest, plan, and published generation.
- [ ] RED: inject a failure before/after every operation. Before pointer replace, old `current.json` bytes and discoverable generation remain exact. After pointer replace, the new complete generation is discoverable and compiles.
- [ ] RED: save with an invalid schema, lock drift, provider mismatch, Bob mismatch, predicate error, or required-artifact contract error; assert no generation/pointer publication and stable diagnostics.
- [ ] RED: perform compare-and-swap with `expectedCurrent`; concurrent saves from the same base allow one pointer update and return a conflict for the other without deleting either complete generation.
- [ ] RED: change source files after the caller constructs the map; prove the save owns detached bytes and never rereads editor/workspace files during compile.
- [ ] GREEN: load `.staging-<nonce>/package/` through P2's candidate-generation loader using the out-of-band owner token, compile exactly those bytes with the audited authoring environment, rename only that package subtree to the calculated digest, remove control metadata, then replace the pointer only with compiler-returned evidence.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2AtomicSave.test.js
```

**Commit:** `feat(workflow): save workflow packages atomically`

## A3 — Convert authoring model, commands, and Builder to v2 packages

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/authoringModel.ts`
- Create: `extensions/workflow-register/src/commands/refreshWorkflowPackageLock.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Authoring.test.js`
- Modify: `extensions/workflow-register/src/core/workflowAuthoringLoader.ts`
- Modify: `extensions/workflow-register/src/core/workflowAuthoringModel.ts`
- Modify: `extensions/workflow-register/src/core/workflowAuthoringSerializer.ts`
- Modify: `extensions/workflow-register/src/commands/createWorkflow.ts`
- Modify: `extensions/workflow-register/src/commands/openWorkflowBuilder.ts`
- Modify: `extensions/workflow-register/src/commands/editWorkflowInBuilder.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`
- Modify: `extensions/workflow-register/package.json`

- [ ] RED: create/open/edit round-trip a v2 package with external prompt/schema files; preserve intentional array order and produce deterministic YAML/Markdown/JSON bytes.
- [ ] RED: Builder preview invokes P4 and shows F2 diagnostics. Save stays disabled for unknown/no-op/step-inapplicable fields, invalid references, schema/ref errors, provider/Bob mismatch, or lock drift.
- [ ] RED: `refreshWorkflowPackageLock` is an explicit user action with preview/confirmation and writes only through A2; normal validate/open/edit/save/run never regenerates the lock.
- [ ] RED: product commands reject `WORKFLOW.md`, v1 schema, and legacy layout with unsupported version/layout diagnostics; they do not offer a shipped converter.
- [ ] RED: inline prompts are edited as named prompt files; required artifacts always select/create content schemas; provider input/error plus value-output-schema or unit-output roles are visible and closed.
- [ ] RED: round-trip every exact F4 leaf without UI defaults changing contract bytes: four discriminated form fields and typed defaults/select options, manual object output, value/unit output and byte bounds, artifact path/media/schema/maxBytes/owner/required, and provider side-effect/idempotency/capabilities. Invalid path/media/bounds or a unit/value mismatch stays unsavable.
- [ ] GREEN: make the v2 authoring model the only Builder model, serialize a complete detached file map, and delegate publication to A2. Keep UI strings/presentation outside compiler data.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Authoring.test.js test/workflowBuilderTransactionalSave.test.js test/workflowAuthoring.test.js test/workflowAuthoringLoader.test.js test/workflowAuthoringSerializer.test.js
```

**Commit:** `feat(workflow): author workflow package v2 only`

## A4 — Diagnose orphan staging and clean conservatively

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/generationRecovery.ts`
- Create: `extensions/workflow-register/test/workflowContractV2GenerationCleanup.test.js`
- Modify: `extensions/workflow-register/src/core/runDiagnostics.ts`
- Modify: `extensions/workflow-register/src/commands/inspectRunDiagnostics.ts`

**Interface**

```ts
inspectWorkflowPackageStorage(input: InspectWorkflowPackageStorageInput): Promise<WorkflowPackageStorageReport>
planWorkflowPackageCleanup(report, policy): WorkflowPackageCleanupPlan
executeWorkflowPackageCleanup(plan): Promise<WorkflowPackageCleanupResult>
```

- [ ] RED: classify owned/foreign/live/stale staging, pointer temps, malformed pointer, missing generation, referenced/unreferenced digest generation, and generation held by a live/persisted run lease.
- [ ] RED: inspection is read-only. Cleanup requires explicit targets from a prior report, revalidates physical identity/ownership/age, and refuses current or run-referenced generations.
- [ ] RED: startup reports but never automatically selects, repairs, or executes an orphan generation. A complete unreferenced generation remains non-current.
- [ ] RED: race cleanup against save/resume and prove changed identity/current/lease cancels deletion. Use recoverable deletion where the platform adapter provides it.
- [ ] GREEN: share P2 path classification and the runtime lease inventory; surface only redacted relative diagnostic evidence.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2GenerationCleanup.test.js test/workflowRunCleanupTransaction.test.js test/workflowRunRetentionPlanner.test.js
```

**Commit:** `feat(workflow): diagnose workflow generation recovery`

## A5 — Prove POSIX/Windows authoring parity and pointer safety

**Files**

- Create: `extensions/workflow-register/test/workflowContractV2AuthoringParity.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/authoring-parity/expected-tree.json`
- Modify: `.github/workflows/workflow-contracts.yml`
- Modify: `extensions/workflow-register/test/workflowContractV2AtomicSave.test.js`

- [ ] RED: run the same logical save sequence through POSIX and Windows filesystem semantics (case folding, rename destination behavior, separators, locked pointer handle) and compare logical generation tree, pointer bytes, package digest, and plan digest.
- [ ] RED: exercise crash/failure cases for every A2 boundary on both adapters; readers see exactly old or new pointer bytes, never missing/partial authoritative state.
- [ ] RED: use real CI jobs on `ubuntu-latest` and `windows-latest` to run focused authoring/runtime-resume tests and upload result manifests with commit SHA.
- [ ] GREEN: isolate platform-specific replace/flush behavior behind A1. Do not branch canonical logical paths or evidence by `process.platform` outside that adapter.
- [ ] Verify locally:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2AuthoringParity.test.js test/workflowContractV2AtomicSave.test.js test/workflowContractV2Resume.test.js
npm test
git diff --check
```

Then record both CI job URLs and artifact digests.

**Commit:** `test(workflow): prove atomic package save parity`

## Authoring phase gate

Run master Gate R/A's authoring command and the full extension suite. Review must confirm all A2 failure injections preserve old pointer authority, cleanup cannot revoke live plans, and normal save never updates a lock implicitly.
