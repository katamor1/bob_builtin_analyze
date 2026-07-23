const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  MemoryPackageFileSystem,
  installStaging,
  rootSubject,
  subject
} = require("./workflowContractV2PackageLoaderTestSupport")

test("owned staging requires the exact sibling owner token and excludes control metadata", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const staging = installStaging(fileSystem)
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const { loadWorkflowPackageCandidate } = subject()

  await assert.rejects(() => loadWorkflowPackageCandidate({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    candidate: { kind: "owned-staging", name: staging.name, ownershipToken: "wrong" }
  }), /ownership|token/i)

  const loaded = await loadWorkflowPackageCandidate({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    candidate: { kind: "owned-staging", name: staging.name, ownershipToken: staging.token }
  })
  assert.equal(loaded.publication, "staging")
  assert.equal(loaded.packageDigest, staging.digest)
  assert.equal(loaded.files.some((file) => file.path === "owner.json"), false)
  assert.equal("lease" in loaded, false)
  assert.equal("model" in loaded, false)
})

test("staging candidate rejects malformed names, missing owner records, and accessor tokens without invocation", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const staging = installStaging(fileSystem)
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const load = subject().loadWorkflowPackageCandidate

  await assert.rejects(() => load({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    candidate: { kind: "owned-staging", name: "../escape", ownershipToken: staging.token }
  }), /staging|name/i)

  fileSystem.remove([...staging.base, "owner.json"])
  await assert.rejects(() => load({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    candidate: { kind: "owned-staging", name: staging.name, ownershipToken: staging.token }
  }), /owner/i)

  let getterCalls = 0
  const candidate = { kind: "owned-staging", name: staging.name }
  Object.defineProperty(candidate, "ownershipToken", {
    enumerable: true,
    get() {
      getterCalls += 1
      return staging.token
    }
  })
  await assert.rejects(() => load({ fileSystem, collectionRoot: root, workflowId: "minimal", candidate }), TypeError)
  assert.equal(getterCalls, 0)
})

test("owned staging revalidates the owner token after the package snapshot", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const staging = installStaging(fileSystem)
  const ownerPath = [...staging.base, "owner.json"]
  let replaced = false
  fileSystem.hooks.beforeReadFile = (segments, fs) => {
    if (!replaced && segments.includes("package")) {
      replaced = true
      fs.mutate(ownerPath, Buffer.from(JSON.stringify({
        schemaVersion: "workflow-package-staging-owner/v1",
        ownershipToken: "replacement-owner"
      })))
    }
  }
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})

  await assert.rejects(() => subject().loadWorkflowPackageCandidate({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    candidate: { kind: "owned-staging", name: staging.name, ownershipToken: staging.token }
  }), /ownership|owner.*changed|authorization/i)
})

test("staging owner rejects duplicate JSON object keys", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const staging = installStaging(fileSystem)
  fileSystem.mutate([...staging.base, "owner.json"], Buffer.from([
    "{",
    '"schemaVersion":"workflow-package-staging-owner/v1",',
    `"ownershipToken":"${staging.token}",`,
    `"\\u006fwnershipToken":"${staging.token}"`,
    "}"
  ].join("")))
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})

  await assert.rejects(() => subject().loadWorkflowPackageCandidate({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    candidate: {
      kind: "owned-staging",
      name: staging.name,
      ownershipToken: staging.token
    }
  }), /duplicate.*key|duplicate.*property/i)
})
