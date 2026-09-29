# V2 migration baseline — 2026-09-28

## Scope and status

This records the M0 investigation and the local M1 Wave 0A candidate in
[the migration plan](../superpowers/plans/2026-09-28-v2-migration-remaining-work.md).
It is not Wave 0A acceptance, Wave 0B completion, or V2 product activation.

- Repository: `katamor1/bob_builtin_analyze`.
- Source base: `5b345a0aa4e58296d3fe55f4876cab151f9f24aa`.
- Candidate branch: `codex/v2-migration-wave0a`.
- Reviewed CI implementation commit: `decf5fc8fb5937c4201ed328e786c666844a3227` (later evidence-only commits do not substitute for CI on the final candidate head).
- Product source, extension manifests and dependency locks are unchanged by this candidate.
- Existing V1 product entrypoints and V1 run persistence remain active. Contract V2 remains subject to `WF2-P6-ENTRYPOINT_MAX_SHADOW` and `WF2-R2-INVOKE_PRODUCT_REACHABILITY_ZERO`.
- Local logs are retained under `.superpowers/sdd/2026-09-28-v2-migration-remaining-work/`; this ignored directory is local verification material, not a portable CI artifact.
- Environment: Windows, Node.js `v22.23.2`, npm `11.3.0`. Dependencies were installed from the existing workflow-register lock with `npm ci --offline --ignore-scripts --no-audit --no-fund` (579 packages).

## Reusable foundation

Paths in this table are relative to `extensions/workflow-register/`.
The main integration commit for Contract F1–F7/P1–P3 is
`54d0b6c99da5884532125d224b9a760e8c333a37`. The earlier topic commits identify
the implementation's history, not current gate completion.

| Area | Source/test groups present | Earlier implementation commit | Current verification |
| --- | --- | --- | --- |
| F1/F2 | `src/core/contractV2/`, canonical JSON / diagnostics | `fddfdd35062f77773f44878b259f1d95778a7c46` | Included in Contract focused run below |
| F3 | JSON Schema | `fddfdd35062f77773f44878b259f1d95778a7c46` | Included in Contract focused run |
| F4 | YAML | `39ee378549a869837a50b895860eb6cd0307385b` | Included in Contract focused run |
| F5 | Predicate | `3e82579a45291604ccd3313b561d8bc62557b1ce` | Included in Contract focused run |
| F6 | Provider types / registry | `793eebc8d5123df2b6c629857f76a3b3915faf7a` / `ccc8392d045a6d418aa63bca63bb4d2b297b4f51` | Included in Contract focused run |
| F7 | Bob profile | `8d57a6c4d6993c23b9748267a93fe01920536c81` | Included in Contract focused run; later compatibility change applies |
| P1 | Package schema | `c8f10f1720a9b9a56d23053f694c5d9b883faad0` | Included in Contract focused run |
| P2 | Package loader | `69fbe3bd9dd02e2f4121fa114a1d79d4670914db` | Included in Contract focused run; one OS skip |
| P3 | Workflow lock | `1c7dc9c4498765b0ff25341d8562e488fafd3aac` | Included in Contract focused run |
| Runtime Task 1–3 | `canonicalJsonV1.ts`, `runStateV2.ts`, `runEventV2.ts`, `runEventCodecRegistry.ts`; characterization/replay/corruption/line-ending tests | Main integration `003c052eaa3c9b10db7d4afc2d2d7eb545a2a324` | 101 passed |

[Carrier A evidence](workflow-carrier-a-merge-resolution-2026-08-22.md) records
PR #170 (head `b728061be3d5365e0ff7adb89fd328bfc2450001`, merge
`36b54145bf2e365f8e56282ab18f6cbc900012d9`) and its follow-up evidence via
PR #171 / `c59db06ecb32eb7a57beeb3e932acdd5b4774de5`.
Those historical records do not prove the current head's CI status.

[Bob 2.x compatibility](bob-2x-compatibility-2026-09-20.md), introduced at
`ab547b20f353146c2fbf2dc4882270d25de8ec2b`, supersedes the earlier exact-version
probe: stable `>=2.0.0 <3.0.0`, five required task APIs, optional
`toSerializable`, with the saved profile digest retained. Therefore the old
claim of zero product changes since `c59db06` is not a current baseline rule.
This candidate instead measures product changes from `5b345a0` (zero).

P4–P7, R1/R2, authoring A1–A5, repository cutover C1–C9 and Runtime authority
Task 4–12 remain unimplemented at the base. R3–R5 remain conditional and the
archived R6 snapshot remains rejected. The tracked migration inventory is
27 `WORKFLOW.md` files: root 17, library 1, companion 3, samples 4, fixtures 2.

## Local baseline results

Commands run from `extensions/workflow-register` unless a root path is shown.
The migration plan §5 lists the exact ten Contract and four Runtime test files.

| Command / group | Result | Log |
| --- | --- | --- |
| `npm run compile` | Passed | `m0-compile.log` |
| Contract focused tests | 557 total; 556 passed, 0 failed, 1 skipped (`O_NOFOLLOW` unavailable on Windows) | `m0-contract-foundation.log` |
| Runtime foundation focused tests | 101 passed | `m0-runtime-foundation.log` |
| `npm run dependency:policy` | 3 passed | `m0-dependency-policy.log` |
| `npm run architecture:policy` | Passed, 257 TypeScript files | `m0-architecture-policy.log` |
| `npm run source:policy` | Passed, 257 TypeScript files | `m0-source-policy.log` |
| `npm run schema:policy` | Compile and 5 tests passed | `m0-schema-policy.log` |
| `npm run unused:report` | All three tools exited 0; report-only output retained | `m0-unused-report.log` |
| `npm run package` / `npm run package:policy` | Passed; 1,193,615 bytes, 903 entries; below 1,200,000-byte limit | `m0-package.log`, `m0-package-policy.log` |
| Initial `npm test` | 1886 total; 1884 passed, 0 failed, 1 cancelled, 1 skipped | `m0-full-test.log` |
| Isolated same-run retry regression | 1 passed | `m0-lifecycle-isolated.log` |
| Full-suite rerun | Failed; stopped after repeated lifecycle wait/deadline failures, without a complete final count | `m0-full-test-rerun.log`, `m0-rerun-stop.log` |
| September 29 full suite, `node --test --test-concurrency=2 test/*.test.js` | 1886 total; 1885 passed, 0 failed/cancelled, 1 skipped; 145.6 seconds | `m0-full-test-bounded.log` |

The cancelled full-suite case was `run-next command rejects a same-run retry
and releases later mutations`, exceeding its existing 20-second deadline in
`test/bobGateLifecycleLegacyCases.js`. Its isolated rerun passed in about
7.2 seconds. This is a baseline verification failure; the cause is not
established by an isolated pass. No timeout or product code was changed.
The full rerun reproduced the same-run retry timeout and additional existing
held/checkpoint/paused/reviewing wait failures in the lifecycle suite. It was
stopped by matching the test runner's PID, command and creation time, retaining
its log; unrelated processes were not stopped. Some later verification work
overlapped the latter part of that rerun. This is not evidence of a fully
isolated or successful full-suite run, nor a proven diagnosis of its timing
failures. Stabilizing and passing the baseline suite remains a separate gate.
The September 29 run with concurrency limited to two passed every runnable test
without changing product code or test deadlines. This verifies the suite under
that scheduling condition; it does not establish the root cause of the earlier
default-concurrency failures or replace candidate-head hosted CI evidence.

The generated workflow-register VSIX SHA-256 is
`84c658a05917b6bbccda1b9b776b623f5d2700c220ade95daea430a6b9f2df44`.
It packages the unchanged product source at the base; it is not evidence of
V2 runtime activation or real-machine UAT. Package and report logs were
completed on September 28 and read back on September 29 after the tool session
resumed.

## Dependency audit prerequisite

All three audit observations below are current local baseline findings, not
new vulnerabilities introduced by the CI candidate. The companion audits used
their unchanged lockfiles. Dependency remediation is a separate maintenance
slice because Wave 0A has zero product/dependency diff.

| Extension | High findings | Affected packages | Log |
| --- | ---: | --- | --- |
| workflow-register | 2 | `fast-uri`, `js-yaml` | `m0-audit.log` |
| bob-bazaar-review | 3 | `@xmldom/xmldom`, `fast-uri`, `js-yaml` | `m0-bob-bazaar-review-audit.json` |
| bob-code-consistency-review | 2 | `@xmldom/xmldom`, `fast-uri` | `m0-bob-code-consistency-review-audit.json` |

The audit results report fixes at `fast-uri >=3.1.6`, `js-yaml >=4.3.2` and
the applicable patched xmldom line. Remediation must preserve direct dependency
policy, parser behavior and package size budgets, then rerun each extension's
audit and relevant tests. No dependency version was changed here.

## Remote and archive observations

Read-only GitHub observations during this execution found only remote `main`
at the base SHA and no open PRs. These are observations at retrieval time, not
authorization or permanent topology assertions.
The same branch, PR and exact-base run observations were rechecked on September 29
and were unchanged.

- [UI contracts run 35494237555](https://github.com/katamor1/bob_builtin_analyze/actions/runs/35494237555): success at the base SHA.
- [Extensions quality run 35494237544](https://github.com/katamor1/bob_builtin_analyze/actions/runs/35494237544): failure at the same SHA. The three Linux production-audit jobs failed; three Windows jobs and the real-machine environment job succeeded; source metrics was skipped on push.
- No current-head workflow-contracts or scaffold run was observed (path-filtered). Historical runs are not substituted for missing current-head evidence.

The following external archive manifest SHA-256 values matched the saved index.
Only the manifest files were read and hashed; their complete archived file
trees were not reverified, modified or restored.

| Archive under `C:/Users/stell/source/archives/bob_builtin_analyze/` | Manifest SHA-256 |
| --- | --- |
| `2026-08-21-main-consolidation` | `36e477ee9b752ebf7f07a208c166fec24e14a89bf7ba6a7921cf6bdf708c9f31` |
| `2026-08-22-local-worktree-cleanup` | `ad742f4dbd2112c5674da2e3e0ee2046645849e4b3bf3674596df3b868c8bdff` |
| `2026-08-22-remote-main-unification` | `bcdb61aad397ef4c6463eaa789d5d278b9d1bcad34015bc472c1dfc97773e476` |

## M1 local CI candidate and remaining gate

All four workflows now select the expected PR head / push commit / manual
input and reject a checkout mismatch before setup or dependency installation.
Manual dispatch validates a full lowercase SHA and a 32-hex machine correlation
nonce; it also checks the event SHA matches the requested SHA. The nonce is
not a user approval challenge. Baseline summaries use the verified checkout SHA.

The new `tools/main-consolidation/exact-head-ci-contract.json` declares four
workflows / twelve expanded jobs. PR expects all twelve to succeed; dispatch
expects eleven successes and only `Extension source metrics` to be skipped.
The focused CI tests passed 38/38; the broader UI contract command passed 68/68.
The 38 focused tests also passed again against the committed implementation on
September 29 (`m1-final-focused.log`).
An independent read-only review found no actionable defects and reran all
38 focused tests successfully. Hosted runners and downstream migration gates
were outside that review's acceptance.

An existing Program generator test exposed a Windows checkout defect:
`feature-integration-program-index.json` had 17,638 bytes on disk versus 17,637
canonical/Git bytes. The only difference was terminal CRLF. A path-specific
`.gitattributes` LF rule preserves its canonical bytes without changing the
Program's content or weakening the byte-exact assertion.
The four Program/campaign/risk/generator suites then passed 642/642; the legacy
approval policy passed 18/18 separately (660 total). Logs are
`m1-existing-policy-green.log` and `m1-legacy-policy-green.log`. Every historical
commit recorded above was resolved against the repository's Git object database.
The plan and this evidence document have no broken local Markdown links.

Wave 0A still requires successful candidate-head CI, independent review,
verified merge parent/tree, matching main dispatch results, and topology/archive
acceptance. Baseline audit failures must be resolved before claiming these
gates pass. Wave 0B selection/status documents and M2 compiler implementation
must not be presented as completed before these prerequisites.

## Maintenance prerequisite accepted — 2026-09-29

The baseline audit failures above were remediated separately in
[PR #173](https://github.com/katamor1/bob_builtin_analyze/pull/173).
Its reviewed head `ddff028430c958b75f797de930ae9461b6e69c4d` passed all eleven
PR jobs. The merge commit is `fc231038e3bc398da918488a7bd78ac46e663ad4`, with
parents `5b345a0aa4e58296d3fe55f4876cab151f9f24aa` and that reviewed head.
The merged Git tree equals the reviewed tree
`b5a779c67f0cda1f976066154a2356f083152b63`.

All three applicable push workflows succeeded on that exact main commit:

- [Extensions quality 36578785710](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36578785710).
- [Scaffold 36578785950](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36578785950).
- [UI contracts 36578785741](https://github.com/katamor1/bob_builtin_analyze/actions/runs/36578785741).

Across those workflows, ten jobs succeeded and only the PR-only
`Extension source metrics` job was skipped, as configured. Production audits,
Linux/Windows tests, VSIX budgets and Extension Host smoke passed. The
`workflow-contracts` workflow was not path-triggered by this maintenance diff;
these results therefore do not establish Wave 0A's four-workflow acceptance.
The dependency changes and first-CI packaging-test correction are documented in
[the maintenance evidence](dependency-audit-remediation-2026-09-29.md).

The Wave 0A candidate has been refreshed on this accepted main without changing
its CI implementation. Its `extensions/` diff against this main is empty.
Candidate PR CI, merge/main dispatch and topology acceptance still remain;
Wave 0B and M2 have not started. The original local main checkout and its
user-owned untracked files have been preserved.

After refreshing the candidate, a single bounded run of the ten CI/UI contract
test files and five existing Program/risk/campaign/generator/legacy-policy test
files passed all 728 tests (zero failures, cancellations or skips; 27.7 seconds).
Command: `node --test --test-concurrency=2` with those fifteen explicit paths;
log: `m1-post-maintenance-regressions.log`. This includes the 38 focused CI tests
within 68 CI/UI tests and the 660 existing policy tests, without double counting.
All 26 local Markdown links in this evidence and the migration plan resolve.
The canonical Program file's raw disk bytes match Git blob
`84d8d434fd77642847cb959fbac84b1c4b3f0f46`; changed-file whitespace also passes.
