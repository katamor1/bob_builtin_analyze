# Task 3 implementation report

## Result

Status: DONE

Product commits:

- `13778ec refactor: route Bazaar review stages through one GUI`
- `2dd2bb0 fix: harden Bazaar review stage ownership`
- `e2c3fd9 fix: strengthen Bazaar review client contracts`

Task range reviewed: `bc24c80..e2c3fd9`

## Behavior delivered

- Retained one `bobBazaarReviewGui` Webview panel and one `openBazaarReviewGui()` panel factory.
- Routed `review`, `review-result-capture`, `triage`, and `review-results` through the retained controller and its `showStage(stage)` boundary.
- Removed the standalone dashboard, result-capture, and human-triage GUI activation events, contributions, registrations, panel factories, and live current-document routes.
- Preserved the non-GUI workflow, capture, validation, record, triage, summary, and provider commands. Task 5 still owns final Command Palette hiding.
- Preserved exact Review Run identity and expected review ID validation across result capture, triage, metrics, finalization, dashboard aggregation, and export.
- Migrated visible UI and current documentation to `レビュー結果取り込み`, `指摘確認・振り分け`, and `レビュー実績` while retaining persisted `human_triage_*` fields.
- Bound `bobBazaar.openReviewGui` structurally to the canonical visible label `Bob Bazaar Review: レビューを開始` and synchronized current instructions.
- Kept dashboard JSON, Markdown, and CSV export on the existing source-backed aggregation and transaction paths.

## Lifecycle and concurrency boundaries

- A panel-wide stage generation and disposed state gate every render, post, context read/commit, and stage transition.
- Stage services receive a narrow host interface; inactive or disposed services cannot render, post, commit a Review Run, or navigate.
- Stage messages are ignored until initialization completes and are dispatched only to the active stage namespace.
- Navigation messages carry the originating stage, so delayed messages from an old page cannot replace the current page.
- Every rendered page carries a controller-owned render token. The host requires both the active token and matching source stage, including after same-stage revisits and in-stage re-renders.
- Active Review Run commits require both exact prior object ownership and unchanged workspace/campaign/review identity.
- Dashboard refresh, campaign selection, and export use a latest-wins operation generation; inactive or superseded completion cannot render, post, write a pending export, or show a completion notification.
- The main review stage passes an explicitly requested campaign through the stage factory, while an active Review Run remains the higher-priority campaign source.
- Main-review operations use latest-wins leases across workspace selection, initialization, target loading, review creation, resume, recovery, and response delivery.
- Resume rechecks its lease after `postMessage` before automatically changing stage.
- Transport and initialization failures are contained and reported once per stage lease; rejection handlers do not escape the Webview listener.

## RED evidence

- Initial structural run after compiling `test/guiFirstSurfaces.test.js`, `test/reviewGuiHtml.test.js`, `test/campaignDashboardGui.test.js`, and `test/reviewRunV3Acceptance.test.js`: 12 total, 9 pass, 3 expected fail. The failures captured the old public GUI routes/panel factories and missing approved stage labels.
- Initial `test/reviewGuiLifecycle.test.js`: 8 total, 0 pass, 8 expected fail. The retained fake-panel cases cover out-of-order stage initialization, inactive completion, disposal, transport rejection, stage namespaces, initialization readiness, exact Review Run ownership, and contained initialization failure.
- Main-stage operation-lease regression: 1 total, 0 pass, 1 expected fail. A delayed old `loadTarget` posted its target after a newer request had already completed.
- Initial `test/bazaarReviewTerminology.test.js`: 3 total, 1 pass, 2 expected fail. It caught current documents that still named removed routes and the unfinished command/export terminology migration.
- First full-suite run after the consolidation: 697 total, 696 pass, 1 fail. The existing Command Palette policy caught category text duplicated inside the command title; the manifest now composes the exact visible label from category `Bob Bazaar Review` and title `レビューを開始`.
- Independent review follow-up: the two controller regressions failed as expected for dropped dashboard campaign input and acceptance of an old same-stage render token; the two dashboard behavior regressions failed as expected for stale refresh overwrite and inactive export side effects; the expanded current-document terminology contract also failed on the two omitted v3 documents.
- Post-closure audit targeted run: 19 total, 17 pass, 2 expected fail. The failures listed all six operator-facing `Dashboard` lines in the real-machine specification and rejected the generated Human Triage client with `Invalid or unexpected token`.
- Mutation check for campaign precedence: changing the actual stage factory to request-first made the dedicated active-Review-Run precedence test fail 0/1; the production expression was restored and its exact source diff returned to zero.
- Mutation check for in-stage render ownership: replacing `host.nextRenderToken()` with a fixed dashboard token made the dedicated rotation test fail 0/1; the production expression was restored and its exact source diff returned to zero.

## GREEN verification

- Compile: PASS.
- Final lifecycle suite (`test/reviewGuiLifecycle.test.js`): 12/12 PASS.
- Final post-closure targeted command: `node --test test/bazaarReviewTerminology.test.js test/campaignDashboardGui.test.js test/guiFirstSurfaces.test.js`; 19/19 PASS.
- Final Review Run/dashboard focused command: `node --test test/bazaarReviewTerminology.test.js test/campaignDashboard*.test.js test/guiFirstSurfaces.test.js test/reviewGui*.test.js test/reviewRun*.test.js`; 98/98 PASS.
- Final `npm test`: 706/706 PASS, 0 fail, 0 skip.
- Architecture policy: PASS, 113 TypeScript files checked.
- Source export-star policy: PASS, 113 TypeScript files checked.
- Dependency policy: 6/6 PASS.
- Unused dependency/source policy: PASS.
- Artifact size policy: PASS, 20 template files within the 12,000-byte per-file budget.
- Package: PASS; VSIX created with 1,841 entries.
- VSIX policy: PASS at 3,771,906 bytes (12,000,000-byte budget; 31.4% used).
- Package smoke: 2/2 PASS.
- `git diff --check`: PASS.
- Exact old-route scan across the manifest, live source, README, and current extension docs: zero matches.
- Exact real-machine operator-facing `Dashboard` scan: zero matches; persisted `dashboard.json` and internal model names remain unchanged.
- The generated main, result-capture, Human Triage, and review-results clients all parse as JavaScript and expose no direct outbound `postMessage` path around their render-token wrapper; main-stage `ready` uses the same wrapper.
- Exactly one `createWebviewPanel` remains across the four Bazaar review-stage controller modules.

The Bazaar package has no separate `schema:policy` script. Schema and artifact compatibility remained covered by the full suite, Review Run acceptance tests, dashboard/capture tests, and the explicit persisted-field terminology regression.

## Self-review

- Reviewed the full `bc24c80..e2c3fd9` source, test, manifest, UI, and current-document diff.
- Confirmed the run engine, provider contracts, Review Run schemas, persisted artifacts, and `run.json` contracts were not changed.
- Confirmed all removed GUI command IDs are absent from live product/current-document surfaces while non-GUI workflow and record commands remain registered.
- Confirmed every embedded renderer emits namespaced, render-token-bound messages and origin-bound stage navigation.
- Confirmed stale stage services and stale main-stage operations cannot update the current UI or host Review Run model.
- Confirmed campaign selection uses active Review Run, then an explicit request, then the first available campaign, and that the direct behavior test detects request-first ordering.
- Confirmed each in-stage dashboard render obtains a new token and the direct behavior test detects a fixed-token implementation.
- Confirmed all four generated review clients parse and all outbound messages, including main-stage `ready`, use the render-token wrapper.
- Confirmed canonical command category/title and current instructions agree exactly.
- No unresolved implementation concerns remained after the post-closure audit fixes. Final independent specification and quality re-reviews both approved the final product with Critical 0 / Important 0 / Minor 0.

## Environment notes

- npm prints its existing `http-proxy` deprecation and version notices.
- `vsce` prints the existing bundle/file-count recommendation; the package remains within policy.
- The optional `npm run audit:prod` check reports two existing high-severity `fast-uri` advisories through `ajv`, both marked by npm as having no fix available. Task 3 did not change dependencies or the lockfile; all five package policy gates and package smoke pass.

## Independent review history and remediation closure

- The earlier `bc24c80..929f3de` review recorded `SPEC_COMPLIANT` and `CODE_QUALITY_APPROVED`, both Critical 0 / Important 0 / Minor 0.
- A subsequent read-only audit invalidated that closure with Critical 0 / Important 3 / Minor 1: six stale real-machine labels, missing direct active-run precedence evidence, an unparsable generated Human Triage client, and insufficient mutation-sensitive render-token coverage.
- Product follow-up `e2c3fd9` closes those four areas with the terminology regression, direct three-level campaign-precedence behavior, generated-client syntax/ownership checks, and in-stage token-rotation behavior.
- Final independent re-approval after `e2c3fd9`: `SPEC_COMPLIANT` and `CODE_QUALITY_APPROVED`, both Critical 0 / Important 0 / Minor 0. The specification reviewer passed fresh compile, focused 55/55, and runtime probes 6/6; the quality reviewer passed fresh compile, focused 98/98, range diff-check, and route/listener/contract scans.
