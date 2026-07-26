"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  replaceTextFileAtomically
} = require("../out/bazaar/atomicReplaceFile")

test("Bazaar processing reports use the shared gap-free replacement helper", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "bazaar", "bazaarProcessingCoverage.ts"),
    "utf8"
  )
  assert.match(source, /replaceTextFileAtomically/)
  assert.doesNotMatch(source, /backupPath|\.bak/)
  assert.doesNotMatch(source, /rename\(reportPath,/)
})

test("gap-free replacement updates an existing file without backup artifacts", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-atomic-report-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "report.json")
  await fs.writeFile(filePath, "old\n", "utf8")

  await replaceTextFileAtomically(filePath, "new\n")

  assert.equal(await fs.readFile(filePath, "utf8"), "new\n")
  assert.deepEqual((await fs.readdir(directory)).sort(), ["report.json"])
})
