const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  MemoryPackageFileSystem,
  currentPointer,
  fixtureBytes,
  installPublished,
  installStaging,
  packageDigest,
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

test("published generation directories use a Windows-safe encoding while evidence remains canonical", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const files = fixtureBytes()
  const digest = packageDigest(files)
  const directoryName = `sha256-${digest.slice("sha256:".length)}`
  const base = ["minimal", "versions", directoryName]
  fileSystem.addDirectory(["minimal"])
  fileSystem.addDirectory(["minimal", "versions"])
  fileSystem.addDirectory(base)
  for (const [logicalPath, bytes] of Object.entries(files)) {
    fileSystem.addFile([...base, ...logicalPath.split("/")], bytes)
  }
  fileSystem.addFile(["minimal", "current.json"], currentPointer("minimal", digest))

  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const loader = subject()
  const current = await loader.loadCurrentWorkflowPackage({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal"
  })
  const explicit = await loader.loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: digest
  })

  assert.equal(current.generation, digest)
  assert.equal(current.packageDigest, digest)
  assert.equal(explicit.generation, digest)
  assert.equal(explicit.packageDigest, digest)
  assert.equal(
    fileSystem.calls.some(([, logicalPath]) => logicalPath.split("/").some((segment) => segment.includes(":"))),
    false,
    "canonical digest punctuation must never enter a physical path segment"
  )
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

test("package digest delegates to F1 canonical JSON instead of mutable Array.join", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const loader = subject()
  const originalJoin = Array.prototype.join
  Array.prototype.join = function guardedJoin(separator) {
    if (this.length > 0 && typeof this[0] === "string" && this[0].startsWith('{"digest"')) {
      return "tampered-manifest"
    }
    return Reflect.apply(originalJoin, this, [separator])
  }
  try {
    const loaded = await loader.loadWorkflowPackageGeneration({
      fileSystem,
      collectionRoot: root,
      workflowId: "minimal",
      generation: installed.digest
    })
    assert.equal(loaded.packageDigest, installed.digest)
  } finally {
    Array.prototype.join = originalJoin
  }
})

test("current pointer rejects duplicate JSON object keys", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  fileSystem.mutate(["minimal", "current.json"], Buffer.from([
    "{",
    '"schemaVersion":"workflow-package-pointer/v1",',
    '"workflowId":"minimal",',
    '"\\u0077orkflowId":"minimal",',
    `"generation":"${installed.digest}",`,
    `"packageDigest":"${installed.digest}"`,
    "}"
  ].join("")))
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})

  await assert.rejects(() => subject().loadCurrentWorkflowPackage({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal"
  }), /duplicate.*key|duplicate.*property/i)
})
