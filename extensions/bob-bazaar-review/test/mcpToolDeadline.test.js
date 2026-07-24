"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { BazaarClient } = require("../out/bazaar/bazaar")
const { createMcpToolRegistry } = require("../out/mcp/tools")

test("MCP Bazaar tools create a fresh operation-scoped client for every call", async (t) => {
  const originalRoot = BazaarClient.prototype.root
  const clients = []
  BazaarClient.prototype.root = async function root(cwd) {
    clients.push(this)
    return cwd
  }
  t.after(() => { BazaarClient.prototype.root = originalRoot })

  const registry = createMcpToolRegistry({
    env: {
      BZR_PATH: "bzr",
      BZR_MAX_BUFFER: "1024",
      BZR_TEXT_ENCODING: "utf8"
    },
    requiredAllowedCwd: async () => "/workspace/repository"
  })

  await registry.callTool("bazaar_root", { cwd: "/workspace/repository" })
  await registry.callTool("bazaar_root", { cwd: "/workspace/repository" })

  assert.equal(clients.length, 2)
  assert.notEqual(clients[0], clients[1], "a long-lived MCP registry must not retain an expired BazaarClient deadline")
})
