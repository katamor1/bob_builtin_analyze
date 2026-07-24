const assert = require("node:assert/strict")
const { test } = require("node:test")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function schema(id, type) {
  return { $schema: DIALECT, $id: id, type }
}

test("F3 compiles all requested roots from one AJV catalog construction", () => {
  const ajvPath = require.resolve("ajv/dist/2020")
  const schemaPath = require.resolve("../out/core/contractV2/jsonSchema.js")
  const catalogPath = require.resolve("../out/core/contractV2/jsonSchemaCatalog.js")
  const originalExports = require(ajvPath)
  const Original = originalExports.default ?? originalExports
  let constructions = 0
  class CountingAjv extends Original {
    constructor(...args) {
      constructions += 1
      super(...args)
    }
  }
  const replacement = { ...originalExports, default: CountingAjv }
  const cached = require.cache[ajvPath]
  if (cached === undefined) throw new Error("AJV module cache is unavailable")
  cached.exports = replacement
  delete require.cache[schemaPath]
  delete require.cache[catalogPath]
  try {
    const subject = require(catalogPath)
    const roots = ["schemas/a.json", "schemas/b.json"]
    const result = subject.compileLocalJsonSchemaCatalog({
      rootIds: roots,
      schemas: [
        { id: roots[0], schema: schema(roots[0], "string"), location: { path: roots[0], pointer: "" } },
        { id: roots[1], schema: schema(roots[1], "number"), location: { path: roots[1], pointer: "" } }
      ],
      diagnosticCode: "WF2_PACKAGE_LAYOUT_INVALID",
      location: { path: "workflow.yaml", pointer: "" }
    })
    assert.equal(result.ok, true)
    assert.equal(constructions, 1)
    assert.deepEqual(result.roots.map((root) => root.id), roots)
    assert.deepEqual(result.roots.map((root) => root.compiled.evidence.rootId), roots)
    assert.deepEqual(
      subject.inspectLocalJsonSchemaViewInstancePointer({ compiled: result.roots[0].compiled, pointer: "" }),
      { ok: true, kinds: ["string"] }
    )
    assert.deepEqual(
      subject.inspectLocalJsonSchemaViewInstancePointer({ compiled: result.roots[1].compiled, pointer: "" }),
      { ok: true, kinds: ["number"] }
    )
  } finally {
    cached.exports = originalExports
    delete require.cache[schemaPath]
    delete require.cache[catalogPath]
  }
})

test("F3 catalog root IDs are dense canonical sorted and duplicate-free", () => {
  const subject = require("../out/core/contractV2/jsonSchemaCatalog.js")
  const source = {
    schemas: [{
      id: "schemas/a.json",
      schema: schema("schemas/a.json", "string"),
      location: { path: "schemas/a.json", pointer: "" }
    }],
    diagnosticCode: "WF2_PACKAGE_LAYOUT_INVALID",
    location: { path: "workflow.yaml", pointer: "" }
  }
  for (const rootIds of [
    ["schemas/b.json", "schemas/a.json"],
    ["schemas/a.json", "schemas/a.json"]
  ]) {
    assert.throws(() => subject.compileLocalJsonSchemaCatalog({ ...source, rootIds }), TypeError)
  }

  let traps = 0
  const proxy = new Proxy(["schemas/a.json"], {
    get() { traps += 1; throw new Error("must not read root proxy") },
    ownKeys() { traps += 1; throw new Error("must not inspect root proxy") }
  })
  assert.throws(() => subject.compileLocalJsonSchemaCatalog({ ...source, rootIds: proxy }), TypeError)
  assert.equal(traps, 0)
})
