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
  assert.ok(source.indexOf("const deadline = operationDeadlineForRequests(requests)") < source.indexOf("requests.entries()"))
  assert.match(source, /cancellation\.throwIfCancelled\(\)/)
  assert.match(source, /finally \{[\s\S]*cancellation\.dispose\(\)/)
})

test("bounded source fingerprints run sequentially so a failure leaves no sibling read running", () => {
  assert.match(source, /const fingerprinted: FingerprintedRequest\[\] = \[\]/)
  assert.match(source, /for \(const \[selectionIndex, request\] of requests\.entries\(\)\)/)
  assert.doesNotMatch(source, /Promise\.all\(requests\.map/)
})

test("every bounded source fingerprint receives the operation cancellation signal", () => {
  const calls = [...source.matchAll(/fingerprintSource\([\s\S]*?\}\)/g)].map((match) => match[0])
  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => /signal:\s*context\.cancellation\.signal|signal:\s*cancellation\.signal/.test(call)))
})

test("every PDF in a batch receives the operation deadline rather than a nested timeout", () => {
  assert.match(source, /deadline: context\.deadline/)
  assert.match(source, /signal: context\.cancellation\.signal/)
  assert.doesNotMatch(source, /deadline: request\.pdf\?\.deadline/)
  assert.doesNotMatch(source, /createAbsoluteDeadline\([^)]*\)[\s\S]*extractPdf\(/)
})

test("top-level and PDF cancellation signals are all considered before uniqueness validation", () => {
  assert.match(source, /flatMap\(\(request\) => \[request\.signal, request\.pdf\?\.signal\]\)/)
  assert.match(source, /Rule document batch requests must share one cancellation signal/)
})
