# PR #93 Workflow Run Retention P1-6 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task-by-task. Production behavior changes require `superpowers:test-driven-development`; every task requires an independent review package and reviewer gate.

**Goal:** Close the remaining migration and Windows CI regressions, complete operator and release evidence, obtain exact-final-head Linux/Windows/package/review approval, squash-merge PR #93 to `main`, and safely remove the local worktree and feature branch.

**Architecture:** Preserve the existing manual-only retention architecture and `run.json` authority. Treat the 21 Windows failures as test path-spelling portability defects unless a deterministic regression proves a production defect. Publish a code/docs release-candidate head first, then an evidence-only tail so exact-final-head CI and review can be recorded in the PR without a self-referential commit loop.

**Tech Stack:** TypeScript, Node.js test runner, VS Code extension manifest, PowerShell, GitHub Actions, Git/GitHub PR workflow.

## Global Constraints

- Work only in `C:\Users\stell\source\repos\bob_builtin_analyze\.worktrees\pr-93-p1-6` on `agent/workflow-run-retention-p1-6-20260713` until merge cleanup.
- Never force-push or rewrite the published branch history.
- `run.json` remains authoritative; do not change the run-state schema.
- The six retention commands remain manual-only; no startup or timer cleanup.
- `workflowRegister.runs.retention.enabled=false` remains a reservation for future automation and does not disable manual commands.
- Inspect and preview remain read-only in untrusted workspaces; cleanup, delete, pin, and unpin require trust before root discovery or filesystem access.
- Root selection precedes run selection in multi-root workspaces.
- Reports and evidence remain metadata-only; never include task, artifact, snapshot, or state bodies.
- Cross-process migration crash pairs are never auto-recovered; operator recovery requires exact temp/backup identity, link-count, byte, and no-alias proof.
- Product release remains NO-GO until real IBM Bob/Bazaar, multi-root, ReFS/AV, signing, distribution, and rollback UAT.
- Every code/test task ends with focused tests, compile, `git diff --check`, an intentional commit, and independent Critical/Important review closure.

---

### Task 1: Close the unpushed migration remediation

**Files:**
- Review: `extensions/workflow-register/src/core/runtime/runStateMigrationBackup.ts`
- Review: `extensions/workflow-register/test/workflowRunStateMigrationPath.test.js`
- Modify after approval: `.superpowers/sdd/progress.md`

- [ ] Generate a fresh review package for `8adc7cf0..7a7ef937`.
- [ ] Review primary-error > byte/safety > close-error ordering across initial publication, interrupted crash pairs, direct reads, rollback cleanup, and all verification-handle settlement.
- [ ] If a Critical or Important finding exists, add a failing regression first, apply the smallest production fix, rerun the migration file and compile, and re-review.
- [ ] Require Critical 0 / Important 0 / Minor 0 before recording closure.

### Task 2: Make Windows path-sensitive tests physical-path aware

**Files:**
- Modify: `extensions/workflow-register/test/helpers/physicalPathMatcher.js`
- Modify: `extensions/workflow-register/test/physicalPathMatcher.test.js`
- Modify: `extensions/workflow-register/test/workflowRunCleanupTransaction.test.js`
- Modify: `extensions/workflow-register/test/workflowRunDurabilityPath.test.js`
- Modify: `extensions/workflow-register/test/workflowRunLock.test.js`

- [ ] Preserve the existing CI failures as RED evidence: cleanup transaction 18, durability namespaced hook 1, run-lock root spelling 2.
- [ ] Add a deterministic matcher regression proving a lexical alias/junction and direct path with the same physical parent/leaf match, while a retargeted alias does not.
- [ ] Replace cleanup hook path-string equality with `createPhysicalPathMatcher()` for scan counts, root barriers, rename/rollback/purge, quarantine, and source-boundary hooks.
- [ ] Canonicalize the durability test's workspace root before computing descendant-relative paths, while retaining the snapshot and hook-count assertions.
- [ ] Canonicalize run-lock expected physical roots before ancestor-fallback and detached-descendant assertions.
- [ ] Do not change production code unless a new deterministic test demonstrates a production defect; if it does, use a separate RED/GREEN commit and review.
- [ ] Run compile and the five-file Windows-focused suite, commit, generate a review package, and require spec compliant + quality approved.

### Task 3: Push the remediation checkpoint and close early CI

- [ ] Verify branch scope and clean status; push only the intended commits.
- [ ] Monitor PR #93 `extensions-quality` and `workflow-contracts` on the new SHA.
- [ ] Diagnose every failure from logs; test failures require a regression/fix/review loop.
- [ ] Allow one unchanged rerun only for a log-proven external runner failure.
- [ ] Require both Linux and Windows `workflow-register` to pass before documentation evidence finalization.

### Task 4: Complete operator documentation and release evidence

**Files:**
- Create: `extensions/workflow-register/docs/workflow-run-retention-ja.md`
- Create: `docs/release-evidence/workflow-run-retention-p1-6-2026-07-13.md`
- Create: `docs/release-evidence/workflow-run-retention-p1-6-review-2026-07-13.md`
- Modify: `docs/workflow-register-feature-roadmap-2026-07-11.md`
- Modify: `extensions/workflow-register/README.md`
- Modify: `extensions/workflow-register/docs/README-ja.md`
- Modify: `extensions/workflow-register/docs/detailed-design-ja.md`
- Modify: `extensions/workflow-register/docs/real-machine-test-spec-ja.md`
- Modify: `docs/superpowers/plans/2026-07-13-workflow-run-retention-p1-6.md`
- Modify: `docs/superpowers/specs/2026-07-13-workflow-run-retention-p1-6-design.md`
- Modify: `.superpowers/sdd/progress.md`

- [ ] Document all six commands, four settings, trust split, root-first multi-root behavior, preview/apply binding, protected runs, and metadata-only output.
- [ ] Document lease `.bob/workflows/run-cleanup-leases/<runId>.json`, guard `.bob/workflows/run-cleanup-leases/<runId>.guard/owner.json`, and quarantine `.bob/workflows/run-cleanup-quarantine/<txId>/<runId>`.
- [ ] Document owner-checked manual guard recovery and exact migration crash-pair operator recovery; state that no cross-process automatic recovery exists.
- [ ] Record the final local gates, VSIX SHA-256/bytes/UTC/entry count, review findings and dispositions, RC CI run IDs, integration GO, and Product Release NO-GO.
- [ ] Update roadmap P1-3/P1-4/P1-5/P1-6 status without claiming deferred UAT.
- [ ] Commit docs/evidence separately and obtain an independent documentation/spec review.

### Task 5: Run final local and hosted gates

Run from `extensions/workflow-register`:

```powershell
npm.cmd run compile
node --test test/physicalPathMatcher.test.js test/workflowRunCleanupTransaction.test.js test/workflowRunDurabilityPath.test.js test/workflowRunLock.test.js test/workflowRunStateMigrationPath.test.js
node --test test/workflowRunRetentionPlanner.test.js test/workflowRunRetentionMetadata.test.js test/workflowRunCleanupLease.test.js test/workflowRunRetentionService.test.js test/workflowRunRetentionCommands.test.js
npm.cmd test
npm.cmd run dependency:policy
npm.cmd run architecture:policy
npm.cmd run source:policy
npm.cmd run schema:policy
npm.cmd run unused:report
npm.cmd run audit:prod
npm.cmd run package
npm.cmd run package:policy
```

- [ ] Require focused failures 0 and cancellations 0.
- [ ] Require the complete suite to pass locally, or use exact-final-head Linux and Windows `npm test` jobs as the authoritative full-suite evidence if the loaded local host alone prevents completion.
- [ ] Require every policy command to exit 0 and record any non-blocking audit advisory separately.
- [ ] Require VSIX <= 1,200,000 bytes and record hash, size, UTC time, and ZIP entry count.
- [ ] Require merge-base diff check and clean worktree.
- [ ] Push the evidence-only tail and require exact-final-head `extensions-quality` all 7 jobs plus `workflow-contracts` success.
- [ ] Record exact-final-head run IDs in the PR body without another evidence commit.

### Task 6: Whole-diff review, squash merge, and cleanup

- [ ] Generate a final review package for `f35e7e79b3133f639b80aa9e4b3a5b00fe3b09cc..HEAD` and obtain an independent Critical 0 / Important 0 verdict; fix or explicitly dispose every Minor.
- [ ] Confirm no temporary diagnostic or mutation workflow remains.
- [ ] Update the PR body with Delivered behavior, Safety, Verification, Review, and Deferred UAT; mark ready only after all exact-head gates pass.
- [ ] If `main` advanced into a conflict, merge `origin/main` into the feature branch without force-push and rerun every final gate.
- [ ] Squash merge PR #93 using the exact expected head SHA.
- [ ] Verify GitHub `mergedAt` and merge commit, fetch `origin/main`, and prove the merge commit is contained by `origin/main`.
- [ ] From the main checkout, preserve unrelated changes, remove the clean project-local worktree, prune worktree metadata, and delete only the local feature branch.
- [ ] Do not delete the remote feature branch without a separate explicit request.

## Final Acceptance

- PR #93 is merged by squash and its merge commit is on `origin/main`.
- Exact-final-head Linux/Windows/package/VSIX/workflow-contract/review gates are green.
- The release evidence distinguishes integration GO from Product Release NO-GO.
- The linked worktree and local feature branch are removed without touching unrelated user state.
- Real IBM Bob/Bazaar/multi-root/ReFS/signing/distribution UAT, P2-1 Dry Run, and P1-7 layer policy remain next-phase work.
