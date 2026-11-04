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

Development preparation: run `npm ci` in this package and each companion extension. Each extension uses its local `node scripts/build-shared-runtime.js` wrapper for `npm run compile`: the fixed package compiler builds a staged, hash-verified fourteen-module runtime, the extension compiles, then the canonical copier publishes the same 42 compiled files plus a manifest into its owned `out/shared-processing-budget-runtime`. Missing tooling or a stale payload fails with a build-required error; no install or source runtime fallback occurs. Build/copy operations share an exclusive lock. Unknown output files and aliases are rejected; replaced owned outputs are retained under `node_modules/.cache/bob-processing-runtime`.

The package has exactly 46 paths and no production dependencies. Only root and `./validated-ooxml` exports are public. VSIX packaging keeps the fourteen runtime JS files and manifest; existing exclusions remove declaration files and maps. Runtime validation verifies the shipped JS hashes without requiring excluded development files.


## Operation document admission

Create a fresh `createDocumentOperation({selectedDocumentCount,profile,signal})` per extraction. The complete count commits before selections are resolved. `fingerprintSelection(index,request)` returns an opaque, single-use admission. `withValidatedOoxml(admission,options,parse)` repeats every physical/ZIP check while charging each selection's source bytes once. XLSX requires `xlsxBudget:{headerRows:0|1}`; its callback includes immutable full-span inspection for parser materialization checks. `readSelection` directly admits bounded Markdown-style input; `verifyAfterExternalRead` verifies PDF/legacy stability.

Committed count/raw/workbook usage remains after a later failure. Only a pending workbook reservation group rolls back. Normal T14 bounded/callback APIs retain their original release-on-failure accounting. Workbook data helpers do not validate a caller's filesystem or confer parser-input trust. Cancellation preserves an Error reason in operation APIs. No deep imports, caller-provided parser buffers, or skip-validation flags are public.

The tarball contains 14 modules (46 paths); extensions copy 42 compiled development files and ship 14 JS modules plus their manifest. Parser versions, production dependencies (zero), and source/expanded structural caps are unchanged.


## Processing operation

Use `createProcessingOperation({profile,signal})` to share one ledger across stages. Its `reserve(category,amount)` accepts operation-scoped categories and preserves the ledger's atomic ancestor accounting. Call `documents(count)` once, including when the count is zero, to initialize document admissions on the same ledger. `assertDocuments(handle)` rejects foreign or forged document handles, while `assertProcessingOperation(value)` validates the opaque owner without reading user properties. The owner exposes no ledger or skip-validation flags. Standalone `createDocumentOperation` retains its existing behavior through the same private factory.

Earlier committed input remains when a later stage fails; pending reservations still need commit or release by their stage. Process launching, clipping, artifact ownership and operation lifetime stay with the caller.

## Operation deadline scopes

`createAbsoluteDeadline` uses process-local monotonic milliseconds. `createCancellationScope` owns a native signal, first observed cancellation cause, timer and source listeners. Dispose owned scopes in `finally`; disposal releases resources without disabling later synchronous expiry checks. Use `cancellationKindFromSignal` to authenticate a cause; public error fields and replayed reasons do not establish deadline authority. Do not persist or transfer an absolute deadline to another process.

## Shared physical path policy

The root and ./path-policy entry export raw syntax validation, portable lexical containment, physical resolution, and physical multi-root selection. The path subpath has no ledger or deadline dependency. Governed roots and existing components reject symbolic links and junction aliases. Only ENOENT permits a missing suffix below an existing directory. Relative canonicalization uses the current process directory after validating the original components. Returned frozen paths are observations; callers must recheck at I/O boundaries. They do not provide atomic traversal or race-free output creation. The package contains 16 modules, 48 compiled files and 52 packed paths.
