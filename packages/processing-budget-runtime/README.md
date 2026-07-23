# `@bob/processing-budget-runtime`

Repository-local shared runtime for the three Bob extensions. It provides one generated 13-category budget definition, immutable normalized profiles, and an operation-scoped reservation ledger.

The canonical source is `contracts/processing-budget-definition.v1.json`. Run `npm run contracts:generate` after an intentional definition change; `npm run contracts:check` rejects drift in the generated TypeScript constants or JSON Schema.

The definition distinguishes operation-scoped categories from target-scoped local limits. `single_document_bytes`, `sheets_per_workbook`, and `rows_per_sheet` require `reserveForTarget(category, target, amount)`. Their local state is isolated by the bounded target identifier while the same reservation atomically debits the declared operation-wide aggregate chain. All other categories use `reserve(category, amount)`.

`commit(actual)` records actual use and releases unused capacity; `release()` returns the whole reservation. A reservation can be finalized exactly once. All values are non-negative safe integers, and arithmetic is checked against remaining capacity before mutation. Snapshots list categories in canonical definition order and target records in category/target code-point order.

`managed_artifact_bytes` is an output budget and therefore does not debit `total_operation_input_bytes`. Document, diff, excerpt, and Bob-input byte categories debit the operation input aggregate through their declared chain.
