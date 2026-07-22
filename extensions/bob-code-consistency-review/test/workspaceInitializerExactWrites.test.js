const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")
const { initializeCodeConsistencyWorkspace } = requireWithVscodeMock("../out/workspaceInitializer")

test("workspace initialization preserves arbitrary existing bytes in both backups", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-consistency-init-exact-"))
  const workflowPath = path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  const reviewInputPath = path.join(workspaceRoot, "review-input.yaml")
  const previousWorkflow = Buffer.from([0x70, 0x72, 0x65, 0x76, 0x0a, 0x82, 0xa0, 0x81, 0x40, 0xff, 0x00])
  const existingReviewInputBefore = Buffer.from([0x72, 0x65, 0x76, 0x69, 0x65, 0x77, 0x3a, 0x0a, 0x82, 0xa2, 0x81, 0x40, 0xfe])
  await fs.mkdir(path.dirname(workflowPath), { recursive: true })
  await fs.writeFile(workflowPath, previousWorkflow)
  await fs.writeFile(reviewInputPath, existingReviewInputBefore)

  const result = await initializeCodeConsistencyWorkspace({
    context: { asAbsolutePath: (relativePath) => path.join(extensionRoot, relativePath) },
    workspaceRoot
  })

  const bundledWorkflow = await fs.readFile(
    path.join(extensionRoot, "templates", ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  )
  const existingReviewInputAfter = await fs.readFile(reviewInputPath)
  assert.deepEqual(existingReviewInputAfter, existingReviewInputBefore)
  assert.deepEqual(await fs.readFile(workflowPath), bundledWorkflow)
  assert.ok(result.backupPath)
  assert.ok(result.reviewInputBackupPath)
  assert.deepEqual(await fs.readFile(result.backupPath), previousWorkflow)
  assert.deepEqual(await fs.readFile(result.reviewInputBackupPath), existingReviewInputBefore)
  assert.match(result.message, /review-input\.yaml.*上書きせず/)
})

test("workspace initialization returns distinct workflow and review-input outcomes", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-consistency-init-outcomes-"))
  const workflowPath = path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  const reviewInputPath = path.join(workspaceRoot, "review-input.yaml")
  await fs.mkdir(path.dirname(workflowPath), { recursive: true })
  await fs.writeFile(workflowPath, "previous workflow\n", "utf8")
  await fs.writeFile(reviewInputPath, "review:\n  id: existing-project-review\n", "utf8")

  const result = await initializeCodeConsistencyWorkspace({
    context: { asAbsolutePath: (relativePath) => path.join(extensionRoot, relativePath) },
    workspaceRoot
  })

  assert.equal(result.status, "updated")
  assert.deepEqual(result.workflowResult, {
    status: "updated",
    path: workflowPath,
    backupPath: result.backupPath,
    message: `コード整合プレレビュー workflow を更新しました: ${workflowPath}`
  })
  assert.deepEqual(result.reviewInputResult, {
    status: "unchanged",
    path: reviewInputPath,
    backupPath: result.reviewInputBackupPath,
    message: `既存の review-input.yaml を検出したため上書きせず、バックアップだけ作成しました: ${result.reviewInputBackupPath}`
  })
})

function requireWithVscodeMock(modulePath) {
  const originalLoad = Module._load
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") return {}
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(modulePath) } finally { Module._load = originalLoad }
}
