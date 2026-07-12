const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { validateReviewRunCommandInput } = require("../out/reviewRuns/reviewRunCoordinator")

test("allows a dot-prefixed child while still rejecting parent traversal", async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-command-root-"))
  const dotPrefixedChild = path.resolve(workspaceRoot, "..project")
  await fs.mkdir(dotPrefixedChild)
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))

  assert.deepEqual(
    await validateReviewRunCommandInput(
      { workspaceRoot: dotPrefixedChild, campaignId: "campaign-1", reviewId: "review-1" },
      [workspaceRoot]
    ),
    { workspaceRoot: dotPrefixedChild, campaignId: "campaign-1", reviewId: "review-1" }
  )
  await assert.rejects(
    () => validateReviewRunCommandInput(
      { workspaceRoot: path.resolve(workspaceRoot, "..", "outside"), campaignId: "campaign-1", reviewId: "review-1" },
      [workspaceRoot]
    ),
    /inside an open workspace folder/
  )
  await assert.rejects(
    () => validateReviewRunCommandInput(
      { workspaceRoot: dotPrefixedChild, campaignId: "campaign\/escape", reviewId: "review-1" },
      [workspaceRoot]
    ),
    /campaignId/
  )
})
