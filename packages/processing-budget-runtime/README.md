# Processing budget runtime

Private, dependency-free `@bob/processing-budget-runtime` supplies immutable profiles and an in-memory reservation ledger for thirteen processing budgets. Requires Node 20 or later.

```ts
import { ProcessingBudgetLedger } from '@bob/processing-budget-runtime'
const ledger = new ProcessingBudgetLedger()
const reservation = ledger.reserveForTarget('single_document_bytes', 'document-1', 1024)
reservation.commit(700)
const report = ledger.snapshot()
```

Each reservation atomically reserves its category and all operation ancestors. Commit replaces the entire reservation with actual usage at or below its reserved amount; release discards the reservation. A failed reservation changes nothing. An invalid commit leaves the reservation open. Each reservation can be finalized once. Reserve a leaf or its aggregate as appropriate: reserving both for the same input double counts it. This is not a transaction across separate API calls.

Target identifiers are opaque nonempty strings of at most 256 UTF-8 bytes. No path or Unicode normalization is performed. Target summaries can exceed a single target's limit and therefore have no `remaining` field. Snapshots are complete, detached and deeply frozen; targets sort by Unicode code point. The caller owns operation lifetime and target cardinality. Numeric byte limits do not imply a bound on all metadata, snapshots, or process memory.

Profiles use `processing-budget-profile/v1`. Overrides are partial, own enumerable data properties. Limits are nonnegative safe integers, cannot exceed the generated absolute maxima, and must fit their immediate aggregate. Zero is valid. The canonical JSON generates runtime constants and the full-profile JSON schema. MiB means 1,048,576 bytes.

The thirteen-category ledger remains pure and in memory. The root additionally exposes bounded file reads and fingerprints; the explicit `./validated-ooxml` subpath exposes the validated OOXML parser callback. A single file handle remains open through validation, callback and post-read identity/SHA verification. Raw source bytes are charged once to `single_document_bytes` and its ancestors; expanded ZIP bytes are structural measurements. Parsers and lazy XLSX codec loading belong to the calling extension. The library does not launch processes, providers, Bob or GUI operations.

Run `npm ci`, `npm test` and `npm pack`. Tests exercise a real tarball installed offline into a fresh consumer and check three declaration consumers without executing their negative type fixtures. Test evidence uses `PROCESSING_BUDGET_ARTIFACT_ROOT` when set, otherwise an owned temporary directory. Normal packing compiles through `prepack`; internal pack tests disable lifecycle scripts to avoid recursion.

Development preparation: run `npm ci` in this package and each companion extension. Each extension uses its local `node scripts/build-shared-runtime.js` wrapper for `npm run compile`: the fixed package compiler builds a staged, hash-verified twelve-module runtime, the extension compiles, then the canonical copier publishes the same 36 compiled files plus a manifest into its owned `out/shared-processing-budget-runtime`. Missing tooling or a stale payload fails with a build-required error; no install or source runtime fallback occurs. Build/copy operations share an exclusive lock. Unknown output files and aliases are rejected; replaced owned outputs are retained under `node_modules/.cache/bob-processing-runtime`.

The package has exactly 40 paths and no production dependencies. Only root and `./validated-ooxml` exports are public. VSIX packaging keeps the twelve runtime JS files and manifest; existing exclusions remove declaration files and maps. Runtime validation verifies the shipped JS hashes without requiring excluded development files.
