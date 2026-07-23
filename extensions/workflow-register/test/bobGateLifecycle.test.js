const Module = require("node:module")
const path = require("node:path")

// This legacy lifecycle suite predates F7 and intentionally models only the Bob
// methods used by each lifecycle scenario. Keep those tests isolated from the
// F7 capability contract rather than mutating their task fixtures. The dedicated
// Bob profile and factory suites execute the real probe, including missing-method
// rejection and original task-identity preservation.
const bobProfilePath = require.resolve("../out/core/contractV2/bobProfile.js")
const legacySuitePath = path.join(__dirname, "bobGateLifecycleLegacyCases.js")
const originalLoad = Module._load

Module._load = function isolatedLifecycleLoad(request, parent, isMain) {
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
      return Object.freeze({
        ok: true,
        profileDigest: realProfile.BOB_2_0_1_PROFILE_DIGEST,
        taskCapabilities: input.requiredCapabilities ?? realProfile.BOB_2_0_1_TASK_CAPABILITIES
      })
    }
  }
}

try {
  require(legacySuitePath)
} finally {
  Module._load = originalLoad
}
