# Task 1 report: minimal XLSX production compatibility

## Scope

- Passed the validated OOXML preflight entry list from `documentExtractor.ts` to `extractXlsx`.
- For archives missing both `xl/styles.xml` and `xl/sharedStrings.xml`, loads `fflate` dynamically, adds the trusted minimal SpreadsheetML stylesheet in memory, and gives `read-excel-file` the resulting Buffer.
- Leaves all other XLSX inputs on their original path and does not alter the source workbook.
- Added direct runtime `fflate@^0.8.3`; lockfile resolution for `read-excel-file` remains 9.3.1.

## RED evidence

Before production changes, I added the style/sharedStrings-free XLSX regression fixture and test, then ran:

```text
npm.cmd run compile
node --test test/ruleXlsxExtraction.test.js
```

The new test failed as expected with:

```text
TypeError: readFiles(...).then is not a function
```

Four existing style-bearing XLSX tests passed in the same run.

## GREEN evidence

After the implementation, the focused verification was run twice; the final run was:

```text
npm.cmd run compile
node --test test/ruleXlsxExtraction.test.js test/ruleAuthoringHeavyDependencyLoading.test.js test/dependencyPolicy.test.js test/ruleDocumentExtraction.test.js
git diff --check
```

Results: TypeScript compilation passed; all 30 focused tests passed; `git diff --check` passed.

The tests cover:

- style/sharedStrings-free two-sheet extraction, rows, locators, and unchanged source bytes;
- style-bearing and sharedStrings-bearing original-path extraction;
- preflight-to-XLSX context propagation;
- no `fflate` load at extension activation and a direct `xlsxExtractor` `fflate` load only for the missing-both path;
- dependency policy, lockfile root dependency set, and README documentation.

## Self-review

- Normalization happens after the existing preflight in the production document extraction flow.
- Errors from reading, unzip, zip, and parser calls are intentionally uncaught so the existing extraction error path receives them.
- No output workbook is written to disk; the source fixture is byte-for-byte unchanged after extraction.
- No GUI error handling or real-machine integration tests were edited.

## Commit

Product commit: `12aaff1bef7d8468b7eb85b3aaf0cecfdf1ea4d8`.

## Concerns

`read-excel-file` itself loads its transitive `fflate` module during ordinary parsing, so cache-absence after normal XLSX parsing is not a valid proof of this extension's lazy behavior. The heavy-dependency test therefore instruments module loading and verifies that `xlsxExtractor` itself requests `fflate` exactly once only on the missing-both path; activation still proves global cache absence.

## Review remediation: prototype-safe compatibility archive handling

### RED evidence

Added and ran two XLSX regressions before changing production code:

```text
npm.cmd run compile
node --test test/ruleXlsxExtraction.test.js test/ruleDocumentExtraction.test.js
```

The existing implementation failed both new XLSX tests with `Missing expected rejection.`:

- a real valid OOXML archive with an exact `__proto__` central-directory entry was accepted;
- a deliberately mismatched preflight entry list was accepted after unzip.

The public `extractRuleDocument` preflight regression already passed in that RED run: a real ZIP with duplicate `xl/workbook.xml` entries was rejected by preflight and made zero direct `xlsxExtractor` `fflate` load requests.

### GREEN evidence

The compatibility path now rejects exact `__proto__` before dynamic import/unzip with the pathless error `Unsafe XLSX compatibility entry`. After unzip, it copies only checked own `Uint8Array` entries named by the preflight result into an `Object.create(null)` record; any absent or unexpected mapping fails closed before `zipSync`.

Final focused verification:

```text
npm.cmd run compile
node --test test/ruleXlsxExtraction.test.js test/ruleDocumentExtraction.test.js test/ruleAuthoringHeavyDependencyLoading.test.js test/dependencyPolicy.test.js
git diff --check
```

Result: compilation passed; 33/33 tests passed; diff check passed. The amended dependency requirement remains: extension-owned direct `fflate` import is limited to missing-both XLSX compatibility, while activation is globally cache-clean; ordinary parser-owned transitive loading is not treated as an extension compatibility import.

Review-remediation product commit: `d09071049596e96236275f9f95df4bf5780ec4c2`.

## Final review remediation: bounded OOXML compatibility expansion

### RED evidence

Two controlled archives demonstrated that central-directory declarations alone were not an adequate compatibility boundary:

- a stored entry with one byte of physical payload but equal 1,024-byte central sizes passed the previous preflight and reached compatibility reconstruction;
- a deflated entry whose real output was 2 MiB but whose local and central uncompressed sizes declared one byte passed the previous compatibility path.

Both new regressions failed before the production change with `Missing expected rejection.`.

### Implementation

- Preflight now reconciles every central entry with its local header, raw filename, flags, compression method, CRC and ZIP32 sizes.
- Payload and optional signed or unsigned data-descriptor ranges must finish before the central directory, and local records must not overlap.
- The missing-both path reads only those validated payload ranges. Stored data must have exact length and CRC. Deflated data uses Node zlib with `maxOutputLength` set from the validated declared size, then requires exact output length, full compressed-input consumption and CRC equality.
- `fflate` is imported only after every entry passes bounded expansion; it is used to add the minimal stylesheet and rebuild the in-memory archive. Style- or sharedStrings-bearing workbooks continue to use the original file path.

### GREEN evidence

```text
npm.cmd run compile
node --test test/ruleOoxmlPreflight.test.js test/ruleXlsxExtraction.test.js test/ruleDocumentExtraction.test.js test/ruleAuthoringHeavyDependencyLoading.test.js
node --test test/realMachineDocumentFixtures.test.js test/ruleAuthoringGui.test.js test/dependencyPolicy.test.js
```

Result: compilation passed; the OOXML/XLSX group passed 69/69 and the real-machine/GUI/policy group passed 61/61. Coverage includes valid deflated missing-both XLSX, end-to-end extraction through signed and unsigned ZIP32 data descriptors, a finite preflight-derived decoder bound, truncated stored payload, local/central mismatch, under- and over-declared deflate output, trailing compressed input and CRC mismatch.

`read-excel-file@9.3.1` itself imports its transitive `fflate` dependency for value conversion, including on the ordinary original-path Node parser route. The lazy-load contract is therefore measured precisely: activation is globally cache-clean, ordinary XLSX makes zero extension-owned direct `fflate` requests, and only the missing-both compatibility path makes the direct dynamic request. The heavy-dependency regression also asserts the parser-owned transitive load explicitly so this distinction cannot become a false-green.

## Final integrated branch verification

```text
node --test scripts/real-machine-input-document-fixtures.test.js
npm.cmd test
npm.cmd run dependency:policy
npm.cmd run architecture:policy
npm.cmd run source:policy
npm.cmd run unused:policy
npm.cmd run unused:report
npm.cmd run artifact:policy
npm.cmd run audit:prod
npm.cmd run package
npm.cmd run package:policy
npm.cmd run package:smoke
npm.cmd run package:metrics
git diff --check
```

- Root real-machine fixture tests: 10/10 passed.
- Extension tests: 743 passed, one platform-specific skip, zero failures.
- All dependency, architecture, source, unused-code, artifact, production-audit and package gates passed.
- Fresh VSIX: `bob-bazaar-review-0.3.0.vsix`, 3,757,598 bytes, 1,821 entries, SHA-256 `8BC6137CF3245A837DD51D49A0934C73A99B337D29FF32F63573DE4C5E219F21`.
- The packaged and current compiled `out/ruleAuthoring/extraction/xlsxExtractor.js` both have SHA-256 `ED9B8A24212273469E984E09BA4C4FE3B3489F30B44DE733F2A209E2293AE735`.
