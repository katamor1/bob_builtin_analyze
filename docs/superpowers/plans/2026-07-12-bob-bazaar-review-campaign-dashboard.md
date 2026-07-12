# Bob Bazaar Review Campaign Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a source-backed campaign dashboard for Review Runs with triage status, schema/finding/rule/target-mode/time metrics, and JSON/Markdown/CSV exports.

**Architecture:** Add a typed dashboard domain under `src/dashboard/`, keep filesystem aggregation and export rendering VS Code-independent, and expose it through a thin CSP-safe Webview controller. Existing `summary.json/md`, Review Run, record, triage, command, and workflow contracts remain unchanged.

**Tech Stack:** TypeScript 5.4, Node.js `fs/promises`, VS Code Extension API 1.106, existing `js-yaml`, `node:test`.

## Global Constraints

- Keep `bazaar-review-run/v1`, `bazaar-review-record/v1`, and `bazaar-review-triage/v1` unchanged.
- Keep existing command IDs, workflow provider IDs, and artifact paths unchanged.
- Keep existing campaign `summary.json` and `summary.md` unchanged.
- Add no runtime dependency.
- Preserve workspace containment, realpath checks, symlink/junction rejection, CSP nonce, and host-side Webview action allowlists.
- Human Triage is the source of truth for finding decisions.
- Missing or malformed evidence produces warnings; it never produces fabricated metrics.
- Dashboard rates use documented denominators and return `null` for zero denominators.
- Dashboard v1 change type is Review Run target mode.

---

### Task 1: Typed dashboard model and pure aggregation

**Files:**
- Create: `extensions/bob-bazaar-review/src/dashboard/campaignDashboardTypes.ts`
- Create: `extensions/bob-bazaar-review/src/dashboard/campaignDashboardCore.ts`
- Create: `extensions/bob-bazaar-review/test/campaignDashboardCore.test.js`

**Interfaces:**
- Produces: `CAMPAIGN_DASHBOARD_SCHEMA_VERSION`.
- Produces: `CampaignDashboard`, `CampaignDashboardRun`, `CampaignDashboardRuleTrend`, `CampaignDashboardChangeTypeTrend`, `CampaignDashboardWarning`.
- Produces: `buildCampaignDashboard(input: CampaignDashboardBuildInput): CampaignDashboard`.
- Consumes normalized evidence only; no filesystem or VS Code imports.

- [ ] **Step 1: Write failing overview/rate tests**

Create fixtures with two runs, two records, and valid triage. Assert:

```js
assert.equal(dashboard.overview.review_runs_total, 2)
assert.equal(dashboard.overview.completed_runs, 1)
assert.equal(dashboard.overview.schema_validation_rate, 0.5)
assert.equal(dashboard.overview.finding_acceptance_rate, 0.5)
assert.equal(dashboard.overview.finding_rejection_rate, 0.25)
assert.equal(dashboard.overview.finding_resolution_rate, 0.75)
```

Add an empty input case and require all zero-denominator rates to be `null`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardCore.test.js
```

Expected: compile/test failure because dashboard types and builder do not exist.

- [ ] **Step 3: Implement the minimal typed model and overview builder**

Define a `CampaignDashboardBuildInput` containing:

```ts
interface CampaignDashboardEvidence {
  run: ReviewRunContext
  record?: ReviewRecord
  recordPresent: boolean
  triage?: ReviewTriage
  triageValid: boolean
  ruleTitles: Record<string, string>
  warnings: CampaignDashboardWarning[]
}
```

Implement `safeRate(numerator, denominator)` returning `null` when the denominator is zero and otherwise a four-decimal number.

- [ ] **Step 4: Add failing rule and target-mode trend tests**

Require:

```js
assert.deepEqual(dashboard.rule_trends.map((item) => item.rule_id), ["RULE-1", "RULE-2"])
assert.equal(dashboard.rule_trends[0].detected_count, 3)
assert.equal(dashboard.change_type_trends[0].change_type, "singleRevision")
```

Also assert sorting: detected count descending then rule ID, and fixed target-mode order.

- [ ] **Step 5: Implement trends, run rows, pending triage, and warnings**

Use `nextReviewRunAction()` for run rows. Count decisions only from valid triage. Skip missing rule IDs from rule trends and add a warning. Prefer finalized record metrics; expose Review Run metrics as provisional on the run row when no record exists.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardCore.test.js
```

Expected: all dashboard core tests pass.

- [ ] **Step 7: Commit**

```bash
git add extensions/bob-bazaar-review/src/dashboard/campaignDashboardTypes.ts \
  extensions/bob-bazaar-review/src/dashboard/campaignDashboardCore.ts \
  extensions/bob-bazaar-review/test/campaignDashboardCore.test.js
git commit -m "feat: aggregate Bazaar campaign dashboard metrics"
```

### Task 2: Safe campaign evidence loader

**Files:**
- Create: `extensions/bob-bazaar-review/src/dashboard/campaignDashboard.ts`
- Create: `extensions/bob-bazaar-review/test/campaignDashboard.test.js`

**Interfaces:**
- Consumes: `buildCampaignDashboard()` and existing Review Run/record/triage path guards.
- Produces: `generateCampaignDashboard(workspaceRoot: string, campaignId: string, now?: string): Promise<CampaignDashboard>`.
- Produces: `listCampaignDashboardCampaigns(workspaceRoot: string): Promise<string[]>`.

- [ ] **Step 1: Write failing filesystem aggregation tests**

Create a temporary workspace with:

- one complete Review Run + record + triage + result
- one in-progress Review Run without triage
- one malformed record
- one symlinked record directory when the platform permits it

Assert the complete/in-progress run counts, pending triage list, malformed-record warning, and symlink exclusion.

- [ ] **Step 2: Verify RED**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboard.test.js
```

- [ ] **Step 3: Implement safe directory traversal**

Resolve `.bob-review-records/campaigns/<campaign_id>/records`, validate each campaign/review segment, use `lstat()` before entering a directory, reject symbolic links, and use existing `readReviewRun`, `readReviewRecord`, `readTriage`, `resolveWorkspaceRelativePath`, and `validateTriage` helpers.

- [ ] **Step 4: Add identity and missing-evidence tests**

Assert that mismatched review-result/triage IDs are excluded from decisions and produce warnings. Assert a missing campaign returns an empty dashboard with a warning rather than throwing.

- [ ] **Step 5: Implement evidence precedence and enrichment**

Read review-result JSON only through the run/record workspace-relative path. Build rule title lookup from `checklist_results[].rule_id/title` and `findings[].rule_id/title`. Do not include raw descriptions or packet text in the dashboard model.

- [ ] **Step 6: Verify GREEN**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboard.test.js
```

- [ ] **Step 7: Commit**

```bash
git add extensions/bob-bazaar-review/src/dashboard/campaignDashboard.ts \
  extensions/bob-bazaar-review/test/campaignDashboard.test.js
git commit -m "feat: load Bazaar campaign dashboard evidence"
```

### Task 3: JSON, Markdown, and CSV exports

**Files:**
- Create: `extensions/bob-bazaar-review/src/dashboard/campaignDashboardExport.ts`
- Create: `extensions/bob-bazaar-review/test/campaignDashboardExport.test.js`

**Interfaces:**
- Produces: `renderCampaignDashboardMarkdown(dashboard): string`.
- Produces: `renderCampaignDashboardCsv(dashboard): string`.
- Produces: `writeCampaignDashboardArtifacts(workspaceRoot, campaignId, dashboard): Promise<{ jsonPath; markdownPath; csvPath }>`.

- [ ] **Step 1: Write failing renderer consistency tests**

Require JSON, Markdown, and CSV to include the same campaign ID, overview totals, rule IDs, target modes, and warning messages. Add commas, quotes, and newlines to warning fixtures and assert RFC 4180 escaping.

- [ ] **Step 2: Verify RED**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardExport.test.js
```

- [ ] **Step 3: Implement answer-first Markdown and normalized CSV**

Markdown starts with overview KPI tables, followed by pending triage, runs, rule trends, target-mode trends, time totals, and warnings. CSV header:

```text
section,campaign_id,review_id,rule_id,change_type,status,next_action,updated_at,metric,value,accepted,rejected,needs_investigation,deferred,baseline_review_minutes,bob_review_minutes,human_triage_minutes,estimated_minutes_saved,message
```

- [ ] **Step 4: Implement atomic artifact writes**

Write temporary files in the campaign directory and rename them to `dashboard.json`, `dashboard.md`, and `dashboard.csv`. On failure, delete temporary files and preserve prior exports.

- [ ] **Step 5: Verify GREEN**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardExport.test.js
```

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/dashboard/campaignDashboardExport.ts \
  extensions/bob-bazaar-review/test/campaignDashboardExport.test.js
git commit -m "feat: export Bazaar campaign dashboards"
```

### Task 4: Campaign Dashboard Webview

**Files:**
- Create: `extensions/bob-bazaar-review/src/ui/campaignDashboardGui.ts`
- Create: `extensions/bob-bazaar-review/src/ui/campaignDashboardGuiHtml.ts`
- Create: `extensions/bob-bazaar-review/test/campaignDashboardGui.test.js`

**Interfaces:**
- Produces: `CampaignDashboardCommandInput { workspaceRoot?: string; campaignId?: string }`.
- Produces: `openBazaarCampaignDashboardGui(context, input?)`.
- Consumes: campaign list, dashboard generator, and export writer.

- [ ] **Step 1: Write failing GUI contract tests**

Assert rendered HTML contains overview, run, pending triage, rule trend, target-mode, time, warning, refresh, and export surfaces. Assert CSP nonce, no inline handler, escaped campaign/warning text, and explicit actions `refresh`, `selectCampaign`, `export`.

- [ ] **Step 2: Verify RED**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardGui.test.js
```

- [ ] **Step 3: Implement a thin controller**

Resolve an open Bob workspace, validate optional command input against open workspace roots, list campaigns, load the selected campaign, and re-render after refresh/select. The host accepts only:

```ts
"campaignDashboard.refresh"
"campaignDashboard.selectCampaign"
"campaignDashboard.export"
```

- [ ] **Step 4: Implement accessible HTML**

Use KPI cards and complete HTML tables. CSS bars are decorative only and use numeric text labels. Render dates and rates as text. Keep all evidence escaped.

- [ ] **Step 5: Implement export feedback**

After export, post the JSON/Markdown/CSV paths to the status region and show a VS Code information message. Export errors do not clear the current dashboard.

- [ ] **Step 6: Verify GREEN**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardGui.test.js
```

- [ ] **Step 7: Commit**

```bash
git add extensions/bob-bazaar-review/src/ui/campaignDashboardGui.ts \
  extensions/bob-bazaar-review/src/ui/campaignDashboardGuiHtml.ts \
  extensions/bob-bazaar-review/test/campaignDashboardGui.test.js
git commit -m "feat: add Bazaar campaign dashboard GUI"
```

### Task 5: Command and Review GUI integration

**Files:**
- Modify: `extensions/bob-bazaar-review/src/extension.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts`
- Modify: `extensions/bob-bazaar-review/package.json`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-bazaar-review/test/dependencyPolicy.test.js`

**Interfaces:**
- Adds command: `bobBazaar.openCampaignDashboard`.
- Review GUI passes current Review Run workspace/campaign when available, otherwise the selected workspace and campaign input.

- [ ] **Step 1: Add failing registration and Review GUI tests**

Assert activation event, contributed command, command palette menu, extension registration, dashboard button, and explicit Review GUI message routing.

- [ ] **Step 2: Verify RED**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/guiFirstSurfaces.test.js test/dependencyPolicy.test.js
```

- [ ] **Step 3: Register and expose the command**

Add the activation/contribution/menu entries and import/register `openBazaarCampaignDashboardGui` in `extension.ts`.

- [ ] **Step 4: Add Review GUI dashboard action**

Add `Campaign Dashboardを開く` and route only the fixed `openCampaignDashboard` message. Pass `workspaceRoot` and `campaignId`; never accept an arbitrary command ID from the Webview.

- [ ] **Step 5: Verify GREEN and all GUI contracts**

```bash
cd extensions/bob-bazaar-review
npm run compile
node --test test/campaignDashboardGui.test.js test/guiFirstSurfaces.test.js test/dependencyPolicy.test.js
```

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/extension.ts \
  extensions/bob-bazaar-review/src/ui/reviewGui.ts \
  extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts \
  extensions/bob-bazaar-review/package.json \
  extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js \
  extensions/bob-bazaar-review/test/dependencyPolicy.test.js
git commit -m "feat: integrate Bazaar campaign dashboard"
```

### Task 6: Documentation and full regression gate

**Files:**
- Create: `extensions/bob-bazaar-review/docs/review-run-v3-iteration3-dashboard-ja.md`
- Modify: `extensions/bob-bazaar-review/README.md`
- Modify: `extensions/bob-bazaar-review/docs/README-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/unit-test-spec-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md`

- [ ] **Step 1: Document dashboard contracts**

Document the command, source precedence, exact rate denominators, `null` zero denominators, target-mode change type, pending triage behavior, warnings, and export locations.

- [ ] **Step 2: Add UAT cases**

Add real-machine cases for dashboard open/refresh, pending triage visibility, rate verification, rule/target-mode trends, exports, malformed evidence warnings, and evidence immutability.

- [ ] **Step 3: Run the complete extension gate**

```bash
cd extensions/bob-bazaar-review
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run artifact:policy
npm run audit:prod
npm run package
npm run package:policy
npm run package:metrics
```

Expected: every command exits with status 0 and the VSIX remains at or below 350000 bytes.

- [ ] **Step 4: Verify stacked diff**

Compare:

```text
agent/bob-bazaar-review-review-run-v3-iteration2...
agent/bob-bazaar-review-review-run-v3-iteration3
```

Confirm changes are limited to the Iteration 3 spec/plan, dashboard implementation/tests/docs, command registration, and Review GUI integration. Confirm no runtime dependency, workflow provider, existing command ID, schema version, or existing artifact path changes.

- [ ] **Step 5: Commit documentation**

```bash
git add extensions/bob-bazaar-review/README.md \
  extensions/bob-bazaar-review/docs
git commit -m "docs: document Bazaar campaign dashboard"
```

## Plan self-review

- Spec coverage: run list, pending triage, schema/finding/rule/target-mode/time metrics, warnings, UI, and three exports each map to a task.
- Placeholder scan: no TBD/TODO/incomplete implementation steps remain.
- Type consistency: all tasks use `CampaignDashboard`, `CampaignDashboardBuildInput`, `generateCampaignDashboard`, and `writeCampaignDashboardArtifacts` consistently.
- Scope: cross-campaign and organization-wide analytics are intentionally excluded.
