# Bob Evidence Scope Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 1 `bob-evidence-scope` domain into `preprocessReview` and emit an auditable `review-package/context-budget-report.json` artifact linked from `manifest.yaml`.

**Architecture:** A focused pipeline adapter converts validated `ReviewInput`, `DiffSummary`, document evidence, code analysis, and normalized limits into the existing Phase 1 domain calls. `buildReviewPackage` receives the resulting artifact as an optional typed input, treats it as a managed output, writes it atomically through the existing JSON helper, and records the handoff path in the package manifest.

**Tech Stack:** TypeScript 5.x, CommonJS, Node.js built-in test runner, existing YAML/JSON helpers, no new npm dependency.

## Global Constraints

- The existing VCS diff, code analysis, and document extraction remain the source of truth.
- `preprocessReview` keeps its public input and result shapes compatible.
- `context-budget-report.json` contains identities, priorities, token estimates, reasons, fingerprints, rule metadata, and unresolved impact; it does not duplicate raw source, raw diff, or raw document bodies.
- Project rules come only from `review-input.bob_options.evidence_scope_rules` in Phase 2.
- Invalid rule entries produce deterministic warnings and do not abort preprocessing.
- The token budget is `max(1, floor(maxBobInputBytes / 4))`, matching Phase 1's `ceil(text.length / 4)` estimate while remaining bounded by the existing review-input limit.
- Dependency depth uses `analysis_options.max_call_depth`, defaulting to `1` when absent.
- The artifact is a managed package output and stale copies are removed on every package rebuild.
- `manifest.yaml` records the workspace-relative `context_budget_report` path only when the artifact is supplied.
- No new npm dependency is introduced.

---

### Task 1: Lock the pipeline and freshness contracts with failing tests

**Files:**
- Create: `extensions/bob-code-consistency-review/test/evidenceScopePipeline.test.js`

**Interfaces:**
- Consumes: `preprocessReview(input)` and `buildReviewPackage(input)`.
- Requires: `context-budget-report.json` generation, manifest linkage, warning propagation, and stale-artifact cleanup.

- [ ] **Step 1: Write the failing pipeline test**

Create a multi-language fixture workspace, append one valid language-scoped rule and one invalid rule, call `preprocessReview`, and assert:

```js
assert.equal(report.schema_version, 1)
assert.equal(report.selection_policy, "bob-evidence-scope-v1")
assert.equal(report.source_revision, "main..feature/multi-language-git-review")
assert.equal(report.budget.budgetTokens, 524288)
assert.ok(report.applicable_rules.some((rule) => rule.id === "typescript-change"))
assert.ok(report.warnings.some((warning) => warning.includes("broken-rule")))
assert.match(manifest, /context_budget_report: \.bob-review\/review-package\/context-budget-report\.json/)
```

- [ ] **Step 2: Write the failing freshness test**

Pre-create `context-budget-report.json`, call `buildReviewPackage` without a current artifact, and assert the stale file no longer exists.

- [ ] **Step 3: Verify RED**

Run:

```bash
cd extensions/bob-code-consistency-review
npm test
```

Expected: FAIL because the pipeline does not emit the report and the package cleaner does not manage the stale file.

### Task 2: Build the review-context artifact adapter

**Files:**
- Create: `extensions/bob-code-consistency-review/src/evidenceScope/reviewContextBudget.ts`
- Modify: `extensions/bob-code-consistency-review/src/evidenceScope/index.ts`

**Interfaces:**
- Produces: `buildReviewContextBudget(input): { artifact: ContextBudgetArtifact; warnings: string[] }`.
- Consumes: `parseProjectRules`, `buildReviewEvidenceScope`, and `createContextBudgetArtifact`.

- [ ] **Step 1: Parse and normalize pipeline configuration**

Read `bob_options.evidence_scope_rules`, `bob_options.evidence_scope_include_low_priority`, `analysis_options.max_call_depth`, ticket IDs, review focus, review ID, title, and purpose. Deduplicate and sort document keywords.

- [ ] **Step 2: Build the Phase 1 scope**

Use:

```ts
const scope = buildReviewEvidenceScope(codeAnalysis, documents, {
  tokenBudget: Math.max(1, Math.floor(limits.maxBobInputBytes / 4)),
  maxDependencyDepth: reviewInput.analysis_options?.max_call_depth ?? 1,
  rules: parsedRules.rules,
  documentKeywords,
  includeLowPriority: reviewInput.bob_options?.evidence_scope_include_low_priority === true
})
```

- [ ] **Step 3: Merge deterministic warnings and serialize**

Sort and deduplicate parser and scope warnings, preserve them in the returned artifact, and set:

```ts
{
  tokenEstimation: "ceil(text.length / 4); budget=floor(maxBobInputBytes / 4)",
  ruleSource: rawRules === undefined
    ? "none"
    : "review-input.bob_options.evidence_scope_rules"
}
```

- [ ] **Step 4: Export the adapter explicitly**

Add named exports only; do not introduce `export *`.

### Task 3: Emit and link the managed report

**Files:**
- Modify: `extensions/bob-code-consistency-review/src/core/pipeline.ts`
- Modify: `extensions/bob-code-consistency-review/src/core/reviewPackageBuilder.ts`

**Interfaces:**
- `preprocessReview` passes `contextBudgetArtifact` to `buildReviewPackage` and includes its warnings in the returned warning list.
- `buildReviewPackage` accepts `contextBudgetArtifact?: ContextBudgetArtifact`.

- [ ] **Step 1: Build the artifact after code and document analysis**

Call `buildReviewContextBudget` before traceability/package generation.

- [ ] **Step 2: Write the managed JSON artifact**

Add `context-budget-report.json` to `MANAGED_PACKAGE_OUTPUTS`. When supplied, write it with `writeJsonFile`.

- [ ] **Step 3: Link the artifact from the manifest**

Under `inputs`, write the workspace-relative path:

```yaml
context_budget_report: .bob-review/review-package/context-budget-report.json
```

Omit the line when `buildReviewPackage` is called without an artifact.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd extensions/bob-code-consistency-review
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:report
npm run audit:prod
npm run package
npm run package:policy
```

Expected: all commands exit `0`.

### Task 4: Commit implementation and verification evidence

**Files:**
- Create: `docs/implementation/bob-evidence-scope-phase2-2026-07-12.md`
- Create: `docs/implementation/bob-evidence-scope-phase2-verification-2026-07-12.md`
- Create: `docs/implementation/bob-evidence-scope-phase2-manifest.json`
- Modify: `extensions/bob-code-consistency-review/docs/evidence-scope-domain-contract-ja.md`
- Modify: `docs/superpowers/plans/2026-07-12-bob-evidence-scope-phase2.md`

**Interfaces:**
- Produces reviewable implementation, validation, and checksum records for the committed files.

- [ ] **Step 1: Record behavior and boundaries**

Document the pipeline order, configuration source, budget derivation, managed-output semantics, manifest handoff, privacy properties, and Phase 3 boundary.

- [ ] **Step 2: Record RED and GREEN evidence**

Include the failing test names/reasons, final test counts, policy checks, audit, VSIX packaging result, and CI run conclusions.

- [ ] **Step 3: Generate the SHA-256 manifest**

Record each Phase 2 source, test, plan, and documentation path with byte size and SHA-256 digest.

- [ ] **Step 4: Commit**

Commit the implementation and all evidence to `codex/execute-shared-plan-6a53743e`, keeping PR #72 in draft state until CI succeeds.

## Self-review

- **Spec coverage:** The plan covers pipeline wiring, report emission, manifest handoff, warnings, managed-output freshness, privacy, validation, and committed evidence.
- **Placeholder scan:** No implementation placeholder is present; every task names exact files, APIs, commands, and expected results.
- **Type consistency:** `ContextBudgetArtifact`, `buildReviewContextBudget`, `contextBudgetArtifact`, and `context_budget_report` are used consistently across adapter, pipeline, package builder, tests, and documentation.
