"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "ruleAuthoring", "extraction", "documentExtractor.ts"),
  "utf8"
)

test("rule document batches create one deadline and one cancellation scope before fingerprinting", () => {
  assert.match(source, /const deadline = operationDeadlineForRequests\(requests\)/)
  assert.match(source, /const cancellation = createCancellationScope\(\{[\s\S]*deadline,[\s\S]*signal: sharedRequestSignal\(requests\)/)
  assert.ok(source.indexOf("const deadline = operationDeadlineForRequests(requests)") < source.indexOf("Promise.all(requests.map"))
  assert.match(source, /cancellation\.throwIfCancelled\(\)/)
  assert.match(source, /finally \{[\s\S]*cancellation\.dispose\(\)/)
})

test("every PDF in a batch receives the operation deadline rather than a nested timeout", () => {
  assert.match(source, /deadline: context\.deadline/)
  assert.match(source, /signal: context\.cancellation\.signal/)
  assert.doesNotMatch(source, /deadline: request\.pdf\?\.deadline/)
  assert.doesNotMatch(source, /createAbsoluteDeadline\([^)]*\)[\s\S]*extractPdf\(/)
})

test("multiple explicit cancellation signals are rejected instead of silently dropping a cause", () => {
  assert.match(source, /Rule document batch requests must share one cancellation signal/)
})
