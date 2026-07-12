const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const { validateReviewRunCommandInput } = require("../out/reviewRuns/reviewRunCoordinator")

test("allows a dot-prefixed child while still rejecting parent traversal", () => {
  const workspaceRoot = path.resolve("/workspace")
  const dotPrefixedChild = path.resolve(workspaceRoot, "..project")

  assert.equal(
    validateReviewRunCommandInput(
      { workspaceRoot: dotPrefixedChild, campaignId: "campaign-1", reviewId: "review-1" },
      [workspaceRoot]
    ).workspaceRoot,
    dotPrefixedChild
  )
  assert.throws(
    () => validateReviewRunCommandInput(
      { workspaceRoot: path.resolve(workspaceRoot, "..", "outside"), campaignId: "campaign-1", reviewId: "review-1" },
      [workspaceRoot]
    ),
    /inside an open workspace folder/
  )
})
