const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("audited Bob source remains typed across runAttempt without a cast", () => {
  const source = readSourceSet(["workflowRegistrationService.ts"])
  assert.match(source, /let source: BobSourceLike \| undefined/)
  assert.match(source, /source = api\.registerSource\(sourceId, sourceName\)/)
  assert.doesNotMatch(source, /const source = sourceResult\.value/)
  assert.doesNotMatch(source, /sourceResult\.value as BobSourceLike/)
})
