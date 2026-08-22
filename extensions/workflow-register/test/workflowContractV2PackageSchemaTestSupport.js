const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const path = require("node:path")

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "workflow-contract-v2", "package-schema")
const VALID = JSON.parse(readFileSync(path.join(FIXTURE_ROOT, "valid-minimal.json"), "utf8"))
const INVALID_CASES = JSON.parse(readFileSync(path.join(FIXTURE_ROOT, "invalid-cases.json"), "utf8"))
const DIGEST = (character) => `sha256:${character.repeat(64)}`

function pointerModule() {
  return require("../out/core/contractV2/packagePointer.js")
}

function lockModule() {
  return require("../out/core/contractV2/workflowLockShape.js")
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function replaceAt(value, pathParts, replacement) {
  let current = value
  for (let index = 0; index < pathParts.length - 1; index += 1) current = current[pathParts[index]]
  current[pathParts.at(-1)] = replacement
  return value
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  assert.equal(Object.isFrozen(value), true)
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen)
}

function validPointerInput() {
  return { workflowId: VALID.workflowId, pointer: clone(VALID.pointer) }
}

function validLock() {
  return clone(VALID.lock)
}

function richProvider(id = "builder") {
  return {
    id,
    requestedVersion: "^1.2.3",
    exactVersion: "1.2.4+build.1",
    contractDigest: DIGEST("4"),
    inputSchema: { id: "schemas/provider-input.json", bytes: 32, digest: DIGEST("5") },
    output: {
      kind: "value",
      schema: { id: "schemas/provider-output.json", bytes: 48, digest: DIGEST("6") }
    },
    errorSchema: { id: "schemas/provider-error.json", bytes: 24, digest: DIGEST("7") },
    sideEffect: "workspace-write",
    idempotency: "key-required",
    requiredCapabilities: ["workflow.effect.workspace-write"]
  }
}

function richLock() {
  const lock = validLock()
  lock.prompts = [{ id: "draft", path: "prompts/draft.md", bytes: 20, digest: DIGEST("8") }]
  lock.schemas = [
    { id: "request", path: "schemas/request.json", bytes: 30, digest: DIGEST("9") },
    { id: "result", path: "schemas/result.json", bytes: 40, digest: DIGEST("a") }
  ]
  lock.providers = [richProvider()]
  lock.bob.requiredCapabilities = ["source.log", "task.sendMessage"]
  lock.bob.taskCapabilities = ["task.sendMessage"]
  return lock
}

function fileEvidence(kind, index) {
  const suffix = index.toString().padStart(3, "0")
  return kind === "prompt"
    ? { id: `p${suffix}`, path: `prompts/p${suffix}.md`, bytes: 1, digest: DIGEST("b") }
    : { id: `s${suffix}`, path: `schemas/s${suffix}.json`, bytes: 1, digest: DIGEST("c") }
}

function providerEvidence(index) {
  return richProvider(`provider-${index.toString().padStart(3, "0")}`)
}

module.exports = {
  INVALID_CASES,
  VALID,
  DIGEST,
  assertDeepFrozen,
  clone,
  fileEvidence,
  lockModule,
  pointerModule,
  providerEvidence,
  replaceAt,
  richLock,
  richProvider,
  validLock,
  validPointerInput
}
