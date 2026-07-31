Replaced: `workflowRegister.openOperationHub`, `workflowRegister.openWorkflowBuilder`, `bobBazaar.openReviewGui`, and `bobCodeConsistency.openReviewWizard` are the current operator routes; the separated Result Capture and Human Triage surfaces below are retained only as historical implementation context.

# Bob Bazaar Review Run Wizard v3 Iteration 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bazaar review packet creation, review-result capture, and Human Triageを1つの永続化されたReview Runとして接続し、標準フローでcampaign ID、review ID、成果物pathを再入力しない。

**Architecture:** `src/reviewRuns/` にVS Code非依存のrun model・path・state・storeを置く。既存のReview GUI、Result Capture GUI、Human Triage GUIは`ReviewRunContext`をcommand引数で引き渡し、既存のpacket/result/triage helperを再利用する薄いオーケストレーション層とする。

**Tech Stack:** TypeScript 5.4、VS Code Extension API 1.106、Node.js `fs/promises`、`node:test`、既存の`js-yaml`依存。

## Global Constraints

- 既存command ID、workflow action provider ID、主要artifact pathを変更しない。
- Bazaar CLIは引き続き`--no-aliases`を強制し、VCS書き込み操作を追加しない。
- Review Run stateは`.bob-review-records/campaigns/<campaignId>/records/<reviewId>/review-run.json`へ保存する。
- Review packetは同じrecord directoryの`review-packet.md`へ保存する。
- Result Captureで生成された`review_id`がactive Review Runと異なる場合、runへ暗黙に関連付けない。
- Human Triageは必須の人間ゲートとして維持する。
- 新規runtime dependencyは追加しない。
- WebviewはCSP nonce、host側message allowlist、workspace containmentを維持する。

---

### Task 1: Review Run domain model and paths

**Files:**
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunTypes.ts`
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunPaths.ts`
- Test: `extensions/bob-bazaar-review/test/reviewRunPaths.test.js`

**Interfaces:**
- Produces: `ReviewRunContext`, `ReviewRunPhase`, `ReviewRunArtifacts`, `REVIEW_RUN_SCHEMA_VERSION`。
- Produces: `validateReviewRunSegment(value, fieldName)`, `reviewRunDirectory(workspaceRoot, campaignId, reviewId)`, `reviewRunJsonPath(...)`, `reviewRunPacketPath(...)`。

- [ ] **Step 1: Write the failing path tests**

```js
const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")
const {
  reviewRunJsonPath,
  reviewRunPacketPath,
  validateReviewRunSegment
} = require("../out/reviewRuns/reviewRunPaths")

test("review run paths stay under the campaign record directory", () => {
  const root = path.resolve("C:/workspace")
  assert.equal(
    reviewRunJsonPath(root, "campaign-1", "review-1"),
    path.join(root, ".bob-review-records", "campaigns", "campaign-1", "records", "review-1", "review-run.json")
  )
  assert.equal(
    reviewRunPacketPath(root, "campaign-1", "review-1"),
    path.join(root, ".bob-review-records", "campaigns", "campaign-1", "records", "review-1", "review-packet.md")
  )
})

test("review run path segments reject traversal and Windows reserved names", () => {
  for (const value of ["../escape", "a/b", "a\\b", "CON", "name.", "name "]) {
    assert.throws(() => validateReviewRunSegment(value, "reviewId"))
  }
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd extensions/bob-bazaar-review && npm.cmd test -- --test-name-pattern="review run path"`

Expected: compile failure because `src/reviewRuns/reviewRunPaths.ts` does not exist.

- [ ] **Step 3: Implement the model and path helpers**

```ts
export const REVIEW_RUN_SCHEMA_VERSION = "bazaar-review-run/v1"
export type ReviewRunPhase = "target" | "packet" | "result" | "triage" | "completed"

export interface ReviewRunArtifacts {
  reviewPacketPath?: string
  reviewResultJsonPath?: string
  reviewResultMarkdownPath?: string
  reviewResultMetadataPath?: string
  triageYamlPath?: string
  recordYamlPath?: string
  summaryJsonPath?: string
  summaryMarkdownPath?: string
}

export interface ReviewRunContext {
  schemaVersion: typeof REVIEW_RUN_SCHEMA_VERSION
  workspaceRoot: string
  campaignId: string
  reviewId: string
  phase: ReviewRunPhase
  createdAt: string
  updatedAt: string
  target: {
    mode: "singleRevision" | "revisionRange" | "workingTreeSinceRevision"
    repositoryRoot: string
    revision?: string
    baseRevision?: string
    targetRevision?: string
  }
  artifacts: ReviewRunArtifacts
}
```

`validateReviewRunSegment`は空文字、`.`、`..`、slash、backslash、制御文字、Windows予約名、末尾dot/spaceを拒否する。

- [ ] **Step 4: Run the path tests and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm.cmd test -- --test-name-pattern="review run path"`

Expected: path tests pass.

- [ ] **Step 5: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunTypes.ts extensions/bob-bazaar-review/src/reviewRuns/reviewRunPaths.ts extensions/bob-bazaar-review/test/reviewRunPaths.test.js
git commit -m "feat: add Bazaar review run paths"
```

### Task 2: Review Run state and JSON store

**Files:**
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunState.ts`
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunStore.ts`
- Test: `extensions/bob-bazaar-review/test/reviewRunState.test.js`
- Test: `extensions/bob-bazaar-review/test/reviewRunStore.test.js`

**Interfaces:**
- Consumes: Task 1 types and paths。
- Produces: `createReviewRunContext(input)`, `advanceReviewRun(context, update)`, `buildReviewId(target)`。
- Produces: `readReviewRun(workspaceRoot, campaignId, reviewId)`, `writeReviewRun(context)`。

- [ ] **Step 1: Write failing state tests**

Tests must prove:

```js
const run = createReviewRunContext({
  workspaceRoot,
  campaignId: "campaign-1",
  reviewId: "bazaar-r125-project-rule-review",
  target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "125" },
  now: "2026-07-12T00:00:00.000Z"
})
assert.equal(run.phase, "target")
assert.equal(run.createdAt, run.updatedAt)

const packetRun = advanceReviewRun(run, {
  phase: "packet",
  artifacts: { reviewPacketPath: ".bob-review-records/campaigns/campaign-1/records/bazaar-r125-project-rule-review/review-packet.md" },
  now: "2026-07-12T00:01:00.000Z"
})
assert.equal(packetRun.phase, "packet")
assert.equal(packetRun.artifacts.reviewPacketPath.endsWith("review-packet.md"), true)
```

Also verify a phase cannot move backwards and `buildReviewId` returns stable safe IDs for single, range, and working tree targets.

- [ ] **Step 2: Run state tests and verify RED**

Expected: missing module failure.

- [ ] **Step 3: Implement state functions**

Use an explicit phase order map. `advanceReviewRun` merges artifacts, updates `updatedAt`, and rejects backward transitions.

- [ ] **Step 4: Write failing store tests**

Use `fs.mkdtemp` to verify write/read round-trip, invalid schema rejection, malformed JSON rejection, and atomic replacement without temporary files remaining.

- [ ] **Step 5: Run store tests and verify RED**

Expected: missing `reviewRunStore` module.

- [ ] **Step 6: Implement the store**

`writeReviewRun` must create the record directory, write UTF-8 JSON to a sibling temporary file, then `rename` it to `review-run.json`. `readReviewRun` must validate the schema version and identifiers before returning.

- [ ] **Step 7: Run both test files and verify GREEN**

Run: `cd extensions/bob-bazaar-review && npm.cmd test -- --test-name-pattern="review run"`

Expected: all Review Run core tests pass.

- [ ] **Step 8: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns extensions/bob-bazaar-review/test/reviewRunState.test.js extensions/bob-bazaar-review/test/reviewRunStore.test.js
git commit -m "feat: persist Bazaar review run state"
```

### Task 3: Start Review Run and persist packet from Review GUI

**Files:**
- Create: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts`
- Test: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Test: `extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js`

**Interfaces:**
- Consumes: Task 2 state/store and existing `writeReviewPacketArtifactAtPath`。
- Produces: `startReviewRun(input)`, `recordReviewPacket(run, packet)`。
- Produces: `ReviewRunCommandInput` containing `workspaceRoot`, `campaignId`, `reviewId`。

- [ ] **Step 1: Add failing coordinator tests**

Tests must verify that `startReviewRun` creates a `target` phase context and `recordReviewPacket` writes `review-packet.md`, advances to `packet`, and persists `review-run.json`.

- [ ] **Step 2: Run coordinator tests and verify RED**

Expected: missing coordinator module.

- [ ] **Step 3: Implement coordinator functions**

`recordReviewPacket` calls the existing packet artifact writer with backup enabled and stores workspace-relative artifact paths in the run context.

- [ ] **Step 4: Add failing GUI contract assertions**

Assert the Review GUI HTML contains `campaignId`, `reviewId`, and sends them with `reviewTarget`. Assert `reviewGui.ts` invokes `startReviewRun` and `recordReviewPacket`.

- [ ] **Step 5: Run GUI tests and verify RED**

Expected: missing fields and coordinator calls.

- [ ] **Step 6: Integrate the Review GUI**

Add campaign ID input with default `phase1-bazaar-review-uat-001` and a review ID field. When target information is loaded, suggest a stable ID from the target. When review is executed:

1. Build or validate the run ID.
2. Add an exact Review Run metadata section to the packet.
3. Persist `review-packet.md` and `review-run.json` before Bob handoff.
4. Keep the resulting context in the controller for subsequent Result Capture and Human Triage actions.

- [ ] **Step 7: Run coordinator and GUI tests and verify GREEN**

- [ ] **Step 8: Commit**

```bash
git add extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts extensions/bob-bazaar-review/src/ui/reviewGui.ts extensions/bob-bazaar-review/src/ui/reviewGuiHtmlAssets.ts extensions/bob-bazaar-review/test
git commit -m "feat: start Review Run from Bazaar GUI"
```

### Task 4: Result Capture handoff

**Files:**
- Modify: `extensions/bob-bazaar-review/src/extension.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/resultCaptureGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/resultCaptureGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/reviewGui.ts`
- Test: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Test: `extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js`

**Interfaces:**
- Consumes: `ReviewRunCommandInput` and persisted context。
- Produces: `recordReviewResult(run, result)` which advances to `result` only when `result.reviewId === run.reviewId`。

- [ ] **Step 1: Add failing mismatch and success tests**

```js
await assert.rejects(
  () => recordReviewResult(run, { status: "ok", valid: true, reviewId: "other-review", jsonPath: "x", markdownPath: "y" }),
  /does not match active Review Run/
)
```

Success must persist JSON, Markdown, and metadata artifact paths and move the run to `result`.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement `recordReviewResult`**

Reject missing paths and ID mismatch. Convert absolute paths under `workspaceRoot` to workspace-relative paths before storing.

- [ ] **Step 4: Add failing GUI handoff assertions**

Assert command registration accepts an optional context, the Review GUI passes it to `bobBazaar.openResultCaptureGui`, and Result Capture renders the active campaign/review without editable re-entry fields.

- [ ] **Step 5: Integrate Result Capture**

Use `workspaceRoot` in `captureReviewResult` options. After successful capture, call `recordReviewResult`, display saved paths, and open `bobBazaar.openHumanTriageGui` with the same context.

- [ ] **Step 6: Run tests and verify GREEN**

- [ ] **Step 7: Commit**

```bash
git add extensions/bob-bazaar-review/src/extension.ts extensions/bob-bazaar-review/src/ui/resultCaptureGui.ts extensions/bob-bazaar-review/src/ui/resultCaptureGuiHtml.ts extensions/bob-bazaar-review/src/ui/reviewGui.ts extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts extensions/bob-bazaar-review/test
git commit -m "feat: hand off Review Run after result capture"
```

### Task 5: Human Triage context and Iteration 1 completion

**Files:**
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGui.ts`
- Modify: `extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts`
- Modify: `extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts`
- Test: `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js`
- Test: `extensions/bob-bazaar-review/test/reviewRunCoordinator.test.js`

**Interfaces:**
- Produces: `recordTriageDraft(run, triagePath)` advancing the run to `triage`。

- [ ] **Step 1: Add failing triage tests**

Verify `recordTriageDraft` persists the workspace-relative triage path and advances to `triage`.

- [ ] **Step 2: Add failing GUI assertions**

A context-backed Human Triage screen must render campaign/review/path as read-only values and must not require them to be typed again.

- [ ] **Step 3: Integrate Human Triage**

Command registration accepts the context. `defaultModel` derives values from it. `createTriage` records the generated path in the run state. Existing standalone command behavior remains unchanged when no context is supplied.

- [ ] **Step 4: Run tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add extensions/bob-bazaar-review/src/ui/humanTriageGui.ts extensions/bob-bazaar-review/src/ui/humanTriageGuiHtml.ts extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts extensions/bob-bazaar-review/test
git commit -m "feat: continue Review Run into human triage"
```

### Task 6: Documentation and full regression gate

**Files:**
- Modify: `extensions/bob-bazaar-review/README.md`
- Modify: `extensions/bob-bazaar-review/docs/basic-design-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/detailed-design-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/unit-test-spec-ja.md`
- Modify: `extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md`

- [ ] **Step 1: Document Iteration 1 behavior**

Document `review-run.json`, packet persistence, context handoff, ID mismatch handling, standalone command compatibility, and the explicit non-goals of resume/metrics/dashboard.

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

- [ ] **Step 3: Verify the Git diff**

Confirm there are no runtime dependency additions, command ID changes, provider ID changes, or unrelated files.

- [ ] **Step 4: Commit**

```bash
git add extensions/bob-bazaar-review/README.md extensions/bob-bazaar-review/docs
git commit -m "docs: document Bazaar Review Run iteration 1"
```

## Plan Self-Review

- Spec coverage: Iteration 1のcontext、packet保存、Result Capture handoff、Human Triage handoff、再入力除去、互換性、テストを各Taskへ割り当てた。
- Scope: 再開、metrics、legacy recovery、DashboardはIteration 2以降として除外した。
- Placeholder scan: `TBD`、`TODO`、曖昧な実装指示は残していない。
- Type consistency: すべてのGUIとcoordinatorは`ReviewRunContext`および`ReviewRunCommandInput`を共有する。
- Security: ID validation、workspace-relative artifact、CSP、message allowlist、readonly Bazaar境界を維持する。
