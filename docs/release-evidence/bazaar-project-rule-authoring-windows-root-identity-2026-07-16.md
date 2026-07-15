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

## Remaining gate

This evidence covers repository Windows regressions only. Microsoft Office documents, Poppler, IBM Bob, workflow-register integration, visual Human Triage, and signed distribution remain in the separate Windows UAT / product-release gate.
