const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

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
    snapshotIdentity: (uri, stat) => `${uri}:${stat.type}:${stat.size}:${stat.ctime}:${stat.mtime}`
  })

  assert.equal((await adapter.lstat("root", ["a"])).kind, "file")
  assert.equal((await adapter.lstat("root", ["link"])).kind, "symbolic-link")
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
    isWithin: (root, candidate) => candidate === root || candidate.startsWith(`${root}/`)
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
