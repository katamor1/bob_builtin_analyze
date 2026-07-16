# Workflow Builder Skip Resume Readiness Supersession Record

## Decision

The closed RED/precursor branch `agent/workflow-recovery-ux-p1-builder-readiness-20260712` at `81e19775f9ce17242a39c7868085c50bc8eb9240` is superseded by merged PR #82, not an unimplemented feature that must be merged directly.

## Requirement mapping

| Precursor requirement | Current `main` evidence |
| --- | --- |
| Explicit `x-skipResume.fileBound` authoring state | `WorkflowAuthoringModel.skipResume`, loader, and serializer round-trip |
| Pure conflict-safe planner | `src/core/authoring/workflowSkipResumeReadiness.ts` |
| Shared preview/apply validation boundary | `src/core/authoring/workflowSkipResumeReadinessPreview.ts` |
| Builder Artifacts-tab setup flow | `src/webview/workflowBuilderSkipResumeReadinessScript.ts` |
| No automatic artifact overwrite | Planner conflict tests and PR #82 review record |
| Stale/cross-session preview rejection | Host/client readiness tests and PR #82 review record |
| Portable path and Windows reserved-name rejection | Focused planner tests and PR #82 final evidence |
| Unknown nested `x-skipResume` preservation | Loader/serializer tests and PR #82 final evidence |

## Merge evidence

- Precursor PR: #81 — closed without merge as RED/early implementation.
- Replacement PR: #82 — merged to `main` as `2b11323f9b5df81a56b3ea63b1c016bbb3f7f084`.
- Replacement final head: `10e80463816d9adf8d16f2f7623a57b17885f50f`.
- Replacement verification: 789 tests passed; Linux and Windows policy, package, VSIX, and Extension Host gates passed.

## Retirement rule

Delete the precursor and its diagnostic branch only when the fresh retirement audit confirms:

1. the replacement PR remains merged;
2. the required current-main paths exist;
3. temporary precursor workflows are absent from `main`;
4. neither branch is protected or referenced by an open PR;
5. each remote head still equals the audited exact SHA.
