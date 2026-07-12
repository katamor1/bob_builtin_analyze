# Bob Code Consistency Review Triage Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace mutable all-in-one triage data with an immutable Bob-output source snapshot, keyed human decisions, conflict-safe saves, deterministic projections, and one-time migration from the legacy `triage-result.yaml` format.

**Architecture:** `triage-source.yaml` stores the Bob-output-derived source snapshot and is never mutated by the GUI. `triage-decisions.yaml` stores only human-editable fields keyed by `source_id`, including optimistic-lock metadata. `triage-result.yaml` and all Markdown files are regenerated projections. Focused domain modules keep source building, decision validation, projection rendering, and multi-file replacement independent from VS Code UI code.

**Tech Stack:** TypeScript 5.4, Node.js `crypto` and `fs/promises`, `yaml`, VS Code Webview, Node built-in test runner.

## Global Constraints

- Scope is Phase 1 only: Triage Integrity and the minimum GUI changes needed to edit it.
- Existing `bobCodeConsistency.*` command IDs remain unchanged.
- Existing `bobOutputPath`, `triagePath`, and `triage-result.yaml` compatibility path remain unchanged.
- New schema identifiers are exactly `triage-source/v1` and `triage-decisions/v1`.
- `triage-source.yaml` is derived only from Bob output and is never updated from a Webview message.
- Human decisions are keyed by `source_id`; array position is never an identity.
- Existing unknown decision fields are preserved when the schema version is unchanged.
- Writes must validate all outputs before replacing any current projection.
- Existing files are backed up before replacement; failed replacement restores the previous set.
- No new runtime dependency is added.
- Production code requires a focused failing test first.
- `npm test`, `architecture:policy`, and `source:policy` must pass before completion.

---

## File Structure

### New files

- `extensions/bob-code-consistency-review/src/triage/triageTypes.ts`
  - Schema and UI-facing domain types for source items, decision records, workspace state, and projections.
- `extensions/bob-code-consistency-review/src/triage/triageSource.ts`
  - Parse Bob output into a source snapshot, serialize it, and compute the exact source-file SHA-256.
- `extensions/bob-code-consistency-review/src/triage/triageDecisions.ts`
  - Load/create decisions, merge trusted patches by `source_id`, validate decision-specific requirements, and enforce optimistic locking.
- `extensions/bob-code-consistency-review/src/triage/triageProjection.ts`
  - Join source and decisions into compatibility YAML and decision-based Markdown projections.
- `extensions/bob-code-consistency-review/src/triage/triageFileTransaction.ts`
  - Stage, validate, back up, replace, and roll back a related set of triage files.
- `extensions/bob-code-consistency-review/src/triage/humanTriageWorkspace.ts`
  - Orchestrate generation, loading, migration, saving, and projection regeneration.
- `extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js`
  - Domain and persistence regression coverage for the complete Phase 1 contract.

### Modified files

- `extensions/bob-code-consistency-review/src/triage/humanTriageHelper.ts`
  - Preserve the existing `generateHumanTriage()` public API and delegate to the new workspace service.
- `extensions/bob-code-consistency-review/src/webview/consistencyHumanTriage.ts`
  - Load source plus decisions, send lock tokens, and save decision patches through the domain service.
- `extensions/bob-code-consistency-review/src/webview/consistencyHumanTriageHtml.ts`
  - Render source context, an explicit untriaged option, follow-up fields, and lock metadata.
- `extensions/bob-code-consistency-review/test/reviewOutputTriage.test.js`
  - Update generation expectations from “all findings accepted” to decision-based projection semantics.
- `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`
  - Assert the new decision fields and lock metadata are rendered and posted.
- `extensions/bob-code-consistency-review/README.md`
- `extensions/bob-code-consistency-review/docs/detailed-design-ja.md`
- `extensions/bob-code-consistency-review/docs/unit-test-spec-ja.md`
- `extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md`
  - Document the new files, save behavior, migration, conflict handling, and UAT path.

---

### Task 1: Define Phase 1 Behavior With Failing Tests

**Files:**
- Create: `extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js`
- Modify: `extensions/bob-code-consistency-review/test/reviewOutputTriage.test.js`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`

**Interfaces:**
- Consumes future exports from `../out/triage/humanTriageWorkspace`:

```ts
export async function loadHumanTriageWorkspace(input: {
  workspaceRoot: string
  outDir: string
}): Promise<HumanTriageWorkspaceState>

export async function saveHumanTriageDecisions(input: {
  workspaceRoot: string
  outDir: string
  expectedSourceSha256: string
  expectedDecisionRevision: number
  items: unknown[]
  now?: Date
}): Promise<HumanTriageWorkspaceState>
```

- Preserves the existing `generateHumanTriage()` API from `humanTriageHelper`.

- [x] **Step 1: Add a generation regression**

Create a temporary workspace and Bob output containing one finding and one question. Call `generateHumanTriage()` and assert:

```js
assert.ok(fs.existsSync(path.join(triageDir, "triage-source.yaml")))
assert.ok(fs.existsSync(path.join(triageDir, "triage-decisions.yaml")))
assert.ok(fs.existsSync(path.join(triageDir, "triage-result.yaml")))
assert.doesNotMatch(read("accepted-findings.md"), /PRE-001/)
assert.match(read("questions-to-author.md"), /Q-001/)
```

Parse `triage-source.yaml` and require source schema `triage-source/v1`, the full finding context, and the question context. Parse `triage-decisions.yaml` and require schema `triage-decisions/v1`, revision `0`, and the exact source hash.

- [x] **Step 2: Add a decision save regression**

Load the workspace state, save an accepted finding with owner, reason, final severity, review comment, and follow-up. Require:

```js
assert.equal(saved.decisionRevision, 1)
assert.match(read("accepted-findings.md"), /PRE-001/)
assert.doesNotMatch(read("rejected-findings.md"), /PRE-001/)
assert.match(read("follow-up-actions.md"), /owner-a/)
```

Seed an unknown top-level decision field and an unknown nested `follow_up` field before saving; require both to survive the merge.

- [x] **Step 3: Add identity and conflict regressions**

Cover:

```js
await assert.rejects(
  saveHumanTriageDecisions({ ...input, expectedSourceSha256: "stale" }),
  /TRIAGE_SOURCE_CHANGED/
)
await assert.rejects(
  saveHumanTriageDecisions({ ...input, expectedDecisionRevision: 99 }),
  /TRIAGE_REVISION_CONFLICT/
)
```

Reverse the posted item order and require decisions still attach to their original `source_id`.

- [x] **Step 4: Add validation regressions**

Require stable validation errors for:

```js
{ decision: "accepted", reason: "", owner: "", final_severity: "" }
{ decision: "rejected", reason: "" }
{ decision: "needs_investigation", reason: "check", owner: "", follow_up: {} }
{ decision: "deferred", reason: "later", follow_up: { due: "" } }
{ decision: "question", reason: "ask", owner: "", suggested_recipient: "" }
```

Also reject unknown decisions and unknown `source_id` values.

- [x] **Step 5: Add migration regressions**

Seed only a legacy `triage-result.yaml`, then call generation. Require:

```js
assert.ok(fs.existsSync(path.join(triageDir, "migration-report.md")))
assert.ok(globBackups("triage-result.yaml.bak-").length >= 1)
assert.equal(decisions.items["PRE-001"].decision, "accepted")
```

Include an unmatched legacy source ID and require it in the migration warning without adding it to current decisions.

- [x] **Step 6: Update existing projection expectations**

In `reviewOutputTriage.test.js`, replace generation-time assertions that `accepted-findings.md` already contains findings. Require the file to exist and contain no `PRE-*` item until a human decision is saved.

- [x] **Step 7: Update GUI surface expectations**

Require generated HTML to contain:

```js
assert.match(html, /value="" selected>未判断/)
assert.match(html, /data-field="follow_up_action"/)
assert.match(html, /data-field="follow_up_due"/)
assert.match(html, /sourceSha256/)
assert.match(html, /decisionRevision/)
```

- [x] **Step 8: Run focused tests and verify RED**

Run:

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/humanTriageIntegrity.test.js test/reviewOutputTriage.test.js test/guiFirstSurfaces.test.js
```

Expected: FAIL because `humanTriageWorkspace` and the new triage files do not exist, and current projections still put every finding into `accepted-findings.md`.

- [x] **Step 9: Commit RED tests**

```bash
git add extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js \
  extensions/bob-code-consistency-review/test/reviewOutputTriage.test.js \
  extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js
git commit -m "test: define triage integrity contracts"
```

---

### Task 2: Build Immutable Triage Source Snapshots

**Files:**
- Create: `extensions/bob-code-consistency-review/src/triage/triageTypes.ts`
- Create: `extensions/bob-code-consistency-review/src/triage/triageSource.ts`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js`

**Interfaces:**
- Produces:

```ts
export type TriageSourceType = "finding" | "question"

export interface TriageSourceItem extends Record<string, unknown> {
  source_id: string
  source_type: TriageSourceType
}

export interface TriageSourceV1 {
  schema_version: "triage-source/v1"
  review_id: string
  package_id?: string
  bob_output_sha256: string
  generated_at: string
  items: TriageSourceItem[]
}

export function buildTriageSource(input: {
  bobOutput: unknown
  bobOutputSha256: string
  generatedAt: string
}): TriageSourceV1

export function serializeTriageSource(source: TriageSourceV1): string
export function hashTriageSourceText(text: string): string
export function parseTriageSource(text: string): TriageSourceV1
```

- [x] **Step 1: Add focused source builder tests**

Require findings and questions to retain every input property except `id`, which becomes `source_id`. Require duplicate IDs, missing IDs, invalid top-level arrays, and an empty review ID to fail.

- [x] **Step 2: Run the source tests and verify RED**

Expected: module-not-found or missing-export failure for `triageSource`.

- [x] **Step 3: Define the triage domain types**

Add exact source, decision, workspace, UI item, and projection interfaces to `triageTypes.ts`. Use `Record<string, unknown>` extension points only where unknown-field preservation is required.

- [x] **Step 4: Implement source building and parsing**

Use `YAML.parse` and `YAML.stringify`. Copy source payloads rather than mutating Bob output. Validate IDs and duplicate identities. Compute SHA-256 with:

```ts
createHash("sha256").update(text, "utf8").digest("hex")
```

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm run compile
node --test test/humanTriageIntegrity.test.js --test-name-pattern="source"
```

Expected: source tests PASS.

- [x] **Step 6: Commit source contracts**

```bash
git add extensions/bob-code-consistency-review/src/triage/triageTypes.ts \
  extensions/bob-code-consistency-review/src/triage/triageSource.ts \
  extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js
git commit -m "feat: add immutable triage source snapshots"
```

---

### Task 3: Implement Keyed Decisions and Optimistic Locking

**Files:**
- Create: `extensions/bob-code-consistency-review/src/triage/triageDecisions.ts`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js`

**Interfaces:**
- Produces:

```ts
export type TriageDecisionValue =
  | "accepted"
  | "rejected"
  | "needs_investigation"
  | "deferred"
  | "question"

export interface TriageDecisionsV1 {
  schema_version: "triage-decisions/v1"
  review_id: string
  source_sha256: string
  decision_revision: number
  updated_at: string
  triaged_by?: string
  items: Record<string, TriageDecisionRecord>
}

export function createEmptyTriageDecisions(input: {
  reviewId: string
  sourceSha256: string
  updatedAt: string
}): TriageDecisionsV1

export function parseTriageDecisions(text: string): TriageDecisionsV1

export function mergeTriageDecisionPatches(input: {
  source: TriageSourceV1
  current: TriageDecisionsV1
  currentSourceSha256: string
  expectedSourceSha256: string
  expectedDecisionRevision: number
  patches: unknown[]
  updatedAt: string
}): TriageDecisionsV1
```

- [x] **Step 1: Add parser and merge RED tests**

Require exact schemas, non-negative integer revisions, a map-shaped `items`, and matching review IDs. Require posted object order to have no effect on identity.

- [x] **Step 2: Add unknown-field preservation RED tests**

Seed:

```yaml
items:
  PRE-001:
    decision: accepted
    custom_audit_flag: keep-me
    follow_up:
      required: true
      custom_ticket: KEEP-1
```

Patch owner and reason only. Require `custom_audit_flag` and `custom_ticket` to remain unchanged.

- [x] **Step 3: Implement trusted patch normalization**

Accept only these posted fields:

```ts
[
  "source_id",
  "decision",
  "final_severity",
  "owner",
  "reason",
  "review_comment",
  "suggested_recipient",
  "follow_up"
]
```

Ignore posted unknown fields. Preserve unknown fields already stored on disk. Empty known string fields delete the stored known value rather than leaving whitespace.

- [x] **Step 4: Implement validation**

Apply the exact requirements from the design. Use stable messages prefixed with `TRIAGE_DECISION_INVALID <source_id>:`. Validate final severity against `critical`, `high`, `medium`, `low`, and `info`.

- [x] **Step 5: Implement optimistic locking**

Throw:

```ts
new Error("TRIAGE_SOURCE_CHANGED: ...")
new Error("TRIAGE_REVISION_CONFLICT: ...")
```

before returning a modified object. Increment `decision_revision` exactly once per successful save.

- [x] **Step 6: Run decision tests and verify GREEN**

```bash
npm run compile
node --test test/humanTriageIntegrity.test.js --test-name-pattern="decision|conflict|validation"
```

Expected: decision tests PASS.

- [x] **Step 7: Commit decision storage**

```bash
git add extensions/bob-code-consistency-review/src/triage/triageDecisions.ts \
  extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js
git commit -m "feat: add conflict-safe triage decisions"
```

---

### Task 4: Add Deterministic Projections, Transactional Replacement, and Migration

**Files:**
- Create: `extensions/bob-code-consistency-review/src/triage/triageProjection.ts`
- Create: `extensions/bob-code-consistency-review/src/triage/triageFileTransaction.ts`
- Create: `extensions/bob-code-consistency-review/src/triage/humanTriageWorkspace.ts`
- Modify: `extensions/bob-code-consistency-review/src/triage/humanTriageHelper.ts`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js`
- Modify: `extensions/bob-code-consistency-review/test/reviewOutputTriage.test.js`

**Interfaces:**
- Produces:

```ts
export interface HumanTriageWorkspaceState {
  outDir: string
  sourcePath: string
  decisionsPath: string
  reviewId: string
  sourceSha256: string
  decisionRevision: number
  items: HumanTriageViewItem[]
  issues: string[]
}

export async function regenerateHumanTriageWorkspace(input: {
  workspaceRoot: string
  packageDir: string
  bobOutputPath: string
  outDir: string
  now?: Date
}): Promise<HumanTriageResult>

export async function loadHumanTriageWorkspace(input: {
  workspaceRoot: string
  outDir: string
}): Promise<HumanTriageWorkspaceState>

export async function saveHumanTriageDecisions(input: {
  workspaceRoot: string
  outDir: string
  expectedSourceSha256: string
  expectedDecisionRevision: number
  items: unknown[]
  now?: Date
}): Promise<HumanTriageWorkspaceState>
```

- `generateHumanTriage()` delegates to `regenerateHumanTriageWorkspace()`.

- [x] **Step 1: Implement projection construction**

Join source items with decisions by `source_id`. Produce:

```text
triage-result.yaml
accepted-findings.md
rejected-findings.md
investigation-items.md
questions-to-author.md
follow-up-actions.md
```

Rules:

- accepted Markdown contains only accepted findings.
- rejected Markdown contains only rejected findings.
- investigation Markdown contains `needs_investigation` and `deferred` items.
- questions Markdown contains all source questions plus any item decided as `question`.
- follow-up Markdown contains only decisions with `follow_up.required: true`.
- every Markdown is regenerated; none is treated as user-editable state.

- [x] **Step 2: Implement staged multi-file replacement**

`replaceTriageFilesAtomically(outDir, files)` must:

1. Create a same-directory staging directory.
2. Write every complete target text before touching current files.
3. Parse the staged YAML files to verify serialization.
4. Rename existing target files to unique `.bak-<timestamp>-<suffix>` paths.
5. Rename staged files to final paths.
6. On any failure, remove new targets and restore every original backup.
7. Remove the staging directory in `finally`.

- [x] **Step 3: Implement legacy migration**

When `triage-decisions.yaml` is absent and `triage-result.yaml` exists:

- Parse legacy items.
- Extract only decision fields keyed by `source_id`.
- Ignore unmatched IDs and list them in `migration-report.md`.
- Preserve `triaged_by` and `triaged_at` when present.
- Set `decision_revision` to `1` when at least one item migrates, otherwise `0`.
- Include the old `triage-result.yaml` in the backup set before writing the new projection.

- [x] **Step 4: Implement generation**

Read Bob output through `readBobOutputText()`, hash exact Bob-output bytes, build and serialize the source, migrate or retain matching decisions, then write source, decisions, projections, and migration report in one transaction.

When a previous decisions file exists, retain only decision records whose `source_id` still exists. Record dropped IDs as warnings in `migration-report.md`; never silently apply them to a different item.

- [x] **Step 5: Implement load and save**

Load must verify source hash, decisions source hash, review ID, and projection identity. Save must merge patches, build all projections in memory, and replace decisions plus projections transactionally without rewriting `triage-source.yaml`.

- [x] **Step 6: Preserve the public helper API**

Keep:

```ts
export async function generateHumanTriage(...): Promise<HumanTriageResult>
```

and delegate to `regenerateHumanTriageWorkspace()` so workflow commands and existing imports remain valid.

- [x] **Step 7: Run focused tests and verify GREEN**

```bash
npm run compile
node --test test/humanTriageIntegrity.test.js test/reviewOutputTriage.test.js
```

Expected: all triage domain and existing pipeline tests PASS.

- [x] **Step 8: Commit workspace persistence**

```bash
git add extensions/bob-code-consistency-review/src/triage \
  extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js \
  extensions/bob-code-consistency-review/test/reviewOutputTriage.test.js
git commit -m "feat: make human triage decision-driven"
```

---

### Task 5: Wire the GUI to Source and Decisions

**Files:**
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyHumanTriage.ts`
- Modify: `extensions/bob-code-consistency-review/src/webview/consistencyHumanTriageHtml.ts`
- Modify: `extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js`
- Modify: `extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js`

**Interfaces:**
- Controller consumes `loadHumanTriageWorkspace()` and `saveHumanTriageDecisions()`.
- Webview posts:

```ts
interface HumanTriageMessage {
  type: "consistencyHumanTriage.action"
  action: "generateTriage" | "saveDecisions" | "openResultCapture"
  sourceSha256?: string
  decisionRevision?: number
  items?: unknown[]
}
```

- [x] **Step 1: Add controller-message RED tests through exported pure parsing helpers**

Export and test a pure `parseHumanTriageMessage()` helper. Require save messages to reject missing source hash, missing integer revision, duplicate source IDs, and non-array items.

- [x] **Step 2: Replace direct YAML mutation**

Remove direct reads and writes of `triage-result.yaml` from the controller. `loadModel()` calls `loadHumanTriageWorkspace()`. `saveDecisions()` calls the domain service with lock metadata and posted patches.

- [x] **Step 3: Add explicit untriaged UI state**

Render a blank decision option before the five decisions:

```html
<option value="">未判断</option>
```

This prevents an untouched row from becoming `accepted` merely because it is the first select option.

- [x] **Step 4: Render source context and decision fields**

Display summary, category, original severity, confidence, reason, impact, recommended action, human check, and evidence IDs. Add editable final severity, owner, human reason, review comment, suggested recipient, follow-up required, follow-up action, and due date.

- [x] **Step 5: Post lock metadata and decision patches only**

Embed escaped model metadata in `data-` attributes or JavaScript literals. `collectItems()` posts only `source_id` and editable decision fields; it does not post source payload fields.

- [x] **Step 6: Preserve security contracts**

Maintain CSP nonce, action whitelist, HTML escaping, and no inline `onclick`. Never trust `source_type`, summary, evidence, or other source fields from the browser.

- [x] **Step 7: Run GUI and domain tests**

```bash
npm run compile
node --test test/guiFirstSurfaces.test.js test/humanTriageIntegrity.test.js
```

Expected: PASS.

- [x] **Step 8: Commit GUI wiring**

```bash
git add extensions/bob-code-consistency-review/src/webview/consistencyHumanTriage.ts \
  extensions/bob-code-consistency-review/src/webview/consistencyHumanTriageHtml.ts \
  extensions/bob-code-consistency-review/test/guiFirstSurfaces.test.js \
  extensions/bob-code-consistency-review/test/humanTriageIntegrity.test.js
git commit -m "feat: preserve triage decisions in the GUI"
```

---

### Task 6: Synchronize Documentation and Run Release Gates

**Files:**
- Modify: `extensions/bob-code-consistency-review/README.md`
- Modify: `extensions/bob-code-consistency-review/docs/detailed-design-ja.md`
- Modify: `extensions/bob-code-consistency-review/docs/unit-test-spec-ja.md`
- Modify: `extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md`
- Modify: `docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-integrity.md`

**Interfaces:**
- Documents the exact schemas, file roles, migration, validation, and operator flow implemented by Tasks 1–5.

- [x] **Step 1: Update README**

Document the new triage directory:

```text
triage-source.yaml
triage-decisions.yaml
triage-result.yaml
accepted-findings.md
rejected-findings.md
investigation-items.md
questions-to-author.md
follow-up-actions.md
migration-report.md
```

State clearly that Markdown files are generated projections and must not be used as the decision source of truth.

- [x] **Step 2: Update detailed design**

Add source/decision separation, exact schema identifiers, optimistic locking, transactional replacement, migration behavior, and GUI trust boundary.

- [x] **Step 3: Update unit-test specification**

Map the new tests to requirements covering field preservation, keyed identity, validation, source/revision conflict, migration, rollback, and projection classification.

- [x] **Step 4: Update real-machine test specification**

Add operator steps for generate, edit, save, reload, source-change conflict, two-window revision conflict, migration, and backup inspection.

- [x] **Step 5: Mark completed plan checkboxes**

Change each completed `- [x]` to `- [x]`. Do not mark a step complete unless its command was run or its GitHub Actions equivalent passed.

- [x] **Step 6: Run the full extension suite**

```bash
cd extensions/bob-code-consistency-review
npm ci
npm test
npm run architecture:policy
npm run source:policy
npm run dependency:policy
npm run package
npm run package:policy
```

Expected: all commands exit `0`.

- [x] **Step 7: Inspect the final diff**

```bash
git status --short
git diff --check
git diff --stat main...HEAD
```

Expected: only Phase 1 code, tests, plan, design, and synchronized documentation are present.

- [x] **Step 8: Commit documentation and plan completion**

```bash
git add docs/superpowers/specs/2026-07-11-bob-code-consistency-review-workspace-v2-design.md \
  docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-integrity.md \
  extensions/bob-code-consistency-review/README.md \
  extensions/bob-code-consistency-review/docs/detailed-design-ja.md \
  extensions/bob-code-consistency-review/docs/unit-test-spec-ja.md \
  extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md
git commit -m "docs: specify triage integrity operation"
```

- [x] **Step 9: Open a draft pull request**

Create a draft PR from `agent/bob-code-consistency-review-triage-integrity` to `main`. Include implementation summary, migration behavior, validation commands, known environment limits, and manual UAT still required.

<!-- TRIAGE-INTEGRITY-EXECUTION-2026-07-12 -->
## Execution Evidence

- TDD RED contracts were committed before production implementation.
- Focused source, decision, projection, migration, transaction, GUI-boundary, and compatibility tests pass.
- Windows full extension verification ran dependency, architecture, source, unit, package, and VSIX policy gates.
- Ubuntu and Windows repository workflows remain the final share gate on the post-finalization commit.
- Manual IBM Bob operator UAT remains a release-candidate gate and is not represented as automated completion.
