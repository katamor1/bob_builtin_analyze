# Task Snapshot Import Preview / Selective Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add preview-first, selective, transaction-safe task-snapshot artifact import without changing the command ID or weakening existing rollback behavior.

**Architecture:** Add one shared preview planner in core artifacts. The command renders that preview and gathers selection; apply recomputes the same plan and verifies a digest before entering the existing atomic file/run-state transaction.

**Tech Stack:** TypeScript, Node.js test runner, VS Code API, SHA-256, existing task snapshot store, artifact manifest and workspace file transaction.

## Global Constraints

- No production code before a failing regression test.
- Preview must have zero writes and zero run-state mutation.
- Existing-file overwrite requires explicit confirmation.
- Truncated, redacted, existing-changed, and existing-state candidates are unselected by default.
- Selection省略時はdefault-safe candidateだけを自動importする。
- Preview and apply use the same candidate planner.
- Existing command ID and artifact-manifest schema remain compatible.
- No new runtime dependency.

---

### Task 1: Preview candidate model and digest

**Files:**
- Create: `extensions/workflow-register/src/core/artifacts/taskSnapshotImportPreview.ts`
- Modify: `extensions/workflow-register/src/core/artifacts/index.ts`
- Create: `extensions/workflow-register/test/workflowTaskSnapshotImportPreview.test.js`

- [x] Add RED tests for no-side-effect preview, source classification, checksum/bytes/path, truncated default selection, existing-file diff and deterministic digest.
- [x] Run compile and focused test; record expected missing-module failure.
- [x] Implement minimal preview planner with injected `readFile`.
- [x] Verify focused GREEN and commit.

### Task 2: Selective apply and stale-preview protection

**Files:**
- Modify: `extensions/workflow-register/src/core/artifacts/taskSnapshotImport.ts`
- Modify: `extensions/workflow-register/test/workflowTaskSnapshotArtifactImport.test.js`
- Create: `extensions/workflow-register/test/workflowTaskSnapshotImportSelectiveApply.test.js`
- Create: `extensions/workflow-register/test/workflowTaskSnapshotImportSafeDefaults.test.js`

- [x] Add RED tests for selected-only writes, no-selection no-op, changed-existing overwrite guard, preview digest mismatch and unchanged rollback tests.
- [x] Refactor apply to consume the shared preview planner.
- [x] Recompute and compare digest before transaction.
- [x] Preserve existing API behavior for safe callers while preventing implicit import of unsafe candidates.
- [x] Allow explicitly reviewed truncated/redacted candidates through explicit selection.
- [x] Verify focused GREEN and commit.

### Task 3: Preview-first command UX

**Files:**
- Modify: `extensions/workflow-register/src/workflowRunCommands.ts`
- Create: `extensions/workflow-register/src/taskSnapshotImportReport.ts`
- Create: `extensions/workflow-register/test/workflowTaskSnapshotImportCommand.test.js`
- Create: `extensions/workflow-register/test/taskSnapshotImportReport.test.js`

- [x] Add RED tests for report fields, bounded diff, default selections and overwrite confirmation ordering.
- [x] Implement Markdown report formatter and selection coordinator.
- [x] Protect the Markdown diff boundary with a content-aware fence.
- [x] Wire command to preview, report, QuickPick, confirmation and apply.
- [x] Keep user review outside the execution lease; acquire gate and lease only for apply.
- [x] Verify focused GREEN and commit.

### Task 4: Provenance display and documentation

**Files:**
- Modify: `extensions/workflow-register/src/gui/operationHubModel.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubHtml.ts`
- Modify: `extensions/workflow-register/src/commands/runControlView.ts`
- Create: `extensions/workflow-register/docs/task-snapshot-import-preview-ja.md`
- Create: `docs/release-evidence/task-snapshot-import-preview-2026-07-12.md`
- Create: `docs/release-evidence/task-snapshot-import-preview-review-2026-07-12.md`

- [x] Add RED coverage for `Imported from task snapshot` provenance in run projections.
- [x] Implement compact provenance summary without embedding snapshot text.
- [x] Document operator flow, safe defaults, and rollback behavior.
- [x] Run whole-diff review; require Critical 0 / Important 0.
- [x] Commit docs and evidence.

### Task 5: Full verification and integration

- [x] Run focused tests and compile.
- [x] Run full unit suite, dependency/architecture/source/schema policies, unused report, production audit, package and package policy on the final code head.
- [x] Run Ubuntu/Windows Actions including package, VSIX policy, and Extension Host smoke on final code head `784864813169492709edd2536d9236fbb2f00d17`.
- [x] Run workflow contracts and review scaffold on the same head.
- [x] Remove temporary diagnostic/executor workflows.
- [ ] Complete the documentation-only tail matrix.
- [ ] Update PR body with final exact SHA and run IDs.
- [ ] Mark ready and merge only with all required checks green.

## Completion record

- Preview RED / GREEN: runs `29204608010` / `29204768009`.
- Selective apply RED / GREEN: runs `29204842338` / `29204907855`.
- Report RED / GREEN: runs `29204972610` / `29205015256`.
- Provenance RED: run `29205308654`.
- Focused final diagnostic: run `29206130109`, compile 0, 7 passed / 0 failed.
- Final code head: `784864813169492709edd2536d9236fbb2f00d17`.
- Final code matrix: `29206419912`, all 7 jobs success.
- Workflow contracts / review scaffold: `29206419896` / `29206419897`, success.
- Whole-diff review: Critical 0 / Important 0.
- Temporary workflows: removed from final PR diff.
- Documentation-only tail, PR readiness, and merge: pending.
