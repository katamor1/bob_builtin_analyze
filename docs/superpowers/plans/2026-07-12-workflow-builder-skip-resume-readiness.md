# Workflow Builder Skip Resume Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-first, selective, conflict-safe setup flow in Workflow Builder that produces a strict-valid `x-skipResume.fileBound` workflow without overwriting existing artifact definitions.

**Architecture:** Extend the explicit authoring model with skip-resume metadata, add one pure planner used by both preview and apply, and keep the Webview responsible only for selection and presentation. The extension host recomputes the plan on apply and validates the generated Markdown in strict mode before returning the updated model.

**Tech Stack:** TypeScript, Node.js built-in test runner, js-yaml, VS Code Webview API, existing workflow compiler and authoring serializer.

## Global Constraints

- Production code changes require a focused failing regression test first.
- `x-skipResume.fileBound: true` remains opt-in.
- Existing artifacts are never deleted, renamed, or overwritten automatically.
- Preview and apply must execute the same planner and strict validator.
- Apply updates only the in-memory Builder model; normal Preview / Diff / Save remains the persistence path.
- Existing workflow IDs, schemaVersion, runtime contracts, and unknown front matter remain compatible.
- No new runtime dependency is added.
- Each task ends with focused tests, compile, diff check, and a commit.

---

### Task 1: Make Skip Resume Explicit in the Authoring Model

**Files:**
- Modify: `extensions/workflow-register/src/core/authoring/workflowAuthoringModel.ts`
- Modify: `extensions/workflow-register/src/core/authoring/workflowAuthoringLoader.ts`
- Modify: `extensions/workflow-register/src/core/authoring/workflowAuthoringSerializer.ts`
- Modify: `extensions/workflow-register/test/workflowAuthoringLoader.test.js`
- Modify: `extensions/workflow-register/test/workflowAuthoringSerializer.test.js`

**Interfaces:**
- Produces: `WorkflowAuthoringModel.skipResume?: { fileBound: boolean }`.
- Consumes: existing `x-skipResume` parser contract.

- [ ] **Step 1: Add failing loader round-trip coverage**

Add a workflow fixture containing:

```yaml
x-skipResume:
  fileBound: true
```

Assert:

```js
assert.deepEqual(loaded.model.skipResume, { fileBound: true })
assert.equal(loaded.model.unknownFrontMatter?.["x-skipResume"], undefined)
assert.match(rendered.markdown, /x-skipResume:\n\s+fileBound: true/)
```

- [ ] **Step 2: Add failing serializer coverage**

Create an authoring model, set:

```js
model.skipResume = { fileBound: true }
```

Assert generated Markdown contains the extension field and passes strict validation after adding matching run-scoped artifacts.

- [ ] **Step 3: Run RED**

Run:

```text
npm run compile
node --test test/workflowAuthoringLoader.test.js test/workflowAuthoringSerializer.test.js
```

Expected: FAIL because `skipResume` is not an explicit authoring property and serializer does not emit `x-skipResume`.

- [ ] **Step 4: Implement model, loader, and serializer support**

Add:

```ts
skipResume?: {
  fileBound: boolean
}
```

Add `x-skipResume` to `guiManagedFrontMatterFields`, read it from front matter using a small record helper, and serialize it as:

```ts
"x-skipResume": model.skipResume?.fileBound === true
  ? { fileBound: true }
  : undefined
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```text
npm run compile
node --test test/workflowAuthoringLoader.test.js test/workflowAuthoringSerializer.test.js
git diff --check
```

Commit:

```text
feat: round-trip skip resume authoring metadata
```

### Task 2: Add the Pure Readiness Planner

**Files:**
- Create: `extensions/workflow-register/src/core/authoring/workflowSkipResumeReadiness.ts`
- Create: `extensions/workflow-register/test/workflowSkipResumeReadiness.test.js`

**Interfaces:**
- Consumes: `WorkflowAuthoringModel` and `WorkflowArtifactDefinition`.
- Produces:

```ts
planSkipResumeReadiness(
  model: WorkflowAuthoringModel,
  selectedStepIds?: readonly string[]
): SkipResumeReadinessPlan
```

- [ ] **Step 1: Write failing deterministic generation tests**

Cover:

```js
const plan = planSkipResumeReadiness(model)
assert.deepEqual(plan.selectedStepIds, ["collect-context", "review"])
assert.deepEqual(plan.nextModel.skipResume, { fileBound: true })
assert.deepEqual(plan.nextModel.artifacts[0], {
  id: "collectedContext",
  producedBy: "collect-context",
  path: ".bob/workflows/runs/{{run.id}}/artifacts/collect-context/collectedContext.md",
  schema: "text/markdown"
})
```

Assert the input model is unchanged.

- [ ] **Step 2: Write failing manual-output and idempotency tests**

Cover manual `form.resultKey` and `approval.resultKey`, exact existing artifacts, repeated planning, and an explicit subset in `selectedStepIds`.

- [ ] **Step 3: Write failing blocker tests**

Cover:

- agent without `resultKey`;
- result step without file sink;
- same artifact id owned by another step;
- same producer with a different artifact id;
- matching artifact with a non-run-scoped path;
- selected blocked candidate.

Assert the planner reports stable messages containing the relevant step/artifact IDs and does not modify existing definitions.

- [ ] **Step 4: Run RED**

Run:

```text
npm run compile
node --test test/workflowSkipResumeReadiness.test.js
```

Expected: FAIL because the planner module does not exist.

- [ ] **Step 5: Implement minimal planner**

Use a deep-cloned model, deterministic step order, and this path generator:

```ts
function generatedArtifact(stepId: string, resultKey: string): WorkflowArtifactDefinition {
  return {
    id: resultKey,
    producedBy: stepId,
    path: `.bob/workflows/runs/{{run.id}}/artifacts/${stepId}/${resultKey}.md`,
    schema: "text/markdown"
  }
}
```

Do not auto-fix blockers. Add selected `ready` candidates, retain exact `existing` candidates, and set `nextModel.skipResume = { fileBound: true }` only in the returned clone.

- [ ] **Step 6: Verify planner and strict validation**

Serialize `plan.nextModel` and run:

```js
validateWorkflowText({
  sourceId: "workflow-register",
  filePath: rendered.filePath,
  text: rendered.markdown,
  strict: true
})
```

Assert a valid generated workflow is strict-green.

- [ ] **Step 7: Commit**

Run:

```text
npm run compile
node --test test/workflowSkipResumeReadiness.test.js
git diff --check
```

Commit:

```text
feat: plan skip resume readiness artifacts
```

### Task 3: Add a Shared Preview and Apply Boundary

**Files:**
- Create: `extensions/workflow-register/src/core/authoring/workflowSkipResumeReadinessPreview.ts`
- Create: `extensions/workflow-register/test/workflowSkipResumeReadinessPreview.test.js`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`

**Interfaces:**
- Consumes: `planSkipResumeReadiness()` and `validateWorkflowText()`.
- Produces:

```ts
buildSkipResumeReadinessPreview(model, selectedStepIds?, validationContext)
applySkipResumeReadiness(model, selectedStepIds, validationContext)
```

Both return the same plan/validation evidence; apply additionally returns the strict-valid `nextModel` or an error result.

- [ ] **Step 1: Write failing preview/apply parity tests**

Assert preview and apply return identical:

- candidate status;
- selected step IDs;
- changes;
- before Markdown;
- after Markdown;
- strict diagnostics.

Assert apply refuses blockers and returns no model.

- [ ] **Step 2: Run RED**

Run:

```text
npm run compile
node --test test/workflowSkipResumeReadinessPreview.test.js
```

Expected: FAIL because the preview boundary does not exist.

- [ ] **Step 3: Implement the shared boundary**

Serialize before/after models, run strict validation on after Markdown, and compute:

```ts
ok = plan.blockingIssues.length === 0
  && !validation.diagnostics.some((item) => item.severity === "error")
```

Apply must recompute rather than trusting preview output.

- [ ] **Step 4: Wire host messages**

Extend `WorkflowBuilderMessage` with:

```ts
| { type: "previewSkipResumeReadiness"; model: WorkflowAuthoringModel; selectedStepIds?: string[] }
| { type: "applySkipResumeReadiness"; model: WorkflowAuthoringModel; selectedStepIds: string[] }
```

Post `skipResumeReadinessPreviewResult` and `skipResumeReadinessApplied` responses. On failed apply, return the fresh preview evidence and do not mutate the model.

- [ ] **Step 5: Verify and commit**

Run:

```text
npm run compile
node --test test/workflowSkipResumeReadiness.test.js test/workflowSkipResumeReadinessPreview.test.js
git diff --check
```

Commit:

```text
feat: preview and apply skip resume readiness
```

### Task 4: Add the Artifacts Tab Setup UX

**Files:**
- Create: `extensions/workflow-register/src/webview/workflowBuilderSkipResumeReadinessScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderClientScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderTabRenderersScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderStyles.ts`
- Modify: `extensions/workflow-register/test/workflowBuilderWebviewModules.test.js`

**Interfaces:**
- Consumes: host messages from Task 3.
- Produces: preview-first candidate selection and `apply-skip-resume-readiness` action in the Artifacts tab.

- [ ] **Step 1: Add failing Webview contract assertions**

Assert rendered client/HTML includes:

```text
途中再開 readiness
previewSkipResumeReadiness
applySkipResumeReadiness
skipResumeReadinessPreviewResult
apply-skip-resume-readiness
data-skip-resume-step-id
```

Assert the script keeps an explicit preview source signature and clears stale preview after model changes.

- [ ] **Step 2: Run RED**

Run:

```text
npm run compile
node --test test/workflowBuilderWebviewModules.test.js
```

Expected: FAIL because the setup script and actions do not exist.

- [ ] **Step 3: Implement preview-first UI**

The Artifacts renderer prepends a readiness card. The client script:

- requests preview when `steps`, `artifacts`, or `skipResume` changes;
- renders one checkbox per candidate;
- displays `id`, `producedBy`, path, schema, status, and issues;
- displays before/after Markdown in separate `<pre>` elements;
- disables apply unless `preview.ok === true`;
- posts apply with the current selected step IDs;
- replaces `model` only after `skipResumeReadinessApplied`.

- [ ] **Step 4: Preserve ordinary artifact editing**

Existing add/edit/delete artifact handlers must continue to work and must invalidate the cached readiness preview.

- [ ] **Step 5: Verify and commit**

Run:

```text
npm run compile
node --test \
  test/workflowBuilderWebviewModules.test.js \
  test/workflowSkipResumeReadiness.test.js \
  test/workflowSkipResumeReadinessPreview.test.js
git diff --check
```

Commit:

```text
feat: add skip resume readiness to builder
```

### Task 5: Documentation, Full Verification, and Release Evidence

**Files:**
- Modify: `extensions/workflow-register/docs/workflow-skip-resume-plan-ja.md`
- Modify: `extensions/workflow-register/src/webview/README.md`
- Create: `docs/release-evidence/workflow-builder-skip-resume-readiness-2026-07-12.md`
- Modify: `docs/superpowers/plans/2026-07-12-workflow-builder-skip-resume-readiness.md`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: operator-facing behavior, verification evidence, and completed plan status.

- [ ] **Step 1: Document the Builder workflow**

Record:

1. open Artifacts;
2. review candidates and blockers;
3. select outputs;
4. inspect before/after preview;
5. apply to the Builder model;
6. run normal Preview / Diff / Save.

State that existing artifacts are never rewritten automatically and that resultKey correction remains manual.

- [ ] **Step 2: Run focused verification**

```text
npm run compile
node --test \
  test/workflowSkipResumeReadiness.test.js \
  test/workflowSkipResumeReadinessPreview.test.js \
  test/workflowAuthoringLoader.test.js \
  test/workflowAuthoringSerializer.test.js \
  test/workflowBuilderWebviewModules.test.js
```

Expected: all pass, zero failures.

- [ ] **Step 3: Run full quality gates**

```text
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run unused:report
npm run audit:prod
npm run package
npm run package:policy
git diff --check
```

- [ ] **Step 4: Run Ubuntu and Windows Actions**

Require `workflow-register` unit tests, package, VSIX policy, and Extension Host smoke to complete successfully on both platforms.

- [ ] **Step 5: Review the whole diff**

Review model compatibility, non-destructive artifact handling, preview/apply parity, stale preview invalidation, Webview message safety, and source/package policy. Record:

```text
Critical: 0
Important: 0
```

- [ ] **Step 6: Update evidence and plan checkboxes**

Record exact head SHA, workflow run IDs, test counts, package result, and residual risks.

- [ ] **Step 7: Commit**

Commit:

```text
docs: record builder skip resume readiness gates
```

- [ ] **Step 8: Open a Draft PR**

Base: `main`

Title:

```text
Add Skip Resume Readiness setup to Workflow Builder
```

Keep Merge / Release NO-GO until final Actions and independent review are green.
