# Bazaar Project Rule Authoring — Windows Workspace-Root Identity Fix

## Scope

PR #97 (`codex/bazaar-ai-project-rule-authoring`) の repository merge gate で検出された Windows 固有の transaction recovery failure を記録する。

## RED evidence

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

## Root cause

`assertWorkspaceRoot()` compared the requested workspace path and `fs.realpath()` result by normalized text. On Windows, `realpath()` may return a different textual spelling for the same directory, including equivalent 8.3 and long-path forms. The old check therefore rejected a direct, non-symlink directory even when both paths identified the same physical directory.

## Fix

Commit `9a138ba57d573ca4b1f4463f40e125668be07dd4` changes workspace-root verification to:

1. require the requested root to be a direct directory and not a symlink or junction;
2. resolve its physical path;
3. require the physical path to be a direct directory with the same `dev` / `ino` identity;
4. re-read the requested path and require its identity to remain unchanged.

The change does not weaken descendant path containment, target symlink rejection, transaction locking, or journal validation.

## GREEN evidence

- Workflow: `fix-pr97-windows-root-identity`
- Run: `29458041382`
- Job: `87495458248` (`fix-and-verify`)
- Runner: Windows Server 2025
- Verification:
  - `npm ci`: success
  - TypeScript compile: success
  - `node --test test/ruleApplyRecovery.test.js`: success
  - feature-branch commit and push: success

## Remaining gate

This evidence covers the repository Windows regression only. Microsoft Office documents, Poppler, IBM Bob, workflow-register integration, visual Human Triage, and signed distribution remain in the separate Windows UAT / product-release gate.
