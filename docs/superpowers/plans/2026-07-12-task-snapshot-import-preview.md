# Task Snapshot Import Preview / Selective Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add preview-first, selective, transaction-safe task-snapshot artifact import without changing the command ID or weakening existing rollback behavior.

**Architecture:** Add one shared preview planner in core artifacts. The command renders that preview and gathers selection; apply recomputes the same plan and verifies a digest before entering the existing atomic file/run-state transaction.

**Tech Stack:** TypeScript, Node.js test runner, VS Code API, SHA-256, existing task snapshot store, artifact manifest and workspace file transaction.

## Global Constraints

- No production code before a failing regression test.
- Preview must have zero writes and zero run-state mutation.
- Existing-file overwrite requires explicit confirmation.
- Truncated candidates are unselected by default.
- Preview and apply use the same candidate planner.
- Existing command ID and artifact-manifest schema remain compatible.
- No new runtime dependency.

---

### Task 1: Preview candidate model and digest

**Files:**
- Create: `extensions/workflow-register/src/core/artifacts/taskSnapshotImportPreview.ts`
- Modify: `extensions/workflow-register/src/core/artifacts/index.ts`
- Create: `extensions/workflow-register/test/workflowTaskSnapshotImportPreview.test.js`

- [ ] Add RED tests for no-side-effect preview, source classification, checksum/bytes/path, truncated default selection, existing-file diff and deterministic digest.
- [ ] Run compile and focused test; record expected missing-module failure.
- [ ] Implement minimal preview planner with injected `readFile`.
- [ ] Verify focused GREEN and commit.

### Task 2: Selective apply and stale-preview protection

**Files:**
- Modify: `extensions/workflow-register/src/core/artifacts/taskSnapshotImport.ts`
- Modify: `extensions/workflow-register/test/workflowTaskSnapshotArtifactImport.test.js`

- [ ] Add RED tests for selected-only writes, no-selection no-op, changed-existing overwrite guard, preview digest mismatch and unchanged rollback tests.
- [ ] Refactor apply to consume the shared preview planner.
- [ ] Recompute and compare digest before transaction.
- [ ] Preserve existing default API behavior for callers without selection.
- [ ] Verify focused GREEN and commit.

### Task 3: Preview-first command UX

**Files:**
- Modify: `extensions/workflow-register/src/workflowRunCommands.ts`
- Create: `extensions/workflow-register/src/taskSnapshotImportReport.ts`
- Create: `extensions/workflow-register/test/workflowTaskSnapshotImportCommand.test.js`
- Create: `extensions/workflow-register/test/taskSnapshotImportReport.test.js`

- [ ] Add RED tests for report fields, bounded diff, default selections and overwrite confirmation ordering.
- [ ] Implement Markdown report formatter and selection coordinator.
- [ ] Wire command to preview, report, QuickPick, confirmation and apply.
- [ ] Keep execution lease / review gate / transaction boundary unchanged.
- [ ] Verify focused GREEN and commit.

### Task 4: Provenance display and documentation

**Files:**
- Modify: Operation Hub / Runs View view-model files identified by focused search.
- Modify: `extensions/workflow-register/docs/workflow-skip-resume-plan-ja.md`
- Create: `extensions/workflow-register/docs/task-snapshot-import-preview-ja.md`
- Create: `docs/release-evidence/task-snapshot-import-preview-2026-07-12.md`
- Create: `docs/release-evidence/task-snapshot-import-preview-review-2026-07-12.md`

- [ ] Add RED coverage for `Imported from task snapshot` provenance in run projections.
- [ ] Implement compact provenance summary without embedding snapshot text.
- [ ] Document operator flow and rollback behavior.
- [ ] Run whole-diff review; require Critical 0 / Important 0.
- [ ] Commit docs and evidence.

### Task 5: Full verification and integration

- [ ] Run focused tests and compile.
- [ ] Run full unit suite, dependency/architecture/source/schema policies, unused report, production audit, package and package policy.
- [ ] Run Ubuntu/Windows Actions including Extension Host smoke.
- [ ] Remove temporary diagnostic workflows.
- [ ] Update PR body with exact SHAs and run IDs.
- [ ] Mark ready and merge only with all required checks green.
