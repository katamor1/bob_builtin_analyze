# Workflow Builder Skip Resume Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Execute tasks in order and keep Merge / Release NO-GO until final-head evidence is green.

**Goal:** Add a preview-first, non-destructive Skip Resume Readiness setup to Workflow Builder.

**Architecture:** A pure authoring-core planner discovers reusable outputs, detects artifact conflicts, produces a deterministic diff, and applies only a previously previewed selection. Loader/serializer own round-trip of `x-skipResume`. Webview and panel are thin adapters around the shared planner.

**Tech Stack:** TypeScript, Node built-in test runner, js-yaml, VS Code Webview panel, existing workflow compiler/validator.

## Global constraints

- Never overwrite an existing artifact definition automatically.
- Never invent a resultKey for an agent step.
- Preview and apply must use one planner.
- Applying changes mutates only a clone; Builder file save remains explicit.
- Existing workflows without `x-skipResume` remain byte-semantically compatible.
- Strict validation remains the final authoring gate.

---

### Task 1: Define RED authoring-core contracts

**Files:**
- Create: `extensions/workflow-register/test/workflowSkipResumeReadiness.test.js`
- Modify: `extensions/workflow-register/test/workflowAuthoringLoader.test.js`
- Modify: `extensions/workflow-register/test/workflowAuthoringSerializer.test.js`

- [ ] Add candidate discovery tests for step, manual form, and manual approval result keys.
- [ ] Require agent/command/manual default schema and run-scoped paths.
- [ ] Require existing matching artifacts to remain unchanged.
- [ ] Require ID/path conflicts to fail closed without mutating the input model.
- [ ] Require deterministic preview diff and preview/apply parity.
- [ ] Require `x-skipResume.fileBound` loader/serializer round-trip.
- [ ] Commit RED tests before production implementation.

### Task 2: Implement authoring model round-trip

**Files:**
- Modify: `extensions/workflow-register/src/core/authoring/workflowAuthoringModel.ts`
- Modify: `extensions/workflow-register/src/core/authoring/workflowAuthoringLoader.ts`
- Modify: `extensions/workflow-register/src/core/authoring/workflowAuthoringSerializer.ts`

- [ ] Add typed `skipResume` authoring state.
- [ ] Treat `x-skipResume` as GUI-managed front matter.
- [ ] Load normalized `fileBound` state.
- [ ] Serialize only the opt-in `fileBound: true` form.
- [ ] Preserve unrelated `x-*` fields through `unknownFrontMatter`.

### Task 3: Implement the pure readiness planner

**Files:**
- Create: `extensions/workflow-register/src/core/authoring/workflowSkipResumeReadiness.ts`
- Create: `extensions/workflow-register/src/core/workflowSkipResumeReadiness.ts`

- [ ] Define candidate, conflict, warning, plan, and apply result types.
- [ ] Discover all result-key producers deterministically.
- [ ] Infer default schema/extension by producer type.
- [ ] Generate contained run-scoped paths.
- [ ] Detect duplicate ID, cross-producer ID, and non-run-scoped matching artifact conflicts.
- [ ] Preserve ready and unrelated artifacts exactly.
- [ ] Produce deterministic human-readable diff.
- [ ] Apply only valid selected candidates to a deep clone.

### Task 4: Add panel preview/apply protocol

**Files:**
- Modify: `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`

- [ ] Add `previewSkipResumeReadiness` and `applySkipResumeReadiness` messages.
- [ ] Store preview tokens per active Builder session.
- [ ] Bind tokens to model/selection fingerprint.
- [ ] Reject stale, cross-session, or changed-model apply requests.
- [ ] Validate the proposed model through the existing serializer/compiler.
- [ ] Return structured candidate, warning, error, diff, and diagnostics data.

### Task 5: Add Artifacts-tab UX

**Files:**
- Modify: `extensions/workflow-register/src/webview/workflowBuilderClientStateScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderTabRenderersScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderFieldEventsScript.ts`
- Modify: `extensions/workflow-register/src/webview/workflowBuilderActionEventsScript.ts`

- [ ] Render current readiness status and output candidates.
- [ ] Allow candidate-level selection.
- [ ] Show resultKey-missing warnings without auto-fixing.
- [ ] Add preview and apply actions.
- [ ] Show generated artifact summary and deterministic diff.
- [ ] Disable apply on conflicts or stale preview.
- [ ] Clear preview whenever the form model changes.

### Task 6: Add Builder integration tests

**Files:**
- Create: `extensions/workflow-register/test/workflowBuilderSkipResumeReadiness.test.js`
- Modify: `extensions/workflow-register/test/workflowBuilderTransactionalSave.test.js` if needed

- [ ] Test HTML controls and client message contract.
- [ ] Test panel preview/apply routing with mocked VS Code.
- [ ] Test stale token rejection after session or model changes.
- [ ] Test successful apply followed by existing validation/save behavior.
- [ ] Test edit round-trip without dropping existing extension metadata.

### Task 7: Documentation and release evidence

**Files:**
- Create: `extensions/workflow-register/docs/workflow-skip-resume-readiness-ja.md`
- Create: `docs/release-evidence/workflow-skip-resume-readiness-2026-07-12.md`
- Modify: `extensions/workflow-register/docs/README-ja.md`

- [ ] Document operator workflow and conflict behavior.
- [ ] Record RED/GREEN commits and final-head commands.
- [ ] Record residual risks and explicit P1-2/P1-3/P1-4 non-scope.

### Task 8: Final verification and review

- [ ] `npm run compile`
- [ ] focused readiness, loader, serializer, Builder tests
- [ ] `npm test`
- [ ] dependency / architecture / source / schema policies
- [ ] unused report and production audit
- [ ] package and VSIX policy
- [ ] Ubuntu / Windows Extension Host matrix
- [ ] `git diff --check`
- [ ] focused independent review: Critical 0 / Important 0
- [ ] synchronize PR body and release evidence on the same final head

## Completion rule

The feature is implementation-complete only when the form model can be previewed and applied without silent overwrite, saved output passes strict validation, YAML/GUI round-trip preserves the opt-in state, and all final-head gates above are green.
