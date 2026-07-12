# Bob Bazaar Review Run Wizard v3 Iteration 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 中断したReview Runの再開、phase status表示、decision別validation、timing収集・補正、record/summary一括finalize、legacy artifact復旧を追加する。

**Architecture:** Iteration 1の`ReviewRunContext`と既存artifact配置を維持し、optionalなprogress・metrics・issuesを`review-run.json`へ追加する。VS Code非依存の`reviewRunMetrics.ts`、`reviewRunRecovery.ts`、`reviewRunFinalize.ts`を追加し、GUIはcoordinator経由で既存record/triage/summary serviceへ接続する。

**Tech Stack:** TypeScript 5.4、VS Code Extension API 1.106、Node.js `fs/promises`、`node:test`、既存`js-yaml`依存。

## Global Constraints

- `REVIEW_RUN_SCHEMA_VERSION`は`bazaar-review-run/v1`のまま維持し、Iteration 1 artifactを読み込めること。
- 既存command ID、workflow action provider ID、review-result/triage/record/summary artifact pathを変更しないこと。
- Review Runの新規fieldは旧artifactに対してdefaultを補完し、破壊的migrationを要求しないこと。
- Review Runの更新は最新`updatedAt`を読み直し、同一process内でrun単位に直列化すること。
- artifact pathはworkspace containment、realpath、symlink/junction拒否を維持すること。
- Human Triageは必須の人間ゲートであり、自動採否を追加しないこと。
- 新規runtime dependencyを追加しないこと。
- WebviewはCSP nonce、host側message allowlist、inline handler禁止を維持すること。

---

### Task 1: Progress and metrics domain

**Files:**
- Modify: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunTypes.ts`
- Modify: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunState.ts`
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunMetrics.ts`
- Modify: `extensions/bob-bazaar-review/test/reviewRunState.test.js`
- Create: `extensions/bob-bazaar-review/test/reviewRunMetrics.test.js`

**Interfaces:**
- Produces: `ReviewRunTrackedPhase`, `ReviewRunPhaseStatus`, `ReviewRunPhaseProgress`, `ReviewRunMetrics`, `ReviewRunIssue`。
- Produces: `normalizeReviewRunContext(context)`, `setReviewRunPhaseProgress(context, input)`。
- Produces: `startBobReviewTimer`, `completeBobReviewTimer`, `startHumanTriageTimer`, `completeHumanTriageTimer`, `correctReviewRunMetrics`, `reviewRunMetricsToRecordMetrics`。

- [ ] **Step 1: Add failing progress tests**

```js
const run = createReviewRunContext({
  workspaceRoot: "/workspace",
  campaignId: "campaign-1",
  reviewId: "review-1",
  target: { mode: "singleRevision", repositoryRoot: "/workspace", revision: "1" },
  now: "2026-07-12T00:00:00.000Z"
})
assert.equal(run.status, "in_progress")
assert.equal(run.phases.target.status, "completed")
assert.equal(run.phases.packet.status, "not_started")
```

Also prove that completed packet/result/triage/record/summary phases require their artifact paths and that overall completion requires all mandatory phases completed.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="Review Run progress"`

Expected: FAIL because progress types and reducer functions do not exist.

- [ ] **Step 3: Implement backward-compatible progress defaults**

`normalizeReviewRunContext()` must derive progress from the existing top-level `phase` and artifact paths. Iteration 1 runs with a triage path are normalized as `triage.in_progress`, not automatically accepted as valid triage.

- [ ] **Step 4: Add failing metrics tests**

```js
let metrics = startBobReviewTimer(defaultReviewRunMetrics(), "2026-07-12T00:00:00.000Z")
metrics = completeBobReviewTimer(metrics, "2026-07-12T00:02:30.000Z")
assert.equal(metrics.bobReviewSeconds, 150)
assert.equal(reviewRunMetricsToRecordMetrics(metrics, summary, 2).bob_review_minutes, 2.5)
```

Cover correction, one-decimal minute conversion, negative/NaN/Infinity rejection, and values above 30 days.

- [ ] **Step 5: Implement metrics helpers and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="Review Run progress|Review Run metrics"`

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunTypes.ts \
  extensions/bob-bazaar-review/src/reviewRuns/reviewRunState.ts \
  extensions/bob-bazaar-review/src/reviewRuns/reviewRunMetrics.ts \
  extensions/bob-bazaar-review/test/reviewRunState.test.js \
  extensions/bob-bazaar-review/test/reviewRunMetrics.test.js
git commit -m "feat: track Review Run progress and metrics"
```

### Task 2: Stale-write protection and incomplete-run listing

**Files:**
- Modify: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunStore.ts`
- Modify: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts`
- Modify: `extensions/bob-bazaar-review/test/reviewRunStore.test.js`
- Modify: `extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js`

**Interfaces:**
- Produces: `writeReviewRun(context, { expectedUpdatedAt? })`。
- Produces: `listReviewRuns(workspaceRoot)` returning normalized contexts sorted by `updatedAt` descending。
- Produces: coordinator-internal `mutateReviewRun(context, updater)` with a run-keyed Promise queue。

- [ ] **Step 1: Add failing stale-write tests**

Read the same run twice, write one update, then require the second update to reject with `Review Run changed since it was loaded` while preserving the first update.

- [ ] **Step 2: Add failing list tests**

Create completed and incomplete runs across two campaigns. Require `listReviewRuns()` to skip `_template`, reject/skip symlinked entries, normalize Iteration 1 JSON, and sort newest first.

- [ ] **Step 3: Implement conditional atomic replacement**

Before replacement, compare the persisted `updatedAt` with `expectedUpdatedAt`. Keep the existing temporary-file cleanup and Windows replacement fallback.

- [ ] **Step 4: Route coordinator updates through the run queue**

`recordReviewPacket`, `recordReviewResult`, `recordTriageDraft`, later triage completion and finalize calls must reload the latest run before applying their pure update.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="Review Run.*stale|Review Run.*list|Review Run.*coordinator"`

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunStore.ts \
  extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts \
  extensions/bob-bazaar-review/test/reviewRunStore.test.js \
  extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js
git commit -m "feat: serialize and list Review Runs"
```

### Task 3: Decision-specific Human Triage validation

**Files:**
- Modify: `extensions/bob-bazaar-review/src/records/reviewTriage.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/test/reviewRecordsCore.test.js`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`

**Interfaces:**
- Preserves: `validateTriage(triage, reviewResult): string[]`。
- Enforces:
  - `accepted`: `owner`または`action`
  - `rejected`: `reason`
  - `needs_investigation`: `owner`と`action`
  - `deferred`: `reason`

- [ ] **Step 1: Add failing domain tests**

Create one item for each decision and prove missing required fields fail with the exact item path. Prove valid combinations pass.

- [ ] **Step 2: Implement domain validation**

Keep finding coverage, duplicate ID, review ID, and summary validation unchanged.

- [ ] **Step 3: Add client-side contract checks**

Before posting `saveDecisions` or `finalizeReviewRun`, validate visible rows and show a row-specific message. Host-side validation remains authoritative.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="triage decision|human triage GUI"`

- [ ] **Step 5: Commit**

```bash
git add extensions/bob-bazaar-review/src/records/reviewTriage.ts \
  extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts \
  extensions/bob-bazaar-review/test/reviewRecordsCore.test.js \
  extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js
git commit -m "feat: enforce Review Run triage decisions"
```

### Task 4: Triage completion, metric correction, and one-click finalize

**Files:**
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunFinalize.ts`
- Modify: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts`
- Create: `extensions/bob-bazaar-review/test/reviewRunFinalize.test.js`
- Modify: `extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`

**Interfaces:**
- Produces: `recordTriageCompleted(context, triagePath)`。
- Produces: `correctActiveReviewRunMetrics(context, correction)`。
- Produces: `finalizeReviewRun(context): Promise<ReviewRunFinalizeResult>`。
- `ReviewRunFinalizeResult` contains completed context, record path, summary JSON/Markdown paths, and validation issues.

- [ ] **Step 1: Add failing finalize round-trip test**

Seed packet, valid review-result JSON/Markdown, and valid triage. Start automatic timers, apply a baseline correction, finalize, then assert:

```js
assert.equal(result.context.status, "completed")
assert.equal(result.context.phase, "completed")
assert.equal(result.context.phases.record.status, "completed")
assert.equal(result.context.phases.summary.status, "completed")
assert.equal(record.metrics.bob_review_minutes > 0, true)
assert.equal(record.metrics.human_triage_minutes > 0, true)
```

- [ ] **Step 2: Implement pure finalize service**

Read artifacts through workspace-relative resolvers, validate triage, build the existing `ReviewRecord` schema, write and validate `record.yaml`, regenerate campaign summary, and return paths. Do not import `vscode` from this module.

- [ ] **Step 3: Update Human Triage flow**

After valid decision save, mark triage completed and stop the automatic triage timer. Add baseline/Bob/triage minute inputs, a metrics-save action, and `Review Runを完了して集計`.

- [ ] **Step 4: Preserve successful phases on failure**

If record creation fails, record a retryable `record` issue without deleting triage. If summary generation fails, preserve `record.yaml`, mark only summary failed, and permit retry.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="Review Run finalize|Review Run triage completion|Human Triage"`

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunFinalize.ts \
  extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts \
  extensions/bob-bazaar-review/src/ui/humanTriageGui.ts \
  extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts \
  extensions/bob-bazaar-review/test/reviewRunFinalize.test.js \
  extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js \
  extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js
git commit -m "feat: finalize Review Runs with measured metrics"
```

### Task 5: Resume model and Review GUI status

**Files:**
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunResume.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts`
- Create: `extensions/bob-bazaar-review/test/reviewRunResume.test.js`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`

**Interfaces:**
- Produces: `ReviewRunResumeAction = "review" | "resultCapture" | "humanTriage" | "finalize" | "none"`。
- Produces: `buildReviewRunResumeCandidate(context)` and `nextReviewRunAction(context)`。

- [ ] **Step 1: Add failing resume-action tests**

Cover target-only, packet-complete, result-complete, triage-complete, record-complete, and completed states.

- [ ] **Step 2: Implement resume model**

The model must use phase status plus required artifacts, not only the top-level phase string.

- [ ] **Step 3: Add Review GUI controls**

Render an incomplete-run selector, refresh button, resume button, six phase statuses, next action, metrics, issues, and artifact paths. The webview posts only explicit allowlisted message types.

- [ ] **Step 4: Implement host routing**

On refresh, call `listReviewRuns()`. On resume, re-read the selected run and route to Result Capture, Human Triage, or Human Triage finalize state. Target-only runs remain selected in Review GUI with their stored target displayed.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="Review Run resume|Review Run Wizard v3"`

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunResume.ts \
  extensions/bob-bazaar-review/src/ui/reviewGui.ts \
  extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts \
  extensions/bob-bazaar-review/test/reviewRunResume.test.js \
  extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js
git commit -m "feat: resume incomplete Review Runs"
```

### Task 6: Legacy artifact recovery

**Files:**
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunRecovery.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts`
- Create: `extensions/bob-bazaar-review/test/reviewRunRecovery.test.js`
- Modify: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`

**Interfaces:**
- Produces: `listLegacyReviewCandidates(workspaceRoot)`。
- Produces: `previewLegacyReviewRecovery(workspaceRoot, candidate)`。
- Produces: `recoverLegacyReviewRun(preview)`。

- [ ] **Step 1: Add failing recovery matrix tests**

Cover result only, result+packet+triage, record present, mismatched artifact review ID, multiple campaign candidates, and an existing `review-run.json`.

- [ ] **Step 2: Implement non-destructive preview**

Infer target and artifact paths without writing. Mark ambiguous campaign selection and identity mismatch as blocking issues.

- [ ] **Step 3: Implement confirmed recovery**

Write only `review-run.json`; do not rename, overwrite, or rewrite packet/result/triage/record artifacts.

- [ ] **Step 4: Add Review GUI confirmation flow**

Use host-side QuickPick and a modal warning. Recovery proceeds only after explicit confirmation and displays the resulting active run.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm test -- --test-name-pattern="Review Run recovery|legacy recovery"`

- [ ] **Step 6: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunRecovery.ts \
  extensions/bob-bazaar-review/src/ui/reviewGui.ts \
  extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts \
  extensions/bob-bazaar-review/test/reviewRunRecovery.test.js \
  extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js
git commit -m "feat: recover legacy Bazaar review artifacts"
```

### Task 7: Documentation and regression gate

**Files:**
- Create: `extensions/bob-bazaar-review/docs/review-run-v3-iteration2-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/README-ja.md`
- Modify: `extensions/bob-bazaar-review/README.md`
- Modify: `extensions/bob-bazaar-review/docs/unit-test-spec-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md`

- [ ] **Step 1: Document the implemented contracts**

Document optional v1 progress/metrics fields, stale-write behavior, resume routing, decision validation, correction limits, finalize order, failure retry, and recovery confirmation.

- [ ] **Step 2: Run the complete extension gate**

```powershell
cd extensions\bob-bazaar-review
npm.cmd test
npm.cmd run architecture:policy
npm.cmd run source:policy
npm.cmd run unused:policy
npm.cmd run artifact:policy
npm.cmd run audit:prod
npm.cmd run package
npm.cmd run package:policy
npm.cmd run package:metrics
```

Expected: every command exits with code 0 and the VSIX remains within 350000 bytes.

- [ ] **Step 3: Verify the stacked diff**

Compare `agent/bob-bazaar-review-review-run-v3-plan...agent/bob-bazaar-review-review-run-v3-iteration2`. Confirm no runtime dependency additions, command ID changes, workflow provider changes, or unrelated files.

- [ ] **Step 4: Commit**

```bash
git add extensions/bob-bazaar-review/README.md \
  extensions/bob-bazaar-review/docs
git commit -m "docs: document Review Run iteration 2"
```

## Plan Self-Review

- Spec coverage: incomplete-run listing, resume routing, phase status, decision validation, metrics, finalize, retry behavior, and legacy recovery each map to a task.
- Compatibility: schema version, command IDs, provider IDs, and existing artifact locations remain unchanged.
- Security: workspace containment, realpath checks, symlink rejection, action allowlists, and human gate remain mandatory.
- Type consistency: progress, metrics, resume, recovery, and finalize APIs use the same `ReviewRunContext` and `ReviewRunCommandInput` contracts.
- Scope: Campaign Dashboard remains Iteration 3 and is not implemented here.
