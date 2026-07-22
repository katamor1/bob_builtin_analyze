# Workflow Contract v2 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every task follows RED → minimal implementation → focused GREEN → related regression → review → commit. Do not combine task commits.

**Goal:** Replace every repository workflow definition and product entry point with the approved Contract v2 generation package and single immutable-plan compiler.

**Canonical design:** `../specs/2026-07-17-workflow-contract-v2-design.md`. If a plan conflicts with the design, the design wins. A behavior change requires an approved design amendment before code.

**Planning baseline:** `8793804f`. Contract v2 is additive until the final repository cutover; the final cutover intentionally removes all v1 and legacy production paths.

## Global execution constraints

- Work only in the dedicated Contract v2 branch/worktree.
- One implementer owns a shared worktree task at a time. A different agent reviews specification compliance and code quality before the next dependent task.
- Tests are added and observed failing before production changes. Record the failing assertion/module, not only the exit code.
- Use `apply_patch` for source edits. Preserve unrelated user changes.
- The package loader never returns an executable model. The compiler is the only owner of parsing, schema, predicate, binding, lock, and policy semantics.
- No production v1 importer, dual reader, fallback parser, or product migration command may be introduced.
- No runtime adapter may read `workflow.yaml`, prompts, schemas, or `current.json` after acquiring a plan lease.
- A published `versions/<package-digest>/` tree is immutable. Normal authoring corrections publish a new A2 generation; C2 migration corrections publish through A1 and its journaled pointer/evidence transaction. No task may edit files under an existing digest directory.
- Step-entry/input/template/context/result predicates and references see inputs plus strictly earlier lexical committed outputs. Only an owning outgoing transition may read its current value output, and only after provider/error/artifact validation and durable success/output commit.
- Execution begins at the first step. False `when`, optional failure, success without transition, required failure, lexical exhaustion, `$end`, and `$fail` follow the exact section-6 control-flow table; skipped/failed paths never evaluate outgoing transitions or publish output/artifacts.
- Every package/lock/template/predicate collection and recursive tree uses the fixed design-section-6/11 limits. Schema compatibility compares exact dialect/id/digest identity, never id alone.
- Any new diagnostic trigger must use one of the twelve public Contract v2 codes and have a focused test.
- Canonical evidence must be independent of OS, locale, timezone, host path, wall clock, and object insertion order.
- Each commit must pass `git diff --check` and the task's focused test. Each phase must pass the full extension suite.

## Plan set and dependency order

| Order | Plan | Tasks | Consumes | Produces |
| --- | --- | ---: | --- | --- |
| 1 | `2026-07-17-workflow-contract-v2-foundation.md` | F1–F7 | existing TypeScript/AJV/runtime primitives | canonical evidence, diagnostics, strict local schemas, predicate/provider/Bob foundations |
| 2 | `2026-07-17-workflow-contract-v2-package-compiler.md` | P1–P7 | foundation | v2 package loader, lock, sole compiler, immutable plan store/lease, entry-point parity |
| 3 | `2026-07-17-workflow-contract-v2-runtime.md` | R1–R6 | compiled plan handle/lease | run provenance, validated provider/artifact transaction, Bob probe, resume guarantees |
| 4 | `2026-07-17-workflow-contract-v2-atomic-authoring.md` | A1–A5 | compiler and generation loader | staged generation save, pointer replacement, recovery, v2-only authoring |
| 5 | `2026-07-17-workflow-contract-v2-repository-cutover.md` | C1–C9 | all product paths | 27-package migration, legacy deletion, cross-OS manifest CI, hard-cutover evidence |

Foundation task F3 may begin only after F1 and F2. P1 waits for F3–F7. Runtime and authoring may be developed independently after P7, but repository cutover waits for both.

## 34-task ledger

| # | Task | Status | Commit gate |
| ---: | --- | --- | --- |
| 1 | F1 canonical JSON, digest, and detached deep freeze | **complete; replay/recovery tracked** | focused 34/34, compile, independent review approved |
| 2 | F2 stable diagnostics and path redaction | **complete; replay/recovery tracked** | focused 19/19, compile, independent review approved |
| 3 | F3 strict local JSON Schema catalog | **complete; remote checkpoint** | focused 121/121, compile, source policy, full suite 1,402 pass / 1 skip / 0 fail |
| 4 | F4 strict YAML and closed package schema primitives | pending | YAML/schema focused tests |
| 5 | F5 shared structured predicate AST | pending | validator/runtime golden parity |
| 6 | F6 exact provider contract registry | pending | registry/schema/semver focused tests |
| 7 | F7 audited Bob profile and capability binding | pending | activation/task-profile tests |
| 8 | P1 define package v2 and pointer schemas | pending | schema/layout fixtures |
| 9 | P2 implement safe generation package loader | pending | path/symlink/snapshot tests |
| 10 | P3 implement deterministic lock generation/verification | pending | drift matrix and no-write test |
| 11 | P4 implement the sole compiler pipeline | pending | ordered-pipeline failure table |
| 12 | P5 add plan store, cache invalidation, and leases | pending | concurrency/invalidation/identity tests |
| 13 | P6 route every product entry point through compiler | pending | consumer export/import architecture test |
| 14 | P7 emit deterministic compiled-plan manifests | pending | repeated compile and manifest byte tests |
| 15 | R1 persist run plan provenance and acquire lease | pending | run create/restart evidence tests |
| 16 | R2 validate provider input/output/error envelopes | pending | zero-call/zero-commit matrix |
| 17 | R3 stage, validate, and atomically commit artifacts | pending | failure-injection transaction tests |
| 18 | R4 execute only compiled steps/predicates | pending | source-import prohibition and golden parity |
| 19 | R5 probe Bob task-specific capabilities before execution | pending | mismatch-before-dispatch tests |
| 20 | R6 enforce pinned-generation resume and crash recovery | pending | current-pointer change/restart tests |
| 21 | A1 implement slot/generation/pointer storage API | pending | pointer/generation path tests |
| 22 | A2 implement staged generation save and atomic pointer replace | pending | save failpoint matrix |
| 23 | A3 convert authoring model and UI to v2 packages | pending | builder round-trip/preview tests |
| 24 | A4 add staging diagnosis and conservative cleanup | pending | ownership/age/live-lease tests |
| 25 | A5 prove Windows/POSIX authoring parity | pending | platform adapter and full authoring tests |
| 26 | C1 freeze exact 27-definition migration inventory | pending | Git-tree inventory assertion |
| 27 | C2 build one-time strict repository converter | pending | conversion fixture table |
| 28 | C3 register companion providers and final schemas | pending | three-extension contract tests |
| 29 | C4 convert 17 root workflow slots | pending | 17 mappings/compiles |
| 30 | C5 convert template-library and three companion templates | pending | 4 mappings/compiles |
| 31 | C6 convert four samples and two fixtures | pending | 6 mappings/compiles |
| 32 | C7 remove all v1/legacy product and authoring paths | pending | zero-legacy/source-import assertions |
| 33 | C8 add Ubuntu/Windows compiled-manifest CI | pending | artifact compare job |
| 34 | C9 execute full hard-cutover acceptance and remove converter | pending | A01–A20 and clean tree |

The two completed task results predate workspace recovery. Their acceptance evidence is authoritative: F1 focused 34/34 and F2 focused 19/19, both with compile success and independent review at zero findings. Recovery must replay their exact public behavior before F3; it must not reopen their design.

## Stable cross-plan interfaces

These names are fixed so later plans do not invent parallel abstractions:

```ts
cloneAndFreezeJsonValue(value: unknown): JsonValue
canonicalJsonText(value: unknown): string
canonicalJsonBytes(value: unknown): Buffer
canonicalJsonDigest(value: unknown): string

createWorkflowContractV2Diagnostic(input): WorkflowContractV2Diagnostic
sortWorkflowContractV2Diagnostics(input): readonly WorkflowContractV2Diagnostic[]

compileLocalJsonSchema(input): CompileLocalJsonSchemaResult
validateLocalJsonSchemaValue(input): ValidateLocalJsonSchemaValueResult
compileWorkflowPredicate(input): CompileWorkflowPredicateResult
evaluateWorkflowPredicate(ast, context): boolean

createWorkflowPackageRoot(adapter, hostRoot): WorkflowPackageRoot
loadWorkflowPackageGeneration(input): Promise<LoadWorkflowPackageResult>
compileWorkflowPackage(input): WorkflowPackageCompileResult
createAuditedWorkflowCompilerEnvironment(input): WorkflowCompilerEnvironment
WorkflowPlanStore.getOrCompile(input): Promise<CompiledWorkflowPlanHandle>
WorkflowPlanStore.acquire(input): Promise<WorkflowPlanLease>
WorkflowPlanLease.release(): void
```

The compiler handle owns private AJV validators and opaque F6 bound-dispatch handles, never raw provider dispatch functions. Its public `plan` member is canonical JSON data, deeply frozen, contains prompt text rather than Buffer, and does not contain `planDigest`. The wrapper exposes `planDigest = canonicalJsonDigest(plan)`. `WorkflowPlanStore.getOrCompile()` is non-leasing for every audited purpose; `acquire()` is runtime-only. `WorkflowPlanLease.release()` is idempotent and the store has no second release API. P1/P3 import the exact closed `WorkflowPackageLock` and nine-key `WorkflowCompilerPolicyVersions` from design section 15; every environment uses compiler literal `workflow-register-compiler/v2` and that section's exact digest preimage.

## Public diagnostic ownership

| Code | Owning boundary |
| --- | --- |
| `WF2_SCHEMA_VERSION_UNSUPPORTED` | YAML/package/compiler route |
| `WF2_PACKAGE_LAYOUT_INVALID` | slot/generation loader and strict schema catalog shape |
| `WF2_UNKNOWN_OR_NOOP_FIELD` | closed package/step schema |
| `WF2_LOCK_MISMATCH` | lock generator/verifier |
| `WF2_PROVIDER_CONTRACT_MISMATCH` | provider registry/binding |
| `WF2_BOB_CAPABILITY_MISMATCH` | Bob compile/task probe |
| `WF2_PREDICATE_INVALID` | predicate compiler/evaluator contract |
| `WF2_PROVIDER_INPUT_INVALID` | provider invocation preflight |
| `WF2_PROVIDER_OUTPUT_INVALID` | provider return validation |
| `WF2_PROVIDER_ERROR_INVALID` | provider error-envelope validation |
| `WF2_REQUIRED_ARTIFACT_MISSING` | artifact completeness |
| `WF2_ARTIFACT_SCHEMA_INVALID` | artifact hash/content schema/commit |

No plan may add a thirteenth code without amending the design and F2's exact frozen tuple.

## Phase verification gates

Run commands from `extensions/workflow-register` unless stated otherwise.

### Gate F — Foundation

```bash
npm run compile
node --test test/workflowContractV2CanonicalJson.test.js test/workflowContractV2Diagnostics.test.js test/workflowContractV2JsonSchema.test.js test/workflowContractV2Yaml.test.js test/workflowContractV2Predicate.test.js test/workflowContractV2ProviderRegistry.test.js test/workflowContractV2BobProfile.test.js
npm run dependency:policy
npm run architecture:policy
npm run source:policy
```

### Gate P — Package/compiler

```bash
npm run compile
node --test test/workflowContractV2PackageSchema.test.js test/workflowContractV2PackageLoader.test.js test/workflowContractV2Lock.test.js test/workflowContractV2Compiler.test.js test/workflowContractV2PlanStore.test.js test/workflowContractV2Entrypoints.test.js test/workflowContractV2Manifest.test.js
npm test
```

### Gate R/A — Runtime and authoring

```bash
npm run compile
node --test test/workflowContractV2RunProvenance.test.js test/workflowContractV2ProviderInvocation.test.js test/workflowContractV2ArtifactTransaction.test.js test/workflowContractV2Runtime.test.js test/workflowContractV2BobRuntime.test.js test/workflowContractV2Resume.test.js
node --test test/workflowContractV2SlotStore.test.js test/workflowContractV2AtomicSave.test.js test/workflowContractV2Authoring.test.js test/workflowContractV2GenerationCleanup.test.js test/workflowContractV2AuthoringParity.test.js
npm test
```

### Gate C — Hard cutover

```bash
node scripts/check-workflow-contract-v2-inventory.js --root ../.. --expected-legacy 0 --expected-v2 27 --mode final
node scripts/compile-workflow-contract-v2-packages.js --root ../.. --collections docs/workflows/workflow-contract-v2-collections.json --provider-catalog docs/workflows/action-provider-contracts.json --manifest /tmp/workflow-contract-v2-manifest.json
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run unused:report
npm run audit:prod
npm test
npm run package
npm run package:policy
git diff --check
```

CI runs the inventory/compiler commands with a workspace-relative artifact path, not `/tmp`, and compares the Ubuntu and Windows manifest bytes in a separate aggregation job.

## Acceptance ownership

| Design acceptance | Primary tasks |
| --- | --- |
| A01 entry-point plan identity | P5, P6 |
| A02 canonical repeatability | F1, P7 |
| A03 immutable plan | F1, P4 |
| A04 version rejection | F4, P1, C7 |
| A05 unknown/no-op rejection | F4, P1 |
| A06 lock drift matrix | P3, F6, F7 |
| A07 provider input zero-call | R2 |
| A08 output/error zero-commit | R2, R3 |
| A09 artifact zero-commit | R3 |
| A10 placement-aware predicate parity, including 15 post-commit human gates | F5, P4, R3, R4, C2, C4, C5 |
| A11 save failpoints | A2, A5 |
| A12 pinned resume | R1, R6 |
| A13 package invalidation/lease | P5 |
| A14 run provenance | R1 |
| A15 27 active one-to-one migrations plus separate valid history | C1–C6 (provider/schema freeze at C3, conversion at C4–C6) |
| A16 no legacy production path | C7, C9 |
| A17 local schema fail-closed | F3 |
| A18 staging not executable | R3, A2, A4 |
| A19 cross-OS manifests | P7, C8 |
| A20 all repository gates | C9 |

## Commit and review protocol

For each task, the implementer reports the RED command/output, files changed, focused GREEN command/count, related regression result, and commit hash. A specification reviewer checks the design and task text. A code-quality reviewer then checks hostile inputs, determinism, ownership boundaries, and test strength. Any fix is a separate commit with a new RED/GREEN record and is returned to the same reviewer.

Do not squash task history during implementation. The final integration decision follows `superpowers:finishing-a-development-branch` only after C9 produces fresh evidence for A01–A20.
