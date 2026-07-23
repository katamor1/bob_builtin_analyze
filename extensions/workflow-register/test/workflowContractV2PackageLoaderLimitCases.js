const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  MemoryPackageFileSystem,
  installPublished,
  rootSubject,
  subject
} = require("./workflowContractV2PackageLoaderTestSupport")

async function load(fileSystem, digest) {
  const root = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  return subject().loadWorkflowPackageGeneration({
    fileSystem,
    collectionRoot: root,
    workflowId: "minimal",
    generation: digest
  })
}

test("file-count, per-file, total-byte, depth, and logical-path limits fail before allocation where possible", async () => {
  const fileCountFs = new MemoryPackageFileSystem()
  const installed = installPublished(fileCountFs)
  for (let index = 0; index < 509; index += 1) {
    fileCountFs.addFile([...installed.base, "prompts", `p-${index.toString().padStart(3, "0")}.md`], Buffer.from("x"))
  }
  let reads = 0
  fileCountFs.hooks.beforeReadFile = () => { reads += 1 }
  await assert.rejects(() => load(fileCountFs, installed.digest), /file count|files/i)
  assert.equal(reads, 0)

  const oversizedFs = new MemoryPackageFileSystem()
  const oversized = installPublished(oversizedFs)
  const workflow = oversizedFs.entries.get(oversizedFs.key([...oversized.base, "workflow.yaml"]))
  workflow.size = 1_048_577
  workflow.readThrows = new Error("must not allocate")
  await assert.rejects(() => load(oversizedFs, oversized.digest), /workflow.yaml|bytes|size/i)

  const totalFs = new MemoryPackageFileSystem()
  const total = installPublished(totalFs)
  for (const logicalPath of ["prompts/draft.md", "schemas/request.json"]) {
    totalFs.entries.get(totalFs.key([...total.base, ...logicalPath.split("/")])).size = 20_000_000
  }
  await assert.rejects(() => load(totalFs, total.digest), /total/i)

  const pathFs = new MemoryPackageFileSystem()
  const pathInstalled = installPublished(pathFs)
  pathFs.addFile([...pathInstalled.base, "prompts", `${"a".repeat(230)}.md`], Buffer.from("x"))
  await assert.rejects(() => load(pathFs, pathInstalled.digest), /path.*240|logical path/i)
})

test("directory entry count is rejected before descriptor snapshot and sorting", async () => {
  const fileSystem = new MemoryPackageFileSystem()
  const installed = installPublished(fileSystem)
  const originalReadDirectory = fileSystem.readDirectory.bind(fileSystem)
  let getterCalls = 0
  fileSystem.readDirectory = async (root, segments) => {
    if (segments.join("/") !== installed.base.join("/")) {
      return originalReadDirectory(root, segments)
    }
    const names = Array.from({ length: 515 }, (_, index) => `entry-${index}`)
    Object.defineProperty(names, "0", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return "entry-0"
      }
    })
    return names
  }

  await assert.rejects(() => load(fileSystem, installed.digest), /directory entry count|entry limit|512-file limit/i)
  assert.equal(getterCalls, 0)
})
