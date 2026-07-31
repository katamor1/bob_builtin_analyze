Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy Operation Hub references below are retained only as historical reproducible-runtime provenance, approval, and lineage planning evidence.

# Workflow Reproducible Runtime v2 Provenance, Approval, and Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** metadata-only execution manifest に完全な provenance を投影し、approval を actor/reason と digest-bound target に固定し、retry と fork の lineage を parent run 不変性付きで実装する。

**Architecture:** 実行時に必要な環境・provider・plan・input の identity を event evidence として capture し、ExecutionManifestProjector は replay 時に event だけから deterministic manifest を生成する。ApprovalService は plan、artifact set、attempt diff、pending action の4 digest を canonicalize して approvalTargetDigest を作り、承認直前と action 直前に再計算する。retry は同一 run の新 attempt、earlier point からの再開は child run の run.forked genesis event とし、parent へは何も書かない。

**Tech Stack:** TypeScript、canonical-json/v1、RunProjector/RunCommitCoordinator、node:test、VS Code commands/views、existing branching/review runtime。

## Global Constraints

- Consumes Foundation/Authority and Attempt/Effects/Artifacts plans.
- manifest projector は clock、OS API、VS Code API、provider registry、filesystem を replay 中に参照しない。必要情報は発生時 event evidence に記録する。
- manifest は metadata/digest のみ。credential、prompt body、artifact body、raw provider payload、unrestricted assistant transcript を含めない。
- approval actor は kind と stable actor ID を必須とする。hostname、display name、random ID を stable identity として推測しない。
- approval reason は trim 後 non-empty（non-empty reason）。decision は approve または reject。
- approvalTargetDigest は compiled plan digest、artifact-set digest、attempt-diff digest、pending-action digest の canonical tuple から導出する。
- action 実行直前に target を再計算し、一要素でも変われば approval-stale として停止する。
- approval event が event head を進めるため、authorization は pre-approval head equality ではなく target digest を比較する。observedEventHeadHash は監査証拠として保持する。
- retry は既存 attempt/artifact を変更しない。fork は parent run の全 bytes を変更しない。
- reverse lineage は child events から再生成可能な workspace-level projection。parent directory に backlink を書かない。

---

## Task 1: Define the complete execution-manifest/v1 contract

**Files:**

- Create: extensions/workflow-register/src/core/runtime/executionManifestV1.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeEvidence.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/phase4-v1/execution-manifest-v2-expected.json
- Modify: extensions/workflow-register/src/core/runtime/executionManifestProjector.ts
- Modify: extensions/workflow-register/src/core/runProvenance.ts
- Modify: extensions/workflow-register/test/workflowRunProvenance.test.js

**Interface:**

    ExecutionManifestV1 = {
      schemaVersion,
      runIdentity,
      workflowIdentity,
      lineage,
      plan,
      inputs,
      runtime,
      bob,
      providers,
      attempts,
      effects,
      artifacts,
      approvals,
      budgets,
      authoritativeHead
    }

All collections have schema-defined stable ordering. Unknown keys and raw-content fields are rejected by the decoder.

- [ ] Write failing exact-byte tests for a representative run containing two attempts, multiple effects, committed artifacts, one approval, and lineage evidence.
- [ ] Add completeness tests for run/workflow/package identity; compiled plan/workflow definition/lockfile/input/prompt digests; engine/Node/OS/VS Code/Bob/projector versions; Bob capability digest; provider owner/contract/implementation/model/capabilities; attempts/retry links; effects/policies/keys/outcomes/usage; artifacts/schema/hash/size/producer/source/verification; approvals; budgets; lineage; authoritative event head.
- [ ] Add negative tests scanning serialized output for known credential/prompt/artifact/provider payload/transcript sentinels.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEvidence.test.js test/workflowRunProvenance.test.js and confirm missing contract failures.
- [ ] Implement a closed execution-manifest/v1 decoder/serializer and extend ExecutionManifestProjector with exhaustive stable ordering.
- [ ] Adapt runProvenance.ts to expose the projected manifest contract while retaining a clearly labeled legacy v1 read adapter.
- [ ] Assert manifest authoritativeHead sequence/hash equals the event used to compute projectionHash.
- [ ] Re-run focused tests and reproducibleRuntimeReplay.test.js.
- [ ] Commit with message feat: define complete execution manifest v1.

## Task 2: Capture runtime, plan, provider, and Bob identity as event evidence

**Files:**

- Create: extensions/workflow-register/src/core/runtime/executionIdentityCapture.ts
- Create: extensions/workflow-register/src/core/runtime/evidenceSanitizer.ts
- Modify: extensions/workflow-register/src/workflowRuntimeFactory.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/src/bobWorkflowRunner.ts
- Modify: extensions/workflow-register/src/bobStepRuntime.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeEvidence.test.js

**Interface:**

    captureRunIdentity(compiledPlan, runtimeContext): RunIdentityEvidence
    captureProviderIdentity(registration, invocation): ProviderIdentityEvidence
    captureBobIdentity(binding): BobIdentityEvidence
    sanitizeEvidence(input): MetadataOnlyEvidence

- [ ] Add failing tests proving capture occurs once at the relevant event boundary and replay after changing local Node/OS/provider registry still emits the original manifest bytes.
- [ ] Add tests that sanitizer rejects secret-shaped keys, raw prompt/content/transcript fields, non-canonical values, and unbounded arbitrary provider objects.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEvidence.test.js and confirm failures.
- [ ] Implement allowlist-based evidence builders rather than blacklist serialization.
- [ ] Capture run-level identities in run.created/import/cutover evidence; capture provider/Bob invocation identity in effect intent/receipt evidence.
- [ ] Hash prompt, plan, workflow definition, lockfile, input, Bob capabilities, and provider capabilities with explicit version namespaces.
- [ ] Ensure imported legacy runs record unknown/unavailable fields explicitly rather than inventing current runtime values.
- [ ] Re-run focused tests plus Bob workflow/provider tests.
- [ ] Commit with message feat: capture deterministic runtime provenance.

## Task 3: Implement approval target and pending-action codecs

**Files:**

- Create: extensions/workflow-register/src/core/approvals/approvalTarget.ts
- Create: extensions/workflow-register/src/core/approvals/pendingAction.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeApproval.test.js
- Modify: extensions/workflow-register/src/core/runtime/runStateV2.ts

**Interface:**

    ApprovalTarget = {
      planDigest,
      artifactSetDigest,
      attemptDiffDigest,
      pendingActionDigest
    }

    deriveApprovalTargetDigest(target): string
    deriveAttemptDiffDigest(baseAttempt, candidateAttempt): string
    derivePendingActionDigest(action): string

PendingAction is a closed union covering step acceptance, command execution, manual completion, branch checkpoint continuation, in-doubt reconciliation authorization where policy requires it, and other current guarded actions.

- [ ] Write failing golden-vector tests for each pending-action variant and target digest.
- [ ] Assert object insertion order does not affect digests, but any field-level semantic change does.
- [ ] Add explicit mutation tests for plan, artifact set, attempt diff, pending command/action parameters, branch checkpoint count, and selected evidence.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeApproval.test.js and confirm failures.
- [ ] Implement versioned canonical digest preimages with unambiguous field names and closed decoders.
- [ ] Derive attempt diff from authoritative attempt/artifact/effect metadata, not UI-rendered text or filesystem mtime.
- [ ] Reject missing artifact set with an explicit empty-set digest only when the action schema permits no artifacts; do not use null/undefined interchangeably.
- [ ] Re-run focused tests.
- [ ] Commit with message feat: bind approval targets to evidence digests.

## Task 4: Add explicit actor identity and reason collection

**Files:**

- Create: extensions/workflow-register/src/core/approvals/runtimeActor.ts
- Create: extensions/workflow-register/src/core/approvals/approvalInput.ts
- Modify: extensions/workflow-register/package.json
- Modify: extensions/workflow-register/src/workflowRegisterService.ts
- Modify: extensions/workflow-register/src/commands/stepReview.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeApproval.test.js
- Modify: extensions/workflow-register/test/workflowAuthoring.test.js

**Interface:**

    RuntimeActor = { kind: human | service | provider | system, id: string }
    ApprovalInput = { actor, decision, reason, optionalExpiry, policyVersion? }

For interactive human approval, workflowRegister.approvalActorId is the explicit stable ID source. Approval commands fail closed and explain setup if absent; they do not derive identity from machine/user display names.

- [ ] Add failing tests for missing actor ID, blank/whitespace reason, invalid actor kind/ID, invalid expiry, and valid approve/reject input.
- [ ] Add package-schema tests for the actor ID setting and ensure its value is never copied into logs beyond the approval metadata field.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeApproval.test.js test/workflowAuthoring.test.js and confirm failures.
- [ ] Implement runtime actor validation with bounded normalized IDs and approval input parsing.
- [ ] Update interactive command helpers to require a reason and resolve the configured stable actor ID before showing final confirmation.
- [ ] Keep system/provider actors injectable only through typed internal services; prevent command payloads from impersonating those kinds.
- [ ] Re-run focused tests and existing step review command tests.
- [ ] Commit with message feat: require approval actor and reason.

## Task 5: Build ApprovalService and stale-target enforcement

**Files:**

- Create: extensions/workflow-register/src/core/approvals/approvalService.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/src/core/runtime/runProjector.ts
- Modify: extensions/workflow-register/src/core/runtime/executionManifestProjector.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeApproval.test.js

**Interface:**

    ApprovalService.prepare(run, pendingAction): PreparedApproval
    ApprovalService.record(prepared, approvalInput, leaseProof, expectedHead): RecordedApproval
    ApprovalService.authorize(run, recordedApproval, pendingAction): AuthorizationResult

approval.recorded evidence contains actor, decision, reason, approvalTargetDigest, all four component digests, observed event-head hash, occurredAt, optional expiry, and policy version.

- [ ] Add failing tests for valid approval, rejection, expired approval, target mutation, changed action, changed artifact bytes/set, changed plan, changed attempt diff, replay, and approval event advancing the head.
- [ ] Assert authorize recomputes the target immediately before action and returns approval-stale without dispatching any effect.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeApproval.test.js and confirm failures.
- [ ] Implement prepare/record/authorize over authoritative state and RunCommitCoordinator.
- [ ] Project approvals into state and execution manifest with actor/reason preserved and deterministic ordering.
- [ ] Redact raw action payloads from approval event; store closed action metadata and digests only.
- [ ] Make reject a durable approval.recorded decision that cannot authorize execution.
- [ ] Re-run focused tests plus reproducibleRuntimeEvidence.test.js.
- [ ] Commit with message feat: add hash-bound runtime approval service.

## Task 6: Route every guarded action through ApprovalService

**Files:**

- Modify: extensions/workflow-register/src/commands/stepReview.ts
- Modify: extensions/workflow-register/src/core/approvalGuardrails.ts
- Modify: extensions/workflow-register/src/core/engine.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/src/core/engine/branchCheckpoint.ts
- Modify: extensions/workflow-register/src/core/engine/branchTransitions.ts
- Modify: extensions/workflow-register/src/workflowRunCommands.ts
- Modify: extensions/workflow-register/src/gui/operationHubModel.ts
- Modify: extensions/workflow-register/src/gui/operationHubProvider.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeApproval.test.js
- Modify: extensions/workflow-register/test/operationHubMutations.test.js

**Interface:** Command/UI layers may prepare and present approval evidence, but only ApprovalService records/authorizes. GUI state is a projection and never grants authorization.

- [ ] Add failing integration tests for acceptCurrentStep, acceptAndRunNextStep, approved command execution, manual completion, and approveBranchCheckpoint.
- [ ] For each action, mutate one target component between confirmation and execution and assert zero effect dispatch plus approval-stale.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeApproval.test.js test/operationHubMutations.test.js and confirm bypasses fail.
- [ ] Replace boolean/ephemeral approval flags with RecordedApproval references and target recomputation.
- [ ] Keep compatibility behavior for legacy off/shadow runs clearly separated; canary/authoritative v2 must not call the legacy boolean guard.
- [ ] Show actor, reason, decision, target digest prefix, evidence digest prefixes, expiry, and stale status in inspect views without exposing raw content.
- [ ] Re-run focused tests plus current review-gated/branching/manual-step suites.
- [ ] Commit with message feat: enforce evidence-bound approval actions.

## Task 7: Replace mutable retry archives with immutable attempts

**Files:**

- Modify: extensions/workflow-register/src/core/engine/runState.ts
- Modify: extensions/workflow-register/src/core/engine.ts
- Modify: extensions/workflow-register/src/core/engine/branchReset.ts
- Modify: extensions/workflow-register/src/workflowRunCommands.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeLineage.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeEffectLedger.test.js

**Interface:**

    retryAttempt(runId, failedAttemptId, actor, reason): NewAttemptResult

The operation appends attempt.retry-started with a new attemptId and retryOfAttemptId. It never calls archiveAttempt for authoritative v2 runs and never rewrites prior artifacts/effects.

- [ ] Add failing tests that snapshot prior event file, committed attempt directory, artifact bytes, and manifest attempt record before retry and compare exact bytes afterward.
- [ ] Assert retry of successful, active, in-doubt non-idempotent, terminal-cancelled, and budget-exhausted attempts follows explicit policy and never silently resets counters.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeLineage.test.js test/reproducibleRuntimeEffectLedger.test.js and confirm current mutable retry behavior fails.
- [ ] Implement v2 retry as a new attempt event and route retryCurrentStep through EffectLedger retry decision.
- [ ] Retain archiveAttempt only in the legacy adapter; add a source policy/test that authoritative code cannot import it.
- [ ] Project retry links in state/manifest/UI and keep previous attempt/artifact paths read-only.
- [ ] Re-run focused tests plus existing retry/branch reset tests.
- [ ] Commit with message feat: make runtime retry attempts immutable.

## Task 8: Implement child-run fork without parent mutation

**Files:**

- Create: extensions/workflow-register/src/core/lineage/runForkService.ts
- Create: extensions/workflow-register/src/core/lineage/runLineage.ts
- Modify: extensions/workflow-register/src/core/engine/branchReset.ts
- Modify: extensions/workflow-register/src/workflowRegisterService.ts
- Modify: extensions/workflow-register/src/workflowRunCommands.ts
- Modify: extensions/workflow-register/src/extension.ts
- Modify: extensions/workflow-register/package.json
- Modify: extensions/workflow-register/test/reproducibleRuntimeLineage.test.js

**Interface:**

    RunForkService.prepare(parentRun, selection, childPlan, actor, reason): PreparedFork
    RunForkService.create(prepared, expectedParentHead): ChildRun

The child genesis run.forked evidence contains parentRunId, parent event hash/sequence, fork actor/reason, selected state/artifact evidence digests, child plan digest, and child input digest.

- [ ] Add failing tests for fork at exact parent head, selected verified artifacts, changed parent head during preparation, invalid selection, future/corrupt parent, and duplicate child creation request.
- [ ] Capture a byte/hash tree of the complete parent run directory before create and assert exact equality afterward, including event, projections, committed attempts, and artifacts.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeLineage.test.js and confirm fork is missing.
- [ ] Implement prepared fork data as immutable digests; revalidate parent stream/head and selected artifact bytes immediately before child genesis.
- [ ] Create the child in a new unique run directory, commit run.forked as its first authoritative event, then import selected artifacts into child-owned staging/committed sets.
- [ ] Do not acquire the parent write lease or write a parent backlink. Use read verification plus expected parent head consistency.
- [ ] Add a fork command that requires actor/reason and presents parent/selection/child digests before confirmation.
- [ ] Re-run focused tests plus storage/retention/multi-root path tests.
- [ ] Commit with message feat: add immutable child run fork.

## Task 9: Add rebuildable lineage and provenance projections to Bob/UI

**Files:**

- Create: extensions/workflow-register/src/core/lineage/runLineageIndex.ts
- Modify: extensions/workflow-register/src/bobTaskSync.ts
- Modify: extensions/workflow-register/src/gui/operationHubHtml.ts
- Modify: extensions/workflow-register/src/gui/operationHubModel.ts
- Modify: extensions/workflow-register/src/commands/runControlView.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeLineage.test.js
- Modify: extensions/workflow-register/test/bobTaskSync.test.js
- Modify: extensions/workflow-register/test/operationHubTodoSync.test.js

**Interface:** RunLineageIndex scans verified child genesis events and builds a workspace-level derived parent-to-child index. Bob/UI consume projected status and digests; they cannot mutate canonical lineage.

- [ ] Add failing tests for index rebuild, missing/corrupt child exclusion with diagnostic, multiple children, moved workspace alias, and parent with no local child.
- [ ] Add Bob/UI tests displaying retry/fork links and provenance status while ensuring sync writes no canonical event and no parent file.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeLineage.test.js test/bobTaskSync.test.js test/operationHubTodoSync.test.js and confirm failures.
- [ ] Implement a deterministic, atomically replaceable workspace-level lineage projection outside every run directory.
- [ ] Make Bob sync source its target state from authoritative run projection and isolate sync failure from domain commit.
- [ ] Surface lineage-invalid when child evidence fails verification; do not infer lineage from directory names.
- [ ] Re-run focused tests and existing Operation Hub view tests.
- [ ] Commit with message feat: project runtime lineage to bob and ui.

## Task 10: Complete provenance, approval, and lineage gates

**Files:**

- Modify: extensions/workflow-register/docs/detailed-design-ja.md
- Modify: extensions/workflow-register/docs/reproducible-runtime-v2-operations-ja.md
- Modify: extensions/workflow-register/docs/step-back-branching-plan-ja.md
- Modify: docs/superpowers/plans/2026-07-17-workflow-reproducible-runtime-v2-provenance-approval-lineage.md
- Modify: extensions/workflow-register/test/reproducibleRuntimeEvidence.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeApproval.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeLineage.test.js

- [ ] Add an acceptance table proving complete metadata provenance, metadata-only redaction, stale approval rejection, actor/reason preservation, immutable retry, child fork, and parent byte invariance.
- [ ] Document actor setup, reason requirements, digest interpretation, stale approval recovery, retry policy, fork semantics, and derived lineage index rebuild.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEvidence.test.js test/reproducibleRuntimeApproval.test.js test/reproducibleRuntimeLineage.test.js test/workflowRunProvenance.test.js test/bobTaskSync.test.js test/operationHubTodoSync.test.js.
- [ ] Run all policy, audit, full test, package, package policy, and git diff --check commands from the master plan.
- [ ] Perform independent review focused on secret leakage, approval binding/bypass, actor spoofing, retry mutation, fork path containment, and parent immutability; resolve Critical and Important findings.
- [ ] Commit with message docs: complete runtime evidence and lineage gates.

## Provenance/Approval/Lineage Exit Criteria

- [ ] execution-manifest.json replays byte-identically from events.
- [ ] Every required provenance category is present or explicitly unavailable for legacy evidence.
- [ ] No forbidden raw content is serialized.
- [ ] Approval preserves actor, reason, decision, all component digests, target digest, observed head, and timestamp.
- [ ] Any target mutation invalidates approval before action dispatch.
- [ ] Retry creates a new linked attempt without changing earlier bytes.
- [ ] Fork creates a child genesis event and changes zero parent bytes.
- [ ] Reverse lineage and Bob/UI state remain rebuildable projections.
