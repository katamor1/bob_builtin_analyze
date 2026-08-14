# Task 3: real-machine Bazaar fixture integration evidence

## Delivered test commit

- `8b06eeb2` `test(bazaar): cover real machine document fixtures`
- Added only `extensions/bob-bazaar-review/test/realMachineDocumentFixtures.test.js`.
- `f78b876b` `test(bazaar): scope fixture selectors by source`
- The regression now verifies every manifest record's own
  `expectedSelectors` against only the `aiChunks` for that record's
  `source_id`; XLSX `Rules` and `Verification` locators remain source-scoped.

## RED evidence

1. Created a disposable detached worktree at Task-1-absent commit
   `948a9df143656ccbbfc74e4fde285b2277645fd8`, copied only this improved
   test, ran `npm ci` from the worktree lockfile, and compiled the old
   `bob-bazaar-review` production source. Windows dependency cleanup stalled
   after the lockfile installation had populated dependencies, so the final
   compile used a validated junction to the feature worktree's complete,
   matching dependency tree; the junction was removed before worktree cleanup.
2. `node --test test/realMachineDocumentFixtures.test.js` failed 1/1 against
   that old source with the expected integration error:
   `TypeError: readFiles(...).then is not a function`. The stack flowed through
   `extractXlsx`, `extractRuleDocumentWithContext`, and
   `extractRuleDocuments`, proving the real integration RED rather than only
   a raw-library invocation.
3. The generated workbook deliberately omits `xl/styles.xml` and
   `xl/sharedStrings.xml`.

## GREEN evidence

- `npm.cmd run compile` in `extensions/bob-bazaar-review`: passed.
- `node --test test/realMachineDocumentFixtures.test.js`: 1/1 passed.
  The test generates the live `bazaar-core` fixture, reads manifest selectors,
  extracts DOCX and XLSX only, requires success and non-empty chunks for both,
  verifies distinct source IDs and hashes, finds `RULE-DOC-001` through
  `RULE-DOC-004`, and requires `Rules` and `Verification` XLSX locators.
- `node --test scripts/real-machine-input-document-fixtures.test.js`: 10/10
  passed, including the fixed OOXML entry-order contract proving the generated
  XLSX still omits both optional XML parts.

## Self-review and concerns

- The test owns and removes only its `bob-bazaar-real-machine-docs-*` temporary
  directory in `finally`.
- PDF is intentionally excluded from automation because its extractor depends
  on external `pdftotext`; manual IBM Bob acceptance retains that coverage.
- The disposable RED worktree was removed with `git worktree remove --force`
  and `git worktree prune`; only main and the feature worktree remain.
- Disposable node-module and fixture quarantines were moved outside the
  repository for controller cleanup; no quarantine content remains in the
  feature worktree.

## Final review remediation: independent fixture contract pins

The integration test no longer derives all of its expectations from the same generated manifest that supplies the source content. It independently pins the DOCX selector set, the XLSX selector set, and the XLSX locator set (`Rules`, `Verification`) before running the per-source manifest assertions. This makes source reassignment, sheet rename, or locator drift fail instead of allowing generator and expectation changes to agree with each other accidentally.
