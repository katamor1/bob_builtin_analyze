const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { test } = require("node:test")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"
const CODE = "WF2_PROVIDER_INPUT_INVALID"
const BASE_LOCATION = Object.freeze({ path: "workflow.yaml", pointer: "/providers/example" })

function schemaModule() {
  return require("../out/core/contractV2/jsonSchema.js")
}

function canonicalModule() {
  return require("../out/core/contractV2/canonicalJson.js")
}

function source(id, body = {}, location = { path: id, pointer: "" }) {
  return {
    id,
    schema: {
      $schema: DIALECT,
      $id: id,
      ...body
    },
    location
  }
}

function compile(schemas, rootId = schemas[0]?.id, overrides = {}) {
  return schemaModule().compileLocalJsonSchema({
    rootId,
    schemas,
    diagnosticCode: CODE,
    location: BASE_LOCATION,
    ...overrides
  })
}

function validate(compiled, value, overrides = {}) {
  return schemaModule().validateLocalJsonSchemaValue({
    compiled,
    value,
    diagnosticCode: CODE,
    location: { path: "payload.json", pointer: "" },
    ...overrides
  })
}

function oneDiagnostic(result, message, location) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, CODE)
  assert.equal(result.diagnostics[0].severity, "error")
  assert.equal(result.diagnostics[0].message, message)
  if (location !== undefined) assert.deepEqual(result.diagnostics[0].location, location)
  return result.diagnostics[0]
}

function pointerLocation(path, pointer) {
  return { path, pointer }
}

test("exports the exact JSON Schema dialect and compiles immutable canonical evidence", () => {
  const {
    WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
    compileLocalJsonSchema
  } = schemaModule()
  const catalog = [source("schemas/input.json", {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false
  })]

  const result = compileLocalJsonSchema({
    rootId: "schemas/input.json",
    schemas: catalog,
    diagnosticCode: CODE,
    location: BASE_LOCATION
  })

  assert.equal(WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT, DIALECT)
  assert.equal(result.ok, true)
  const { canonicalJsonDigest } = canonicalModule()
  const schemaDigest = canonicalJsonDigest(catalog[0].schema)
  assert.deepEqual(result.compiled.evidence, {
    dialect: DIALECT,
    rootId: "schemas/input.json",
    schemas: [{ id: "schemas/input.json", schemaDigest }],
    catalogDigest: canonicalJsonDigest({
      dialect: DIALECT,
      rootId: "schemas/input.json",
      schemas: [{ id: "schemas/input.json", schemaDigest }]
    })
  })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
  assert.equal(Object.isFrozen(result.compiled), true)
  assert.equal(Object.isFrozen(result.compiled.evidence), true)
  assert.equal(Object.isFrozen(result.compiled.evidence.schemas), true)
  assert.equal(Object.isFrozen(result.compiled.evidence.schemas[0]), true)
})

test("sorts multi-document evidence and validates exact local references", () => {
  const schemas = [
    source("schemas/root.json", {
      type: "object",
      properties: {
        item: { $ref: "schemas/shared.json#/$defs/item" }
      },
      required: ["item"]
    }),
    source("schemas/shared.json", {
      $defs: {
        item: { type: "integer", minimum: 1 }
      }
    })
  ]
  const result = compile(schemas, "schemas/root.json")

  assert.equal(result.ok, true)
  assert.deepEqual(result.compiled.evidence.schemas.map((entry) => entry.id), [
    "schemas/root.json",
    "schemas/shared.json"
  ])
  assert.equal(validate(result.compiled, { item: 2 }).ok, true)
  oneDiagnostic(
    validate(result.compiled, { item: 0 }),
    "JSON Schema value violates the minimum constraint."
  )
})

test("resolves a raw hash inside a cross-document JSON Pointer token", () => {
  const result = compile([
    source("schemas/root.json", {
      type: "object",
      properties: { value: { $ref: "schemas/shared.json#/$defs/a#b" } }
    }),
    source("schemas/shared.json", {
      $defs: { "a#b": { type: "string" } }
    })
  ], "schemas/root.json")

  assert.equal(result.ok, true)
  assert.equal(validate(result.compiled, { value: "ok" }).ok, true)
})

test("returns a detached recursively frozen canonical value on success", () => {
  const compiled = compile([source("schemas/value.json", {
    type: "object",
    properties: { values: { type: "array", items: { type: "number" } } }
  })]).compiled
  const input = { values: [1, 2] }

  const result = validate(compiled, input)

  assert.equal(result.ok, true)
  assert.notEqual(result.value, input)
  assert.notEqual(result.value.values, input.values)
  assert.equal(Object.getPrototypeOf(result.value), null)
  assert.equal(Object.isFrozen(result.value), true)
  assert.equal(Object.isFrozen(result.value.values), true)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
  input.values[0] = 99
  assert.deepEqual([...result.value.values], [1, 2])
})

test("rejects an empty catalog and a missing root with fixed base diagnostics", () => {
  oneDiagnostic(
    compile([], "schemas/root.json"),
    "JSON Schema catalog is empty.",
    BASE_LOCATION
  )
  oneDiagnostic(
    compile([source("schemas/other.json")], "schemas/root.json"),
    "JSON Schema catalog root is missing.",
    BASE_LOCATION
  )
})

test("rejects duplicate and noncanonical catalog IDs at source locations", async (t) => {
  const invalidIds = [
    "", "/absolute.json", "C:/drive.json", "schemas\\input.json",
    "./schemas/input.json", "schemas/../input.json", "schemas//input.json",
    "schemas/input.json/", "schemas/input.json?x", "schemas/input.json#x",
    "schemas/input%2ejson", "custom:input.json", "schemas/\ud800.json"
  ]
  for (const id of invalidIds) {
    await t.test(JSON.stringify(id), () => {
      const location = { path: "schemas/source.json", pointer: "/catalog/0" }
      oneDiagnostic(
        compile([{ id, schema: { $schema: DIALECT, $id: id }, location }], "schemas/root.json"),
        "JSON Schema document ID is invalid.",
        location
      )
    })
  }

  const first = source("schemas/same.json", {}, { path: "first.json", pointer: "" })
  const second = source("schemas/same.json", {}, { path: "second.json", pointer: "/entry" })
  oneDiagnostic(
    compile([first, second], "schemas/same.json"),
    "JSON Schema document ID is duplicated.",
    second.location
  )
})

test("rejects noncanonical documents, boolean roots, dialect mismatches, and ID mismatches", async (t) => {
  const cases = [
    [
      { id: "schemas/a.json", schema: { $schema: DIALECT, $id: "schemas/a.json", bad: undefined }, location: { path: "schemas/a.json", pointer: "" } },
      "JSON Schema document is not canonical JSON."
    ],
    [{ id: "schemas/a.json", schema: false, location: { path: "schemas/a.json", pointer: "" } }, "JSON Schema document is invalid."],
    [source("schemas/a.json", { $schema: "https://example.invalid/dialect" }), "JSON Schema document dialect is unsupported."],
    [source("schemas/a.json", { $id: "schemas/b.json" }), "JSON Schema document $id does not match its catalog ID."],
    [{ id: "schemas/a.json", schema: { $id: "schemas/a.json" }, location: { path: "schemas/a.json", pointer: "" } }, "JSON Schema document dialect is unsupported."],
    [{ id: "schemas/a.json", schema: { $schema: DIALECT }, location: { path: "schemas/a.json", pointer: "" } }, "JSON Schema document $id does not match its catalog ID."]
  ]
  for (const [entry, message] of cases) {
    await t.test(message, () => oneDiagnostic(compile([entry], "schemas/a.json"), message, entry.location))
  }
})

test("forbids nested dialects and IDs at their derived locations", () => {
  const nestedDialect = source("schemas/root.json", {
    properties: { value: { $schema: DIALECT, type: "string" } }
  })
  oneDiagnostic(
    compile([nestedDialect]),
    "JSON Schema document dialect is unsupported.",
    pointerLocation("schemas/root.json", "/properties/value/$schema")
  )

  const nestedId = source("schemas/root.json", {
    allOf: [{ $id: "schemas/nested.json", type: "string" }]
  })
  oneDiagnostic(
    compile([nestedId]),
    "JSON Schema document $id does not match its catalog ID.",
    pointerLocation("schemas/root.json", "/allOf/0/$id")
  )
})

test("walks every supported schema container class", () => {
  const result = compile([
    source("schemas/root.json", {
      type: "object",
      $defs: { a: { type: "string" } },
      properties: { a: { type: "string" } },
      patternProperties: { "^b": { type: "number" } },
      dependentSchemas: {
        a: { type: "object", properties: { b: {} }, required: ["b"] }
      },
      additionalProperties: { type: "boolean" },
      propertyNames: { type: "string", pattern: "^[a-z]+$" },
      if: { type: "object", properties: { a: {} }, required: ["a"] },
      then: { type: "object", maxProperties: 4 },
      else: { type: "object", minProperties: 0 },
      not: {},
      allOf: [{ type: "object" }],
      anyOf: [{ type: "object", minProperties: 0 }],
      oneOf: [{ type: "object", maxProperties: 1 }, { type: "object", minProperties: 2 }],
      unevaluatedProperties: true
    }),
    source("schemas/array.json", {
      type: "array",
      $defs: {
        tuple: {
          type: "array",
          prefixItems: [{ type: "string" }],
          minItems: 1,
          maxItems: 1,
          items: false
        },
        list: { type: "array", items: { type: "number" } }
      },
      contains: { const: 1 },
      minContains: 0,
      maxContains: 3,
      if: { type: "array", minItems: 1 },
      then: { type: "array", maxItems: 4 },
      else: { type: "array", minItems: 0 },
      not: {},
      allOf: [{ type: "array" }],
      anyOf: [{ type: "array", minItems: 0 }],
      oneOf: [{ type: "array", maxItems: 1 }, { type: "array", minItems: 2 }],
      unevaluatedItems: true
    })
  ], "schemas/root.json")

  assert.equal(result.ok, true)
})

test("rejects unknown keywords and format before AJV", () => {
  oneDiagnostic(
    compile([source("schemas/root.json", { properties: { value: { mystery: true } } })]),
    "JSON Schema keyword is unsupported.",
    pointerLocation("schemas/root.json", "/properties/value/mystery")
  )
  oneDiagnostic(
    compile([source("schemas/root.json", { properties: { value: { format: "email" } } })]),
    "JSON Schema format is unsupported.",
    pointerLocation("schemas/root.json", "/properties/value/format")
  )
})

test("does not traverse schema-looking data under const, enum, default, or examples", () => {
  const result = compile([source("schemas/root.json", {
    const: { format: "not-a-format", unknown: { $id: "data" } },
    enum: [{ format: "not-a-format" }],
    default: { unknown: true },
    examples: [{ $schema: "data", $ref: "https://data.invalid" }]
  })])

  assert.equal(result.ok, true)
})

test("preserves false JSON data under enum, default, and examples", () => {
  const result = compile([source("schemas/root.json", {
    enum: [false, { flag: false }],
    default: false,
    examples: [false, { nested: false }]
  })])

  assert.equal(result.ok, true)
  assert.equal(validate(result.compiled, false).ok, true)
  assert.equal(validate(result.compiled, { flag: false }).ok, true)
})

test("compares canonical enum, const, and uniqueItems objects without prototype assumptions", () => {
  const enumResult = compile([source("schemas/enum.json", {
    enum: [{ valueOf: "data", toString: "data", constructor: "data" }]
  })])
  assert.equal(enumResult.ok, true)
  assert.equal(validate(enumResult.compiled, {
    constructor: "data",
    toString: "data",
    valueOf: "data"
  }).ok, true)

  const constResult = compile([source("schemas/const.json", {
    const: { nested: { enabled: false } }
  })])
  assert.equal(constResult.ok, true)
  assert.equal(validate(constResult.compiled, { nested: { enabled: false } }).ok, true)

  const uniqueResult = compile([source("schemas/unique.json", {
    type: "array",
    items: {},
    uniqueItems: true
  })])
  assert.equal(uniqueResult.ok, true)
  oneDiagnostic(
    validate(uniqueResult.compiled, [{ valueOf: "same" }, { valueOf: "same" }]),
    "JSON Schema value violates the uniqueItems constraint."
  )
  assert.equal(validate(uniqueResult.compiled, [{ valueOf: "one" }, { valueOf: "two" }]).ok, true)
})

test("escapes schema pointer tokens and trims control-name locations safely", () => {
  oneDiagnostic(
    compile([source("schemas/root.json", {
      properties: { "a/b~c": { mystery: true } }
    })]),
    "JSON Schema keyword is unsupported.",
    { path: "schemas/root.json", pointer: "/properties/a~1b~0c/mystery" }
  )
  oneDiagnostic(
    compile([source("schemas/root.json", {
      properties: { "bad\u0000name": { mystery: true } }
    })]),
    "JSON Schema keyword is unsupported.",
    { path: "schemas/root.json", pointer: "/properties" }
  )
})

test("accepts only exact noncyclic local reference forms", async (t) => {
  const accepted = ["#/$defs/value", "schemas/shared.json", "schemas/shared.json#", "schemas/shared.json#/$defs/value"]
  for (const ref of accepted) {
    await t.test(`accepts ${ref}`, () => {
      const rootBody = ref.includes("$defs") && ref.startsWith("#")
        ? { type: "object", $defs: { value: { type: "string" } }, properties: { value: { $ref: ref } } }
        : { type: "object", properties: { value: { $ref: ref } } }
      const entries = [source("schemas/root.json", rootBody)]
      if (ref.startsWith("schemas/shared.json")) {
        entries.push(source("schemas/shared.json", { $defs: { value: { type: "string" } }, type: "string" }))
      }
      assert.equal(compile(entries, "schemas/root.json").ok, true)
    })
  }
})

test("rejects nonlocal reference classes with one fixed message", async (t) => {
  const refs = [
    "", "https://example.com/schema", "http://example.com/schema", "file:///tmp/schema",
    "custom:schema", "/schemas/a.json", "schemas\\a.json", "schemas/a.json?x",
    "schemas/a.json%23x", "#named", "schemas/a.json#named", "./schemas/a.json",
    "schemas/../a.json"
  ]
  for (const ref of refs) {
    await t.test(JSON.stringify(ref), () => {
      oneDiagnostic(
        compile([source("schemas/root.json", { $ref: ref })]),
        "JSON Schema reference is not local.",
        pointerLocation("schemas/root.json", "/$ref")
      )
    })
  }
})

test("distinguishes catalog escape from invalid reference target", () => {
  oneDiagnostic(
    compile([source("schemas/root.json", { $ref: "schemas/missing.json" })]),
    "JSON Schema reference escapes the catalog.",
    pointerLocation("schemas/root.json", "/$ref")
  )
  oneDiagnostic(
    compile([source("schemas/root.json", { $ref: "#/$defs/missing" })]),
    "JSON Schema reference target is invalid.",
    pointerLocation("schemas/root.json", "/$ref")
  )
  oneDiagnostic(
    compile([source("schemas/root.json", { const: { secret: true }, $ref: "#/const" })]),
    "JSON Schema reference target is invalid.",
    pointerLocation("schemas/root.json", "/$ref")
  )
  oneDiagnostic(
    compile([source("schemas/root.json", { $defs: { "a/b": { type: "string" } }, $ref: "#/$defs/a~2b" })]),
    "JSON Schema reference target is invalid.",
    pointerLocation("schemas/root.json", "/$ref")
  )
})

test("rejects self-reference cycles before AJV", () => {
  oneDiagnostic(
    compile([source("schemas/root.json", { $ref: "#" })]),
    "JSON Schema reference cycle is unsupported.",
    pointerLocation("schemas/root.json", "/$ref")
  )
})

test("emits one globally deterministic cycle diagnostic across disjoint SCCs", () => {
  const result = compile([
    source("schemas/z.json", { $defs: { child: { $ref: "#" } } }),
    source("schemas/a.json", { $defs: { z: { $ref: "#" }, a: { $ref: "#" } } })
  ], "schemas/a.json")

  oneDiagnostic(
    result,
    "JSON Schema reference cycle is unsupported.",
    pointerLocation("schemas/a.json", "/$defs/a/$ref")
  )
})

test("detects pointer-to-pointer and cross-document reference cycles", () => {
  oneDiagnostic(
    compile([source("schemas/root.json", {
      $defs: {
        a: { $ref: "#/$defs/b" },
        b: { $ref: "#/$defs/a" }
      }
    })]),
    "JSON Schema reference cycle is unsupported.",
    pointerLocation("schemas/root.json", "/$defs/a/$ref")
  )

  oneDiagnostic(
    compile([
      source("schemas/b.json", { $ref: "schemas/a.json" }),
      source("schemas/a.json", { $ref: "schemas/b.json" })
    ], "schemas/a.json"),
    "JSON Schema reference cycle is unsupported.",
    pointerLocation("schemas/a.json", "/$ref")
  )
})

test("rejects an unused document that AJV strict compilation finds invalid", () => {
  const result = compile([
    source("schemas/root.json", { type: "string" }),
    source("schemas/unused.json", { type: "object", required: ["missing"] })
  ], "schemas/root.json")

  oneDiagnostic(
    result,
    "JSON Schema document is invalid.",
    { path: "schemas/unused.json", pointer: "" }
  )
})

test("enforces AJV strictTypes and strictTuples on unused documents", () => {
  oneDiagnostic(
    compile([
      source("schemas/root.json", { type: "string" }),
      source("schemas/unused.json", { type: "string", minimum: 1 })
    ], "schemas/root.json"),
    "JSON Schema document is invalid.",
    { path: "schemas/unused.json", pointer: "" }
  )
  oneDiagnostic(
    compile([
      source("schemas/root.json", { type: "string" }),
      source("schemas/unused.json", {
        type: "array",
        prefixItems: [{ type: "string" }]
      })
    ], "schemas/root.json"),
    "JSON Schema document is invalid.",
    { path: "schemas/unused.json", pointer: "" }
  )
})

test("selects the same first invalid unused document independent of source order", () => {
  const root = source("schemas/root.json", { type: "string" })
  const a = source("schemas/a.json", { type: "array", prefixItems: [{ type: "string" }] })
  const b = source("schemas/b.json", { type: "string", minimum: 1 })
  for (const schemas of [[root, b, a], [a, root, b]]) {
    oneDiagnostic(
      compile(schemas, "schemas/root.json"),
      "JSON Schema document is invalid.",
      { path: "schemas/a.json", pointer: "" }
    )
  }
})

test("maps nested false schemas reached directly and through local references", async (t) => {
  const direct = compile([source("schemas/root.json", {
    type: "object",
    properties: { denied: false }
  })])
  assert.equal(direct.ok, true)
  const directDiagnostic = oneDiagnostic(
    validate(direct.compiled, { denied: "secret" }),
    "JSON Schema false schema rejected the value."
  )
  assert.deepEqual(directDiagnostic.relatedLocations, [
    { path: "schemas/root.json", pointer: "/properties/denied" }
  ])

  const entries = [
    source("schemas/root.json", {
      type: "object",
      properties: {
        whole: { $ref: "schemas/one.json" },
        sameOne: { $ref: "schemas/one.json#/properties/same" },
        sameTwo: { $ref: "schemas/two.json#/properties/same" },
        pointed: { $ref: "schemas/two.json#/$defs/denied" }
      }
    }),
    source("schemas/one.json", { type: "object", properties: { same: false } }),
    source("schemas/two.json", { type: "object", $defs: { denied: false }, properties: { same: false } })
  ]
  const compiled = compile(entries, "schemas/root.json")
  assert.equal(compiled.ok, true)
  await t.test("whole-document reference false location", () => {
    const diagnostic = oneDiagnostic(
      validate(compiled.compiled, { whole: { same: 1 } }),
      "JSON Schema false schema rejected the value."
    )
    assert.deepEqual(diagnostic.relatedLocations, [
      { path: "schemas/one.json", pointer: "/properties/same" }
    ])
  })
  await t.test("same pointer in first document", () => {
    const diagnostic = oneDiagnostic(
      validate(compiled.compiled, { sameOne: 1 }),
      "JSON Schema false schema rejected the value."
    )
    assert.deepEqual(diagnostic.relatedLocations, [
      { path: "schemas/one.json", pointer: "/properties/same" }
    ])
  })
  await t.test("same pointer in second document", () => {
    const diagnostic = oneDiagnostic(
      validate(compiled.compiled, { sameTwo: 1 }),
      "JSON Schema false schema rejected the value."
    )
    assert.deepEqual(diagnostic.relatedLocations, [
      { path: "schemas/two.json", pointer: "/properties/same" }
    ])
  })
  await t.test("pointer-qualified false location", () => {
    const diagnostic = oneDiagnostic(
      validate(compiled.compiled, { pointed: 1 }),
      "JSON Schema false schema rejected the value."
    )
    assert.deepEqual(diagnostic.relatedLocations, [
      { path: "schemas/two.json", pointer: "/$defs/denied" }
    ])
  })
})

test("maps ordinary AJV errors by parent-schema identity with one related location", () => {
  const result = compile([source("schemas/root.json", {
    type: "object",
    properties: { age: { type: "integer", minimum: 18 } },
    required: ["age"]
  })])
  assert.equal(result.ok, true)

  const diagnostic = oneDiagnostic(
    validate(result.compiled, { age: 10 }),
    "JSON Schema value violates the minimum constraint.",
    { path: "payload.json", pointer: "/age" }
  )
  assert.deepEqual(diagnostic.relatedLocations, [
    { path: "schemas/root.json", pointer: "/properties/age/minimum" }
  ])
  assert.equal(Object.isFrozen(diagnostic.relatedLocations), true)
  assert.equal(Object.isFrozen(diagnostic.relatedLocations[0]), true)
})

test("does not confuse an ordinary user-authored not schema with a transformed false marker", () => {
  const result = compile([source("schemas/root.json", {
    type: "object",
    properties: { denied: { not: {} } }
  })])
  assert.equal(result.ok, true)

  const diagnostic = oneDiagnostic(
    validate(result.compiled, { denied: "value" }),
    "JSON Schema value violates the not constraint."
  )
  assert.deepEqual(diagnostic.relatedLocations, [
    { path: "schemas/root.json", pointer: "/properties/denied/not" }
  ])
})

test("uses controlled fixed messages for AJV constraint keywords", () => {
  const result = compile([source("schemas/root.json", {
    type: "object",
    properties: { code: { type: "string", pattern: "^[A-Z]+$" } },
    required: ["code"],
    maxProperties: 1
  })])
  assert.equal(result.ok, true)

  const diagnostics = validate(result.compiled, { code: "raw-secret", leaked: "/tmp/secret" }).diagnostics
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.message), [
    "JSON Schema value violates the maxProperties constraint.",
    "JSON Schema value violates the pattern constraint."
  ])
  const serialized = JSON.stringify(diagnostics)
  assert.equal(serialized.includes("raw-secret"), false)
  assert.equal(serialized.includes("/tmp/secret"), false)
  assert.equal(serialized.includes("urn:"), false)
  assert.equal(serialized.includes("must"), false)
})

test("never exposes required-property names from AJV params", () => {
  const result = compile([source("schemas/root.json", {
    type: "object",
    properties: { "private-field-name": { type: "string" } },
    required: ["private-field-name"]
  })])
  assert.equal(result.ok, true)

  const diagnostic = oneDiagnostic(
    validate(result.compiled, {}),
    "JSON Schema value violates the required constraint."
  )
  assert.deepEqual(diagnostic.relatedLocations, [
    { path: "schemas/root.json", pointer: "/required" }
  ])
  assert.equal(JSON.stringify(diagnostic).includes("private-field-name"), false)
})

test("falls back to the deepest safe source and caller pointers for control names", () => {
  const result = compile([source(
    "schemas/root.json",
    { type: "object", properties: { "bad\u0000name": { type: "number" } } },
    { path: "schemas/root.json", pointer: "/safe" }
  )])
  assert.equal(result.ok, true)

  const diagnostic = oneDiagnostic(
    validate(result.compiled, { "bad\u0000name": "no" }, {
      location: { path: "payload.json", pointer: "/base" }
    }),
    "JSON Schema value violates the type constraint.",
    { path: "payload.json", pointer: "/base" }
  )
  assert.deepEqual(diagnostic.relatedLocations, [
    { path: "schemas/root.json", pointer: "/safe/properties" }
  ])
})

test("supports fail-pass-fail validator reuse without stale errors", () => {
  const result = compile([source("schemas/root.json", { type: "integer", minimum: 2 })])
  assert.equal(result.ok, true)

  assert.equal(validate(result.compiled, 1).diagnostics[0].message, "JSON Schema value violates the minimum constraint.")
  assert.equal(validate(result.compiled, 2).ok, true)
  assert.equal(validate(result.compiled, "secret").diagnostics[0].message, "JSON Schema value violates the type constraint.")
})

test("rejects noncanonical candidate values before AJV", async (t) => {
  const compiled = compile([source("schemas/root.json", {})]).compiled
  const values = [undefined, NaN, -0, { bad: undefined }, new Date(), [1, , 2], "bad\ud800"]
  for (const value of values) {
    await t.test(String(value), () => {
      oneDiagnostic(
        validate(compiled, value),
        "JSON Schema value is not canonical JSON.",
        { path: "payload.json", pointer: "" }
      )
    })
  }
})

test("rejects hostile candidate proxies, accessors, cycles, and symbols without invoking code", async (t) => {
  const compiled = compile([source("schemas/root.json", {})]).compiled
  let invoked = 0
  const proxy = new Proxy({}, {
    ownKeys() { invoked += 1; throw new Error("value trap") },
    getOwnPropertyDescriptor() { invoked += 1; throw new Error("value trap") }
  })
  const accessor = {}
  Object.defineProperty(accessor, "secret", {
    enumerable: true,
    get() { invoked += 1; throw new Error("value getter") }
  })
  const cyclic = {}
  cyclic.self = cyclic
  const symbol = { safe: true }
  symbol[Symbol("secret")] = "hidden"

  for (const value of [proxy, accessor, cyclic, symbol]) {
    await t.test(String([proxy, accessor, cyclic, symbol].indexOf(value)), () => {
      oneDiagnostic(
        validate(compiled, value),
        "JSON Schema value is not canonical JSON.",
        { path: "payload.json", pointer: "" }
      )
    })
  }
  assert.equal(invoked, 0)
})

test("rejects hostile outer compile inputs in deterministic precedence without invoking code", () => {
  const { compileLocalJsonSchema } = schemaModule()
  let invoked = 0
  const proxy = new Proxy({}, {
    ownKeys() { invoked += 1; throw new Error("trap") },
    getOwnPropertyDescriptor() { invoked += 1; throw new Error("trap") },
    get() { invoked += 1; throw new Error("trap") }
  })
  assert.throws(() => compileLocalJsonSchema(proxy), TypeError)
  assert.equal(invoked, 0)

  const accessor = {
    get rootId() { invoked += 1; return "schemas/root.json" },
    schemas: [], diagnosticCode: CODE, location: BASE_LOCATION
  }
  assert.throws(() => compileLocalJsonSchema(accessor), TypeError)
  assert.equal(invoked, 0)

  assert.throws(() => compileLocalJsonSchema({
    rootId: "schemas/root.json", schemas: [], diagnosticCode: "WF2_UNKNOWN", location: { path: "", pointer: "bad" }
  }), /code/i)
  assert.throws(() => compileLocalJsonSchema({
    rootId: "schemas/root.json", schemas: [], diagnosticCode: CODE, location: { path: "", pointer: "bad" }
  }), /location|path|pointer/i)
})

test("rejects hostile outer validation inputs before compiled brand and value", () => {
  const { validateLocalJsonSchemaValue } = schemaModule()
  let invoked = 0
  const value = new Proxy({}, { ownKeys() { invoked += 1; throw new Error("value trap") } })
  assert.throws(() => validateLocalJsonSchemaValue({
    compiled: Object.freeze({ evidence: {} }),
    value,
    diagnosticCode: CODE,
    location: { path: "payload.json", pointer: "" }
  }), /compiled|handle/i)
  assert.equal(invoked, 0)
})

test("applies validate precedence code then location then compiled brand then value", () => {
  const { validateLocalJsonSchemaValue } = schemaModule()
  let invoked = 0
  const value = new Proxy({}, { ownKeys() { invoked += 1; throw new Error("value trap") } })
  const base = {
    compiled: Object.freeze({ evidence: {} }),
    value,
    diagnosticCode: "WF2_NOT_REGISTERED",
    location: { path: "", pointer: "bad" }
  }
  assert.throws(() => validateLocalJsonSchemaValue(base), /code/i)
  assert.throws(() => validateLocalJsonSchemaValue({ ...base, diagnosticCode: CODE }), /location|path|pointer/i)
  assert.throws(() => validateLocalJsonSchemaValue({
    ...base,
    diagnosticCode: CODE,
    location: { path: "payload.json", pointer: "" }
  }), /compiled|handle/i)
  assert.equal(invoked, 0)
})

test("turns malformed source wrappers and sparse entries into one safe base diagnostic", async (t) => {
  let invoked = 0
  const proxy = new Proxy({}, {
    ownKeys() { invoked += 1; throw new Error("trap") },
    get() { invoked += 1; throw new Error("trap") }
  })
  const accessor = {
    id: "schemas/a.json",
    get schema() { invoked += 1; throw new Error("getter") },
    location: { path: "schemas/a.json", pointer: "" }
  }
  const sparse = new Array(1)
  const cases = [[proxy], [accessor], sparse, [{ id: "schemas/a.json", schema: {}, location: { path: "", pointer: "bad" } }]]

  for (const schemas of cases) {
    await t.test(`case ${cases.indexOf(schemas)}`, () => {
      oneDiagnostic(
        compile(schemas, "schemas/a.json"),
        "JSON Schema catalog entry is invalid.",
        BASE_LOCATION
      )
    })
  }
  assert.equal(invoked, 0)
})

test("processes each catalog entry completely before inspecting the next index", () => {
  let invoked = 0
  const laterAccessor = {
    id: "schemas/later.json",
    get schema() { invoked += 1; throw new Error("later getter") },
    location: { path: "schemas/later.json", pointer: "" }
  }
  oneDiagnostic(
    compile([
      {
        id: "bad:id",
        schema: { $schema: DIALECT, $id: "bad:id" },
        location: { path: "schemas/first.json", pointer: "" }
      },
      laterAccessor
    ], "schemas/root.json"),
    "JSON Schema document ID is invalid.",
    { path: "schemas/first.json", pointer: "" }
  )
  assert.equal(invoked, 0)

  const schemaProxy = new Proxy({}, {
    ownKeys() { invoked += 1; throw new Error("schema trap") },
    getOwnPropertyDescriptor() { invoked += 1; throw new Error("schema trap") }
  })
  oneDiagnostic(
    compile([
      {
        id: "schemas/first.json",
        schema: schemaProxy,
        location: { path: "schemas/first.json", pointer: "" }
      },
      {
        id: "bad:id",
        schema: { $schema: DIALECT, $id: "bad:id" },
        location: { path: "schemas/later.json", pointer: "" }
      }
    ], "schemas/first.json"),
    "JSON Schema document is not canonical JSON.",
    { path: "schemas/first.json", pointer: "" }
  )
  assert.equal(invoked, 0)

  oneDiagnostic(
    compile([{
      id: "schemas/first.json",
      schema: schemaProxy,
      location: { path: "schemas/first.json", pointer: "" }
    }], "schemas/missing.json"),
    "JSON Schema document is not canonical JSON.",
    { path: "schemas/first.json", pointer: "" }
  )
  assert.equal(invoked, 0)
})

test("defers duplicate-ID catalog semantics until every source entry is prepared", () => {
  const first = source("schemas/same.json", {}, { path: "schemas/first.json", pointer: "" })
  const secondNoncanonical = {
    id: "schemas/same.json",
    schema: { $schema: DIALECT, $id: "schemas/same.json", invalid: undefined },
    location: { path: "schemas/second.json", pointer: "/entry" }
  }
  oneDiagnostic(
    compile([first, secondNoncanonical], "schemas/same.json"),
    "JSON Schema document is not canonical JSON.",
    secondNoncanonical.location
  )

  const second = source("schemas/same.json", {}, { path: "schemas/second.json", pointer: "" })
  const laterInvalidId = {
    id: "bad:id",
    schema: { $schema: DIALECT, $id: "bad:id" },
    location: { path: "schemas/third.json", pointer: "/entry" }
  }
  oneDiagnostic(
    compile([first, second, laterInvalidId], "schemas/same.json"),
    "JSON Schema document ID is invalid.",
    laterInvalidId.location
  )
})

test("rejects hostile source locations, hidden fields, symbols, and exotic entries safely", async (t) => {
  let invoked = 0
  const locationProxy = new Proxy({}, {
    ownKeys() { invoked += 1; throw new Error("location trap") },
    getOwnPropertyDescriptor() { invoked += 1; throw new Error("location trap") }
  })
  const locationAccessor = {}
  Object.defineProperties(locationAccessor, {
    path: { enumerable: true, get() { invoked += 1; throw new Error("location getter") } },
    pointer: { enumerable: true, value: "" }
  })
  const hidden = source("schemas/root.json")
  Object.defineProperty(hidden, "hidden", { enumerable: false, value: true })
  const symbol = source("schemas/root.json")
  symbol[Symbol("hidden")] = true
  const exotic = Object.create({ inherited: true })
  Object.assign(exotic, source("schemas/root.json"))
  const cases = [
    [{ ...source("schemas/root.json"), location: locationProxy }],
    [{ ...source("schemas/root.json"), location: locationAccessor }],
    [hidden],
    [symbol],
    [exotic]
  ]
  for (const schemas of cases) {
    await t.test(String(cases.indexOf(schemas)), () => oneDiagnostic(
      compile(schemas, "schemas/root.json"),
      "JSON Schema catalog entry is invalid.",
      BASE_LOCATION
    ))
  }
  assert.equal(invoked, 0)
})

test("rejects schema-array proxies and subclasses without invoking traps", () => {
  const { compileLocalJsonSchema } = schemaModule()
  let invoked = 0
  const proxy = new Proxy([], {
    getPrototypeOf() { invoked += 1; throw new Error("array trap") },
    ownKeys() { invoked += 1; throw new Error("array trap") }
  })
  const makeInput = (schemas) => ({
    rootId: "schemas/root.json",
    schemas,
    diagnosticCode: CODE,
    location: BASE_LOCATION
  })
  assert.throws(() => compileLocalJsonSchema(makeInput(proxy)), TypeError)
  class SchemaArray extends Array {}
  assert.throws(() => compileLocalJsonSchema(makeInput(new SchemaArray())), TypeError)
  assert.equal(invoked, 0)
})

test("rejects hidden, symbolic, and exotic outer records", () => {
  const { compileLocalJsonSchema } = schemaModule()
  const ordinary = {
    rootId: "schemas/root.json",
    schemas: [],
    diagnosticCode: CODE,
    location: BASE_LOCATION
  }
  const hidden = { ...ordinary }
  Object.defineProperty(hidden, "hidden", { enumerable: false, value: true })
  const symbol = { ...ordinary, [Symbol("hidden")]: true }
  const exotic = Object.assign(Object.create({ inherited: true }), ordinary)
  for (const value of [hidden, symbol, exotic]) {
    assert.throws(() => compileLocalJsonSchema(value), TypeError)
  }
})

test("rejects proxy and accessor schema values without invoking them", () => {
  let invoked = 0
  const proxy = new Proxy({}, {
    ownKeys() { invoked += 1; throw new Error("trap") },
    getOwnPropertyDescriptor() { invoked += 1; throw new Error("trap") }
  })
  const location = { path: "schemas/root.json", pointer: "" }
  oneDiagnostic(
    compile([{ id: "schemas/root.json", schema: proxy, location }]),
    "JSON Schema document is not canonical JSON.",
    location
  )
  assert.equal(invoked, 0)
})

test("rejects hostile noncanonical source schemas at the source location", async (t) => {
  const location = { path: "schemas/root.json", pointer: "" }
  let accessorReads = 0
  const accessor = {}
  Object.defineProperty(accessor, "$schema", {
    enumerable: true,
    get() {
      accessorReads += 1
      throw new Error("schema accessor must not run")
    }
  })
  const sparse = new Array(1)
  const symbolic = { [Symbol("hidden")]: true }
  const exotic = new Date(0)
  const cyclic = {}
  cyclic.self = cyclic
  const cases = [
    ["accessor", accessor],
    ["sparse array", sparse],
    ["symbol key", symbolic],
    ["exotic object", exotic],
    ["cycle", cyclic],
    ["lone surrogate", "\ud800"]
  ]

  for (const [name, schema] of cases) {
    await t.test(name, () => oneDiagnostic(
      compile([{ id: "schemas/root.json", schema, location }]),
      "JSON Schema document is not canonical JSON.",
      location
    ))
  }
  assert.equal(accessorReads, 0)
})

test("rejects forged compiled handles through a private brand", () => {
  const real = compile([source("schemas/root.json", {})])
  assert.equal(real.ok, true)
  const forged = Object.freeze({ evidence: real.compiled.evidence })
  assert.throws(() => validate(forged, null), /compiled|handle/i)
})

test("rejects a compiled-handle Proxy without invoking traps", () => {
  let invoked = 0
  const proxy = new Proxy({}, {
    get() { invoked += 1; throw new Error("compiled trap") },
    getPrototypeOf() { invoked += 1; throw new Error("compiled trap") },
    ownKeys() { invoked += 1; throw new Error("compiled trap") }
  })
  assert.throws(() => validate(proxy, null), /compiled|handle/i)
  assert.equal(invoked, 0)
})

test("uses captured proxy, freeze, and WeakMap operations during branded validation", () => {
  const compiled = compile([source("schemas/root.json", { type: "integer" })]).compiled
  const util = require("node:util")
  const originals = {
    isProxy: util.types.isProxy,
    freeze: Object.freeze,
    get: WeakMap.prototype.get,
    has: WeakMap.prototype.has,
    set: WeakMap.prototype.set
  }
  util.types.isProxy = () => { throw new Error("patched isProxy") }
  Object.freeze = () => { throw new Error("patched freeze") }
  WeakMap.prototype.get = () => { throw new Error("patched WeakMap.get") }
  WeakMap.prototype.has = () => { throw new Error("patched WeakMap.has") }
  WeakMap.prototype.set = () => { throw new Error("patched WeakMap.set") }
  try {
    assert.equal(validate(compiled, 1).ok, true)
  } finally {
    util.types.isProxy = originals.isProxy
    Object.freeze = originals.freeze
    WeakMap.prototype.get = originals.get
    WeakMap.prototype.has = originals.has
    WeakMap.prototype.set = originals.set
  }
})

test("uses captured module dependencies and private dialect semantics after load", () => {
  const module = schemaModule()
  const canonical = canonicalModule()
  const jsonValue = require("../out/core/contractV2/jsonValue.js")
  const diagnostics = require("../out/core/contractV2/diagnostics.js")
  const ajvExports = require("ajv/dist/2020")
  const catalog = [source("schemas/root.json", {
    type: "string",
    const: "allowed"
  })]
  const schemaDigest = canonical.canonicalJsonDigest(catalog[0].schema)
  const catalogDigest = canonical.canonicalJsonDigest({
    dialect: DIALECT,
    rootId: "schemas/root.json",
    schemas: [{ id: "schemas/root.json", schemaDigest }]
  })
  const targets = [
    [canonical, "canonicalJsonText"],
    [canonical, "canonicalJsonDigest"],
    [jsonValue, "cloneAndFreezeJsonValue"],
    [diagnostics, "createWorkflowContractV2Diagnostic"],
    [diagnostics, "sortWorkflowContractV2Diagnostics"],
    [diagnostics, "WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES"],
    [ajvExports, "default"],
    [ajvExports, "Ajv2020"],
    [module, "WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT"]
  ]
  const descriptors = targets.map(([target, name]) => [
    target,
    name,
    Object.getOwnPropertyDescriptor(target, name)
  ])
  const calls = {
    canonicalJsonText: 0,
    canonicalJsonDigest: 0,
    cloneAndFreezeJsonValue: 0,
    createWorkflowContractV2Diagnostic: 0,
    sortWorkflowContractV2Diagnostics: 0,
    Ajv2020: 0
  }
  const poison = (name) => function poisonedDependency() {
    calls[name] += 1
    throw new Error(`live ${name} export must not be used`)
  }
  class PoisonedAjv {
    constructor() {
      calls.Ajv2020 += 1
      throw new Error("live AJV export must not be used")
    }
  }
  const replace = (target, name, value) => Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })

  replace(canonical, "canonicalJsonText", poison("canonicalJsonText"))
  replace(canonical, "canonicalJsonDigest", poison("canonicalJsonDigest"))
  replace(jsonValue, "cloneAndFreezeJsonValue", poison("cloneAndFreezeJsonValue"))
  replace(diagnostics, "createWorkflowContractV2Diagnostic", poison("createWorkflowContractV2Diagnostic"))
  replace(diagnostics, "sortWorkflowContractV2Diagnostics", poison("sortWorkflowContractV2Diagnostics"))
  replace(diagnostics, "WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES", Object.freeze([]))
  replace(ajvExports, "default", PoisonedAjv)
  replace(ajvExports, "Ajv2020", PoisonedAjv)
  replace(module, "WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT", "https://attacker.invalid/schema")
  let compiled
  let rejected
  try {
    compiled = module.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: catalog,
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
    assert.equal(compiled.ok, true)
    rejected = module.validateLocalJsonSchemaValue({
      compiled: compiled.compiled,
      value: "blocked",
      diagnosticCode: CODE,
      location: { path: "payload.json", pointer: "" }
    })
  } finally {
    for (const [target, name, descriptor] of descriptors) {
      if (descriptor === undefined) delete target[name]
      else Object.defineProperty(target, name, descriptor)
    }
  }

  assert.deepEqual(compiled.compiled.evidence, {
    dialect: DIALECT,
    rootId: "schemas/root.json",
    schemas: [{ id: "schemas/root.json", schemaDigest }],
    catalogDigest
  })
  oneDiagnostic(rejected, "JSON Schema value violates the const constraint.")
  assert.deepEqual(calls, {
    canonicalJsonText: 0,
    canonicalJsonDigest: 0,
    cloneAndFreezeJsonValue: 0,
    createWorkflowContractV2Diagnostic: 0,
    sortWorkflowContractV2Diagnostics: 0,
    Ajv2020: 0
  })
})

test("sorts evidence independent of input order without mutating source schemas", () => {
  const z = source("schemas/z.json", { type: "object", properties: { denied: false } })
  const a = source("schemas/a.json", { type: "string" })
  const { canonicalJsonDigest } = canonicalModule()
  const expected = new Map([
    [a.id, canonicalJsonDigest(a.schema)],
    [z.id, canonicalJsonDigest(z.schema)]
  ])
  const before = JSON.stringify([z, a])

  const result = compile([z, a], "schemas/z.json")

  assert.equal(result.ok, true)
  assert.deepEqual(result.compiled.evidence.schemas.map((entry) => entry.id), [a.id, z.id])
  assert.deepEqual(result.compiled.evidence.schemas.map((entry) => entry.schemaDigest), [
    expected.get(a.id),
    expected.get(z.id)
  ])
  assert.equal(JSON.stringify([z, a]), before)
  assert.equal(z.schema.properties.denied, false)
})

test("uses captured input-inspection intrinsics", () => {
  const module = schemaModule()
  const originals = {
    isArray: Array.isArray,
    descriptors: Object.getOwnPropertyDescriptors,
    prototype: Object.getPrototypeOf,
    ownKeys: Reflect.ownKeys
  }
  Array.isArray = () => { throw new Error("patched Array.isArray") }
  Object.getOwnPropertyDescriptors = () => { throw new Error("patched descriptors") }
  Object.getPrototypeOf = () => { throw new Error("patched prototype") }
  Reflect.ownKeys = () => { throw new Error("patched ownKeys") }
  try {
    const result = module.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: [],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
    oneDiagnostic(result, "JSON Schema catalog is empty.", BASE_LOCATION)
  } finally {
    Array.isArray = originals.isArray
    Object.getOwnPropertyDescriptors = originals.descriptors
    Object.getPrototypeOf = originals.prototype
    Reflect.ownKeys = originals.ownKeys
  }
})

test("uses captured collection, graph, math, and string intrinsics before AJV", () => {
  const module = schemaModule()
  const originals = {
    Map: global.Map,
    Set: global.Set,
    mapGet: Map.prototype.get,
    mapHas: Map.prototype.has,
    mapSet: Map.prototype.set,
    mapForEach: Map.prototype.forEach,
    setAdd: Set.prototype.add,
    setDelete: Set.prototype.delete,
    setHas: Set.prototype.has,
    fromCharCode: String.fromCharCode,
    min: Math.min
  }
  let result
  global.Map = class PatchedMap { constructor() { throw new Error("patched Map") } }
  global.Set = class PatchedSet { constructor() { throw new Error("patched Set") } }
  Map.prototype.get = () => { throw new Error("patched Map.get") }
  Map.prototype.has = () => { throw new Error("patched Map.has") }
  Map.prototype.set = () => { throw new Error("patched Map.set") }
  Map.prototype.forEach = () => { throw new Error("patched Map.forEach") }
  Set.prototype.add = () => { throw new Error("patched Set.add") }
  Set.prototype.delete = () => { throw new Error("patched Set.delete") }
  Set.prototype.has = () => { throw new Error("patched Set.has") }
  String.fromCharCode = () => { throw new Error("patched String.fromCharCode") }
  Math.min = () => { throw new Error("patched Math.min") }
  try {
    result = module.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: [source("schemas/root.json", {
        $defs: {
          "a/b": { $ref: "#/$defs/b" },
          b: { $ref: "#/$defs/a~1b" }
        }
      })],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
  } finally {
    global.Map = originals.Map
    global.Set = originals.Set
    Map.prototype.get = originals.mapGet
    Map.prototype.has = originals.mapHas
    Map.prototype.set = originals.mapSet
    Map.prototype.forEach = originals.mapForEach
    Set.prototype.add = originals.setAdd
    Set.prototype.delete = originals.setDelete
    Set.prototype.has = originals.setHas
    String.fromCharCode = originals.fromCharCode
    Math.min = originals.min
  }
  oneDiagnostic(
    result,
    "JSON Schema reference cycle is unsupported.",
    { path: "schemas/root.json", pointer: "/$defs/a~1b/$ref" }
  )
})

test("does not read the live global String binding or invoke reference prototype setters", () => {
  const module = schemaModule()
  const stringDescriptor = Object.getOwnPropertyDescriptor(globalThis, "String")
  const setterNames = ["referenceText", "reference"]
  const priorDescriptors = new Map(setterNames.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(Object.prototype, name)
  ]))
  let stringReads = 0
  const setterCalls = new Map(setterNames.map((name) => [name, 0]))
  let result
  Object.defineProperty(globalThis, "String", {
    configurable: true,
    get() {
      stringReads += 1
      throw new Error("live String binding must not be read")
    }
  })
  for (const name of setterNames) {
    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      set() {
        setterCalls.set(name, setterCalls.get(name) + 1)
        throw new Error(`prototype ${name} setter must not run`)
      }
    })
  }
  try {
    result = module.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: [source("schemas/root.json", {
        $defs: {
          "a/b": { $ref: "#/$defs/b" },
          b: { $ref: "#/$defs/a~1b" }
        }
      })],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
  } finally {
    if (stringDescriptor === undefined) delete globalThis.String
    else Object.defineProperty(globalThis, "String", stringDescriptor)
    for (const name of setterNames) {
      const descriptor = priorDescriptors.get(name)
      if (descriptor === undefined) delete Object.prototype[name]
      else Object.defineProperty(Object.prototype, name, descriptor)
    }
  }
  oneDiagnostic(
    result,
    "JSON Schema reference cycle is unsupported.",
    { path: "schemas/root.json", pointer: "/$defs/a~1b/$ref" }
  )
  assert.equal(stringReads, 0)
  assert.deepEqual(Object.fromEntries(setterCalls), {
    referenceText: 0,
    reference: 0
  })
})

test("defines false markers and transformed documents without prototype setters", () => {
  const schemaPath = require.resolve("../out/core/contractV2/jsonSchema.js")
  const ajvPath = require.resolve("ajv/dist/2020")
  const previousSchema = require.cache[schemaPath]
  const ajvExports = require(ajvPath)
  const originalDefault = ajvExports.default
  const originalNamed = ajvExports.Ajv2020
  const setterNames = ["not", "transformed"]
  const priorDescriptors = new Map(setterNames.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(Object.prototype, name)
  ]))
  const setterCalls = new Map(setterNames.map((name) => [name, 0]))
  class ThrowingAjv {
    constructor() {
      throw new Error("stop after the owned transform boundary")
    }
  }
  let result
  ajvExports.default = ThrowingAjv
  ajvExports.Ajv2020 = ThrowingAjv
  delete require.cache[schemaPath]
  try {
    const fresh = require(schemaPath)
    for (const name of setterNames) {
      Object.defineProperty(Object.prototype, name, {
        configurable: true,
        set() {
          setterCalls.set(name, setterCalls.get(name) + 1)
          throw new Error(`prototype ${name} setter must not run`)
        }
      })
    }
    result = fresh.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: [source("schemas/root.json", {
        type: "object",
        properties: { denied: false }
      })],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
  } finally {
    for (const name of setterNames) {
      const descriptor = priorDescriptors.get(name)
      if (descriptor === undefined) delete Object.prototype[name]
      else Object.defineProperty(Object.prototype, name, descriptor)
    }
    ajvExports.default = originalDefault
    ajvExports.Ajv2020 = originalNamed
    delete require.cache[schemaPath]
    if (previousSchema !== undefined) require.cache[schemaPath] = previousSchema
  }
  oneDiagnostic(result, "JSON Schema document is invalid.", BASE_LOCATION)
  assert.deepEqual(Object.fromEntries(setterCalls), {
    not: 0,
    transformed: 0
  })
})

test("never performs network or filesystem loading", () => {
  const originalFetch = global.fetch
  let calls = 0
  global.fetch = () => {
    calls += 1
    throw new Error("fetch must not run")
  }
  try {
    assert.equal(compile([source("schemas/root.json", { type: "string" })]).ok, true)
    assert.equal(calls, 0)
  } finally {
    global.fetch = originalFetch
  }

  const sourceText = readFileSync(require.resolve("../src/core/contractV2/jsonSchema.ts"), "utf8")
  assert.doesNotMatch(sourceText, /(?:from|require\s*\()\s*["'](?:node:)?(?:fs|http|https)(?:\/[^"']*)?["']/u)
  assert.doesNotMatch(sourceText, /\b(?:fetch|loadSchema)\b/u)
  assert.doesNotMatch(sourceText, /\bimport\s*\(/u)
})

test("does not perform I/O while loading a fresh module instance", () => {
  const modulePath = require.resolve("../out/core/contractV2/jsonSchema.js")
  const originalFetch = global.fetch
  const previous = require.cache[modulePath]
  let calls = 0
  global.fetch = () => {
    calls += 1
    throw new Error("fresh-load fetch must not run")
  }
  delete require.cache[modulePath]
  try {
    const fresh = require(modulePath)
    const result = fresh.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: [source("schemas/root.json", { type: "string" })],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
    assert.equal(result.ok, true)
    assert.equal(calls, 0)
  } finally {
    delete require.cache[modulePath]
    if (previous !== undefined) require.cache[modulePath] = previous
    global.fetch = originalFetch
  }
})

test("constructs no AJV before preflight and one strict instance for a whole catalog", () => {
  const schemaPath = require.resolve("../out/core/contractV2/jsonSchema.js")
  const ajvPath = require.resolve("ajv/dist/2020")
  const previousSchema = require.cache[schemaPath]
  const ajvExports = require(ajvPath)
  const OriginalAjv = ajvExports.default
  const originalDefault = ajvExports.default
  const originalNamed = ajvExports.Ajv2020
  const instances = []
  const additions = []
  const lookups = []
  class CountingAjv extends OriginalAjv {
    constructor(options) {
      instances.push({ options })
      super(options)
      const addSchema = this.addSchema.bind(this)
      const getSchema = this.getSchema.bind(this)
      this.addSchema = (schema, key) => {
        if (typeof key === "string" && key.startsWith("urn:workflow-contract-v2:schema:")) additions.push(key)
        return addSchema(schema, key)
      }
      this.getSchema = (key) => {
        if (typeof key === "string" && key.startsWith("urn:workflow-contract-v2:schema:")) lookups.push(key)
        return getSchema(key)
      }
    }
  }
  ajvExports.default = CountingAjv
  ajvExports.Ajv2020 = CountingAjv
  delete require.cache[schemaPath]
  try {
    const fresh = require(schemaPath)
    const invalid = fresh.compileLocalJsonSchema({
      rootId: "schemas/root.json",
      schemas: [source("schemas/root.json", { format: "email" })],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
    assert.equal(invalid.ok, false)
    assert.equal(instances.length, 0)

    const result = fresh.compileLocalJsonSchema({
      rootId: "schemas/z.json",
      schemas: [source("schemas/z.json", { type: "string" }), source("schemas/a.json", { type: "number" })],
      diagnosticCode: CODE,
      location: BASE_LOCATION
    })
    assert.equal(result.ok, true)
    assert.equal(instances.length, 1)
    assert.deepEqual(instances[0].options, {
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
    })
    assert.equal(additions.length, 2)
    assert.equal(lookups.length, 2)
    const internalId = (id) => `urn:workflow-contract-v2:schema:${Buffer.from(id, "utf8").toString("base64url")}`
    const externalIdOrder = [internalId("schemas/a.json"), internalId("schemas/z.json")]
    assert.deepEqual(additions, externalIdOrder)
    assert.deepEqual(lookups, externalIdOrder)
  } finally {
    ajvExports.default = originalDefault
    ajvExports.Ajv2020 = originalNamed
    delete require.cache[schemaPath]
    if (previousSchema !== undefined) require.cache[schemaPath] = previousSchema
  }
})
