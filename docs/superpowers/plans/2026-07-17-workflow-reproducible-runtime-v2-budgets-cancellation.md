# Workflow Reproducible Runtime v2 Budgets and Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** run/step timeout、effect/run output bytes、AI call、input/output/total token の hard budget と、capability-negotiated cancellation を event-authoritative runtime に導入する。

**Architecture:** immutable CompiledWorkflowPlan から effective budget をコンパイルし、RunProjector が event evidence だけから consumption と remaining を導出する。EffectLedger が intent 前に BudgetController preflight を通し、provider v2 へ absolute deadline、AbortSignal、maximum output bytes、maximum output tokens を渡す。cancel/timeout/provider result の競合は一つの deterministic arbiter が event order と trustworthy receipt に基づき terminal outcome を一つだけ選ぶ。

**Tech Stack:** TypeScript、AbortController、Node.js streams/child_process、RunCommitCoordinator/EffectLedger/ProviderContractV2、node:test、Ubuntu/Windows CI。

## Global Constraints

- Consumes the completed Foundation, Attempts/Effects/Artifacts, and Provenance/Approval/Lineage plans.
- Limits are part of immutable compiled plan and lockfile binding. Runtime setting may only make a limit stricter, never silently relax the signed/compiled plan.
- Effective limit is the minimum of run, step, provider, action, and runtime safety caps that apply.
- Counters are projected from events and never decremented by retry. Fork genesis carries inherited budget observations required to prevent reset-by-fork.
- Hard time boundaries use event-captured absolute deadlines; replay never reads the current clock. Live checks use an injected clock.
- Before effect intent, check remaining duration, output bytes, AI calls, input tokens, output tokens, total tokens, and provider capability.
- If hard token limits are configured and provider cannot both enforce the maximum and report trustworthy usage, fail before intent/invocation. Do not estimate silently.
- Output bytes are counted as actual emitted/stored bytes, not JavaScript character count.
- cancel.requested is distinct from confirmed cancellation. Unsupported or unknown cancel is cancel-unconfirmed plus effect.in-doubt where external outcome is unknown.
- Exactly one terminal effect outcome is projected. A late provider result remains evidence but cannot overwrite the selected terminal outcome.
- Budget exhaustion and terminal cancellation forbid new effects.
- Existing pause/resume is an operator scheduling control, not proof of hard cancellation. Preserve that distinction in state and UI.

---

## Task 1: Define and compile the hard budget contract

**Files:**

- Create: extensions/workflow-register/src/core/budgets/budgetContract.ts
- Create: extensions/workflow-register/src/core/budgets/compileBudgets.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js
- Modify: extensions/workflow-register/src/core/modelSchema.ts
- Modify: extensions/workflow-register/src/core/parser/runControl.ts
- Modify: extensions/workflow-register/src/core/workflowCompiler.ts
- Modify: extensions/workflow-register/schema/workflow-register.v1.schema.json
- Modify: extensions/workflow-register/test/workflowAuthoring.test.js

**Interface:**

    HardBudgetLimits = {
      maxRunDurationMs?,
      runDeadline?,
      maxStepDurationMs?,
      maxOutputBytesPerEffect?,
      maxOutputBytesPerRun?,
      maxAiCalls?,
      maxInputTokens?,
      maxOutputTokens?,
      maxTotalTokens?,
      providerLimits?,
      stepLimits?
    }

    compileEffectiveBudgets(plan, step, provider, runtimeCaps): CompiledBudgetPolicy

Every integer is safe, positive, bounded, and unit-explicit. Absolute deadline strings decode to canonical UTC instants.

- [ ] Add failing schema/parser/compiler tests for every limit, invalid zero/negative/fraction/overflow, unknown field, contradictory deadline/duration, and provider/step stricter override.
- [ ] Add tests proving the strictest applicable value wins independent of object insertion order.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js test/workflowAuthoring.test.js and confirm missing budget failures.
- [ ] Implement closed types, schema, parser, and deterministic compiler output bound into compiled plan/lockfile digest.
- [ ] Keep maxRunMinutes and maxAgentStepsPerRun compatibility mapping explicit: they remain pause policy unless authoring schema opts into hard budget fields.
- [ ] Reject runtime relaxation and record any supported stricter runtime override as digest-backed provenance.
- [ ] Re-run focused tests plus existing automatic pause/parser/compiler tests.
- [ ] Commit with message feat: compile reproducible runtime budgets.

## Task 2: Project budget usage and exact remaining capacity

**Files:**

- Create: extensions/workflow-register/src/core/budgets/budgetState.ts
- Create: extensions/workflow-register/src/core/budgets/budgetProjector.ts
- Modify: extensions/workflow-register/src/core/runtime/runProjector.ts
- Modify: extensions/workflow-register/src/core/runtime/executionManifestProjector.ts
- Modify: extensions/workflow-register/src/core/runtime/runAttemptV2.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js

**Interface:**

    BudgetObservation = {
      elapsedRunMs,
      elapsedStepMs,
      outputBytes,
      aiCalls,
      inputTokens,
      outputTokens,
      totalTokens
    }

    projectBudgetState(events, policy): ProjectedBudgetState
    remainingBudget(state, context): RemainingBudget

- [ ] Add failing tests for exact boundary, one-below, at-limit, one-above, retry, fork inheritance, multiple providers, failed call with usage, cancelled call with usage, and duplicate receipt event rejection.
- [ ] Assert counters never become negative, overflow, or decrease as event sequence advances.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js and confirm failures.
- [ ] Implement event-derived counters using safe integers and validated provider usage receipts. Capture run/step absolute deadlines at their start events.
- [ ] Count an AI call when dispatch is committed/observed according to the effect evidence; never infer from attempt terminal state.
- [ ] Include effective limits, observations, exhaustion events, and provenance in execution-manifest projection.
- [ ] Seed child fork budget state from run.forked inherited observations according to the compiled policy; add explicit tests that fork cannot reset a consumed limit.
- [ ] Re-run focused tests plus reproducibleRuntimeEvidence.test.js and reproducibleRuntimeLineage.test.js.
- [ ] Commit with message feat: project deterministic runtime budget usage.

## Task 3: Implement BudgetController preflight and exhaustion events

**Files:**

- Create: extensions/workflow-register/src/core/budgets/budgetController.ts
- Create: extensions/workflow-register/src/core/budgets/providerBudgetCapabilities.ts
- Modify: extensions/workflow-register/src/core/effects/effectLedger.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/src/core/runtime/runtimeDiagnostics.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js

**Interface:**

    BudgetController.preflight(run, attempt, effect, provider, now): BudgetPreflight
    BudgetController.recordExhausted(preflight, dimension): CommittedBudgetExhaustion

BudgetPreflight returns allowed with an immutable snapshot/deadlines/caps, or blocked with a single exact dimension and reason. No effect intent is created when blocked before invocation.

- [ ] Add failing tests for each exhausted dimension and provider capability mismatch.
- [ ] Assert zero provider/command dispatch and zero effect intent when preflight blocks new work; budget.exhausted is committed once and idempotently projected.
- [ ] Add tests that an already committed intent can record its outcome even if budget becomes exhausted, while no subsequent effect starts.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js test/reproducibleRuntimeEffectLedger.test.js and confirm failures.
- [ ] Implement preflight against authoritative projected head under the run lease immediately before intent.
- [ ] Include the exact budget snapshot, effective caps, capability digest, and absolute deadlines in effect intent evidence.
- [ ] Emit budget-exhausted diagnostic/event with dimension, limit, observed, event head, attempt/effect context, and no raw content.
- [ ] Make EffectLedger retry policy return forbidden-terminal after budget exhaustion.
- [ ] Re-run focused tests plus effect ledger/provider tests.
- [ ] Commit with message feat: enforce runtime budget preflight.

## Task 4: Extend provider v2 with hard-limit and usage contracts

**Files:**

- Modify: extensions/workflow-register/src/core/providers/providerContractV2.ts
- Create: extensions/workflow-register/src/core/providers/providerUsageReceipt.ts
- Modify: extensions/workflow-register/src/core/engineTypes.ts
- Modify: extensions/workflow-register/src/core/actionRegistry.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeProviderV2.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js

**Interface:**

    ProviderInvocationV2 += {
      deadline,
      signal,
      maxOutputBytes,
      maxOutputTokens,
      budgetSnapshotDigest
    }

    ProviderUsageReceipt = {
      trust: provider-enforced,
      inputTokens,
      outputTokens,
      totalTokens,
      outputBytes,
      measuredAt,
      receiptDigest
    }

Provider capabilities explicitly state supportsAbort, supportsDeadline, supportsMaxOutputBytes, supportsMaxOutputTokens, reportsTrustedUsage, and processTreeCancellation where applicable.

- [ ] Add failing contract tests for capability negotiation, missing AbortSignal/deadline/caps, untrusted/malformed usage, inconsistent total, negative/overflow counts, and receipt digest mismatch.
- [ ] Assert a configured hard token limit rejects providers missing enforce-and-report capabilities before invocation.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeProviderV2.test.js test/reproducibleRuntimeRunControl.test.js and confirm failures.
- [ ] Extend provider registration validation and invocation contract without changing idempotency identity fields.
- [ ] Implement strict usage receipt decoding and compare runtime-measured output bytes with provider receipt where both exist; mismatch fails closed.
- [ ] Record known usage even for failure/cancel outcomes when trustworthy receipt exists.
- [ ] Restrict legacy provider adapter: it may execute only when requested hard limits are enforceable by runtime; otherwise preflight blocks.
- [ ] Re-run focused tests plus action registry/Bob provider tests.
- [ ] Commit with message feat: add provider hard limit capabilities.

## Task 5: Enforce exact output-byte limits during streaming and storage

**Files:**

- Create: extensions/workflow-register/src/core/budgets/outputByteLimiter.ts
- Create: extensions/workflow-register/src/core/budgets/runOutputLedger.ts
- Modify: extensions/workflow-register/src/core/engine/resultWriters.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js

**Interface:**

    OutputByteLimiter.accept(chunk): accepted | limit-reached
    OutputByteLimiter.snapshot(): { acceptedBytes, rejectedBytes, digest }
    RunOutputLedger.reserve(effectId, requestedMax): OutputReservation
    RunOutputLedger.commit(reservation, observedBytes): BudgetObservation

- [ ] Add failing tests with ASCII, multi-byte UTF-8 split across chunks, Buffer chunks, empty chunks, exactly-at-limit, one-byte-over, concurrent effects sharing run cap, writer failure, and retry.
- [ ] Assert no byte beyond the cap enters runtime-owned output/artifact files and limit-reached requests cancellation once.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js test/reproducibleRuntimeArtifacts.test.js and confirm failures.
- [ ] Implement byte counting on Buffer length with deterministic digesting and an atomic reservation against authoritative remaining run capacity.
- [ ] Connect limiter before resultWriters/artifact staging writes; close and mark partial staging as uncommitted on exhaustion.
- [ ] Record accepted/rejected byte counts by digest/metadata and never persist rejected raw bytes.
- [ ] Ensure output exhaustion cannot publish a partial artifact set.
- [ ] Re-run focused tests plus result writer tests.
- [ ] Commit with message feat: enforce exact runtime output budgets.

## Task 6: Implement deterministic cancellation arbitration

**Files:**

- Create: extensions/workflow-register/src/core/cancellation/cancellationArbiter.ts
- Create: extensions/workflow-register/src/core/cancellation/cancellationService.ts
- Modify: extensions/workflow-register/src/core/effects/effectLedger.ts
- Modify: extensions/workflow-register/src/core/runtime/runProjector.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js

**Interface:**

    CancellationService.request(context, actor, reason): CommittedCancelRequest
    CancellationArbiter.resolve(cancelRequest, providerObservation): TerminalResolution

TerminalResolution is provider-confirmed-cancelled, provider-result-won, cancel-unsupported-in-doubt, or cancel-unconfirmed-in-doubt. One resolution maps to one effect terminal event.

- [ ] Add failing race-table tests for cancel request before dispatch, during call, simultaneous timeout, provider success before/after request, provider failure before/after request, confirmed abort, unsupported abort, connection loss, and duplicate request.
- [ ] Assert exactly one projected terminal outcome for every ordering and stable result when replayed.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js test/reproducibleRuntimeEffectLedger.test.js and confirm failures.
- [ ] Commit cancel.requested before signaling AbortController. Include actor/reason, target attempt/effect, observed head, and deadline evidence.
- [ ] Implement arbitration from durable event sequence and trustworthy provider receipt; preserve late observations as non-authoritative evidence without overwriting terminal state.
- [ ] Map unsupported/unknown outcome to cancel-unconfirmed diagnostic and effect.in-doubt; never label it cancelled.
- [ ] Make timeout use the same request/arbitration path with system actor and deterministic reason code.
- [ ] Re-run focused tests plus replay/evidence tests.
- [ ] Commit with message feat: add deterministic runtime cancellation.

## Task 7: Add process-tree cancellation for command providers

**Files:**

- Create: extensions/workflow-register/src/core/providers/commandProcessController.ts
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/process-tree/parent.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/process-tree/child.js
- Create: extensions/workflow-register/test/reproducibleRuntimeProcessCancellation.test.js
- Modify: extensions/workflow-register/src/core/actionRegistry.ts
- Modify: extensions/workflow-register/src/core/engine/stepExecutor.ts

**Interface:**

    CommandProcessController.spawn(spec, invocation): ManagedProcess
    ManagedProcess.cancel(deadline): ProcessCancellationReceipt
    ManagedProcess.inspectTree(): ProcessTreeObservation

The receipt records platform, root PID identity, signal/termination strategy, timestamps, observed child identities, exit evidence, residual count, and digest. PID alone is not sufficient identity after reuse.

- [ ] Add failing child-process tests that create a parent plus grandchild, handshake readiness, cancel, and prove no residual process on Ubuntu and Windows.
- [ ] Add cases for normal exit racing cancel, ignored graceful termination, forced termination, unsupported platform capability, and PID identity mismatch.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeProcessCancellation.test.js and confirm failures.
- [ ] Implement isolated process group/job-compatible strategy: graceful request followed by bounded forced termination where supported, with injected clock/timer for tests.
- [ ] On Windows use a supported tree termination mechanism and verify child exit; on Ubuntu verify process group descendants. Do not claim processTreeCancellation capability until the platform adapter proves it.
- [ ] Feed the receipt through CancellationArbiter and evidence sanitizer.
- [ ] Re-run focused tests locally and add both-platform CI execution in the rollout plan.
- [ ] Commit with message feat: cancel command provider process trees.

## Task 8: Integrate hard budgets with pause/resume, commands, Bob, and UI

**Files:**

- Modify: extensions/workflow-register/src/core/engine/automaticPause.ts
- Modify: extensions/workflow-register/src/core/engine/runPause.ts
- Modify: extensions/workflow-register/src/core/runControlStore.ts
- Modify: extensions/workflow-register/src/core/runtime/runControlStore.ts
- Modify: extensions/workflow-register/src/commands/runControl.ts
- Modify: extensions/workflow-register/src/commands/runControlReport.ts
- Modify: extensions/workflow-register/src/commands/automaticPauseResume.ts
- Modify: extensions/workflow-register/src/commands/automaticPauseResumeUi.ts
- Modify: extensions/workflow-register/src/bobTaskSync.ts
- Modify: extensions/workflow-register/src/gui/operationHubModel.ts
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js
- Modify: extensions/workflow-register/test/bobTaskSync.test.js

**Interface:** Existing pause controls remain resumable scheduling states. Hard budget exhaustion is non-resumable without a new approved compiled plan/fork policy; cancel confirmation is receipt-based.

- [ ] Add failing integration tests distinguishing paused, cancel-requested, cancelled-confirmed, cancel-unconfirmed/in-doubt, timed-out, and budget-exhausted states.
- [ ] Assert resume does not clear hard counters/exhaustion and retry/fork cannot reset them.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js test/bobTaskSync.test.js and confirm UI/state conflation failures.
- [ ] Route manual cancel command through CancellationService; keep pause commands on the existing scheduling path.
- [ ] Update reports/Bob/UI to show limit/observed/remaining, request vs confirmation, provider capability, and diagnostic code using metadata only.
- [ ] Make pauseBeforeNextAiCall consult BudgetController before the next intent and never mask budget exhaustion as a pause.
- [ ] Re-run focused tests plus all automatic pause/resume and Operation Hub tests.
- [ ] Commit with message feat: integrate runtime hard controls.

## Task 9: Complete budget and cancellation gates

**Files:**

- Modify: extensions/workflow-register/docs/detailed-design-ja.md
- Modify: extensions/workflow-register/docs/reproducible-runtime-v2-operations-ja.md
- Modify: extensions/workflow-register/docs/workflow-pause-resume-plan-ja.md
- Modify: extensions/workflow-register/README.md
- Modify: docs/superpowers/plans/2026-07-17-workflow-reproducible-runtime-v2-budgets-cancellation.md
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeProcessCancellation.test.js

- [ ] Add an acceptance table for every budget dimension, exact boundaries, capability fail-closed behavior, usage receipt trust, output truncation, terminal race, cancel unsupported, and process-tree cleanup.
- [ ] Document hard budget authoring, strictest-wins rules, provider requirements, pause vs cancel, in-doubt reconciliation, and platform-specific process cancellation evidence.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRunControl.test.js test/reproducibleRuntimeProcessCancellation.test.js test/reproducibleRuntimeProviderV2.test.js test/reproducibleRuntimeEffectLedger.test.js test/reproducibleRuntimeArtifacts.test.js test/reproducibleRuntimeEvidence.test.js.
- [ ] Run all policy, audit, full test, package, package policy, and git diff --check commands from the master plan.
- [ ] Run the process-tree test on both Ubuntu and Windows at the same commit.
- [ ] Perform independent review focused on budget bypass/overflow, untrusted usage, output overshoot, cancellation races, process cleanup, and false confirmation; resolve Critical and Important findings.
- [ ] Commit with message docs: complete runtime budget cancellation gates.

## Budget/Cancellation Exit Criteria

- [ ] All hard limits are immutable compiled-plan evidence with strictest-wins resolution.
- [ ] Counters replay deterministically and never decrease on retry/fork.
- [ ] New work stops at exact deterministic boundaries.
- [ ] Token hard limits fail before invocation without enforce-and-report provider capability.
- [ ] Runtime output accepts no byte beyond configured caps.
- [ ] cancel request, timeout, provider result, and terminal event races yield one outcome.
- [ ] Unsupported/unknown cancellation is never displayed as confirmed.
- [ ] Command providers advertising tree cancellation leave no residual process on Ubuntu and Windows.
