const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

test("refreshTemplateFile backs up an existing different file before overwriting", async () => {
  const { refreshTemplateFile } = require("../out/templateRefresh")
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-template-refresh-"))
  const source = path.join(root, "source", "WORKFLOW.md")
  const target = path.join(root, "workspace", ".bob", "workflows", "review", "WORKFLOW.md")
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(source, "template workflow\n", "utf8")
  await fs.writeFile(target, "custom workflow\n", "utf8")

  const result = await refreshTemplateFile(source, target)

  assert.equal(result.refreshed, true)
  assert.ok(result.backupPath)
  assert.equal(await fs.readFile(target, "utf8"), "template workflow\n")
  assert.equal(await fs.readFile(result.backupPath, "utf8"), "custom workflow\n")
})

test("refreshTemplateFile skips identical files without creating backups", async () => {
  const { refreshTemplateFile } = require("../out/templateRefresh")
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-template-refresh-same-"))
  const source = path.join(root, "source", "WORKFLOW.md")
  const target = path.join(root, "workspace", ".bob", "workflows", "review", "WORKFLOW.md")
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(source, "template workflow\n", "utf8")
  await fs.writeFile(target, "template workflow\n", "utf8")

  const result = await refreshTemplateFile(source, target)
  const entries = await fs.readdir(path.dirname(target))

  assert.equal(result.refreshed, false)
  assert.equal(result.backupPath, undefined)
  assert.deepEqual(entries, ["WORKFLOW.md"])
})
