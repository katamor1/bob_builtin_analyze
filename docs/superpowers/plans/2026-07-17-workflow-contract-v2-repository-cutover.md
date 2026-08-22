# Workflow Contract v2 Repository Hard-Cutover Plan

> **Prerequisite:** Foundation, package/compiler, runtime, and atomic-authoring phase gates are green. Follow the master RED/GREEN/review/commit protocol. This plan intentionally removes compatibility only after all replacement paths exist.

**Goal:** Convert all 27 tracked legacy definitions one-to-one, register exact companion providers, delete every v1/legacy product path, and prove identical compiled manifests on Ubuntu and Windows.

**Design:** `../specs/2026-07-17-workflow-contract-v2-design.md`, sections 2–3 and 21–22.

## C1 — Freeze the exact 27-definition migration inventory

**Files**

- Create: `extensions/workflow-register/scripts/check-workflow-contract-v2-inventory.js`
- Create: `extensions/workflow-register/test/workflowContractV2MigrationInventory.test.js`
- Create: `docs/workflows/workflow-contract-v2-migration-evidence.json`
- Create: `docs/workflows/workflow-contract-v2-collections.json`

The base inventory is exactly:

```text
01 .bob/template-library/standard/process-code-precheck/WORKFLOW.md
02 .bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md
03 .bob/workflows/bazaar-project-rule-review/WORKFLOW.md
04 .bob/workflows/code-consistency-review/WORKFLOW.md
05 .bob/workflows/process-code-doc-investigation/WORKFLOW.md
06 .bob/workflows/process-code-precheck/WORKFLOW.md
07 .bob/workflows/process-coding-plan/WORKFLOW.md
08 .bob/workflows/process-common-review/WORKFLOW.md
09 .bob/workflows/process-external-spec-design/WORKFLOW.md
10 .bob/workflows/process-external-spec-review/WORKFLOW.md
11 .bob/workflows/process-functional-test-design/WORKFLOW.md
12 .bob/workflows/process-functional-test-execution-review/WORKFLOW.md
13 .bob/workflows/process-integration-test-design/WORKFLOW.md
14 .bob/workflows/process-internal-spec-design/WORKFLOW.md
15 .bob/workflows/process-internal-spec-review/WORKFLOW.md
16 .bob/workflows/process-qa-intake-analysis/WORKFLOW.md
17 .bob/workflows/process-unit-test-design/WORKFLOW.md
18 .bob/workflows/process-unit-test-execution-review/WORKFLOW.md
19 extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md
20 extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md
21 extensions/bob-code-consistency-review/templates/.bob/workflows/code-consistency-review/WORKFLOW.md
22 extensions/workflow-register/samples/mechanical-checks-parser-pilot/.bob/workflows/mechanical-checks-parser-pilot/WORKFLOW.md
23 extensions/workflow-register/samples/mechanical-checks-precheck/.bob/workflows/mechanical-checks-precheck/WORKFLOW.md
24 extensions/workflow-register/samples/review-gated-step-execution/.bob/workflows/review-gated-step-execution/WORKFLOW.md
25 extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md
26 extensions/workflow-register/test/fixtures/bob-code-consistency-review-template/WORKFLOW.md
27 extensions/workflow-register/test/fixtures/code-consistency-workflow/WORKFLOW.md
```

Items 02–18 are the 17 root workflows; item 01 is the template library; 19–21 are three companion templates; 22–25 are four samples; 26–27 are two fixtures.

Migration evidence has exactly these top-level arrays. `targets` is the active set; `history` cannot satisfy active completeness:

```ts
interface WorkflowMigrationEvidence {
  readonly legacySources: readonly LegacySourceEvidence[]
  readonly targets: readonly ActiveTargetEvidence[]
  readonly history: readonly MigrationAttemptHistory[]
}

interface ActiveTargetEvidence {
  readonly legacyPath: string
  readonly legacyBlobSha256: string
  readonly collection: string
  readonly slot: string
  readonly generation: string
  readonly packageDigest: string
  readonly lockfileDigest: string
  readonly environmentDigest: string
  readonly planDigest: string
  readonly fieldMappings: readonly MappingEvidence[]
  readonly providerMappings: readonly MappingEvidence[]
  readonly artifactMappings: readonly MappingEvidence[]
  readonly retiredFields: readonly RetirementEvidence[]
  readonly diagnostics: readonly []
}

interface MigrationAttemptHistory {
  readonly sequence: number
  readonly status: "failed" | "superseded"
  readonly legacyPath: string
  readonly legacyBlobSha256: string
  readonly collection: string
  readonly slot: string
  readonly generation: string | null
  readonly packageDigest: string | null
  readonly lockfileDigest: string | null
  readonly environmentDigest: string | null
  readonly planDigest: string | null
  readonly fieldMappings: readonly MappingEvidence[]
  readonly providerMappings: readonly MappingEvidence[]
  readonly artifactMappings: readonly MappingEvidence[]
  readonly retiredFields: readonly RetirementEvidence[]
  readonly reason: {
    readonly kind:
      | "conversion-diagnostic" | "publication-failure"
      | "provider-contract-revision" | "schema-revision" | "mapping-correction"
    readonly diagnosticCodes: readonly string[]
    readonly detailDigest: string
  }
  readonly supersededBy: { readonly generation: string; readonly packageDigest: string } | null
}
```

History `sequence` is contiguous from 1 in append order. A failed entry has `supersededBy: null` and records every mapping decision available before failure. A superseded entry copies the old active target's source hash, all digests, and all mapping/retirement arrays exactly, then names the replacement active generation/digest. Reason diagnostic codes are sorted unique members of the twelve-code set and `detailDigest` hashes canonical redacted detail.

- [ ] RED: run inventory against the planning baseline and require exactly these paths and Git blob/exact-byte SHA-256 values. Addition, omission, duplicate, rename, ignored/untracked legacy file, or case alias fails.
- [ ] RED: freeze all three canonical arrays. Immutable `legacySources` has exactly `{ legacyPath, legacyBlobSha256, workflowId, expectedCollection, expectedSlot }` for the 27 baseline files and is populated before conversion. `targets` accepts at most one fully successful `ActiveTargetEvidence` per legacy source and `(collection, slot)`; failed/superseded attempts can appear only in `history` with the exact union above.
- [ ] RED: define derivation tests: `legacyBlobSha256` hashes exact baseline bytes; `packageDigest` and `lockfileDigest` come from P2/P3 accepted bytes; `environmentDigest` comes from the audited P4 environment; and `planDigest` must equal `canonicalJsonDigest(handle.plan)`, with `handle.plan.planDigest` absent. Recompute every digest in the evidence validator.
- [ ] RED: in `legacy` mode require 27 unique source paths and 27 unique expected `(collection, slot)` pairs from `legacySources`; `targets` and `history` start empty. Transition mode permits a partial active target set; final mode requires exactly 27 active targets joined one-to-one to sources/pairs. Repeated slot ids across collections are valid, duplicate pairs are not. Ignore history for those counts while validating its contiguous sequence, status/nullability, reason digest, and `supersededBy` reference. Reject empty mappings/retirements and every active target with a diagnostic.
- [ ] RED: freeze the observed legacy leaf inventory before defining converter mappings: workflow inputs are exactly 82 `string` plus 6 `select` declarations, the sole manual form has exactly two `string` fields, and same-step `humanGate.decision` outgoing branches occur exactly in item 01 and items 05–18. A count/type/path drift blocks migration review; unsupported F4 number/boolean/manual-select variants are not invented by the converter.
- [ ] RED: freeze these exact nine collection roots; every target slot must be a direct child of exactly one:

```text
.bob/workflows
.bob/template-library/standard
extensions/bob-bazaar-review/templates/.bob/workflows
extensions/bob-code-consistency-review/templates/.bob/workflows
extensions/workflow-register/samples/mechanical-checks-parser-pilot/.bob/workflows
extensions/workflow-register/samples/mechanical-checks-precheck/.bob/workflows
extensions/workflow-register/samples/review-gated-step-execution/.bob/workflows
extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows
extensions/workflow-register/test/fixtures
```
- [ ] GREEN: implement the checker using Git-tracked paths plus filesystem checks; use POSIX repository-relative paths and F1-compatible canonical ordering. P7 and CI consume this explicit collection manifest rather than recursively guessing roots.
- [ ] Verify:

```bash
cd extensions/workflow-register
node --test test/workflowContractV2MigrationInventory.test.js
node scripts/check-workflow-contract-v2-inventory.js --root ../.. --expected 27 --mode legacy
```

**Commit:** `test(workflow): freeze contract v2 migration inventory`

## C2 — Build the one-time strict repository converter

**Files**

- Create: `extensions/workflow-register/scripts/migrate-workflow-contract-v2-repository.js`
- Create: `extensions/workflow-register/scripts/lib/workflow-contract-v2-migration/legacy-workflow-reader.js`
- Create: `extensions/workflow-register/test/workflowContractV2RepositoryMigration.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/migration/field-decisions.json`
- Create: `extensions/workflow-register/scripts/lib/workflow-contract-v2-migration/migration-journal.js`
- Create/delete by the script: `docs/workflows/.workflow-contract-v2-migration.lock`, `docs/workflows/.workflow-contract-v2-migration-journal.json`
- Modify: `docs/workflows/workflow-contract-v2-migration-evidence.json`

The converter is branch tooling only. Production `src/`, `package.json` commands, extension contributions, and GUI must not import/expose it.

- [ ] RED: convert reviewed fixtures for every observed legacy field into exact `workflow.yaml`, external prompts, local schemas, lock, generation, and pointer bytes; compile each result through P2/P4. Freeze explicit decisions for the 82 string/6 select inputs, the two string form fields, value versus unit provider outputs, every artifact path/media/owner/required field, and every side-effect/idempotency classification; an unseen variant blocks instead of inheriting a guessed default.
- [ ] RED: convert each of the 15 frozen approval cases without inserting a synthetic step: manual output is a schema-validated object containing `decision`, its own outgoing transition alone references that output `/decision`, and compile/runtime golden evidence proves the reference is unavailable before durable success commit.
- [ ] RED: unknown field, ignored/no-op field, ambiguous condition, inline content collision, provider without exact contract, required artifact without content schema, lossy identifier, or unrepresentable resume behavior must stop conversion with an evidence diagnostic and leave source untouched.
- [ ] RED: run dry-run twice and get identical proposed file bytes, package/lock/plan digests, mapping order, and evidence. Normal mode writes only explicitly inventoried targets.
- [ ] RED: re-run after a completed conversion and get an idempotent no-change result. A failed correction before journaling appends one deterministic failed history entry and leaves active target/current pointer unchanged. A valid correction publishes/validates an unreferenced immutable generation through A1, then enters one exclusive durable migration-journal transaction containing exact old/new pointer and evidence bytes/digests. Before pointer CAS recovery restores the old pair; after pointer CAS it rolls forward the exact new evidence, appends the old target as superseded with `supersededBy`, and replaces exactly one active record. It never adds a second active target or overwrites an immutable generation.
- [ ] RED: inject failure before/after exclusive lock creation, journal write/flush, pointer temp/replace/flush, evidence temp/replace/flush, reread, journal removal, and lock removal. Outside a journal, pointer and active target must match. While a journal exists, converter/inventory/manifest/final commands enter recovery before other work. A competing/malformed/stale lock is never stolen automatically. If evidence remains unwritable after pointer CAS, the pointer stays new, the journal stays recovery-required, no later source is processed, and final/CI mode fails. Repeated recovery is byte-idempotent on POSIX and Windows.
- [ ] RED: repository conversion mode refuses to publish until C3's exact companion catalog/schemas are present. Converter unit fixtures use an explicit audited fixture catalog; no placeholder provider/schema digest may enter repository evidence.
- [ ] GREEN: keep the frozen legacy reader and journal recovery under the script-only directory (never import production `src/` legacy parsers), use P2's Node adapter and P7's shared deterministic audited environment helper, transform to a detached v2 file map, generate final schemas/lock via P3, validate through P4, publish the immutable generation through A1, then switch pointer/evidence only through the journaled transaction. New success creates/replaces the source's sole active target; old/failed attempts append to history. C9 deletes the reader and journal recovery with the converter.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2RepositoryMigration.test.js
node scripts/migrate-workflow-contract-v2-repository.js --root ../.. --inventory docs/workflows/workflow-contract-v2-migration-evidence.json --fixture extensions/workflow-register/test/fixtures/workflow-contract-v2/migration/field-decisions.json --dry-run
git diff --check
```

**Commit:** `build(workflow): add one-time strict v2 converter`

## C3 — Register companion providers and freeze final contract schemas

**Files**

- Create: `extensions/bob-bazaar-review/contracts/workflow-providers.v2.json`
- Create: `extensions/bob-code-consistency-review/contracts/workflow-providers.v2.json`
- Modify: `extensions/bob-bazaar-review/src/workflow/workflowProviders.ts`
- Modify: `extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js`
- Modify: `extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts`
- Modify: `extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js`
- Replace: `docs/workflows/action-provider-contracts.json`
- Modify: `docs/workflows/workflow-contract-v2-migration-evidence.json`

- [ ] RED: analyze provider/artifact references from C1's immutable 27-file legacy evidence through C2's read-only analysis mode. Require every referenced provider id to map to one exact registration with input/error schema evidence, unit or value-output schema evidence, `none|workspace-write|external`, `idempotent|key-required|non-idempotent`, sorted capabilities, and contract digest before any conversion runs.
- [ ] RED: invoke representative valid/invalid values from each companion extension and prove R2 zero-call/zero-commit behavior through the public branded registration snapshot.
- [ ] RED: prove source-regex discovery and documentation-only contracts cannot satisfy binding. Freeze canonical final provider schemas/digests and make C2 repository mode consume exactly this catalog through P7's environment helper.
- [ ] GREEN: register frozen versioned contracts alongside dispatch adapters and generate/check documentation from canonical contract data. Append a separate provider-decision table without changing C1 `legacySources`. No package generation exists yet, so this task modifies no `versions/<digest>` tree or package lock.
- [ ] Verify:

```bash
cd extensions/bob-bazaar-review
npm test
cd ../bob-code-consistency-review
npm test
cd ../workflow-register
npm run compile
node --test test/workflowContractV2ProviderRegistry.test.js test/workflowContractV2Compiler.test.js test/workflowContractV2RepositoryMigration.test.js
node scripts/migrate-workflow-contract-v2-repository.js --root ../.. --inventory docs/workflows/workflow-contract-v2-migration-evidence.json --analyze-providers
```

**Commit:** `feat(workflow): freeze companion provider v2 contracts`

## C4 — Convert the 17 root workflow slots

**Files**

- Replace: `.bob/workflows/{bazaar-project-rule-authoring,bazaar-project-rule-review,code-consistency-review,process-code-doc-investigation,process-code-precheck,process-coding-plan,process-common-review,process-external-spec-design,process-external-spec-review,process-functional-test-design,process-functional-test-execution-review,process-integration-test-design,process-internal-spec-design,process-internal-spec-review,process-qa-intake-analysis,process-unit-test-design,process-unit-test-execution-review}/WORKFLOW.md`
- Create in each same slot: `current.json`
- Create in each same slot: `versions/<package-digest>/{workflow.yaml,workflow.lock.json,prompts/**,schemas/**}`
- Modify: `docs/workflows/workflow-contract-v2-migration-evidence.json`
- Modify: `extensions/workflow-register/test/processWorkflowContracts.test.js`
- Modify: `extensions/workflow-register/test/processWorkflowTemplates.test.js`

- [ ] RED: extract a reviewed step/provider/artifact/predicate table for all 17 sources and assert each source hash and expected v2 workflow id before conversion. Items 05–18 contribute 14 of the frozen same-step human-gate cases and must compile to manual output `/decision` post-commit transition references, never entry references.
- [ ] GREEN: run the converter only for inventory items 02–18 against the C3 catalog. It emits final schemas and locks once. Resolve every blocked field before publication; do not edit a published digest generation or generated digest by hand. A correction follows C2 exactly: validate and publish an unreferenced generation through A1, then journal the pointer/active-target replacement and retain the old target as superseded history.
- [ ] Verify: compile all 17 current generations, compare evidence old steps/providers/artifacts to compiled plans, and assert no `WORKFLOW.md` remains under root `.bob/workflows`.

```bash
cd extensions/workflow-register
node scripts/migrate-workflow-contract-v2-repository.js --root ../.. --inventory docs/workflows/workflow-contract-v2-migration-evidence.json --provider-catalog docs/workflows/action-provider-contracts.json --select root-workflows
node scripts/check-workflow-contract-v2-inventory.js --root ../.. --expected-legacy 10 --expected-v2 17 --mode transition
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collection .bob/workflows --provider-catalog docs/workflows/action-provider-contracts.json --manifest /tmp/root-v2.json
node --test test/processWorkflowContracts.test.js test/processWorkflowTemplates.test.js
git diff --check
```

**Commit:** `chore(workflow): migrate root workflows to v2 packages`

## C5 — Convert template-library and three companion templates

**Files**

- Replace: `.bob/template-library/standard/process-code-precheck/WORKFLOW.md`
- Replace: `extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md`
- Replace: `extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md`
- Replace: `extensions/bob-code-consistency-review/templates/.bob/workflows/code-consistency-review/WORKFLOW.md`
- Create beside each source slot: `current.json` and `versions/<package-digest>/**`
- Modify: `docs/workflows/workflow-contract-v2-migration-evidence.json`
- Modify: `extensions/workflow-register/test/templateGenerator.test.js`
- Modify: `extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js`
- Modify: `extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js`

- [ ] RED: scaffold/copy each template into a temporary workspace and assert the complete v2 tree, exact pointer/generation relationship, and successful compile—not only text equality. Item 01 contributes the fifteenth frozen human-gate case and must match the same post-commit `/decision` golden contract as C4.
- [ ] GREEN: convert inventory items 01 and 19–21 against the C3 catalog, emitting final schemas/locks once; update template copy logic to copy generation trees without rewriting canonical bytes. Corrections use C2's A1-publication-then-journaled-pointer/evidence rule.
- [ ] Verify:

```bash
cd extensions/workflow-register
node scripts/migrate-workflow-contract-v2-repository.js --root ../.. --inventory docs/workflows/workflow-contract-v2-migration-evidence.json --provider-catalog docs/workflows/action-provider-contracts.json --select templates
node --test test/templateGenerator.test.js test/workflowContractV2PackageLoader.test.js
cd ../bob-bazaar-review && npm test
cd ../bob-code-consistency-review && npm test
```

**Commit:** `chore(workflow): migrate reusable workflow templates to v2`

## C6 — Convert four samples and two test fixtures

**Files**

- Replace the `WORKFLOW.md` in inventory items 22–27 with a same-slot `current.json` and `versions/<package-digest>/**`
- Modify: `docs/workflows/workflow-contract-v2-migration-evidence.json`
- Modify: `extensions/workflow-register/test/workflowSamples.test.js`
- Modify: `extensions/workflow-register/test/workflowContractFiles.test.js`
- Modify: `extensions/workflow-register/test/workflowDefinitionLoader.test.js`

- [ ] RED: sample/fixture discovery finds six v2 slots, compiles them, and verifies the old-to-new step/provider/artifact map. The non-humanGate same-step transition cases in items 22, 23, and 25 must use the same owning-outgoing/post-commit rule, not transient state. Include deliberately invalid v2 packages under a new `test/fixtures/workflow-contract-v2/invalid/` tree rather than retaining legacy negative fixtures.
- [ ] GREEN: convert inventory items 22–27 against the C3 catalog, emitting final schemas/locks once, and update tests/helpers to address a slot/current generation, never a `WORKFLOW.md` file. Corrections use C2's A1-publication-then-journaled-pointer/evidence rule.
- [ ] Verify:

```bash
cd extensions/workflow-register
node scripts/migrate-workflow-contract-v2-repository.js --root ../.. --inventory docs/workflows/workflow-contract-v2-migration-evidence.json --provider-catalog docs/workflows/action-provider-contracts.json --select samples-fixtures
node --test test/workflowSamples.test.js test/workflowContractFiles.test.js test/workflowDefinitionLoader.test.js
node scripts/check-workflow-contract-v2-inventory.js --root ../.. --expected-legacy 0 --expected-v2 27 --mode transition
```

**Commit:** `chore(workflow): migrate samples and fixtures to v2`

## C7 — Remove v1/legacy parser, schema, authoring, and execution paths

**Files**

- Delete: `extensions/workflow-register/src/core/parser/**`
- Delete/replace: `extensions/workflow-register/src/core/workflowCompiler.ts`
- Delete/replace: `extensions/workflow-register/src/core/workflowSchema.ts`
- Delete/replace: `extensions/workflow-register/src/core/schema/workflowSchema.ts`
- Delete v1/legacy public schema resources and fixtures discovered by the C1 checker
- Delete: `extensions/workflow-register/test/fixtures/workflow-contract-v2/transitional-legacy-import-allowlist.json`
- Modify/delete legacy branches in authoring, discovery, loader, validator, adapter, tests, package contributions, and documentation
- Create: `extensions/workflow-register/test/workflowContractV2HardCutover.test.js`
- Modify: `extensions/workflow-register/test/architectureContracts.test.js`

The exact delete list is generated and reviewed before editing with:

```bash
rg -n 'WORKFLOW\.md|workflow-register/v1|parseLegacy|parseV1|legacy workflow|schemaVersion.*v1' extensions/workflow-register/src extensions/workflow-register/schema extensions/workflow-register/test package.json .github docs .bob
```

- [ ] RED: replace P6's additive scoped scan with a global production-tree assertion: zero tracked `WORKFLOW.md`, zero transitional allowlist, zero v1/legacy schema resource, zero production import/export of deleted parsers/types, zero product migration command/text, and zero fallback from v2 compile failure.
- [ ] RED: every product entry point rejects an injected legacy layout/missing/v1/unknown schema with the stable unsupported schema/layout diagnostic and performs zero side effects.
- [ ] GREEN: remove compatibility facades and update all consumers/tests to the P4 compiler API. Retain only historical migration evidence text/data, not executable source or fixtures accepted by runtime.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2HardCutover.test.js test/architectureContracts.test.js test/workflowContractV2Entrypoints.test.js
npm run source:policy
npm run architecture:policy
node scripts/check-workflow-contract-v2-inventory.js --root ../.. --expected-legacy 0 --expected-v2 27 --mode final
```

**Commit:** `refactor(workflow): remove legacy workflow contract paths`

## C8 — Add Ubuntu/Windows compiled-plan manifest CI

**Files**

- Modify: `.github/workflows/workflow-contracts.yml`
- Create: `extensions/workflow-register/scripts/compare-workflow-contract-v2-manifests.js`
- Create: `extensions/workflow-register/test/workflowContractV2CiPolicy.test.js`
- Modify: `extensions/workflow-register/package.json`

**CI jobs**

1. `compile-manifest` matrix on `ubuntu-latest` and `windows-latest`;
2. each runs `npm ci`, compile, unit/policy/package gates, inventory 27/legacy 0, and repository package compile;
3. each uploads canonical `workflow-contract-v2-manifest.json` plus commit SHA using immutable action pins;
4. `compare-manifests` downloads both artifacts and requires exact bytes/digests.

- [ ] RED: policy test parses the workflow and requires both OS values, all commands, immutable action SHAs, artifact names, `needs` aggregation, and byte comparison. Fail tag refs or an OS-specific ignored package.
- [ ] RED: comparator rejects missing/duplicate platform, schema/compiler version mismatch, `(collection, slot)` set/uniqueness mismatch, and any generation/package/lock/environment/plan digest difference with a path-only diagnostic keyed by the pair.
- [ ] GREEN: update path triggers for `current.json`, `workflow.yaml`, locks, prompts, schemas, provider registrations, compiler sources, scripts, tests, and the workflow file; remove `WORKFLOW.md`-only triggers.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2CiPolicy.test.js test/workflowContractV2Manifest.test.js
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collections docs/workflows/workflow-contract-v2-collections.json --provider-catalog docs/workflows/action-provider-contracts.json --manifest /tmp/manifest-ubuntu.json
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collections docs/workflows/workflow-contract-v2-collections.json --provider-catalog docs/workflows/action-provider-contracts.json --manifest /tmp/manifest-windows.json
node scripts/compare-workflow-contract-v2-manifests.js /tmp/manifest-ubuntu.json /tmp/manifest-windows.json
```

The two explicit P7 commands above are required before the comparator; a stale or hand-authored comparison input is invalid. The local pair proves deterministic positive behavior and a mutated fixture supplies RED. Actual OS proof is recorded from CI.

**Commit:** `ci(workflow): compare v2 compiled plan manifests`

## C9 — Execute A01–A20, delete converter, and seal the cutover

**Files**

- Delete: `extensions/workflow-register/scripts/migrate-workflow-contract-v2-repository.js`
- Delete: `extensions/workflow-register/scripts/lib/workflow-contract-v2-migration/**`
- Delete: `extensions/workflow-register/test/workflowContractV2RepositoryMigration.test.js`
- Delete converter-only fixtures under `test/fixtures/workflow-contract-v2/migration/` after evidence validation
- Modify: `docs/workflows/workflow-contract-v2-migration-evidence.json` (final status/digests only)
- Create: `docs/workflows/workflow-contract-v2-acceptance.md`
- Modify any stale docs/examples found by final source search

- [ ] Re-run the C1 evidence validator before deleting conversion tooling. Assert no migration journal remains; all 27 immutable source hashes have exactly one active target whose generation/package digest matches its durable `current.json`; all active package/lock/environment/plan digests plus field/provider/artifact mappings are complete; and separate history has contiguous sequence/reason/supersededBy integrity without affecting active counts. For every active target recompute `planDigest = canonicalJsonDigest(handle.plan)` and assert the public plan has no digest member.
- [ ] Delete the one-time converter and prove no product/repository command can migrate v1. Historical evidence remains data only.
- [ ] Execute and record all design acceptance items A01–A20 with command, commit SHA, focused/full counts, and CI job/artifact links. No acceptance may be satisfied only by prose review.
- [ ] Run the complete local gate from `extensions/workflow-register`:

```bash
npm ci
npm run compile
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run unused:report
npm run audit:prod
npm test
npm run package
npm run package:policy
node scripts/check-workflow-contract-v2-inventory.js --root ../.. --expected-legacy 0 --expected-v2 27 --mode final
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collections docs/workflows/workflow-contract-v2-collections.json --provider-catalog docs/workflows/action-provider-contracts.json --manifest /tmp/workflow-contract-v2-final.json
git diff --check
```

- [ ] Run both companion extension suites and the repository's top-level policy/test commands. Inspect `git status --short`, tracked legacy search, and packaged VSIX contents.
- [ ] Require green Ubuntu/Windows matrix and byte-identical aggregated manifest for the exact candidate SHA. A rerun on a different SHA is not evidence for the candidate.
- [ ] Obtain final specification, security-boundary, and code-quality reviews. Fixes require new focused/full evidence.

**Commit:** `chore(workflow): complete contract v2 hard cutover`

## Final handoff

The branch is complete only when C9 is green from a clean tree, migration evidence has exactly 27 active one-to-one targets plus independently valid history, compiled manifests match across OSes, the converter is absent, and every acceptance A01–A20 links to reproducible evidence. Then use `superpowers:finishing-a-development-branch` to choose merge/PR handling.
