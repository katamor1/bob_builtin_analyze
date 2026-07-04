const assert = require("node:assert/strict")
const test = require("node:test")

const { BazaarClient } = require("../out/bazaar")

test("BazaarClient.cat separates option parsing before relative file paths", async () => {
  const client = new BazaarClient({ bzrPath: "bzr" })
  let captured
  client.exec = async (cwd, args) => {
    captured = { cwd, args }
    return { stdout: Buffer.from("content"), stderr: Buffer.alloc(0) }
  }

  await client.cat("C:\\repo", "123", "--help")

  assert.deepEqual(captured, {
    cwd: "C:\\repo",
    args: ["--no-aliases", "cat", "-r", "123", "--", "--help"]
  })
})
