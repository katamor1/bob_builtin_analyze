# Workflow Builder Skip Resume Readiness Whole-Diff Review

## Scope

- authoring model / loader / serializer
- pure readiness planner
- preview/apply strict-validation boundary
- Workflow Builder host messages
- Artifacts tab client behavior and styles
- round-trip, planner, preview, Webview, stale-response, path-boundary tests
- operator documentation and release evidence
- temporary workflow cleanup
- `bobGateLifecycle.test.js` test-only wall-clock stabilization
- latest-main PR merge-result verification

## Review method

1. mainとの差分をfile単位で確認した。
2. model compatibility、unknown front matter、artifact non-destructive behaviorを確認した。
3. preview/apply parityとstale response rejectionを確認した。
4. generated path segmentのworkspace / Windows portability boundaryを確認した。
5. Linux / Windows unit、policy、package、VSIX、Extension Host resultsを確認した。
6. 最終PR file listにtemporary workflowが残っていないことを確認した。
7. P1-1 production code後のtail commitを確認し、`49ce3001849820238e44c10a2ca33180796094ae`がtest-onlyであることを確認した。
8. 最新mainとの統合をPR merge result `61d3ed06defe14f6de5f737337712d0dc299be55`上の正式matrixで確認した。

## Findings fixed during review

### Important — applied model did not request a fresh readiness preview

Apply成功後に通常previewだけを更新する経路を修正し、cached readiness stateを破棄して適用済みmodelから再要求するtestを追加した。

### Important — generated path segments accepted traversal and reserved names

step ID / resultKeyをartifact pathへ埋め込む前にportable segment validationを行い、separator、traversal、末尾dot、Windows予約device名をblockするtestを追加した。

### Important — managed x-skipResume dropped unknown nested fields

`fileBound`以外の未知fieldをnested `unknownFrontMatter`へ保持し、serializerで管理値とmergeする回帰testを追加した。

### Test reliability — Bob gate regression used a one-second wall-clock race

`bobGateLifecycle.test.js`のreentrant rejection testは、productionのreentrant rejectionと後続mutation解放をそのまま検証しつつ、1秒の`Promise.race`をNode test runnerの20秒timeoutへ置き換えた。production source、public API、runtime behaviorには変更がない。

## Final result

| Severity | Open findings |
| --- | ---: |
| Critical | 0 |
| Important | 0 |

## Verification used for review

- Full suite: 789 passed / 0 failed / 0 skipped.
- Focused/full evidence run: `29201666390`, success.
- Implementation-head official Linux/Windows matrix: `29201666388`, success.
- Cleanup/evidence-head official Linux/Windows matrix: `29202077515`, success.
- Reviewed feature head matrix: `29202805399`, success.
- Latest-main merge-result matrix: `29203656774`, success; all 7 jobs completed unit tests, package, VSIX policy, and Extension Host smoke.
- Temporary `.github/workflows/workflow-builder-skip-resume-*` files: 0 in final PR diff.

## Decision

Code, CI, package, and latest-main integration gate: **GO**.

Product release remains separately gated by real IBM Bob、Bazaar、multi-root、distribution-signing UAT.
