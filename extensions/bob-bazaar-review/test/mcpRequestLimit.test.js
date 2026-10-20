const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")
const { test } = require("node:test")
const { extensionRoot } = require("./helpers/sourceReader")

function mcpFrame(message) {
  return Buffer.from(JSON.stringify(message) + "\n", "utf8")
}

function rawMcpFrame(body) {
  return Buffer.concat([body, Buffer.from("\n")])
}

function readMcpMessage(output) {
  return JSON.parse(output.toString("utf8").trim().split("\n")[0])
}

test("MCP stdio reader rejects requests over the configured byte limit", () => {
  const serverPath = path.join(extensionRoot, "out", "mcp", "server.js")
  const request = {
    jsonrpc: "2.0",
    id: 99,
    method: "initialize",
    params: { oversized: "x".repeat(256) }
  }

  const child = spawnSync(process.execPath, [serverPath], {
    input: mcpFrame(request),
    env: {
      ...process.env,
      BOB_BAZAAR_MCP_MAX_REQUEST_BYTES: "64"
    },
    timeout: 5000
  })

  assert.equal(child.status, 0, child.stderr.toString("utf8"))
  const message = readMcpMessage(child.stdout)
  assert.equal(message.id, null)
  assert.equal(message.error.code, -32000)
  assert.match(message.error.message, /Request exceeds maximum 64 bytes/)
})

test("MCP stdio reader returns a JSON-RPC parse error for invalid JSON bodies", () => {
  const serverPath = path.join(extensionRoot, "out", "mcp", "server.js")
  const invalidBody = Buffer.from("{\"jsonrpc\":\"2.0\",", "utf8")
  const child = spawnSync(process.execPath, [serverPath], {
    input: rawMcpFrame(invalidBody),
    timeout: 5000
  })

  assert.equal(child.status, 0, child.stderr.toString("utf8"))
  const message = readMcpMessage(child.stdout)
  assert.equal(message.id, null)
  assert.equal(message.error.code, -32700)
  assert.match(message.error.message, /Parse error:/)
})

test("MCP tools/call validates params before dispatching to tools", () => {
  const serverPath = path.join(extensionRoot, "out", "mcp", "server.js")
  const child = spawnSync(process.execPath, [serverPath], {
    input: mcpFrame({
      jsonrpc: "2.0",
      id: 100,
      method: "tools/call",
      params: { arguments: {} }
    }),
    timeout: 5000
  })

  assert.equal(child.status, 0, child.stderr.toString("utf8"))
  const message = readMcpMessage(child.stdout)
  assert.equal(message.id, 100)
  assert.equal(message.result.isError, true)
  assert.match(message.result.content[0].text, /Missing required tools\/call string parameter: name/)
})
