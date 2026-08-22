# Workflow Contract v2 Hard-Cutover Design

**Status:** Approved on 2026-07-17; control-flow and recovery amendment prepared on 2026-07-22

**Implementation plan:** `../plans/2026-07-17-workflow-contract-v2-master.md`

**Decision:** Repository and product move to Contract v2 in one hard cutover. No v1 or legacy reader, writer, importer, or migration command remains in the shipped extension.

## 1. Purpose and decision record

Workflow validation, registration, Bob integration, Operation Hub, and runtime currently have enough independent parsing and validation paths that the same source can be accepted differently. Contract v2 replaces those paths with one fail-closed compiler. Every executable workflow is a generation-addressed package, and every consumer receives the same immutable compiled plan.

The approved decisions are:

- use a multi-file v2 package rather than `WORKFLOW.md`;
- reject unknown, ignored, no-op, and step-inapplicable fields;
- bind exact provider and Bob capabilities before a run is created;
- validate provider values and required artifacts before committing them;
- make predicates a compiled AST shared by validation and runtime;
- save packages by publishing an immutable generation and atomically replacing one pointer;
- migrate all 27 tracked repository definitions once, then delete every legacy production path;
- compare canonical compiled-plan evidence on Ubuntu and Windows.

## 2. Goals

The implementation must provide all of the following as one contract boundary:

- deterministic package, lockfile, and plan evidence;
- one compiler used by validation, registration, runtime, Bob, Operation Hub, samples, and CI;
- immutable plans and run-scoped plan leases;
- local-only JSON Schema documents compiled in strict mode;
- exact provider and Bob bindings;
- all-or-nothing provider output and artifact publication;
- generation-safe authoring on Windows and POSIX;
- stable, redacted, location-bearing diagnostics;
- an auditable one-to-one repository migration.

## 3. Non-goals and hard-cutover boundary

Contract v2 does not provide backward compatibility at runtime. The shipped product will not contain a v1 parser, a legacy `WORKFLOW.md` parser, a v1-to-v2 command, a dual-write mode, or a fallback to the previous definition after a v2 compile failure. An unsupported source is rejected before registration or run creation.

The one-time repository conversion is implementation tooling, not product behavior. It may exist on the feature branch while evidence is generated, but it is deleted before final acceptance. The migration does not silently discard fields. A field is mapped, explicitly retired with evidence, or blocks the conversion.

Existing run durability formats are not redesigned here. Contract v2 adds immutable plan/package provenance to the established runtime and must coexist with the separately versioned reproducible-runtime work.

## 4. Terms and ownership

- **collection root**: the directory containing workflow slots, normally `.bob/workflows`.
- **slot**: `.bob/workflows/<workflow-id>/`, containing a pointer and immutable generations.
- **generation**: a complete package directory under `versions/<package-digest>/`.
- **raw package**: verified bytes and paths returned by the package loader; never executable.
- **compiled plan data**: canonical, deeply frozen JSON data produced by the compiler.
- **plan handle**: a frozen evidence wrapper containing public plan data, its separately computed plan digest, and compiler-private validators/bindings.
- **plan lease**: a run-scoped reference to one plan handle and one generation.
- **package digest**: digest of the generation file manifest.
- **lockfile digest**: digest of the exact `workflow.lock.json` bytes.
- **plan digest**: digest of canonical compiled plan data.
- **staging**: a non-authoritative package or artifact location that consumers never discover.

The package loader owns path and byte safety. The compiler alone owns semantic meaning. Plan storage owns caching and leases. Runtime adapters consume a leased handle and cannot parse package sources.

## 5. Slot and generation layout

Each workflow uses this physical layout:

```text
.bob/workflows/<workflow-id>/
├── current.json
└── versions/
    └── <package-digest>/
        ├── workflow.yaml
        ├── workflow.lock.json
        ├── prompts/
        │   └── <prompt-id>.md
        └── schemas/
            └── <schema-id>.json
```

`current.json` is the only mutable discovery file. It is a strict document with `schemaVersion: workflow-package-pointer/v1`, `workflowId`, `generation`, and `packageDigest`; `generation` must equal the digest directory name and `packageDigest`. Unknown fields are rejected.

A generation is immutable after publication. The loader rejects files outside the allowed layout, absolute paths, `.` or `..` components, backslashes in logical paths, symbolic links, non-regular files, case-folded duplicate paths, duplicate Unicode-normalized paths, and a generation whose computed digest differs from its directory/pointer value.

Authoring control metadata never enters a generation. Staging uses `versions/.staging-<nonce>/owner.json` plus a sibling `package/` tree. Only `package/` is loaded and hashed; ownership metadata is out of band. Publication renames `package/` to the digest directory and removes the now-empty staging control directory. A published digest directory is never edited. A normal authoring correction is a complete new A2 generation followed by its pointer update. The one-time repository migration instead publishes through A1 and switches pointer plus migration evidence through section 21's script-only journal transaction.

## 6. Package v2 surface

`workflow.yaml` is UTF-8 with LF line endings and has `schemaVersion: workflow-register/v2`. YAML aliases, anchors, merge keys, duplicate keys, custom tags, non-string mapping keys, non-finite numbers, timestamps, and multi-document input are rejected before schema validation.

The allowed top-level fields are exactly:

```text
schemaVersion, id, name, description, inputs, steps,
requiredArtifacts, resumePolicy, providers, bob
```

Every nested object is closed. Step variants are discriminated by `type`; a field valid for one variant is unknown on every other variant. Prompts are references into `prompts/`, schemas are references into `schemas/`, and execution-relevant inline substitutes are forbidden. Every required artifact, including text artifacts, names a content schema. Fields retained only for historical round-tripping are not part of v2.

The complete document shape is fixed here; F4 is its single decoder/validator owner. Every `id` leaf is 1–128 ASCII characters matching `^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$`. Human-facing `title`, label, and message leaves are LF-normalized strings of 1–4,096 Unicode code points; `description` leaves are 1–8,192 code points. Values are rejected when outside these bounds rather than truncated or normalized silently.

- `inputs` is an ordered array of closed `{ id, title, description?, schema, required, default?, requiredWhen? }` records. `schema` is a `schemas/` id, `required` is a required boolean, `default` when present must validate against that schema, and `requiredWhen` is a predicate. An input predicate may reference declared inputs only.
- every step has only `{ id, title, type, required, when?, transition? }` plus its variant fields. `required` is a required boolean; predicates occur only at input `requiredWhen`, step-entry `when`, and outgoing transition-decision `when`. Execution starts at `steps[0]`. An absent `when` is true. A false `when` records a deterministic skipped step, creates no attempt/output/artifact/provider effect, does not evaluate that step's transition, and advances to the next lexical step or completes at the end. A successful step evaluates its transition after durable commit; when no transition is declared it advances lexically or completes at the end. A failed `required: true` step fails the run. A failed `required: false` step records the failure, creates no committed output/artifact, does not evaluate its transition, and advances lexically or completes at the end. `$end` completes and `$fail` fails. These are the only implicit control-flow edges.
- a value output is exactly `{ kind: "value", id, schema, maxBytes }`; `schema` is a local schema id and `maxBytes` is a safe integer from 1 through 16,777,216 inclusive, measured over canonical UTF-8 JSON bytes. A unit output is exactly `{ kind: "unit" }` and creates no committed-output entry.
- a `command` step adds exactly `{ provider, input, output, artifacts }`: `provider` is a declared provider id, `input` is a value template, `output` is either value or unit and must match the bound provider output kind/schema, and `artifacts` is an ordered duplicate-free array of declared artifact ids.
- an `agent` step adds exactly `{ prompt, context, output, artifacts }`: `prompt` is a `prompts/` id, `context` is an ordered duplicate-free array of committed-output references visible at step entry, `output` is a value output, and `artifacts` is an ordered duplicate-free array of declared artifact ids.
- a `manual` step adds exactly `{ prompt, form?, approval?, output }`: at least one of `form` or `approval` is present, `prompt` is a `prompts/` id, `output` is a value output whose schema root is an object, and `approval` is closed `{ message, approveLabel, rejectLabel }`. A successful manual output object has one property per supplied form field and, when approval exists, the required property `decision: "approved" | "rejected"`; a form field id `decision` is then forbidden. The output schema must describe that exact object, require every field whose `required` flag is true plus `decision`, and disallow additional properties.
- `form` is exactly `{ fields }`, where `fields` is a 1–128 element ordered array with unique ids. Its field union is closed and discriminated: `{ id, title, description?, type: "string", required, default?, multiline }`, `{ id, title, description?, type: "number", required, default? }`, `{ id, title, description?, type: "boolean", required, default? }`, or `{ id, title, description?, type: "select", required, default?, options }`. `required` and string `multiline` are required booleans. A default must have the field's primitive type. `options` is a 1–256 element duplicate-free array of non-empty strings of at most 256 code points, and a select default must be one listed option. No other field accepts `multiline` or `options`.
- a `result` step adds exactly `{ source, artifacts }`; `source` is one typed input/committed-output reference or closed `{ source: "literal", value }`, and `artifacts` is an ordered duplicate-free array of declared artifact ids.
- `transition` is closed `{ decisions, default }`; each decision is `{ id, when, goto, loop? }`, `goto` is a declared step id or `$end | $fail`, and `loop` is closed `{ id, maxIterations, extensionSize, checkpoint }`. `maxIterations` and `extensionSize` are safe integers from 1 through 1,000; checkpoint is exactly `{ title, message }`. A same/backward step target requires `loop`; `loop` is forbidden for a forward/terminal target and loop ids are globally unique. `default` is exactly `{ goto }` and may target only a later step or terminal.
- `providers` is an ordered array of closed `{ id, version, inputSchema, output, errorSchema, sideEffect, idempotency, requiredCapabilities }`. `version` is a SemVer range. `output` is exactly `{ kind: "value", schema }` or `{ kind: "unit" }`; input/error and value-output schema ids name immutable provider-catalog schemas. `sideEffect` is `none | workspace-write | external`; `idempotency` is `idempotent | key-required | non-idempotent`; capabilities are code-unit-sorted unique ids. Compilation binds one exact registered version whose full contract matches.
- The only reserved provider capabilities are `workflow.effect.workspace-write` and `workflow.effect.external`. `sideEffect: "none"` forbids both and receives no effect capability. `workspace-write` requires `workflow.effect.workspace-write`, forbids `workflow.effect.external`, and receives the only attempt-staging artifact writer; it can never name or write a final workspace path. `external` requires `workflow.effect.external`, forbids `workflow.effect.workspace-write`, declares an effect outside the local transaction, and is itself the registered external adapter; it receives no staging writer. `idempotent` permits an automatic repeat with equal canonical input; `key-required` permits it only with the same runtime-issued stable idempotency key; `non-idempotent` is never automatically repeated after an ambiguous dispatch. These declarations control retry/resume policy but do not claim rollback of an external effect.
- `requiredArtifacts` is the complete artifact-contract array. Each entry is exactly `{ id, producedBy, path, mediaType, schema, maxBytes, owner, required }`: `producedBy` is a declared step; `owner` is `provider | runtime`; `required` is a required boolean; `schema` is a mandatory local content-schema id; and `maxBytes` is a safe integer from 1 through 67,108,864 inclusive measured over exact staged bytes. `path` is relative to the attempt artifact root, is already NFC, has 1–240 UTF-8 bytes, and matches `^(?!/)(?!.*//)(?!.*(?:^|/)\.{1,2}(?:/|$))(?!.*[:\\])[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$`; absolute paths, controls, backslashes, colons, empty/dot segments, case-fold aliases, and normalization aliases are rejected. `mediaType` is already lowercase ASCII, has no parameters, and matches `^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$`. Provider-owned artifacts may be produced only by a `workspace-write` command provider; runtime-owned artifacts are serialized by the runtime. Artifact ids and paths are unique under exact, NFC, and platform case-fold comparison.
- `resumePolicy` is exactly `{ mode, maxAttempts, retainCommittedOutputs, allowArtifactReuse }`, where `mode` is `restart-step | fail-closed`, `maxAttempts` is a safe integer from 1 through 100, and both remaining fields are required booleans. Automatic retry additionally obeys the provider idempotency rule above.
- `bob` is exactly `{ profile, requiredCapabilities, taskCapabilities }`, where `profile` is `bob/2.0.1` and both capability arrays are code-unit-sorted, duplicate-free members of the audited profile.

Every array and recursive package structure has a fixed compiler-owned bound; callers cannot raise it. The complete package-shape limits are:

| Structure | Bound |
| --- | ---: |
| `inputs` | 0–256 |
| `steps` | 1–512 |
| `requiredArtifacts` | 0–512 |
| `providers` | 0–256 |
| step `artifacts` | 0–128 |
| agent `context` | 0–256 |
| transition `decisions` | 0–128 |
| form `fields` | 1–128 |
| select `options` | 1–256 |
| provider `requiredCapabilities` | 0–128 |
| Bob `requiredCapabilities` / `taskCapabilities` | 0–9 / 0–6 |
| value-template array items / object properties | 0–256 |
| predicate `in` members / `all|any` children | 1–256 / 1–128 |
| lock `prompts` / `schemas` / `providers` | each 0–510, prompts+schemas at most 510 / 0–256 providers |

A value-template tree has maximum depth 32 and at most 4,096 total template nodes per owning step. A predicate has the stricter section-11 limits. The constructed `workflow.yaml` JSON tree has maximum depth 64 and at most 65,536 total array/object/value nodes. Exceeding any bound is a package-shape failure; truncation, partial validation, and host-configured overrides are forbidden. Empty arrays are legal only where the table lower bound is zero.

An input/committed-output reference is closed `{ source, id, pointer }`: `source` is `input | committedOutput`; an input reference uses an input id, and `pointer` is an RFC 6901 pointer into the declared schema. A committed-output reference normally uses an output id from a strictly earlier lexical step. The sole exception is a value output from the current step used in that same step's outgoing transition predicate after durable success commit; section 11 fixes this placement rule. Literal data is permitted only where the variant above says `value` or template data.

A value template is exactly one of `{ source: "literal", value }`, an input/committed-output reference, `{ source: "array", items }`, or `{ source: "object", properties }`; `items` is an ordered value-template array and `properties` is a closed string-keyed map of value templates. This is the only command-input interpolation grammar.

Schema equality is evidence equality, never name-only equality. A schema identity is the frozen triple `{ dialect, id, digest }`, where `digest` is over the original canonical schema document, not the AJV-transformed copy. A local reference resolves to exactly one catalog identity. A command value output matches its bound provider output only when kind and the complete schema identity match; the same id with different bytes/digest, or equivalent constraints under a different id/dialect, is a contract mismatch. Artifact, form, input, and result validation retain the exact resolved identity in the compiled plan. The dialect component is the single section-10/policy literal and is not redundantly stored on every section-15 lock entry; lock identity comparison therefore requires that exact policy literal plus entry id and digest. Id-only aliases or digest substitution are rejected.

Package-relative references are canonical POSIX paths. A referenced file must exist exactly once, must be declared by the owning field, and must be included in the lockfile. Unreferenced files under `prompts/` or `schemas/` are rejected so that the package has one unambiguous execution surface.

## 7. Loader and trust boundary

The loader takes an opaque host-neutral `WorkflowPackageRoot` plus either a slot id or an explicit generation id. `WorkflowPackageFileSystem` defines no Node path, VS Code URI, clock, or platform separator in returned evidence. The Node and VS Code adapters implement the same lstat/open/read-directory/realpath/flush operations and must produce identical logical bytes. Standalone conversion/manifest commands use the Node adapter; extension discovery/authoring use the VS Code adapter. Normal discovery reads `current.json`; run resume reads the generation recorded by the run and never consults `current.json`. The v2 load limits are constants, not host options: at most 512 generation files, depth at most 3 below the generation root, logical path at most 240 UTF-8 bytes, `workflow.yaml` and `workflow.lock.json` each 1–1,048,576 bytes, every prompt/schema file 1–4,194,304 bytes, and all generation files together at most 33,554,432 bytes.

The loader:

1. resolves and verifies the physical collection/slot/generation boundary;
2. reads `current.json` or the requested immutable generation;
3. enumerates the complete allowed tree without following links;
4. snapshots raw bytes once, with per-file and package size limits;
5. rejects physical layout, path, file-kind, snapshot, limit, and digest violations;
6. returns a detached `RawWorkflowPackage` containing bytes and evidence.

It does not parse workflow semantics or encoding, resolve declared references, decide whether prompt/schema files are missing/additional/incompatible, infer a workflow version, bind capabilities, or return a runnable workflow. F4/P1/P4 perform those semantic checks over the exact byte snapshot. Validation entry points call the same compiler with this raw package.

## 8. Canonical evidence and digest rules

Canonical JSON is compact UTF-8. Object keys are sorted by JavaScript UTF-16 code units; array order is retained. Input must be a detached, ordinary JSON tree. Accessors, proxies, exotic objects, sparse arrays, cycles, symbol keys, `undefined`, `-0`, non-finite numbers, lone surrogates, and ambiguous descriptors are rejected. Canonical values are recursively cloned and frozen before use.

Digests are lowercase SHA-256 strings in the form `sha256:<64 hex>`. No digest input contains wall-clock time, host paths, platform separators, locale output, environment values, or object insertion order.

- file digest: SHA-256 of exact stored generation bytes (the compiler separately rejects non-UTF-8/non-LF text; the loader never normalizes);
- package digest: digest of `{ files: [{ path, digest }] }`, sorted by logical path, including `workflow.lock.json` and excluding `current.json`;
- lockfile digest: digest of exact canonical lockfile bytes;
- plan digest: `canonicalJsonDigest(plan)`, where public canonical `plan` has no `planDigest` member;
- environment digest: the exact preimage and literals in section 15; no host may add or omit a field.

The lockfile never contains the package digest, avoiding a digest cycle. The compiled plan records package and lockfile digests as evidence but package digest calculation never depends on the plan. After the public plan is deeply frozen, the compiler calculates `planDigest` over that plan and places the digest only on the separately frozen handle/evidence wrapper. The digest therefore has no self-reference.

## 9. Stable diagnostics

Every failure has a stable code, severity, redacted message, package-relative POSIX path, and RFC 6901 JSON Pointer where applicable. Diagnostics and related locations are detached, deeply frozen, deterministically sorted, and safe to persist.

The public Contract v2 diagnostic code set is:

```text
WF2_SCHEMA_VERSION_UNSUPPORTED
WF2_PACKAGE_LAYOUT_INVALID
WF2_UNKNOWN_OR_NOOP_FIELD
WF2_LOCK_MISMATCH
WF2_PROVIDER_CONTRACT_MISMATCH
WF2_BOB_CAPABILITY_MISMATCH
WF2_PREDICATE_INVALID
WF2_PROVIDER_INPUT_INVALID
WF2_PROVIDER_OUTPUT_INVALID
WF2_PROVIDER_ERROR_INVALID
WF2_REQUIRED_ARTIFACT_MISSING
WF2_ARTIFACT_SCHEMA_INVALID
```

Absolute host paths, package content, prompts, provider payloads, and artifact content never appear in messages. Control characters are normalized, valid remote HTTP(S) URLs remain readable, local/file/custom-scheme paths are redacted, and messages are capped at 512 Unicode code points. A compiler failure creates no registration, run, provider call, or artifact commit.

## 10. Strict local JSON Schema catalog

All schemas use JSON Schema 2020-12 and AJV 8 in strict, synchronous mode. A catalog consists only of caller-supplied local schema documents with canonical package-relative ids. Each document has the exact `$schema` dialect and an exact top-level `$id`; nested `$schema`/`$id` are forbidden.

References may be only `#`, `#/...`, `<local-id>`, `<local-id>#`, or `<local-id>#/...`. Remote URLs, file/custom schemes, anchors, query strings, percent-encoded aliases, backslashes, dot aliases, missing documents, missing targets, and cyclic reference components are rejected. `format` is unsupported; the compiler does not load `ajv-formats`. The supported keyword set is fixed in code, and schema-shaped children are traversed without treating data under `const`, `enum`, `default`, or `examples` as schemas.

Catalog roots are JSON objects, never boolean schemas. Boolean `false` is allowed only at nested schema positions and is replaced in the AJV-only transformed copy by a fresh `{ "not": {} }`; the outer replacement object's identity maps the `not` error back to the original false location. Original schema evidence is unchanged. All documents are registered and compiled in sorted id order, including unused documents. The catalog emits exactly one cycle diagnostic, selected from the globally first in-cycle reference edge. Canonical evidence includes each original schema digest and a catalog digest. AJV validators remain in the private plan handle; every AJV error produces one fixed-message diagnostic with exactly one related schema location and no AJV params/internal ids/data.

The same opaque compiled handle provides one read-only instance-pointer query owned by the schema module. The query accepts only the branded handle and a canonical RFC 6901 pointer, traverses the already detached local schema graph without invoking AJV validation or user code, and returns either no resolution or a frozen, code-unit-sorted set of conservative runtime JSON kinds from `null | boolean | number | string | array | object`; the exact result order is `array, boolean, null, number, object, string`. JSON Schema `integer` is reported as `number`; an accepted dense `type` array is normalized, deduplicated, and sorted by that same order; and a reachable target without a narrower provable kind returns all six kinds. It never exposes source schemas, schema nodes, validators, AJV objects, or mutable indexes.

Instance traversal is intentionally narrower than validation and is deterministic. Before consuming each token and again after the final token, including for root `""`, the query repeatedly follows a sole local `$ref`; `$schema`, `$id`, `$defs`, `$comment`, `title`, `description`, `default`, `deprecated`, `readOnly`, `writeOnly`, and `examples` may coexist, but any validation sibling beside `$ref` makes that traversal unresolved. A non-reference root resolves. An object token resolves only through an exact own `properties` member. A canonical decimal array-index token resolves through its exact `prefixItems` position, or through `items` only after the prefix is exhausted. Boolean `true` is reachable and has all six kinds but cannot be traversed further; boolean `false` is unresolved. A traversal node containing `patternProperties`, `dependentSchemas`, `allOf`, `anyOf`, `oneOf`, `if`, `then`, `else`, `not`, `contains`, `propertyNames`, or `unevaluatedProperties`/`unevaluatedItems` is unresolved for further traversal. `additionalProperties` never creates an implicit named pointer; it does not block an exact `properties` member. At the normalized target, an exact `type` string or accepted dense `type` array supplies the kinds, `integer` becomes `number`, duplicate normalized kinds collapse, and an absent `type` supplies all six kinds; `const` and `enum` do not narrow the query result. Cyclic `$ref` graphs never reach this API because F3 rejects them before creating a handle. This API is the only owner of instance-pointer/schema-kind reasoning. Predicate, template, manual-form, provider, and artifact code must not reparse schemas or derive `properties` paths independently.

## 11. Predicate contract

Predicates are structured YAML, not expression strings. Leaf predicates are closed `{ kind, left, right? }`: `kind` is `equals | notEquals | in | greaterThan | greaterThanOrEqual | lessThan | lessThanOrEqual | exists`; `left` is a typed input/committed-output reference; `right` is required canonical JSON for equality/ordered comparisons, is a non-empty canonical JSON array for `in`, and is absent for `exists`. Boolean nodes are closed `{ kind: "all" | "any", predicates }` or `{ kind: "not", predicate }`. `in` uses deep canonical equality. Ordered comparisons accept finite numbers against finite numbers or strings against strings only; there is no coercion or locale comparison.

One predicate is limited to depth 32, 1,024 total AST nodes, 128 direct children in each `all`/`any`, and 256 dense members in each `in`. `all` and `any` require at least one child. The canonical UTF-8 encoding of all literal `right` values in one predicate is limited to 262,144 bytes. Compilation counts these limits iteratively from descriptor snapshots before building or recursively evaluating the AST; an over-limit predicate yields `WF2_PREDICATE_INVALID` and no partial AST.

The compiler resolves every RFC 6901 pointer against the declared schema and applies visibility by placement and lexical dominance:

- `inputs[i].requiredWhen` sees declared inputs only and no output;
- `steps[i].when` sees declared inputs plus value outputs from lexical steps `0..i-1` only;
- every value template, agent context, or result source in `steps[i]` sees declared inputs plus value outputs from lexical steps `0..i-1` only;
- `steps[i].transition.decisions[*].when` sees those same values plus `steps[i].output` only when that output is `kind: "value"` and has durably committed successfully.

Thus a lexically future output is illegal even if a prior loop iteration happens to leave a value with that id, and a same-step reference is illegal everywhere except its owning outgoing transition. Validation, preflight, and runtime import the same parser/evaluator and call it with exactly `{ inputs, committedOutputs }`. Entry/precondition contexts contain strictly prior committed outputs. The post-commit transition context is a fresh immutable snapshot that additionally contains the just-committed current value output; its private commit evidence must name the current step, current attempt, and same durable success revision, so an older loop iteration cannot satisfy the exception.

F5 receives schemas only in a compiler-owned environment derived one-to-one from the F4 package: input bindings are `{ id, schemaId, schema }`; the dense step table has exactly one entry per F4 step, either `{ kind: "noValue" }` or `{ kind: "value", id, schemaId, schema }`; `schemaId` is the exact F4 field and must equal the F3 opaque handle's evidence root id. This representation makes the actual step count authoritative and prevents one step from acquiring multiple visible outputs. The single P1 compiler constructs the table directly from the validated, detached F4 result and F3 catalog results; this one-to-one construction is a trusted internal precondition, and no other production caller may synthesize or relabel it. F5 validates the closed table shape, handle brands, root-id match, array bounds, id uniqueness, and placement indexes but does not accept raw schema documents or a caller-computed pointer allowlist.

For `equals`, `notEquals`, `in`, and `exists`, the referenced pointer must have an F3 resolution. Ordered predicates additionally require the right operand to be a finite number or string and the resolved kind set to be exactly `number` or exactly `string`, respectively. A missing, ambiguous, mixed-kind, no-value output, or invalid handle produces `WF2_PREDICATE_INVALID` and no partial AST. F5 validates every handle at root-pointer inspection before traversing the predicate. It converts an F3 `TypeError` during that binding preflight into exactly one predicate diagnostic at the supplied predicate base location; malformed predicate pointers are rejected at their `left.pointer` locations before F3 is called.

Runtime order is fixed: evaluate step-entry `when`; execute the attempt; validate the command/agent/manual output or provider error and all artifacts; promote/flush the valid artifact set; durably commit the attempt transaction, run success state, and current output; only then evaluate outgoing decisions in declaration order. An output/error/artifact validation failure commits no success value and never evaluates the transition. A crash after success commit but before route publication re-evaluates the transition from committed state without dispatching the step again. A missing/corrupt committed value or evaluator failure holds routing fail-closed and dispatches no next step; it does not roll back the durable success or substitute transient data.

References to future steps, transient or uncommitted provider values, filesystem state, time, environment variables, or undeclared fields are rejected unconditionally. Array order and short-circuit behavior are specified by the AST, not by YAML/object insertion order. F5's golden matrix includes every placement and the 15 frozen legacy human-gate mappings (C1 inventory item 01 and items 05–18), whose approval output `/decision` is read only by that manual step's outgoing transition.

## 12. Provider contracts and exact binding

Every `ActionRegistry` instance owns exactly one live `WorkflowProviderRegistry`; there is no process-global v2 registry. `ActionRegistry.registerWorkflowProviderContract(...)` and `ActionRegistry.snapshotWorkflowProviderCatalog()` delegate only to that owned registry. The legacy `ActionProvider`, `register`, `list`, and `execute` surface remains source- and behavior-compatible during F6. Legacy registrations are never mirrored into v2, and v2 binding never falls back to the legacy id-only map.

A v2 registration is the exact ordinary own-data wrapper `{ sourceId, contract }`; `contract` is exactly `{ id, version, inputSchema, output, errorSchema, sideEffect, idempotency, requiredCapabilities, dispatch }`. Mutable ordinary records are accepted, detached, and frozen. Proxies, accessors, exotic records, sparse/extra-property arrays, and callable Proxy dispatches are rejected without invoking their behavior. `sourceId`, provider ids, and capabilities are 1–128 character F4 ids. Capability arrays are dense, code-unit-sorted, unique, and have 0–128 entries. Schema evidence is exactly `{ id, bytes, digest }`: an NFC one-level `schemas/*.json` id of at most 240 UTF-8 bytes, a safe integer byte count from 1 through 4,194,304, and an exact lowercase SHA-256 digest. F6 validates that evidence syntax but has no raw schema content. P4 resolves actual schema bytes and the fixed dialect and constructs the exact requirement evidence compared during binding.

The dispatch ABI is `(input: WorkflowProviderDispatchInput) => Promise<unknown> | unknown`. Its frozen input contains validated frozen JSON `value`, an `AbortSignal`, frozen idempotency `{ mode: "idempotent" } | { mode: "key-required", key } | { mode: "non-idempotent" }`, and frozen effect `{ kind: "none" } | { kind: "workspace-write", artifacts } | { kind: "external" }`. The workspace artifact capability is frozen and write-only, exposing only `writeArtifact({ id, bytes: Uint8Array }): Promise<void>`; it snapshots bytes on entry and exposes no path/read/promote/commit API. Only `workspace-write` receives it. The registered external dispatch is the external adapter and receives no writer. R2 guarantees both discriminants match the bound contract; a throw/rejection is unknown error-envelope input. F6 checks only callable/non-proxy identity and never constructs or inspects this input.

Registration versions are canonical strict SemVer including build metadata. After `semver.parse(version, { loose: false })`, reconstructing `${parsed.version}${parsed.build.length ? "+" + parsed.build.join(".") : ""}` must equal the original. Registration is synchronous and atomic: invalid input throws `TypeError` before mutation; a duplicate live `(id, exactVersion)` throws an owner-aware `Error` identifying retained and requesting `sourceId` values. Multiple other exact versions remain legal. Success returns an idempotent, token-protected disposable, and a stale disposable cannot remove a later re-registration.

The contract-digest preimage is exactly the detached deeply frozen canonical object `{ id, version, inputSchema, output, errorSchema, sideEffect, idempotency, requiredCapabilities }`. It contains no wrapper version, source metadata, dispatch, or digest field. F6 computes `canonicalJsonDigest(preimage)`, adds that `contractDigest` to the public entry, and deeply freezes the result. Catalog evidence is exactly `{ schemaVersion: "workflow-provider-catalog/v2", providers }`, with flattened provider entries sorted by `(id, version)` using code-unit order. Private catalog state holds a new immutable exact-version dispatch map.

Binding accepts the branded catalog, a closed non-dispatch requirement, and a validated package-relative diagnostic location. A requirement range has 1–256 control-free code units and must pass the same strict `semver.validRange` rule as F4. Matching uses pinned `semver@7.7.2`, `loose: false`, and default `includePrerelease: false`. It filters by id/range and selects the highest candidate with `semver.compare` before comparing input/output/error schema evidence, side effect, idempotency, and capabilities. It never downgrades after a selected-contract mismatch. Because `semver.compare` ignores build metadata, distinct build-only variants tied at the highest precedence fail as ambiguous.

Bind precedence is outer shape, diagnostic location, catalog brand, recursive requirement validation, range, candidates, highest ambiguity, then recursive selected-contract comparison. Exact records validate required fields in declaration order before code-unit-sorted unknown own string keys; keys are RFC 6901 escaped. Container/proxy/accessor/symbol/exotic/sparse failures point to the container. Schema evidence is `id`, `bytes`, `digest`; output is `kind` then value-schema leaves, while unit `schema` is an unknown-key pointer. Capability arrays validate indexes ascending and point to the first invalid, duplicate, or out-of-order index. Comparison uses the same leaf order; arrays use the first differing index, and a prefix-length mismatch uses the first missing/excess index. Invalid outer/location/catalog inputs throw `TypeError`. Once location and brand are valid, a failure returns exactly one frozen `WF2_PROVIDER_CONTRACT_MISMATCH`; malformed/no-candidate/ambiguous version failures use `/version`, and all others use the first pointer above. Success is deeply frozen `{ ok: true, lockEvidence, dispatchHandle, diagnostics: [] }`; failure and its diagnostics are deeply frozen. `lockEvidence` is exactly section 15's `LockedProviderBinding` shape.

The frozen dispatch handle has no public callable/dispatch field. F6 associates it with the captured dispatch identity only in a module-private `WeakMap`; P4 stores only the handle in private compiled-plan state. R2 later adds the sole module-internal, non-barrel-exported bridge in `providerRegistry.ts`; that bridge brand-checks the handle and calls the captured dispatch exactly once, without validation, catch, retry, artifact, or commit behavior. Later live disposal/re-registration cannot change existing snapshot/bind evidence, handle identity, or captured dispatch identity. F6 owns only strict registration, lifecycle, snapshot, selection, lock evidence, and opaque binding. P4 owns actual schema/dialect resolution and validators. R2 owns bridge invocation plus all runtime validation/retry/acceptance behavior.

## 13. Bob profile and two-stage binding

The compiler binds one audited constant profile: extension id `IBM.bob-code`, exact version `2.0.1`, activation function `registerSource`, source functions `deactivate`, `log`, `registerWorkflow`, and task capabilities `getAllMetadata`, `getMessages`, `sendMessage`, `setStepComplete`, `startSubagent`, `toSerializable`. Capability names are respectively prefixed `source.` and `task.` and sorted exactly as the F7 golden object. Its canonical digest is `sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73`. The live extension must match this exact descriptor/capability profile at compile/registration time.

Some task capabilities exist only after Bob returns a task handle. F7 owns the sole `probeBobTaskCapabilities()` implementation; R5 calls it immediately before starting execution and must not add a second validator/profile. It verifies the task handle against the plan's required capabilities without changing the plan. A mismatch fails before the first provider call and is recorded as `WF2_BOB_CAPABILITY_MISMATCH`.

## 14. Artifact and provider transaction boundary

Every command/agent/manual step uses one run/attempt transaction; provider writers can write only to its staging area. Before success commit, the runtime validates a provider value output or exact unit return and provider error shape where applicable, validates agent/manual value output against its compiled schema and 16,777,216-byte bound, and validates every declared artifact, content hash, content schema, owner, byte limit, media type, and required-artifact completeness. Manual form/approval input is detached into the exact section-6 output object before validation. Only a fully valid set is promoted and referenced by success state.

This is a P4/R2 runtime boundary, not F6 registration behavior. P4 carries the selected schema identities, validators, and only the opaque bound dispatch handle in private plan state. R2 validates/freezes the JSON value, creates the frozen idempotency/effect variants matching the bound contract, and for `workspace-write` creates the frozen write-only staging writer that snapshots each byte array on entry. `none` and `external` receive no writer. R2's non-barrel-exported provider-registry bridge brand-checks the handle and forwards that one ABI input in one dispatch call without validation, catch, retry, artifact, or commit behavior; the surrounding R2 invocation layer owns all of those decisions and treats a throw/rejection as error-envelope input. A unit provider must return exactly `undefined`; any other unit return and any invalid value/error/artifact set creates no success value, output entry, artifact promotion, or success commit. R2 also applies the bound idempotency/retry rule before any redispatch. F6 does not execute a provider, construct an ABI input, validate an output, retry an attempt, or inspect commit state.

Artifact validation snapshots exact staged bytes once and checks path, file kind, owner, declared media type, byte count, and digest before decoding. For media type `application/json` or a subtype ending in `+json`, the bytes must be BOM-free strict UTF-8 containing exactly one JSON value with no duplicate object keys; the detached canonical JSON value is schema input. For `text/*`, the bytes must be BOM-free strict UTF-8 and the exact decoded string, without newline or Unicode normalization, is schema input. For every other media type, schema input is the RFC 4648 base64 string with padding produced from the exact bytes. Decode/base64/schema work occurs only after the declared byte bound is satisfied. A decode or content-schema failure emits `WF2_ARTIFACT_SCHEMA_INVALID` with redacted path-only evidence, commits nothing, and never exposes content in diagnostics.

Promotion uses the existing safe path and run lease primitives, plus an atomic manifest/pointer commit. Files are flushed before publication. The attempt transaction and run success/output event are then durably committed under the run lease/CAS boundary before an outgoing transition may read the current output. A validation, promotion, or success-commit failure leaves the prior run state authoritative, commits no success value, does not evaluate the outgoing transition, and makes staging ineligible for reuse. Orphan staging is diagnostic/cleanup input only.

## 15. Lockfile contract

`workflow.lock.json` is canonical JSON. P1's hostile-input decoder rejects every additional property and enforces this exact public shape and these literal versions:

```ts
type Sha256Digest = `sha256:${string}` // decoder requires sha256:<64 lowercase hex>

interface WorkflowCompilerPolicyVersions {
  readonly canonicalJson: "workflow-contract-canonical-json/v1"
  readonly diagnostics: "workflow-contract-diagnostics/v1"
  readonly yaml: "workflow-contract-yaml/v2"
  readonly packageShape: "workflow-contract-package-shape/v2"
  readonly jsonSchema: "workflow-contract-json-schema/2020-12-v1"
  readonly predicate: "workflow-contract-predicate/v2"
  readonly provider: "workflow-contract-provider/v2"
  readonly bob: "workflow-contract-bob/2.0.1"
  readonly artifact: "workflow-contract-artifact/v2"
}

interface LockedFileEvidence {
  readonly id: string
  readonly path: string
  readonly bytes: number
  readonly digest: Sha256Digest
}

interface LockedProviderSchemaEvidence {
  readonly id: string
  readonly bytes: number
  readonly digest: Sha256Digest
}

type LockedProviderOutput =
  | { readonly kind: "unit" }
  | { readonly kind: "value"; readonly schema: LockedProviderSchemaEvidence }

interface LockedProviderBinding {
  readonly id: string
  readonly requestedVersion: string
  readonly exactVersion: string
  readonly contractDigest: Sha256Digest
  readonly inputSchema: LockedProviderSchemaEvidence
  readonly output: LockedProviderOutput
  readonly errorSchema: LockedProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
}

type BobCapabilityName =
  | "source.deactivate" | "source.log" | "source.registerWorkflow"
  | "task.getAllMetadata" | "task.getMessages" | "task.sendMessage"
  | "task.setStepComplete" | "task.startSubagent" | "task.toSerializable"

type BobTaskCapabilityName = Extract<BobCapabilityName, `task.${string}`>

interface LockedBobBinding {
  readonly profile: "bob/2.0.1"
  readonly extensionId: "IBM.bob-code"
  readonly extensionVersion: "2.0.1"
  readonly profileDigest: "sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73"
  readonly capabilities: readonly [
    "source.deactivate", "source.log", "source.registerWorkflow",
    "task.getAllMetadata", "task.getMessages", "task.sendMessage",
    "task.setStepComplete", "task.startSubagent", "task.toSerializable"
  ]
  readonly requiredCapabilities: readonly BobCapabilityName[]
  readonly taskCapabilities: readonly BobTaskCapabilityName[]
}

interface WorkflowPackageLock {
  readonly schemaVersion: "workflow-register-lock/v2"
  readonly compilerContractVersion: "workflow-register-compiler/v2"
  readonly policyVersions: WorkflowCompilerPolicyVersions
  readonly workflow: {
    readonly path: "workflow.yaml"
    readonly bytes: number
    readonly digest: Sha256Digest
  }
  readonly prompts: readonly LockedFileEvidence[]
  readonly schemas: readonly LockedFileEvidence[]
  readonly providers: readonly LockedProviderBinding[]
  readonly bob: LockedBobBinding
  readonly environmentDigest: Sha256Digest
}
```

`workflow.bytes` is 1–1,048,576; prompt/schema `bytes` and provider-schema canonical `bytes` are 1–4,194,304; every byte value is a safe integer and must equal the exact evidence length. Prompt paths are `prompts/*.md`, schema paths are `schemas/*.json`, and each id/path is unique. `prompts` and `schemas` are sorted by `(id, path)`, `providers` by `id`, and every capability array by JavaScript code unit; all arrays reject duplicates rather than silently sorting caller input. `bob.capabilities` is exactly the nine F7 capability names; the required arrays are duplicate-free sorted subsets, and `taskCapabilities` contains only the six `task.*` names. The lock contains no package digest and does not list itself, avoiding both digest cycles.

The environment digest is exactly `canonicalJsonDigest(preimage)` for this closed preimage:

```ts
interface WorkflowCompilerEnvironmentDigestPreimage {
  readonly schemaVersion: "workflow-register-compiler-environment/v2"
  readonly compilerContractVersion: "workflow-register-compiler/v2"
  readonly policyVersions: WorkflowCompilerPolicyVersions
  readonly providers: readonly LockedProviderBinding[]
  readonly bob: LockedBobBinding
}
```

The preimage uses the lock arrays byte-for-byte in their required canonical order. Host purpose/leaseability, private environment identity, paths, clocks, private bound-dispatch handles/captured functions, validators, and registry entries not selected by this package are excluded. `WorkflowPackageLock.environmentDigest`, the compiled plan, and `run.json` must equal that one public evidence result; the plan store additionally partitions by private environment namespace before using package/environment digests.

The compiler compares every leaf and rejects missing, additional, noncanonical-order, duplicate, out-of-bound, or drifted evidence as `WF2_LOCK_MISMATCH`. Normal validation, registration, save, and run commands never update the lock. Only the explicit authoring lock operation may generate a new lock, and package save compiles the staged bytes before publication.

## 16. The single compiler and frozen plan

The only executable pipeline is:

```text
raw package -> layout/bytes -> strict YAML -> package schema
-> local schema catalog -> references/predicates -> provider/Bob binding
-> lock verification -> policy checks -> canonical plan -> deep freeze
```

`compileWorkflowPackage()` returns either sorted diagnostics or one `CompiledWorkflowPlanHandle`. Its public canonical `plan` contains normalized workflow/step ASTs, prompts as normalized UTF-8/LF JSON strings plus digests, schema catalog evidence, required artifacts, exact provider/Bob evidence, package/lock/environment digests, literal compiler contract version `workflow-register-compiler/v2`, and the exact section-15 policy record. It never contains a Node `Buffer`, `planDigest`, source path outside package-relative ids, current time, or mutable registry reference. Private handle state records its exact private environment identity and may retain prompt bytes, validator identities, and F6 opaque bound-dispatch handles; it never extracts or stores provider dispatch functions. The handle cannot be rehomed into another environment namespace. The frozen handle exposes `planDigest = canonicalJsonDigest(plan)` beside `plan`.

Every call to the deterministic audited constructor creates a new branded `WorkflowCompilerEnvironment` object and a new opaque private environment identity stored in a module-private `WeakMap`. That private state binds the exact provider snapshot/dispatch generation, Bob profile instance, `purpose`, and leaseability; it is never reconstructed from public evidence. The public `environmentDigest` remains the section-15 evidence-only digest, so two environment objects may have equal public digests without sharing private identity or executable handles. Runtime environments use ordinary F6 handles backed by registered dispatches. Authoring-validation and evidence environments also use ordinary F6 handles, but their provider catalogs are populated with compile-only dispatches that deterministically throw if called; their private environment identities are non-leasable. There is no second handle/binding type, no dispatch function exposure through P4, and `purpose` remains excluded from public plan/digests.

Parsers, AJV, semantic validators, provider binders, predicate compilation, and policy checks are compiler-private. `workflowValidator`, registration, runtime, Bob adapter, Operation Hub, authoring preview, CLI scripts, and CI may call the compiler facade but may not import those internals.

## 17. Plan store, cache invalidation, and leases

One process-wide `WorkflowPlanStore` partitions private caches first by the exact branded `WorkflowCompilerEnvironment` object/private namespace in a `WeakMap`, then within that namespace by package digest plus public environment digest. Only calls using the same environment object may coalesce compilation or share a `CompiledWorkflowPlanHandle`. Equal public digests from different `ActionRegistry` instances, provider snapshots, disposal/re-registration generations, purposes, or leaseability modes never share private handles.

`getOrCompile(...)` is the non-leasing entry point for all three purposes. `acquire(...)` is legal only for an environment whose private purpose is `runtime`; it returns a `WorkflowPlanLease` containing that namespace's handle, plan digest, package digest, and environment digest. Authoring-validation/evidence calls can compile and inspect through `getOrCompile` but can never acquire a lease or enter R2. A process-wide per-slot invalidation epoch sits outside the non-iterable namespace `WeakMap`; any file change increments that epoch, so every namespace rejects its prior unleased entry on its next request. There is no per-file executable cache. Invalidation never mutates or replaces an already leased entry.

The store may evict an unleased generation. `WorkflowPlanLease.release()` owns release; it is idempotent, and its second/subsequent calls are no-ops. After release, only `released` inspection and `release()` are legal; handle/use operations throw a deterministic programmer error. The store exposes no competing `release(lease)` API. A run resume can reload and compile its recorded immutable generation directly. If that generation or its exact bindings are unavailable, resume fails closed; it never follows `current.json` to a different plan.

## 18. Run provenance and resume behavior

At run creation, `run.json` records at least:

```text
planDigest, packageDigest, generation, lockfileDigest,
environmentDigest, compilerContractVersion,
providerExactBindings, bobProfileBinding
```

The in-memory run holds the corresponding plan lease. Every execution/resume adapter checks the recorded evidence against the leased handle. Runtime reads prompts, schemas, predicates, and provider contracts from that handle, not from the package directory.

`compilerContractVersion` is exactly `workflow-register-compiler/v2`; `environmentDigest` is the section-15 preimage digest; provider and Bob bindings are the same closed evidence stored in the lock/plan, not reformatted runtime summaries.

After restart, resume loads the recorded generation, recompiles it against the recorded/currently available exact environment as required by policy, and requires identical plan/package/lock/environment evidence. A new `current.json`, a partial pointer temp file, or a newer generation cannot alter an existing run.

## 19. Atomic authoring and pointer replacement

Package save is ordered as follows:

1. write out-of-band ownership metadata at `versions/.staging-<nonce>/owner.json` and the complete next package under `versions/.staging-<nonce>/package/`;
2. flush every package file and the staging package/control directories where supported;
3. load only the owned staging `package/` through the generation loader; exclude `owner.json` from all layout/digest/compile inputs;
4. compile schema, lock, provider, Bob, predicate, and artifact contracts;
5. derive the package digest, atomically rename only `package/` to `versions/<package-digest>/`, and remove the staging control directory;
6. write and flush a sibling temporary pointer;
7. atomically replace `current.json`;
8. report success only after pointer replacement.

On Windows, replacement uses the repository's tested workspace-file transaction abstraction and never exposes a partially written JSON pointer. If any step fails, the old pointer remains authoritative. A published but unreferenced generation is safe and may be cleaned later; it is never automatically selected.

## 20. Recovery, cleanup, and failure policy

On activation, the repository scans for `.staging-*`, pointer temp files, malformed pointers, missing generations, and unreferenced immutable generations. It reports deterministic diagnostics. It may remove only stale staging/temp entries after ownership, age, and path checks; it does not repair or select a generation automatically.

Failure injection covers every save boundary, file/directory flush, rename, pointer replace, provider staging/validation/promotion, and run provenance write. A crash before pointer replacement leaves the old generation visible. A crash after replacement yields the new complete generation. Package cache invalidation and cleanup cannot revoke a live plan lease.

## 21. Repository migration and product cutover

The base tree contains exactly 27 tracked legacy definitions: 17 root workflows, one template-library workflow, three companion-extension templates, four workflow-register samples, and two test fixtures. Before any conversion, C1 freezes every legacy path and exact-byte SHA-256 as immutable source evidence. Migration evidence has three separate canonical arrays: immutable `legacySources`, active `targets`, and append-only `history`. `targets` contains at most one active, final, successfully compiled record for each legacy source and each `(collection, slot)` pair; final mode requires exactly 27. Each target contains the old path/hash, new collection/slot/generation, package/lock/environment digest, `planDigest = canonicalJsonDigest(publicPlan)`, field/provider/artifact mappings, retired fields, and an empty diagnostic set. One-to-one active-set validation reads only `legacySources` and `targets`; historical attempts can never satisfy or duplicate an active migration.

`history` contains only failed or superseded attempts, sorted by a unique contiguous positive `sequence`. Every entry records `status: "failed" | "superseded"`, legacy path/hash, collection, slot, nullable attempted generation and digests, all available field/provider/artifact/retirement mappings, a deterministic closed reason `{ kind, diagnosticCodes, detailDigest }`, and `supersededBy`. `kind` is `conversion-diagnostic | publication-failure | provider-contract-revision | schema-revision | mapping-correction`; diagnostic codes are sorted unique members of the twelve-code set and `detailDigest` hashes canonical redacted detail. A failed entry has `supersededBy: null`; a superseded entry copies the prior active target completely and has exact `{ generation, packageDigest }` naming the new active target. History is validated for its own sequence, status, digest, and referential integrity but ignored by active one-to-one counts.

Companion provider contracts and their final schemas are registered before converting any repository package. Inline prompts move to `prompts/*.md`; local schemas move to `schemas/*.json`; provider input/output/error and required artifact schemas are emitted by the converter; final locks are generated once from those pre-registered contracts. Legacy dynamic workspace/run artifact paths are mapped explicitly to static attempt-root-relative v2 paths and recorded in `artifactMappings`; an unreviewed path form blocks conversion. Unknown, ignored, or no-op fields block conversion until explicitly resolved. The 15 legacy same-step human-gate transitions are frozen as inventory item 01 and items 05–18: each approval `resultKey: humanGate` becomes that manual step's value output object, and only its outgoing predicate reads `/decision`. No synthetic prior step or transient-state fallback is allowed.

Published generation bytes are never patched for a later provider/schema/mapping correction. The converter first writes and validates a complete immutable generation while the old pointer and active target remain authoritative. It then exclusively creates `docs/workflows/.workflow-contract-v2-migration.lock` and writes the durable, canonical, script-only journal `docs/workflows/.workflow-contract-v2-migration-journal.json`, containing the exact old/new pointer bytes (with an explicit absent marker for an initial target), old/new migration-evidence bytes and digests, source identity, and phase. Only this journaled transaction may replace the pointer and evidence pair. Before pointer CAS, recovery rolls back to the exact old pair. After pointer CAS, recovery validates the new generation and rolls forward the exact new evidence, appending the old target to `history` as `superseded` when one exists, setting its `supersededBy`, and creating or replacing that source's single active `targets` record. The journal is removed only after both files and their parent directories are flushed and reread successfully; the lock is removed last. A competing process, malformed/stale lock, or lock without a valid journal fails closed and requires explicit recovery rather than stealing ownership.

Outside an active journal, `current.json` and the source's single active target must name the same generation/package digest. While a journal exists, every converter, inventory, compile-manifest, and final-cutover command fails closed into recovery mode before processing another source. If roll-forward evidence cannot be written after pointer CAS, the new pointer remains authoritative, the journal remains recovery-required, no second active target is invented, and final/CI mode fails until deterministic recovery completes. A failed conversion before the journal appends only a failed history record and leaves the old pair unchanged. Migration journals and the one-time recovery code are deleted with the converter at C9.

After all 27 packages compile, v1/legacy parsers, schemas, types, fixtures, authoring shims, source-regex provider discovery, and `WORKFLOW.md` CI rules are deleted. Product commands and GUI create/edit only v2 packages. A residual legacy definition or production legacy import is a CI failure. Detection at a product boundary produces unsupported schema/layout diagnostics, not migration advice that implies an available product migrator.

## 22. CI matrix and final acceptance

The `workflow-contracts` workflow runs on Ubuntu and Windows. Each job performs `npm ci`, compile, unit/policy/package checks, discovers every v2 slot, compiles every current generation, asserts zero legacy definitions, and uploads a canonical compiled-plan manifest. Each entry is keyed and sorted by canonical repository-relative `collection` plus direct-child `slot`; uniqueness is on `(collection, slot)`, because workflow ids repeat across the nine roots. The aggregation job compares manifest bytes/digests across operating systems and fails on any mismatch, lock drift, unknown provider, unsupported preflight, or Bob binding gap.

Final acceptance consists of exactly these 20 automated proofs:

1. **A01:** validation, registration, runtime, Bob, and Operation Hub receive the same plan digest for one generation.
2. **A02:** repeated compilation produces identical canonical plan bytes and digest.
3. **A03:** compiled plan data and nested values cannot be mutated.
4. **A04:** missing, legacy, and unknown `schemaVersion` values are rejected at every entry point.
5. **A05:** unknown, no-op, step-inapplicable, sparse, over-limit, and over-depth package values are rejected with stable locations and no partial plan.
6. **A06:** prompt, full schema identity, provider, and Bob capability lock mismatches are independently rejected; id-only schema aliases never match.
7. **A07:** provider input schema failure performs zero provider calls.
8. **A08:** provider output/error schema failure commits zero run success values and zero artifacts.
9. **A09:** required artifact missing, hash mismatch, media/decode mismatch, or JSON/text/binary content-schema failure commits zero artifacts and leaks no content.
10. **A10:** compiler and runtime match both the complete control-flow table and the bounded placement-specific predicate truth table: entry/preconditions see only inputs plus prior committed outputs, all 15 frozen human gates may read their own durably committed `/decision` only in the outgoing transition, future/transient/uncommitted references are rejected, and over-limit predicates produce no partial AST or dispatch.
11. **A11:** every package-save failpoint preserves the old `current.json` until the new generation is complete.
12. **A12:** resume loads the run-recorded generation and is unaffected by a newer current generation.
13. **A13:** package changes invalidate the whole package while existing plan leases retain their original handle.
14. **A14:** the run record persists every required digest and exact provider/Bob binding.
15. **A15:** all 27 repository sources have exactly one active one-to-one target matching its pointer, history is separate and referentially valid, migration-journal failpoints recover deterministically, no journal remains, and every active package compiles.
16. **A16:** no tracked legacy definition, legacy production parser, or product migration path remains.
17. **A17:** local-schema cycles, catalog escapes, remote refs, unsupported formats, and unused invalid schemas fail closed.
18. **A18:** provider, artifact, pointer, and generation staging are never executable or reusable before validation/commit.
19. **A19:** Ubuntu and Windows compiled-plan manifests are byte-identical.
20. **A20:** compile, unit, dependency/architecture/source/schema policy, package, package policy, and `git diff --check` all pass from a clean tree.
