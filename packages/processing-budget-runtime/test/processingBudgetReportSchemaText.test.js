"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const schema = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "schema", "processing-budget-report.v1.schema.json"),
  "utf8"
))
const metaSchema = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "schema", "processing-budget-report.meta.schema.json"),
  "utf8"
))

const META_SCHEMA_ID = "https://bob.local/schemas/meta/processing-budget-report-2020-12.schema.json"
const TEXT_VOCABULARY = "https://bob.local/vocab/utf8-nfc/v1"

test("published report schema requires the UTF-8 NFC vocabulary", () => {
  assert.equal(schema.$schema, META_SCHEMA_ID)
  assert.equal(metaSchema.$id, META_SCHEMA_ID)
  assert.equal(metaSchema.$vocabulary[TEXT_VOCABULARY], true)
  assert.equal(metaSchema.properties["x-bob-maxUtf8Bytes"].type, "integer")
  assert.equal(metaSchema.properties["x-bob-unicodeNormalization"].const, "NFC")
})

test("bounded text declares runtime-equivalent UTF-8 and NFC semantics", () => {
  const bounded = schema.$defs.boundedText
  assert.equal(bounded["x-bob-maxUtf8Bytes"], 256)
  assert.equal(bounded["x-bob-unicodeNormalization"], "NFC")
})

test("the vocabulary distinguishes character count from UTF-8 bytes and NFC", () => {
  const bounded = schema.$defs.boundedText
  const accepts = (value) => {
    if (typeof value !== "string" || value.length === 0) return false
    if (Buffer.byteLength(value, "utf8") > bounded["x-bob-maxUtf8Bytes"]) return false
    if (value.normalize(bounded["x-bob-unicodeNormalization"]) !== value) return false
    return !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
  }

  assert.equal(accepts("a".repeat(256)), true)
  assert.equal(accepts("é".repeat(128)), true)
  assert.equal(accepts("é".repeat(129)), false)
  assert.equal(accepts("e\u0301"), false)
  assert.equal(accepts("設計レビュー"), true)
})
