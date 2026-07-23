const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const {
  fixtureBytes,
  packageDigest,
  rootSubject,
  subject
} = require("./workflowContractV2PackageLoaderTestSupport")

test("Node package filesystem adapter exposes stable file kinds, bytes, containment, flush, and rename", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-package-node-adapter-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "slot"))
  fs.writeFileSync(path.join(root, "slot", "a.txt"), "alpha")

  const { createNodeWorkflowPackageFileSystem } = require("../out/core/contractV2/packageFileSystemNode.js")
  const adapter = createNodeWorkflowPackageFileSystem()
  assert.equal((await adapter.lstat(root, ["slot"])).kind, "directory")
  const first = await adapter.lstat(root, ["slot", "a.txt"])
  assert.equal(first.kind, "file")
  const opened = await adapter.openFile(root, ["slot", "a.txt"])
  assert.deepEqual(opened.initialStat, first)
  assert.equal(Buffer.from(await opened.read()).toString(), "alpha")
  assert.deepEqual(await opened.stat(), first)
  await opened.close()
  assert.equal(Buffer.from(await adapter.readFile(root, ["slot", "a.txt"])).toString(), "alpha")
  assert.deepEqual(await adapter.readDirectory(root, ["slot"]), ["a.txt"])
  const physicalRoot = await adapter.realpath(root, [])
  const physicalFile = await adapter.realpath(root, ["slot", "a.txt"])
  assert.equal(adapter.isWithin(physicalRoot, physicalFile), true)
  assert.equal(adapter.isWithin(physicalRoot, path.dirname(physicalRoot)), false)
  await adapter.flushFile(root, ["slot", "a.txt"])
  await adapter.rename(root, ["slot", "a.txt"], ["slot", "b.txt"])
  assert.equal(Buffer.from(await adapter.readFile(root, ["slot", "b.txt"])).toString(), "alpha")
})

test("VS Code package filesystem adapter maps file types and delegates URI operations without leaking URIs into evidence", async () => {
  const calls = []
  const entries = new Map([
    ["root", { type: 2, size: 0, ctime: 1, mtime: 1 }],
    ["root/a", { type: 1, size: 1, ctime: 2, mtime: 3, bytes: Uint8Array.of(97) }],
    ["root/link", { type: 65, size: 0, ctime: 4, mtime: 5 }]
  ])
  const workspaceFs = {
    async stat(uri) { calls.push(["stat", uri]); return entries.get(uri) },
    async readDirectory(uri) { calls.push(["readDirectory", uri]); return [["a", 1], ["link", 65]] },
    async readFile(uri) { calls.push(["readFile", uri]); return entries.get(uri).bytes },
    async rename(from, to, options) { calls.push(["rename", from, to, options]) }
  }
  const { createVscodeWorkflowPackageFileSystem } = require("../out/core/contractV2/packageFileSystemVscode.js")
  const adapter = createVscodeWorkflowPackageFileSystem({
    workspaceFs,
    joinPath: (root, ...segments) => [root, ...segments].join("/"),
    realpath: async (uri) => `/physical/${uri}`,
    isWithin: (root, candidate) => candidate === root || candidate.startsWith(`${root}/`),
    snapshotIdentity: (uri, stat) => `${uri}:${stat.type}:${stat.size}:${stat.ctime}:${stat.mtime}`,
    openFile: async (uri) => {
      const stat = entries.get(uri)
      const bytes = Uint8Array.from(stat.bytes)
      return {
        initialStat: stat,
        async read() { return Uint8Array.from(bytes) },
        async stat() { return stat },
        async close() {}
      }
    }
  })

  assert.equal((await adapter.lstat("root", ["a"])).kind, "file")
  assert.equal((await adapter.lstat("root", ["link"])).kind, "symbolic-link")
  const opened = await adapter.openFile("root", ["a"])
  assert.equal(opened.initialStat.kind, "file")
  assert.equal(Buffer.from(await opened.read()).toString(), "a")
  assert.equal((await opened.stat()).identity, opened.initialStat.identity)
  await opened.close()
  assert.deepEqual(await adapter.readDirectory("root", []), ["a", "link"])
  assert.equal(Buffer.from(await adapter.readFile("root", ["a"])).toString(), "a")
  assert.equal(await adapter.realpath("root", ["a"]), "/physical/root/a")
  await adapter.rename("root", ["a"], ["b"])
  assert.deepEqual(calls.at(-1), ["rename", "root/a", "root/b", { overwrite: false }])
})

test("VS Code adapter requires a provider-guaranteed snapshot identity", async () => {
  const workspaceFs = {
    async stat() { return { type: 1, size: 1, ctime: 1, mtime: 1 } },
    async readDirectory() { return [] },
    async readFile() { return Uint8Array.of(97) },
    async rename() {}
  }
  const { createVscodeWorkflowPackageFileSystem } = require("../out/core/contractV2/packageFileSystemVscode.js")
  const base = {
    workspaceFs,
    joinPath: (root, ...segments) => [root, ...segments].join("/"),
    realpath: async (uri) => `/physical/${uri}`,
    isWithin: (root, candidate) => candidate === root || candidate.startsWith(`${root}/`),
    openFile: async () => {
      const stat = await workspaceFs.stat()
      return {
        initialStat: stat,
        async read() { return workspaceFs.readFile() },
        async stat() { return stat },
        async close() {}
      }
    }
  }

  assert.throws(() => createVscodeWorkflowPackageFileSystem(base), /snapshot identity|identity provider/i)

  let version = 1
  const adapter = createVscodeWorkflowPackageFileSystem({
    ...base,
    snapshotIdentity: () => `version:${version}`
  })
  const first = await adapter.lstat("root", ["a"])
  version = 2
  const second = await adapter.lstat("root", ["a"])
  assert.notEqual(first.identity, second.identity)
})


test("VS Code adapter requires a provider-bound openFile snapshot", async () => {
  const entries = new Map([
    ["root/a", { type: 1, size: 1, ctime: 1, mtime: 1, version: 1, bytes: Uint8Array.of(97) }]
  ])
  const workspaceFs = {
    async stat(uri) { return entries.get(uri) },
    async readDirectory() { return [] },
    async readFile() { throw new Error("path-based readFile must not back openFile") },
    async rename() {}
  }
  const { createVscodeWorkflowPackageFileSystem } = require("../out/core/contractV2/packageFileSystemVscode.js")
  const base = {
    workspaceFs,
    joinPath: (root, ...segments) => [root, ...segments].join("/"),
    realpath: async (uri) => `/physical/${uri}`,
    isWithin: (root, candidate) => candidate === root || candidate.startsWith(`${root}/`),
    snapshotIdentity: (_uri, stat) => `version:${stat.version}`
  }

  assert.throws(
    () => createVscodeWorkflowPackageFileSystem(base),
    /snapshot-bound openFile|openFile provider|open file provider/i
  )

  let closeCalls = 0
  const adapter = createVscodeWorkflowPackageFileSystem({
    ...base,
    openFile: async (uri) => {
      const entry = entries.get(uri)
      const openedStat = { ...entry }
      const openedBytes = Uint8Array.from(entry.bytes)
      let closed = false
      return {
        initialStat: openedStat,
        async read() {
          assert.equal(closed, false)
          return Uint8Array.from(openedBytes)
        },
        async stat() {
          assert.equal(closed, false)
          return openedStat
        },
        async close() {
          if (closed) return
          closed = true
          closeCalls += 1
        }
      }
    }
  })

  const opened = await adapter.openFile("root", ["a"])
  entries.set("root/a", { type: 1, size: 1, ctime: 1, mtime: 1, version: 2, bytes: Uint8Array.of(98) })
  assert.equal(Buffer.from(await opened.read()).toString(), "a")
  assert.equal((await opened.stat()).identity, "version:1")
  await opened.close()
  assert.equal(closeCalls, 1)
})

test("Node and VS Code adapters produce identical raw package evidence", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-package-adapter-parity-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = fixtureBytes()
  const digest = packageDigest(files)
  const generationDirectory = `sha256-${digest.slice("sha256:".length)}`
  const generationRoot = path.join(root, "minimal", "versions", generationDirectory)
  fs.mkdirSync(generationRoot, { recursive: true })
  for (const [logicalPath, bytes] of Object.entries(files)) {
    const target = path.join(generationRoot, ...logicalPath.split("/"))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }

  const { createNodeWorkflowPackageFileSystem } = require("../out/core/contractV2/packageFileSystemNode.js")
  const { createVscodeWorkflowPackageFileSystem } = require("../out/core/contractV2/packageFileSystemVscode.js")
  const nodeAdapter = createNodeWorkflowPackageFileSystem()
  const vscodeAdapter = createVscodeWorkflowPackageFileSystem({
    workspaceFs: {
      async stat(uri) { return vscodeStat(await fsp.lstat(uri, { bigint: true })) },
      async readDirectory(uri) {
        const entries = await fsp.readdir(uri, { withFileTypes: true })
        return entries.map((entry) => [entry.name, entry.isSymbolicLink() ? 64 : entry.isFile() ? 1 : entry.isDirectory() ? 2 : 0])
      },
      async readFile(uri) { return fsp.readFile(uri) },
      async rename(from, to) { await fsp.rename(from, to) }
    },
    joinPath: (base, ...segments) => path.join(base, ...segments),
    realpath: (uri) => fsp.realpath(uri),
    isWithin: (base, candidate) => {
      const relative = path.relative(base, candidate)
      return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
    },
    snapshotIdentity: (_uri, stat) => stat.snapshotIdentity,
    openFile: async (uri) => {
      const noFollow = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0
      const handle = await fsp.open(uri, fs.constants.O_RDONLY | noFollow)
      const initialStat = vscodeStat(await handle.stat({ bigint: true }))
      return {
        initialStat,
        async read() { return handle.readFile() },
        async stat() { return vscodeStat(await handle.stat({ bigint: true })) },
        async close() { await handle.close() }
      }
    }
  })

  const createRoot = rootSubject().createWorkflowPackageRoot
  const loader = subject().loadWorkflowPackageGeneration
  const nodeResult = await loader({
    fileSystem: nodeAdapter,
    collectionRoot: createRoot(nodeAdapter, root),
    workflowId: "minimal",
    generation: digest
  })
  const vscodeResult = await loader({
    fileSystem: vscodeAdapter,
    collectionRoot: createRoot(vscodeAdapter, root),
    workflowId: "minimal",
    generation: digest
  })

  const evidence = (value) => ({
    publication: value.publication,
    workflowId: value.workflowId,
    generation: value.generation,
    packageDigest: value.packageDigest,
    files: value.files.map((file) => ({
      path: file.path,
      byteLength: file.byteLength,
      digest: file.digest,
      bytes: Buffer.from(file.bytes).toString("hex")
    }))
  })
  assert.deepEqual(evidence(vscodeResult), evidence(nodeResult))
})

function vscodeStat(stats) {
  const size = Number(stats.size)
  const kind = stats.isSymbolicLink() ? 64 : stats.isFile() ? 1 : stats.isDirectory() ? 2 : 0
  return {
    type: kind,
    size,
    ctime: Number(stats.ctimeMs),
    mtime: Number(stats.mtimeMs),
    snapshotIdentity: [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeNs, stats.ctimeNs]
      .map((value) => value.toString())
      .join(":")
  }
}
