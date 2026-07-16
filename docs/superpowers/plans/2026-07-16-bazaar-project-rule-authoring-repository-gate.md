# Bazaar Project Rule Authoring — Repository Merge Gate

## Scope

This record closes the repository-level merge gate for the change group defined by:

- `docs/superpowers/specs/2026-07-14-bob-bazaar-review-ai-project-rule-authoring-design.md`
- `docs/superpowers/plans/2026-07-14-bob-bazaar-review-ai-project-rule-authoring.md`

Product-release UAT remains a separate gate and is not implied by merging this change group into `main`.

## Final Windows portability verification

The final repository portability corrections were verified on a GitHub-hosted Windows Server 2025 runner before being pushed to the feature branch.

- Workflow: `fix-pr97-windows-portable-tests`
- Run: `29461186400`
- Job: `87504775883`
- Result: success

Verified suites covered the remaining Windows-specific failures in rule-authoring GUI restart fixtures, rotating-lock boundary fixtures, workspace-root path resolution, and template newline normalization. The workflow committed and pushed the verified corrections to `codex/bazaar-ai-project-rule-authoring` only after those focused suites passed.

## Repository merge criteria

Before merge, the exact final head must satisfy:

- `workflow-contracts`: success
- every `extensions-quality` Linux and Windows job: success
- PR mergeability: clean
- no temporary diagnostic or mutation workflow in the feature diff

## Deferred product-release criteria

The following remain outside this repository merge gate:

- real IBM Bob and Bazaar UAT
- real Microsoft Office documents and Poppler
- multi-root workspace UAT
- ReFS and antivirus-contention testing
- signed distribution, upgrade, rollback, and operator-recovery UAT
