const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { getCodeConsistencyWorkspaceInitializationStatus } = requireWithVscodeMock("../out/workspaceInitializer")

test("getCodeConsistencyWorkspaceInitializationStatus reports the canonical workflow file state without mutating the workspace", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-workspace-status-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const missing = await getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot)
  assert.equal(missing.initialized, false)
  assert.equal(missing.workflowPath, path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md"))
  assert.deepEqual(missing.missing, [".bob/workflows/code-consistency-review/WORKFLOW.md"])
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".bob")), false, "status lookup must not initialize the workspace")

  fs.mkdirSync(missing.workflowPath, { recursive: true })
  const directory = await getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot)
  assert.equal(directory.initialized, false, "a directory at the canonical file path is not initialized")

  fs.rmSync(missing.workflowPath, { recursive: true })
  fs.writeFileSync(missing.workflowPath, "# workflow\n", "utf8")
  const present = await getCodeConsistencyWorkspaceInitializationStatus(workspaceRoot)
  assert.equal(present.initialized, true)
  assert.deepEqual(present.missing, [])
})

function requireWithVscodeMock(modulePath) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return {}
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}
