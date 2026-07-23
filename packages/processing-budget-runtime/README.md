# `@bob/processing-budget-runtime`

Repository-local shared runtime for the three Bob extensions. It provides one generated 13-category budget definition, immutable normalized profiles, and an operation-scoped reservation ledger.

The canonical source is `contracts/processing-budget-definition.v1.json`. Run `npm run contracts:generate` after an intentional definition change; `npm run contracts:check` rejects drift in the generated TypeScript constants or JSON Schema.

Reservations are atomic across a category and its aggregate chain. `commit(actual)` records actual use and releases unused capacity; `release()` returns the whole reservation. A reservation can be finalized exactly once. All values are non-negative safe integers, and arithmetic is checked against remaining capacity before mutation.

`managed_artifact_bytes` is an output budget and therefore does not debit `total_operation_input_bytes`. Document, diff, excerpt, and Bob-input byte categories debit the operation input aggregate through their declared chain.
