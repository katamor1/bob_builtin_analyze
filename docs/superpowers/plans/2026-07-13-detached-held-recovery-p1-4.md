Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy held-run UI references below are retained only as historical P1-4 implementation planning evidence.

# Detached Held Run Recovery Assistant P1-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Classify held runs by live-handle and recovery evidence, present exactly one safe primary action, and prevent ordinary resume from silently completing detached held steps.

**Architecture:** Add a pure held-recovery classifier under `core`. Operation Hub gathers runtime-only evidence and renders the classifier result. A dedicated recovery command reclassifies, previews, confirms, takes the existing gate and execution lease, then resumes while recording minimal provenance.

**Tech Stack:** TypeScript, Node.js test runner, VS Code API, existing run state, task snapshots, artifact manifests, gate registry and execution coordinator.

## Constraints

- `run.json` remains authoritative.
- No held step is completed solely because a live Bob handle disappeared.
- Exactly one primary recovery action per held run.
- Existing connected manual-step and live command-gate flows remain unchanged.
- No new run-state schema version.
- No state values, form values, snapshot text or artifact text in recovery provenance.
- Classifier is pure and deterministic.
- Preview and apply reclassify from fresh state.

---

### Task 1: Pure held-recovery classifier

**Files:**
- Create: `extensions/workflow-register/src/core/heldRunRecovery.ts`
- Create: `extensions/workflow-register/test/heldRunRecoveryClassifier.test.js`

- [x] Add RED tests for not-held, connected, detached-resumable, artifact-recoverable and blocked.
- [x] Cover definition missing/mismatch, current-step missing, required-state missing, manifest and snapshot evidence.
- [x] Verify missing-module RED.
- [x] Implement minimal classifier and stable explanations.
- [x] Verify focused GREEN and commit.
- [x] Validate persisted manual form／approval evidence and next-step required state.

### Task 2: Operation Hub primary action

**Files:**
- Modify: `extensions/workflow-register/src/gui/operationHubProvider.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubModel.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubHtml.ts`
- Create: `extensions/workflow-register/test/operationHubHeldRecovery.test.js`

- [x] Add RED tests requiring exactly one held primary action.
- [x] Gather live task, active manual step and snapshot evidence in provider.
- [x] Add `recoverDetachedHeldRun` and `importTaskSnapshotArtifacts` Operation Hub actions.
- [x] Remove generic held `runNextStep` action.
- [x] Render classification explanation without state values.
- [x] Route dedicated recovery through canonical mutation target, revision validation and single-flight queue.
- [x] Verify focused GREEN and commit.

### Task 3: Dedicated recovery command and normal-resume guard

**Files:**
- Modify: `extensions/workflow-register/src/workflowRunCommands.ts`
- Modify: `extensions/workflow-register/src/extension.ts`
- Modify: `extensions/workflow-register/package.json`
- Create: `extensions/workflow-register/test/detachedHeldRecoveryCommand.test.js`
- Modify: `extensions/workflow-register/test/bobGateLifecycle.test.js`

- [x] Add RED tests that ordinary resume does not silently complete detached held.
- [x] Add source-contract tests for preview → confirmation → gate → lease → reclassification → engine resume ordering.
- [x] Register `workflowRegister.recoverDetachedHeldRun`.
- [x] Implement preview and modal confirmation.
- [x] Persist `workflow.heldRecovery/v1` metadata only after successful recovery.
- [x] Preserve connected manual-step and live Bob command-gate behavior.
- [x] Bind task snapshot evidence to current step, workflow ID and definition hash.
- [x] Verify focused GREEN and commit.

### Task 4: Diagnostics and provenance display

**Files:**
- Modify: `extensions/workflow-register/src/core/runDiagnostics.ts`
- Modify: `extensions/workflow-register/src/core/runProvenance.ts`
- Create: `extensions/workflow-register/test/heldRecoveryDiagnostics.test.js`

- [x] Add RED coverage for held recovery provenance and classification diagnostics.
- [x] Display recovery kind, step, next step, timestamp and source.
- [x] Do not display state values.
- [x] Reject malformed, unsafe, newer-schema and wrong-run provenance.
- [x] Verify focused GREEN and commit.

### Task 5: Documentation and review

**Files:**
- Create: `extensions/workflow-register/docs/detached-held-run-recovery-ja.md`
- Create: `docs/release-evidence/detached-held-recovery-p1-4-2026-07-13.md`
- Create: `docs/release-evidence/detached-held-recovery-p1-4-review-2026-07-13.md`
- Modify: `docs/workflow-register-feature-roadmap-2026-07-11.md`

- [x] Document state classification and operator actions.
- [x] Record TDD and verification checkpoints.
- [x] Run whole-diff review; require Critical 0 / Important 0.
- [ ] Update roadmap status.
- [x] Commit docs and evidence.

### Task 6: Full verification and merge

- [x] Compile and run focused suites.
- [x] Run full workflow-register tests and policies.
- [x] Build package and verify VSIX.
- [ ] Run Ubuntu/Windows `extensions-quality` through Extension Host smoke on the final user-authored evidence head.
- [ ] Run `workflow-contracts` on the final head; `code-consistency-review-scaffold` remains path-unaffected.
- [x] Remove temporary mutation and diagnostic workflows.
- [ ] Update PR body, mark ready and merge.

## Verification checkpoints

- Diagnostic run `29221985015`: focused GREEN; full 879/880; isolated live-held compatibility failure.
- Compatibility run `29222356852`: focused/full/policy/package/VSIX GREEN; standard CI restored.
- Final contract run `29222580341`: mutation-target and snapshot-compatibility regressions added; focused/full/policy/package/VSIX GREEN.
- Final standard hosted matrix: pending.
