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
