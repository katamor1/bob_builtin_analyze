# Detached Held Run Recovery Assistant P1-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Classify held runs by live-handle and recovery evidence, present exactly one safe primary action, and prevent ordinary resume from silently completing detached held steps.

**Architecture:** Add a pure held-recovery classifier under `core`. Operation Hub gathers runtime-only evidence and renders the classifier result. A dedicated recovery command reclassifies, previews, confirms, takes the existing gate and execution lease, then resumes while recording minimal provenance.

**Tech Stack:** TypeScript, Node.js test runner, VS Code API, existing run state, task snapshots, artifact manifests, gate registry and execution coordinator.

## Constraints

- `run.json` remains authoritative.
- No held step is completed solely because a live Bob handle disappeared.
- Exactly one primary recovery action per held run.
- Existing connected manual-step flow remains unchanged.
- No new run-state schema version.
- No state values, form values, snapshot text or artifact text in recovery provenance.
- Classifier is pure and deterministic.
- Preview and apply reclassify from fresh state.

---

### Task 1: Pure held-recovery classifier

**Files:**
- Create: `extensions/workflow-register/src/core/heldRunRecovery.ts`
- Create: `extensions/workflow-register/test/heldRunRecoveryClassifier.test.js`

- [ ] Add RED tests for not-held, connected, detached-resumable, artifact-recoverable and blocked.
- [ ] Cover definition missing/mismatch, current-step missing, required-state missing, manifest and snapshot evidence.
- [ ] Verify missing-module RED.
- [ ] Implement minimal classifier and stable explanations.
- [ ] Verify focused GREEN and commit.

### Task 2: Operation Hub primary action

**Files:**
- Modify: `extensions/workflow-register/src/gui/operationHubProvider.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubModel.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubHtml.ts`
- Modify: `extensions/workflow-register/test/operationHubArtifactReuse.test.js`
- Create: `extensions/workflow-register/test/operationHubHeldRecovery.test.js`

- [ ] Add RED tests requiring exactly one held primary action.
- [ ] Gather live task, active manual step and snapshot evidence in provider.
- [ ] Add `recoverDetachedHeldRun` and `importTaskSnapshotArtifacts` Operation Hub actions.
- [ ] Remove generic held `runNextStep` action.
- [ ] Render classification explanation without state values.
- [ ] Verify focused GREEN and commit.

### Task 3: Dedicated recovery command and normal-resume guard

**Files:**
- Modify: `extensions/workflow-register/src/workflowRunCommands.ts`
- Modify: `extensions/workflow-register/src/extensionWithAuthoring.ts`
- Modify: `extensions/workflow-register/package.json`
- Create: `extensions/workflow-register/test/detachedHeldRecoveryCommand.test.js`
- Modify: `extensions/workflow-register/test/workflowRunRecovery.test.js`

- [ ] Add RED tests that ordinary resume does not silently complete detached held.
- [ ] Add source-contract tests for preview → confirmation → gate → lease → reclassification → engine resume ordering.
- [ ] Register `workflowRegister.recoverDetachedHeldRun`.
- [ ] Implement preview and modal confirmation.
- [ ] Persist `workflow.heldRecovery/v1` metadata only after successful recovery.
- [ ] Verify focused GREEN and commit.

### Task 4: Diagnostics and provenance display

**Files:**
- Modify: `extensions/workflow-register/src/core/runDiagnostics.ts`
- Modify: `extensions/workflow-register/src/core/runProvenance.ts`
- Create: `extensions/workflow-register/test/heldRecoveryDiagnostics.test.js`

- [ ] Add RED coverage for held recovery provenance and classification diagnostics.
- [ ] Display recovery kind, step, next step, timestamp and source.
- [ ] Do not display state values.
- [ ] Verify focused GREEN and commit.

### Task 5: Documentation and review

**Files:**
- Create: `extensions/workflow-register/docs/detached-held-run-recovery-ja.md`
- Create: `docs/release-evidence/detached-held-recovery-p1-4-2026-07-13.md`
- Create: `docs/release-evidence/detached-held-recovery-p1-4-review-2026-07-13.md`
- Modify: `docs/workflow-register-feature-roadmap-2026-07-11.md`

- [ ] Document state classification and operator actions.
- [ ] Record TDD heads and run IDs.
- [ ] Run whole-diff review; require Critical 0 / Important 0.
- [ ] Update roadmap status.
- [ ] Commit docs and evidence.

### Task 6: Full verification and merge

- [ ] Compile and run focused suites.
- [ ] Run full workflow-register tests and policies.
- [ ] Build package and verify VSIX.
- [ ] Run Ubuntu/Windows `extensions-quality` through Extension Host smoke.
- [ ] Run `workflow-contracts` and `code-consistency-review-scaffold` on final head.
- [ ] Remove temporary workflows.
- [ ] Update PR body, mark ready, squash merge.
