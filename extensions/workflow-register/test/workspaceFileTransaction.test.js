const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsPromises = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function tempDir(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-file-transaction-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test("workspace file transaction restores old artifact and manifest bytes when manifest commit fails", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const artifactRelative = ".bob/workflows/runs/run-1/artifacts/context.txt"
  const manifestRelative = ".bob/workflows/runs/run-1/artifacts/manifest.json"
  const artifactPath = path.join(root, artifactRelative)
  const manifestPath = path.join(root, manifestRelative)
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
  fs.writeFileSync(artifactPath, "old artifact")
  fs.writeFileSync(manifestPath, "old manifest")

  const originalRename = fsPromises.rename
  let injected = false
  fsPromises.rename = async (source, target) => {
    if (!injected && path.resolve(target) === path.resolve(manifestPath) && String(source).includes(".workflow-txn-")) {
      injected = true
      throw new Error("forced manifest commit failure")
    }
    return originalRename(source, target)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [
        { relativePath: artifactRelative, text: "new artifact", encoding: "utf8" },
        { relativePath: manifestRelative, text: "new manifest", encoding: "utf8" }
      ]),
      /forced manifest commit failure/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.equal(fs.readFileSync(artifactPath, "utf8"), "old artifact")
  assert.equal(fs.readFileSync(manifestPath, "utf8"), "old manifest")
  assert.deepEqual(
    fs.readdirSync(path.dirname(artifactPath)).filter((name) => name.includes(".workflow-txn-")),
    []
  )
})

test("workspace file transaction removes a partially staged temporary file", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const originalWriteFile = fsPromises.writeFile
  let injected = false
  fsPromises.writeFile = async (target, ...args) => {
    await originalWriteFile(target, ...args)
    if (!injected && String(target).includes(".workflow-txn-")) {
      injected = true
      throw new Error("forced staging failure")
    }
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [{ relativePath: "artifacts/new.txt", text: "new", encoding: "utf8" }]),
      /forced staging failure/
    )
  } finally {
    fsPromises.writeFile = originalWriteFile
  }

  assert.equal(injected, true)
  const artifactDirectory = path.join(root, "artifacts")
  assert.deepEqual(
    fs.existsSync(artifactDirectory)
      ? fs.readdirSync(artifactDirectory).filter((name) => name.includes(".workflow-txn-"))
      : [],
    []
  )
  assert.equal(fs.existsSync(path.join(artifactDirectory, "new.txt")), false)
})

test("workspace file transaction rejects a junction that escapes the physical workspace root", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const outside = tempDir(t)
  const junction = path.join(root, "outside-link")
  fs.symlinkSync(outside, junction, process.platform === "win32" ? "junction" : "dir")

  await assert.rejects(
    writeWorkspaceFilesAtomically(root, [{ relativePath: "outside-link/escaped.txt", text: "escaped", encoding: "utf8" }]),
    /physical workspace root|escapes workspace root/
  )
  assert.equal(fs.existsSync(path.join(outside, "escaped.txt")), false)
})

test("workspace file transaction rejects duplicate physical targets through a junction alias", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const realDirectory = path.join(root, "real")
  fs.mkdirSync(realDirectory)
  fs.symlinkSync(realDirectory, path.join(root, "alias"), process.platform === "win32" ? "junction" : "dir")

  await assert.rejects(
    writeWorkspaceFilesAtomically(root, [
      { relativePath: "real/same.txt", text: "first", encoding: "utf8" },
      { relativePath: "alias/same.txt", text: "second", encoding: "utf8" }
    ]),
    /duplicate physical target/
  )
  assert.equal(fs.existsSync(path.join(realDirectory, "same.txt")), false)
})

test("workspace file transaction rejects a parent swapped to an outside junction before staging", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const outside = tempDir(t)
  const parent = path.join(root, "artifacts")
  const parked = path.join(root, "artifacts-parked")
  fs.mkdirSync(parent)
  const originalWriteFile = fsPromises.writeFile
  let swapped = false
  fsPromises.writeFile = async (target, ...args) => {
    if (!swapped && path.basename(String(target)).includes(".workflow-txn-")) {
      fs.renameSync(parent, parked)
      fs.symlinkSync(outside, parent, process.platform === "win32" ? "junction" : "dir")
      swapped = true
    }
    return originalWriteFile(target, ...args)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [
        { relativePath: "artifacts/escaped.txt", text: "escaped", encoding: "utf8" }
      ]),
      /changed|physical workspace root|symbolic|junction|containment/
    )
  } finally {
    fsPromises.writeFile = originalWriteFile
  }

  assert.equal(swapped, true)
  assert.equal(fs.existsSync(path.join(outside, "escaped.txt")), false)
})

test("workspace file transaction serializes one physical root so a failed rollback cannot overwrite a later commit", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "old")
  let firstCommitEntered
  const firstEntered = new Promise((resolve) => { firstCommitEntered = resolve })
  let releaseFirstCommit
  const firstReleased = new Promise((resolve) => { releaseFirstCommit = resolve })
  const first = writeWorkspaceFilesAtomically(root, [
    { relativePath: "artifact.txt", text: "first", encoding: "utf8" }
  ], async () => {
    firstCommitEntered()
    await firstReleased
    throw new Error("first state commit failed")
  })
  await firstEntered

  const second = writeWorkspaceFilesAtomically(root, [
    { relativePath: "artifact.txt", text: "second", encoding: "utf8" }
  ])
  void second.then(releaseFirstCommit, releaseFirstCommit)
  const fallback = setTimeout(releaseFirstCommit, 250)
  try {
    const [firstResult, secondResult] = await Promise.allSettled([first, second])
    assert.equal(firstResult.status, "rejected")
    assert.equal(secondResult.status, "fulfilled")
  } finally {
    clearTimeout(fallback)
    releaseFirstCommit()
    await Promise.allSettled([first, second])
  }

  assert.equal(fs.readFileSync(target, "utf8"), "second")
})

test("workspace file transaction preserves an unrelated winner after a failed target publish", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "old")
  const originalRename = fsPromises.rename
  let injected = false
  fsPromises.rename = async (source, destination) => {
    if (!injected && path.resolve(String(destination)) === path.resolve(target) && String(source).includes(".workflow-txn-")) {
      injected = true
      fs.writeFileSync(target, "external winner")
      throw new Error("failed publish after unrelated winner")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [{ relativePath: "artifact.txt", text: "transaction", encoding: "utf8" }]),
      /failed publish after unrelated winner.*rollback failed/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.equal(fs.readFileSync(target, "utf8"), "external winner")
})

test("workspace file transaction restores an existing target when backup rename mutates then rejects", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "exact original")
  const originalRename = fsPromises.rename
  let injected = false
  fsPromises.rename = async (source, destination) => {
    if (!injected && path.resolve(String(source)) === target && String(destination).endsWith(".bak")) {
      injected = true
      await originalRename(source, destination)
      throw new Error("backup rename rejected after mutation")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [{ relativePath: "artifact.txt", text: "new bytes", encoding: "utf8" }]),
      /backup rename rejected after mutation/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.equal(fs.readFileSync(target, "utf8"), "exact original")
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.includes(".workflow-txn-")), [])
})

test("workspace file transaction removes every missing-target publication when publish mutates then rejects", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const first = path.join(root, "first.txt")
  const second = path.join(root, "second.txt")
  const originalRename = fsPromises.rename
  let injected = false
  fsPromises.rename = async (source, destination) => {
    if (!injected && path.resolve(String(destination)) === second && String(source).endsWith(".tmp")) {
      injected = true
      await originalRename(source, destination)
      throw new Error("publish rejected after mutation")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [
        { relativePath: "first.txt", text: "first", encoding: "utf8" },
        { relativePath: "second.txt", text: "second", encoding: "utf8" }
      ]),
      /publish rejected after mutation/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.equal(fs.existsSync(first), false)
  assert.equal(fs.existsSync(second), false)
})

test("workspace successful commit reports every cleanup artifact that remains", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "old")
  const originalRm = fsPromises.rm
  const failedKinds = []
  fsPromises.rm = async (candidate, options) => {
    const kind = [".bak", ".anchor"].find((suffix) => String(candidate).endsWith(suffix))
    if (kind) {
      failedKinds.push(kind)
      const error = new Error(`forced cleanup failure ${kind}`)
      error.code = "EACCES"
      throw error
    }
    return originalRm(candidate, options)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(root, [{ relativePath: "artifact.txt", text: "new", encoding: "utf8" }]),
      /cleanup failed.*\.anchor.*\.bak|cleanup failed.*\.bak.*\.anchor/
    )
  } finally {
    fsPromises.rm = originalRm
  }

  assert.deepEqual(failedKinds.sort(), [".anchor", ".bak"])
  assert.equal(fs.readFileSync(target, "utf8"), "new")
  const staging = path.join(root, ".bob", ".workflow-file-transactions")
  const names = fs.readdirSync(staging)
  assert.equal(names.some((name) => name.endsWith(".anchor")), true)
  assert.equal(names.some((name) => name.endsWith(".bak")), true)
})

test("workspace successful cleanup accepts removals that mutate then reject", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "old")
  const originalRm = fsPromises.rm
  const rejectedKinds = []
  fsPromises.rm = async (candidate, options) => {
    const kind = [".bak", ".anchor"].find((suffix) => String(candidate).endsWith(suffix))
    if (!kind) return originalRm(candidate, options)
    await originalRm(candidate, options)
    rejectedKinds.push(kind)
    throw new Error(`cleanup rejected after removal ${kind}`)
  }

  try {
    await writeWorkspaceFilesAtomically(root, [{ relativePath: "artifact.txt", text: "new", encoding: "utf8" }])
  } finally {
    fsPromises.rm = originalRm
  }

  assert.deepEqual(rejectedKinds.sort(), [".anchor", ".bak"])
  assert.equal(fs.readFileSync(target, "utf8"), "new")
  const staging = path.join(root, ".bob", ".workflow-file-transactions")
  assert.deepEqual(fs.readdirSync(staging), [])
})

test("workspace rollback reconciles target removal that mutates then rejects", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "exact original")
  const originalRm = fsPromises.rm
  let injected = false
  fsPromises.rm = async (candidate, options) => {
    if (!injected && path.resolve(String(candidate)) === target) {
      injected = true
      await originalRm(candidate, options)
      throw new Error("rollback target removal rejected after mutation")
    }
    return originalRm(candidate, options)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(
        root,
        [{ relativePath: "artifact.txt", text: "new bytes", encoding: "utf8" }],
        () => { throw new Error("force rollback") }
      ),
      /^Error: force rollback$/
    )
  } finally {
    fsPromises.rm = originalRm
  }

  assert.equal(injected, true)
  assert.equal(fs.readFileSync(target, "utf8"), "exact original")
  assert.deepEqual(fs.readdirSync(path.join(root, ".bob", ".workflow-file-transactions")), [])
})

test("workspace rollback preserves an in-place winner recreated after target removal", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "exact original")
  const originalRm = fsPromises.rm
  const winner = Buffer.from("external winner")
  let injected = false
  fsPromises.rm = async (candidate, options) => {
    if (!injected && path.resolve(String(candidate)) === target) {
      injected = true
      await originalRm(candidate, options)
      const staging = path.join(root, ".bob", ".workflow-file-transactions")
      const anchor = fs.readdirSync(staging).find((name) => name.endsWith(".anchor"))
      assert.ok(anchor)
      fs.linkSync(path.join(staging, anchor), target)
      fs.writeFileSync(target, winner)
      return
    }
    return originalRm(candidate, options)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(
        root,
        [{ relativePath: "artifact.txt", text: "new bytes", encoding: "utf8" }],
        () => { throw new Error("force rollback") }
      ),
      /force rollback; rollback failed: Workspace file transaction target changed during rollback/
    )
  } finally {
    fsPromises.rm = originalRm
  }

  assert.equal(injected, true)
  assert.deepEqual(fs.readFileSync(target), winner)
  const staging = path.join(root, ".bob", ".workflow-file-transactions")
  const rollback = fs.readdirSync(staging).find((name) => name.endsWith(".bak"))
  assert.ok(rollback)
  assert.equal(fs.readFileSync(path.join(staging, rollback), "utf8"), "exact original")
})

test("workspace rollback reconciles restore rename that mutates then rejects", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "exact original")
  const originalRename = fsPromises.rename
  let injected = false
  fsPromises.rename = async (source, destination) => {
    if (!injected && String(source).endsWith(".bak") && path.resolve(String(destination)) === target) {
      injected = true
      await originalRename(source, destination)
      throw new Error("rollback restore rename rejected after mutation")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(
        root,
        [{ relativePath: "artifact.txt", text: "new bytes", encoding: "utf8" }],
        () => { throw new Error("force rollback") }
      ),
      /^Error: force rollback$/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.equal(fs.readFileSync(target, "utf8"), "exact original")
  assert.deepEqual(fs.readdirSync(path.join(root, ".bob", ".workflow-file-transactions")), [])
})

test("workspace rollback does not reconcile an in-place rewrite after restore rename", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "exact original")
  const originalRename = fsPromises.rename
  const winner = Buffer.from("external win!")
  let injected = false
  fsPromises.rename = async (source, destination) => {
    if (!injected && String(source).endsWith(".bak") && path.resolve(String(destination)) === target) {
      injected = true
      await originalRename(source, destination)
      await fsPromises.writeFile(destination, winner)
      throw new Error("rollback restore rejected after in-place rewrite")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      writeWorkspaceFilesAtomically(
        root,
        [{ relativePath: "artifact.txt", text: "new bytes", encoding: "utf8" }],
        () => { throw new Error("force rollback") }
      ),
      /force rollback; rollback failed: rollback restore rejected after in-place rewrite/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.deepEqual(fs.readFileSync(target), winner)
})

test("workspace rollback preserves a normal replacement even when the allocator reuses the published inode", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "old bytes")
  let reusedPublishedInode = false

  await assert.rejects(
    writeWorkspaceFilesAtomically(root, [{ relativePath: "artifact.txt", text: "transaction bytes", encoding: "utf8" }], async () => {
      const published = fs.statSync(target, { bigint: true })
      fs.unlinkSync(target)
      for (let attempt = 0; attempt < 512; attempt += 1) {
        fs.writeFileSync(target, "external replacement")
        const replacement = fs.statSync(target, { bigint: true })
        if (replacement.dev === published.dev && replacement.ino === published.ino) {
          reusedPublishedInode = true
          break
        }
        if (attempt < 511) fs.unlinkSync(target)
      }
      throw new Error("state commit failed after replacement")
    }),
    /state commit failed after replacement.*rollback failed/
  )

  assert.equal(reusedPublishedInode, false, "an ownership anchor must keep the published inode allocated")
  assert.equal(fs.readFileSync(target, "utf8"), "external replacement")
  const transactionDirectory = path.join(root, ".bob", ".workflow-file-transactions")
  assert.equal(fs.readdirSync(transactionDirectory).some((name) => name.endsWith(".bak")), true)
})

test("workspace rollback preserves an in-place rewrite of the published inode", async (t) => {
  const { writeWorkspaceFilesAtomically } = require("../out/core/runtime/workspaceFileTransaction")
  const root = tempDir(t)
  const target = path.join(root, "artifact.txt")
  fs.writeFileSync(target, "old bytes")

  await assert.rejects(
    writeWorkspaceFilesAtomically(root, [{ relativePath: "artifact.txt", text: "transaction bytes", encoding: "utf8" }], async () => {
      const before = fs.statSync(target, { bigint: true })
      fs.writeFileSync(target, "in-place external rewrite")
      const after = fs.statSync(target, { bigint: true })
      assert.equal(after.dev, before.dev)
      assert.equal(after.ino, before.ino)
      throw new Error("state commit failed after in-place rewrite")
    }),
    /state commit failed after in-place rewrite.*rollback failed/
  )

  assert.equal(fs.readFileSync(target, "utf8"), "in-place external rewrite")
  const transactionDirectory = path.join(root, ".bob", ".workflow-file-transactions")
  assert.equal(fs.readdirSync(transactionDirectory).some((name) => name.endsWith(".bak")), true)
})
