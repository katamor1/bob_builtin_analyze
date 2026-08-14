# Task 2 report: rule-authoring GUI host error diagnostics

## Scope

- Added an injectable `reportHostError(error)` dependency to the rule-authoring GUI host.
- The production default sends the fixed prefix `Bob Bazaar 規約資料取り込みで処理エラーが発生しました` and the original error object to `console.error`.
- Reports the original error once at each required host boundary: queued Webview operation, initial controller render, and outer GUI open.
- Preserves the existing pathless Japanese `showErrorMessage` text verbatim. The queued-operation boundary reports before testing disposal, so a disposed controller can suppress UI work without suppressing the host diagnostic.

## RED evidence

Before changing production code, I added the three injected-recorder tests and ran:

```text
node --check test/ruleAuthoringGui.test.js
node --test test/ruleAuthoringGui.test.js
```

The three new tests failed as expected because the recorder was empty:

- queued Webview operation failure;
- initial controller render failure;
- outer GUI-open failure.

The run reported 45 passing and 3 failing assertions; each failure expected its original `Error` object and received `[]`.

## GREEN evidence

Final verification:

```text
npm.cmd run compile
node --test test/ruleAuthoringGui.test.js
git diff --check
```

Result: TypeScript compilation passed; all 48 focused GUI test assertions passed; `git diff --check` passed.

The new tests inject `reportHostError`, assert identity equality and exactly one report for all three boundaries, and verify the safe Japanese UI text does not contain the private path or original exception text. Existing GUI lifecycle and cancellation tests remain green in the same focused run.

## Self-review

- Only the three required host catch boundaries receive the original errors.
- The user-visible error remains the fixed, pathless Japanese text; no exception fields are added to Webview state or `showErrorMessage`.
- The default logger uses `console.error` with the required fixed prefix and preserves the original error object as the second argument.
- No XLSX, dependency, generator, or real-machine integration files were changed.

## Commit

Product commit: `f9059444a429d55ecd7d08cdefe5064e65724639`.

## Concerns

None.

## Review remediation: best-effort diagnostics

### RED evidence

Before changing production code, I added three tests with an injected reporter that records the original error and then throws. The focused GUI run failed at all required host boundaries:

```text
node --test test/ruleAuthoringGui.test.js
```

- queued Webview operation recovery rejected with `diagnostics unavailable` instead of showing the safe UI and remaining cancellable;
- initial controller render and outer GUI-open produced unhandled rejections from the diagnostics failure;
- the run had 49 passing and 4 failing tests (the fourth was the new disposed-operation test before its asynchronous extraction start was explicitly synchronized).

After adding the explicit in-test source-manifest stub and waiting for the extraction call to start, the disposed-operation test establishes the intended pre-existing ordering: an operation rejected after panel disposal reports the exact original error once, emits no safe UI notification, and settles cancelled.

### GREEN evidence

The production fix uses a narrow `reportHostErrorSafely` helper at the same three host catch boundaries. It swallows only failures from the injected/default reporter, so the original failure path retains its existing safe UI and settlement behavior.

Final verification:

```text
npm.cmd run compile
node --test test/ruleAuthoringGui.test.js
git diff --check
```

Result: TypeScript compilation passed; all 53 focused GUI tests passed; `git diff --check` passed.

The new coverage verifies all three throwing-reporter boundaries, explicit report count plus strict original-object identity, disposed queued rejection behavior, and the production default `console.error("Bob Bazaar 規約資料取り込みで処理エラーが発生しました", originalError)` call.

### Review-remediation commit

Product commit: `cec9c6e58d46d6e49144ae784bdeadbc4148a8d1`.

### Review-remediation concerns

None. The console reporter test is marked non-concurrent and restores `console.error` in `finally`.

## Final review remediation: persistent render recovery and queue continuity

The queued-operation recovery now treats both the failure-model render and host diagnostic callback as best-effort boundaries while always attempting the fixed safe VS Code notification. Regression coverage keeps the recovery renderer failing persistently, verifies the original error is reported exactly once without leaking its text or path, and then sends a second ordinary non-cancel Webview operation under a bounded wait to prove the message queue remains usable. The initial-render failure test also requires the failed panel to be disposed.

Focused verification after this remediation passed as part of the 55/55 GUI suite.
