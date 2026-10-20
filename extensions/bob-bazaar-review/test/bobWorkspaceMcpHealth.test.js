const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const extensionRoot = path.resolve(__dirname, "..")

function workspaceModule() {
  const modulePath = require.resolve("../out/workspace/bobWorkspaceInit")
  delete require.cache[modulePath]
  const original = Module._load
  Module._load = function(request, parent, isMain) {
    return request === "vscode" ? {} : original.call(this, request, parent, isMain)
  }
  try { return require(modulePath) } finally { Module._load = original }
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-health-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.cp(path.join(extensionRoot, "templates/.bob"), path.join(root, ".bob"), { recursive: true })
  const configPath = path.join(root, ".bob/mcp.json")
  const server = { command: process.execPath, args: [path.join(extensionRoot, "out/mcp/server.js")],
    env: { BOB_BAZAAR_ALLOWED_ROOTS: root } }
  async function configure(value = server) {
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: { bazaar: value } }))
  }
  await configure()
  return { root, server, configure, folder: { uri: { fsPath: root } } }
}

test("workspace readiness rejects old MCP settings with only BZR env despite server-name presence", async t => {
  const { getBobWorkspaceStatus } = workspaceModule()
  const f = await fixture(t)
  await f.configure({ ...f.server, env: { BZR_PATH: "bzr" } })
  const status = await getBobWorkspaceStatus(f.folder)
  assert.equal(status.initialized, false)
  assert.ok(status.missing.some(item => item.includes("allowed-roots")), JSON.stringify(status))
})

test("workspace readiness reports missing executable, server script, and disallowed workspace", async t => {
  const { getBobWorkspaceStatus } = workspaceModule()
  const f = await fixture(t)
  for (const [change, reason] of [
    [{ command: path.join(f.root, "missing.exe") }, "command"],
    [{ args: [path.join(f.root, "missing.js")] }, "server-script"],
    [{ env: { BOB_BAZAAR_ALLOWED_ROOTS: path.join(f.root, "other") } }, "workspace-not-allowed"]
  ]) {
    await f.configure({ ...f.server, ...change })
    const status = await getBobWorkspaceStatus(f.folder)
    assert.equal(status.initialized, false)
    assert.ok(status.missing.some(item => item.includes(reason)), JSON.stringify(status))
  }
})

test("workspace readiness requires Node-mode env for Electron executables but accepts a valid Node configuration", async t => {
  const { getBobWorkspaceStatus } = workspaceModule()
  const f = await fixture(t)
  const fakeElectron = path.join(f.root, "IBM Bob.exe")
  await fs.writeFile(fakeElectron, "test executable placeholder")
  await f.configure({ ...f.server, command: fakeElectron })
  const invalid = await getBobWorkspaceStatus(f.folder)
  assert.equal(invalid.initialized, false)
  assert.ok(invalid.missing.some(item => item.includes("electron-node-mode")))
  await f.configure()
  assert.equal((await getBobWorkspaceStatus(f.folder)).initialized, true)
})

test("workspace readiness detects a legacy agent maxResultBytes even with current title and workspaceRequired", async t => {
  const { getBobWorkspaceStatus } = workspaceModule()
  const f = await fixture(t)
  const file = path.join(f.root, ".bob/workflows/bazaar-project-rule-review/WORKFLOW.md")
  const text = await fs.readFile(file, "utf8")
  await fs.writeFile(file, text.replace("    resultKey: reviewAnalysis", "    resultKey: reviewAnalysis\n    maxResultBytes: 20000"))
  const status = await getBobWorkspaceStatus(f.folder)
  assert.equal(status.initialized, false)
  assert.ok(status.missing.some(item => item.includes("agent-result-limit")))
})

test("workspace readiness does not accept a surviving old server script after env-only repair", async t => {
  const { getBobWorkspaceStatus } = workspaceModule()
  const f = await fixture(t)
  const oldServer = path.join(f.root, "local.bob-bazaar-review-0.3.0/out/mcp/server.js")
  await fs.mkdir(path.dirname(oldServer), { recursive: true })
  await fs.writeFile(oldServer, "old transport implementation")
  await f.configure({ ...f.server, args: [oldServer] })
  const status = await getBobWorkspaceStatus(f.folder)
  assert.equal(status.initialized, false)
  assert.ok(status.missing.some(item => item.includes("server-script-outdated")))
})

test("workspace readiness accepts a junction workspace allowed by its actual root", async t => {
  const { getBobWorkspaceStatus } = workspaceModule()
  const f = await fixture(t)
  const alias = f.root + "-junction"
  await fs.symlink(f.root, alias, "junction")
  t.after(() => fs.unlink(alias))
  const status = await getBobWorkspaceStatus({ uri: { fsPath: alias } })
  assert.equal(status.initialized, true, JSON.stringify(status.missing))
})
