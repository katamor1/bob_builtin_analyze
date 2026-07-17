# Task 0 Report: Restore approved three-extension quality design and plans

## Status

`DONE`

## Commit

- Branch: `codex/three-extension-quality-improvements-20260717`
- Base: `f4f9d3308361333e02ab1af732706b7a9e5fc952`
- Commit message: `docs: restore three-extension quality design and plans`
- Commit SHA: `SELF` — the restoration commit containing this report; the exact resolved SHA is returned in the agent handoff (`git rev-parse HEAD`). A file cannot embed the hash of its own containing commit without changing that hash.

## Files changed

1. `docs/superpowers/specs/2026-07-17-three-extension-quality-contract-and-ui-consolidation-design.md`
2. `docs/superpowers/plans/2026-07-17-github-actions-immutable-sha-policy.md`
3. `docs/superpowers/plans/2026-07-17-three-extension-ui-and-documentation-contracts.md`
4. `.superpowers/sdd/progress.md` (append-only section; existing content preserved)
5. `.superpowers/sdd/three-extension-quality-task-0-report.md`

No product source, tests, extension manifests, package files, or workflows were modified.

## Verification commands and results

### Branch and base

```bash
git branch --show-current
git rev-parse HEAD
git status --short --branch
```

Result before restoration commit: branch is `codex/three-extension-quality-improvements-20260717`, HEAD is the required base `f4f9d3308361333e02ab1af732706b7a9e5fc952`, and the starting worktree was clean.

### Markdown and approved-content structure

A dependency-free Node.js read-only validation checked all three documents for balanced fenced blocks, placeholder text, the exact five public labels, compatibility C, the 18-reference baseline, soft-dependency/main/MCP contracts, all eight terminology mappings, exactly two SHA-plan tasks, exactly eight UI/document tasks in the approved order, and the run-contract boundary in every UI task.

Result:

```text
PASS markdown/contracts: exact labels 5/5; SHA tasks 2; UI tasks 8; terminology 8/8; npm scripts valid
```

The npm-script validation read the three actual extension `package.json` files and rejected any plan command whose script name was not present.

### Repository paths

A read-only Node.js validation checked every literal existing `Modify`, `Delete`, and `Reuse` target in the two plans.

Result:

```text
PASS repository paths: 50 existing Modify/Delete/Reuse targets verified
```

Future `Create` targets and explicit discovery-command results were intentionally not required to exist yet.

### Action pin baseline

```bash
rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github
```

A read-only count over `.github/workflows` confirmed:

```text
PASS baseline: 18 external uses references across 3 workflow files
```

All current values remain lowercase 40-character SHAs with their existing comments. No workflow was edited.

### Whitespace and scope

```bash
git diff --no-index --check /dev/null docs/superpowers/specs/2026-07-17-three-extension-quality-contract-and-ui-consolidation-design.md
git diff --no-index --check /dev/null docs/superpowers/plans/2026-07-17-github-actions-immutable-sha-policy.md
git diff --no-index --check /dev/null docs/superpowers/plans/2026-07-17-three-extension-ui-and-documentation-contracts.md
git diff --check
git status --short
```

Result: PASS. Final staged-scope verification confirmed only the five files listed above.

## Deviations

None. The restored implementation plans intentionally describe future source/test/workflow changes, but this restoration commit contains planning and handoff artifacts only.

## Concerns

None.

---

## Task 0 review remediation: classification-aware UI migration checks

### Status

`DONE`

### Commit

- Commit message: `docs: make UI migration checks classification-aware`
- Commit SHA: `SELF` — the exact resolved SHA is returned in the agent handoff because a file cannot embed the hash of its own containing commit.

### Review findings addressed

1. Replaced both prefix-based obsolete-reference scans with exact contract checks. The command-surface plan now parses structured manifest fields by equality and matches complete identifier tokens elsewhere. It explicitly proves that `workflowRegister.runs` is obsolete while `workflowRegister.runs.retention.*` and `getConfiguration("workflowRegister.runs.retention")` remain valid settings and do not require a configuration rename.
2. Replaced the selected 16-document policy with one recursive, repository-maintained classification contract. Its metadata discovers the three extension READMEs and complete extension-local `docs/` trees, `extensions/README.md`, and repository-level `docs/`; explicit exact-path metadata marks history and every unlisted discovered document defaults to current. Current documents allow no obsolete references, while historical occurrences require a top-level replacement notice.
3. Added explicit coverage for the current Code Consistency UAT runbook `triage-integrity-ibm-bob-uat-runbook-ja.md` and historical Bazaar iteration 1, iteration 2, and iteration 3 dashboard documents. Task 8 now reuses the Task 5 exact command-surface contract and Task 6 classification-aware documentation contract rather than running a conflicting all-history zero-match search.

### Files changed

1. `docs/superpowers/plans/2026-07-17-three-extension-ui-and-documentation-contracts.md`
2. `.superpowers/sdd/three-extension-quality-task-0-report.md` (this append-only remediation section)

No design spec, immutable-SHA plan, progress log, product source, test implementation, manifest, package file, or workflow was modified.

### Verification commands and results

A dependency-free Node.js content check verified the exact live-ID matcher instructions, both retained-setting negative fixtures, recursive metadata classification, the four explicitly cited document classifications, Task 8 contract reuse, eight-task structure, balanced fenced blocks, and removal of both obsolete prefix-scan commands.

Result:

```text
PASS focused plan content: exact live-ID matcher; retained-settings negatives; recursive metadata classifier; cited UAT/iteration coverage; Task 8 reuses both contracts; 8 tasks; fences balanced
```

```bash
git diff --check
git diff --name-only HEAD
```

Result: PASS. The diff contains only the UI/document plan plus this append-only report update.

### Deviations

None.

### Concerns

None.
