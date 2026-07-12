# Workflow Automatic Pause — Current Main Reconciliation Evidence

## Scope

- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Draft PR: #75
- Feature branch: `agent/workflow-automatic-pause-limits-20260712`
- Main head reconciled: `57ff053bc3f476e3e9d268a743f25edeb0d68356`
- Reconciliation commit: `5e9bad7621e279314f58fbacdced591654fee576`
- Reconciliation workflow run: `29199542141`
- Final evidence synchronization commit before this record: `db4fcc63c0c4489cd215e6c4f038beea5b82a9e0`

## Conflict inventory

The non-destructive merge found exactly three conflicts:

1. `extensions/workflow-register/src/core/runtime/runLock.ts`
2. `extensions/workflow-register/test/runStateStorePathBoundary.test.js`
3. `extensions/workflow-register/test/workflowRunRecovery.test.js`

No other source, schema, documentation, package, or workflow files conflicted.

## Resolution

### Run lock

The reconciled implementation retains automatic-pause branch handling for atomic heartbeat replacement during both exclusive lock creation and lock reads, while also retaining current-main handling for transient `ENOENT` / `ENOTDIR` reads. Only `run.lock.json` heartbeat/path-identity races are retried as contention. Symlink, junction, workspace escape, invalid ownership, and unrelated I/O failures remain hard errors.

### Run-state path boundary

The reconciled suite keeps both contracts:

- current main rejects a run-directory alias during `loadRun()` and `listRuns()`;
- the automatic-pause branch verifies that an out-of-band materialized `run.json` replacement is rejected when it breaks the immutable event chain;
- current main's contained atomic replacement read test is retained as a separate case.

### Recovery suite

The current-main recovery suite was retained in full, including the expanded Phase 4 durability, lease, migration, and recovery coverage. The transient `run.json` rename test uses the exact materialized target path.

## Verification

Run `29199542141` completed successfully after resolving the merge:

- bounded conflict inventory check: success
- TypeScript compile: success
- focused automatic-pause tests: success
- run-lock and deterministic heartbeat-contention tests: success
- run-state path-boundary tests: success
- recovery, journal, and migration tests: success
- dependency policy: success
- architecture policy: success
- source policy: success
- schema policy: success
- full `workflow-register` test suite: success
- package: success
- VSIX policy: success
- full `bob-code-consistency-review` test suite: success
- `git diff --check`: success

The merge workflow removed its temporary reconciliation and diagnostic workflow files before committing.

## Branch relationship after reconciliation

The feature branch is ahead of `main` and behind by zero commits. GitHub reports PR #75 as mergeable. Required hosted checks passed on user-authored evidence head `516560f27237dbd422f597d73bc1680407d72ba8`; the pull request remains draft only for separately tracked real IBM Bob, Bazaar process-cleanup, and multi-root evidence.

## Reconciled-head hosted checks

- `workflow-contracts` run `29199698139`: success
- `extensions-quality` run `29199698142`: success
- `code-consistency-review-scaffold` run `29199698155`: success
- Ubuntu / Windows unit tests, package, VSIX policy, and Extension Host smoke: success

This user-authored evidence update intentionally triggers one final required-check pass after all plan and evidence files were synchronized.
