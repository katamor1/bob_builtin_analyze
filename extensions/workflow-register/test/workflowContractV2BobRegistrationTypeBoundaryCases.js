const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

function registrationSource() {
  return readSourceSet(["workflowRegistrationService.ts"])
}

test("audited Bob source remains typed across runAttempt without a cast", () => {
  const source = registrationSource()
  assert.match(source, /let source: BobSourceLike \| undefined/)
  assert.match(source, /source = api\.registerSource\(sourceId, sourceName\)/)
  assert.match(source, /const auditedSource = source/)
  assert.match(source, /auditedSource\.registerWorkflow/)
  assert.match(source, /registeredSource: auditedSource/)
  assert.doesNotMatch(source, /const source = sourceResult\.value/)
  assert.doesNotMatch(source, /sourceResult\.value as BobSourceLike/)
})

test("incompatible Bob and failed source creation clear stale source, ids, and context", () => {
  const source = registrationSource()
  const incompatibleStart = source.indexOf("if (!api) {")
  const incompatibleEnd = source.indexOf("\n  }\n\n  await deactivateRegisteredSource", incompatibleStart)
  assert.notEqual(incompatibleStart, -1)
  assert.notEqual(incompatibleEnd, -1)
  const incompatibleBlock = source.slice(incompatibleStart, incompatibleEnd)
  assert.match(incompatibleBlock, /await deactivateRegisteredSource\(input\.previousSource, lines\)/)
  assert.match(incompatibleBlock, /"setContext", "bob-code\.hasWorkflows", false/)
  assert.match(incompatibleBlock, /registeredSource: undefined/)
  assert.match(incompatibleBlock, /registeredIds: new Set\(\)/)
  assert.match(incompatibleBlock, /sourceChanged: true/)
  assert.match(incompatibleBlock, /idsChanged: true/)

  const missingStart = source.indexOf("if (!source) {")
  const auditedStart = source.indexOf("const auditedSource = source", missingStart)
  assert.notEqual(missingStart, -1)
  assert.notEqual(auditedStart, -1)
  const missingBlock = source.slice(missingStart, auditedStart)
  assert.match(missingBlock, /"setContext", "bob-code\.hasWorkflows", false/)
  assert.match(missingBlock, /registeredSource: undefined/)
  assert.match(missingBlock, /registeredIds: new Set\(\)/)
  assert.match(missingBlock, /sourceChanged: true/)
  assert.match(missingBlock, /idsChanged: true/)
})
