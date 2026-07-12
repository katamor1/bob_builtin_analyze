const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const {
  reviewRunDirectory,
  reviewRunJsonPath,
  reviewRunPacketPath,
  validateReviewRunSegment
} = require("../out/reviewRuns/reviewRunPaths")

test("review run paths stay under the campaign record directory", () => {
  const root = path.resolve("C:/workspace")
  const directory = path.join(root, ".bob-review-records", "campaigns", "campaign-1", "records", "review-1")
  assert.equal(reviewRunDirectory(root, "campaign-1", "review-1"), directory)
  assert.equal(reviewRunJsonPath(root, "campaign-1", "review-1"), path.join(directory, "review-run.json"))
  assert.equal(reviewRunPacketPath(root, "campaign-1", "review-1"), path.join(directory, "review-packet.md"))
})

test("review run path segments reject traversal and unsafe Windows names", () => {
  for (const value of [
    "",
    ".",
    "..",
    "../escape",
    "a/b",
    "a\\b",
    "a:b",
    "a?b",
    "a*b",
    "a|b",
    "a<b",
    "a>b",
    "a\"b",
    "CON",
    "con.txt",
    "name.",
    "name ",
    "a\u0000b"
  ]) {
    assert.throws(() => validateReviewRunSegment(value, "reviewId"), /reviewId/)
  }
})

test("review run path segments accept stable identifiers", () => {
  assert.equal(validateReviewRunSegment("phase1-bazaar-review-uat-001", "campaignId"), "phase1-bazaar-review-uat-001")
  assert.equal(validateReviewRunSegment("bazaar-r125-project-rule-review", "reviewId"), "bazaar-r125-project-rule-review")
})
