# Workflow Contract v2 Foundation Implementation Plan

> **Execution:** Follow the master plan's RED/GREEN/review/commit protocol. Tasks F1 and F2 are completed behavior that workspace recovery must replay, not redesign.

**Goal:** Establish hostile-input-safe canonical evidence, diagnostics, local schemas, predicates, provider contracts, and Bob capability profiles before any package becomes executable.

**Design:** `../specs/2026-07-17-workflow-contract-v2-design.md`, sections 8–13.

## F1 — Canonical JSON, digest, and detached deep freeze — completed

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/jsonValue.ts`
- Create: `extensions/workflow-register/src/core/contractV2/canonicalJson.ts`
- Create: `extensions/workflow-register/test/workflowContractV2CanonicalJson.test.js`

**Public API**

```ts
export type JsonPrimitive = null | boolean | number | string
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export function cloneAndFreezeJsonValue(value: unknown): JsonValue
export function canonicalJsonText(value: unknown): string
export function canonicalJsonBytes(value: unknown): Buffer
export function canonicalJsonDigest(value: unknown): string
```

- [x] RED: import the missing modules and exercise primitives, null-prototype records, UTF-16 code-unit key order, retained array order, compact UTF-8, valid surrogate pairs, and `sha256:<64 lowercase hex>`.
- [x] RED: reject `undefined`, bigint, symbol, function, `NaN`, infinities, `-0`, sparse/extra-property arrays, symbol/non-enumerable/accessor properties, class/date/map/set/typed arrays, cycles, and lone surrogates.
- [x] RED: use object and array proxies whose traps throw; prove they are rejected before traversal. Replace `util.types.isProxy` after module load and prove the captured native is used.
- [x] GREEN: inspect each own descriptor once, clone only descriptor values, accept ordinary/null-prototype records, and recursively freeze a detached tree.
- [x] GREEN: render diagnostic paths without `JSON.stringify`; escape invalid path code units without invoking source behavior.
- [x] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2CanonicalJson.test.js
```

Recorded evidence: 34/34 focused tests, compile success, independent review approved with zero findings.

**Commit gate:** one feature commit plus reviewed hardening fix; no consumer code in this task.

## F2 — Stable diagnostics and fail-closed path redaction — completed

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/diagnostics.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Diagnostics.test.js`

**Public API**

```ts
export const WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES: readonly [
  "WF2_SCHEMA_VERSION_UNSUPPORTED",
  "WF2_PACKAGE_LAYOUT_INVALID",
  "WF2_UNKNOWN_OR_NOOP_FIELD",
  "WF2_LOCK_MISMATCH",
  "WF2_PROVIDER_CONTRACT_MISMATCH",
  "WF2_BOB_CAPABILITY_MISMATCH",
  "WF2_PREDICATE_INVALID",
  "WF2_PROVIDER_INPUT_INVALID",
  "WF2_PROVIDER_OUTPUT_INVALID",
  "WF2_PROVIDER_ERROR_INVALID",
  "WF2_REQUIRED_ARTIFACT_MISSING",
  "WF2_ARTIFACT_SCHEMA_INVALID"
]

export function createWorkflowContractV2Diagnostic(
  input: WorkflowContractV2DiagnosticInput
): WorkflowContractV2Diagnostic

export function sortWorkflowContractV2Diagnostics(
  diagnostics: readonly WorkflowContractV2Diagnostic[]
): readonly WorkflowContractV2Diagnostic[]
```

- [x] RED: enforce the exact frozen twelve-code tuple, closed severities, canonical package-relative POSIX paths, RFC 6901 pointers, related locations, and controls/DEL rejection in locations.
- [x] RED: normalize line endings, retain tab/LF, replace other C0/C1/DEL controls, reject lone surrogates, and cap at 512 Unicode code points using 511 plus ellipsis.
- [x] RED: redact POSIX, Windows drive, rooted, UNC/device, quoted/unquoted paths after arbitrary punctuation/control boundaries; redact `file:` and custom local schemes; preserve only well-formed HTTP(S) URLs with non-empty hostnames.
- [x] RED: reject sparse diagnostic and related-location arrays; preserve duplicates; prove deterministic direct-code-unit sorting by severity, path, pointer, code, message, and related locations.
- [x] GREEN: scan normalized raw text before control replacement; use a captured WHATWG `URL` constructor and a boundary scanner rather than delimiter regexes.
- [x] GREEN: detach and deeply freeze the diagnostic and every related location.
- [x] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Diagnostics.test.js
```

Recorded evidence: 19/19 focused tests, compile success, independent review approved with zero findings.

**Commit gate:** feature commit plus reviewed boundary fixes; no thirteenth diagnostic code.

## F3 — Strict, local-only JSON Schema 2020-12 catalog

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/jsonSchema.ts`
- Create: `extensions/workflow-register/test/workflowContractV2JsonSchema.test.js`

**Imports and AJV configuration**

```ts
import Ajv2020, {
  type ErrorObject,
  type ValidateFunction
} from "ajv/dist/2020"
```

Create exactly one AJV instance per compiled catalog with:

```ts
{
  allErrors: true,
  strict: true,
  strictSchema: true,
  strictNumbers: true,
  strictTypes: true,
  strictTuples: true,
  strictRequired: true,
  allowMatchingProperties: false,
  allowUnionTypes: false,
  validateFormats: true,
  $data: false,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
  ownProperties: true,
  validateSchema: true,
  addUsedSchema: false,
  inlineRefs: false,
  messages: false,
  verbose: true,
  logger: false
}
```

**Public API**

```ts
export const WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema" as const

export interface LocalJsonSchemaSource {
  readonly id: string
  // Intentionally unknown: this is the module's hostile-input trust boundary.
  readonly schema: unknown
  readonly location: WorkflowContractV2DiagnosticLocation
}

export function compileLocalJsonSchema(
  input: CompileLocalJsonSchemaInput
): CompileLocalJsonSchemaResult

export function validateLocalJsonSchemaValue(
  input: ValidateLocalJsonSchemaValueInput
): ValidateLocalJsonSchemaValueResult

export type LocalJsonSchemaInstanceKind =
  | "null" | "boolean" | "number" | "string" | "array" | "object"

export function inspectLocalJsonSchemaInstancePointer(input: {
  readonly compiled: CompiledLocalJsonSchema
  readonly pointer: string
}):
  | { readonly ok: true; readonly kinds: readonly LocalJsonSchemaInstanceKind[] }
  | { readonly ok: false }
```

The caller supplies one of the existing twelve diagnostic codes for its owning boundary. Every domain diagnostic emitted by this module, including catalog-entry, preflight, AJV compile, and value-validation failures, uses that caller code. The module does not add or substitute schema-specific public codes. Successful results expose deeply frozen canonical evidence (per-document digests and catalog digest) plus an opaque compiled handle branded in a private `WeakMap`.

`inspectLocalJsonSchemaInstancePointer` is the only public schema-introspection boundary. Its input is an exact ordinary own-data record; an invalid handle or malformed/noncanonical RFC 6901 pointer is a programmer error and throws `TypeError` without invoking traps. For a valid query it walks only the detached, immutable local schema graph captured at compile time and returns a deeply frozen result. A successful result contains the code-unit-sorted conservative runtime kind set `null | boolean | number | string | array | object` in exact order `array, boolean, null, number, object, string`, with `integer` normalized to `number`; an accepted dense `type` array is normalized and deduplicated; and a reachable target without a narrower provable kind returns all six kinds. It performs no validation, I/O, cloning of caller values, raw-schema exposure, or AJV call.

The resolver uses this exact algorithm:

1. Decode the canonical RFC 6901 pointer to tokens and start at the root node.
2. Before consuming each token and again after the final token, including when the pointer is root `""`, repeatedly follow `$ref` only when it is the sole validation keyword at that node. `$schema`, `$id`, `$defs`, `$comment`, `title`, `description`, `default`, `deprecated`, `readOnly`, `writeOnly`, and `examples` may coexist. A `$ref` with any other validation sibling is unresolved.
3. A string token traverses only an exact own member of `properties`. `patternProperties`, `additionalProperties`, `propertyNames`, and dependent keywords never invent a named pointer. An exact `properties` member remains usable when `additionalProperties` is present.
4. A canonical decimal array index (`0` or a nonzero digit followed by digits, within the safe-integer range) traverses its `prefixItems` member or, after that prefix, `items`. No other token traverses an array.
5. A traversal node containing `patternProperties`, `dependentSchemas`, `allOf`, `anyOf`, `oneOf`, `if`, `then`, `else`, `not`, `contains`, `propertyNames`, `unevaluatedProperties`, or `unevaluatedItems` is unresolved before consuming another token. Boolean `true` resolves only when it is the target and yields all six kinds; boolean `false` is unresolved.
6. At the normalized target, an exact `type` string or accepted dense `type` array maps directly, with `integer` mapped to `number`, duplicates removed, and the result placed in the fixed kind order. An absent `type` yields all six kinds. `const` and `enum` do not narrow kinds. F3 compile already rejects invalid type syntax and every `$ref` cycle, so neither is a query-state branch.

Every other traversal returns frozen `{ ok: false }`.

- [x] **RED 1 — hostile outer input:** reject proxy/accessor/sparse/exotic outer records and schema arrays without invoking traps/getters. Require exact ordinary own-data records. Fix compile precedence exactly: outer record shape → caller diagnostic code → caller base location → `rootId` → dense ordinary `schemas` array → source structural checks in array-index order → catalog index checks → catalog semantic checks. Fix validate precedence separately: outer shape → diagnostic code → caller location → compiled-handle `WeakMap` brand → value.
- [x] **RED 2 — safe source entries:** a source is exactly `{id, schema, location}` with own data descriptors. A hostile/malformed source wrapper, getter, proxy, sparse position, or malformed source location produces exactly one caller-code diagnostic at the compile base with `JSON Schema catalog entry is invalid.` It must not invoke or quote source-controlled text. After a structurally safe entry exists, invalid id/schema/dialect/ref/keyword diagnostics use that source's safe location.
- [x] **RED 3 — ids/dialect/root objects:** require a non-empty catalog, an existing root id, canonical package-relative ids excluding `:`, `?`, `#`, `%`, backslash, dot segments, and aliases. Every catalog document root must be an ordinary JSON object; reject boolean roots, including `false`. Require exact top-level `$schema` and `$id`; forbid nested `$schema`/`$id`.
- [x] **RED 4 — closed keyword walk:** accept only the following keywords and traverse only schema positions:

```text
$schema $id $ref $defs $comment
type enum const
multipleOf maximum exclusiveMaximum minimum exclusiveMinimum
maxLength minLength pattern
maxItems minItems uniqueItems maxContains minContains
maxProperties minProperties required dependentRequired
prefixItems items contains
properties patternProperties additionalProperties dependentSchemas propertyNames
if then else allOf anyOf oneOf not
unevaluatedItems unevaluatedProperties
title description default deprecated readOnly writeOnly examples
```

Single-schema children are `items`, `contains`, `additionalProperties`, `propertyNames`, `if`, `then`, `else`, `not`, `unevaluatedItems`, and `unevaluatedProperties`; schema arrays are `prefixItems`, `allOf`, `anyOf`, `oneOf`; schema maps are `$defs`, `properties`, `patternProperties`, and `dependentSchemas`. Never traverse data under `const`, `enum`, `default`, or `examples`. Reject `format` explicitly and do not install `ajv-formats`.
- [x] **RED 5 — exact local refs:** permit only `#`, `#/...`, `id`, `id#`, and `id#/...`. Reject empty refs, remote/file/custom/query/percent/anchor/absolute/backslash/dot aliases, catalog escape, missing document, and a pointer that does not name an exact schema position.
- [x] **RED 6 — graph cycles:** build containment and `$ref` edges between schema positions and find deterministic strongly connected components. If any SCC is cyclic (size > 1 or a self-edge), emit exactly one cycle diagnostic for the entire catalog. Select the globally first in-cycle ref edge by `(sourceDocumentId, sourcePointer, targetDocumentId, targetPointer)` using direct code-unit order; do not emit one diagnostic per SCC.
- [x] **RED 7 — whole catalog compilation:** add every transformed document in sorted id order and call `getSchema`/compile for every internal id, not just the root. An unused invalid/strictness-failing document must fail compilation.
- [x] **RED 8 — evidence/internal ids:** transform public ids to collision-free internal URNs using base64url and rewrite only schema-position refs. Prove internal ids never appear in results/diagnostics. Assert per-schema `canonicalJsonDigest` and catalog digest over `{dialect,rootId,schemas:[{id,schemaDigest}]}` sorted by id.
- [x] **RED 9 — nested false-schema mapping:** preserve original catalog/evidence unchanged. In the AJV-only transformed copy, replace each nested boolean `false` schema with a fresh outer object `{ not: {} }`; record that outer object's identity in the `parentSchema` `WeakMap` with the original false location. Map only its `not` error to `Value is rejected by a false schema.` Do not use schema-path-only false mapping, do not accept/test a false catalog root, and never decode arbitrary AJV URNs.
- [x] **RED 10 — validation mapping:** snapshot `validate.errors` immediately. Map instance paths to the caller pointer and map each AJV error to exactly one related schema location from the safe identity/source map. Never expose `ErrorObject.params`, AJV messages, schema values, instance values, or internal ids.
- [x] **RED 11 — location fallback:** when a schema/property name contains a control that cannot form an RFC 6901 pointer, trim only derived trailing tokens to the deepest valid source base. Apply the same fallback to caller instance paths.
- [x] **RED 12 — exact fixed messages:** freeze module-owned preflight strings for empty catalog, invalid entry, missing root, invalid/duplicate id, noncanonical document/value, unsupported dialect/keyword/format, id mismatch, non-local/escaping/missing ref target, cycle, AJV schema compile failure, false schema, and generic constraint failure. Freeze this exact AJV keyword mapping (all other keywords use `Value violates a schema constraint.`):

```text
JSON Schema catalog is empty.
JSON Schema catalog entry is invalid.
JSON Schema root is missing.
JSON Schema document id is invalid.
JSON Schema document id is duplicated.
JSON Schema document is not canonical JSON.
JSON value is not canonical JSON.
JSON Schema dialect is unsupported.
JSON Schema document id does not match its source id.
JSON Schema keyword is unsupported.
JSON Schema format is unsupported.
JSON Schema reference is not local.
JSON Schema reference escapes the catalog.
JSON Schema reference target is invalid.
JSON Schema reference cycle is not allowed.
JSON Schema is invalid.
Value is rejected by a false schema.
Value violates a schema constraint.
```

AJV keyword messages are exactly:

```text
type -> Value has the wrong JSON type.
enum, const -> Value is not an allowed value.
multipleOf, maximum, exclusiveMaximum, minimum, exclusiveMinimum -> Value violates a numeric constraint.
maxLength, minLength, pattern -> Value violates a string constraint.
maxItems, minItems, uniqueItems, contains, maxContains, minContains, items, prefixItems -> Value violates an array constraint.
maxProperties, minProperties, required, dependentRequired, dependentSchemas -> Value violates an object constraint.
additionalProperties, unevaluatedProperties, propertyNames, patternProperties -> Value contains a disallowed property.
allOf, anyOf, oneOf, if, then, else, not -> Value violates a composite schema constraint.
unevaluatedItems -> Value contains a disallowed array item.
```

Every AJV error becomes exactly one caller-code diagnostic and exactly one related schema location. Prove fail → pass → fail reuse has no stale errors.
- [x] **RED 13 — intrinsics and no I/O:** capture every intrinsic used on untrusted values at module initialization, including `util.types.isProxy`, `Array.isArray`, `Object.getPrototypeOf`, `Object.getOwnPropertyDescriptors`, `Object.keys`, `Object.prototype.hasOwnProperty`, `Reflect.ownKeys`, string code-unit operations, and `Buffer.from`. Monkey-patch globals after import and prove behavior is unchanged. Source policy rejects `fs`, `http`, `https`, `fetch`, or `loadSchema`; tests replace `global.fetch` and assert zero calls.
- [x] **RED 14 — AJV lifecycle:** calls rejected before the AJV phase construct zero AJV instances. A call that reaches the AJV phase constructs at most one AJV instance, registers every transformed document on it, and compiles every id on that same instance.
- [x] **RED 15 — opaque instance-pointer inspection:** query root, exact `properties`, terminal/nonterminal `$ref`, `prefixItems`, and `items` pointers through the branded handle; normalize `integer` and accepted nullable `type` arrays; return the frozen exact kind order and all six kinds for an untyped reachable target. Fail closed for missing members, boolean `false`, dynamic property names, validation siblings beside `$ref` including at root/target, listed applicators, and invalid array-index tokens. Reject lookalike handles, proxies, accessors, unknown fields, and malformed/noncanonical pointers without invoking traps. Keep cycle rejection in RED 6 because no cyclic catalog can produce a branded handle. Prove the query performs zero AJV validation/I/O and remains stable after built-in monkey-patching.
- [x] **GREEN:** clone every source schema with F1 before semantic traversal; use captured intrinsics and descriptor snapshots; transform refs/false schemas only in a detached AJV copy; register/compile sorted schemas; freeze evidence, wrapper, result, and the successfully validated detached value; store validators only in the private brand map.
- [x] **Verify:**

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2JsonSchema.test.js
npm run source:policy
```

For `strictRequired`, test an actual AJV 8.20 same-subschema missing declaration; do not promise a cross-`allOf` custom rule.

Recorded evidence: remote checkpoint `b857340a`; focused 121/121, compile and source policy green; full suite 1,402 pass / 1 skip / 0 fail; independent review C0/I0/M0.

**Commit:** `feat(workflow): add strict local schema catalog`

## F4 — Strict YAML input and closed package-schema primitives

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/yamlDocument.ts`
- Create: `extensions/workflow-register/src/core/contractV2/packageShape.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Yaml.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/yaml/valid-minimal.yaml`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/yaml/invalid-cases.json`

**Interface**

```ts
parseWorkflowContractV2Yaml(input: {
  readonly bytes: Buffer
  readonly path: string
}): ParseWorkflowContractV2YamlResult

validateWorkflowContractV2PackageShape(input: {
  readonly document: JsonValue
  readonly path: string
}): ValidateWorkflowContractV2PackageShapeResult // success value: WorkflowPackageDocumentV2
```

F4 is the single owner of `WorkflowPackageDocumentV2`. P1/compiler import this result and must not implement a second package semantic decoder. The exact closed shape is design section 6 and is frozen by these discriminants:

```text
top: schemaVersion,id,name,description,inputs,steps,requiredArtifacts,resumePolicy,providers,bob
predicate placements: inputs[].requiredWhen, steps[].when, steps[].transition.decisions[].when only
common step: id,title,type,required,when?,transition?
command additions: provider,input,output,artifacts
agent additions: prompt,context,output,artifacts
manual additions: prompt,form?,approval?,output
result additions: source,artifacts
output: kind(unit) | kind(value),id,schema,maxBytes(1..16777216)
manual form: fields; 1..128 unique discriminated string|number|boolean|select records
string field: id,title,description?,type,required,default?,multiline
number/boolean field: id,title,description?,type,required,default?
select field: id,title,description?,type,required,default?,options(1..256 unique strings)
manual result object: supplied field ids plus approval decision(approved|rejected)
reference source: input|committedOutput
value-template source: literal|input|committedOutput|array|object
transition goto: declared step id|$end|$fail
provider: id,version,inputSchema,output(unit|value-schema),errorSchema,sideEffect,idempotency,requiredCapabilities
provider sideEffect: none|workspace-write|external
provider idempotency: idempotent|key-required|non-idempotent
artifact: id,producedBy,path,mediaType,schema,maxBytes(1..67108864),owner(provider|runtime),required
resumePolicy: mode(restart-step|fail-closed),maxAttempts,retainCommittedOutputs,allowArtifactReuse
bob: profile(bob/2.0.1),requiredCapabilities,taskCapabilities
```

The decoder applies every exact leaf constraint in design section 6: identifier/text bounds, typed defaults, required booleans, form-output object/schema correspondence, unit/value provider compatibility, artifact NFC/path/media-type regexes and byte limits, safe-integer bounds, canonical capability ordering, and the side-effect/idempotency semantics. It does not accept abbreviated records and fill defaults.

It also owns the complete design-section-6 collection/resource table: inputs 0–256, steps 1–512, required artifacts 0–512, providers 0–256, step artifacts 0–128, agent context 0–256, transition decisions 0–128, form fields 1–128, select options 1–256, provider capabilities 0–128, exact Bob subset maxima, value-template collections 0–256, template depth 32/nodes 4,096 per step, and constructed document depth 64/nodes 65,536. Every dense-array and recursive-structure bound is checked before partial semantic output is returned.

- [ ] RED: reject BOM, non-UTF-8, CR/CRLF package bytes, multiple documents, aliases, anchors, merge keys, duplicate keys, explicit/custom tags, timestamp resolution, non-string keys, `-0`, and non-finite numbers.
- [ ] RED: require exact `schemaVersion: workflow-register/v2` and closed top-level fields `schemaVersion,id,name,description,inputs,steps,requiredArtifacts,resumePolicy,providers,bob`.
- [ ] RED: cover every design-section-6 field, exact required/optional boundary, typed default, discriminated form field, select-option rule, manual output object, unit/value output, numeric bound, path/media regex, enum, step discriminator, value-template variant, predicate placement, transition target/loop, provider/artifact/resume/Bob record, and cross-id uniqueness. Prove every unknown/no-op/step-inapplicable field maps to `WF2_UNKNOWN_OR_NOOP_FIELD` at the precise YAML-derived pointer.
- [ ] RED: cover every array lower/upper boundary, document/template depth/node boundary, sparse/exotic array, and one-over-limit case from the fixed table. Compile the implicit control-flow table exactly: first-step entry; `when=false` skip-to-next; success with no transition next/`$end`; success with ordered transition; required failure to `$fail`; optional failure to next; explicit `$end`/`$fail`. A skipped path performs zero provider calls and publishes nothing; a failed path publishes no output/artifact and evaluates no outgoing transition.
- [ ] RED: reject inline prompt/schema bodies and require canonical package-relative references. Reject duplicate ids, predicates outside the three allowed placements, syntactically invalid RFC 6901 pointers, and files declared in incompatible roles. Apply the visibility table: input predicates have no output, step-entry/templates/context/result allow strictly earlier lexical value outputs, and an outgoing transition alone may name its owning step's value output. Reject every other same/future reference. F5 resolves a syntactically valid pointer against the referenced compiled schema.
- [ ] GREEN: use `js-yaml` only behind a pre-scan/composer boundary that detects aliases/duplicate keys before construction; immediately pass its result through F1 cloning.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Yaml.test.js
```

**Commit:** `feat(workflow): add strict v2 package document shape`

## F5 — Shared structured predicate AST

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/predicate.ts`
- Create: `extensions/workflow-register/test/workflowContractV2Predicate.test.js`
- Create: `extensions/workflow-register/test/fixtures/workflow-contract-v2/predicate-golden.json`
- Modify: `extensions/workflow-register/src/core/contractV2/jsonSchema.ts`
- Modify: `extensions/workflow-register/test/workflowContractV2JsonSchema.test.js`

**Interface**

```ts
export type CompiledWorkflowPredicate =
  | {
      readonly kind:
        | "equals" | "notEquals"
        | "greaterThan" | "greaterThanOrEqual"
        | "lessThan" | "lessThanOrEqual"
      readonly left: CompiledWorkflowValueReference
      readonly right: JsonValue
    }
  | {
      readonly kind: "in"
      readonly left: CompiledWorkflowValueReference
      readonly right: readonly JsonValue[]
    }
  | { readonly kind: "exists"; readonly left: CompiledWorkflowValueReference }
  | { readonly kind: "all"; readonly predicates: readonly CompiledWorkflowPredicate[] }
  | { readonly kind: "any"; readonly predicates: readonly CompiledWorkflowPredicate[] }
  | { readonly kind: "not"; readonly predicate: CompiledWorkflowPredicate }

export type CompiledWorkflowValueReference =
  | { readonly source: "input"; readonly id: string; readonly pointer: string }
  | { readonly source: "committedOutput"; readonly id: string; readonly pointer: string }

export type WorkflowPredicatePlacement =
  | { readonly kind: "inputRequiredWhen"; readonly inputIndex: number }
  | { readonly kind: "stepEntry"; readonly stepIndex: number }
  | { readonly kind: "stepTransition"; readonly stepIndex: number }

export interface WorkflowPredicateInputSchemaBinding {
  readonly id: string
  readonly schemaId: string
  readonly schema: CompiledLocalJsonSchema
}

export type WorkflowPredicateStepSchemaBinding =
  | { readonly kind: "noValue" }
  | {
      readonly kind: "value"
      readonly id: string
      readonly schemaId: string
      readonly schema: CompiledLocalJsonSchema
    }

export interface WorkflowPredicateSchemaEnvironment {
  readonly inputs: readonly WorkflowPredicateInputSchemaBinding[]
  readonly steps: readonly WorkflowPredicateStepSchemaBinding[]
}

export interface CompileWorkflowPredicateInput {
  readonly predicate: unknown
  readonly placement: WorkflowPredicatePlacement
  readonly schemas: WorkflowPredicateSchemaEnvironment
  readonly location: WorkflowContractV2DiagnosticLocation
}

compileWorkflowPredicate(input: CompileWorkflowPredicateInput): CompileWorkflowPredicateResult
evaluateWorkflowPredicate(
  predicate: CompiledWorkflowPredicate,
  context: {
    readonly inputs: Readonly<Record<string, JsonValue>>
    readonly committedOutputs: Readonly<Record<string, JsonValue>>
  }
): boolean
```

F5 receives no raw schema catalog and no caller-derived allowlist. The single P1 compiler constructs `schemas` directly from the validated, detached F4 document plus F3 handles and is the only production caller; the one-to-one input/step/output correspondence is a trusted internal precondition that P1's compiler integration tests must prove. The environment, its arrays, and every binding are closed ordinary own-data values; arrays are dense with ordinary prototypes. `inputs` has 0–256 unique ids. `steps` has 1–512 entries and exactly the F4 step count; the index is the step index, so each step has at most one value output and output ids are unique across all `kind: "value"` entries. `inputRequiredWhen.inputIndex` must be within `inputs`; both step placements must be within `steps`. Each `schemaId` is the exact F4-selected package-relative schema id and must equal its F3-branded handle's `evidence.rootId`; an invalid, lookalike, or root-id-mismatched handle is rejected. F5 calls `inspectLocalJsonSchemaInstancePointer` for every reference and never reparses schema documents.

Compile precedence is exact: outer record and base location → closed/dense schema environment in input then step order, including root-pointer handle preflight → closed placement and actual-array index range → iterative predicate snapshot and global budgets → operator/field/visibility/pointer semantics. A handle-preflight `TypeError` becomes one `WF2_PREDICATE_INVALID` diagnostic at the supplied predicate base location. A malformed predicate pointer is diagnosed at its exact `left/pointer` before inspection. Equality, membership, and existence require a successful resolution. Ordered comparison additionally requires a finite numeric right operand with exactly the resolved kind `number`, or a string right operand with exactly the resolved kind `string`; mixed or indeterminate kinds fail closed.

- [x] RED: cover every equality/`in`/ordered/exists/boolean AST variant, reject empty `all`/`any`, missing input/output/pointer, deep JSON equality/membership, numeric and code-unit string ordering, and deterministic short-circuit order. Freeze exact limits: depth 32, 1,024 total AST nodes, 1–128 direct `all`/`any` children, 1–256 dense `in` members, and 262,144 canonical UTF-8 bytes across literal `right` values. Test each boundary and one over; ordered comparison is valid only number/number or string/string and never coerces.
- [x] RED: compile with an explicit `WorkflowPredicatePlacement` and the closed compiler-owned environment. Cover exact ordinary outer/environment/placement/binding records, dense array and 0–256/1–512 limits, actual-array placement ranges, one step entry per F4 step, at most one value output per step, unique input/output ids, invalid/lookalike/root-id-mismatched handles, and the fixed precedence. `inputRequiredWhen` allows input refs only; `stepEntry` allows strictly earlier lexical value outputs; `stepTransition` additionally allows exactly its owning step's value output. Resolve every RFC 6901 pointer exclusively through F3's branded read-only query. Reject raw schemas, caller allowlists, no-value, other same-step, future, undeclared output/pointer, unresolved/mixed-kind ordered targets, transient/uncommitted provider result, run/step state, artifact content, environment/time/filesystem, expression string, unknown operator/field, malformed value, and sparse/proxy/accessor context. P1 later proves that its environment builder preserves each F4 input/output id, schema id, and lexical step position exactly.
- [x] RED: import the same module from compiler preflight and engine in a test harness and assert identical golden results/diagnostics. The golden file includes entry, prior-output, permitted post-commit same-output, forbidden same-output placement, future/transient/uncommitted, and all 15 C1 human-gate `/decision` cases (inventory 01 and 05–18).
- [x] GREEN: compile to a detached frozen AST and evaluate only the supplied `{ inputs, committedOutputs }` context without coercion, `eval`, locale comparison, clocks, environment, provider lookup, or I/O.
- [x] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2Predicate.test.js
```

**Commit:** `feat(workflow): add shared v2 predicate contract`

## F6 — Exact provider contract registry

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/providerRegistry.ts`
- Create: `extensions/workflow-register/src/core/contractV2/providerContract.ts`
- Create: `extensions/workflow-register/test/workflowContractV2ProviderRegistry.test.js`
- Modify: `extensions/workflow-register/src/core/actionRegistry.ts`
- Modify: `extensions/workflow-register/src/core/actionTypes.ts`

**Interface**

```ts
export interface WorkflowProviderRegistrationInput {
  readonly sourceId: string
  readonly contract: WorkflowProviderContractInput
}

export interface WorkflowProviderRegistration {
  dispose(): void
}

export interface WorkflowProviderSchemaEvidence {
  readonly id: string
  readonly bytes: number
  readonly digest: Sha256Digest
}

export type WorkflowProviderOutputEvidence =
  | { readonly kind: "unit" }
  | { readonly kind: "value"; readonly schema: WorkflowProviderSchemaEvidence }

export interface WorkflowProviderArtifactWriter {
  writeArtifact(input: {
    readonly id: string
    readonly bytes: Uint8Array
  }): Promise<void>
}

export type WorkflowProviderIdempotencyInput =
  | { readonly mode: "idempotent" }
  | { readonly mode: "key-required"; readonly key: string }
  | { readonly mode: "non-idempotent" }

export type WorkflowProviderEffectInput =
  | { readonly kind: "none" }
  | {
      readonly kind: "workspace-write"
      readonly artifacts: WorkflowProviderArtifactWriter
    }
  | { readonly kind: "external" }

export interface WorkflowProviderDispatchInput {
  readonly value: JsonValue
  readonly signal: AbortSignal
  readonly idempotency: WorkflowProviderIdempotencyInput
  readonly effect: WorkflowProviderEffectInput
}

export type WorkflowProviderDispatch = (
  input: WorkflowProviderDispatchInput
) => Promise<unknown> | unknown

export interface WorkflowProviderContractInput {
  readonly id: string
  readonly version: string
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
  readonly dispatch: WorkflowProviderDispatch
}

export interface WorkflowProviderContractEvidence {
  readonly id: string
  readonly version: string
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
  readonly contractDigest: Sha256Digest
}

export interface WorkflowProviderCatalogEvidence {
  readonly schemaVersion: "workflow-provider-catalog/v2"
  readonly providers: readonly WorkflowProviderContractEvidence[]
}

declare const workflowProviderCatalogBrand: unique symbol
export interface WorkflowProviderCatalog {
  readonly [workflowProviderCatalogBrand]: true
  readonly evidence: WorkflowProviderCatalogEvidence
  // The exact-version dispatch map is intentionally not a public field.
}

export interface WorkflowProviderContractRequirement {
  readonly id: string
  readonly version: string
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
}

export interface WorkflowProviderLockEvidence {
  readonly id: string
  readonly requestedVersion: string
  readonly exactVersion: string
  readonly contractDigest: Sha256Digest
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
}

declare const boundWorkflowProviderDispatchBrand: unique symbol
export interface BoundWorkflowProviderDispatchHandle {
  readonly [boundWorkflowProviderDispatchBrand]: true
  // No public callable or dispatch field.
}

export class ActionRegistry {
  // Existing register/list/execute legacy ActionProvider methods remain unchanged.
  registerWorkflowProviderContract(
    input: WorkflowProviderRegistrationInput
  ): WorkflowProviderRegistration
  snapshotWorkflowProviderCatalog(): WorkflowProviderCatalog
}

export interface BindWorkflowProviderInput {
  readonly catalog: WorkflowProviderCatalog
  readonly requirement: WorkflowProviderContractRequirement
  readonly location: WorkflowContractV2DiagnosticLocation
}

export type BindWorkflowProviderResult =
  | {
      readonly ok: true
      readonly lockEvidence: WorkflowProviderLockEvidence
      readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

export function bindWorkflowProvider(
  input: BindWorkflowProviderInput
): BindWorkflowProviderResult
```

`ActionRegistry` constructs and exclusively owns one `WorkflowProviderRegistry`; it is not global and is not shared by `createDefaultActionRegistry` instances. The two delegating methods above are the public lifecycle boundary. `sourceId` is detached registration metadata retained for owner-aware duplicate errors. It is not a provider contract field, is absent from catalog/lock evidence and the contract digest, and cannot affect selection. The existing `ActionProvider`, `ActionProviderRegistration`, `ActionRegistry.register/list/execute`, default legacy registrations, and their id-only duplicate/disposal behavior remain unchanged in F6. There is no adapter, mirroring, or lookup fallback between legacy and v2 maps.

Registration input and every nested wrapper must be an exact ordinary own-data record; arrays must be dense ordinary arrays with no extra or symbol keys. Mutable ordinary inputs are accepted, validated from descriptor snapshots, detached, and frozen before storage. Proxies, accessors, exotic prototypes, sparse arrays, and a callable Proxy in `dispatch` are rejected without invoking their behavior; callable-Proxy detection uses the captured native `util.types.isProxy`. F6 requires only that a non-proxy `dispatch` is callable, stores its identity, and never freezes, introspects, or invokes it.

`providerContract.ts` owns the callable ABI above. R2 supplies a validated F1-frozen `JsonValue`, the attempt `AbortSignal`, and deeply frozen idempotency/effect discriminants that exactly match the bound contract. Only `workspace-write` receives a writer. `none` receives no effect capability; `external` is itself the registered external adapter and receives no staging writer. `WorkflowProviderArtifactWriter` is a frozen write-only capability with only `writeArtifact`; that method snapshots the supplied `Uint8Array` immediately on entry and exposes no path, read, promote, commit, transaction, or final-workspace API. A dispatch throw or rejection is an unknown value consumed later by R2's error-envelope validator. F6 validates only non-proxy callability and never creates, validates, freezes, or inspects a dispatch input.

The exact leaf rules are:

- `sourceId`, provider `id`, and every capability are already-trimmed 1–128 character ASCII ids matching F4's `^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$` grammar;
- schema evidence is exactly `{ id, bytes, digest }`; `id` is an NFC canonical one-level `schemas/*.json` path matching `^schemas/[A-Za-z0-9._-]+\.json$` and at most 240 UTF-8 bytes, `bytes` is a safe integer from 1 through 4,194,304, and `digest` is exactly `sha256:<64 lowercase hex>`;
- `requiredCapabilities` is a dense 0–128 element array, code-unit sorted and duplicate-free;
- a requirement range is a 1–256 code-unit control-free string accepted by the same strict `semver.validRange(value, { loose: false }) !== null` rule as F4; and
- output, side-effect, and idempotency unions are exactly the interface literals above. F6 validates schema evidence syntax/bounds only. P4 resolves actual schema content and the fixed dialect, computes the exact evidence from those bytes, and supplies that already-resolved evidence in the requirement.

An exact registration version uses `semver.parse(version, { loose: false })`. It is accepted only when parsing succeeds and reconstructing `${parsed.version}${parsed.build.length ? "+" + parsed.build.join(".") : ""}` equals the original input, so canonical build metadata is retained while aliases such as `v1.2.3` are rejected. Range satisfaction and ordering use pinned `semver@7.7.2` with `loose: false` and default `includePrerelease: false`; a prerelease is eligible only when the range contains a prerelease comparator for the same major/minor/patch tuple. Highest selection uses `semver.compare`, which ignores build metadata. Distinct highest exact versions that differ only in build metadata therefore tie and fail binding as ambiguous.

Strict registration is synchronous and atomic. Any invalid registration wrapper, source metadata, contract leaf, schema evidence, capability array, or dispatch throws `TypeError` before mutation. A duplicate live `(id, exactVersion)` throws an owner-aware `Error` identifying both retained and requesting `sourceId` values; it does not replace the retained entry. Success returns the idempotent token-protected disposable. It removes only its exact live registration, and a stale disposable cannot remove a later re-registration.

The contract digest preimage is exactly the detached deeply frozen canonical object `{ id, version, inputSchema, output, errorSchema, sideEffect, idempotency, requiredCapabilities }`—no `schemaVersion`, `sourceId`, `dispatch`, or `contractDigest`. F6 computes `contractDigest = canonicalJsonDigest(preimage)`, then creates and deeply freezes the public contract-evidence entry `{ ...preimage, contractDigest }`. Catalog evidence has exactly `{ schemaVersion: "workflow-provider-catalog/v2", providers }`; `providers` is a new detached deeply frozen array sorted by `(id, version)` using direct code-unit order. The branded catalog's private `WeakMap` state is a new immutable `(id, exactVersion)`-to-dispatch map and never consults the live registry.

`bindWorkflowProvider` first validates the exact ordinary outer `{ catalog, requirement, location }` record, then diagnostic location, then catalog private brand. Invalid outer/location/catalog inputs are programmer errors and throw `TypeError` without reading hostile fields. Once location and brand are valid, requirement validation and comparison use this exact recursive order:

1. For every exact record, validate required fields in declaration order, recursively completing each field before continuing; then inspect unknown own string keys in direct code-unit order. Append unknown keys with RFC 6901 escaping. A proxy, accessor, symbol key, exotic prototype, wrong container, sparse/extra-property array, or ambiguous descriptor fails at that container pointer.
2. Requirement fields are `id`, `version`, `inputSchema`, `output`, `errorSchema`, `sideEffect`, `idempotency`, `requiredCapabilities`. A schema evidence record is `id` then `bytes` then `digest`. Output is `kind`, then for `value` its schema `id`, `bytes`, `digest`; for `unit`, a `schema` member is an unknown key and points to `/output/schema`.
3. Capability elements validate in ascending index order. The first invalid id, duplicate, or out-of-order member points to that index.
4. After range syntax, exact-id/range candidates, and highest-precedence ambiguity, compare the selected contract in order `inputSchema`, `output`, `errorSchema`, `sideEffect`, `idempotency`, `requiredCapabilities`, recursively using the same leaf order. Arrays point to their first differing index; a prefix-length mismatch points to the first missing/excess index.

Each requirement/binding failure returns exactly one frozen `WF2_PROVIDER_CONTRACT_MISMATCH`. Malformed/no-candidate/ambiguous version failures use `/version`; other structural/leaf failures and selected-contract mismatches use the first pointer determined above. Binding always selects highest by id/range before comparison and never downgrades to a lower matching contract.

Success returns a deeply frozen `{ ok: true, lockEvidence, dispatchHandle, diagnostics: [] }`; the empty tuple, section-15-shaped lock evidence, and opaque frozen handle are all detached/frozen. Failure returns deeply frozen `{ ok: false, diagnostics }` with the F2-frozen diagnostic array. The handle has no public callable/dispatch field. F6 stores its captured dispatch identity only in a module-private `WeakMap`; P4 stores only the handle in private compiled-plan state. Later disposal/re-registration cannot change existing catalog evidence, bind evidence, handle identity, or the handle's captured private dispatch identity.

The normative reserved-capability rules are: `none` forbids both `workflow.effect.workspace-write` and `workflow.effect.external`; `workspace-write` requires the workspace capability and forbids the external capability; `external` requires the external capability and forbids the workspace capability. F6 validates this declaration only. P4 owns actual schema/dialect resolution and private validator/plan construction. R2 owns the internal invocation bridge, input/output/error validation, dispatch, unit-return enforcement, retry/idempotency, artifact promotion, and success/output/commit acceptance. F6 does none of those runtime actions.

- [x] RED: accept mutable ordinary records/arrays, mutate them after registration, and prove detached frozen evidence. Reject missing/unknown fields, proxies/accessors/exotic records, sparse/extra-property arrays, callable Proxy dispatch, non-callable dispatch, and every exact leaf boundary above without behavior invocation. Assert every invalid registration throws `TypeError` atomically; assert duplicate `(id, exactVersion)` throws owner-aware `Error` with both source ids and no replacement/evidence pollution.
- [x] RED: type-check the exact dispatch ABI. F6 tests assert only callable/non-proxy storage, the write-only writer type surface, and zero dispatch/ABI-input construction. R2 tests own runtime writer freezing and `Uint8Array` snapshotting, effect/idempotency variant construction, the absence of path/read/promote/commit behavior, and thrown/rejected values.
- [x] RED: retain multiple exact versions including canonical build metadata; independently dispose/re-register them; prove idempotent stale-token safety, per-`ActionRegistry` isolation, and unchanged legacy `ActionProvider` behavior with no mirroring/fallback.
- [x] RED: recompute the exact eight-field contract digest preimage independently; reject any accidental `sourceId`, dispatch, wrapper version, or digest self-inclusion. Assert the exact flattened catalog-evidence shape/order, recursive freezing, private brand, and stability after caller/live-registry mutation.
- [x] RED: bind with exact diagnostic locations and precedence. Cover every nested required/unknown/container/schema/output/capability order, escaped unknown keys, unit-with-schema, first invalid/duplicate/out-of-order capability index, array first-difference/prefix-length pointers, malformed/overlong/control ranges, missing candidates, build-only highest ties, and highest-version mismatch without lower fallback. Assert exact frozen lock evidence/empty success diagnostics and frozen failure diagnostics under pinned `semver@7.7.2`.
- [x] RED: prove source-regex discovery is unused, a catalog lookalike fails the private brand, the opaque handle exposes no dispatch/callable field, and live dispose/register/re-register cannot change existing snapshot/bind/handle identity. Do not call dispatch or test forged-handle invocation until R2 adds the internal consumer.
- [x] GREEN: add one registry field per `ActionRegistry` and only the two delegating public methods; use captured descriptor/proxy intrinsics, F1 cloning/digesting, private `WeakMap` state, and exact frozen result objects. Verify the existing F4 pins are exactly `semver@7.7.2` and `@types/semver@7.7.1`; do not modify dependency manifests or runtime invocation/validation code.
- [x] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2ProviderRegistry.test.js test/actionRegistry.test.js
npm run dependency:policy
```

**Commit:** `feat(workflow): add versioned provider contract registry`

## F7 — Audited Bob 2.0.1 profile and two-stage capability binding

**Files**

- Create: `extensions/workflow-register/src/core/contractV2/bobProfile.ts`
- Create: `extensions/workflow-register/test/workflowContractV2BobProfile.test.js`
- Modify: `extensions/workflow-register/src/bobApi.ts`
- Modify: `extensions/workflow-register/src/bobWorkflowFactory.ts`

**Interface**

```ts
snapshotBobContractProfile(liveExport: unknown): BobContractProfileResult
bindBobCapabilities(input: BindBobCapabilitiesInput): BindBobCapabilitiesResult
probeBobTaskCapabilities(input: ProbeBobTaskCapabilitiesInput): ProbeBobTaskCapabilitiesResult
```

The exact golden profile is canonicalized as this data (array order is part of the evidence):

```json
{
  "schemaVersion": "workflow-bob-profile/v1",
  "extension": { "id": "IBM.bob-code", "version": "2.0.1" },
  "activationDescriptors": [
    { "name": "registerSource", "valueKind": "function", "callShape": "(id: string, name?: string) => source" }
  ],
  "sourceDescriptors": [
    { "name": "deactivate", "valueKind": "function" },
    { "name": "log", "valueKind": "function" },
    { "name": "registerWorkflow", "valueKind": "function" }
  ],
  "capabilityNames": [
    "source.deactivate", "source.log", "source.registerWorkflow",
    "task.getAllMetadata", "task.getMessages", "task.sendMessage",
    "task.setStepComplete", "task.startSubagent", "task.toSerializable"
  ],
  "taskCapabilityDescriptors": [
    { "capability": "task.getAllMetadata", "name": "getAllMetadata", "valueKind": "function" },
    { "capability": "task.getMessages", "name": "getMessages", "valueKind": "function" },
    { "capability": "task.sendMessage", "name": "sendMessage", "valueKind": "function" },
    { "capability": "task.setStepComplete", "name": "setStepComplete", "valueKind": "function" },
    { "capability": "task.startSubagent", "name": "startSubagent", "valueKind": "function" },
    { "capability": "task.toSerializable", "name": "toSerializable", "valueKind": "function" }
  ]
}
```

Its exact F1 digest is `sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73`.

- [ ] RED: pin the exact golden extension id/version, activation/source/task descriptors, capability order, task profile, and digest above. Recompute the digest in the test rather than trusting a copied string.
- [ ] RED: reject missing/wrong extension, incompatible version, proxy/accessor exports, missing/extra incompatible functions, duplicate/unknown capabilities, and lock/profile drift.
- [ ] RED: model task-handle-only capabilities separately; prove the compile-time snapshot never claims them and the runtime probe executes before provider/step dispatch.
- [ ] GREEN: return detached frozen evidence at compile time and a pure task-probe result at runtime. Do not put the live export or task handle into canonical plan data.
- [ ] Verify:

```bash
cd extensions/workflow-register
npm run compile
node --test test/workflowContractV2BobProfile.test.js test/bobWorkflowFactory.test.js test/bobGateLifecycle.test.js
```

**Commit:** `feat(workflow): bind audited bob capability profile`

## Foundation phase gate

Run the master Gate F command, then the full extension suite:

```bash
cd extensions/workflow-register
npm test
git diff --check
```

Record focused counts, full pass/skip/fail counts, reviewer decisions, and the seven task commit hashes before starting P1.
