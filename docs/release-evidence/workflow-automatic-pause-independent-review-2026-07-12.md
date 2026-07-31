Replaced: `workflowRegister.openOperationHub` and `workflowRegister.openWorkflowBuilder` are the current workflow operator routes; the legacy workflow control surface reference below is retained only as historical automatic-pause review evidence.

# Workflow Automatic Pause Independent Review

- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Scope: `extensions/workflow-register` automatic pause changes in draft PR #75
- Issue: #73
- Review state: repository implementation, current-main reconciliation, and hosted quality gates reviewed; external real-environment gates remain open

## Review scope

The review covered:

- `runControl.limits` model, parser, runtime schema, and public JSON Schema parity
- elapsed-time, agent-attempt, and timezone-aware local-cutoff evaluation
- safe checkpoint integration and the absence of force cancellation
- manual pause precedence and bounded automatic-pause overrides
- `control.json` and `workflow.pause` durability and reporting
- standalone and Bob runtime wiring
- backward compatibility for direct `BobWorkflowEngineRunner` construction
- Operation Hub revision validation before override mutation
- user, design, unit-test, real-machine, roadmap, and release-evidence documentation

## Findings and resolutions

### Important — Bob runner constructor compatibility

The first runtime wiring made `runControlStore` mandatory for every direct `BobWorkflowEngineRunner` construction. Existing adapters and tests that intentionally supplied only the historical options failed before workflow execution.

Resolution: the factory remains explicit in production, while the runner option is optional and falls back to the existing engine behavior when omitted. Existing direct construction paths therefore remain source-compatible.

### Important — local cutoff could reset after midnight

The first local-time evaluator compared only the current `HH:mm` to the cutoff. A run that crossed an 18:00 cutoff and reached its next checkpoint at 01:00 the following day could incorrectly appear to be before the cutoff again.

Resolution: the evaluator now compares timezone-local calendar dates as well as local time. Once a run spans a prior cutoff, the automatic pause remains due after midnight. A focused regression records RED before the production fix and GREEN afterward.

### Test-contract rebaseline — durable run state

Three older tests encoded pre-event-log assumptions:

- `listRuns()` was expected to fail the entire list for one unsafe run directory instead of isolating that run and reporting a diagnostic.
- an out-of-band `run.json` replacement was expected to load despite no longer matching the immutable event-log head.
- all transaction renames were counted when the test intended to verify retry of the materialized `run.json` replacement.

The tests now assert the current durability contract without weakening path containment, event-chain validation, or retry coverage.

## Verification performed

The reviewed branch was verified with Node.js 22 using:

```text
npm run compile
node --test test/workflowAutomaticPause*.test.js test/workflowRunStateDiagnostics.test.js
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm test
npm run package
npm run package:policy
git diff --check
```

All commands completed successfully against the same reviewed source tree before this report was committed.

## Review verdict

- Critical findings: 0 open
- Important findings: 0 open
- Minor findings: 0 open
- Repository implementation verdict: PASS
- Merge/release verdict: remains draft / NO-GO until external real-environment evidence is complete

## Final hosted-gate update

The final deliverable source tree was verified through temporary draft PR #80 without adding its trigger fixture to PR #75:

- `extensions-quality` run `29198637806`: success
- `workflow-contracts` run `29198637797`: success
- Ubuntu and Windows workflow-register unit, package, VSIX policy, and Extension Host smoke: success
- Ubuntu and Windows related-extension quality jobs: success

## Remaining gates

- IBM Bob real-environment pause, resume, and bounded-override confirmation
- inherited real Bazaar timeout / cancel process-cleanup evidence
- real multi-root Bob root / VCS root separation evidence

## Current-main reconciliation update

PR #75 was reconciled with main commit `57ff053bc3f476e3e9d268a743f25edeb0d68356` in merge commit `5e9bad7621e279314f58fbacdced591654fee576`. The bounded three-file conflict resolution retained current-main Phase 4 durability contracts and automatic-pause heartbeat-contention coverage. Reconciled-head runs `29199698139`, `29199698142`, and `29199698155` all completed successfully.
