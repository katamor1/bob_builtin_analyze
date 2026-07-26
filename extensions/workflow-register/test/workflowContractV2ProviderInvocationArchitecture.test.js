const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const sourceRoot = path.join(__dirname, "..", "src", "core", "contractV2")

function source(name) {
  return fs.readFileSync(path.join(sourceRoot, name), "utf8")
}

test("the bound provider dispatch bridge is owned only by provider invocation and is not barrel-exported", () => {
  const registry = source("providerRegistry.ts")
  const invocation = source("providerInvocation.ts")
  const barrel = source("index.ts")
  const bridge = "invokeBoundWorkflowProviderDispatch"

  assert.match(registry, new RegExp(`export function ${bridge}\\(`))
  assert.match(invocation, new RegExp(`import \\{[\\s\\S]*${bridge}[\\s\\S]*\\} from \\"\\./providerRegistry\\"`))
  assert.match(invocation, new RegExp(`${bridge}\\(`))
  assert.doesNotMatch(barrel, new RegExp(bridge))

  const importers = fs.readdirSync(sourceRoot)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => name !== "providerInvocation.ts" && name !== "providerRegistry.ts")
    .filter((name) => source(name).includes(bridge))
  assert.deepEqual(importers, [])
})

test("the dispatch bridge performs one captured call and owns no validation retry artifact or state behavior", () => {
  const registry = source("providerRegistry.ts")
  const start = registry.indexOf("export function invokeBoundWorkflowProviderDispatch")
  const end = registry.indexOf("\nexport ", start + 1)
  const body = registry.slice(start, end < 0 ? registry.length : end)

  assert.match(body, /weakMapGet\(handleDispatches/)
  assert.match(body, /reflectApply\(dispatch, undefined, \[input\]\)/)
  assert.doesNotMatch(body, /catch|retry|diagnostic|schema|artifact|commit|runState|JSON/)
})
