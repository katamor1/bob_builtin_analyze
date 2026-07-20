# Bob Review Input Document Fixtures Verification

## Scope

This record covers deterministic synthetic DOCX/XLSX/PDF generation, launcher opt-in wiring, common runner validation, and code-consistency DOCX/XLSX extraction. It does not claim Microsoft Office compatibility, Poppler PDF extraction, GUI behavior, or AI semantic review.

## Revision

- Branch: `agent/bob-review-document-input-fixtures-design`
- Remote implementation and CI revision: `04a728a083e69501c9e2422971a9c21f5c64044e`
- Pull request: `#141`
- GitHub Actions workflow: `extensions-quality` run `1160` (`29776977140`)
- Verification date: `2026-07-20`

The verification report itself is added after the tested implementation revision. No runtime or fixture-generation code is changed by this report.

## Automated commands

### Repository contracts

Command:

```text
node --test scripts/real-machine-test-environment.test.js scripts/real-machine-input-document-fixtures.test.js
```

Local result:

```text
exit code: 0
tests: 23
pass: 21
fail: 0
skipped: 2 (Windows-only process contracts)
```

The same command completed successfully in the Windows `Real-machine environment contracts` job for run `1160`.

### PowerShell manifest and generator validation

Command:

```text
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Windows CI result:

```text
exit code: 0
Document fixture profile valid: bazaar-core
Document fixture profile valid: consistency-ai-matrix
Manifest validation succeeded: 6 scenarios; selected=6
```

The local execution environment did not provide `pwsh`; the authoritative result for this command is the successful Windows CI step.

### Bazaar extension suite

Command from `extensions/bob-bazaar-review`:

```text
npm test
```

Local result:

```text
exit code: 0
tests: 684
pass: 684
fail: 0
skipped: 0
```

The `bob-bazaar-review` job and the `Windows / bob-bazaar-review` job also completed successfully in run `1160`, including compilation, launcher contracts, packaging, VSIX policy, and Extension Host smoke.

### Code-consistency extension suite

Command from `extensions/bob-code-consistency-review`:

```text
npm test
```

Local result:

```text
exit code: 0
tests: 286
pass: 286
fail: 0
skipped: 0
```

The suite includes `realMachineDocumentFixtures.test.js`, which generated the approved DOCX/XLSX fixtures, extracted them through the current document extractor, verified the five expected markers and table evidence, and verified that the supplemental PDF was not extracted. The `bob-code-consistency-review` job and the `Windows / bob-code-consistency-review` job also completed successfully in run `1160`.

## Determinism evidence

Generator:

```text
id: bob-review-input-document-fixtures
version: 1
```

Each profile was generated independently into two new directories. The corresponding binary SHA-256 sets were identical.

### `bazaar-core`

| Logical name | Media | SHA-256 | Bytes | Referenced by review input |
| --- | --- | --- | ---: | --- |
| `project-review-rules.docx` | DOCX | `35e351677a044c3f5fb4ef58e466e7e98f32656c4955737d7db8f2cdc30c4d69` | 3952 | no |
| `review-traceability-ledger.xlsx` | XLSX | `8e7f106173eb131a36f650bd907b87b311224d8cdd1528beff396cda9cde5bd6` | 6055 | no |
| `system-review-guidelines.pdf` | PDF | `199bf355f6530dd4bf0518f01c24f40f07e73e1cf05228ebae04f96ba433e26c` | 1288 | no |

### `consistency-ai-matrix`

| Logical name | Media | SHA-256 | Bytes | Referenced by review input |
| --- | --- | --- | ---: | --- |
| `requirements-and-design.docx` | DOCX | `8ecc9b7340d3cdfce85c7c5259053e81e914d6c4891474de3919f72341331d3f` | 3728 | yes |
| `verification-matrix.xlsx` | XLSX | `73df7fc223ed0b4e2adeedc1fdf6b0cfc78cf6f774548fc2b8c6bbe2b4b69f3c` | 3896 | yes |
| `supplemental-reference.pdf` | PDF | `7018209eed99ef3e912b290296a7ab178c7ed95441be71f4994c8743474c8f5c` | 713 | no |

The generator contract tests also verified stored-ZIP entry ordering and timestamps, required OOXML parts, the fixed PDF page tree and empty interior page, manifest byte sizes and hashes, existing-output refusal, unknown-profile refusal, and symlink/junction refusal.

## Launcher smoke evidence

| Smoke | Status | Evidence |
| --- | --- | --- |
| Bazaar no-GUI launcher with full VSIX/Bob/Bazaar prerequisites | not executed | The available local environment did not provide PowerShell, the three packaged VSIX inputs, expanded IBM Bob, and Bazaar CLI together. Static launcher contracts and both Linux/Windows extension suites passed. |
| Code-consistency no-GUI launcher with full VSIX/Bob prerequisites | not executed | The available local environment did not provide PowerShell and the packaged extension stack together. Static ordering contracts confirmed generation before Git initialization; automated extraction and both Linux/Windows extension suites passed. |

The automated contracts establish that:

- Bazaar document inputs are generated under the scenario-level `input-documents` directory, outside `bob-managed` and `bazaar-source`.
- Code-consistency document inputs are generated before the Git baseline commit.
- `review-input.yaml` references `requirements-and-design.docx` and `verification-matrix.xlsx`.
- `review-input.yaml` does not reference `supplemental-reference.pdf`.
- The common runner injects `IncludeDocumentFixtures` only for the two allowlisted profiles.
- Existing launcher behavior remains opt-in because the switch defaults to false.

## GitHub Actions evidence

`extensions-quality` run `1160` completed with conclusion `success` for revision `04a728a083e69501c9e2422971a9c21f5c64044e`.

| Job | Conclusion |
| --- | --- |
| `Real-machine environment contracts` | success |
| `bob-bazaar-review` | success |
| `bob-code-consistency-review` | success |
| `Windows / bob-bazaar-review` | success |
| `Windows / bob-code-consistency-review` | success |
| `workflow-register` | success |
| `Windows / workflow-register` | success |
| `Extension source metrics` | success |

The separate `code-consistency-review-scaffold` run `687` also completed successfully for the same revision.

## Pending manual UAT

The following remain pending until measured on a Windows operator machine with the packaged extensions, expanded IBM Bob, VS Code or Bob IDE, Bazaar CLI, and—where required—Poppler:

- `PRA-WIN-001` DOCX/XLSX/PDF file-picker and page locator behavior
- `CCR-RT-019` GUI/workflow DOCX extraction
- `CCR-RT-020` GUI/workflow XLSX extraction
- Poppler availability and PDF preview
- Original-document non-copy behavior after authoring interaction
- Developer Tools Console inspection

These operator cases remain `not_run`. Automated generation and extractor success do not convert them to `pass`.
