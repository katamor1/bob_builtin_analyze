# Branch Retirement Execution

- Repository: `katamor1/bob_builtin_analyze`
- Workflow run: `29494601324`
- Workflow job: `87608478763`
- Reviewed execution head: `87701ac1db59ba3f5320b4d32c49378b81a8d3cc`
- Mode: `apply`
- Status: **success**
- Atomic transaction: **yes**
- Per-ref force-with-lease: **yes**
- Sequential fallback: **no**
- `main` SHA before: `d912e4edbc969bfae961ca7e8fbef92ace93d798`
- `main` SHA after: `d912e4edbc969bfae961ca7e8fbef92ace93d798`
- `main` protected: **no**

## Deleted branches

1. `diagnostic/p1-1-windows-flake-20260712`
2. `diagnostic/phase4-windows-20260712`
3. `agent/workflow-automatic-pause-ci-verification-20260712`
4. `agent/repository-symbol-index-producer-contracts-red-20260712`
5. `agent/workflow-recovery-ux-p1-builder-readiness-20260712`
6. `agent/workflow-reproducible-runtime-phase4-20260712`
7. `agent/bob-evidence-scope-phase5-20260712`
8. `codex/evidence-scope-phase5-checkpoint-20260712`
9. `agent/bob-bazaar-review-review-run-v3-dashboard`
10. `codex/bazaar-ai-project-rule-authoring`
11. `codex/execute-shared-plan-6a53743e`
12. `integration/bazaar-campaign-dashboard-20260716`
13. `plan/retire-intentionally-unintegrated-20260716`

## Already absent before execution

- `automation/fix-pr97-windows-portable-tests-20260716`
- `agent/workflow-run-retention-p1-6-20260713`

## Post-execution verification

The workflow verified all 13 target refs were absent after the atomic push and that `main` retained the same SHA. A separate GitHub connector verification then resolved each of the 13 deleted branch names and both already-absent names; every lookup returned no branch commit, while `main` still resolved to `d912e4edbc969bfae961ca7e8fbef92ace93d798`.

## Unprotected `main` substitute

Because branch protection was not configured, the transaction used the following equivalent fail-closed boundary:

- a reviewed exact allowlist rather than prefix discovery;
- explicit exclusion of `main` and the execution branch;
- exact audited remote SHA equality before deletion;
- one `--force-with-lease` argument per ref;
- one `git push --atomic` transaction;
- no sequential/API fallback;
- pre/post `main` SHA equality.
