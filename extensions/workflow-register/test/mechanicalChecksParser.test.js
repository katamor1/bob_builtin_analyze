const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { parseMechanicalCheckOutput } = require("../out/core/mechanicalChecks/parser")

function tempWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mechanical-checks-parser-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function writeFile(root, relativePath, text) {
  const filePath = path.join(root, ...relativePath.split("/"))
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text)
  return filePath
}

test("mechanical check parser keeps regex warning and error counts from process output and evidence", async (t) => {
  const workspaceRoot = tempWorkspace(t)
  const evidencePath = writeFile(workspaceRoot, ".bob/mechanical-checks/runs/run/checks/regex/evidence/build/logs/check.log", [
    "warning W-MC-001",
    "error E-MC-001"
  ].join("\n"))

  const result = await parseMechanicalCheckOutput({
    workspaceRoot,
    parser: {
      type: "regex",
      warningPattern: "warning",
      errorPattern: "error"
    },
    processResult: {
      stdout: "warning W-MC-002",
      stderr: "error E-MC-002",
      timedOut: false
    },
    evidence: [
      {
        absolutePath: evidencePath,
        relativePath: "build/logs/check.log",
        type: "log"
      }
    ]
  })

  assert.equal(result.ok, true, result.reason)
  assert.deepEqual(result.metrics, {
    new_warnings: 2,
    new_errors: 2
  })
  assert.deepEqual(result.findings, [])
})
