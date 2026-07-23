"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "ruleAuthoring", "extraction", "documentExtractor.ts"),
  "utf8"
)

test("rule document requests preserve nested PDF signal while allowing an operation signal", () => {
  assert.match(
    source,
    /pdf\?: Omit<PdfExtractionOptions, "sourceId" \| "maxChunkBytes" \| "maxOutputBytes">/
  )
  assert.match(source, /signal: request\.signal \?\? request\.pdf\?\.signal/)
})
