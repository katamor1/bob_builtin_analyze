const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")

test("command argument capture path returns without awaiting presentation UI", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "projectRules", "resultCapture.ts"), "utf8")

  assert.match(source, /const explicitInput = typeof inputText === "string" && inputText\.trim\(\)\.length > 0/)
  assert.match(source, /if \(!explicitInput\) await presentCaptureResult\(result\)/)
})
