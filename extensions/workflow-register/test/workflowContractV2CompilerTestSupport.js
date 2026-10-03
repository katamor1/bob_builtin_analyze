const fs = require("node:fs")
const path = require("node:path")

const FIXTURE = JSON.parse(fs.readFileSync(path.join(
  __dirname,
  "fixtures",
  "workflow-contract-v2",
  "compiler",
  "valid-source",
  "files.json"
), "utf8"))

const {
  rawPackageFromFiles
} = require("./workflowContractV2LockTestSupport")

function workflowYamlText(document) {
  return require("js-yaml").dump(document, { noRefs: true, lineWidth: -1 })
}

function sourceFiles(overrides = {}) {
  const result = {}
  for (const [logicalPath, text] of Object.entries({ ...FIXTURE, ...overrides })) {
    result[logicalPath] = Buffer.isBuffer(text)
      ? Buffer.from(text)
      : Buffer.from(text, "utf8")
  }
  return result
}

function emptyBobBinding() {
  return {
    profile: "bob/2.0.1",
    requiredCapabilities: [],
    taskCapabilities: []
  }
}

function createLockedRawPackage(overrides = {}) {
  const files = sourceFiles(overrides)
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const initial = rawPackageFromFiles(files)
  const lock = lockModule.generateWorkflowPackageLock({
    rawPackage: initial,
    providers: [],
    bob: emptyBobBinding()
  })
  files["workflow.lock.json"] = lockModule.encodeWorkflowPackageLock(lock)
  return {
    files,
    lock,
    rawPackage: rawPackageFromFiles(files)
  }
}

function createEmptyProviderCatalog() {
  const { WorkflowProviderRegistry } = require("../out/core/contractV2/providerRegistry.js")
  return new WorkflowProviderRegistry().snapshot()
}

function createBobProfile() {
  const { snapshotBobContractProfile } = require("../out/core/contractV2/bobProfile.js")
  return snapshotBobContractProfile({ registerSource() {} })
}

function compilerSubject() {
  return require("../out/core/contractV2/index.js")
}

function canonicalDigest(value) {
  return require("../out/core/contractV2/canonicalJson.js").canonicalJsonDigest(value)
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  if (!Object.isFrozen(value)) throw new Error("expected deeply frozen compiler evidence")
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen)
}

function assertNoNodeValues(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  if (Buffer.isBuffer(value)) throw new Error("public plan contains a Buffer")
  if (value instanceof Uint8Array) throw new Error("public plan contains a typed byte array")
  for (const key of Reflect.ownKeys(value)) assertNoNodeValues(value[key], seen)
}

module.exports = {
  assertDeepFrozen,
  assertNoNodeValues,
  canonicalDigest,
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage,
  emptyBobBinding,
  sourceFiles,
  workflowYamlText
}
