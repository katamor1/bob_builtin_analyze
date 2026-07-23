"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "core", "pipeline.ts"),
  "utf8"
)

test("preprocessReview forwards its abort signal to document extraction", () => {
  assert.match(
    source,
    /extractDocuments\(reviewInput,\s*\{[\s\S]*?workspaceRoot:\s*input\.workspaceRoot,[\s\S]*?textEncoding,[\s\S]*?limits,[\s\S]*?signal:\s*input\.abortSignal[\s\S]*?\}\)/
  )
})
