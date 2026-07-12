const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function validReviewResult(reviewId) {
  return {
    review_id: reviewId,
    vcs: {
      type: "bazaar",
      repository: "test-repo",
      revision_mode: "singleRevision",
      revision: "2"
    },
    checklist_results: [
      {
        rule_id: "RULE-001",
        title: "Rule one",
        status: "pass",
        severity: "info",
        confidence: "medium",
        evidence: [{ file: "src/main.c", summary: "Reviewed the changed function." }],
        reason: "No issue was found."
      }
    ],
    findings: [],
    summary: {
      pass: 1,
      fail: 0,
      unknown: 0,
      not_applicable: 0,
      blocked: 0
    }
  }
}

test("rejects a mismatched expected review id before artifacts are saved", async () => {
  const { captureReviewResultText } = require("../out/projectRules/resultCaptureCore")
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-expected-review-id-"))

  const result = await captureReviewResultText(
    workspaceRoot,
    JSON.stringify(validReviewResult("other-review")),
    "command argument",
    { expectedReviewId: "review-1" }
  )

  assert.equal(result.status, "error")
  assert.equal(result.valid, false)
  assert.match(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"), /\$\.review_id: expected review-1, got other-review/)
  assert.equal(result.jsonPath, undefined)
  await assert.rejects(() => fs.access(path.join(workspaceRoot, ".bob", "review", "results", "other-review.json")))
})

test("saves artifacts when the expected review id matches", async () => {
  const { captureReviewResultText } = require("../out/projectRules/resultCaptureCore")
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-expected-review-id-match-"))

  const result = await captureReviewResultText(
    workspaceRoot,
    JSON.stringify(validReviewResult("review-1")),
    "command argument",
    { expectedReviewId: "review-1" }
  )

  assert.equal(result.status, "ok")
  assert.equal(result.reviewId, "review-1")
  assert.match(result.jsonPath, /review-1\.json$/)
})
