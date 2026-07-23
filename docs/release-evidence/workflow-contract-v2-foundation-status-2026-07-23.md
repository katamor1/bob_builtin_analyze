# Workflow Contract v2 Foundation status — 2026-07-23

## Decision

F1–F7 implementation is present on `codex/workflow-contract-v2-f7`, but the Foundation phase gate is **not complete**. P1 must not start until the formal repository verification and seven-task commit evidence are recorded below.

## Task ledger

| Task | Implementation status | Evidence currently recorded | Commit evidence |
| --- | --- | --- | --- |
| F1 canonical JSON | complete | focused 34/34, compile success, independent review approved | exact task commit to recover at phase gate |
| F2 diagnostics/redaction | complete | focused 19/19, compile success, independent review approved | exact task commit to recover at phase gate |
| F3 local JSON Schema | complete | focused 121/121; source policy; full suite 1,402 pass / 1 skip / 0 fail; review C0/I0/M0 | checkpoint `b857340a` recorded in the Foundation plan; full SHA to recover |
| F4 strict YAML/package shape | implementation complete | source and focused test implementation present; formal phase replay pending | exact task commit to recover at phase gate |
| F5 shared predicate AST | implementation complete | source, golden fixture, and focused test implementation present; formal phase replay pending | exact task commit to recover at phase gate |
| F6 provider contract registry | implementation complete | registry implementation and boundary tests present through branch baseline `9a0bd62d817992bca8fa31f3b7c986c8c0fe97f8` | final F6 feature/fix commit set to recover at phase gate |
| F7 audited Bob profile | implementation complete; review/gate pending | exact `IBM.bob-code@2.0.1` profile, digest, two-stage binding, explicit P4/R5 task-binding handoff, stale-registration cleanup, and real-probe lifecycle integration present | current implementation/test head `a9c994290c045be48d8a1dc85e870ed78bf55b13`; final reviewed head not yet frozen |

## F7 fixed evidence

- Extension: `IBM.bob-code@2.0.1`
- Profile digest: `sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73`
- Compile/registration capabilities: `registerSource`; source `deactivate`, `log`, `registerWorkflow`
- Runtime task capabilities: `getAllMetadata`, `getMessages`, `sendMessage`, `setStepComplete`, `startSubagent`, `toSerializable`
- `adaptCoreWorkflowForBob` requires a real caller-supplied task binding.
- The legacy v1 loader supplies the audited six-capability binding explicitly and does not claim to produce Contract v2 lock evidence.
- P4/R5 will supply each compiled plan's exact digest and task-capability subset through that explicit adapter boundary.
- The task probe is pure and the original task object reaches the existing runner.
- Proxy, accessor, missing, non-callable, callable-proxy, ordering, duplicate, sparse, extra-field, version, profile-drift, and stale-registration cases fail closed.

## Fresh isolated verification

These checks were executed against reconstructed copies of the current relevant source blobs. They are useful focused evidence, but they are **not** the repository Gate F or full extension suite.

```text
profile/factory strict TypeScript compile: exit 0
focused profile/factory harness: 48 test events / 48 pass / 0 fail
explicit legacy/compiled binding boundary strict TypeScript compile: exit 0
binding-boundary source tests: 2 pass / 0 fail
legacy real-probe plus original-task-identity integration harness: pass
```

## Review record

Codex reviews reported five actionable findings:

1. Probe exact workflow task-capability subset — fixed and resolved.
2. Do not mutate legacy task fixtures — fixed and resolved.
3. Close the production handoff gap — fixed by introducing an explicit adapter binding argument.
4. Run legacy lifecycle factory cases through the real probe — fixed and resolved.
5. Remove the false legacy-compiler cast — fixed; the v1 loader now supplies only its explicit legacy binding, while P4/R5 owns compiled-plan evidence.

A final independent re-review of the current/final head remains required. Critical and Important findings must be zero before the Foundation gate can close.

## Hosted CI infrastructure blocker

The current-head `extensions-quality` and `workflow-contracts` runs terminate before repository code executes. Linux and Windows jobs report no steps and no logs. Failed-job reruns reproduce the same zero-step result. These runs provide no product pass/fail evidence.

## Outstanding Foundation gate

- [ ] synchronize the detailed Foundation plan F4–F7 headings and checkboxes
- [x] synchronize the master 34-task ledger
- [ ] record exact task commit hashes for F1–F7
- [ ] synchronize the branch with current `main` and resolve conflicts
- [ ] `npm run compile`
- [ ] exact Gate F focused command
- [ ] `npm run dependency:policy`
- [ ] `npm run architecture:policy`
- [ ] `npm run source:policy`
- [ ] full `npm test`
- [ ] `git diff --check`
- [ ] final independent specification/code-quality review with Critical=0 and Important=0

Foundation remains open and PR #143 remains draft until every item is recorded with fresh executable evidence.
