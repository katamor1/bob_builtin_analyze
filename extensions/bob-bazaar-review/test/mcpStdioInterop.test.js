const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")
const { test } = require("node:test")
const { McpStdioReader } = require("../out/mcp/jsonRpc")

test("standard newline JSON client initializes and lists tools without response framing headers", () => {
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "interop", version: "1" }
    } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" }
  ]
  const child = spawnSync(process.execPath, [path.join(__dirname, "../out/mcp/server.js")], {
    input: messages.map(message => JSON.stringify(message)).join("\n") + "\n",
    timeout: 5000
  })
  assert.equal(child.status, 0, child.stderr.toString())
  const lines = child.stdout.toString("utf8").trim().split("\n")
  assert.equal(lines.length, 2, "initialize and tools/list must each produce one response")
  const replies = lines.map(line => JSON.parse(line))
  assert.deepEqual(replies.map(message => message.id), [1, 2])
  assert.equal(replies[0].result.serverInfo.name, "bob-bazaar-review")
  assert.ok(replies[1].result.tools.some(tool => tool.name === "bazaar_status"))
  assert.ok(!replies[1].result.tools.some(tool => tool.name === "project_rules_save_review_result"))
})

test("stdio reader preserves split UTF-8, CRLF and multiple messages in one chunk", () => {
  const messages = []
  const errors = []
  const reader = new McpStdioReader(message => messages.push(message), 512, (...error) => errors.push(error))
  const data = Buffer.from('{"jsonrpc":"2.0","id":1,"method":"日本語"}\r\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n')
  const split = data.indexOf(Buffer.from("日")) + 1
  reader.push(data.subarray(0, split))
  assert.equal(messages.length, 0)
  reader.push(data.subarray(split))
  assert.deepEqual(messages.map(message => [message.id, message.method]), [[1, "日本語"], [2, "tools/list"]])
  assert.deepEqual(errors, [])
})

test("stdio reader rejects an oversized unterminated line once and recovers at the next newline", () => {
  const messages = []
  const errors = []
  const reader = new McpStdioReader(message => messages.push(message), 64, (...error) => errors.push(error))
  reader.push(Buffer.from("x".repeat(80)))
  reader.push(Buffer.from("x".repeat(2048)))
  reader.push(Buffer.from('\n{"jsonrpc":"2.0","id":7,"method":"tools/list"}\n'))
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], -32000)
  assert.deepEqual(messages.map(message => message.id), [7])
})

test("stdio reader reports malformed JSON and continues with the next message", () => {
  const messages = []
  const errors = []
  const reader = new McpStdioReader(message => messages.push(message), 128, (...error) => errors.push(error))
  reader.push(Buffer.from('not json\n{"jsonrpc":"2.0","id":8,"method":"tools/list"}\n'))
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], -32700)
  assert.deepEqual(messages.map(message => message.id), [8])
})
