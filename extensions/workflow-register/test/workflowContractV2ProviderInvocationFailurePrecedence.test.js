const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

function ordered(...parts) {
  return new RegExp(parts.map(escapeRegex).join("[\\s\\S]*"))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

test("provider error handling drains started staging writes before validating the provider error", () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    "..",
    "src",
    "core",
    "contractV2",
    "providerInvocation.ts"
  ), "utf8")

  assert.match(source, ordered(
    "} catch (error) {",
    "effectSession.close()",
    "await promiseAll(pendingWrites)",
    "if (isInstance(WorkflowAttemptStagingError, error))",
    "const errorLocation"
  ))
})
