# Bazaar Project Rule Authoring — Windows CI Fixes

## Scope

PR #97 (`codex/bazaar-ai-project-rule-authoring`) の repository merge gate で検出された Windows 固有の failures を記録する。

## Workspace-root identity failure

### RED evidence

- Workflow: `extensions-quality`
- Run: `29457533366`
- Job: `87493923022` (`Windows / bob-bazaar-review`)
- Failing suite: `test/ruleApplyRecovery.test.js`
- Representative failures:
  - `finds incomplete transactions by validated ID and restart rollback is idempotent`
  - `restart resume verifies replaced targets and commits a missing manifest idempotently`
- Error: `RuleApplyTransactionError` / `unsafe_path`
- Failure origin: `assertWorkspaceRoot()`

The same implementation and recovery tests were green on Linux. The Windows runner rejected the temporary workspace before transaction mutation began.

### Root cause

`assertWorkspaceRoot()` compared the requested workspace path and `fs.realpath()` result by normalized text. On Windows, `realpath()` may return a different textual spelling for the same directory, including equivalent 8.3 and long-path forms. The old check therefore rejected a direct, non-symlink directory even when both paths identified the same physical directory.

### Fix

Commit `9a138ba57d573ca4b1f4463f40e125668be07dd4` changes workspace-root verification to:

1. require the requested root to be a direct directory and not a symlink or junction;
2. resolve its physical path;
3. require the physical path to be a direct directory with the same `dev` / `ino` identity;
4. re-read the requested path and require its identity to remain unchanged.

The change does not weaken descendant path containment, target symlink rejection, transaction locking, or journal validation.

### GREEN evidence

- Workflow: `fix-pr97-windows-root-identity`
- Run: `29458041382`
- Job: `87495458248` (`fix-and-verify`)
- Runner: Windows Server 2025
- Verification:
  - `npm ci`: success
  - TypeScript compile: success
  - `node --test test/ruleApplyRecovery.test.js`: success
  - feature-branch commit and push: success

## Synthetic artifact-pointer fixture failure

### RED evidence

- Workflow: `extensions-quality`
- Run: `29458155351`
- Job: `87495798474` (`Windows / bob-bazaar-review`)
- Failing suite: `test/ruleAuthoringArtifactStore.test.js`
- Failing parent test: `resume treats a pointer-free run as empty but rejects inconsistent artifact lifecycles`
- Representative failing cases:
  - `invalidated run after restart`
  - `partial Task 7 pointer set`
  - `downstream pointer without Task 7 scope`
- Error: `Rule authoring artifacts require a bounded workspace-relative artifact name`

### Root cause

Production artifact generation already persists workspace-relative paths in canonical POSIX form with `/` separators. The test-only `artifactPointer()` fixture used raw `path.relative()` output, which contains `\` separators on Windows. The strict persisted-data validator correctly rejected those synthetic pointers.

### Fix

Commit `365ec50d690d8604e66fcd9a1e17f3d1738d50a6` normalizes the synthetic fixture with `.split(path.sep).join("/")`, matching the existing production contract without weakening validation.

### GREEN evidence

- Workflow: `fix-pr97-windows-artifact-fixture`
- Run: `29458482974`
- Job: `87496804460` (`fix-and-verify`)
- Runner: Windows Server 2025
- Verification:
  - `npm ci`: success
  - TypeScript compile: success
  - `node --test test/ruleAuthoringArtifactStore.test.js`: success
  - feature-branch commit and push: success

## GUI restart and lock-history fixture failures

### RED evidence

- Workflow: `extensions-quality`
- Run: `29458611140`
- Job: `87497198349` (`Windows / bob-bazaar-review`)
- Failing suites:
  - `test/ruleAuthoringGui.test.js`
  - `test/ruleAuthoringRunStore.test.js`
- Representative failures:
  - `default resume adapter restores fresh and invalidated runs before choose and extract`
  - `never retries a rotating callback when a nested lock reaches its own limit`
- Focused follow-up run `29459361811`, job `87499422476`, also exposed:
  - `caps closure history entries before snapshot validation work becomes unbounded`

### Root cause

1. The GUI restart fixture created three synthetic artifact pointers with raw `path.relative()` output, repeating the Windows separator mismatch already fixed in the artifact-store fixture.
2. Two lock-boundary fixtures created more than 1,024 hard links from a single source inode. NTFS rejected the test setup before the production generation-limit and closure-limit guards could run.

These failures were limited to synthetic test data. Production artifact persistence already uses POSIX-relative paths, and production lock files are separate immutable records rather than thousands of aliases to one inode.

### Fix

Commit `9383ab6ecf8acf7153fb546124d1b13b2e53e2c1`:

- normalizes the GUI restart fixture's three artifact pointers to `/` separators;
- distributes the 10,000-generation exhausted-lock fixture over 32 physically distinct lock seeds and 32 physically distinct closure seeds;
- copies the initial closure record into 32 distinct seed files before creating the closure-history cap fixture;
- preserves the exact 10,000-generation and 10,001-closure boundary conditions.

The production validator, directory-entry limits, lock generation limits, and callback behavior are unchanged.

### GREEN evidence

- Workflow: `fix-pr97-windows-gui-lock-fixtures`
- Run: `29459562775`
- Job: `87500000856` (`fix-and-verify`)
- Runner: Windows Server 2025
- Verification:
  - patch marker and `git diff --check`: success
  - `npm ci`: success
  - TypeScript compile: success
  - `node --test test/ruleAuthoringGui.test.js test/ruleAuthoringRunStore.test.js`: success
  - feature-branch commit and push: success

## Workflow artifact realpath identity failure

### RED evidence

- Workflow: `extensions-quality`
- Run: `29459714800`
- Job: `87500454361` (`Windows / bob-bazaar-review`)
- Failing suite: `test/ruleAuthoringWorkflowActions.test.js`
- Representative failures:
  - `workflow actions resolve one state-bound authoring run and publish exact generation artifacts`
  - `selected evidence accepts exactly 1 MiB and rejects the same payload below that boundary`
  - `verification action delegates final apply validation and exposes the authoritative apply manifest`
- Error: `Rule authoring file path contains a symbolic link`
- Failure origin: `readWorkspaceFileBounded()`

### Root cause

The bounded artifact reader already checked every directory component with `lstat()`, rejected direct file symlinks, verified workspace containment through `realpath()`, opened the file with `O_NOFOLLOW` where supported, and compared pre-read / open-handle / post-read identity. One additional check compared `path.resolve(targetReal)` and the requested file path as text. On Windows, equivalent 8.3 and long-path spellings caused that textual comparison to reject a direct regular file.

### Fix

Commit `edd8718d9526d6baf040333d55469680b7ac3b5a` replaces the textual path comparison with physical file identity verification:

1. resolve the physical workspace and target paths concurrently;
2. preserve physical containment validation;
3. reject a direct symlink at the requested path;
4. require the requested path and physical target to be the same regular file by `dev`, `ino`, mode, size, mtime, and ctime;
5. retain the existing open-handle and post-read race checks.

The byte limit, UTF-8 validation, directory-chain safety, and missing-file behavior are unchanged.

### GREEN evidence

- Workflow: `fix-pr97-windows-workflow-file-identity`
- Run: `29460142245`
- Job: `87501709018` (`fix-and-verify`)
- Runner: Windows Server 2025
- Verification:
  - patch marker and `git diff --check`: success
  - `npm ci`: success
  - TypeScript compile: success
  - `node --test test/ruleAuthoringWorkflowActions.test.js`: success
  - feature-branch commit and push: success

## Remaining gate

This evidence covers repository Windows regressions only. Microsoft Office documents, Poppler, IBM Bob, workflow-register integration, visual Human Triage, and signed distribution remain in the separate Windows UAT / product-release gate.
