const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const { spawnSync } = require("node:child_process")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { extensionRoot } = require("./helpers/sourceReader")

function mcpFrame(message) {
  return Buffer.from(JSON.stringify(message) + "\n", "utf8")
}

function readMcpMessage(output) {
  return JSON.parse(output.toString("utf8").trim().split("\n")[0])
}

function runServer(request, env = {}) {
  return spawnSync(process.execPath, [path.join(extensionRoot, "out", "mcp", "server.js")], {
    input: mcpFrame(request),
    env: {
      ...process.env,
      ...env
    },
    timeout: 5000
  })
}

test("MCP write tools are hidden from tools/list by default", () => {
  const child = runServer({
    jsonrpc: "2.0",
    id: 21,
    method: "tools/list"
  })

  assert.equal(child.status, 0, child.stderr.toString("utf8"))
  const message = readMcpMessage(child.stdout)
  const names = message.result.tools.map((tool) => tool.name)
  assert.ok(!names.includes("project_rules_init"))
  assert.ok(names.includes("project_rules_get_context"))
  assert.ok(names.includes("project_rules_get_provenance"))
  for (const name of ["project_rules_get_context", "project_rules_get_provenance"]) {
    const definition = message.result.tools.find((tool) => tool.name === name)
    assert.deepEqual(definition.inputSchema.required, ["cwd"])
    assert.equal(definition.inputSchema.additionalProperties, false)
  }
})

test("MCP approved context and provenance tools are bounded read-only workspace calls", async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-bundle-"))
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))
  const review = path.join(workspaceRoot, ".bob", "review")
  await fs.mkdir(review, { recursive: true })
  await fs.writeFile(path.join(review, "checklist.json"), JSON.stringify({ version: "1", project: "mcp", rules: [] }))
  await fs.writeFile(path.join(review, "review-result.schema.json"), JSON.stringify({ type: "object" }))
  await fs.writeFile(path.join(review, "project-context.md"), "MCP approved context\n")
  await fs.writeFile(path.join(review, "review-prompt-addendum.md"), "MCP approved addendum\n")
  await fs.writeFile(path.join(review, "rule-sources.json"), JSON.stringify({
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "1970-01-01T00:00:00.000Z",
    sources: []
  }))
  await fs.writeFile(path.join(review, "rule-provenance.json"), JSON.stringify({
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: "1970-01-01T00:00:00.000Z",
    rules: [],
    markdown_sections: []
  }))

  const call = (name) => runServer({
    jsonrpc: "2.0",
    id: name,
    method: "tools/call",
    params: { name, arguments: { cwd: workspaceRoot } }
  }, { BOB_BAZAAR_ALLOWED_ROOTS: workspaceRoot })
  const contextMessage = readMcpMessage(call("project_rules_get_context").stdout)
  const context = JSON.parse(contextMessage.result.content[0].text)
  assert.equal(context.projectContext, "MCP approved context\n")
  assert.equal(context.reviewPromptAddendum, "MCP approved addendum\n")
  const provenanceMessage = readMcpMessage(call("project_rules_get_provenance").stdout)
  const provenance = JSON.parse(provenanceMessage.result.content[0].text)
  assert.deepEqual(provenance.provenanceSummary.sources, [])

  await fs.writeFile(path.join(review, "project-context.md"), "x".repeat(256 * 1024 + 1))
  const overflow = readMcpMessage(call("project_rules_get_context").stdout)
  assert.equal(overflow.result.isError, true)
  assert.match(overflow.result.content[0].text, /byte limit/i)
})

test("MCP project_rules_init is disabled by default and does not write files", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-write-disabled-"))
  const child = runServer({
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: {
      name: "project_rules_init",
      arguments: { cwd: workspaceRoot }
    }
  })

  assert.equal(child.status, 0, child.stderr.toString("utf8"))
  const message = readMcpMessage(child.stdout)
  assert.equal(message.result.isError, true)
  assert.match(message.result.content[0].text, /BOB_BAZAAR_ENABLE_WRITE_TOOLS=1/)
  await assert.rejects(fs.stat(path.join(workspaceRoot, ".bob", "review", "checklist.json")))
})

test("MCP project_rules_init is available when write tools are explicitly enabled", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-mcp-write-enabled-"))
  const listChild = runServer(
    {
      jsonrpc: "2.0",
      id: 23,
      method: "tools/list"
    },
    { BOB_BAZAAR_ENABLE_WRITE_TOOLS: "1" }
  )

  assert.equal(listChild.status, 0, listChild.stderr.toString("utf8"))
  const listMessage = readMcpMessage(listChild.stdout)
  assert.ok(listMessage.result.tools.map((tool) => tool.name).includes("project_rules_init"))

  const callChild = runServer(
    {
      jsonrpc: "2.0",
      id: 24,
      method: "tools/call",
      params: {
        name: "project_rules_init",
        arguments: { cwd: workspaceRoot }
      }
    },
    {
      BOB_BAZAAR_ALLOWED_ROOTS: workspaceRoot,
      BOB_BAZAAR_ENABLE_WRITE_TOOLS: "1"
    }
  )

  assert.equal(callChild.status, 0, callChild.stderr.toString("utf8"))
  const callMessage = readMcpMessage(callChild.stdout)
  assert.equal(callMessage.result.isError, undefined)
  await fs.stat(path.join(workspaceRoot, ".bob", "review", "checklist.json"))
})
