"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const packageRoot = path.resolve(__dirname, "..")
const script = path.join(packageRoot, "scripts", "copy-extension-runtime.js")

test("extension copy emits a flat compiled runtime payload", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "processing-runtime-copy-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const result = childProcess.spawnSync(process.execPath, [script, "out/shared-processing-budget-runtime"], {
    cwd: directory,
    encoding: "utf8"
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const files = fs.readdirSync(path.join(directory, "out", "shared-processing-budget-runtime")).sort()
  assert.ok(files.includes("index.js"))
  assert.ok(files.includes("bounded-document-runtime.js"))
  assert.equal(files.some((name) => name.endsWith(".ts") && !name.endsWith(".d.ts")), false)
})

test("extension copy rejects an output escape", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "processing-runtime-escape-"))
  try {
    const result = childProcess.spawnSync(process.execPath, [script, "../escape"], { cwd: directory, encoding: "utf8" })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /destination|out\/shared-processing-budget-runtime/i)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
