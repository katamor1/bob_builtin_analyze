# Production dependency audit remediation — 2026-09-29

## Scope

- Repository: `katamor1/bob_builtin_analyze`.
- Base: `5b345a0aa4e58296d3fe55f4876cab151f9f24aa`.
- Local branch: `codex/v2-dependency-audit`.
- This is a maintenance prerequisite for V2 migration M1 / Wave 0A. The separate CI candidate remains on `codex/v2-migration-wave0a`; this change does not enable V2 execution.
- Three extension lockfiles change, plus a workflow-register packaging allowlist correction and its contract test. Product runtime source, manifests, dependency declarations, overrides, test deadlines and package budgets are unchanged.
- Logs are local under `.superpowers/sdd/2026-09-28-v2-migration-remaining-work/`; hosted CI and merge acceptance are separate evidence.

## Lockfile changes

| Package / location | Extensions | Before | After | Existing consumer range |
| --- | --- | --- | --- | --- |
| `fast-uri` | All three | 3.1.5 | 3.1.8 | AJV 8.20.0: `^3.0.1` |
| Root `js-yaml` | workflow-register, Bazaar | 4.3.1 | 4.3.2 | `^4.1.1` / `^4.3.0` |
| Root `@xmldom/xmldom` | Bazaar, Consistency | 0.8.13 | 0.8.15 | mammoth 1.12.0: `^0.8.6` |
| `read-excel-file/node_modules/@xmldom/xmldom` | Consistency | 0.9.10 | 0.9.12 | read-excel-file 9.2.0: `^0.9.10` |

The eight changed package nodes differ only in `version`, `resolved` and
`integrity`. Registry URLs remain under `https://registry.npmjs.org/`. The
dependency graph and production/development flags are unchanged. The incidental
development-only depcheck/js-yaml update produced by npm was restored to its
original version to keep this patch scoped to the production audit.

The dependency patches intentionally tighten handling of malformed or
resource-intensive input. In particular, js-yaml 4.3.2 limits merge sequences
to 100 entries; Contract V2 already rejects YAML aliases, while other loaders
inherit the upstream limit. See the [upstream changelog](https://raw.githubusercontent.com/nodeca/js-yaml/4.3.2/CHANGELOG.md).

## VSIX size regression and correction

After the lock updates, workflow-register's existing package gate failed at
1,210,386 bytes against the unchanged 1,200,000-byte budget. ZIP entry comparison
showed that the broad fast-uri allowlist included upstream tests, including ten
new test files. The package's runtime is `index.js` plus `lib/`.

Its `.vscodeignore` now retains those runtime files, `package.json` and `LICENSE`
explicitly. It excludes test/benchmark/development content without modifying
the installed library or reducing the runtime dependency set. The regenerated
VSIX passes the same gate at 1,166,563 bytes (874 entries).

The exact regenerated VSIX was extracted into an isolated local fixture.
Checks confirmed the license and runtime modules exist, upstream test directories
are absent, and the packaged code successfully performs fast-uri parsing, AJV
external-reference validation (accept/reject cases), and YAML loading. Logs:
`workflow-register-package-policy-red.log`, `workflow-register-package-policy.log`,
`workflow-register-vsix-runtime.log`. The budget was never raised.

## Audit RED → GREEN

Fresh baseline audits used `npm audit --package-lock-only --omit=dev
--audit-level=high --json`. The updated locks were installed separately with
`npm ci --ignore-scripts --no-audit --no-fund`, then verified using
`npm audit --omit=dev --audit-level=high --json`. All calls used the public npm
registry. Lifecycle scripts were disabled for dependency installation; compile
and package commands are run explicitly afterward.

| Extension | Before: High / total | After: High / total |
| --- | ---: | ---: |
| workflow-register | 2 / 2 | 0 / 0 |
| bob-bazaar-review | 3 / 3 | 0 / 0 |
| bob-code-consistency-review | 2 / 2 | 0 / 0 |

The local `<extension>-audit-red.json` and `<extension>-audit-green.json` retain
the full audit observations. Findings cover URI normalization, YAML merge
resource limits, and XML parsing/serialization in the affected versions. This
is an audit-based dependency remediation, not a claim that every advisory is
reachable through this product or that development dependencies are audit-free.

## Validation

Node.js 22.23.2 / npm 11.3.0 on Windows. Full extension suites use
`node --test --test-concurrency=2 test/*.test.js` after compile. This bounds local
I/O contention without modifying tests or their deadlines. The initial base
showed timing failures under default concurrency; a subsequent bounded run at
the unchanged base passed all 1,885 runnable workflow-register tests with one
Windows-specific skip. Candidate results are recorded separately below.

| Extension | Full suite passed / skipped | Suite duration | VSIX bytes / unchanged limit |
| --- | ---: | ---: | ---: |
| workflow-register | 1,885 / 1 | 146.1 s | 1,166,563 / 1,200,000 |
| bob-bazaar-review | 753 / 1 | 55.8 s | 3,764,757 / 12,000,000 |
| bob-code-consistency-review | 328 / 0 | 36.9 s | 3,718,839 / 11,000,000 |

All three full suites completed with zero failures/cancellations: 2,966 passed
and two skipped. workflow-register skips stable `O_NOFOLLOW` behavior unavailable
on Windows; Bazaar skips creating a companion-file symlink without the optional
Windows privilege. These cases still need their supported CI environments.

Compile, dependency policy, architecture policy, source policy, unused reports,
package and package policy passed for each extension. workflow-register's schema
policy passed five cases. Bazaar's unused/artifact policies and two package smoke
tests passed; its package metrics command also completed. Reports remain reports,
not a claim of zero unused exported symbols. The exact commands and exit codes
are retained in the per-extension logs.

| Artifact | SHA-256 |
| --- | --- |
| `workflow-register-0.1.0.vsix` | `25d511d7a3004c4e9731496a492052a438cbdd74b543bf6d4a11af58442c71d0` |
| `bob-bazaar-review-0.3.0.vsix` | `480d6e04ee005881759b26726328367778e9f75f9a7aafc6bc572adaec2d02f3` |
| `bob-code-consistency-review-0.1.0.vsix` | `23af0e974b073982d935a0f3bfccc848c591ac9259669815ce9951ff8c849296` |

An independent read-only review found no actionable lockfile issues. It verified
all consumer ranges, unchanged graph/flags/manifests, and the downloaded bytes'
SHA-512 against the public registry for all four distinct target package versions.
The subsequent packaging correction was verified by the observed size failure,
the passing unchanged budget gate and the extracted-artifact runtime checks;
it did not change those reviewed dependency versions. No extension-host UAT,
remote CI or main acceptance is claimed by these local results.

## First hosted CI and packaging-test correction

The initial full-suite results above preceded the final fast-uri packaging
allowlist change. The packaged-runtime smoke verified the regenerated VSIX, but
the static packaging contract test was not rerun at that point. Those results
did not establish a passing full suite for the published `70ef1cd2` revision.

[extensions-quality run 36495203770](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36495203770)
exposed the missed assertion in `test/workflowRegister.test.js`: it still
required the broad `!node_modules/fast-uri/**` pattern. Both Linux and Windows
failed only that test (Linux: 1,883 passed / 1 failed / 2 skipped; Windows:
1,884 passed / 1 failed / 1 skipped). All three production audits passed.
The other nine jobs across the three triggered workflows passed. The separate
`workflow-contracts` workflow is not path-triggered by the maintenance diff;
this result is not Wave 0A acceptance.

A focused local run reproduced the same failure. The corrected assertion now
requires fast-uri's runtime entry point, manifest, license and `lib/`, and
rejects the broad pattern, following the existing js-yaml contract. All 13
tests in `workflowRegister.test.js` then passed. No product source, dependency,
packaging configuration, deadline or budget changed in this follow-up.
The existing VSIX SHA-256 still matches the artifact recorded above.

After the test correction, compile and the full workflow-register suite were
rerun with `node --test --test-concurrency=2 test/*.test.js`: 1,885 passed,
one Windows O_NOFOLLOW skip, zero failures/cancellations, 162.3 seconds.
This fresh result supersedes the workflow-register test row above for the local
follow-up. Logs: `packaging-contract-red.log`, `packaging-contract-green.log`,
`post-ci-compile.log` and `post-ci-bounded-tests.log`. Bazaar and Consistency
source, tests and dependency artifacts are unchanged by the follow-up.

## Integration boundary

Draft [PR #173](https://github.com/katamor1/bob_builtin_analyze/pull/173)
was created from `70ef1cd2147bfff0f1e01bf8540cafa7b9471efe`. Its initial CI
completed with nine successful jobs and two failures described above. The local
follow-up still requires a separately approved push and fresh hosted CI. Main
acceptance has not occurred.
After maintenance is accepted on main, refresh the separate Wave 0A branch
against that main and rerun its exact-head CI checks before Wave 0B or P4.
