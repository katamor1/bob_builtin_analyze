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

## Review method

1. mainとの差分をfile単位で確認した。
2. model compatibility、unknown front matter、artifact non-destructive behaviorを確認した。
3. preview/apply parityとstale response rejectionを確認した。
4. generated path segmentのworkspace / Windows portability boundaryを確認した。
5. Linux / Windows unit、policy、package、VSIX、Extension Host resultsを確認した。
6. temporary workflowが最終PR差分へ残らないcleanup手順を確認した。

## Findings fixed during review

### Important — applied model did not request a fresh readiness preview

Apply成功後に通常previewだけを更新する経路を修正し、cached readiness stateを破棄して適用済みmodelから再要求するtestを追加した。

### Important — generated path segments accepted traversal and reserved names

step ID / resultKeyをartifact pathへ埋め込む前にportable segment validationを行い、separator、traversal、末尾dot、Windows予約device名をblockするtestを追加した。

### Important — managed x-skipResume dropped unknown nested fields

`fileBound`以外の未知fieldをnested `unknownFrontMatter`へ保持し、serializerで管理値とmergeする回帰testを追加した。

## Final result

| Severity | Open findings |
| --- | ---: |
| Critical | 0 |
| Important | 0 |

## Verification used for review

- Full suite: 789 passed / 0 failed / 0 skipped.
- Focused/full evidence run: `29201666390`, success.
- Official Linux/Windows matrix: `29201666388`, success.
- Package、VSIX policy、Extension Host smoke: success on both platforms.

## Decision

Code and CI gate: **GO**.

Product release remains separately gated by real IBM Bob、Bazaar、multi-root、distribution-signing UAT.
