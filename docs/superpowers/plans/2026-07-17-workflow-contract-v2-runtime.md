# Workflow Contract v2 Runtime Integration Plan

> **Prerequisite:** Package/compiler P1–P7 are reviewed and Gate P is green. Follow the master RED/GREEN/review/commit protocol.

**Goal:** Execute only leased compiled plans, persist their complete provenance, validate provider values and artifacts before commit, and resume the exact recorded generation.

**Design:** `../specs/2026-07-17-workflow-contract-v2-design.md`, sections 12–14 and 17–18.

## R1 — Persist plan provenance and bind a lease to run lifetime

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/runPlanProvenance.ts`
- Create: `extensions/workflow-register/test/workflowContractV2RunProvenance.test.js`
- Modify: `extensions/workflow-register/src/core/engine/runState.ts`
- Modify: `extensions/workflow-register/src/core/runtime/runStateCodec.ts`
- Modify: `extensions/workflow-register/src/core/runProvenance.ts`
- Modify: `extensions/workflow-register/src/core/engine/runExecutionCoordinator.ts`

**Persisted shape**

```ts
interface WorkflowContractV2RunPlanProvenance {
  readonly schemaVersion: "workflow-run-plan-provenance/v1"
  readonly workflowId: string
  readonly generation: string
  readonly planDigest: string
  readonly packageDigest: string
  readonly lockfileDigest: string
  readonly environmentDigest: string
  readonly compilerContractVersion: "workflow-register-compiler/v2"
  readonly providerExactBindings: readonly CompiledProviderBinding[]
  readonly bobProfileBinding: CompiledBobProfileBinding
}
```

- [ ] RED: create a run from a plan lease and compare every persisted field to the handle. Reopen the run and verify the provenance codec without consulting current package discovery.
- [ ] RED: mutate/omit each digest, generation, provider binding, Bob binding, and compiler version; reject before run state transition or provider dispatch.
- [ ] RED: simulate create failure at every state/journal write; assert cleanup may call idempotent `lease.release()` from overlapping paths but the store reference count decrements exactly once and no incomplete run becomes runnable.
- [ ] RED: hold a live run, invalidate/recompile its slot, and prove the old run's in-memory handle and persisted evidence remain identical.
- [ ] GREEN: make run creation require a lease rather than a workflow model; retain it until terminal/dispose and store only canonical detached provenance.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2RunProvenance.test.js test/workflowRunProvenance.test.js test/workflowRunExecutionCoordinator.test.js
```

**Commit:** `feat(workflow): persist leased plan provenance`

## R2 — Validate provider input, output, and error envelopes

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/providerInvocation.ts`
- Create: `extensions/workflow-register/test/workflowContractV2ProviderInvocation.test.js`
- Modify: `extensions/workflow-register/src/core/actionRegistry.ts`
- Modify: `extensions/workflow-register/src/core/engine/stepExecutor.ts`
- Modify: `extensions/workflow-register/src/core/reportedActionError.ts`

**Interface**

```ts
invokeCompiledWorkflowProvider(input: {
  readonly lease: WorkflowPlanLease
  readonly stepId: string
  readonly value: unknown
  readonly signal: AbortSignal
  readonly attempt: WorkflowAttemptStaging
}): Promise<CompiledProviderInvocationResult>
```

- [ ] RED: invalid input returns `WF2_PROVIDER_INPUT_INVALID`, calls the adapter zero times, writes no attempt output, and makes no run-state mutation.
- [ ] RED: valid input plus invalid output returns `WF2_PROVIDER_OUTPUT_INVALID`; the adapter is called once but success/result state and artifact commit counts remain zero.
- [ ] RED: a value contract validates/detaches canonical output and enforces the 16,777,216-byte bound. A unit contract accepts only `undefined`, creates no committed-output id, and rejects every JSON/non-`undefined` return as `WF2_PROVIDER_OUTPUT_INVALID` with zero success/artifact commit.
- [ ] RED: thrown/reported errors matching the bound error schema produce the typed failure path; malformed errors produce `WF2_PROVIDER_ERROR_INVALID` without persisting source-controlled fields.
- [ ] RED: enforce the bound side-effect/idempotency contract: `none` receives no writer/effect capability, `workspace-write` requires `workflow.effect.workspace-write` and receives only attempt staging, `external` requires `workflow.effect.external`, identical-key retry is the only automatic `key-required` retry, and an ambiguous `non-idempotent` attempt fails closed without redispatch.
- [ ] RED: mutate/dispose/re-register the live registry after F6 snapshot/P4 compilation and prove invocation uses the lease handle's exact private dispatch identity, never re-resolves a new version or reads the live registry.
- [ ] RED: reject proxy/accessor/exotic/sparse provider values before validator/source behavior and prove validation returns the F1-frozen detached value.
- [ ] GREEN: look up the compiled private validator set by handle brand, validate input before adapter call, snapshot output/error once, and return only staged detached data.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2ProviderInvocation.test.js test/actionRegistry.test.js test/stepRuntimeCompletion.test.js
```

**Commit:** `feat(workflow): validate bound provider invocations`

## R3 — Stage, validate, and atomically commit required artifacts

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/artifactTransaction.ts`
- Create: `extensions/workflow-register/test/workflowContractV2ArtifactTransaction.test.js`
- Modify: `extensions/workflow-register/src/core/artifacts/artifactManifest.ts`
- Modify: `extensions/workflow-register/src/core/engine/resultWriters.ts`
- Modify: `extensions/workflow-register/src/core/runtime/workspaceFileTransaction.ts`
- Modify: `extensions/workflow-register/src/core/engine/runExecutionCoordinator.ts`

**Transaction order**

```text
attempt staging write -> flush -> enumerate exact set -> hash
-> command/agent/manual output validation -> required-artifact completeness
-> artifact content-schema validation -> canonical manifest
-> committed directory promotion + flush
-> attempt transaction + run success/output durable commit
-> outgoing transition evaluation + route publication
```

- [ ] RED: missing `required: true` artifact returns `WF2_REQUIRED_ARTIFACT_MISSING`; wrong hash, unexpected artifact, wrong owner, path/media mismatch, maxBytes overflow, path escape, link, duplicate/case/NFC alias, or schema-invalid content returns `WF2_ARTIFACT_SCHEMA_INVALID`.
- [ ] RED: inject failures before/after each write, flush, validation, manifest, directory rename, and success-state publish. Until promotion and manifest are complete, committed artifact count and success-state writes are zero. Until the success/output transaction is durably committed, outgoing transition evaluation count is zero.
- [ ] RED: prove staging artifacts cannot seed/reuse, cannot appear in Operation Hub success output, and cannot be read by another run/attempt.
- [ ] RED: validate every artifact from one exact-byte snapshot. Check file/path/owner/media/size/digest before decoding. `application/json` and `+json` require BOM-free strict UTF-8, one JSON value, duplicate-key rejection, and detached canonical JSON schema input; `text/*` requires BOM-free strict UTF-8 and validates the exact unnormalized string; every other media type validates the padded RFC 4648 base64 string of the exact bytes. Test invalid UTF-8/BOM/duplicate JSON keys/extra JSON values, media mismatch, binary padding, redacted decode diagnostics, and zero promotion/commit on every failure.
- [ ] RED: on crash after promotion but before state publish, recovery identifies an unreferenced committed attempt without claiming run success; replay is idempotent and never overwrites an existing committed directory.
- [ ] GREEN: reuse established safe run paths and transaction primitives; fsync files/manifest/directories where supported; publish the canonical manifest and durable success/output transaction under the existing run lease/CAS boundary. Only R4 may evaluate the compiled `postCommit` transition afterward.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2ArtifactTransaction.test.js test/workflowArtifactManifest.test.js test/workflowArtifactSeedRun.test.js test/workflowRunJournal.test.js
```

**Commit:** `feat(workflow): commit validated v2 artifacts atomically`

## R4 — Execute compiled steps and predicates without source reparse

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/compiledPlanRuntime.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Runtime.test.js`
- Modify: `extensions/workflow-register/src/core/engine/preflight.ts`
- Modify: `extensions/workflow-register/src/core/engine/templateRenderer.ts`
- Modify: `extensions/workflow-register/src/core/branching/transitionResolver.ts`
- Modify: `extensions/workflow-register/src/core/engine/stepExecutor.ts`
- Modify: `extensions/workflow-register/test/architectureContracts.test.js`

- [ ] RED: run a compiled fixture through preflight, prompt rendering, transitions, and execution; assert all observed plan/package digests equal the lease.
- [ ] RED: use the F5 golden predicate fixture with exactly `{ inputs, committedOutputs }`. Input-required and step-entry checks receive inputs plus strictly prior durable outputs. After R2/R3 validation, artifact promotion, and durable run success/output commit, the owning `postCommit` transition receives a fresh snapshot that additionally contains that step's value output. Compare every operator/pointer and all 15 frozen human-gate `/decision` cases (C1 items 01 and 05–18).
- [ ] RED: construct agent and manual form/approval outputs as detached JSON, enforce their compiled schema and 16,777,216-byte bound before R3 success commit, and prove an invalid/manual-oversize output evaluates no transition. For each human gate, `decision` is exactly `approved|rejected` and is absent from every precommit context.
- [ ] RED: reject/never execute same-step refs in entry/template/context/result, unit-output refs, other-step same/future refs, and transient/uncommitted values. Require current step id, attempt id, and durable success revision on the same-step output commit so a stale loop-iteration value cannot satisfy `postCommit`. Inject provider/error/artifact/success-commit failures and assert zero transition evaluations/next-step dispatches. Crash after success commit but before route publication must re-evaluate deterministically without re-running the step; missing/corrupt/mismatched committed output holds routing fail-closed.
- [ ] RED: mutate package files and `current.json` after run start; execution bytes, prompt, schemas, provider binding, and next step remain those in the lease.
- [ ] RED: architecture scan runtime modules for imports of `fs` package sources, YAML/parser, raw JSON Schema documents, provider catalog lookup, lock verifier, or package loader. Allow only compiled-plan runtime APIs.
- [ ] RED: inject an object shaped like a plan but lacking the private handle/lease brand and reject it before execution.
- [ ] RED: execute the complete implicit/explicit control-flow table from F4: start at index 0; false entry predicate records skip and advances lexically without an attempt/transition; committed success evaluates ordered decisions then default, or advances lexically when transition is absent; required failure fails; optional failure records and advances without transition; lexical exhaustion/`$end` completes and `$fail` fails. Crash replay must not convert a skip/optional failure into a provider dispatch or re-evaluate a transition that was never eligible.
- [ ] GREEN: adapt compiled step AST into the existing engine at one boundary; render precompiled template segments and evaluate the shared F5 AST only. Use separate entry and post-commit context builders so a current output cannot enter any precondition by accident.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Runtime.test.js test/workflowEnginePreflightDefaults.test.js test/workflowBranchingEngine.test.js test/workflowEngineCore.test.js test/architectureContracts.test.js
```

**Commit:** `refactor(workflow): execute only compiled v2 plans`

## R5 — Call the F7 Bob task probe before the first dispatch

**Files**

- Create: `extensions/workflow-register/test/workflowContractV2BobRuntime.test.js`
- Modify: `extensions/workflow-register/src/bobWorkflowFactory.ts`
- Modify: `extensions/workflow-register/src/bobWorkflowRunner.ts`
- Modify: `extensions/workflow-register/src/bobApi.ts`

- [ ] RED: matching audited activation profile plus task handle succeeds and records the lease plan/profile digest in Bob runtime state.
- [ ] RED: missing/wrong task method, descriptor, capability, task version, workflow id, or plan correlation yields `WF2_BOB_CAPABILITY_MISMATCH` before step/provider dispatch.
- [ ] RED: a proxy/accessor task handle is rejected without invoking traps/getters beyond the explicitly captured Bob API call that returned it.
- [ ] RED: replace the package/current generation between activation binding and task creation; prove the probe checks the existing lease, not current discovery.
- [ ] GREEN: call F7's sole `probeBobTaskCapabilities()` with the exact golden profile requirements compiled into P4. R5 adds orchestration only—no second task descriptor snapshot, capability validator, or Bob constants—and never mutates/recompiles the plan from probe results.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2BobRuntime.test.js test/bobWorkflowFactory.test.js test/bobGateLifecycle.test.js test/bobTaskSync.test.js
```

**Commit:** `feat(workflow): verify bob task binding before execution`

## R6 — Resume the pinned generation and recover transaction boundaries

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/runPlanRecovery.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Resume.test.js`
- Modify: `extensions/workflow-register/src/workflowRunCommands.ts`
- Modify: `extensions/workflow-register/src/workflowRuntimeFactory.ts`
- Modify: `extensions/workflow-register/src/core/runtime/runStateStore.ts`
- Modify: `extensions/workflow-register/src/core/engine/recoveryState.ts`

- [ ] RED: start on generation A, publish B/current B, restart the extension, and resume A with identical plan/package/lock/environment/provider/Bob evidence.
- [ ] RED: leave malformed/missing `current.json`, a pointer temp, and staging generation; resume A still succeeds because explicit generation loading does not read the pointer.
- [ ] RED: delete/corrupt generation A or remove its exact provider/Bob binding; resume fails closed before state transition/provider call and never substitutes B.
- [ ] RED: cover crash boundaries from R1/R3: incomplete run provenance, artifact staging, promoted-but-unreferenced attempt, and already committed manifest. Recovery classifications are deterministic and repeated recovery is idempotent.
- [ ] RED: release recovered leases on terminal, abort, failed resume, extension dispose, and duplicate resume contention exactly once.
- [ ] GREEN: load the recorded generation via P2's host-neutral VS Code adapter, construct the runtime environment only through `createAuditedWorkflowCompilerEnvironment`, compile through P4, compare all provenance, then acquire a recovered lease and continue.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Resume.test.js test/workflowRunRecovery.test.js test/workflowRunStateRecoveryPreference.test.js test/workflowRunCrossProcessCas.test.js
npm test
git diff --check
```

**Commit:** `feat(workflow): resume immutable workflow generations`

## Runtime phase gate

Run master Gate R/A's runtime command plus the full suite. Review must explicitly confirm zero provider calls on invalid input, zero success/artifact commits on invalid output/error/artifacts, and no runtime source imports.
