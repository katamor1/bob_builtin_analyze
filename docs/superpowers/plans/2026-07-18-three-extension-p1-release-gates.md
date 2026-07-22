# Three-extension P1 release gates implementation plan — recovered

> **Status:** Approved design recovered on 2026-07-18; implementation not yet complete.
>
> **Branch:** `codex/three-extension-p1-release-gates`
>
> **Recovery base:** `8793804f2f99fd1d545cb496064bcbdc7df4bf40`
>
> **Execution method:** test-driven, subagent-driven, one reviewed commit range per task.

## Recovery note

Workspace maintenance removed the earlier local plan branch and the unpushed Task 1/Task 2 commits. This document reconstructs the approved design against current `main`. The lost commits are historical context only: neither task is considered complete until its behavior is recreated, tested, independently reviewed, and committed on this branch.

This recovery changes planning artifacts only. It does not modify production code, manifests, tests, workflows, or release state.

## Goal

Close the following six P1 items in one release with fail-closed, same-commit evidence:

1. provider registry ownership, duplicate, unregister, `Disposable`, lifecycle, and version negotiation contracts;
2. provider-aware workflow contract CI with repository-wide tracked workflow discovery;
3. coherent document, sheet, row, diff, Bob input, artifact, process-buffer, deadline, cancellation, and Windows-path limits;
4. permanent Ubuntu/Windows installed-VSIX Extension Host smoke with real Git, real Bazaar, Webviews, multi-root, and IBM Bob integration;
5. mechanical traceability from every formal specification ID to a test that actually passed;
6. complete owner, due date, workaround, acceptance rationale, and evidence for every deferred Medium finding.

The final release gate must reject missing, stale, skipped, partial, cross-commit, or single-OS evidence.

## Non-goals

- Do not treat source-based `extensionDevelopmentPath` smoke as installed-product evidence.
- Do not call external AI services or require IBM Bob authentication in the permanent smoke.
- Do not infer providers by parsing TypeScript or retain a manually maintained provider/preflight catalog.
- Do not turn the current specification count into a permanent magic-number assertion.
- Do not mark a truncated review package as complete coverage.
- Do not defer P1 or High findings through the Medium exception process.
- Do not claim Product Release PASS from a single-OS or local-only rehearsal.

## Approved design

### 1. Declarative contributions and provider registry

Each contributing extension owns `contracts/workflow-contributions.json`. CI and runtime consume the same manifest. Its strict top-level contract is:

- `schema_version: "workflow-contributions/v1"`;
- `owner: { id, version }`, exactly matching the installed VS Code extension ID and SemVer;
- `registry_api: { min, max }`, initially negotiating `provider-registry/v1`;
- `action_providers`;
- `preflight_checks`;
- `result_sinks`;
- optional `agent_provider`;
- `workflow_templates`;
- `schemas`.

All objects reject unknown properties. Contribution contract versions end in `/v<positive integer>`. Paths are repository-relative, normalized, and containment checked. Duplicate identifiers, conflicting versions, handler omissions, handler surplus, and cross-kind collisions are semantic errors. Untrusted values echoed in diagnostics are UTF-8 bounded to 256 bytes.

`workflow-register` exposes:

- `apiVersion`;
- `negotiateProviderRegistry(...)`;
- `registerContributionSet(manifest, provenanceContext, handlers): Disposable`.

Task 2 uses the following explicit trust boundary:

- contribution manifests, validation context, and all metadata derived from them are untrusted data; the registry snapshots and validates them fail-closed before publishing any state;
- provider handler implementations are trusted extension code running in the same JavaScript realm, although the handler set is still structurally checked for completeness, surplus entries, and callable shape before registration;
- manifest validation binds the declared owner ID/version to the host-provided provenance context and validates registry-range syntax/order. Negotiation against the API versions actually supported by the host is Task 3 and is not claimed as Task 2 behavior;
- defensive checks against handler-side mutation are robustness measures, not a containment boundary for malicious same-realm code;
- mutation of exported constructor or method callables by same-realm handler code is outside Task 2's protection boundary. Task 2 does not add callable membranes or worker/process isolation; either would require a separate threat-model and compatibility decision.

Negotiation and complete handler-set validation happen before mutation. Registration is atomic and fail-closed. Duplicate errors identify both existing and requesting owners. The returned disposable is idempotent and token-protected so an old disposable cannot remove a later registration. A contribution set is disposed in reverse registration order, and extension shutdown disposes all sets in reverse activation order. Action provider, preflight, result sink, and agent provider registration use the same ownership/version/lifecycle rules; silent overwrite is removed everywhere.

All three extensions migrate in the same release. A deprecated adapter may remain for one release, but it must require owner/version, reject duplicates, return a real disposable, and never silently overwrite.

### 2. Shared processing budget, deadlines, and path contract

One shared local runtime package supplies `ProcessingBudgetLedger`, bounded I/O helpers, absolute-deadline propagation, cancellation/process-tree termination, and Windows-aware path validation. Each processing operation consumes both its individual category limit and the total input budget.

MiB means 1,048,576 bytes. Defaults and absolute maxima are:

| Category | Default | Absolute maximum |
|---|---:|---:|
| Single document | 5 MiB | 50 MiB |
| Total document bytes | 32 MiB | 256 MiB |
| Document count | 128 | 1,024 |
| Sheets per workbook | 20 | 100 |
| Total sheets | 100 | 1,000 |
| Rows per sheet | 500 | 5,000 |
| Total rows | 25,000 | 250,000 |
| Changed files | 5,000 | 20,000 |
| Raw diff | 1 MiB | 10 MiB |
| Total document excerpts | 2 MiB | 8 MiB |
| Bob input | 2 MiB | 8 MiB |
| Total managed artifacts | 16 MiB | 64 MiB |
| Total operation input | 64 MiB | 256 MiB |

Files are `stat`-checked and budget-reserved before bounded reads. DOCX/XLSX processing checks compressed size, archive entry count, per-entry expanded bytes, and total expanded bytes before extraction. Sheet/row limits consume workbook and operation-wide counters. Raw diff collection is streaming and stops on a UTF-8/line-safe boundary.

Bob input is assembled in priority order inside its budget; it is not built without bounds and truncated afterward. If mandatory sections alone exceed the limit, processing fails. A budget violation produces `processing_budget_exceeded`; no incomplete review package is committed.

The unrelated 20 MiB/50 MiB fixed process buffers are removed. For truncatable artifacts:

```text
stdout byte cap = target artifact cap + 1 detection byte
stderr byte cap = 256 KiB
retained process bytes = stdout cap + stderr cap
```

Metadata outputs are never silently truncated. Only raw diff and excerpt categories may be explicitly truncated. Any truncation produces `coverage_status: "partial"` and blocks formal handoff.

Every operation receives one absolute deadline. Nested work consumes the remaining duration rather than starting a fresh timeout. Cancellation and deadline expiry terminate the entire process tree on Ubuntu and Windows and produce distinct typed outcomes. Workspace paths use `Uri.fsPath` at the VS Code boundary and one shared normalization/containment implementation covering drive letters, UNC, device paths, drive-relative paths, separators, dot segments, traversal, control characters, symlinks/reparse points, and multi-root selection.

### 3. Dynamic workflow CI and complete test traceability

Tracked workflows are discovered at repository root with the NUL-delimited equivalent of:

```text
git ls-files -z -- ':(glob)**/WORKFLOW.md'
```

Every tracked workflow, including root, template, sample, and documentation workflows, is classified by an explicit path-scoped manifest rule and strictly compiled. The gate rejects warnings as well as errors, unknown or ambiguous action providers/preflight checks/result sinks, incompatible versions, undeclared commands, duplicate IDs, template/mirror drift, missing schemas, and contribution files absent from the built VSIX.

The following legacy mechanisms are removed:

- `workflowSearchRoots`;
- `providerImplementationSourcePaths`;
- `availablePreflightChecks`;
- `integrationWorkflowPairs`;
- TypeScript regular-expression provider extraction;
- fixed workflow-count assertions such as “at least 22”.

CI generates `workflow-contract-report.json` with commit SHA, every discovered path, exclusions and their owning rule, manifest/schema digests, and every resolution decision.

Specification IDs are declared through a shared `specTest(idOrIds, name, fn)` helper. One test may cover multiple IDs, but each ID has exactly one primary test. A Node test reporter records completed test events; static text or file presence is not execution evidence. Fail, skip, todo, cancel, unknown IDs, duplicate primary mappings, missing implementations, or tests outside the executed glob all fail the gate.

The older approved-design snapshot was WR 39 + BZR 52 + CCR 69 + shared 6 = 166 IDs. It is retained only as historical recovery evidence. Drift reconnaissance against recovery base `8793804f` derives the current baseline as WR 42 + BZR 57 + CCR 74 + shared `EXT-UT-REM-001` through `006` = 179 unique IDs. Neither value is a gate constant. The gate must derive the canonical set from the specification sources on every run, so newly added IDs become mandatory automatically.

Ubuntu and Windows each emit `test-traceability-<extension>-<os>.json`. A same-commit aggregator requires every currently derived ID to pass on both OSes.

### 4. Permanent installed-VSIX release smoke

Keep source-based smoke as a fast developer check and add a release-authoritative installed-VSIX smoke on Ubuntu and Windows.

- Pin an exact Node 22 patch in the release toolchain lock.
- Pin VS Code 1.106.1 and IBM Bob 2.0.1.
- Pin Linux Breezy 3.3.22 and its distribution hashes.
- On Windows use the signed/hash-locked MSYS2 20260611 image and the locked Breezy 3.3.22-1 dependency closure. Normal CI must not run floating `pacman -S` or `pacman -Sy`; it installs only locked packages with `pacman -U`.
- Package the three product extensions and the bundled Bob extension into four VSIX files.
- Install them into empty `user-data-dir` and `extensions-dir` directories.
- Use only the test driver as a development extension. Product extensions must not use `extensionDevelopmentPath` or `skipExtensionDependencies`.

The multi-root fixture contains a workflow root with `.bob`, a real Git repository with multiple commits and working-tree changes, and a real Bazaar repository with multiple revisions and working-tree changes. Windows additionally uses absolute paths containing spaces and Japanese characters.

The smoke verifies:

1. installed identity/version/hash, activation, and primary command registration;
2. manifest-based registration, reload, dispose, and clean re-registration;
3. correct workflow/Git/Bazaar root selection;
4. real Git and Bazaar diff/revision collection;
5. Operation Hub, Bazaar Review GUI, and Code Consistency Wizard `webview-ready/v1`, close, and reopen;
6. IBM Bob activation and real `registerSource` plus `source.registerWorkflow` registration without external inference;
7. Bob bridge diagnostics for Bob version, source ID, workflow IDs, and last result;
8. provider, source, and Webview listener cleanup on Extension Host shutdown.

Each OS emits `release-smoke-evidence.json` containing same-commit identity, tool versions, VSIX hashes, normalized roots, command results, registry snapshot, Git/Bazaar records, Bob result, Webview readiness/reopen records, shutdown counters, scenario status, and duration. Early failure uses explicit `unavailable` values; it must not fabricate successful evidence. Semantic validation requires the complete record set only for a successful run.

### 5. Medium governance and final readiness gate

The authoritative finding register is `docs/release-gates/three-extension-findings.json`. The relevant section of `docs/review-findings-tracking.md` is generated from it.

Every deferred Medium requires finding ID, summary, severity, `status: "deferred"`, owner, due date, target release, user-facing workaround, acceptance rationale, residual risk, acceptor, accepted timestamp, reconsideration trigger, related issue, related test, and evidence. CI rejects empty fields, expired dates, unknown releases, duplicate IDs, Markdown drift, evidence-free `resolved` transitions, release-scoped `open`/`in_progress` Mediums, and any attempted P1/High deferral.

The same-commit aggregator emits `p1-release-readiness.json` and requires:

| P1 area | Required evidence |
|---|---|
| Provider registry | Registry contract tests and lifecycle snapshot |
| Workflow contracts | `workflow-contract-report.json` |
| Resource controls | Limit/deadline/path tests and `processing-budget-report.json` |
| Installed Extension Host | Ubuntu and Windows `release-smoke-evidence.json` |
| Specification traceability | Both-OS traceability reports for the derived ID set |
| Medium governance | Finding schema, semantic, expiry, and generated-doc checks |

Missing reports, mismatched commit SHA, skipped/unexecuted tests, partial coverage, one-OS evidence, unresolved P1, or incomplete/expired Medium governance is Release NO-GO. Evidence is retained for 90 days, and a release tag stores the corresponding aggregate report.

## Cross-cutting implementation rules

- Every task starts with a focused failing test or a demonstrably failing contract fixture.
- The implementer runs focused tests and the smallest relevant package suite.
- A separate reviewer inspects the complete task commit range. Critical or Important findings are fixed and re-reviewed before the task is marked complete.
- Task evidence records exact commands, pass/fail/skip counts, commit range, and known unrelated baseline failures.
- Generated artifacts used as gates include a schema version and commit SHA.
- No task may weaken a gate with `continue-on-error`, permissive fallback, a stale artifact, or an unconditional skip.
- Phase gates are cumulative: later work may not bypass earlier contracts.

## Phase 1 — Contribution manifests, registry API, and migrations

## Task 1: Recreate the strict contribution manifest contract

**Files:** `extensions/workflow-register/schema/workflow-contributions.v1.schema.json`, `extensions/workflow-register/src/core/contributionManifest.ts`, `extensions/workflow-register/test/contributionManifest.test.js`, and manifest fixtures.

**RED:** Add fixtures/tests for a valid manifest and for unknown fields, invalid owner/version, invalid registry ranges, invalid `/vN` contracts, unsafe paths, duplicate IDs, cross-kind collisions, and diagnostics exceeding 256 UTF-8 bytes. Confirm they fail because the recovered branch has no implementation.

**GREEN:** Implement strict schema loading plus semantic validation, normalized typed output, stable diagnostic codes, bounded untrusted echoes, and no partial result on error.

**Verify:** Compile, run the focused manifest test, mutate each registry/contract version pattern to prove its negative test fails, then run the workflow-register package suite.

**Commit:** `feat: add contribution manifest validation`

## Task 2: Implement the atomic contribution registry core

**Status (2026-07-22): Complete.** The recovered checkpoint contains the atomic registry implementation; the final local review-fix commits are `2824382`, `3a90e45`, and `2fc472b`. Fresh final-head evidence is compile PASS, contribution-registry focused tests 39/39 PASS, combined contribution-manifest plus contribution-registry tests 61/61 PASS, and combined manifest/registry/dependency-policy closeout tests 65/65 PASS. The prior review's remaining same-realm exported-callable mutation finding is explicitly outside the selected trusted-handler boundary above; it is not represented as remediated by a membrane or process boundary. Independent boundary closeout review: Approved with Critical 0 / Important 0 / Minor 0.

The checkout was reconstructed from the plan's recovery base `8793804f2f99fd1d545cb496064bcbdc7df4bf40`. A fresh full workflow-register attempt produced 1,124 PASS / 40 FAIL / 1,164 total, so no full-suite PASS is claimed for this recovered final Task 2 head. The 40 observed failures were outside the focused contribution-manifest and contribution-registry files; many report absent repository-level `.bob`, `.github`, workflow-catalog, or companion-extension paths, while others report existing package-description drift. They remain unwaived and are not represented as caused or fixed by Task 2.

**Files:** `extensions/workflow-register/src/core/contributionRegistry.ts`, `extensions/workflow-register/test/contributionRegistry.test.js`.

**RED:** Cover complete handler-set prevalidation, missing/extra handlers, duplicate IDs within and across owners, cross-kind conflicts, agent singleton conflict, all-or-none registration, rollback on staged commit failure, reverse disposal, idempotent disposal, and stale-disposable token protection.

**GREEN:** Implement a VS Code-independent registry whose entries retain owner, version, kind, token, and handler; expose read-only lookup/snapshot seams required by later runtime and smoke tasks. Treat manifest-derived data as untrusted and fail-closed, while treating same-realm provider handler implementations as trusted extension code under the approved boundary above.

**Verify:** Compile, focused tests including injected commit failure, mutation proof for stale-token comparison, and the workflow-register package suite.

**Commit:** `feat: add atomic contribution registry`

## Task 3: Expose version negotiation and public registry API

**Files:** `extensions/workflow-register/src/api/providerRegistryApi.ts`, public API types/exports, and focused API tests.

**RED:** Cover exact `provider-registry/v1` negotiation, disjoint ranges, malformed ranges, negotiation before mutation, incompatible contribution versions, and absence of a partially published API.

**GREEN:** Publish `apiVersion`, deterministic highest-compatible negotiation, and `registerContributionSet`; reject negotiation failures before consulting handlers or mutating the registry.

**Verify:** Type-level consumer fixture, focused runtime tests, public export audit, compile, and package suite.

**Commit:** `feat: publish provider registry api v1`

**Completion evidence (2026-07-22):** Complete in commit `03fab16`. The initial public-API/runtime/type/wiring batch was RED at 1 PASS / 13 FAIL / 14 total. Final-head compile, the direct Task 3 API/lifecycle/type/wiring batch (17/17), the combined manifest/registry/dependency/API batch (82/82), export-star policy (224 TypeScript files), import-cycle policy (224 TypeScript files), and `git diff --check` all pass. Independent specification and quality reviews are both Approved with Critical 0 / Important 0 / Minor 0.

**Boundary and recovery-suite evidence:** Version ranges are untrusted closed own-data records, are compared numerically with arbitrary precision, and negotiate before handlers or the commit seam are consulted. One service-owned registry host publishes one frozen three-member API; manual and host disposal retain failed handles for bounded retry, continue cleanup after individual failures, and reject registration after shutdown. Existing legacy provider routes remain unchanged until Task 4. The reconstructed checkout's exact package attempt is 1,142 PASS / 40 FAIL / 1,182 total, with the same 40 out-of-scope recovery failures as the Task 2 baseline; no full-suite PASS is claimed.

## Task 4: Unify action, preflight, result-sink, and agent lifecycles

**Files:** existing workflow-register action/preflight/result-sink/agent registry modules, parser/schema support for declared sinks, and lifecycle tests.

**RED:** Reproduce agent and result-sink silent overwrite, preflight override, ownerless registration, and missing disposables. Cover lookup after disposal and re-registration guarded against an old disposable.

**GREEN:** Route all four contribution kinds through the atomic registry. Add declared result-sink model/schema/parser support rather than treating sinks as an unversioned internal map.

**Verify:** Focused tests for every kind, existing workflow parse/execute suites, lifecycle snapshot stability, compile, and package suite.

**Commit:** `refactor: unify contribution lifecycles`

**Completion evidence (2026-07-22):** Complete in commit `0d80491`. Initial RED evidence included lifecycle 0/1 (`createPreflightCheckResolver` absent), runtime wiring 0/4, custom-sink contract 1 PASS / 2 FAIL, a contract-version mismatch that still invoked the handler, two import cycles, a legal `getPreflightCheck` contribution ID misclassified as a resolver, legacy-first priority, and reserved-type forged sink guards. Final-head compile, direct Task 4 contract/lifecycle/wiring tests (14/14), the adjacent registry/parser/authoring/engine/artifact set (162/162), source policy (224 TypeScript files), architecture policy (224 TypeScript files), and `git diff --check` all pass. Independent specification and quality reviews are both Approved with Critical 0 / Important 0 / Minor 0.

**Boundary and recovery-suite evidence:** Action, preflight, result-sink, and agent lookups are live and atomic-first, so disposal, bounded re-registration, and stale disposables are reflected without rebuilding an engine. An explicit run-scoped agent remains first; legacy/configured providers and built-in command/file/default preflight behavior remain fallback-only pending Tasks 5 and 6. Versioned custom sinks require a declared atomic entry and exact manifest `contract_version`; they do not fall back to an ownerless legacy sink. File transaction capability remains internal until Task 5 binds the built-in file lifecycle, while owner/version/deprecation policy for legacy APIs remains Task 6. The reconstructed checkout's exact package attempt is 1,156 PASS / 40 FAIL / 1,196 total, with the same 40 out-of-scope recovery failures as the Task 2 baseline; no full-suite PASS is claimed.

## Task 5: Add all three manifests and atomically migrate both provider extensions

**Files:** `extensions/workflow-register/contracts/workflow-contributions.json`, `extensions/bob-bazaar-review/contracts/workflow-contributions.json`, `extensions/bob-code-consistency-review/contracts/workflow-contributions.json`, contribution-manifest schema/semantic validation, packaging manifests, bridge/activation modules, and provider registration tests.

**RED:** Assert exact owner/version, complete current providers/preflights/sinks/templates/schemas across all three manifests, no missing/extra handlers, negotiation failure before registration, rollback on one bad handler, and reverse shutdown disposal. Require path-scoped declarations for every tracked workflow role and external sample command; reject broad `**`, absolute/backslash/parent paths, ambiguous claims, and unowned exclusions. Permit owner-external template destinations only as explicit normalized `.bob/workflows/<one-segment>/WORKFLOW.md` paths while keeping template sources and schema paths owner-contained. Exercise retry-controller shutdown where a middle disposable throws: later disposables must still run, all retry/event listeners must detach, and the first/aggregate error must remain diagnosable.

**GREEN:** Declare workflow-register's built-in actions, three preflights, `command`/`file` sinks, templates, schemas, tracked workflow path rules, and path-scoped external sample commands; migrate both companion extensions to one `registerContributionSet` call each and ensure activation retries do not create duplicates. Preserve retry registration controller cleanup semantics: dispose every acquired registration in reverse order, continue cleanup after an individual dispose exception, detach all retry/extension-change listeners, then report the captured/aggregate cleanup failure without leaving a live registration or listener.

**Verify:** Compile and test all three extensions, compare runtime snapshot with manifest contents, prove every tracked `WORKFLOW.md` is claimed exactly once, inspect all three VSIX file lists, and run workflow-register compatibility tests.

**Commit:** `feat: migrate extensions to contribution manifests`

**Completion evidence (2026-07-22):** Complete in commit `e03c6cf`. Initial RED evidence included 14 manifest-contract failures, absent companion atomic bridges, unexpected negotiation results that still registered, reverse cleanup stopping at the first exception, listener diagnostics emitted before detach, VSIX policies accepting missing contribution assets, non-JSON built-in outputs, and an aggregate gate that missed cross-owner ID/contract collisions. Final-head workflow-register compile, focused public API/runtime/manifest/package tests (155/155), the final built-in action/mechanical contract batch (27/27), and complete-tree workflow-asset tests (11/11) pass. Bazaar passes 686/686 and CCR passes 271/271. Import-cycle/source/dependency policies pass for all three extensions, `git diff --check` passes, and inspected VSIX policies pass for workflow-register (1,070,759 bytes / 826 entries), Bazaar (3,749,310 bytes / 1,832 entries), and CCR (3,697,104 bytes / 1,915 entries). Three cumulative re-review tracks are Approved with Critical 0 / Important 0 / Minor 0.

**Boundary and recovery-suite evidence:** Installed extension identity supplies provenance independently of each manifest. Workflow-register publishes two built-in actions, three preflights, and two sinks as one generation-bound atomic set; Bazaar publishes 11 actions and CCR publishes 16 actions through one negotiated registration each. Both built-in action results are projected to the declared canonical JSON contract, file-transaction capability follows the live file-sink generation, and every provider retry controller disposes registrations in reverse, continues after errors, detaches listeners, then reports one preserved or ordered aggregate failure. The three manifests classify all 27 known `WORKFLOW.md` paths exactly once and reject cross-owner contribution-ID and contract-version collisions. Every VSIX policy derives required manifest/schema/template entries from the manifest. The reconstructed workflow-register checkout's exact full-suite run reached 1,186 PASS / 40 FAIL / 1 SKIP / 1,227 total, matching the established 40 out-of-scope recovery failures; a later run showed the known durability timestamp race as a transient 41st failure, and its isolated exact rerun finished 25 PASS / 0 FAIL / 1 SKIP. No full-suite PASS is claimed.

## Task 6: Fence the one-release deprecated adapter and close Phase 1

**Files:** legacy registration adapter, deprecation diagnostics, compatibility tests, and Phase 1 evidence helper.

**RED:** Cover ownerless/versionless legacy calls, duplicate overwrite attempts, `void` disposable, adapter use after configured removal version, partial legacy registration, and adapter/retry teardown where one dispose throws before listener cleanup.

**GREEN:** Require explicit owner/version, negotiate v1, delegate atomically, return a real disposable, emit one bounded deprecation diagnostic, and document a one-release removal marker. The adapter must use the same reverse-all-dispose cleanup discipline: an exception is captured rather than aborting remaining cleanup, retry listeners are always removed, and the cleanup error is surfaced after resources are released.

**Verify:** All three extension suites, registry mutation/lifecycle matrix, `git diff --check`, and independent full-range Phase 1 review.

**Commit:** `feat: add fail-closed legacy registry adapter`

**Completion evidence (2026-07-22):** Complete in feature commit `8ff57f4`. Initial RED coverage fixed ownerless/versionless/malformed inputs, SemVer boundaries (including prerelease/build metadata), failed or inexact v1 negotiation, partial publication, duplicate IDs, stale/idempotent disposal, post-success diagnostic failures, and reverse host shutdown where provider and listener cleanup throw. The final public surface has one one-release `registerLegacyContributionSet(manifest, provenance, handlers)` bridge, delegates exactly once to the atomic v1 registry, publishes a fixed bounded diagnostic once per adapter activation, and removes the three unsafe per-kind methods plus the configured ownerless agent-command fallback. Obsolete command-provider and per-kind registration-store code is no longer shipped. Workflow-register compile and the direct Task 6 focused suite (67/67), CCR retry cleanup (12/12), Bazaar retry cleanup (9/9), dependency policy (5/5), architecture/source policies (225 TypeScript files each), and `git diff --check` all pass. Independent specification and quality re-reviews are both Approved with Critical 0 / Important 0 / Minor 0; their fresh focused runs reached 51/51 and 91/91 respectively.

**Phase 1 commit-bound evidence:** On a clean tree, `npm run phase1:policy` passed at `8ff57f426a9755995619431006d7271176c23d59`, binding the full snapshot to that commit and the incremental review range to `96a670e5895d3a54ba629605c892c93c3e89d619..8ff57f426a9755995619431006d7271176c23d59`, with recovery base `8793804f2f99fd1d545cb496064bcbdc7df4bf40`. The helper AST-audits all three production consumers, rejects any legacy per-kind reference, compares source and compiled adapter policy, refuses dirty commit evidence by default, and labels explicit dirty inspection without a commit SHA. The reconstructed workflow-register checkout's exact package run reached 1,197 PASS / 41 FAIL / 1 SKIP / 1,239 total. Removing five obsolete helper tests accounts for the five-pass reduction from the immediately preceding 1,202 PASS / 41 FAIL / 1 SKIP baseline; the same out-of-scope recovery asset/template/retention failures and known durability timestamp race remain, so no full-suite PASS is claimed.

## Phase 2 — Provider-aware dynamic workflow contract CI

## Task 7: Discover every tracked workflow dynamically

**Files:** repository contract tooling under `scripts/` or `tools/`, discovery tests, and tracked path fixtures.

**RED:** Demonstrate current fixed roots miss a root workflow, a nested tracked workflow, and tracked strict-compile fixtures. Cover NUL-safe names, untracked files, ambiguous claims, exclusions without owners or reasons, and platform-independent slash normalization.

**GREEN:** Run `git ls-files -z -- ':(glob)**/WORKFLOW.md'`, parse NUL-delimited output, classify every tracked path exactly once from manifest rules, and reject unclassified, multiply classified, unsafe, symlinked, or escaping paths without a fixed root list.

**Verify:** Fixture repository tests plus a real-repository inventory artifact; no fixed root array or minimum-count assertion remains.

**Commit:** `feat: discover tracked workflows dynamically`

**Completion evidence (2026-07-23):** Complete in commits `6159d2f`, `3968ba0`, and `563baec`. Initial RED was 0 PASS / 1 FAIL because the dynamic discovery module did not exist. Review hardening added two exact RED cases (4 PASS / 2 FAIL) for an intermediate manifest-directory symlink that exposed outside JSON and a POSIX literal-backslash workflow path aliased to a slash path, followed by a contract-alignment RED (5 PASS / 1 FAIL) for accepting a manifest rule that Task 5 rejects as non-POSIX. Final-head compile, discovery plus contribution-manifest batch (38/38), dependency policy (5/5), architecture/source policies (225 TypeScript files each), and `git diff --check` pass. Independent task review is Spec compliant and Approved with Critical 0 / Important 0 / Minor 0.

**Recovery-checkout evidence:** Discovery executes `git ls-files -z -- ':(glob)**/WORKFLOW.md'`, parses NUL boundaries, discovers tracked contribution manifests, validates every path component and final realpath before reading, and classifies every tracked workflow exactly once without fixed roots or minimum counts. The recovery index truthfully contains six tracked workflows: four workflow-register sample claims and two owned negative-fixture exclusions. Raw Git paths preserve POSIX literal backslashes without aliasing, while manifest claims/exclusions retain Task 5's POSIX-separator contract. The pre-existing strict contract file remains 1 PASS / 6 FAIL because this reconstruction lacks `docs/workflows/action-provider-contracts.json` and companion template assets; no full contract-suite PASS is claimed.

## Task 8: Generate the contribution catalog from manifests

**Files:** contract catalog generator, tests, schema hash utility, and generated catalog schema.

**RED:** Cover missing/invalid manifests, duplicate owners/IDs, cross-kind collisions, incompatible ranges, unsafe schema/template paths, and non-deterministic input order.

**GREEN:** Build a deterministic in-memory catalog exclusively from validated manifests and content digests; do not import VS Code modules or parse TypeScript.

**Verify:** Shuffle-order determinism, digest mutation test, real manifests, and an audit proving deleted legacy source-regex catalogs are unused.

**Commit:** `feat: generate workflow catalog from manifests`

**Completion evidence (2026-07-23):** Complete in commits `de438d9`, `6ef2f44`, `92b4d8f`, and `cb11d76`. The initial module-missing RED was 0 PASS / 1 FAIL; review hardening then produced 2 PASS / 12 FAIL before implementation. The final byte-only generator parses and validates one immutable UTF-8 manifest snapshot, hashes that same snapshot, snapshots untrusted metadata/provenance exactly once, clones Buffer input, rejects unavailable declared content, enforces cross-owner ID and contract-version uniqueness, and emits a closed schema-valid deterministic catalog without VS Code imports or TypeScript parsing. Final-head compile, catalog/manifest/aggregate/discovery batch (53/53), inline workflow contract fixtures (2/2), dependency policy (5/5), architecture/source policies (227 TypeScript files each), and `git diff --check` pass. Independent final review: Approved with Critical 0 / Important 0 / Minor 0.

**Recovery-checkout evidence:** One provenance-backed workflow-register manifest builds from real declared bytes. The changed strict contract file is 2 PASS / 3 FAIL because the reconstruction lacks companion package provenance and template assets; missing bytes are rejected rather than replaced with fabricated digest input, so no full contract-suite PASS is claimed.

## Task 9: Resolve providers, preflights, and sinks during strict compile

**Files:** strict workflow contract validator/compiler integration and resolution tests.

**RED:** Cover unknown, ambiguous, or incompatible action provider/preflight/result-sink references and strict warnings that currently pass.

**GREEN:** Resolve each contribution and version against the generated catalog and fail on every warning/error with workflow path and step/result location.

**Verify:** Positive repository compile plus one mutation per contribution kind and version path; compiler result is deterministic across OS path separators.

**Commit:** `feat: validate workflow contribution references`

**Completion evidence (2026-07-23):** Complete in implementation commits `9a2a990`, `0f21cca`, `629440e`, `d2ee41d`, and `c672939`. The initial test-only base run was 4 PASS / 6 FAIL / 10 total. Review fixes then independently reproduced every missing/ambiguous/version path at 0/12, the mandatory facade at 0/1, POSIX path identity at 1/2, dynamic path syntax at 0/2, catalog snapshot cases at 0/6, the weaker public validator at 0/1, revoked Proxy containment at 0/1, option snapshotting at 0/8, contract-version length at 0/3, and private lookup injection at 1/5 before their respective GREEN changes. The final public contract has one mandatory catalog-aware facade, no manual provider/preflight arrays or public secondary catalog path, explicit canonical/Windows path provenance, immutable own-data snapshots for facade options and untrusted catalog sections, a 256-character contract-version limit, and an isolated structural compiler that cannot accept a forged private lookup. It rejects zero or multiple action/preflight/sink matches, resolves built-in sinks by type, requires exact custom-sink versions, promotes every warning, and emits bounded deterministic workflow/step/preflight/sink diagnostics without aliasing POSIX literal backslashes. Final-head compile, focused Task 9 (45/45), readiness (7/7), relevant compiler parity (13/13), inline contracts (2/2), catalog/manifest/aggregate/discovery (53/53), dependency policy (5/5), architecture/source policies (228 TypeScript files each), and `git diff --check` pass. Independent final specification and quality reviews: Approved with Critical 0 / Important 0; the only specification Minor was this now-synchronized evidence ledger.

**Recovery-checkout evidence:** The full changed workflow contract file remains 2 PASS / 3 FAIL because companion package provenance/templates are absent, and one compiler-parity test still fails because `.github/workflows/workflow-contracts.yml` is absent. The final product head's fresh full workflow-register run was 1,265 PASS / 37 FAIL / 1 SKIP / 1,303 total; all 37 failures are the documented recovery-asset or existing wording-drift set, so no full-suite PASS or waiver is claimed. One immediately preceding run transiently reported one additional existing failure; the unchanged rerun returned to the 37-failure recovery baseline, and no timeout or product behavior was changed.

## Task 10: Validate commands and path-scoped external samples

**Files:** command catalog reader, external sample contract schema/manifest fields, and tests.

**RED:** Cover an undeclared `vscode.executeCommand`, duplicate command IDs, a sample command not owned by any path rule, and an extension command missing from `package.json`.

**GREEN:** Resolve product commands from extension manifests; require every external sample command to carry an explicit path-scoped owner/contract declaration.

**Verify:** Real repository command inventory and mutations in product/sample workflows; no global allowlist.

**Commit:** `feat: validate workflow command contracts`

**Completion evidence (2026-07-23):** Complete in commits `012365d`, `0a583e6`, and `0280062`. The initial old-production run was 0 PASS / 10 FAIL / 10 total for undeclared, duplicate, wrong-path, package-removed, malformed, and test-only allowlist cases. Independent review then reproduced runtime allowlist parity, global duplicate/provenance, exact-byte, package-path, provider-guardrail, generator/facade provenance, and schema/runtime path gaps before their separate GREEN fixes. The final catalog reads each package manifest once as an immutable Buffer with fatal UTF-8 decoding, binds package identity/version and exact manifest/package paths to the contribution owner before declared-content reads, emits schema-closed sorted product/external command records, and rejects product/product, external/external, and product/external ID collisions globally. The mandatory strict facade requires exact path-scoped external owner/contract declarations, resolves every `vscode.executeCommand` and listed guardrail ID, mirrors runtime allowed/denied provider and command-ID guardrails, and retains Task 4's separate result-command-sink authorization boundary. Final-head compile, combined Task 10/Task 9/catalog/manifest/built-in/runtime batch (133/133), raw-byte and real-sample cases (2/2), dependency policy, source/architecture policies (229 TypeScript files each), and `git diff --check` pass. The recovered complete tree dynamically produced 99 product commands and one external command from three manifests; all 25 claimed workflows strict-compiled, and wrong-path external, missing ID allowlist, non-allowlisted provider, denied provider, and removed package-command mutations were rejected. Independent final specification and quality reviews: Approved with Critical 0 / Important 0 / Minor 0.

**Recovery-checkout evidence:** The final partial-checkout workflow-register suite was 1,298 PASS / 36 FAIL / 1 SKIP / 1,335 total. The 36 failures are limited to the documented missing root/companion/template/CI assets or existing wording drift; no Task 10 test failed. No full-suite PASS or waiver is claimed.

## Task 11: Enforce template mirrors and packaged contract payloads

**Files:** template mirror validator, VSIX content validator, manifest `workflow_templates`/`schemas` handling, and tests.

**RED:** Cover template/mirror drift, orphan destination, missing source, path escape, manifest absent from VSIX, schema absent from VSIX, and digest mismatch.

**GREEN:** Compare declared source/destination bytes and inspect actual VSIX entry lists/content digests.

**Verify:** Both provider extension packages plus deliberate byte/path mutations; packaging does not rely on source-tree presence.

**Commit:** `feat: enforce workflow template and package contracts`

**Completion evidence (2026-07-23):** Complete in commits `e1538a3`, `d028238`, `39e2a9a`, and `10aa8b2`. The initial old-production run was 0 PASS / 7 FAIL / 7 total for mirror drift, orphan/missing paths, unsafe paths, absent packaged manifest/schema, and digest mismatch. Independent review then reproduced clean-checkout dependence on ignored `out`, Git/source-tree dependence in the production package seam, accessor/proxy mutation, unbound packaged `package.json`, incomplete ZIP output accounting, canonical drive paths, unbounded mirror diagnostics, and missing-publisher bypass. Those review cases reached 25/25 GREEN through a tracked CommonJS byte engine and typed TypeScript facade. The post-package seam consumes only archive bytes plus a closed own-data `workflow-package-expectation/v1`, whose exact SHA-256 values bind package, contribution manifest, schemas, and templates; mirror validation remains a separate repository gate. All ZIP entries are canonicalized, inflated, bounded at 8 MiB each and 32 MiB aggregate, and CRC-checked. Missing, blank, or non-string publisher metadata fails closed. A legacy Bazaar synthetic policy fixture that had depended on the publisher bypass was corrected to use exact valid package/manifest bytes and now exercises optional-platform handling and package-digest rejection for the intended reasons. Final-head compile, focused/adjacent 97/97, dependency 5/5, source/architecture policies over 231 TypeScript files, clean tracked-archive module load without `out`, and `git diff --check` pass. Complete-tree Bazaar passes 687/687 and CCR passes 275/275. Independent final specification and compatibility reviews are Approved with Critical 0 / Important 0 / Minor 0.

**Package and recovery evidence:** Real policies pass for workflow-register (1,101,012 bytes / 837 entries; largest entry 129,714 B; aggregate uncompressed 3,479,293 B), Bazaar (3,749,466 / 1,832; 884,760 B; 12,484,175 B), and CCR (3,697,313 / 1,915; 884,760 B; 12,028,491 B). Removing a real Bazaar declared schema rejects with `vsix.schema_missing`; package/asset byte changes, noncanonical paths, corrupt non-required CRCs, and per-entry/aggregate expansion excesses are also rejected by permanent tests. The reconstructed workflow-register full suite reached 1,323 PASS / 36 FAIL / 1 SKIP / 1,360 total. The 36 failures are the established recovery-asset or existing wording-drift set; no Task 11 focused failure occurred, so no full-suite PASS or waiver is claimed.

## Task 12: Emit workflow-contract evidence and install the CI gate

**Files:** `workflow-contract-report` schema/writer/semantic validator, `.github/workflows/workflow-contracts.yml`, and report tests.

**RED:** Cover missing path records, missing manifest hash, stale SHA, warnings, unknown exclusion owner, duplicate results, and a report produced from a dirty/different commit.

**GREEN:** Emit deterministic `workflow-contract-report.json`; run discovery, strict compile, command, mirror, and VSIX checks without `continue-on-error`.

**Verify:** Local report validates against schema/semantics, workflow YAML validation, real repo gate, and independent Phase 2 review.

**Commit:** `ci: add provider-aware workflow contract gate`

## Phase 3 — Shared budgets, deadlines, process control, and paths

## Task 13: Create the shared resource-control runtime and ledger

**Files:** a repository-local shared runtime package, `ProcessingBudgetLedger`, profile schema/constants, and ledger tests.

**RED:** Cover every default/absolute pair, invalid/non-finite values, per-category and total reservations, commit/release behavior, double commit/release, overflow-safe arithmetic, and stable report ordering.

**GREEN:** Implement immutable normalized profiles and an operation-scoped ledger shared by all three extensions. Runtime constants and manifest/schema maxima must come from one definition.

**Verify:** Exact table assertion for all 13 categories, property/boundary tests, package compile, and consumer typecheck fixtures.

**Commit:** `feat: add shared processing budget ledger`

## Task 14: Bound files, archives, and document extraction

**Files:** shared bounded I/O/archive preflight plus Bazaar/consistency document extractor integrations and tests.

**RED:** Cover file growth after `stat`, short/oversized reads, symlink/reparse escape, excessive archive entries, zip bombs, oversized expanded entries/total, duplicate archive names, and corrupt DOCX/XLSX.

**GREEN:** Reserve before read, stream or limit reads, validate stable identity/containment, preflight archives before extraction, and debit actual expanded bytes without exceeding reservations.

**Verify:** Real small DOCX/XLSX fixtures, adversarial stored/compressed fixtures, both extension document suites, and no unbounded product `readFile` on governed paths.

**Commit:** `feat: enforce bounded document extraction`

## Task 15: Enforce workbook, sheet, row, and document aggregate caps

**Files:** XLSX extractors, processing coordinators, ledger integrations, and limit tests.

**RED:** Cover 20/100 sheets per workbook, 100/1,000 total sheets, 500/5,000 rows per sheet, 25,000/250,000 total rows, 128/1,024 documents, and 32/256 MiB aggregate document bytes at below/equal/above boundaries.

**GREEN:** Debit both local and operation-wide counters before materializing content and return typed target/category/limit/observed diagnostics.

**Verify:** Default and configured-maximum profiles, multiple-workbook aggregation, cancellation during enumeration, and both consumer suites.

**Commit:** `feat: enforce aggregate document and workbook caps`

## Task 16: Align diff, excerpt, Bob input, artifact, and process-buffer budgets

**Files:** Git/Bazaar diff collectors, review packet/input builders, artifact stores, external process runner, and tests.

**RED:** Cover changed-file 5,000/20,000; raw diff 1/10 MiB; excerpt 2/8 MiB; Bob input 2/8 MiB; managed artifacts 16/64 MiB; total 64/256 MiB; UTF-8/line boundaries; mandatory Bob sections over cap; stdout cap+1; stderr 256 KiB; and metadata truncation attempts.

**GREEN:** Stream collection, construct mandatory-first inputs within reservations, reject unfit mandatory content, replace fixed 20/50 MiB buffers with target+1 plus 256 KiB, and permit explicit truncation only for diff/excerpts.

**Verify:** Exact byte-boundary tests with multi-byte UTF-8, both external runners, review package suites, and an audit that obsolete fixed buffers are gone.

**Commit:** `feat: align review input and process budgets`

## Task 17: Propagate absolute deadlines, cancellation, tree kill, and normalized paths

**Files:** shared deadline/cancellation/path modules, external runner integrations, workspace resolvers, and cross-platform tests.

**RED:** Cover nested timeout reset, pre-expired deadline, user cancel vs deadline, stdout-limit termination, descendant process survival, drive/UNC/device/drive-relative/dot/traversal/control-character paths, symlink/reparse escape, spaces/Japanese, and wrong multi-root selection.

**GREEN:** Pass one absolute monotonic deadline through all layers, combine cancellation without losing cause, terminate the full process tree on both OSes, and use one physical containment/path normalization policy.

**Verify:** Linux process-tree tests locally where available, Windows-specific tests in CI, path fixture matrix, multi-root resolution, and no independent nested timeout refresh.

**Commit:** `feat: unify deadlines process control and paths`

## Task 18: Integrate budget reporting and close Phase 3

**Files:** operation entrypoints, `processing-budget-report` schema/writer/validator, handoff guards, and integration tests.

**RED:** Cover exact success, rejected overrun, partial truncation, cancellation, early extraction error, missing category records, stale SHA, and attempted formal handoff with partial coverage.

**GREEN:** Produce schema-valid reports on success/failure, mark truncation `coverage_status: "partial"`, prevent incomplete package commit/handoff, and expose enough target/consumed/unprocessed data for diagnosis.

**Verify:** End-to-end preprocessing for both review extensions, all shared runtime tests, three package suites, schema/semantic validation, and independent Phase 3 review.

**Commit:** `feat: gate handoff on complete processing coverage`

## Phase 4 — Full specification-ID execution traceability

## Task 19: Derive the canonical specification-ID catalog

**Files:** spec catalog parser, catalog schema, fixtures, and tests.

**RED:** Cover WR/BZR/CCR headings, shared `EXT-UT-REM` rows, duplicate IDs, malformed IDs, noncanonical mentions, missing source file, and a new valid ID added after the baseline.

**GREEN:** Parse only canonical declaration locations and emit a deterministic source/path/line/title catalog. Record the older 166 snapshot only as historical recovery evidence and the current 179 snapshot as a drift check, never as the pass condition.

**Verify:** Recovery-base derivation yields WR42+BZR57+CCR74+shared6 = 179 unique IDs; adding a fixture ID automatically increases the required set and fails missing implementation.

**Commit:** `feat: derive specification id catalog`

## Task 20: Add `specTest` and actual-completion reporting

**Files:** shared Node test helper, custom reporter, report schema, and self-tests.

**RED:** Cover pass, fail, skip, todo, cancel, never-started, multiple IDs on one test, duplicate primary test, unknown ID, duplicate event, and test file outside the declared execution set.

**GREEN:** Attach normalized IDs to Node test events and emit only terminal events with commit, OS, Node, file, name, ID, status, and duration.

**Verify:** Reporter self-test processes synthetic and real Node test event streams; static source text alone cannot satisfy an ID.

**Commit:** `feat: report executed specification tests`

## Task 21: Map and implement every workflow-register formal ID

**Files:** workflow-register specification tests and traceability wiring.

**RED:** Run the catalog/coverage validator to enumerate unmapped WR IDs; for every specification-only behavior, add a failing behavior test before implementation/correction.

**GREEN:** Assign exactly one primary passing `specTest` to every derived WR ID without weakening existing assertions or merging unrelated behavior merely to reduce test count.

**Verify:** Workflow-register suite has no WR missing/unknown/duplicate/skip/todo/cancel result and preserves all non-traceability tests.

**Commit:** `test: trace workflow-register specifications`

## Task 22: Map and implement every Bazaar review formal ID

**Files:** bob-bazaar-review specification tests and traceability wiring.

**RED:** Enumerate missing BZR IDs and reproduce each uncovered behavior, including unsafe paths, exit-code policies, encoding, bridge, results store, MCP, completion, and template contracts.

**GREEN:** Provide one primary executed test per derived BZR ID and implement only the behavior required to make a genuine RED test pass.

**Verify:** Bazaar suite plus trace validator; no BZR missing/unknown/duplicate/skip/todo/cancel result.

**Commit:** `test: trace Bazaar review specifications`

## Task 23: Map consistency-review and shared cross-extension IDs

**Files:** bob-code-consistency-review tests, shared cross-extension test suite, and traceability wiring.

**RED:** Enumerate missing CCR and shared IDs. Shared cases must fail unless every declared participating extension exercises the same contract.

**GREEN:** Assign one primary test to every derived CCR ID; centralize the six `EXT-UT-REM` tests with explicit required-extension metadata rather than duplicating IDs.

**Verify:** Consistency suite, shared suite, and validator show complete unique mapping with no skipped/todo/cancel terminal states.

**Commit:** `test: trace consistency and shared specifications`

## Task 24: Aggregate both-OS execution evidence and close Phase 4

**Files:** per-extension report writer, aggregate schema/validator, CI job wiring, and tests.

**RED:** Cover one missing OS, stale/different SHA, missing current ID, unexpected ID, duplicate primary, skipped/cancelled result, wrong Node metadata, and a newly added specification after reports were generated.

**GREEN:** Emit `test-traceability-<extension>-<os>.json` from normal test runs and aggregate only current-catalog, same-commit Ubuntu/Windows passes.

**Verify:** Schema/semantic mutation matrix, workflow validation, local single-OS result explicitly remains non-release-authoritative, and independent Phase 4 review.

**Commit:** `ci: require cross-platform specification traceability`

## Phase 5 — Installed-VSIX Extension Host release smoke

## Task 25: Lock the release smoke toolchain and four VSIX inputs

**Files:** release toolchain lock/schema/validator, package scripts, and lock tests.

**RED:** Reject floating Node/VS Code/Bob/Breezy versions, missing URL/hash/signature, wrong platform, unlisted transitive MSYS2 package, and any normal-CI `pacman -S`/`-Sy` path.

**GREEN:** Lock the exact Node 22 patch chosen at implementation, VS Code 1.106.1, Bob 2.0.1, Linux Breezy 3.3.22, MSYS2 20260611, Windows Breezy 3.3.22-1 closure, and every fetched artifact hash/signature.

**Verify:** Offline/fresh-cache lock verification where supported, tamper mutations, build all four VSIX files, and record SHA-256 plus installed identity/version.

**Commit:** `build: lock installed-vsix smoke toolchain`

## Task 26: Build an installed-product Extension Host harness

**Files:** release smoke test-driver extension, launcher, isolated directory setup, and harness tests.

**RED:** Detect a product extension loaded via development path, skipped dependencies, reused user data/extensions, missing VSIX installation, wrong identity/version/hash, activation failure, and missing command.

**GREEN:** Install four VSIX files into empty directories and launch only the driver through development mode; collect structured scenario events and logs.

**Verify:** Harness unit tests, one local-platform rehearsal marked `local_os_only`, and source scan prohibiting product `extensionDevelopmentPath`/`skipExtensionDependencies`.

**Commit:** `test: add installed-vsix extension host harness`

## Task 27: Create the multi-root and Windows-path smoke fixture

**Files:** deterministic fixture builder, `.code-workspace`, path assertions, and cleanup tests.

**RED:** Cover root-order changes, duplicate filenames, workflow/Git/Bazaar root confusion, spaces/Japanese absolute paths, drive-letter case, separators, and fixture residue between runs.

**GREEN:** Create three explicit roots and return normalized logical/physical identities used by every later smoke scenario; cleanup only the owned fixture tree.

**Verify:** Deterministic fixture manifest/digest, repeat create/cleanup, multi-root selection assertions, and Windows hosted path test.

**Commit:** `test: add release smoke multi-root fixture`

## Task 28: Exercise real Git and real Bazaar repositories

**Files:** fixture VCS builders, smoke driver scenarios, evidence types/schema, and tests.

**RED:** Reject fake/stub executables, empty history, no working-tree change, wrong root, command timeout, and version mismatch.

**GREEN:** Create multiple Git commits and Bazaar revisions plus uncommitted changes, invoke the installed extensions, and record bounded diff/revision evidence. Use the locked Breezy absolute path.

**Verify:** Local Git scenario, platform-appropriate Bazaar scenario, hosted Ubuntu/Windows execution, and evidence includes tool version/root/hash without unbounded content.

**Commit:** `test: smoke real Git and Bazaar integration`

## Task 29: Exercise Webviews, IBM Bob, reload, and shutdown lifecycle

**Files:** common `webview-ready/v1` protocol, driver scenarios, Bob diagnostic seam, shutdown counters, and tests.

**RED:** Cover ready timeout, message from stale panel, close without dispose, reopen with duplicate listeners, absent Bob workflow, wrong Bob/source/version, stale provider after reload, and nonzero shutdown resources.

**GREEN:** Normalize readiness for Operation Hub, Bazaar Review GUI, and Code Consistency Wizard; activate real Bob and call `registerSource`/`source.registerWorkflow`; verify dispose/re-register and Extension Host shutdown cleanup.

**Verify:** Webview open/close/reopen, Bob registration without authentication/inference, registry snapshot, and listener/provider/source counts return to zero.

**Commit:** `test: smoke Webview Bob and lifecycle integration`

## Task 30: Publish both-OS smoke evidence and close Phase 5

**Files:** `release-smoke-evidence` schema/writer/semantic validator, Ubuntu/Windows jobs, artifact upload, and tests.

**RED:** Cover fabricated success defaults, missing Git/Bazaar/Webview/Bob/shutdown records, `unavailable` inside success, stale SHA, skipped scenario, one OS, and wrong VSIX hash.

**GREEN:** Always write schema-valid success/failure evidence; require the full record set semantically only on success; run both OS jobs without `continue-on-error` and retain failure logs.

**Verify:** Early-failure and full-success fixtures, schema/semantic mutations, workflow validation, same-commit artifact metadata, and independent Phase 5 review.

**Commit:** `ci: add installed-vsix release smoke matrix`

## Phase 6 — Medium governance and release readiness

## Task 31: Define the authoritative finding register contract

**Files:** `docs/release-gates/three-extension-findings.schema.json`, semantic validator, fixtures, and tests.

**RED:** Reject missing governance fields, invalid severity/status/date/release, duplicate ID, empty workaround/reason/risk, missing acceptor/timestamp/trigger/link/test/evidence, and deferred P1/High.

**GREEN:** Implement strict schema plus semantic rules for deferred Mediums and evidence-backed resolution transitions.

**Verify:** Boundary/date/timezone cases, malicious strings/path/link sizes, all negative fixtures, and deterministic diagnostics.

**Commit:** `feat: define release finding governance contract`

## Task 32: Migrate findings and generate the Markdown view

**Files:** `docs/release-gates/three-extension-findings.json`, Markdown generator, `docs/review-findings-tracking.md`, and tests.

**RED:** Inventory current unresolved Mediums and show every missing owner/due/workaround/acceptance field or Markdown-only record.

**GREEN:** Populate authoritative records with real governance data and generate the relevant Markdown section without hand-edited divergence.

**Verify:** Regeneration produces zero diff, every migrated ID is unique, and no P1/High appears deferred.

**Commit:** `docs: migrate three-extension finding governance`

## Task 33: Install expiry, release, and resolution evidence gates

**Files:** governance CLI, release catalog integration, CI job, and tests.

**RED:** Cover today/expired dates in Asia/Tokyo-safe date semantics, unknown target release, release-scoped open/in-progress Medium, evidence-free resolved transition, and JSON/Markdown drift.

**GREEN:** Fail CI for every invalid state and emit a machine-readable governance result with commit SHA and evaluated date.

**Verify:** Frozen-clock tests, release mutation tests, workflow validation, and real register check.

**Commit:** `ci: enforce Medium finding governance`

## Task 34: Implement the same-commit readiness aggregator

**Files:** `p1-release-readiness` schema, artifact selector, semantic aggregator, and tests.

**RED:** Cover each missing report, SHA mismatch, duplicate artifact, unsupported schema, skip/todo/cancel, partial budget coverage, one-OS trace/smoke, unresolved P1, and invalid Medium governance.

**GREEN:** Select only explicitly named upstream artifacts from the same workflow/revision, validate schema and semantics, and emit deterministic GO/NO-GO reasons.

**Verify:** Complete synthetic success plus one mutation for every fail condition; local incomplete input remains NO-GO.

**Commit:** `feat: aggregate P1 release readiness evidence`

## Task 35: Wire artifact provenance, retention, and release-tag evidence

**Files:** CI orchestration, artifact naming/retention policy, release-tag job, and policy tests.

**RED:** Cover artifact-name collision, cross-run artifact selection, missing source run/job/SHA, retention below 90 days, tag/SHA mismatch, and aggregate upload before validation.

**GREEN:** Pass immutable artifact identities between jobs, retain success/failure evidence and logs for 90 days, and attach the validated aggregate report for the matching release tag.

**Verify:** Workflow policy tests, action/workflow syntax checks, artifact selector fixtures, and dry-run graph review.

**Commit:** `ci: retain same-commit P1 release evidence`

## Task 36: Close governance/readiness with adversarial gate tests

**Files:** release-gate integration tests, mutation fixtures, and Phase 6 evidence report.

**RED:** Seed stale-but-valid artifacts, old commits, partial success, omitted negative scenarios, expired findings, and manually edited Markdown; prove each is rejected.

**GREEN:** Remove any permissive fallback exposed by the adversarial suite and keep diagnostic output bounded/actionable.

**Verify:** Full governance/readiness suite, all report schemas, CI workflow validation, `git diff --check`, and independent Phase 6 review.

**Commit:** `test: harden P1 release readiness gate`

## Phase 7 — Documentation, rollout, and final release decision

## Task 37: Document manifest authoring and registry migration

**Files:** workflow-register API/authoring docs, provider extension developer docs, examples, and documentation tests.

**RED:** Documentation contract test flags missing owner/version negotiation, atomicity, duplicate diagnostics, disposal ordering, result sinks, and adapter removal policy.

**GREEN:** Publish exact manifest fields/examples, handler mapping, lifecycle rules, error codes, migration steps, and troubleshooting without duplicating generated catalogs.

**Verify:** Examples validate against schema and compile; command/API names match exports; docs link check passes.

**Commit:** `docs: explain contribution registry contracts`

## Task 38: Document budgets, deadlines, cancellation, and Windows paths

**Files:** operator/developer limit docs, configuration tables, troubleshooting, and documentation tests.

**RED:** Flag any missing default/absolute limit, binary-byte unit, stdout+1/stderr 256 KiB rule, partial-coverage block, deadline propagation, tree kill, or Windows containment behavior.

**GREEN:** Generate or verify the full limit table from the shared profile and document typed failures, safe tuning, and evidence interpretation.

**Verify:** Runtime/docs values are byte-for-byte aligned and examples remain inside limits.

**Commit:** `docs: document shared processing controls`

## Task 39: Document workflow contracts and specification traceability

**Files:** CI contributor guide, specification authoring guide, report references, and docs tests.

**RED:** Flag advice that asks authors to update fixed roots/counts/catalogs or permits static/skip/todo evidence.

**GREEN:** Explain tracked discovery, path-scoped samples, manifests, mirror/package checks, `specTest`, primary mapping, derived catalog, and both-OS completion evidence.

**Verify:** Add a temporary fixture workflow/spec ID and follow the documented failure/fix path in automated docs examples.

**Commit:** `docs: explain workflow and test contract gates`

## Task 40: Publish installed-smoke and operator recovery guidance

**Files:** release runbook, Bob/Webview/VCS diagnostics guide, Windows MSYS2 lock guide, and docs tests.

**RED:** Flag missing four-VSIX isolation, exact pins/hashes, real repository setup, `local_os_only` caveat, early-failure `unavailable`, logs, or shutdown checks.

**GREEN:** Document permanent matrix behavior, safe lock refresh procedure, failure triage, and why external AI/authentication is excluded while Bob registration is included.

**Verify:** Commands exist, paths match tooling, lock-refresh dry run validates, and no floating package-manager command is recommended for normal CI.

**Commit:** `docs: add installed-vsix smoke runbook`

## Task 41: Execute staged rollout and deprecated-adapter exit checks

**Files:** rollout checklist/configuration, adapter removal marker, compatibility audit, and rollback test plan.

**RED:** Detect any provider extension still using legacy registration, undeclared contribution, owner/version mismatch, adapter silent overwrite, or rollback that leaves partial registration/artifacts.

**GREEN:** Complete manifest-native activation for all three extensions, set the explicit next-release adapter-removal condition, and define rollback as reverting the release unit without accepting mixed registry generations.

**Verify:** Repository-wide legacy-call audit, install previous-compatible fixture if maintained, rollback rehearsal, and all package suites.

**Commit:** `chore: finalize provider registry rollout`

## Task 42: Run the full release rehearsal and record the final decision

**Files:** final verification ledger, release-readiness input/output artifacts, review report, and release documentation updates only as produced by the gates.

**RED/GO condition:** Before hosted jobs, the aggregator must report NO-GO for missing both-OS evidence. Do not bypass this expected local result.

**GREEN:** On one exact commit, run package/policy/schema suites, dynamic workflow gate, both-OS unit/traceability jobs, both-OS installed-VSIX smoke, budget/deadline/path tests, governance gate, and readiness aggregation.

**Verify:** All artifacts validate, share the exact commit SHA, contain no skip/todo/cancel/partial/unavailable-in-success state, and satisfy 90-day retention. Obtain independent whole-diff specification and quality reviews with Critical 0 and Important 0. `git diff --check` and worktree cleanliness must pass.

**Commit:** `docs: record three-extension P1 release readiness`

The task is complete only after the authoritative hosted Ubuntu and Windows evidence is green. If either OS or any required artifact is unavailable, record Release NO-GO and the precise blocker; do not label the implementation complete.

## Task dependency map

```text
1 -> 2 -> 3 -> 4 -> 5 -> 6
1 -> 8; 5 -> 8; 7 -> 9; 8 -> 9 -> 10 -> 11 -> 12
13 -> 14 -> 15 -> 16 -> 17 -> 18
19 -> 20 -> 21/22/23 -> 24
6 + 12 + 18 + 24 -> 25 -> 26 -> 27 -> 28 -> 29 -> 30
31 -> 32 -> 33; 12 + 18 + 24 + 30 + 33 -> 34 -> 35 -> 36
36 -> 37/38/39/40 -> 41 -> 42
```

Tasks 21, 22, and 23 may be implemented concurrently after Task 20 because they modify separate extension test trees. Documentation Tasks 37 through 40 may be drafted concurrently after Phase 6, but Task 41 and Task 42 remain serial integration gates.

## Completion checklist

- [ ] All 42 tasks have a reviewed commit range and progress-ledger entry.
- [ ] All three extensions use the manifest-backed atomic registry.
- [ ] No action/preflight/result-sink/agent silent overwrite remains.
- [ ] Every tracked workflow is dynamically discovered and strictly resolved.
- [ ] Every approved budget/deadline/path rule is enforced and evidenced.
- [ ] The current dynamically derived specification set passes on Ubuntu and Windows.
- [ ] Four installed VSIX files pass permanent Extension Host smoke on both OSes.
- [ ] Every deferred Medium has complete, unexpired governance information.
- [ ] `p1-release-readiness.json` is same-commit, schema-valid, semantically GO, and retained for 90 days.
- [ ] Whole-diff independent reviews have Critical 0 and Important 0.
