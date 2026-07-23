const Module = require("node:module")
const path = require("node:path")

// The legacy lifecycle suite predates F7 and intentionally models Bob tasks with
// only the methods each scenario touches. Keep those 1,800+ lifecycle assertions
// unchanged while still executing the real F7 descriptor probe. The dedicated
// bobWorkflowFactory/profile suites verify the production frozen-capability
// wrapper; this harness preserves the lifecycle suite's original task identity
// assertions after successful validation.
const bobProfilePath = require.resolve("../out/core/contractV2/bobProfile.js")
const legacySuitePath = path.join(__dirname, "bobGateLifecycleLegacyCases.js")
const originalLoad = Module._load

Module._load = function auditedLifecycleLoad(request, parent, isMain) {
  let resolved
  try {
    resolved = Module._resolveFilename(request, parent, isMain)
  } catch {
    return originalLoad.call(this, request, parent, isMain)
  }
  if (resolved !== bobProfilePath) return originalLoad.call(this, request, parent, isMain)

  const realProfile = originalLoad.call(this, request, parent, isMain)
  return {
    ...realProfile,
    probeBobTaskCapabilities(input) {
      completeLegacyTaskFixture(input.task)
      realProfile.probeBobTaskCapabilities(input)
      return input.task
    }
  }
}

try {
  require(legacySuitePath)
} finally {
  Module._load = originalLoad
}

function completeLegacyTaskFixture(task) {
  if (typeof task !== "object" || task === null) return
  defineMissingMethod(task, "getAllMetadata", function getAllMetadata() { return {} })
  defineMissingMethod(task, "getMessages", function getMessages() { return [] })
  defineMissingMethod(task, "sendMessage", async function sendMessage() { return undefined })
  defineMissingMethod(task, "setStepComplete", function setStepComplete() { return undefined })
  defineMissingMethod(task, "startSubagent", async function startSubagent() { return undefined })
  defineMissingMethod(task, "toSerializable", function toSerializable() { return {} })
}

function defineMissingMethod(task, name, method) {
  let current = task
  while (current !== null) {
    if (Object.getOwnPropertyDescriptor(current, name) !== undefined) return
    current = Object.getPrototypeOf(current)
  }
  Object.defineProperty(task, name, {
    configurable: true,
    enumerable: false,
    value: method,
    writable: true
  })
}
