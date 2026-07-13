# Workflow Reused / Skipped Provenance P1-3 Implementation Plan

**実行状況（2026-07-13）:** Task 1〜5 implemented and focused GREEN. Task 6 final cross-platform verification pending.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Surface artifact-reused and skipped workflow steps consistently without changing persisted run or step status schemas.

**Architecture:** Add one pure projector over existing `run.state` provenance. Thin adapters in Operation Hub, Runs View, Run Diagnostics, and Bob chat format the same projection; Bob Todo remains a non-authoritative completion projection.

**Tech Stack:** TypeScript, Node.js test runner, VS Code API, existing `workflow-register` artifact/run models.

## Global Constraints

- `run.json` remains authoritative.
- Do not add `reused` or `skipped` to `RunStepState.status`.
- Do not add a new persisted schema.
- Do not include snapshot or artifact body text in projections or evidence.
- Malformed optional provenance must not break run listing.
- Bob Todo live availability must remain distinct from stored sync projection.
- No new runtime dependency.

---

### Task 1: Pure run provenance projector

**Files:**
- Create: `extensions/workflow-register/src/core/runProvenance.ts`
- Create: `extensions/workflow-register/test/workflowRunProvenance.test.js`

**Interfaces:**
- Consumes: `WorkflowRunState`, `RunStepState`, existing state keys `workflow.artifactReuse`, `workflow.artifactHydration`, `workflow.taskSnapshotImport`, `workflow.definitionMismatch`.
- Produces: `projectWorkflowRunProvenance(run): WorkflowRunProvenanceProjection`.

- [x] **Step 1: Add failing projection tests**

Cover:

```js
assert.equal(projection.steps[0].completion, "reused")
assert.equal(projection.steps[0].skippedByArtifactReuse, true)
assert.deepEqual(projection.steps[0].artifactIds, ["context"])
assert.deepEqual(projection.steps[0].hydratedStateKeys, ["context"])
assert.equal(projection.steps[0].artifactVerified, true)
assert.equal(projection.sourceRunId, "source-run")
```

Also cover malformed JSON, duplicate IDs, unknown step IDs, task snapshot import and definition mismatch.

- [x] **Step 2: Verify RED**

Run:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowRunProvenance.test.js
```

Expected: compile or test failure because `out/core/runProvenance` does not exist.

- [x] **Step 3: Implement minimal projector**

Use deterministic de-duplication and no body-text fields. A hydration record marks only its `producedBy` step as artifact-verified.

- [x] **Step 4: Verify GREEN**

```bash
npm run compile
node --test test/workflowRunProvenance.test.js
```

Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add extensions/workflow-register/src/core/runProvenance.ts extensions/workflow-register/test/workflowRunProvenance.test.js
git commit -m "feat: project workflow reuse provenance"
```

### Task 2: Operation Hub step provenance

**Files:**
- Modify: `extensions/workflow-register/src/gui/operationHubModel.ts`
- Modify: `extensions/workflow-register/src/gui/operationHubHtml.ts`
- Modify: `extensions/workflow-register/test/operationHubArtifactReuse.test.js`
- Modify: `extensions/workflow-register/test/operationHubTodoSync.test.js`

**Interfaces:**
- Consumes: `projectWorkflowRunProvenance(run)`.
- Produces: `OperationHubStepProvenanceSummary[]` on each run card.

- [x] **Step 1: Add RED tests**

Assert that the reused `collect` step is rendered separately from a normal completed step and includes source run, artifact ID and hydrated key. Assert that `bobTaskSync.drift.status="synced"` with `liveTaskAvailable=false` renders warning copy instead of an OK synced badge.

- [x] **Step 2: Verify RED**

```bash
npm run compile
node --test test/operationHubArtifactReuse.test.js test/operationHubTodoSync.test.js
```

- [x] **Step 3: Add model and HTML fields**

Add a bounded list of step summaries to `OperationHubRunSummary`. Render IDs and metadata only; no state values. Preserve existing run-level badges and action ordering.

- [x] **Step 4: Verify GREEN**

```bash
npm run compile
node --test test/operationHubArtifactReuse.test.js test/operationHubTodoSync.test.js
```

- [x] **Step 5: Commit**

```bash
git add extensions/workflow-register/src/gui/operationHubModel.ts extensions/workflow-register/src/gui/operationHubHtml.ts extensions/workflow-register/test/operationHubArtifactReuse.test.js extensions/workflow-register/test/operationHubTodoSync.test.js
git commit -m "feat: show reused steps in Operation Hub"
```

### Task 3: Runs View and Run Diagnostics

**Files:**
- Modify: `extensions/workflow-register/src/commands/runControlView.ts`
- Modify: `extensions/workflow-register/src/core/runDiagnostics.ts`
- Create: `extensions/workflow-register/test/runControlViewReuseProvenance.test.js`
- Create: `extensions/workflow-register/test/workflowRunProvenanceDiagnostics.test.js`

**Interfaces:**
- Consumes: the shared provenance projection.
- Produces: stable tooltip and diagnostic lines.

- [x] **Step 1: Add RED tests**

Assert Runs View tooltip includes reused step IDs, source run, hydrated keys and artifact IDs. Assert diagnostics include `completionSource=reused`, `skippedByArtifactReuse=yes` and do not include hydrated values.

- [x] **Step 2: Verify RED**

```bash
npm run compile
node --test test/runControlViewReuseProvenance.test.js test/workflowRunProvenanceDiagnostics.test.js
```

- [x] **Step 3: Implement adapters**

Keep tree descriptions compact. Add a `Workflow provenance:` diagnostics section before generic state-key listing.

- [x] **Step 4: Verify GREEN and existing diagnostics**

```bash
npm run compile
node --test test/runControlViewReuseProvenance.test.js test/workflowRunProvenanceDiagnostics.test.js test/workflowRunDiagnostics.test.js
```

- [x] **Step 5: Commit**

```bash
git add extensions/workflow-register/src/commands/runControlView.ts extensions/workflow-register/src/core/runDiagnostics.ts extensions/workflow-register/test/runControlViewReuseProvenance.test.js extensions/workflow-register/test/workflowRunProvenanceDiagnostics.test.js
git commit -m "feat: expose reuse provenance in run diagnostics"
```

### Task 4: Bob chat control provenance

**Files:**
- Modify: `extensions/workflow-register/src/bobWorkflowMessages.ts`
- Modify: `extensions/workflow-register/src/bobWorkflowRunner.ts`
- Modify: `extensions/workflow-register/test/bobWorkflowMessages.test.js`
- Create: `extensions/workflow-register/test/bobWorkflowReuseProvenance.test.js`

**Interfaces:**
- Extends `WorkflowControlBlockInput` with `provenanceLines?: readonly string[]`.
- Bob runner derives lines from the shared projection.

- [x] **Step 1: Add RED tests**

Assert the control block contains source run, reused step IDs, verified artifact IDs and hydrated key names. Assert it omits a supplied artifact body string.

- [x] **Step 2: Verify RED**

```bash
npm run compile
node --test test/bobWorkflowMessages.test.js test/bobWorkflowReuseProvenance.test.js
```

- [x] **Step 3: Implement bounded control lines**

Pass at most 20 step IDs, 20 key IDs and 20 artifact IDs. Do not mutate Bob Todo statuses or run state.

- [x] **Step 4: Verify GREEN**

```bash
npm run compile
node --test test/bobWorkflowMessages.test.js test/bobWorkflowReuseProvenance.test.js test/bobTaskSync.test.js
```

- [x] **Step 5: Commit**

```bash
git add extensions/workflow-register/src/bobWorkflowMessages.ts extensions/workflow-register/src/bobWorkflowRunner.ts extensions/workflow-register/test/bobWorkflowMessages.test.js extensions/workflow-register/test/bobWorkflowReuseProvenance.test.js
git commit -m "feat: include reuse provenance in Bob controls"
```

### Task 5: Operator documentation and evidence

**Files:**
- Create: `extensions/workflow-register/docs/workflow-reuse-provenance-ja.md`
- Create: `docs/release-evidence/workflow-reuse-provenance-p1-3-2026-07-12.md`
- Create: `docs/release-evidence/workflow-reuse-provenance-p1-3-review-2026-07-12.md`
- Modify: `docs/workflow-register-feature-roadmap-2026-07-11.md`

- [x] Document the authoritative data, display locations, malformed-record behavior and Bob Todo limitation.
- [x] Update roadmap P1-3 status without marking external UAT complete.
- [x] Record RED/GREEN commit SHAs and Actions run IDs.
- [x] Run whole-diff review and require Critical 0 / Important 0.
- [x] Commit docs and evidence.

### Task 6: Full verification and integration

- [ ] Run focused tests and compile.
- [ ] Run the full workflow-register suite.
- [ ] Run dependency, architecture, source and schema policies.
- [ ] Run unused report and production audit.
- [ ] Build VSIX and run package policy.
- [ ] Run Ubuntu and Windows `extensions-quality`, `workflow-contracts` and `code-consistency-review-scaffold`.
- [ ] Remove temporary diagnostic workflows.
- [ ] Update the PR body with exact final head and run IDs.
- [ ] Mark ready and squash merge only when all required checks are green.
