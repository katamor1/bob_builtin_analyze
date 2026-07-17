# Bob Review Real-Machine Test Environment Verification

**Date:** 2026-07-17  
**Status:** Automated contract verification complete; full environment generation and operator UAT pending

## Revision

- Tested implementation commit: `196c211867dc5801ab734d78cc7e6ae006107f4e`
- Branch: `agent/bob-review-real-machine-test-environment-design`
- Pull request: `#140`
- GitHub Actions run: `29601476186`
- Dedicated job: `Real-machine environment contracts` (`87954414664`)

The verification document itself is committed after the tested implementation commit. No runtime implementation file changed between the tested commit and creation of this record.

## Verification environment

| Item | Observed value |
| --- | --- |
| Runner OS | Microsoft Windows Server 2025 Datacenter, `10.0.26100` |
| Runner image | `windows-2025-vs2026`, image version `20260714.173.1` |
| Node.js | `22` as configured by `actions/setup-node` |
| Git | `2.55.0.windows.2` |
| PowerShell | GitHub-hosted `pwsh`; exact patch version was not printed by the job |
| Repository checkout | Pull-request merge ref for PR `#140` |

## Automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| `node --test scripts/real-machine-test-environment.test.js` | PASS | Dedicated Windows job completed `Verify repository contracts` successfully. The file defines 10 contracts, including two Windows process-level contracts. |
| `pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly` | PASS | Dedicated Windows job completed `Verify PowerShell manifest and seed plans` successfully. |
| Missing VS Code CLI blocked-scenario process | PASS | A nested, initially missing output-parent hierarchy was created safely; the scenario was recorded as `blocked`, no launch target was produced, and all operator results stayed `not_run`. |
| PowerShell launcher invocation | PASS | A temporary launcher received the injected `NoLaunch` switch and sample argument through ordered-argument splatting, and its stdout was captured in the scenario log. |
| `bob-bazaar-review` unit suite | PASS | The final workflow run completed its `Unit tests`, package, VSIX policy, and VSIX metrics steps successfully. This suite includes the existing integration sandbox launcher contract test. |
| `bob-code-consistency-review` unit suite | PASS | The final workflow run completed its `Unit tests`, package, and VSIX policy steps successfully. This suite includes the existing integration sandbox launcher contract test. |

## Contracts verified

- The source manifest contains exactly the approved six scenarios in `p0-p1` order.
- Repository-relative source paths and scenario-relative destination paths use separate validation paths.
- Arbitrary launchers, arbitrary shell commands, and manifest overrides of runner-injected arguments are not allowed.
- Existing Bazaar and code-consistency launchers are called through a generated argument dictionary with `NoLaunch = $true`.
- Existing output roots, repository-contained roots, and reparse-point traversal are rejected.
- A new output root may include missing parent directories after the nearest existing ancestor has passed containment and reparse-point checks.
- Scenario failure or missing prerequisites are recorded independently as `failed` or `blocked`; independent scenarios are not stopped by design.
- Generated operator results begin with `not_run`; the generator does not convert environment readiness into UAT success.
- Bazaar recovery seed validation covers result capture, human triage, finalize, malformed-run exclusion, and completed-phase artifact invariants.
- Bazaar invalid review-result fixtures remain outside `.bob/review/results`.
- Five code-consistency invalid fixtures remain under `workspace/test-data/invalid` and cannot target active input or output paths.
- CI validates the repository contracts and write-free PowerShell plan only; it does not invoke IBM Bob, real AI, or GUI automation.

## Scenario readiness status

The following table records what was validated in this execution. `definition_validated` means the manifest, checklist, prerequisite declaration, expected artifact declaration, and any seed or fixture plan passed automated validation. It does **not** mean that the full sandbox was generated or manually operated.

| Scenario | Automated status | Full generated environment | Operator testcase status |
| --- | --- | --- | --- |
| `bazaar-core` | `definition_validated` | Not generated in this verification environment | `not_run` |
| `bazaar-run-recovery` | `definition_and_seed_validated` | Not generated in this verification environment | `not_run` |
| `consistency-ai-matrix` | `definition_validated` | Blocked-scenario behavior exercised; full ready environment not generated | `not_run` |
| `consistency-traceability` | `definition_validated` | Not generated in this verification environment | `not_run` |
| `consistency-multilang` | `definition_validated` | Not generated in this verification environment | `not_run` |
| `consistency-validation-errors` | `definition_and_fixture_plan_validated` | Fixture-copy contract validated; full ready environment not generated | `not_run` |

## Work not claimed as complete

The following steps require a Windows workstation or Bob IDE environment with the three packaged VSIX files, expanded `bob2/bob-code`, VS Code or Bob IDE CLI, Git, and Bazaar CLI available together. They were not performed by the current automated verification.

- Packaging the three VSIX files in one local verification workspace and generating all six ready environments.
- Opening a generated scenario in VS Code or Bob IDE and visually confirming a single window.
- Running individual `BZR-RT-*` and `CCR-RT-*` operator checklists.
- Exercising IBM Bob Workflow UI, Webviews, MCP tools against a real Bazaar repository, or an actual AI request.
- Recording `pass`, `fail`, or `blocked` decisions in generated `operator-result.json` files.

## Conclusion

The repository tooling, safety boundaries, deterministic seed plans, isolated invalid fixtures, blocked-scenario evidence path, launcher argument path, and Windows `-ValidateOnly` contract are verified at the tested implementation commit. Manual real-machine acceptance remains explicitly pending and must be recorded through the generated operator checklists and `operator-result.json` files rather than inferred from environment generation.