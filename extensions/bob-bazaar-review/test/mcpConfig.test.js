const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

test("configureWorkspaceMcpServer writes the configured Bazaar text encoding", async () => {
  const { configureWorkspaceMcpServer } = require("../out/mcpConfig")
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
})
