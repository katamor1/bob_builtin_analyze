"use strict"

const assert = require("node:assert/strict")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")
const { extensionRoot } = require("./helpers/sourceReader")

test("provider registry v1 and its deprecated atomic adapter preserve three-argument disposable contracts", () => {
  const tsc = path.join(extensionRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc")
  const result = spawnSync(tsc, ["-p", "test/fixtures/provider-registry-api/tsconfig.json"], {
    cwd: extensionRoot,
    encoding: "utf8"
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
