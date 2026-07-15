# Task 1 Fix Report: migration publication rollback and close precedence

## Status

Implementation and verification are complete. The two Important findings in
`task-1-final-review-report.md` were reproduced with failing regressions and
fixed without changing timeout values or files outside the requested source,
test, and this report.

## Requirements sources

The following files were read in full before implementation:

- `.superpowers/sdd/task-1-brief.md`
- `.superpowers/sdd/task-1-final-review-report.md`

The review report's two Important findings were treated as binding:

1. Record ownership as soon as `fs.link` succeeds so every later publication
   failure attempts owner-handle-checked rollback of the created backup.
2. Keep linked-verification close-only, cleanup `rm`, cleanup path-handle close,
   and owner close outcomes distinct until outer finalization, preserving this
   semantic order:
   - operation/identity failure
   - byte/domain-safety failure
   - cleanup `rm` failure
   - close-only failure

The existing outer rule remains primary failure > cleanup `rm` > owner close.

## Initial state

- Worktree: `C:\Users\stell\source\repos\bob_builtin_analyze\.worktrees\pr-93-p1-6`
- Branch: `agent/workflow-run-retention-p1-6-20260713`
- Worktree status before Task 1 edits: clean
- No unrelated user changes were modified.

## Root cause analysis

### I1: created-link ownership was recorded too late

`publicationLinked` became true only after both post-link
`linkedPublicationFile(...)` calls returned and their identities matched. A
successful `fs.link(tempPath, backupPath)` followed by a metadata failure could
therefore reach `finally` with no recorded backup ownership. Temp cleanup then
removed one link while the unverified backup remained as an authoritative
single-link file.

### I2a: linked-verification close-only became a primary operation failure

`readAndValidateLinkedPublicationFiles(...)` correctly selected operation and
byte failures before handle-close failures, but its raw close error was caught
by the publication catch and stored in `operationFailure`. A later rollback
`fs.rm` error was therefore suppressed even though cleanup removal outranks a
close-only error.

### I2b: cleanup path-handle close was always swallowed

`removeDirectFileOwnedByHandle(...)` settled its path-verification handle in a
`finally` block that unconditionally ignored close rejection. A matching-backup
EEXIST path could remove its owned temp and report success despite an uncertain
cleanup handle state.

## RED evidence

### I1: post-link metadata EIO after in-place byte mutation

The regression lets the real hard link complete, mutates the shared owner inode
in place, and injects EIO on the backup's first post-link `lstat`.

```powershell
node --test --test-name-pattern="migration rolls back a linked owner when first backup metadata verification fails" test/workflowRunStateMigrationPath.test.js
```

Pre-fix result: 1 test, 0 passed, 1 failed. The expected EIO reached the caller,
but the regression failed with `Missing expected rejection` because the backup
path still existed. This was the intended missing-rollback failure.

### I2a: verification close-only plus rollback rm EIO

The regression performs the real verification-handle close and then rejects
with a close-only EIO. The subsequent owner-verified backup `fs.rm` rejects with
a different cleanup EIO.

```powershell
node --test --test-name-pattern="migration rollback cleanup error outranks linked verification close-only failure" test/workflowRunStateMigrationPath.test.js
```

Pre-fix result: 1 test, 0 passed, 1 failed. The observed message was
`simulated linked verification close-only EIO`; the expected higher-priority
message was `simulated rollback cleanup rm EIO`.

### I2b: EEXIST matching-backup cleanup path close

The regression creates a real matching backup in the `fs.link` EEXIST race and
patches only the second owned-temp handle, which is the cleanup
path-verification handle. Its real close completes and then rejects with EIO.

```powershell
node --test --test-name-pattern="migration EEXIST success surfaces cleanup path verification close failure" test/workflowRunStateMigrationPath.test.js
```

Pre-fix result: 1 test, 0 passed, 1 failed. The regression failed at
`assert.ok(observedError)` because the close rejection was swallowed and the
operation resolved successfully.

## Implementation

### `runStateMigrationBackup.ts`

- Replaced the post-verification `publicationLinked` state with
  `publicationLinkCreated`, set immediately after `fs.link` returns.
- Retained the live temp owner handle through rollback. Every later failure now
  attempts backup removal through the existing identity/nlink/containment
  checks, preserving any foreign replacement.
- Captured linked-publication close-only failures separately from primary
  operation/identity and byte/domain-safety failures.
- Selected outer failures after cleanup as primary > cleanup `rm` > linked
  verification close > cleanup path-verification close > owner close.
- Changed `removeDirectFileOwnedByHandle(...)` to settle removal and path-handle
  close independently:
  - a non-missing `fs.rm` failure is retained and thrown after close settlement;
  - a close-only failure is returned to the outer selector;
  - a cleanup-path close failure no longer aborts later safe cleanup attempts;
  - cleanup `rm` still outranks path-handle close when both fail.

### `workflowRunStateMigrationPath.test.js`

Added three real-filesystem regressions:

- post-link in-place mutation plus first backup metadata EIO; asserts primary
  EIO, both owned paths absent, clean retry, exact bytes, and `nlink=1`;
- linked-verification close-only plus rollback `rm` EIO; asserts cleanup EIO and
  the explicit surviving same-inode two-link pair with exact bytes;
- matching-backup EEXIST plus cleanup path-verification close EIO; asserts the
  close failure is surfaced while the exact single-link backup remains and the
  owned temp is absent.

The tests use real files, links, stats, reads, and closes. Monkey patches are
limited to the precise failure boundary being injected and are restored in
`finally` blocks.

## Focused GREEN evidence

Each regression passed individually after its minimal production fix:

- I1: 1 passed, 0 failed
- I2a: 1 passed, 0 failed
- I2b: 1 passed, 0 failed

## Final verification

### Compile

```powershell
npm.cmd run compile
```

Final result after all production changes: exit 0.

### Full migration file

```powershell
node --test test/workflowRunStateMigrationPath.test.js
```

Fresh result: 32 tests, 32 passed, 0 failed, 0 skipped.

### Metadata budget

```powershell
node --test --test-name-pattern="durability operations stay within the verified-chain metadata call budget" test/workflowRunDurabilityPath.test.js
```

Fresh result: 1 test, 1 passed, 0 failed. Reported calls remained
`read=100, replace=298`.

### Diff hygiene

```powershell
git diff --check
```

Result before report creation: exit 0 with no whitespace errors. A final run
including this report is recorded before commit.

## Iteration notes

- The first compile attempt was terminated by the command harness's 30-second
  execution limit without compiler diagnostics. The same compile command was
  rerun to completion; no source or test timeout was changed.
- The first I2a compile identified one TypeScript control-flow narrowing error
  (`TS2339` on the callback-mutated discriminated union). Failure selection was
  moved into a small typed helper without changing runtime precedence, after
  which compile and the focused regression passed.

## Self-review

- Confirmed successful-link ownership is recorded before any fallible post-link
  metadata or byte verification.
- Confirmed rollback remains owner-handle checked and never path-name-only.
- Confirmed operation/identity outcomes are selected before byte validation,
  byte/domain-safety outcomes before cleanup, cleanup `rm` before all close-only
  outcomes, and owner close last.
- Confirmed a cleanup path-handle close failure is retained without overriding a
  cleanup `rm` failure or an outer primary failure.
- Confirmed all existing migration precedence, crash-pair preservation,
  replacement-inode preservation, direct-read, and metadata-budget tests pass.
- Confirmed no timeout value was changed.
- Confirmed code/test changes are limited to the two requested migration files.

## Read-only quality review

An independent read-only reviewer re-read both requirement files, the complete
production diff, the new regressions, and the relevant surrounding code.

- Ready: yes
- Critical: 0
- Important: 0
- Minor: 0
- Recommendation: approve the two-file remediation as-is

The reviewer independently confirmed the I1 ownership timing, I2a cleanup-rm
precedence, I2b cleanup path-close propagation, retained owner-handle checks,
explicit residual-pair assertions, and the required close-last ordering.

## Concerns

None. The previously documented non-atomic verify-to-path-operation limitation
is unchanged and is outside these deterministic bookkeeping fixes.
