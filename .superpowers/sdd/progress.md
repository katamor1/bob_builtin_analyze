# PR #93 P1-6 SDD Progress

- Branch: `agent/workflow-run-retention-p1-6-20260713`
- Starting head: `0aa609e5e5b9ff98fec0e85b81c169a45e75d000`
- Merge base: `f35e7e79b3133f639b80aa9e4b3a5b00fe3b09cc`
- Worktree: `C:\Users\stell\source\repos\bob_builtin_analyze\.worktrees\pr-93-p1-6`
- Known CI baseline: Linux and Windows each pass 894/900 workflow-register tests; six failures cover lease/run-lock exclusion, three quarantine EISDIR paths, command registration, and settings. The obsolete `expected-red` job also fails.
- Local baseline (2026-07-14): `npm.cmd test` did not complete within 303.7 seconds; the harness ended with `EPIPE` only after the command timeout closed its output pipe. Treat local full-suite completion as an explicit final gate, separate from the confirmed CI failures.

## Tasks

- Task 1: complete — commit `0f20561c42a2bab002a062d84dca4ecb6f3276b4`; exact three-file deletion; `git diff --check` PASS; independent spec/quality review Approved with Critical 0 / Important 0 / Minor 0.
  - GitHub checkpoint: PR head `0f20561c`; obsolete `expected-red` run is absent. Normal `extensions-quality` run `29273303258` has five successful jobs and only Linux/Windows `workflow-register` failing at Unit tests, with later package/VSIX/smoke steps skipped as expected until implementation is green.
- Task 2: complete — commits `001e2ffbd15bd34f2611fe4d83d1dd880f458e90` and `6169d9413d11415a4d6875a3bac2e171f6648b68`; compile PASS; lease/lock focused 32/32 PASS; full suite 905/910 PASS with only the five planned non-Task-2 failures; `git diff --check` PASS; independent re-review Approved with Critical 0 / Important 0 / Minor 0.
  - Safety decision: exact v1 `<runId>.json` metadata is fenced by an authoritative atomic `<runId>.guard/owner.json`. New-protocol stale/orphan guards fail closed and are never auto-reclaimed; Task 7 must document deliberate operator recovery. Guardless legacy stale JSON remains recoverable only after guard ownership and revalidation.
- Task 3: complete — commits `7b352bed25754084059e22700ee5d4370378951e`, `1f503f3f5f993baa54b35a5025b8517a8b82ba7c`, and `85030ffd7f7a1c130529123a4d2c71b9355cdfec`; compile PASS; pin/source/run-lock focused 81/81 PASS; full suite 921/926 PASS with only the five planned non-Task-3 failures; `git diff --check` PASS; independent final re-review Approved with Critical 0 / Important 0 / Minor 0.
  - Safety decision: pinning and artifact source reuse explicitly require an existing run directory. Cleanup-before-waiting and cleanup-complete-before-call schedules both fail closed without recreating an empty source directory; default new-run lock creation remains available to save paths.
- Task 4: complete — commits `ef013f77a2b080c8c760ca8c84b9985296e5af5b` and `55c867c9`; compile PASS; Task 4 focused 35/35 PASS; full suite 941/946 PASS with only the five planned Task-5/Task-6 failures; `git diff --check` PASS; independent full-range re-review Approved with Critical 0 / Important 0 / Minor 0.
  - Inventory decision: raw physical inspection is non-mutating and globally fail-closed for future/unstable/incomplete provenance. Scanner budgets are depth 32, 10,000 entries, 8 MiB aggregate metadata capture, and 4 MiB aggregate fingerprint input; limit overruns retain known bytes but block cleanup.
  - Task 5 seam: retention revision, directory identity, bounded tree fingerprint, measurement completeness, and reference-graph completeness are captured and bound into planner evidence.
- Cross-platform CI follow-up: complete — the incomplete `c5aa0bc3dcdc89a7f3d1126f80d8844940aa31b0` follow-up was closed by physical parent/leaf matching, order-independent bounded fixtures, and durability containment bound to verified `(dev, ino)` directory chains. Review acceptance now coordinates behind the active engine owner, heartbeat ticks coalesce to at most one in-flight refresh, and load-sensitive tests extend observer deadlines only while preserving product lock deadlines and assertions. Compile PASS; final focused suite 205/205 PASS; exact full suite 987/989 PASS with only the two planned Task-6 command/settings failures and zero unexpected failures or cancellations; independent final review recorded no findings.
- Task 5: complete — commits `cb0bbfe68840e4dfc83c840807fcef053dd8d3f9`, `8f3f8ac29e3ab0d4287da9d26074352f6562c651`, and `2fd7aef029068507aca51c460392a1d78b75a0f9`; verified plan required for every destructive transaction; one post-lease full preflight plus bounded candidate evidence; authoritative provenance references coordinated by the source-lock/cleanup-lease protocol; per-target quarantine revalidation and nonrecursive transaction cleanup; typed rollback/purge/parent-cleanup incomplete state. Compile PASS; focused plus lease/lock/source-reference 128/128 PASS; full suite 970/972 PASS with only the two planned Task-6 failures; `git diff --check` PASS; final independent full-range review Approved with Critical 0 / Important 0 / Minor 0.
  - Residual boundary: Node.js does not provide identity-conditional rename or handle-relative identity-conditional recursive deletion. Cooperative writers are excluded and moved targets are revalidated immediately before individual purge; the final verification-to-filesystem-call race for a non-cooperating OS actor is documented for Task 7.
- Task 6: pending
- Task 7: pending

## Minor findings

- None recorded.
