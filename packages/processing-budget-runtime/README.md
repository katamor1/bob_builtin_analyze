# `@bob/processing-budget-runtime`

Repository-local shared runtime for the three Bob extensions. It provides one generated 13-category budget definition, immutable normalized profiles, an operation-scoped reservation ledger, stable bounded file snapshots, and bounded OOXML archive preflight.

The canonical budget source is `contracts/processing-budget-definition.v1.json`. Run `npm run contracts:generate` after an intentional definition change; `npm run contracts:check` rejects drift in the generated TypeScript constants or JSON Schema.

The definition distinguishes operation-scoped categories from target-scoped local limits. `single_document_bytes`, `sheets_per_workbook`, and `rows_per_sheet` require `reserveForTarget(category, target, amount)`. Their local state is isolated by the target identifier bounded to 256 UTF-8 bytes while the same reservation atomically debits the declared operation-wide aggregate chain. All other categories use `reserve(category, amount)`.

`commit(actual)` records actual use and releases unused capacity; `release()` returns the whole reservation. A reservation can be finalized exactly once. All values are non-negative safe integers, and arithmetic is checked against remaining capacity before mutation. Snapshots list categories in canonical definition order and target records in category/target code-point order.

`readBoundedDocumentFile()` rejects symlink/reparse traversal, containment escape, non-regular or multiply linked files, size growth, short reads, and named-path replacement. It reserves before allocation/read and returns immutable copy-only bytes, SHA-256, stable physical identity, and an `assertCurrent()` revalidation seam.

`preflightOoxmlArchive()` snapshots caller bytes, rejects ZIP64, encryption, unsafe or duplicate names, unsupported methods, overlapping/truncated records, excessive entries, per-entry or aggregate expansion, CRC mismatch, and expansion lies. It reserves every declared expanded entry before inflation and commits only after the archive is semantically a DOCX or XLSX of the expected kind.

The tracked CommonJS byte engine is copied into `out` after TypeScript compilation. `copy-extension-runtime.js` emits the closed compiled runtime payload consumed by packaged extensions; source, tests, scripts, and the tracked engine source remain outside the npm payload.

`managed_artifact_bytes` is an output budget and therefore does not debit `total_operation_input_bytes`. Document, diff, excerpt, and Bob-input byte categories debit the operation input aggregate through their declared chain.
