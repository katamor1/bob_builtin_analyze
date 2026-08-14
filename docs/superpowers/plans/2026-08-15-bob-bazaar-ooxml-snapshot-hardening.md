# Bob Bazaar Validated OOXML Snapshot Hardening Implementation Plan

**Goal:** Validate every selected DOCX/XLSX archive from one fingerprint-bound in-memory snapshot before a third-party parser sees it, while preserving the minimal-XLSX stylesheet compatibility path and every public contract.

**Base:** `main` at `7aaab7d0b8d163495ab48222f20cc99d95ffab7c`.

## Global constraints

- Public commands, configuration, persisted schemas, user-facing safe error text, and extension version do not change.
- `read-excel-file@9.3.1` and `fflate@0.8.3` remain locked; the extension-owned direct `fflate` import remains limited to an XLSX missing both `xl/styles.xml` and `xl/sharedStrings.xml`.
- The selected source document and workspace are never modified by OOXML preparation.
- ZIP32, encryption, entry-name, duplicate, overlap, data-descriptor, entry-count, declared-byte, stored-size, exact-input-consumption, output-length, and CRC constraints remain fail-closed.
- Normal DOCX/XLSX parser input is the exact validated snapshot Buffer. Only missing-both XLSX is rebuilt in memory with the minimal stylesheet.
- Original host exceptions are recorded once; the UI continues to show only the existing fixed pathless Japanese message.
- The real-machine fixture generator and its binary contract remain unchanged.
- Every production behavior starts with a focused failing test and recorded RED evidence.

## Task 1: Common validated OOXML snapshot and Buffer parser adapters

- Add `src/ruleAuthoring/extraction/ooxmlArchive.ts` with `prepareOoxmlParserInput(filePath, expectedFingerprint, expectedKind, limits)` returning document kind, parser Buffer, and normalization mode.
- Read through one `FileHandle`; compare BigInt stat before and after the read with the supplied fingerprint and verify exact byte length and SHA-256 before preflight.
- Refactor OOXML structural preflight to operate on the snapshot Buffer.
- Validate every entry sequentially before parser load: stored length/CRC or bounded deflate, exact compressed-input consumption, decoded length, and CRC.
- Return the original snapshot Buffer for normal DOCX/XLSX. Retain decoded entries and dynamically import `fflate` only for missing-both XLSX normalization.
- Change DOCX/XLSX adapters to accept Buffer and update the document-extraction orchestration.
- Add RED/GREEN coverage for standard DOCX/XLSX payload defects, fingerprint mismatch/replacement, Buffer-only parser inputs, parser-load ordering, descriptors, empty entries, and minimal XLSX parity.

## Task 2: Documentation and policy synchronization

- Document the fingerprint-bound validated-snapshot boundary and Buffer parser inputs in the extension README and design/test specifications.
- Keep dependency declarations and lockfile versions unchanged; update policy tests only where the new module/input contract requires it.
- Keep the project-rule-authoring Windows runbook globally `PENDING`; this change only prepares the `PRA-WIN-001` ingestion acceptance.

## Task 3: Verification, package, and acceptance preparation

- Run fixture generation contracts, compile, focused regressions, full extension tests, all dependency/architecture/source/unused/artifact/audit gates, package policy/smoke/metrics, and `git diff --check`.
- Build a fresh VSIX only after compilation, record its SHA-256, and compare packaged compiled OOXML modules with the current compiled outputs.
- Generate a fresh canonical `bazaar-core/input-documents` environment and verify the manifest, workbook hash, and absence of both optional XML parts without changing generator source.
- Preserve the old `CE335C40F2D2A003B932134C02A2875E3996C6C7409863B9CF14956DCA7C0D85` artifact as a baseline only. IBM Bob installation and `PRA-WIN-001` operator evidence remain pending unless the real isolated host is available.
