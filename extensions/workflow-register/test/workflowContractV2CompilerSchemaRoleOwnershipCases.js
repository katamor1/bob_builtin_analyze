const assert = require("node:assert/strict")
const { test } = require("node:test")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function source() {
  return {
    $schema: DIALECT,
    $id: "schemas/review.json",
    type: "object",
    properties: {
      category: { type: "string", enum: ["alpha", "beta"] },
      decision: { type: "string", enum: ["approved", "rejected"] }
    },
    required: ["category", "decision"],
    additionalProperties: false
  }
}

function compiled(schema) {
  const result = require("../out/core/contractV2/jsonSchemaCatalog.js").compileLocalJsonSchemaCatalog({
    rootIds: ["schemas/review.json"],
    schemas: [{
      id: "schemas/review.json",
      schema,
      location: { path: "schemas/review.json", pointer: "" }
    }],
    diagnosticCode: "WF2_PACKAGE_LAYOUT_INVALID",
    location: { path: "workflow.yaml", pointer: "" }
  })
  assert.equal(result.ok, true)
  return result.roots[0].compiled
}

function fields(options = ["alpha", "beta"]) {
  return [
    { id: "category", required: true, kind: "select", options },
    { id: "decision", required: true, kind: "approval" }
  ]
}

test("manual schema role reasoning is owned by an opaque detached F3 handle", () => {
  const subject = require("../out/core/contractV2/jsonSchemaRole.js")
  const schema = source()
  const role = subject.createLocalJsonSchemaRoleHandle({ compiled: compiled(schema), schema })

  assert.equal(Object.isFrozen(role), true)
  assert.deepEqual(Object.keys(role), [])
  assert.equal(JSON.stringify(role), "{}")
  assert.throws(() => subject.validateLocalJsonSchemaManualContract({ role: { ...role }, fields: fields() }), TypeError)
  assert.deepEqual(subject.validateLocalJsonSchemaManualContract({ role, fields: fields() }), { ok: true })

  const referenced = {
    $schema: DIALECT, $id: "schemas/review.json", $ref: "#/$defs/body",
    $defs: { body: source(), category: { type: "string", enum: ["alpha", "beta"] } }
  }
  delete referenced.$defs.body.$id
  delete referenced.$defs.body.$schema
  referenced.$defs.body.properties.category = { $ref: "#/$defs/category" }
  const referenceView = compiled(referenced)
  const referenceRole = subject.createLocalJsonSchemaRoleHandle({ compiled: referenceView, schema: referenced })
  assert.deepEqual(Object.keys(referenceRole), [])
  assert.deepEqual(subject.validateLocalJsonSchemaManualContract({ role: referenceRole, fields: fields() }), { ok: true })
  referenced.$defs.category.enum[0] = "changed-after-catalog-snapshot"
  assert.deepEqual(subject.validateLocalJsonSchemaManualContract({ role: referenceRole, fields: fields() }), { ok: true })
  assert.throws(() => subject.createLocalJsonSchemaRoleHandle({ compiled: referenceView, schema: referenced }), /evidence|digest|match/i)

  schema.properties.category.enum[0] = "changed-after-snapshot"
  assert.deepEqual(subject.validateLocalJsonSchemaManualContract({ role, fields: fields() }), { ok: true })
})

test("manual schema role returns closed reasons and rejects mismatched source evidence", () => {
  const subject = require("../out/core/contractV2/jsonSchemaRole.js")
  const schema = source()
  const compiledSchema = compiled(schema)
  const role = subject.createLocalJsonSchemaRoleHandle({ compiled: compiledSchema, schema })

  assert.deepEqual(
    subject.validateLocalJsonSchemaManualContract({ role, fields: fields(["alpha", "gamma"]) }),
    { ok: false, reason: "field-options", fieldIndex: 0 }
  )
  assert.throws(
    () => subject.createLocalJsonSchemaRoleHandle({
      compiled: compiledSchema,
      schema: { ...schema, type: "array" }
    }),
    /evidence|digest|match/i
  )
  assert.throws(() => subject.createLocalJsonSchemaRoleHandle({
    compiled: compiledSchema, schema: { ...schema, $id: "schemas/other.json" }
  }), /evidence|digest|match/i)
})

test("manual schema role rejects proxy and accessor collections without invoking behavior", () => {
  const subject = require("../out/core/contractV2/jsonSchemaRole.js")
  const schema = source()
  const role = subject.createLocalJsonSchemaRoleHandle({ compiled: compiled(schema), schema })

  let optionTraps = 0
  const options = new Proxy(["alpha", "beta"], {
    get() { optionTraps += 1; throw new Error("must not read options proxy") },
    ownKeys() { optionTraps += 1; throw new Error("must not inspect options proxy") }
  })
  assert.throws(
    () => subject.validateLocalJsonSchemaManualContract({ role, fields: fields(options) }),
    TypeError
  )
  assert.equal(optionTraps, 0)

  const tooManyForms = Array.from({ length: 129 }, (_, index) => ({ id: "field" + index, required: true, kind: "string" }))
  assert.throws(() => subject.validateLocalJsonSchemaManualContract({ role, fields: tooManyForms }), /form|limit/i)
  assert.throws(() => subject.validateLocalJsonSchemaManualContract({
    role, fields: [{ id: "decision", required: true, kind: "approval" }, { id: "decision", required: true, kind: "approval" }]
  }), /approval|limit/i)

  let getterCalls = 0
  const field = { id: "category", required: true, kind: "select" }
  Object.defineProperty(field, "options", {
    enumerable: true,
    get() { getterCalls += 1; return ["alpha", "beta"] }
  })
  assert.throws(
    () => subject.validateLocalJsonSchemaManualContract({
      role,
      fields: [field, { id: "decision", required: true, kind: "approval" }]
    }),
    TypeError
  )
  assert.equal(getterCalls, 0)
})
