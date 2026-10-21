const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

test("Electron extension host generates a Node-mode launch rather than opening another editor", async () => {
  const { configureWorkspaceMcpServer } = require("../out/mcp/mcpConfig")
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "electron")
  Object.defineProperty(process.versions, "electron", { value: "40.0.0", configurable: true })
  try {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob mcp 日本語-"))
    const result = await configureWorkspaceMcpServer({
      workspaceFolder: { uri: { fsPath: root } },
      extensionContext: { asAbsolutePath: relative => path.join(root, "extension with spaces", relative) },
      serverName: "bazaar", bzrPath: "bzr"
    })
    const config = JSON.parse(await fs.readFile(result.configPath, "utf8"))
    assert.equal(config.mcpServers.bazaar.env.ELECTRON_RUN_AS_NODE, "1")
    assert.equal(config.mcpServers.bazaar.command, process.execPath)
    assert.deepEqual(config.mcpServers.bazaar.args, [path.join(root, "extension with spaces", "out", "mcp", "server.js")])
  } finally {
    if (descriptor) Object.defineProperty(process.versions, "electron", descriptor)
    else delete process.versions.electron
  }
})

test("configureWorkspaceMcpServer writes the configured Bazaar text encoding", async () => {
  const { configureWorkspaceMcpServer } = require("../out/mcp/mcpConfig")
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-"))
  const result = await configureWorkspaceMcpServer({
    workspaceFolder: { uri: { fsPath: workspaceRoot } },
    extensionContext: { asAbsolutePath: (relativePath) => path.join("C:\\extension", relativePath) },
    serverName: "bazaar",
    bzrPath: "bzr",
    textEncoding: "shift_jis"
  })

  const config = JSON.parse(await fs.readFile(result.configPath, "utf8"))

  assert.equal(config.mcpServers.bazaar.env.BZR_TEXT_ENCODING, "shift_jis")
  assert.equal(config.mcpServers.bazaar.env.BOB_BAZAAR_ALLOWED_ROOTS, workspaceRoot)
})

test("configureWorkspaceMcpServer allows a split Bazaar repository root", async () => {
  const { configureWorkspaceMcpServer } = require("../out/mcp/mcpConfig")
  const bobRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-bob-"))
  const bazaarRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-bzr-"))
  const result = await configureWorkspaceMcpServer({
    workspaceFolder: { uri: { fsPath: bobRoot } },
    extensionContext: { asAbsolutePath: (relativePath) => path.join("C:\\extension", relativePath) },
    serverName: "bazaar",
    bzrPath: "bzr",
    allowedRoots: [bazaarRoot]
  })

  const config = JSON.parse(await fs.readFile(result.configPath, "utf8"))
  const allowedRoots = config.mcpServers.bazaar.env.BOB_BAZAAR_ALLOWED_ROOTS.split(path.delimiter)

  assert.deepEqual(allowedRoots, [bobRoot, bazaarRoot])
})

test("configureWorkspaceMcpServer rejects invalid server names", async () => {
  const { configureWorkspaceMcpServer } = require("../out/mcp/mcpConfig")
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-"))

  await assert.rejects(
    () => configureWorkspaceMcpServer({
      workspaceFolder: { uri: { fsPath: workspaceRoot } },
      extensionContext: { asAbsolutePath: (relativePath) => path.join("C:\\extension", relativePath) },
      serverName: "../bad",
      bzrPath: "bzr"
    }),
    /MCP server name/
  )
})

test("configureWorkspaceMcpServer backs up existing config and writes atomically", async () => {
  const { configureWorkspaceMcpServer } = require("../out/mcp/mcpConfig")
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-"))
  const bobDir = path.join(workspaceRoot, ".bob")
  const configPath = path.join(bobDir, "mcp.json")
  const previousConfig = { mcpServers: { old: { command: "node", args: ["old.js"] } } }
  await fs.mkdir(bobDir, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(previousConfig, null, 2)}\n`, "utf8")

  await configureWorkspaceMcpServer({
    workspaceFolder: { uri: { fsPath: workspaceRoot } },
    extensionContext: { asAbsolutePath: (relativePath) => path.join("C:\\extension", relativePath) },
    serverName: "bazaar",
    bzrPath: "bzr"
  })

  const entries = await fs.readdir(bobDir)
  const backupName = entries.find((entry) => /^mcp\.json\.bak-/.test(entry))
  assert.ok(backupName)
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(bobDir, backupName), "utf8")), previousConfig)
  assert.ok(!entries.some((entry) => entry.endsWith(".tmp")))
})
