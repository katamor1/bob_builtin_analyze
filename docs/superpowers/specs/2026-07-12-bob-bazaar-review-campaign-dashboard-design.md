# Bob Bazaar Review Campaign Dashboard Design

**Date:** 2026-07-12  
**Status:** Approved continuation of Review Run Wizard v3 plan  
**Scope:** Iteration 3 — Campaign Dashboard

## 1. Goal

Review Run Wizard v3 Iteration 1 and 2 produced durable Review Run, review-result, Human Triage, record, metrics, and campaign summary artifacts. Iteration 3 turns those artifacts into a campaign-level operational dashboard that answers:

- Which Review Runs are complete, in progress, failed, or waiting for Human Triage?
- How often did schema validation succeed?
- How were findings accepted, rejected, deferred, or left under investigation?
- Which project rules produce findings, and which of those findings are accepted?
- How do results differ by Review Run target mode?
- How much review and triage time was recorded, and how much time was estimated to be saved?
- Can the same source-backed view be exported as JSON, Markdown, and CSV?

Campaign Dashboard is read-only with respect to review evidence. It may write derived dashboard export artifacts only.

## 2. Existing constraints

- Keep `bazaar-review-run/v1`, `bazaar-review-record/v1`, and `bazaar-review-triage/v1` unchanged.
- Keep existing command IDs, workflow provider IDs, and artifact paths unchanged.
- Keep existing campaign `summary.json` and `summary.md` contract unchanged.
- Add no runtime dependency.
- Preserve workspace containment, realpath checks, symlink/junction rejection, CSP nonce, and Webview host-side message allowlists.
- Human Triage remains the source of truth for finding decisions.
- Missing or malformed evidence must produce warnings rather than fabricated values.

## 3. Considered approaches

### A. Extend the existing campaign summary

Add every dashboard field to `CampaignSummary` and render the existing summary Markdown in a Webview.

**Advantages:** small number of new modules.  
**Disadvantages:** breaks the deliberately compact summary contract, mixes operational status with historical aggregation, and makes CSV/rule trends awkward.

### B. Build the dashboard entirely in the Webview

Send raw Review Run, record, triage, and review-result artifacts to the browser and aggregate in JavaScript.

**Advantages:** fast UI experimentation.  
**Disadvantages:** duplicates domain rules, sends more evidence into the Webview, weakens testability, and makes export behavior harder to keep consistent.

### C. Add a pure dashboard aggregation service and thin Webview

Create a VS Code-independent analytics module that reads normalized evidence into a typed `CampaignDashboard`, plus render/export helpers and a thin host-side controller.

**Advantages:** explicit denominators, deterministic exports, strong unit tests, no raw filesystem access from the Webview, and no change to existing summary artifacts.  
**Disadvantages:** more modules than approach A.

**Decision:** Use approach C.

## 4. Artifact contract

Derived exports live beside the existing campaign summary:

```text
.bob-review-records/
  campaigns/
    <campaign_id>/
      dashboard.json
      dashboard.md
      dashboard.csv
      summary.json
      summary.md
      records/
        <review_id>/
          review-run.json
          record.yaml
          triage.yaml
```

Dashboard JSON schema identifier:

```text
bazaar-campaign-dashboard/v1
```

The dashboard export is reproducible from source artifacts. It is not a new source of truth and may be regenerated at any time.

## 5. Data sources and precedence

For a selected campaign:

1. `review-run.json` supplies run status, phase status, target mode, timestamps, issues, and Review Run metrics.
2. `record.yaml` supplies validated quality-gate and finalized record metrics.
3. `triage.yaml` supplies finding decisions and rule IDs.
4. review-result JSON is read only when needed to enrich rule titles or verify source counts.
5. Existing campaign summary may be compared for diagnostics but is not used as the dashboard source of truth.

Precedence rules:

- Human Triage decision counts come from `triage.yaml`.
- Finalized time metrics prefer `record.yaml`; an incomplete run may display Review Run metrics as provisional.
- A record with `quality_gate.schema_valid === true` counts as schema-valid.
- A Review Run without a valid triage artifact appears in `triage_pending` and contributes no accepted/rejected decisions.
- Malformed or missing artifacts generate data-quality warnings with campaign/review identity.

## 6. Rate definitions

All rates are represented as numbers from `0` to `1`, rounded to four decimal places in JSON and displayed as percentages in the UI/Markdown.

- `schema_validation_rate = schema_valid_records / records_total`
- `finding_acceptance_rate = accepted / findings_total`
- `finding_rejection_rate = rejected / findings_total`
- `finding_resolution_rate = (accepted + rejected) / findings_total`
- Rule acceptance/rejection rates use that rule's `detected_count` as the denominator.

When the denominator is zero, the rate is `null`, not zero. This distinguishes “no evidence” from “0%”.

## 7. Change-type definition

For dashboard v1, `change_type` means the Review Run target mode:

- `singleRevision`
- `revisionRange`
- `workingTreeSinceRevision`

The dashboard does not infer source/test/docs categories from file names because Review Run v1 does not persist a complete, normalized changed-file manifest. A future schema may add file-level change categories explicitly.

## 8. Dashboard model

```ts
interface CampaignDashboard {
  schema_version: "bazaar-campaign-dashboard/v1"
  campaign_id: string
  generated_at: string
  overview: {
    review_runs_total: number
    completed_runs: number
    in_progress_runs: number
    failed_or_blocked_runs: number
    records_total: number
    triage_pending: number
    schema_valid_records: number
    schema_invalid_records: number
    schema_validation_rate: number | null
    findings_total: number
    findings_accepted: number
    findings_rejected: number
    findings_needs_investigation: number
    findings_deferred: number
    finding_acceptance_rate: number | null
    finding_rejection_rate: number | null
    finding_resolution_rate: number | null
    baseline_review_minutes_total: number
    bob_review_minutes_total: number
    human_triage_minutes_total: number
    estimated_minutes_saved: number
  }
  runs: CampaignDashboardRun[]
  triage_pending: CampaignDashboardRun[]
  rule_trends: CampaignDashboardRuleTrend[]
  change_type_trends: CampaignDashboardChangeTypeTrend[]
  warnings: CampaignDashboardWarning[]
}
```

`runs` is sorted by `updated_at` descending. `rule_trends` is sorted by detected count descending and then rule ID. `change_type_trends` uses the fixed target-mode order.

## 9. UI

Add command:

```text
bobBazaar.openCampaignDashboard
```

The Review GUI gains an `Campaign Dashboardを開く` action. The dashboard Webview contains:

- campaign selector and refresh action
- overview KPI cards
- Review Run table with status, target mode, next action, updated time, and issue count
- Human Triage pending table
- rule trend table
- change-type trend table
- time totals
- data-quality warnings
- export action for JSON, Markdown, and CSV

No charting library is added. Compact CSS bars may supplement numeric labels, but tables and text remain complete without color or graphics.

## 10. Export behavior

`Export` regenerates all three formats from the same in-memory model:

- JSON: complete typed model
- Markdown: answer-first summary plus tables
- CSV: a single normalized table with a `section` column (`overview`, `run`, `triage_pending`, `rule_trend`, `change_type_trend`, `warning`)

CSV fields use RFC 4180 escaping and UTF-8 with a header row. The exporter never embeds raw packet, source diff, or full finding descriptions.

## 11. Error handling

- Missing campaign directory: show an empty dashboard with a warning.
- Malformed Review Run: exclude it from run metrics and add a warning when its directory can be identified.
- Missing record: keep the run in the run list and mark finalized metrics unavailable.
- Missing/invalid triage: keep the run in `triage_pending`; do not synthesize decisions.
- Review/result identity mismatch: exclude the conflicting artifact from analytics and add a warning.
- Export failure: preserve the displayed model and report the failed output path; do not delete prior exports.

## 12. Modules

```text
src/dashboard/
  campaignDashboardTypes.ts
  campaignDashboard.ts
  campaignDashboardExport.ts
src/ui/
  campaignDashboardGui.ts
  campaignDashboardGuiHtml.ts
```

- `campaignDashboard.ts`: pure aggregation orchestration and filesystem-safe reads.
- `campaignDashboardExport.ts`: JSON/Markdown/CSV rendering and atomic writes.
- `campaignDashboardGui.ts`: workspace/campaign selection, refresh, export, and Webview message allowlist.
- `campaignDashboardGuiHtml.ts`: CSP-safe presentation only.

`extension.ts` remains command registration and dependency wiring.

## 13. Testing

Unit tests cover:

- empty campaign
- complete and incomplete runs
- triage-pending detection
- schema rate and zero-denominator `null`
- accepted/rejected/resolution rates
- rule trend aggregation and sorting
- target-mode trend aggregation
- finalized versus provisional metrics
- malformed/missing artifact warnings
- JSON/Markdown/CSV consistency and CSV escaping
- workspace containment and symlink exclusion

GUI contract tests cover:

- command registration
- CSP nonce
- no inline handlers
- fixed action allowlist
- campaign identity rendered via escaped text
- refresh and export messages

Regression gates remain the existing dependency, architecture, source, unused, artifact, audit, unit-test, package, VSIX policy, and VSIX metrics checks.

## 14. Acceptance criteria

1. A campaign can be selected and refreshed without modifying review evidence.
2. All Review Runs in the campaign are listed with status and target mode.
3. Triage-pending runs are explicit and never counted as accepted/rejected.
4. Schema, finding, rule, target-mode, and time metrics use documented denominators.
5. Missing evidence is visible as warnings.
6. JSON, Markdown, and CSV exports are generated from the same model.
7. Existing summary artifacts and public command IDs remain compatible.
8. No runtime dependency is added.
9. Full `bob-bazaar-review` quality gates pass.

## 15. Self-review

- No placeholders or TBD items remain.
- `change_type` is explicitly defined rather than inferred ambiguously.
- Existing summary and Review Run schemas remain unchanged.
- Dashboard artifacts are derived and independently regenerable.
- Rates distinguish zero denominators with `null`.
- Scope excludes cross-campaign and organization-wide analytics; those remain future work.
