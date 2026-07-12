# Deterministic Workflow Automatic Pause Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Production behavior changes require a focused failing regression first.

**Goal:** Add provider-independent automatic workflow pause limits for elapsed run time, agent-call count, and local-time cutoff while preserving graceful pause semantics and current run durability contracts.

**Architecture:** Extend the v1 workflow definition with optional `runControl.limits`, normalize workspace settings into the same limit type, and evaluate both policies through a pure automatic-pause evaluator at existing engine checkpoints. Manual pause requests remain authoritative and are checked first. Automatic pauses persist a structured `workflow.pause` record. A bounded override is stored in `control.json`, suppresses only automatic limits until expiry, and never suppresses a manual pause request.

**Tech Stack:** TypeScript, Node.js built-in test runner, AJV/JSON Schema, VS Code Extension API, `Intl.DateTimeFormat`, existing `WorkflowEngine`, `FileRunControlStore`, and run diagnostics.


## Execution Status

- Repository implementation: complete on draft PR #75.
- Focused automatic-pause tests: GREEN.
- Full workflow-register suite: GREEN on Ubuntu and Windows.
- Dependency, architecture, source, and schema policies: GREEN.
- Package and VSIX policy: GREEN.
- Extension Host smoke: GREEN on Ubuntu and Windows.
- Strict workflow contract validation: GREEN.
- Independent review: Critical 0 / Important 0 / Minor 0 open.
- Temporary diagnostic and mutation workflows: removed from the deliverable branch.
- Pull request state: remains draft while current-main reconciliation and external real-environment evidence are open.

## Global Constraints

- Do not force-cancel an in-flight agent, command, process, or Bob subagent.
- Evaluate automatic limits only at existing safe checkpoints before preflight/steps or after a completed step.
- `run.json` remains the materialized execution-state source of truth.
- `control.json` remains the operator-control source of truth.
- Manual pause requests always win over automatic-limit overrides.
- Existing workflows without `runControl` remain byte-for-byte behavior compatible.
- Current run/control schema version strings remain unchanged; new fields are optional.
- Invalid timezones and malformed local times fail semantic workflow validation.
- Workspace and workflow policies are evaluated independently; the first due limit pauses the run, which is equivalent to applying the stricter policy without attempting to merge incompatible schedules.
- Tests inject a clock; no fixed sleeps or wall-clock assumptions.

---

### Task 1: Define and Validate the Workflow Contract

**Files:**
- Create: `extensions/workflow-register/test/workflowAutomaticPauseDefinition.test.js`
- Modify: `extensions/workflow-register/src/core/modelSchema.ts`
- Modify: `extensions/workflow-register/src/core/schema/workflowSchema.ts`
- Modify: `extensions/workflow-register/schema/workflow-register.v1.schema.json`
- Modify: `extensions/workflow-register/src/core/parser/normalizers.ts`
- Modify: `extensions/workflow-register/src/core/parser/parseV1Workflow.ts`
- Modify: `extensions/workflow-register/src/core/workflowCompiler.ts`

**Interfaces:**

```ts
export interface WorkflowRunControlLimitsDefinition {
  maxRunMinutes?: number
  maxAgentStepsPerRun?: number
  pauseAtLocalTime?: string
  timezone?: string
}

export interface WorkflowRunControlDefinition {
  limits?: WorkflowRunControlLimitsDefinition
}
```

- [x] Add RED parser/schema tests for all four fields and exact round-trip normalization.
- [x] Add RED semantic-validation tests for zero/negative limits, malformed `HH:mm`, missing timezone when a cutoff exists, and unknown IANA timezone.
- [x] Add the model and both schema copies with `additionalProperties: false` inside `runControl` and `limits`.
- [x] Add `normalizeRunControl()` and parse the normalized value into `CoreWorkflowDefinition.runControl`.
- [x] Add semantic validation using `Intl.DateTimeFormat(..., { timeZone })` and exact `HH:mm` parsing.
- [x] Run compile plus the focused test and schema policy; record GREEN.
- [x] Commit: `feat: define workflow automatic pause limits`.

### Task 2: Implement the Pure Evaluator and Engine Checkpoints

**Files:**
- Create: `extensions/workflow-register/test/workflowAutomaticPause.test.js`
- Create: `extensions/workflow-register/src/core/engine/automaticPause.ts`
- Modify: `extensions/workflow-register/src/core/engine/runPause.ts`
- Modify: `extensions/workflow-register/src/core/engineTypes.ts`
- Modify: `extensions/workflow-register/src/core/engine.ts`

**Interfaces:**

```ts
export interface AutomaticPausePolicySource {
  source: "workflow" | "workspace"
  limits: WorkflowRunControlLimitsDefinition
}

export interface AutomaticPauseDecision {
  kind: "maxRunMinutes" | "maxAgentStepsPerRun" | "pauseAtLocalTime"
  source: "workflow" | "workspace"
  limit: Record<string, unknown>
  observed: Record<string, unknown>
}

export function evaluateAutomaticPause(input: {
  run: WorkflowRunState
  nextStep?: EngineStep
  now: Date
  policies: AutomaticPausePolicySource[]
  override?: WorkflowAutomaticPauseOverride
}): AutomaticPauseDecision | undefined
```

- [x] Add RED pure-evaluator tests for boundary-before, exact-boundary, and after-boundary behavior.
- [x] Prove `maxAgentStepsPerRun` blocks only the next agent call and counts archived/current attempts deterministically.
- [x] Prove each policy source is evaluated independently and the deterministic tie-break is workflow policy, then workspace policy, then limit kind.
- [x] Prove an active override suppresses automatic decisions and an expired override does not.
- [x] Add a clock and optional workspace limits to `WorkflowEngineOptions`.
- [x] Evaluate manual pause first; if none exists, evaluate automatic limits.
- [x] Persist a structured `workflow.pause` record with schema version, kind, source, checkpoint, next step, limit, observed value, and detected time.
- [x] Save and emit through the existing paused-run hook without starting the next step.
- [x] Run focused engine tests and existing pause/recovery suites; record GREEN.
- [x] Commit: `feat: pause workflows at deterministic limits`.

### Task 3: Add Bounded Resume Overrides

**Files:**
- Create: `extensions/workflow-register/test/workflowAutomaticPauseOverride.test.js`
- Modify: `extensions/workflow-register/src/core/runtime/runControlStore.ts`
- Modify: `extensions/workflow-register/src/core/runControlStore.ts`
- Modify: `extensions/workflow-register/src/commands/runControl.ts`
- Modify: `extensions/workflow-register/src/core/engine/runPause.ts`

**Interfaces:**

```ts
export interface WorkflowAutomaticPauseOverride {
  schemaVersion: "workflow-register/automatic-pause-override/v1"
  createdAt: string
  expiresAt: string
  requestedBy: string
  reason: string
}

setAutomaticPauseOverride(input): Promise<RunControlState>
clearAutomaticPauseOverride(runId): Promise<RunControlState>
```

- [x] Add RED store tests for persist/load, expiry, replacement, and future-run read-only protection.
- [x] Prove `clearPause()` does not silently discard an explicitly created unexpired override.
- [x] Add a pure resume-choice helper that offers 15/30/60 minute overrides for an automatic pause and requires a non-empty reason.
- [x] Keep programmatic/manual pauses on the current resume path without an override prompt.
- [x] Add command tests for cancel, valid override, and stale/revision-checked Operation Hub invocation.
- [x] Ensure manual pause requests remain effective even with an active override.
- [x] Run focused store/command/engine tests; record GREEN.
- [x] Commit: `feat: allow bounded automatic pause overrides`.

### Task 4: Wire Workspace Settings, Diagnostics, and Documentation

**Files:**
- Create: `extensions/workflow-register/test/workflowAutomaticPauseRuntimeWiring.test.js`
- Modify: `extensions/workflow-register/package.json`
- Modify: `extensions/workflow-register/src/workflowRuntimeFactory.ts`
- Modify: `extensions/workflow-register/src/bobWorkflowRunner.ts`
- Modify: `extensions/workflow-register/src/core/runDiagnostics.ts`
- Modify: `extensions/workflow-register/README.md`
- Modify: `extensions/workflow-register/docs/basic-design-ja.md`
- Modify: `extensions/workflow-register/docs/detailed-design-ja.md`
- Modify: `extensions/workflow-register/docs/unit-test-spec-ja.md`
- Modify: `extensions/workflow-register/docs/real-machine-test-spec-ja.md`
- Modify: `docs/workflow-register-feature-roadmap-2026-07-11.md`

**Workspace settings:**

```json
{
  "workflowRegister.runControl.maxRunMinutes": 0,
  "workflowRegister.runControl.maxAgentStepsPerRun": 0,
  "workflowRegister.runControl.pauseAtLocalTime": "",
  "workflowRegister.runControl.timezone": "Asia/Tokyo"
}
```

`0`/empty means disabled at the settings boundary. Only positive normalized limits reach the evaluator.

- [x] Add RED wiring tests proving standalone and Bob runners receive the same workspace policy.
- [x] Add package contributions with safe disabled defaults and bounded numeric settings.
- [x] Read settings once per engine/runner creation and normalize invalid workspace values by disabling only that field while preserving valid fields.
- [x] Add structured automatic-pause details and override details to Run Diagnostics and Run Control inspection.
- [x] Update user, design, unit-test, and real-machine documentation.
- [x] Rebaseline the roadmap: mark PR cleanup and run-state migration complete, link Issue #73, and record automatic-pause implementation status.
- [x] Run the full `workflow-register` compile, policies, test suite, package, VSIX policy, and `git diff --check` through GitHub Actions.
- [x] Perform an independent whole-branch review and fix every Critical/Important finding.
- [x] Commit: `docs: document workflow automatic pause controls`.

### Final Verification

- [x] Focused definition, evaluator, override, runtime wiring, diagnostics, and command tests pass.
- [x] Existing pause/resume, Bob gate, operation-hub mutation, run migration, durability, and schema-contract tests pass.
- [x] `npm run dependency:policy`
- [x] `npm run architecture:policy`
- [x] `npm run source:policy`
- [x] `npm run schema:policy`
- [x] `npm test`
- [x] `npm run package`
- [x] `npm run package:policy`
- [x] Ubuntu and Windows extension-quality jobs pass.
- [x] Extension Host smoke passes.
- [x] Workflow contract CI passes.
- [x] PR remains draft until all repository and external real-environment release gates are explicitly evidenced.


## Remaining Verification Outside This Implementation Slice

- [ ] Reconcile draft PR #75 with the current `main` branch and re-run required checks on the reconciled head.
- [ ] Confirm pause, resume, and bounded override in a real IBM Bob environment.
- [ ] Confirm inherited real Bazaar timeout / cancel process cleanup evidence.
- [ ] Confirm Bob root / VCS root separation in a real multi-root workspace.
