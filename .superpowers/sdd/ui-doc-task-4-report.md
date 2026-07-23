# Task 4 implementation report

## Result

Status: COMPLETE; SPEC_COMPLIANT AND CODE_QUALITY_APPROVED (C0 / I0 / M0)

Product commit:

- `715155c refactor: route consistency review through one GUI`
- `afeb09a fix: harden consistency review stage recovery`
- `0df976f fix: preserve consistency initialization contracts`
- `7072220 fix: align consistency review stage terminology`
- `50e1e22 fix: route consistency guidance through primary GUI`
- `d43a7eb docs: finish consistency primary-route terminology`

Task range: `774f52a..8f5fb03`

## Behavior delivered

- Retained one `bobCodeConsistencyReviewWizard` Webview panel and the single `openConsistencyReviewWizard()` panel factory.
- Routed `review`, `traceability`, `review-result-capture`, and `triage` through one controller and narrow embedded stage services.
- Removed the standalone result-capture and Human Triage activation events, manifest contributions, registrations, panel factories, and live view types.
- Kept `bobCodeConsistency.openTraceabilityPrep` as a workflow/public command, but made it enter the primary GUI's embedded traceability stage.
- Bound traceability command completion to the actual embedded service initialization Promise. The service performs the sole catalog read and returns its real `{ status: "ok", catalogPath }`; read/render failures return `{ status: "error", errors }` and never emit a success notification.
- Preserved traceability original/restore behavior, compare-and-set catalog saves, gate-report generation, and same-panel action/save serialization.
- Preserved Bob output validation and Human Triage source hash / decision revision conflict checks.
- Added the primary GUI workspace initialization action while retaining the non-GUI workflow command. Existing workflow and review-input backups are reported separately; Task 5 still owns final Command Palette hiding.
- Preserved the initializer contract: the workflow is updated to the bundled template bytes with a byte-exact backup, while a project-owned `review-input.yaml` remains byte-identical and receives its own byte-exact backup.
- Preserved the aggregate initializer status and flat backup paths while adding typed `workflowResult` and `reviewInputResult` outcomes. The primary GUI reports their statuses, messages, and backups separately.
- Standardized the review and all embedded stage surfaces on `トレーサビリティ整理`, `レビュー結果取り込み`, and `指摘確認・振り分け` without changing internal stage IDs, schema fields, or artifact names.

## Lifecycle and message boundaries

- Panel-wide stage and review-operation generations gate render, post, initialization, model commits, and stage transitions.
- Every page carries a cryptographically random render token, and the host requires both the current token and the active stage message namespace.
- Stage messages are ignored until service initialization completes.
- Out-of-order stage completion cannot replace the latest stage, and disposal invalidates every pending lease.
- Review initialization is single-flight; superseded or inactive completion cannot update the rendered model after the underlying write.
- Traceability, result capture, and Human Triage serialize mutations on a stage-local Promise tail.
- Render refusal is a structured stage initialization failure rather than a false success.
- A failed embedded transition restores the usable review stage. Initial-stage command errors are returned to the command without a second controller-owned notification; GUI transition failures are reported once per generation.
- Webview post rejection is observed at the listener/controller boundary, including rejection after disposal.

## RED evidence

- Initial focused run: 17 tests, 9 pass and 8 expected fail. Failures captured the two obsolete public GUI commands, four panel factories instead of one, missing approved stage navigation, absent controller export, out-of-order/token/dispose gaps, and missing structured traceability initialization outcome.
- Expanded integration run initially exposed six expected migration failures: four standalone initialization-harness assumptions and two standalone traceability Webview concurrency assumptions. Those tests were migrated to the real primary controller and embedded service seams.
- Final hardening RED: three expected failures captured initial-stage error double ownership, a dead controller after failed stage initialization, and render rejection being accepted as successful initialization.

## GREEN verification

- Compile: PASS.
- Initial focused suite after consolidation: 18/18 PASS.
- Expanded traceability, triage, initialization, output, privacy, and GUI focused suite: 94/94 PASS.
- Final lifecycle/GUI/structured-outcome targeted suite: 24/24 PASS.
- Final `npm test`: 296/296 PASS, 0 fail, 0 skip.
- Architecture import-cycle policy: PASS, 100 TypeScript files checked.
- Source export-star policy: PASS, 100 TypeScript files checked.
- Dependency policy: 2/2 PASS.
- Unused dependency/source report: all tools completed with exit 0.
- Package: PASS; VSIX created with 1,915 entries.
- VSIX policy: PASS at 3,705,897 bytes (11,000,000-byte budget).
- `git diff --check`: PASS.
- Exact live-product scan: one `createWebviewPanel`; zero removed result-capture/Human-Triage command IDs, controller factories, or old view types.

The Code Consistency package has no separate schema, artifact-size, or package-smoke scripts. Schema, persisted artifact, output validation, and initialization compatibility are covered by the full suite and focused traceability/triage/initializer tests.

## Self-review

- Reviewed the complete manifest, activation, controller, stage services, generated clients, and test diff.
- Confirmed Task 5's Palette-hiding scope was not implemented early: `initializeWorkspace` and other workflow commands remain registered/contributed as before.
- Confirmed no run engine/provider/artifact/`run.json` contract changed.
- Confirmed all three embedded services use the host render/post/active boundary and no longer own a panel.
- Confirmed the traceability command performs no catalog preflight outside the embedded service and reports the service-returned physical catalog path.
- Confirmed initialization displays workflow and review-input backups separately and exact-write tests preserve both old byte streams.
- Confirmed stale UI/model writes are blocked after stage change or disposal, while completed domain writes retain their existing transactional/CAS semantics.
- No unresolved implementation concern remains. Independent specification and quality review are the next gate.

## Environment notes

- npm prints its existing `http-proxy` deprecation and version notices.
- `vsce` prints the existing bundle/file-count recommendation; the VSIX remains within package policy.
- The optional production dependency audit reports two existing high-severity `fast-uri` advisories through `ajv`; npm reports no available fix. The follow-up did not change dependencies or the lockfile.

## Independent-review follow-up

The follow-up closes the remaining review probes without changing the Task 5 Command Palette surface:

- Result capture fixes the selected workspace root once during embedded-stage initialization. Manual capture, clipboard capture, and validation all receive that same root even if the host's later selection changes.
- An initial traceability read failure returns the embedded service's structured error and restores a usable review without a second catalog read or gate-report write. Recovery does not mix a request's custom catalog options with configured defaults.
- All three real embedded services return a structured error when their host rejects rendering.
- Deferred fake-panel coverage now distinguishes the exact source stage, initialization readiness, same-stage ABA generation, per-generation failure reporting, and both workspace-initializer post-write lease checks.

Follow-up verification on `afeb09a`:

- Initial RED: 22 tests, 19 pass and 3 expected fail.
- Final targeted: 22/22 PASS.
- Final focused: 101/101 PASS.
- Final full suite: 307/307 PASS, 0 fail, 0 skip.
- Six lifecycle mutations were applied individually; every corresponding regression failed before the production guard was restored.
- Architecture and source policies: PASS, 100 TypeScript files each.
- Dependency policy: 2/2 PASS; unused-code/dependency tools completed with exit 0.
- Package and VSIX policy: PASS at 3,706,098 bytes and 1,915 entries.
- `git diff --check`: PASS.

## Specification-review remediation

Product remediation commit: `0df976f fix: preserve consistency initialization contracts`.

The specification follow-up closes I1-I3 while retaining every lifecycle and recovery guard from `afeb09a`:

- Existing workflow and review-input files are each read once as raw `Buffer` values for comparison and backup. The already-read bytes are written directly, so CP932 and arbitrary non-UTF-8 data are not decoded, normalized, or re-read through a copy race.
- `InitializeCodeConsistencyWorkspaceResult` now includes typed `workflowResult` and `reviewInputResult` outcomes with `status`, `path`, optional `backupPath`, and `message`. Aggregate `status`, `backupPath`, and `reviewInputBackupPath` remain compatible.
- The primary GUI prefers the two per-file outcomes and explicitly reports `workflow [updated]` separately from `review-input [unchanged]`. Legacy/mock results without nested outcomes retain the previous aggregate/flat reporting path.
- Structural template checks and generated-client checks cover the review, traceability, result-capture, and triage navigation surfaces. Approved labels and stage actions are exact; internal `traceability` / `triage` identifiers and technical validation terminology are unchanged.
- The detailed design now records the additive result shape, byte-exact backup rule, and per-file outcome test contract.

Remediation RED evidence:

- The reviewer's complete candidate inventory contained 310 tests; 8 expected failures remained before the product remediation.
- Focused run: 19 tests, 11 pass and 8 expected fail.
- I1: one failure showed an 11-byte existing workflow becoming a 19-byte UTF-8 replacement-character backup. Both workflow and review-input fixtures used arbitrary non-UTF-8 `Buffer` values.
- I2: two failures showed absent nested outcomes and aggregate-only GUI reporting that could not distinguish an updated workflow from an unchanged review-input.
- I3: five failures covered generated review/result/triage HTML, all four structural stage templates, and generated traceability HTML retaining the retired labels.

Remediation GREEN verification:

- Compile: PASS.
- Initial remediation suite: 19/19 PASS.
- Expanded GUI, lifecycle, traceability, initializer, privacy, and result-capture suite: 100/100 PASS.
- Final `npm test`: 310/310 PASS, 0 fail, 0 skip.
- Architecture import-cycle policy: PASS, 100 TypeScript files checked.
- Source export-star policy: PASS, 100 TypeScript files checked.
- Dependency policy: 2/2 PASS.
- Unused dependency/source report: all tools completed with exit 0.
- Package: PASS; VSIX created with 1,915 entries.
- VSIX policy: PASS at 3,706,399 bytes (11,000,000-byte budget).
- Final `git diff --check`: PASS.

Status after remediation: implementation and self-verification complete; independent specification and quality re-review remain pending.

## Final quality-audit closure

The audit of `0df976f` found one remaining I3 presentation gap: embedded UI labels were corrected, but the manifest and current Task 4 operator documentation still exposed the retired terms. `7072220` closes that gap without changing command IDs, Palette visibility, internal stage IDs, schemas, or artifacts.

- Manifest/current-doc terminology contract: 0/1 RED, then 1/1 PASS.
- Original remediation contract: 19/19 PASS.
- Multi-root, sole-read recovery, render failure, generation, and initializer lease integration: 31/31 PASS.
- Expanded Task 4 focused suite: 110/110 PASS.
- Final `npm test`: 310/310 PASS, 0 fail, 0 skip.
- Architecture and source policies: PASS, 100 TypeScript files each.
- Dependency policy: 2/2 PASS; unused-code/dependency tools completed with exit 0.
- Package and VSIX policy: PASS at 3,706,416 bytes and 1,915 entries.
- Final `git diff --check`: PASS.

The optional production audit remains separately blocked by the existing `ajv` -> `fast-uri` dependency path: two high-severity advisories, with npm reporting no available fix. This remediation does not change dependencies or the lockfile.

## Final live-route documentation closure

The final specification/quality re-review found that one live notification and several current operator/design assertions still described the retired Traceability Prep, Result Capture, and Human Triage standalone surfaces. `50e1e22` closes those remaining live routes while retaining historical module names behind explicit current-UI supersession notices.

- RED behavior/current-doc contract: 5 tests, 1 pass and 4 expected fail.
- Targeted behavior/current-doc contract: 8/8 PASS.
- Expanded Task 4 focused suite: 114/114 PASS.
- Final `npm test`: 314/314 PASS, 0 fail, 0 skip.
- Architecture and source policies: PASS, 100 TypeScript files each.
- Dependency policy: 2/2 PASS; unused-code/dependency tools completed with exit 0.
- Package and VSIX policy: PASS at 3,706,451 bytes and 1,915 entries.
- Final `git diff --check`: PASS.
- Exact live-route scan: zero retired standalone command instructions, panel-ownership claims, or `traceability prep を開…` notifications in the Task 4 current-doc/product scope.
- Task 5 command IDs and Palette visibility remain unchanged.

The optional production audit result is unchanged: two existing high-severity advisories on the `ajv` -> `fast-uri` dependency path, with npm reporting no available fix and no dependency or lockfile changes in this closure.

## Final current-document specification closure

Documentation contract commit: `d43a7eb docs: finish consistency primary-route terminology`.

The final specification follow-up removed the three remaining current-document residues without changing the quality-approved product at `50e1e22`:

- The documentation index names the primary GUI's `トレーサビリティ整理` stage instead of a retired traceability screen.
- The real-machine test heading uses the approved `指摘確認・振り分け` user-facing term while retaining the technical `Integrity` qualifier.
- The workflow action contract states that `bobCodeConsistency.openTraceabilityPrep` routes the retained primary GUI to the `トレーサビリティ整理` stage instead of opening a standalone Webview.

Verification:

- RED current-document contract: 5 tests, 2 pass and 3 expected fail, one independent failure for each residue.
- Targeted current-document and Japanese terminology contract: 8/8 PASS.
- Expanded Task 4 focused suite: 125/125 PASS.
- Exact scan of the three corrected current documents: zero occurrences of `トレーサビリティ確認画面`, `人による判定 Integrity`, or `Traceability Prep Webview を開く`.
- Final `git diff --check`: PASS.
- No TypeScript, manifest, command ID, Palette visibility, dependency, schema, or artifact change; Task 5 scope remains unchanged.

## Independent final approval

- Specification: `SPEC_COMPLIANT`, Critical 0 / Important 0 / Minor 0. The final reviewer passed 55/55 focused probes and confirmed the single-panel, fixed-workspace-root, sole-read recovery, byte-exact backup, structured outcome, initializer, CAS, triage, notification, and current-document route contracts.
- Quality: `CODE_QUALITY_APPROVED`, Critical 0 / Important 0 / Minor 0. The final product review passed 46/46 targeted tests, 314/314 full tests, architecture/source/dependency/package/VSIX policies, and the full-range diff check.
- Final current-document closure passed 8/8 targeted tests, 125/125 expanded focused tests, an exact obsolete-expression scan with zero hits, and `git diff --check`.
- Worktree was clean at approval. Task 5 retains ownership of the exact five visible Command Palette entries and hidden workflow-command policy.
