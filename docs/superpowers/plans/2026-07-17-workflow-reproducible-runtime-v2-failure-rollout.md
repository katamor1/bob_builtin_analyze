Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy workflow projection and control surface references below are retained only as historical runtime v2 rollout planning evidence.

# Workflow Reproducible Runtime v2 Failure Campaign and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** crash、corrupt event、expired lease、CAS conflict、artifact/effect boundary、budget/cancel race、Bob sync interruptionを named failure injection で再現し、全受入条件を Ubuntu/Windows と実環境で証明してから event authority を段階的に既定化する。

**Architecture:** production runtime には no-op FaultController を constructor injection し、test harness だけが closed set の named failpoint を有効化できる。throw-based unit faults に加え、durable boundary で writer process を強制終了する child-process harness を使う。各 fault は deterministic recovery、committed-with-stale-projection、safe invisible orphan、explicit in-doubt effect、fail-closed diagnostic のいずれかへ分類する。rollout は off → shadow → opt-in canary → default authority の順で、event deletion を伴わない rollback path を維持する。

**Tech Stack:** TypeScript、node:test、child_process、filesystem durability primitives、GitHub Actions Ubuntu/Windows、VS Code Extension Host smoke、real IBM Bob/Bazaar/Git UAT。

## Global Constraints

- Consumes all preceding Reproducible Runtime v2 plans.
- Fault injection は production configuration、environment variable、workspace file、command payload から有効化できない。test-only factory と constructor injection に限定する。
- fixed sleep で process race を調整しない。readiness/continue/crash handshake と injected clock/timer を使う。
- hard-crash test は専用 temp root と専用 child process のみを対象とし、workspace/repository data を破壊しない。
- recovery は eventId、occurredAt、effect ID、idempotency key、artifact digest、approval evidence を再生成しない。
- failure test は raw secret/prompt/artifact content を diagnostic/log に出さない。
- corrupt stream は projection から修復しない。valid stream の stale projection のみ rebuild 可能。
- external success 後 receipt 前の non-idempotent effect は in-doubt。test harness の counter を根拠に runtime が成功を推測してはならない。
- Bob sync failure は canonical completion/effect outcome を変えず、provider invocation を繰り返さない。
- default enablement は Ubuntu/Windows same-head green、shadow divergence zero、independent review Critical 0/Important 0、real-environment evidence 完了後にのみ行う。

---

## Task 1: Add a closed, test-only FaultController

**Files:**

- Create: extensions/workflow-register/src/core/runtime/faultController.ts
- Create: extensions/workflow-register/test/helpers/runtimeFaultController.js
- Create: extensions/workflow-register/test/reproducibleRuntimeFaultController.test.js
- Modify: extensions/workflow-register/src/workflowRuntimeFactory.ts
- Modify: extensions/workflow-register/test/dependencyPolicy.test.js

**Interface:**

    RuntimeFaultPoint =
      journal.before-create | journal.after-create | journal.after-fsync |
      event.before-append | event.during-append | event.after-append |
      projection.before-run-replace | projection.after-run-replace |
      projection.before-manifest-replace | projection.after-manifest-replace |
      attempt.before-staging-write | attempt.after-staging-write |
      artifact.before-set-fsync | artifact.after-set-fsync |
      artifact.before-promote | artifact.after-promote | artifact.before-event |
      effect.before-intent | effect.after-intent |
      effect.after-external-success | effect.before-terminal | effect.after-terminal |
      lease.acquire | lease.heartbeat-expire | lease.reclaim | lease.release |
      cas.before-compare | cas.after-compare | cas.append-race |
      cancel.after-request | cancel.timeout-race | cancel.provider-result-race |
      bob.before-target-write | bob.after-target-write |
      bob.before-observed-read | bob.before-repair | bob.after-restart

    FaultController.hit(point, context): Promise<void>

- [ ] Write failing tests for every named point, unknown-point rejection, one-shot/repeating schedules, deterministic hit counts, context redaction, and no-op production behavior.
- [ ] Add a dependency policy test that production code cannot import the test controller and no environment/config lookup can construct an injecting controller.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeFaultController.test.js test/dependencyPolicy.test.js and confirm failures.
- [ ] Implement a frozen RuntimeFaultPoint registry and no-op production controller.
- [ ] Inject FaultController explicitly into event store, journal, projection, attempt workspace, promotion, effect ledger, lease/CAS, cancellation, and Bob sync boundaries. Keep hit calls side-effect free when no-op.
- [ ] Implement test controller actions throw, block-until-handshake, return typed fault, and request-child-exit; do not add production branching by fault name.
- [ ] Re-run focused tests plus npm run architecture:policy.
- [ ] Commit with message test: add runtime failure injection boundaries.

## Task 2: Build the cross-process durability harness

**Files:**

- Create: extensions/workflow-register/test/helpers/reproducibleRuntimeChildHarness.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/child-process/runtime-writer.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/child-process/runtime-op.js
- Modify: extensions/workflow-register/test/helpers/reproducibleRuntimeHarness.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCrossProcess.test.js

**Interface:** Parent starts a child with an explicit temp root and serialized operation fixture. Child emits structured ready/hit/committed messages over IPC. Parent may continue, disconnect, SIGKILL/TerminateProcess, or start a recovery child. Harness captures exit evidence and exact directory hashes.

- [ ] Add failing harness self-tests for readiness timeout, unexpected point, clean exit, forced exit, recovery child, stdout/stderr redaction, and orphan cleanup.
- [ ] Assert tests use no fixed sleep for durable ordering and never signal a PID that was not created/identity-checked by the harness.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeCrossProcess.test.js and confirm missing harness failures.
- [ ] Implement IPC handshakes with bounded deadlines, injected operation IDs, and PID start identity where available.
- [ ] Capture before/after exact event bytes, journal bytes, projection hashes, attempt tree hashes, provider invocation counter, and diagnostic codes.
- [ ] Make temp cleanup conditional on successful evidence capture; preserve failed-case paths in test output only within the CI temp area.
- [ ] Re-run harness tests repeatedly on the host platform.
- [ ] Commit with message test: add runtime crash process harness.

## Task 3: Execute journal, event, and projection crash matrix

**Files:**

- Create: extensions/workflow-register/test/reproducibleRuntimeCrashRecovery.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeJournalV2.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCommitCoordinator.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCrossProcess.test.js
- Modify: extensions/workflow-register/test/fixtures/reproducible-runtime/journals/before-append.json
- Modify: extensions/workflow-register/test/fixtures/reproducible-runtime/journals/after-append.json

**Matrix:** before/after journal create/fsync; before/during/after event append; before/after each run/manifest projection replace; after all projections before journal removal.

- [ ] Add one child-process case per durable boundary and declare its expected class before running it.
- [ ] Assert prior-head unchanged faults leave no committed next event; journal-proven partial tail completes exact bytes once; complete event is never duplicated; stale projection repairs from event; fully complete journal is removed.
- [ ] Assert unrelated/mismatched tail, unexpected head/length, or corrupt journal fails closed and preserves evidence.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeCrashRecovery.test.js test/reproducibleRuntimeJournalV2.test.js test/reproducibleRuntimeCommitCoordinator.test.js test/reproducibleRuntimeCrossProcess.test.js.
- [ ] Fix only root-cause recovery gaps exposed by the matrix; do not loosen event verification or accept unproven truncation.
- [ ] Replay the final stream twice and compare run.json/execution-manifest.json exact bytes with the crash-free control.
- [ ] Re-run each crash point in a repeated loop and record zero duplicate events.
- [ ] Commit with message test: cover runtime commit crash matrix.

## Task 4: Execute attempt, artifact, and effect crash matrix

**Files:**

- Create: extensions/workflow-register/test/reproducibleRuntimeEffectArtifactFailures.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeArtifacts.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeEffectLedger.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCrossProcess.test.js
- Modify: extensions/workflow-register/test/fixtures/reproducible-runtime/effect-in-doubt/provider-child.js

**Matrix:** before/after staging write; before/after artifact-set fsync; before/during/after promote; after promote before artifact event; before/after effect intent; after external success before receipt; before/after terminal event.

- [ ] Add crash cases and classify each as invisible staging/orphan, committed artifact, recoverable terminal evidence, or explicit in-doubt.
- [ ] Assert staged/promoted-without-event/failed/cancelled/in-doubt artifacts are rejected by every reuse entry point.
- [ ] Assert matching artifact event with missing/mutated committed bytes fails closed and is not silently downgraded to orphan.
- [ ] Assert non-idempotent crash after external success invokes provider once, projects in-doubt, blocks auto retry, and requires reconciliation.
- [ ] Assert idempotent retry passes the same key and fake provider contractual dedupe count is one; changed input/plan uses a new key.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeEffectArtifactFailures.test.js test/reproducibleRuntimeArtifacts.test.js test/reproducibleRuntimeEffectLedger.test.js test/reproducibleRuntimeCrossProcess.test.js.
- [ ] Fix any visibility/retry gap without using file existence as proof of effect outcome.
- [ ] Commit with message test: cover effect artifact crash matrix.

## Task 5: Execute corruption, lease, and CAS conflict matrix

**Files:**

- Create: extensions/workflow-register/test/reproducibleRuntimeConcurrencyFailures.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCorruption.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeEventStore.test.js
- Modify: extensions/workflow-register/test/workflowRunCrossProcessCas.test.js
- Modify: extensions/workflow-register/test/workflowRunLock.test.js

**Matrix:** corrupt middle event; blank line; duplicate/gapped sequence; wrong ancestry/state/hash; unrelated torn tail; expired heartbeat; reclaim race; stale lease owner/token; CAS comparison race; append race.

- [ ] Add exact corruption fixtures and assert stable event-stream-corrupt or event-tail-torn diagnostics without projection fallback.
- [ ] Add child-process lease holder/writer races using fake/injected clock for expiry and handshake for append ordering.
- [ ] Assert at most one CAS winner, no partial/duplicate event, no projection from loser, and typed stale-writer conflict.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeConcurrencyFailures.test.js test/reproducibleRuntimeCorruption.test.js test/reproducibleRuntimeEventStore.test.js test/workflowRunCrossProcessCas.test.js test/workflowRunLock.test.js.
- [ ] Fix lease validation at the final append boundary if any expired/stale writer can commit.
- [ ] Repeat race cases enough times to catch nondeterministic ordering while keeping assertions order-independent.
- [ ] Commit with message test: cover runtime corruption lease cas failures.

## Task 6: Execute budget and cancellation race matrix

**Files:**

- Create: extensions/workflow-register/test/reproducibleRuntimeControlFailures.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeRunControl.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeProcessCancellation.test.js
- Modify: extensions/workflow-register/test/reproducibleRuntimeCrossProcess.test.js

**Matrix:** cancel request vs timeout; provider success/failure vs cancel; output cap vs provider result; process tree graceful/forced exit; unsupported cancel; crash after request before signal/receipt/terminal event.

- [ ] Add a table-driven case for every ordering with the expected single terminal resolution.
- [ ] Assert budget exhaustion starts no new effect and retry/fork cannot reset usage.
- [ ] Assert unsupported or lost cancellation produces cancel-unconfirmed/in-doubt and never confirmed cancelled.
- [ ] Assert Ubuntu and Windows command process trees leave zero verified residual children when capability is advertised.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeControlFailures.test.js test/reproducibleRuntimeRunControl.test.js test/reproducibleRuntimeProcessCancellation.test.js test/reproducibleRuntimeCrossProcess.test.js.
- [ ] Fix arbitration through durable event ordering/receipts only; do not add timing guesses.
- [ ] Commit with message test: cover budget cancellation failure races.

## Task 7: Make Bob synchronization interruption-safe

**Files:**

- Create: extensions/workflow-register/src/core/runtime/bobSyncProjection.ts
- Create: extensions/workflow-register/test/reproducibleRuntimeBobSync.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/bob-sync/target.json
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/bob-sync/observed.json
- Modify: extensions/workflow-register/src/bobTaskSync.ts
- Modify: extensions/workflow-register/src/gui/operationHubHtml.ts
- Modify: extensions/workflow-register/test/bobTaskSync.test.js
- Modify: extensions/workflow-register/test/operationHubTodoSync.test.js

**Interface:** BobSyncProjection derives target state from authoritative events and stores target digest, observed digest, confidence, repair state, and last verified event head as non-authoritative projection metadata.

- [ ] Add failing interruption tests before/after target write, before observed read, during repair, on extension restart, and with stale/corrupt Bob state.
- [ ] Assert canonical run completion/effect/artifact events and provider invocation count are unchanged across all sync failures.
- [ ] Assert restart recomputes target from event authority, compares observed state, and repairs idempotently without replaying effects.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeBobSync.test.js test/bobTaskSync.test.js test/operationHubTodoSync.test.js and confirm failures.
- [ ] Implement target/observed/confidence/repair projection and named fault boundaries.
- [ ] Keep Bob Todo as projection/interop state, never a source for canonical domain recovery.
- [ ] Emit redacted stable diagnostics for interrupted/uncertain sync.
- [ ] Re-run focused tests and Operation Hub tests.
- [ ] Commit with message feat: make bob sync projection recoverable.

## Task 8: Add focused reproducible-runtime CI on Ubuntu and Windows

**Files:**

- Modify: extensions/workflow-register/package.json
- Create: extensions/workflow-register/scripts/run-reproducible-runtime-tests.js
- Create: extensions/workflow-register/test/reproducibleRuntimeTestRunner.test.js
- Modify: .github/workflows/extensions-quality.yml

**Interface:**

    npm run test:reproducible-runtime
    npm run test:reproducible-runtime:faults

The focused runner enumerates an allowlisted test list, rejects missing/duplicate files, sets bounded per-case deadlines, and emits a machine-readable summary.

- [ ] Add failing script tests for missing suite, duplicate suite, nonzero child exit, deadline, and summary generation.
- [ ] Run the focused scripts locally and confirm they cover replay, corruption, legacy rebuild, effects, artifacts, evidence, lineage, run control, Bob sync, cross-process, crash recovery, concurrency, and process cancellation.
- [ ] Add a workflow-register-reproducible-runtime matrix job on ubuntu-latest and windows-latest at Node 22, with npm ci, compile, focused tests, fault tests, and uploaded sanitized summaries on failure.
- [ ] Keep full workflow-register quality and Extension Host jobs; do not replace them with the focused job.
- [ ] Extend Windows workflow-register coverage to schema/unused/audit where supported, or document a specific existing platform exception in the job summary.
- [ ] Pin any newly introduced GitHub Action by full commit SHA.
- [ ] Validate workflow YAML and package scripts, then run npm run dependency:policy.
- [ ] Commit with message ci: run reproducible runtime faults cross platform.

## Task 9: Add shadow/canary observability and safe rollback

**Files:**

- Create: extensions/workflow-register/src/core/runtime/runtimeAuthorityRollout.ts
- Modify: extensions/workflow-register/src/core/runtime/runShadowVerifier.ts
- Modify: extensions/workflow-register/src/core/runtime/runtimeDiagnostics.ts
- Modify: extensions/workflow-register/src/commands/runStorage.ts
- Modify: extensions/workflow-register/src/commands/runControlReport.ts
- Modify: extensions/workflow-register/src/workflowRuntimeFactory.ts
- Modify: extensions/workflow-register/package.json
- Create: extensions/workflow-register/test/reproducibleRuntimeRollout.test.js

**Interface:**

    RuntimeAuthorityMode = off | shadow | canary | authoritative
    RuntimeAuthorityRollout.inspect(workspace): RolloutReadinessReport
    RuntimeAuthorityRollout.rollbackConsumers(): CompatibilityReadOnlyResult

Readiness reports counts/digests only: verified runs, divergence by diagnostic, import class, projection repairs, CAS conflicts, in-doubt effects, orphan artifacts, budget exhaustion, cancel uncertainty, and Bob sync uncertainty.

- [ ] Add failing tests for mode transitions, legacy/new run routing, zero-divergence requirement, future/corrupt blockers, restart persistence, and rollback.
- [ ] Assert rollback never truncates/deletes v2 event or committed artifact and never lets old writers mutate future versions.
- [ ] Run npm run compile && node --test test/reproducibleRuntimeRollout.test.js and confirm failures.
- [ ] Implement explicit mode gate and metadata-only readiness report. Default remains off/shadow until Task 11 release gate is approved.
- [ ] Implement rollback as consumer/write-disable compatibility read-only mode plus projection inspection; do not attempt v2-to-v1 history conversion.
- [ ] Add operator previews/confirmation for canary selection and default authority changes.
- [ ] Re-run focused tests plus legacy/native v2/rebuild tests.
- [ ] Commit with message feat: add runtime authority rollout controls.

## Task 10: Run Extension Host and multi-root integration gates

**Files:**

- Create: scripts/reproducible-runtime-extension-host.test.js
- Create: extensions/workflow-register/test/fixtures/reproducible-runtime/multi-root.code-workspace
- Modify: scripts/extension-host-smoke.test.js
- Modify: .github/workflows/extensions-quality.yml
- Modify: extensions/workflow-register/test/reproducibleRuntimeRollout.test.js

- [ ] Add Extension Host scenarios for create/reopen/replay, approve/reject, retry, pause/resume, cancel, artifact publish/reuse, legacy import/rebuild, child fork, and interrupted projection recovery.
- [ ] Add multi-root and workspace-alias cases proving run/artifact/lineage containment and stable logical identity without absolute-path digest drift.
- [ ] Run the Extension Host smoke contract test and local smoke where the pinned VS Code runtime is available.
- [ ] Add the new test file and workspace fixture to Ubuntu and Windows workflow-register Extension Host jobs.
- [ ] Capture event head, plan/prompt/artifact hashes, provider invocation count, Bob Todo projection, run.json, and execution manifest digests in sanitized test evidence.
- [ ] Commit with message test: add runtime extension host rollout gates.

## Task 11: Complete real-environment evidence and default enablement review

**Files:**

- Create: docs/release-evidence/reproducible-runtime-v2.md
- Create: docs/release-evidence/reproducible-runtime-v2-review.md
- Modify: extensions/workflow-register/docs/reproducible-runtime-v2-operations-ja.md
- Modify: extensions/workflow-register/docs/detailed-design-ja.md
- Modify: extensions/workflow-register/package.json
- Modify: docs/superpowers/plans/2026-07-17-workflow-reproducible-runtime-v2-failure-rollout.md

- [ ] Record one accepted commit SHA and same-head Ubuntu/Windows full quality/fault/Extension Host job URLs.
- [ ] Run real IBM Bob and Bazaar/Git scenarios: approve, reject, retry, pause/resume, command approval, checkpoint, provider re-registration/capability binding, timeout/cancel, interrupted Bob sync, artifact publish/reuse, legacy import/rebuild, and child fork.
- [ ] For each scenario record environment versions/capability digests, authoritative head, plan/prompt/artifact digests, provider invocation count, Bob target/observed state, projection hashes, and result; store no raw secrets/content.
- [ ] Prove multi-root/workspace alias behavior and no residual process tree where supported.
- [ ] Record shadow divergence zero for the approved observation set and disposition every blocked/corrupt/in-doubt case.
- [ ] Request independent review of event integrity, recovery, path containment, side-effect safety, artifact publication, budget enforcement, approval binding, lineage, and rollback. Resolve all Critical and Important findings.
- [ ] Only after every prior checkbox and review gate passes, change the shipped default from shadow/canary to authoritative for eligible new runs; keep legacy lazy import explicit and rollback read-only.
- [ ] Re-run every master-plan quality command after the default change and update evidence with the final SHA.
- [ ] Commit with message release: enable reproducible runtime event authority.

## Failure/Rollout Exit Criteria

- [ ] Every named failpoint has a deterministic expected class and automated assertion.
- [ ] Crash recovery appends no duplicate event/effect and reuses exact journaled bytes.
- [ ] Corrupt event, expired lease, and CAS conflict fail closed.
- [ ] Artifact failures produce committed visibility, safe invisible orphan, or explicit corruption; never unverified reuse.
- [ ] Non-idempotent unknown result remains in-doubt and never auto-retries.
- [ ] Budget/cancel races produce one terminal outcome and no false cancellation confirmation.
- [ ] Bob sync interruption cannot change canonical completion or repeat an effect.
- [ ] Ubuntu and Windows focused/full/Extension Host gates pass at the same head.
- [ ] Real Bob/Bazaar/Git and multi-root evidence is complete.
- [ ] Event authority is default only after zero divergence and Critical 0/Important 0.
