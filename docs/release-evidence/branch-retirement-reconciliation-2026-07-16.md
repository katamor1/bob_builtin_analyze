# Branch Retirement Reconciliation

- Repository: `katamor1/bob_builtin_analyze`
- Workflow run: `29494601324`
- Workflow job: `87608478763`
- Reviewed execution head: `87701ac1db59ba3f5320b4d32c49378b81a8d3cc`
- Audited `main`: `d912e4edbc969bfae961ca7e8fbef92ace93d798`
- Default branch: `main`
- `main` protected at execution time: **no**
- Ready for deletion: **yes**
- Blocked unique changes: **0**

## Result

| Classification | Count |
| --- | ---: |
| Exact remote heads approved for deletion | 13 |
| Already absent before the batch | 2 |
| Blocked | 0 |

The audit used an explicit branch allowlist. For every present branch it verified the exact remote SHA, merged replacement pull requests, required paths on current `main`, absence of temporary helper paths, open-pull-request references, protected-target status, and ancestry of the audited `main` checkpoint.

## Approved exact heads

| Branch | SHA | Disposition | Replacement evidence |
| --- | --- | --- | --- |
| `diagnostic/p1-1-windows-flake-20260712` | `7db481f97243060f6f68cccb219d9720cc5fc8cd` | diagnostic-only | #82 |
| `diagnostic/phase4-windows-20260712` | `5db1f71676736add1a7d45d199c707f57291bfe2` | diagnostic-only | #77 |
| `agent/workflow-automatic-pause-ci-verification-20260712` | `a2f71784acbb9d860caa1a9851c91e66bea6507e` | diagnostic-only | #75, #92 |
| `agent/repository-symbol-index-producer-contracts-red-20260712` | `4c94f5ab8dcd79fff9a38b6c10c04f345d7a53ad` | superseded | #72 |
| `agent/workflow-recovery-ux-p1-builder-readiness-20260712` | `81e19775f9ce17242a39c7868085c50bc8eb9240` | superseded | #82 |
| `agent/workflow-reproducible-runtime-phase4-20260712` | `38d62885a8b7249b1f2d3853f31a0abc999ca160` | superseded | #77 |
| `agent/bob-evidence-scope-phase5-20260712` | `7c1bca1321648fbcb57c658f9c1dd7db08a28368` | superseded | #72 |
| `codex/evidence-scope-phase5-checkpoint-20260712` | `c093a20b0dd8551191f76f02b472d92cf0b45af7` | superseded | #72 |
| `agent/bob-bazaar-review-review-run-v3-dashboard` | `11a739c557004b88cae47663623638b5691c262c` | superseded | #83, #118 |
| `codex/bazaar-ai-project-rule-authoring` | `6f3c92e8544b3ebeccab465a66825f8f4bee4518` | merged-source | #97 |
| `codex/execute-shared-plan-6a53743e` | `6691988538af68c8cf52b33937b07e9fc06d0d67` | merged-source | #72 |
| `integration/bazaar-campaign-dashboard-20260716` | `f8d15d7bfd9d32718a4b0d7dbdc46d6752c69a14` | merged-source | #118 |
| `plan/retire-intentionally-unintegrated-20260716` | `5a198784f83080a939f65c30a07a516781b40041` | merged-source | #119 |

## Already absent

- `automation/fix-pr97-windows-portable-tests-20260716` — replacement #97
- `agent/workflow-run-retention-p1-6-20260713` — replacement #93

## Unprotected `main` handling

The repository did not have branch protection enabled for `main`. Deletion therefore proceeded only after replacing that precondition with all of the following fail-closed controls:

1. `main` and the execution branch were explicitly prohibited from the deletion batch.
2. Branches came only from a fixed, reviewed allowlist; no prefix or pattern discovery was used.
3. Every target used its audited exact SHA in `--force-with-lease`.
4. All targets were deleted in one `git push --atomic` transaction.
5. No sequential or GitHub-API deletion fallback was allowed.
6. The `main` SHA was compared before and after the transaction and remained unchanged.
