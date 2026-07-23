"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")
const legacyOption = `max${"Buffer"}Bytes`

const migratedFiles = [
  "src/bazaar/externalProcessRunner.ts",
  "src/bazaar/bazaar.ts",
  "src/ruleAuthoring/extraction/pdfExtractor.ts",
  "test/externalProcessRunner.test.js",
  "test/rulePdfExtraction.test.js",
  "test/windowsProcessTreeTermination.test.js"
]

test("Bazaar process execution uses only the explicit stdout budget option", () => {
  const runner = fs.readFileSync(path.join(extensionRoot, "src/bazaar/externalProcessRunner.ts"), "utf8")
  assert.match(runner, /maxStdoutBytes: number/)

  for (const relativePath of migratedFiles) {
    const source = fs.readFileSync(path.join(extensionRoot, relativePath), "utf8")
    assert.doesNotMatch(source, new RegExp(legacyOption), relativePath)
  }
})
