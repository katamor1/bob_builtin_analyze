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
  const result = require("../out/core/contractV2/jsonSchema.js").compileLocalJsonSchema({
    rootId: "schemas/review.json",
    schemas: [{
      id: "schemas/review.json",
      schema,
      location: { path: "schemas/review.json", pointer: "" }
    }],
    diagnosticCode: "WF2_PACKAGE_LAYOUT_INVALID",
    location: { path: "schemas/review.json", pointer: "" }
  })
  assert.equal(result.ok, true)
  return result.compiled
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
  assert.deepEqual(subject.validateLocalJsonSchemaManualContract({ role, fields: fields() }), { ok: true })

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
})
