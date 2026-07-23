const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  MemoryPackageFileSystem,
  fixtureBytes,
  installPublished,
  rootSubject,
  subject
} = require("./workflowContractV2PackageLoaderTestSupport")

async function expectRejected(mutator, pattern = /layout|path|link|regular|digest|snapshot|duplicate/i) {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  mutator(fileSystem, installed)
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest
  }), pattern)
}

test("loader rejects symlinks at every physical component and non-regular files", async (t) => {
  for (const entry of [
    { name: "slot", path: (_installed) => ["minimal"] },
    { name: "versions", path: (_installed) => ["minimal", "versions"] },
    { name: "generation", path: (installed) => installed.base },
    { name: "prompts", path: (installed) => [...installed.base, "prompts"] },
    { name: "prompt-file", path: (installed) => [...installed.base, "prompts", "draft.md"] }
  ]) await t.test(entry.name, async () => {
    await expectRejected((fileSystem, installed) => {
      fileSystem.setKind(entry.path(installed), "symbolic-link")
    }, /link|directory|regular/i)
  })

  await expectRejected((fileSystem, installed) => {
    fileSystem.setKind([...installed.base, "workflow.yaml"], "other")
  }, /regular/i)
})

test("loader rejects unexpected root entries, invalid names, depth, case-fold duplicates, and normalization duplicates", async () => {
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "README.md"], Buffer.from("x"))
  }, /unexpected|layout/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addDirectory([...installed.base, "other"])
  }, /unexpected|layout/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "prompts", ".."], Buffer.from("x"))
  }, /path/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "prompts", "bad\\name.md"], Buffer.from("x"))
  }, /path/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "prompts", "/absolute.md"], Buffer.from("x"))
  }, /path/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "prompts", "nested", "deeper", "too-deep.md"], Buffer.from("x"))
  }, /depth/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "prompts", "DRAFT.md"], Buffer.from("x"))
  }, /duplicate/i)
  await expectRejected((fileSystem, installed) => {
    fileSystem.addFile([...installed.base, "prompts", "e\u0301.md"], Buffer.from("x"))
    fileSystem.addFile([...installed.base, "prompts", "é.md"], Buffer.from("x"))
  }, /duplicate/i)
})

test("loader rejects physical containment escape and generation or expected digest mismatch", async () => {
  await expectRejected((fileSystem, installed) => {
    fileSystem.entries.get(fileSystem.key([...installed.base, "workflow.yaml"])).physical = "/outside/workflow.yaml"
  }, /contain/i)

  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: `sha256:${"0".repeat(64)}`
  }), /generation|digest/i)
  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest,
    expectedPackageDigest: `sha256:${"0".repeat(64)}`
  }), /expected|digest/i)
})

test("loader detects file and directory mutation instead of mixing snapshots", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  let changed = false
  fileSystem.hooks.afterReadFile = (segments, fs) => {
    if (!changed && segments.join("/").endsWith("workflow.yaml")) {
      changed = true
      fs.mutate(segments, Buffer.from("changed\n"))
    }
  }
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest
  }), /snapshot|changed/i)

  const directoryFs = new MemoryPackageFileSystem()
  const directoryInstalled = installPublished(directoryFs)
  let directoryChanged = false
  directoryFs.hooks.beforeReadFile = (_segments, fs) => {
    if (!directoryChanged) {
      directoryChanged = true
      fs.addFile([...directoryInstalled.base, "prompts", "later.md"], Buffer.from("late"))
    }
  }
  const directoryRoot = rootSubject().createWorkflowPackageRoot(directoryFs, {})
  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem: directoryFs,
    collectionRoot: directoryRoot,
    workflowId: "minimal",
    generation: directoryInstalled.digest
  }), /snapshot|directory|changed/i)
})

test("loader rejects a symbolic-link entry before resolving its physical target", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  const linkSegments = [...installed.base, "prompts", "draft.md"]
  fileSystem.setKind(linkSegments, "symbolic-link")
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})

  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: installed.digest
  }), /symbolic link/i)

  assert.equal(
    fileSystem.calls.some(([operation, logicalPath]) => (
      operation === "realpath" && logicalPath === linkSegments.join("/")
    )),
    false,
    "a rejected symbolic link must never be followed through realpath"
  )
})

test("loader rejects control-file and directory physical identity changes during a snapshot", async () => {
  const pointerFs = new MemoryPackageFileSystem()
  installPublished(pointerFs)
  let pointerChanged = false
  pointerFs.hooks.afterReadFile = (segments, fs) => {
    if (!pointerChanged && segments.join("/").endsWith("current.json")) {
      pointerChanged = true
      fs.entries.get(fs.key(segments)).physical = "/outside/current.json"
    }
  }
  const pointerRoot = rootSubject().createWorkflowPackageRoot(pointerFs, {})
  await assert.rejects(() => subject().loadCurrentWorkflowPackage({
    fileSystem: pointerFs,
    collectionRoot: pointerRoot,
    workflowId: "minimal"
  }), /physical|changed|contain/i)

  const directoryFs = new MemoryPackageFileSystem()
  const installed = installPublished(directoryFs)
  let directoryMoved = false
  directoryFs.hooks.afterReadFile = (_segments, fs) => {
    if (!directoryMoved) {
      directoryMoved = true
      fs.entries.get(fs.key([...installed.base, "prompts"])).physical = "/outside/prompts"
    }
  }
  const directoryRoot = rootSubject().createWorkflowPackageRoot(directoryFs, {})
  await assert.rejects(() => subject().loadWorkflowPackageGeneration({
    fileSystem: directoryFs,
    collectionRoot: directoryRoot,
    workflowId: "minimal",
    generation: installed.digest
  }), /physical|directory.*changed/i)
})
