# Undici production audit remediation — 2026-10-01

## Result and scope

The two affected production dependency audits now report zero findings after
updating only `undici` from 7.29.0 to 7.29.1. Full local suites passed 1,081
cases with one Windows-specific skip; both regenerated VSIX packages pass their
existing budgets and execute DOCX extraction using their packaged dependencies.
Hosted CI and main acceptance for this candidate are pending.

- Repository: `katamor1/bob_builtin_analyze`.
- Base main: `148ce29ac1354cc6e6bcb2b65957406a0cb703b5`.
- Local branch: `codex/v2-undici-audit`.
- Changed runtime artifacts: the lockfiles for Bazaar and Consistency, one package node each.
- Product source, manifests, dependency graph/flags, test deadlines and VSIX budgets are unchanged.
- The migration plan records the failed post-merge gate; V2 activation remains pending.
- Local logs: `.superpowers/sdd/2026-09-28-v2-migration-remaining-work/undici-2026-09-30/`.

## Post-merge CI failure

[PR #174](https://github.com/katamor1/bob_builtin_analyze/pull/174) merged as
`148ce29ac1354cc6e6bcb2b65957406a0cb703b5`. Its four automatic main workflows
completed with eight successful jobs, three failed jobs and the expected
PR-only source metrics skip. All twelve check-run revisions match that main.
The failed jobs are:

- [Bazaar Linux](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36722304947/job/109910247618).
- [Consistency Linux](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36722304947/job/109910248486).
- [Scaffold VS Code extension validation](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36722305046/job/109910247384).

Each retained raw log identifies `CI_VERIFIED_HEAD_SHA=148ce29...` and fails
`npm audit --omit=dev --audit-level=high` on undici 7.29.0 (one high-severity
package finding containing ten advisories). The checkout guard passed before
that audit. Earlier passing audits are historical observations; the later
failure does not establish that those earlier observations were incorrect.

No manual workflow dispatch or remote branch cleanup followed this failed main
gate. Wave 0A acceptance, Wave 0B and subsequent product slices remain pending.

## Minimal patch and compatibility

Each lock node changes only `version`, `resolved` and `integrity`. Public npm
registry URLs, the existing cheerio consumer range `^7.19.0`, MIT license and
Node engine `>=20.18.1` are unchanged. The new version satisfies that range.
workflow-register's undici entry is development-only and is outside this patch.

The [upstream 7.29.1 release](https://github.com/nodejs/undici/releases/tag/v7.29.1)
fixes the reported WebSocket, retry, cache, decompression and TLS advisories.
The [BalancedPool advisory](https://github.com/advisories/GHSA-w293-vg96-wgc3)
identifies 7.29.1 as patched. Security fixes intentionally tighten malformed
HTTP/WebSocket handling; the decompression interceptor now defaults to a 64 MiB
output limit. Confirmed product consumers use cheerio to parse HTML generated
from local DOCX files. No direct undici or cheerio `fromURL` use was found in
these extension sources. Reachability of every advisory is not established.

An independent read-only lock review verified both graph/flags and manifests
are unchanged, and independently downloaded the official npm tarball. Its
SHA-512 matches both saved registry metadata and the lockfile integrity:

`sha512-RYONW2MeafgYlkVOKYKkA/Ag7BmXqgIWCa8t1m0JcxrQg9pI9lEqRhAOruOBCbAohOa/gkCF+iPi9hrgvTzu6Q==`

## Audit and regression evidence

Node 22.23.2 / npm 11.3.0 on Windows. Baseline production audits used
`npm audit --package-lock-only --omit=dev --audit-level=high --json`.
Updated dependencies were installed using `npm ci --ignore-scripts --no-audit
--no-fund`, followed by `npm audit --omit=dev --audit-level=high --json`.
All calls used `https://registry.npmjs.org/`. Both fresh audits report zero
findings at every severity.

| Extension | Before high / total | After high / total | Full suite pass / skip | Duration |
| --- | ---: | ---: | ---: | ---: |
| bob-bazaar-review | 1 / 1 | 0 / 0 | 753 / 1 | 78.2 s |
| bob-code-consistency-review | 1 / 1 | 0 / 0 | 328 / 0 | 43.1 s |

Suites ran after compile with `node --test --test-concurrency=2 test/*.test.js`:
zero failures/cancellations. Bazaar's skip is the existing companion-file
symlink test requiring optional Windows privileges. Both dependency,
architecture and source policies, unused reports, compile, package and package
policies passed. Bazaar's unused/artifact policies, two package smoke tests
and package metrics also passed. Reports do not assert zero unused symbols.

## Packaged runtime

| VSIX | Bytes / unchanged limit | SHA-256 |
| --- | ---: | --- |
| bob-bazaar-review-0.3.0.vsix | 3,767,456 / 12,000,000 | `59aa0bedc8bba644a23c0bb9d6704b6c1d943442f8488ffeb1b63d3f331426c2` |
| bob-code-consistency-review-0.1.0.vsix | 3,721,538 / 11,000,000 | `bbe0773a0213c0def6173eea937944c045ac66266072654383368f3c42af0195` |

Both exact VSIX files were extracted into a fresh fixture under the local log
root. Each contains undici 7.29.1 and resolves cheerio, mammoth and undici within
its own extracted package. The smoke executes each packaged product's DOCX
extractor against the existing document fixture and checks paragraph, heading
and table content (Bazaar six chunks; Consistency four chunks). All newly loaded
CommonJS modules remain within the extracted VSIX (402 / 401 modules), avoiding
fallback to the development install. `vsix-runtime.log` and
`vsix-runtime-results.json` record the artifact hashes and results.

These are local package/runtime checks. Extension Host UAT and candidate/main
hosted CI have not been performed for this patch.
