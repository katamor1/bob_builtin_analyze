# Three-extension runtime release-blocker closure

**Date:** 2026-07-16  
**Source PR:** #134 `fix(extensions): close runtime release blockers`  
**Reviewed source head:** `d907581ed723fe6c53ea4df0107da16fbad6a50f`

This evidence file preserves the release-blocker disposition from the source branch while the shared tracking table remains based on the newer `main` baseline. The implementation, design, test specification, and detailed remediation evidence are integrated from the reviewed source head.

| ID | Scope | Contract | Status | Source verification |
| --- | --- | --- | --- | --- |
| REM-RB-01 | 3 extensions | lockfile, soft dependency, production audit, VSIX dependency/package policy | verified_local | dependency policies, `npm audit --omit=dev` with 0 vulnerabilities, and all three VSIX policies |
| REM-RB-02 | `bob-bazaar-review` / `bob-code-consistency-review` | 1,000–600,000 ms timeout normalization, `AbortSignal`, bounded output, process-tree termination | verified_local | focused external-process tests and Windows `taskkill` completion tests |
| REM-RB-03 | `bob-bazaar-review` / `bob-code-consistency-review` | release all providers and listeners despite cleanup or diagnostic callback failures | verified_local | retry-registration controller tests in both extensions |
| REM-RB-04 | `bob-bazaar-review` / `bob-code-consistency-review` | reject Windows absolute, drive-relative, UNC, device, traversal, and control paths before execution | verified_local | Bazaar client and VCS validation tests |
| REM-RB-05 | all 3 extensions | manifest/runtime clamps, final UTF-8 output cap, and formatted task-snapshot hard cap | verified_local | workflow-register task-snapshot tests, Bazaar review-limit tests, and code-consistency size-limit tests |

`verified_local` means the implementation and local regression gates are complete. Ubuntu/Windows CI, Extension Host, IBM Bob, real Bazaar descendant-process checks, and multi-root release-candidate UAT remain separately tracked release gates.

## Integration reconciliation

The source PR and current `main` both edited `docs/review-findings-tracking.md`. To avoid replacing newer CI-baseline evidence, the current `main` tracking table is retained and this source-specific disposition is recorded here. No product-code or test change from the reviewed PR is dropped.
