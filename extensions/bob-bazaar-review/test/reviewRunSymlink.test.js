const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { startReviewRun } = require("../out/reviewRuns/reviewRunCoordinator")

test("rejects a Review Run campaign path that traverses a symlink", async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-workspace-"))
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-outside-"))
  const campaignsRoot = path.join(workspaceRoot, ".bob-review-records", "campaigns")
  await fs.mkdir(campaignsRoot, { recursive: true })

  const linkPath = path.join(campaignsRoot, "campaign-1")
  try {
    await fs.symlink(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (error && (error.code === "EPERM" || error.code === "EACCES")) {
      t.skip(`symlink creation is unavailable: ${error.code}`)
      return
    }
    throw error
  }

  await assert.rejects(
    () => startReviewRun({
      workspaceRoot,
      campaignId: "campaign-1",
      reviewId: "review-1",
      target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" }
    }),
    /symbolic link|outside Review Run workspace/
  )
  await assert.rejects(() => fs.access(path.join(outsideRoot, "records", "review-1", "review-run.json")))
})
