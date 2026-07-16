# Workflow Reproducible Runtime v2 Attempt, Effects, and Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** すべての executable step を immutable attempt として記録し、外部作用を durable intent と idempotency policy で制御し、artifact を attempt-scoped staging から検証済みセットとして atomic publish する。

**Architecture:** Foundation plan の RunCommitCoordinator を唯一の domain commit path として使う。実行前に attempt.started と effect.intent-recorded を commit し、provider/command には stable idempotency key と runtime-owned staging destination を渡す。artifact は全 required entry を検証後に同一 filesystem 上で committed directory へ rename し、artifact.committed event が存在して初めて可視にする。legacy provider の外部 path は direct reuse せず、identity 再検証と staging copy を経由する。

**Tech Stack:** TypeScript、Node.js fs/promises、SHA-256、AJV/schema validation、node:test、existing WorkflowEngine/ActionRegistry/artifact services。

## Global Constraints

- Consumes the completed Foundation and Authority plan.
- Contract v2 の immutable CompiledWorkflowPlan、provider contract/version/capability、artifact declaration digest を利用可能なら直接消費する。未統合の場合は compatibility adapter を内部に閉じ、managed provider staging を release-ready と判定しない。
- past attempt、committed artifact directory、committed artifact-set.json は immutable。retry で書き換えない。
- effect intent は外部 call、command dispatch、Bob mutation、filesystem publication より前に canonical event として commit する。
- policy は pure、idempotent、non-idempotent の closed union。未宣言 policy は idempotency-contract-missing で execution を拒否する。
- idempotency key は runId、stepId、logical effect identity、canonical input digest、compiled plan digest から導出する。attemptId や retry ordinal を key に含めない。
- provider receipt がない post-dispatch crash は成功とも失敗とも推測しない。non-idempotent は effect.in-doubt として停止する。
- artifact path は runtime-owned root に containment され、symlink/reparse point、case-fold alias、path traversal、hard-link substitution を検査する。
- promoted directory だけでは可視にしない。matching artifact.committed event と exact artifact-set digest が必要。
- matching event があり directory/bytes が違う場合は fail closed。promoted directory に event がない場合は orphan として無視する。
- reusable artifact は successful terminal attempt の verified committed set に限定する。

---

## Task 1: Define immutable attempt and effect domain models

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runAttemptV2.ts
- Create: extensions/workflow-register/src/core/runtime/runEffectV2.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeEffectLedger.test.js
- Modify: extensions/workflow-register/src/core/runtime/runStateV2.ts
- Modify: extensions/workflow-register/src/core/runtime/runProjector.ts
- Modify: extensions/workflow-register/src/core/modelRuntime.ts

**Interface:**

    AttemptStatus = started | succeeded | failed | cancelled | in-doubt
    EffectPolicy = pure | idempotent | non-idempotent
    EffectStatus = intended | succeeded | failed | cancelled | in-doubt | reconciled

Attempt fields include attemptId, stepId, ordinal, retryOfAttemptId, planDigest, inputDigest, start/terminal timestamps, effectIds, artifactSetDigest, usage observations, and terminalErrorDigest. Past attempts are append-only records in projection state.

- [ ] Write failing reducer tests for attempt.started, attempt.retry-started, attempt.completed, attempt.failed, and invalid transitions such as duplicate ID, skipped ordinal, terminal rewrite, retryOf unknown attempt, and cross-step retry link.
- [ ] Write failing effect reducer tests for intent and each terminal/reconciled event, including rejection of two known terminal outcomes.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEffectLedger.test.js and confirm missing domain model failures.
- [ ] Implement closed unions, decoders, invariant validators, and projector cases. Keep legacy mutable attempt fields readable only through upgrade compatibility.
- [ ] Make all projected arrays stable by event sequence, not by filesystem discovery order.
- [ ] Re-run the focused test and reproducibleRuntimeReplay.test.js.
- [ ] Commit with message feat: add immutable runtime attempts and effects.

## Task 2: Implement logical effect identity and stable idempotency keys

**Files:**

- Create: extensions/workflow-register/src/core/effects/effectIdentity.ts
- Create: extensions/workflow-register/src/core/effects/effectPolicy.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeIdempotency.test.js
- Modify: extensions/workflow-register/src/core/actionRegistry.ts
- Modify: extensions/workflow-register/src/core/engineTypes.ts

**Interface:**

    deriveLogicalEffectIdentity({ stepId, actionKind, declarationId, ordinal }): string
    deriveIdempotencyKey({ runId, stepId, logicalEffectIdentity, inputDigest, planDigest }): string
    resolveEffectPolicy(actionDefinition, providerCapabilities): EffectPolicyResolution

The key uses canonical-json/v1 inputs and a namespaced SHA-256 format. The returned public value exposes no raw input.

- [ ] Write failing golden-vector tests for key stability across object insertion order, retry attempt ID/ordinal changes, process restart, and Windows/Ubuntu paths.
- [ ] Assert changed run, step, logical effect, input digest, or plan digest changes the key.
- [ ] Add collision-safety tests for field boundaries so concatenation ambiguity cannot produce the same preimage.
- [ ] Add failing tests that missing, unknown, or capability-conflicting policy resolves to idempotency-contract-missing rather than non-idempotent fallback.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeIdempotency.test.js and confirm failures.
- [ ] Implement typed canonical preimage encoding, version namespace, and policy resolution.
- [ ] Extend ActionRegistry and provider descriptors with explicit effectPolicy and contract version while retaining read-only legacy metadata.
- [ ] Re-run focused tests plus existing actionRegistry/provider registration tests.
- [ ] Commit with message feat: add effect idempotency policy.

## Task 3: Build the durable EffectLedger

**Files:**

- Create: extensions/workflow-register/src/core/effects/effectLedger.ts
- Create: extensions/workflow-register/src/core/effects/effectRetryPolicy.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeEffectLedger.test.js
- Modify: extensions/workflow-register/src/core/runtime/runCommitCoordinator.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts

**Interface:**

    EffectLedger.recordIntent(context): CommittedEffectIntent
    EffectLedger.recordSucceeded(intent, receipt): CommittedEffectOutcome
    EffectLedger.recordFailed(intent, failure): CommittedEffectOutcome
    EffectLedger.recordCancelled(intent, receipt): CommittedEffectOutcome
    EffectLedger.markInDoubt(intent, observation): CommittedEffectOutcome
    EffectLedger.reconcile(intent, actor, reason, evidenceDigest, resolvedOutcome): CommittedEffectOutcome
    decideAutomaticRetry(effect): allowed | forbidden-in-doubt | forbidden-terminal | allowed-stable-key

- [ ] Add failing tests that invocation callback cannot run before intent commit completes and cannot run when intent commit fails.
- [ ] Add tests for pure pre-receipt crash, idempotent stable-key retry, non-idempotent known pre-dispatch failure, and non-idempotent post-dispatch no-receipt.
- [ ] Assert every committed intent projects to exactly one known outcome or explicit in-doubt state after recovery inspection.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEffectLedger.test.js and confirm failures.
- [ ] Implement EffectLedger as a thin domain service over RunCommitCoordinator; persist input/output/error/receipt digests rather than raw payloads.
- [ ] Implement the retry decision table exactly: pure with no known success allowed; idempotent stable key allowed; non-idempotent known pre-invocation failure allowed; non-idempotent in-doubt forbidden; any terminal cancel/budget exhaustion forbidden.
- [ ] Insert the ledger boundary in stepExecutor without yet changing artifact handling. Wrap provider/command invocation so dispatch observation is explicit.
- [ ] Re-run focused tests plus existing step execution/retry tests.
- [ ] Commit with message feat: add durable runtime effect ledger.

## Task 4: Implement safe attempt-scoped workspaces

**Files:**

- Create: extensions/workflow-register/src/core/artifacts/attemptWorkspace.ts
- Create: extensions/workflow-register/src/core/artifacts/safeArtifactPath.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/artifact-orphans/README.md
- Modify: extensions/workflow-register/src/core/artifacts/index.ts

**Interface:**

    AttemptWorkspace.allocate(runRoot, attemptId): AttemptStaging
    AttemptWorkspace.resolveStagingPath(staging, declaredRelativePath): SafeArtifactPath
    AttemptWorkspace.inspectCommitted(runRoot, attemptId): CommittedAttemptInspection
    AttemptWorkspace.promote(staging, expectedSetDigest): PromotedAttempt

Directory shape:

    attempts/
      staging/<attemptId>/
      committed/<attemptId>/

- [ ] Write failing tests for unique allocation, existing attempt collision, traversal, absolute path, alternate separator, empty segment, reserved name, case-fold collision, symlink/reparse escape, file swap between validation/open, and overwrite of committed attempt.
- [ ] Add a Windows-compatible test vocabulary and skip only checks that the host filesystem cannot represent, recording the reason.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeArtifacts.test.js and confirm missing workspace failures.
- [ ] Implement path normalization and containment based on opened/direct file identity, not string prefix alone. Reject links for staged regular-file artifacts.
- [ ] Make staging and committed roots live on the same filesystem; reject EXDEV promotion rather than falling back to copy.
- [ ] Allocate attempt IDs before any provider path is exposed and reject reuse even after failed attempts.
- [ ] Re-run focused tests on Ubuntu and document Windows cases for CI.
- [ ] Commit with message feat: add safe attempt artifact workspace.

## Task 5: Define artifact-set/v2 and complete-set verification

**Files:**

- Create: extensions/workflow-register/src/core/artifacts/artifactSetV2.ts
- Create: extensions/workflow-register/src/core/artifacts/artifactSetVerifier.ts
- Modify: extensions/workflow-register/src/core/artifacts/artifactManifest.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js
- Modify: extensions/workflow-register/src/core/modelSchema.ts

**Interface:**

    buildArtifactSetV2({ attempt, declarations, observedFiles }): ArtifactSetV2
    verifyArtifactSetV2(set, context): VerifiedArtifactSet
    serializeArtifactSetV2(set): Buffer

Each entry records relative path, schema ID/version, SHA-256, byte size, media type where declared, producer/provider, producer attempt, source classification, input digest, plan digest, and verification status. artifact-set digest covers the complete canonical set.

- [ ] Add failing tests for missing/extra required files, duplicate normalized paths, wrong schema, wrong size/hash, wrong producer/attempt, wrong input/plan digest, changed bytes after scan, and non-regular file.
- [ ] Add golden exact-byte fixture tests for stable entry sorting and artifact-set digest.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeArtifacts.test.js and confirm failures.
- [ ] Implement artifact-set/v2 decoder/encoder and verifier. Open/hash files through the safe identity abstraction and re-check metadata immediately before promotion.
- [ ] Keep artifactManifest.ts as a compatibility reader/projection adapter; do not treat v1 manifest ownership alone as verification.
- [ ] Add schema exports and exhaustive source classification: runtime-staged, legacy-provider-import, task-snapshot-import, inherited-from-parent.
- [ ] Re-run focused tests plus current artifact manifest/schema tests.
- [ ] Commit with message feat: add verified artifact set v2.

## Task 6: Implement atomic artifact publication

**Files:**

- Create: extensions/workflow-register/src/core/artifacts/artifactPromotion.ts
- Modify: extensions/workflow-register/src/core/artifacts/attemptWorkspace.ts
- Modify: extensions/workflow-register/src/core/engine/resultWriters.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js
- Modify: extensions/workflow-register/src/core/runtime/runProjector.ts

**Interface:**

    ArtifactPromotion.prepare(staging, verifiedSet): PreparedArtifactPromotion
    ArtifactPromotion.promote(prepared): PromotedArtifactSet
    ArtifactPromotion.commitVisibility(promoted, leaseProof, expectedHead): CommittedArtifactSet

The publication order is files in staging → validation → artifact-set.json write/fsync → file/directory fsync → same-filesystem rename → attempts parent fsync → artifact.committed event.

- [ ] Add failing operation-order tests and crash cases before/after set fsync, before/during/after rename, and after rename before event commit.
- [ ] Assert a promoted directory without artifact.committed is artifact-orphaned and invisible; an event with missing or mismatched directory is artifact-verification-failed and fail closed.
- [ ] Assert artifact.committed event contains exact artifact-set digest and entries and projects visibility only after event commit.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeArtifacts.test.js and confirm failures.
- [ ] Implement promotion with unique destination and no overwrite. Fsync every regular file and relevant directories where supported.
- [ ] Route resultWriters.ts through staging and ArtifactPromotion for native v2 providers; remove any authoritative manifest publication before verification.
- [ ] Add orphan inspection/cleanup metadata but do not automatically delete forensic content in this plan.
- [ ] Re-run focused tests plus current result writer and durable file batch tests.
- [ ] Commit with message feat: add atomic artifact publication.

## Task 7: Introduce provider v2 staging and effect contracts

**Files:**

- Create: extensions/workflow-register/src/core/providers/providerContractV2.ts
- Create: extensions/workflow-register/src/core/providers/legacyProviderAdapter.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeProviderV2.test.js
- Modify: extensions/workflow-register/src/core/engineTypes.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/src/core/actionRegistry.ts
- Modify: extensions/workflow-register/src/core/modelSchema.ts
- Modify: extensions/workflow-register/src/bobStepRuntime.ts

**Interface:**

    ProviderInvocationV2 = {
      contractVersion,
      runId,
      stepId,
      attemptId,
      effectId,
      logicalEffectIdentity,
      effectPolicy,
      idempotencyKey,
      planDigest,
      inputDigest,
      declaredArtifacts,
      stagingDestinations
    }

    ProviderReceiptV2 = {
      invocationId,
      outcome,
      outputDigest,
      artifactObservations,
      usage?,
      providerReceiptDigest
    }

Budget/deadline/AbortSignal fields are added by the Budgets and Cancellation plan without changing the identity fields above.

- [ ] Write failing contract tests proving provider sees only runtime-owned staging paths, receives the stable key, and cannot declare an undeclared output after invocation.
- [ ] Test registration rejection for provider v2 that advertises idempotency/staging capabilities inconsistent with its contract metadata.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeProviderV2.test.js and confirm failures.
- [ ] Implement provider v2 types, runtime validation, and ActionRegistry registration checks.
- [ ] Update stepExecutor order: create attempt → resolve policy/key → commit intent → invoke provider → verify/promote artifacts → commit outcome/attempt terminal state. Ensure committed-with-stale-projection never repeats the provider.
- [ ] Pass provider receipts to EffectLedger by digest and expose artifact observations only to the verifier.
- [ ] Keep legacy providers behind LegacyProviderAdapter and label them unmanaged until copied/verified in Task 8.
- [ ] Re-run focused tests plus existing Bob step/provider/engine tests.
- [ ] Commit with message feat: add managed provider runtime contract v2.

## Task 8: Safely import outputs from legacy providers

**Files:**

- Modify: extensions/workflow-register/src/core/providers/legacyProviderAdapter.ts
- Create: extensions/workflow-register/src/core/artifacts/legacyArtifactImport.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeProviderV2.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/src/core/engine/resultWriters.ts

**Interface:** Legacy external paths are observations only. importLegacyArtifact reopens the direct file, validates identity and declaration, copies to owned staging through a newly created destination, fsyncs, hashes the copy, and returns source=legacy-provider-import.

- [ ] Add failing tests for provider path outside workspace, symlink, file replacement during copy, wrong schema/hash, partial copy, source change after copy, and repeated adapter invocation.
- [ ] Assert no legacy external path appears as a reusable committed path in state or manifest.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeProviderV2.test.js test/reproducibleRuntimeArtifacts.test.js and confirm failures.
- [ ] Implement direct-file open/copy/hash verification and source evidence digests. Close handles before promotion on Windows.
- [ ] Make non-idempotent legacy provider results in-doubt when no trustworthy receipt distinguishes pre/post dispatch.
- [ ] Restrict automatic retry to the EffectLedger decision and never use artifact presence as proof of effect success.
- [ ] Re-run focused tests plus current legacy WorkflowProviderArtifactMetadata tests.
- [ ] Commit with message feat: import legacy provider artifacts safely.

## Task 9: Enforce verified-only artifact reuse and seeding

**Files:**

- Modify: extensions/workflow-register/src/core/artifacts/seedRun.ts
- Modify: extensions/workflow-register/src/core/artifacts/stateHydration.ts
- Modify: extensions/workflow-register/src/core/artifacts/taskSnapshotImport.ts
- Modify: extensions/workflow-register/src/core/artifacts/taskSnapshotImportPreview.ts
- Modify: extensions/workflow-register/src/workflowRunCommands.ts
- Modify: extensions/workflow-register/test/workflowArtifactSeedRun.test.js
- Modify: extensions/workflow-register/test/workflowRunStateReadOnlyArtifactSource.test.js
- Modify: extensions/workflow-register/test/operationHubArtifactReuse.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js

**Interface:**

    resolveReusableArtifacts(sourceRun, selection, targetPlan): VerifiedReusePlan
    seedRunFromVerifiedArtifacts(targetRun, verifiedReusePlan): SeedResult

- [ ] Add a negative matrix for staged, orphaned, unverified, hash-mismatched, missing, wrong-schema, wrong-producer, failed-attempt, cancelled-attempt, in-doubt-attempt, incompatible-plan/input, and mutated-after-selection artifacts.
- [ ] Add positive tests for exact compatible artifacts, explicitly allowed schema-compatible plan change, and verified task-snapshot import into new staging.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeArtifacts.test.js test/workflowArtifactSeedRun.test.js test/workflowRunStateReadOnlyArtifactSource.test.js test/operationHubArtifactReuse.test.js and confirm new negative cases fail.
- [ ] Make source selection resolve from authoritative artifact.committed events and committed attempt directories, not mutable manifest entries.
- [ ] Revalidate source head and every artifact immediately before target commit; fail CAS if source changed.
- [ ] Copy inherited bytes into the target attempt staging area, label provenance, verify, promote, and commit a new target artifact set. Never reference a writable source path as target authority.
- [ ] Update previews/UI models to show verified/rejected reason without exposing raw content.
- [ ] Re-run focused and existing import/reuse tests.
- [ ] Commit with message feat: require verified artifacts for reuse.

## Task 10: Prove zero duplicate runtime-controlled effects

**Files:**

- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/effect-in-doubt/provider-child.js
- Create: extensions/workflow-register/test/reproducibleRuntimeCrossProcess.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeEffectLedger.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeIdempotency.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeProviderV2.test.js

- [ ] Build a child-process fake provider with readiness handshakes and a durable invocation counter keyed by idempotency key.
- [ ] Add crash-before-dispatch, crash-after-external-success-before-receipt, crash-after-receipt-before-terminal-event, concurrent retry, process restart, and projection-write-failure cases.
- [ ] Assert pure/idempotent cases follow the policy table and the provider counter for a stable key is one where contractual deduplication applies.
- [ ] Assert non-idempotent post-success crash becomes effect.in-doubt, automatic retry returns forbidden-in-doubt, provider counter stays one, and continuation requires effect.reconciled with actor/reason/evidence digest.
- [ ] Assert committed-with-stale-projection is recognized as committed and never invokes the provider again.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeCrossProcess.test.js test/reproducibleRuntimeEffectLedger.test.js test/reproducibleRuntimeIdempotency.test.js test/reproducibleRuntimeProviderV2.test.js.
- [ ] Run the complete npm run test suite and all policy/package commands listed in the master plan.
- [ ] Run git diff --check and independent review focused on side-effect duplication, filesystem identity, path containment, artifact atomicity, and fail-closed reuse; resolve Critical and Important findings.
- [ ] Commit with message test: prove safe runtime effects and artifacts.

## Attempt/Effect/Artifact Exit Criteria

- [ ] Every executable step has one immutable attempt identity before invocation.
- [ ] Every external invocation has a durable effect intent and declared policy.
- [ ] The same logical retry retains the same idempotency key.
- [ ] Unknown non-idempotent outcome cannot auto-retry.
- [ ] Managed providers write only to runtime staging.
- [ ] Legacy outputs are copied and verified before authority.
- [ ] artifact-set promotion is atomic and event-gated.
- [ ] Unverified, orphaned, failed, cancelled, and in-doubt artifacts are never reused.
- [ ] Runtime-controlled duplicate external invocations are zero across the covered fault matrix.
