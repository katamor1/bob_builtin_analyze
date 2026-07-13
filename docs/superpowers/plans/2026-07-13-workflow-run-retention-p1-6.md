# Workflow Run Retention / Cleanup P1-6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:executing-plans. Production behavior changes require a focused failing regression first.

**Goal:** Add preview-first, reference-aware, pinned, transaction-safe cleanup for persisted workflow runs.

**Architecture:** A pure planner consumes a physically verified inventory and emits a digest-bound cleanup plan. A service rebuilds inventory before apply. Cleanup leases exclude new executions while a quarantine transaction performs all-or-nothing run-directory removal. VS Code commands are thin adapters.

**Tech Stack:** TypeScript, Node.js test runner, VS Code API, existing run state codec, durability files, locks, artifact provenance and workspace-root helpers.

## Global constraints

- `run.json` remains authoritative; no run-state schema change.
- No production code before a failing focused test.
- Automatic deletion remains disabled.
- Active, recoverable, referenced, pinned, read-only, locked, journaled and physically unsafe runs must not be deleted.
- Preview and apply use the same planner, policy, digest and revisions.
- Cleanup lease and workflow execution lock are mutually exclusive.
- No symlink／junction traversal or workspace escape.
- No task／artifact／snapshot／state body in reports or evidence.
- Every task ends with focused tests, compile, `git diff --check`, commit and review.

---

### Task 1: Pure cleanup planner

**Files:**
- Create: `extensions/workflow-register/src/core/retention/runRetention.ts`
- Create: `extensions/workflow-register/test/workflowRunRetentionPlanner.test.js`

- [ ] Add RED tests for all protected categories.
- [ ] Add deterministic age／count／storage／selected-ID tests.
- [ ] Add digest tamper and invalid-policy tests.
- [ ] Verify missing-module RED.
- [ ] Implement minimal planner.
- [ ] Verify focused GREEN and commit.

### Task 2: Pin metadata

**Files:**
- Create: `extensions/workflow-register/src/core/retention/runRetentionMetadata.ts`
- Create: `extensions/workflow-register/test/workflowRunRetentionMetadata.test.js`

- [ ] Add RED round-trip tests.
- [ ] Cover malformed／future／oversized／control-character values.
- [ ] Implement v1 build／decode／serialize helpers.
- [ ] Verify focused GREEN and commit.

### Task 3: Cleanup lease and execution exclusion

**Files:**
- Create: `extensions/workflow-register/src/core/runtime/runCleanupLease.ts`
- Modify: `extensions/workflow-register/src/core/runtime/runLock.ts`
- Create: `extensions/workflow-register/test/workflowRunCleanupLease.test.js`

- [ ] Add RED tests for exclusive lease, owner-only release and stale lease recovery.
- [ ] Add RED test proving workflow run lock does not start while cleanup lease exists.
- [ ] Implement cleanup lease with bounded metadata and heartbeat/staleness rules.
- [ ] Gate normal run-lock acquisition on cleanup lease absence.
- [ ] Verify focused GREEN and commit.

### Task 4: Quarantine transaction

**Files:**
- Create: `extensions/workflow-register/src/core/runtime/runCleanupTransaction.ts`
- Create: `extensions/workflow-register/test/workflowRunCleanupTransaction.test.js`

- [ ] Add RED success test.
- [ ] Add RED rollback-after-second-rename test.
- [ ] Cover lock、journal、revision、unsafe ID、symlink／junction refusal.
- [ ] Implement lease acquisition, preflight recheck, quarantine rename and reverse rollback.
- [ ] Verify Linux and Windows focused GREEN and commit.

### Task 5: Inventory and stale-plan protection

**Files:**
- Create: `extensions/workflow-register/src/core/runtime/runRetentionService.ts`
- Create: `extensions/workflow-register/test/workflowRunRetentionService.test.js`

- [ ] Add RED integration tests with `FileRunStateStore`.
- [ ] Protect source runs referenced by reuse／hydration／snapshot provenance.
- [ ] Treat malformed pin metadata as pinned.
- [ ] Measure physically contained bytes without following links.
- [ ] Rebuild inventory and require identical plan digest before apply.
- [ ] Verify focused GREEN and commit.

### Task 6: Commands and package wiring

**Files:**
- Create: `extensions/workflow-register/src/commands/runRetention.ts`
- Modify: `extensions/workflow-register/src/extensionWithAuthoring.ts`
- Modify: `extensions/workflow-register/package.json`
- Create: `extensions/workflow-register/test/workflowRunRetentionCommands.test.js`

- [ ] Add RED command and contribution tests.
- [ ] Add inspect／preview／cleanup／delete selected／pin／unpin commands.
- [ ] Add disabled-by-default settings.
- [ ] Render metadata-only Markdown preview and modal confirmation.
- [ ] Prove no startup/timer automatic deletion.
- [ ] Verify focused GREEN and commit.

### Task 7: Documentation, verification and merge

**Files:**
- Create: `extensions/workflow-register/docs/workflow-run-retention-ja.md`
- Create: `docs/release-evidence/workflow-run-retention-p1-6-2026-07-13.md`
- Create: `docs/release-evidence/workflow-run-retention-p1-6-review-2026-07-13.md`
- Modify: `docs/workflow-register-feature-roadmap-2026-07-11.md`

- [ ] Document policy, blockers, pin, lease, quarantine, rollback and external UAT.
- [ ] Run focused tests, compile, full suite, all policies, audit, package, VSIX policy and `git diff --check`.
- [ ] Run exact-final-head Linux／Windows `extensions-quality`.
- [ ] Run `workflow-contracts` and `code-consistency-review-scaffold` when relevant.
- [ ] Whole-diff review: Critical 0 / Important 0.
- [ ] Remove temporary verification workflows.
- [ ] Update PR body, mark ready and squash merge.
