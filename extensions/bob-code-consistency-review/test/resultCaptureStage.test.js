const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const MODULE = require.resolve("../out/webview/consistencyResultCapture")

function loadStage(calls) {
  const originalLoad = Module._load
  delete require.cache[MODULE]
  Module._load = function patched(request, parent, isMain) {
    if (request === "../reviewExecutionCommands") {
      return {
        runCaptureBobOutput: async (options) => { calls.push({ type: "capture", options }); return { status: "ok" } },
        runValidateOutput: async (options) => { calls.push({ type: "validate", options }); return { status: "ok" } }
      }
    }
    if (request === "./consistencyResultCaptureHtml") {
      return { renderConsistencyResultCaptureHtml: () => "<main>capture</main>" }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(MODULE) } finally { Module._load = originalLoad }
}

function hostHarness(options = {}) {
  let root = "/workspace-a"
  const posts = []
  const host = {
    cspSource: "vscode-resource:",
    stage: "review-result-capture",
    isActive: () => true,
    nextRenderToken: () => "token",
    render: () => options.renderResult ?? true,
    post: async (message) => { posts.push(message); return true },
    getWorkspaceRoot: () => root,
    showStage: async () => ({ status: "ok" })
  }
  return { host, posts, switchRoot: (next) => { root = next } }
}

test("result capture fixes the selected workspace at initialization for all three output actions", async () => {
  const calls = []
  const { createConsistencyResultCaptureStage } = loadStage(calls)
  const harness = hostHarness()
  const stage = createConsistencyResultCaptureStage(harness.host)
  assert.deepEqual(await stage.initialize(), { status: "ok" })
  harness.switchRoot("/workspace-b")

  await stage.handleMessage({
    type: "consistencyResultCapture.action",
    action: "captureManual",
    text: "schema_version: 1"
  })
  await stage.handleMessage({ type: "consistencyResultCapture.action", action: "captureClipboard" })
  await stage.handleMessage({ type: "consistencyResultCapture.action", action: "validateOutput" })

  assert.deepEqual(calls, [
    { type: "capture", options: { text: "schema_version: 1", workspaceRoot: "/workspace-a" } },
    { type: "capture", options: { workspaceRoot: "/workspace-a" } },
    { type: "validate", options: { workspaceRoot: "/workspace-a" } }
  ])
})

test("result capture returns a structured error when the selected workspace or render is unavailable", async () => {
  const calls = []
  const { createConsistencyResultCaptureStage } = loadStage(calls)
  const missingRoot = hostHarness()
  missingRoot.host.getWorkspaceRoot = () => undefined
  assert.equal((await createConsistencyResultCaptureStage(missingRoot.host).initialize()).status, "error")

  const rejectedRender = hostHarness({ renderResult: false })
  assert.deepEqual(await createConsistencyResultCaptureStage(rejectedRender.host).initialize(), {
    status: "error",
    errors: ["result capture stage could not be rendered"]
  })
  assert.deepEqual(calls, [])
})
