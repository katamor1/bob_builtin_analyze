const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  MemoryPackageFileSystem,
  fixtureBytes,
  installPublished,
  installStaging,
  rootSubject,
  subject
} = require("./workflowContractV2PackageLoaderTestSupport")

test("current pointer and explicit generation load the same detached raw package evidence", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  const { createWorkflowPackageRoot } = rootSubject()
  const root = createWorkflowPackageRoot(fileSystem, { opaque: true })
  const { loadCurrentWorkflowPackage, loadWorkflowPackageGeneration, WORKFLOW_PACKAGE_V2_LOAD_LIMITS } = subject()

  assert.deepEqual(WORKFLOW_PACKAGE_V2_LOAD_LIMITS, {
    maxFiles: 512,
    maxDepth: 3,
    maxLogicalPathBytes: 240,
    maxWorkflowBytes: 1_048_576,
    maxLockBytes: 1_048_576,
    maxPromptBytes: 4_194_304,
    maxSchemaBytes: 4_194_304,
    maxTotalBytes: 33_554_432
  })
  const current = await loadCurrentWorkflowPackage({ fileSystem, collectionRoot: root, workflowId: "minimal" })
  const explicit = await loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest,
    expectedPackageDigest: installed.digest
  })

  assert.equal(current.publication, "published")
  assert.equal(current.packageDigest, installed.digest)
  assert.equal(current.generation, installed.digest)
  assert.deepEqual(current.files.map(({ path, digest }) => ({ path, digest })), explicit.files.map(({ path, digest }) => ({ path, digest })))
  assert.deepEqual(current.files.map((file) => [file.path, Buffer.from(file.bytes).toString("hex")]), explicit.files.map((file) => [file.path, Buffer.from(file.bytes).toString("hex")]))
  assert.notEqual(current.files[0].bytes, explicit.files[0].bytes)
  assert.equal(Object.isFrozen(current), true)
  assert.equal(Object.isFrozen(current.files), true)
  assert.equal(Object.isFrozen(current.files[0]), true)
})

test("explicit generation loading never reads current.json", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  fileSystem.remove(["minimal", "current.json"])
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const loaded = await subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest
  })
  assert.equal(loaded.packageDigest, installed.digest)
  assert.equal(fileSystem.calls.some(([, logicalPath]) => logicalPath.endsWith("current.json")), false)
})

test("normal current discovery ignores pointer temps and staging siblings", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  installStaging(fileSystem)
  fileSystem.addFile(["minimal", "current.json.tmp-deadbeef"], Buffer.from("not-json"))
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const loaded = await subject().loadCurrentWorkflowPackage({ fileSystem, collectionRoot: root, workflowId: "minimal" })
  assert.equal(loaded.packageDigest, installed.digest)
  assert.equal(loaded.publication, "published")
})

test("loader preserves semantically unreferenced prompt and schema bytes for P4", async () => {
  const files = fixtureBytes({
    "prompts/unreferenced.md": "not referenced yet\n",
    "schemas/unreferenced.json": "{}\n"
  })
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem, "minimal", files)
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const loaded = await subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest
  })
  assert.deepEqual(loaded.files.map((file) => file.path), Object.keys(files).sort())
})
