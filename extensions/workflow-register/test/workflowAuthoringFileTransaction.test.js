const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsPromises = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function fixture(t, existing = true) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-authoring-transaction-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const relativePath = ".bob/workflows/example/WORKFLOW.md"
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (existing) fs.writeFileSync(target, "exact original")
  return { root, relativePath, target }
}

test("authoring transaction restores the exact target when rollback rename mutates then rejects", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t)
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, Buffer.from("exact original"))
  const originalRename = fsPromises.rename
  let injected = false
  fsPromises.rename = async (source, destination) => {
    if (!injected && path.resolve(String(source)) === item.target && String(destination).endsWith(".bak")) {
      injected = true
      await originalRename(source, destination)
      throw new Error("authoring rollback rename rejected after mutation")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes")),
      /authoring rollback rename rejected after mutation/
    )
  } finally {
    fsPromises.rename = originalRename
  }

  assert.equal(injected, true)
  assert.equal(fs.readFileSync(item.target, "utf8"), "exact original")
})

for (const existing of [true, false]) {
  test(`authoring transaction reconciles a ${existing ? "replacement" : "creation"} link that mutates then rejects`, async (t) => {
    const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
    const item = fixture(t, existing)
    const expectation = await captureAuthoringFileExpectation(
      item.root,
      item.relativePath,
      existing ? Buffer.from("exact original") : undefined
    )
    const originalLink = fsPromises.link
    let injected = false
    fsPromises.link = async (source, destination) => {
      if (!injected && path.resolve(String(destination)) === item.target) {
        injected = true
        await originalLink(source, destination)
        throw new Error("authoring link rejected after mutation")
      }
      return originalLink(source, destination)
    }

    try {
      await assert.rejects(
        commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes")),
        /authoring link rejected after mutation/
      )
    } finally {
      fsPromises.link = originalLink
    }

    assert.equal(injected, true)
    if (existing) assert.equal(fs.readFileSync(item.target, "utf8"), "exact original")
    else assert.equal(fs.existsSync(item.target), false)
  })
}

test("authoring transaction preserves the rollback copy and reports both errors when restore fails", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, true)
  const original = Buffer.from("exact original")
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, original)
  const originalRename = fsPromises.rename
  const originalLink = fsPromises.link
  fsPromises.link = async (source, target) => {
    await originalLink(source, target)
    throw new Error("publish mutated rejection")
  }
  fsPromises.rename = async (source, target) => {
    if (String(source).endsWith(".bak") && path.resolve(String(target)) === path.resolve(item.target)) {
      throw new Error("restore rejection")
    }
    return originalRename(source, target)
  }
  t.after(() => {
    fsPromises.rename = originalRename
    fsPromises.link = originalLink
  })

  await assert.rejects(
    commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes\n")),
    /publish mutated rejection; rollback failed: cannot restore original authoring target: restore rejection/
  )

  assert.equal(fs.existsSync(item.target), false)
  const rollbackFiles = fs.readdirSync(path.dirname(item.target)).filter((name) => /^\.workflow-builder-.*\.bak$/.test(name))
  assert.equal(rollbackFiles.length, 1)
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(item.target), rollbackFiles[0])), original)
})

test("authoring transaction reconciles rollback removal that mutates then rejects and keeps the user backup", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, true)
  const original = Buffer.from("exact original")
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, original)
  const originalRm = fsPromises.rm
  let injected = false
  fsPromises.rm = async (target, options) => {
    if (!injected && String(target).endsWith(".bak")) {
      injected = true
      await originalRm(target, options)
      throw new Error("rollback removal rejected after mutation")
    }
    return originalRm(target, options)
  }

  let result
  try {
    result = await commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes"), { createPersistentBackup: true })
  } finally {
    fsPromises.rm = originalRm
  }

  assert.equal(result, "committed")
  assert.equal(injected, true)
  assert.equal(fs.readFileSync(item.target, "utf8"), "new bytes")
  const backups = fs.readdirSync(path.dirname(item.target)).filter((name) => /^WORKFLOW\.backup-.*\.md$/.test(name))
  assert.equal(backups.length, 1)
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(item.target), backups[0])), original)
})

test("authoring transaction rechecks generation after rollback verification and before publication", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, true)
  const original = Buffer.from("exact original")
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, original)
  const originalReadFile = fsPromises.readFile
  const originalLink = fsPromises.link
  let current = true
  let staleInjected = false
  let publicationCount = 0
  fsPromises.readFile = async (...args) => {
    const value = await originalReadFile(...args)
    if (!staleInjected && String(args[0]).endsWith(".bak")) {
      staleInjected = true
      current = false
    }
    return value
  }
  fsPromises.link = async (...args) => {
    if (path.resolve(String(args[1])) === item.target) publicationCount += 1
    return originalLink(...args)
  }

  let result
  try {
    result = await commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes"), {
      canCommit: () => current,
      createPersistentBackup: true
    })
  } finally {
    fsPromises.readFile = originalReadFile
    fsPromises.link = originalLink
  }

  assert.equal(staleInjected, true)
  assert.equal(result, "stale")
  assert.equal(publicationCount, 0)
  assert.deepEqual(fs.readFileSync(item.target), original)
  const names = fs.readdirSync(path.dirname(item.target))
  assert.equal(names.some((name) => /^\.workflow-builder-/.test(name)), false)
  assert.equal(names.some((name) => /^WORKFLOW\.backup-.*\.md$/.test(name)), false)
})

test("authoring transaction completes a missing-target commit after publication linearizes", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, false)
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath)
  const originalLink = fsPromises.link
  let current = true
  let published = false
  fsPromises.link = async (source, destination) => {
    const result = await originalLink(source, destination)
    if (path.resolve(String(destination)) === item.target) {
      published = true
      current = false
    }
    return result
  }

  let result
  try {
    result = await commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes"), { canCommit: () => current })
  } finally {
    fsPromises.link = originalLink
  }

  assert.equal(published, true)
  assert.equal(result, "committed")
  assert.equal(fs.readFileSync(item.target, "utf8"), "new bytes")
  assert.equal(fs.readdirSync(path.dirname(item.target)).some((name) => /^\.workflow-builder-/.test(name)), false)
})

test("authoring transaction completes a replacement after publication linearizes", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, true)
  const original = Buffer.from("exact original")
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, original)
  const originalLink = fsPromises.link
  const originalReadFile = fsPromises.readFile
  let current = true
  let published = false
  fsPromises.link = async (source, destination) => {
    const result = await originalLink(source, destination)
    if (path.resolve(String(destination)) === item.target) published = true
    return result
  }
  fsPromises.readFile = async (target, ...args) => {
    const value = await originalReadFile(target, ...args)
    if (published && path.resolve(String(target)) === item.target) current = false
    return value
  }

  let result
  try {
    result = await commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes"), {
      canCommit: () => current,
      createPersistentBackup: true
    })
  } finally {
    fsPromises.link = originalLink
    fsPromises.readFile = originalReadFile
  }

  assert.equal(published, true)
  assert.equal(result, "committed")
  assert.equal(fs.readFileSync(item.target, "utf8"), "new bytes")
  const names = fs.readdirSync(path.dirname(item.target))
  assert.equal(names.some((name) => /^\.workflow-builder-/.test(name)), false)
  assert.equal(names.filter((name) => /^WORKFLOW\.backup-.*\.md$/.test(name)).length, 1)
})

test("authoring abort preserves an in-place replacement of its persistent backup", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, true)
  const original = Buffer.from("exact original")
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, original)
  const winner = Buffer.from("external target winner")
  const backupWinner = Buffer.from("external backup winner")
  const originalWriteFile = fsPromises.writeFile
  const originalLink = fsPromises.link
  let backupPath
  fsPromises.writeFile = async (target, ...args) => {
    const result = await originalWriteFile(target, ...args)
    if (/^WORKFLOW\.backup-.*\.md$/.test(path.basename(String(target)))) backupPath = String(target)
    return result
  }
  fsPromises.link = async (source, destination) => {
    if (path.resolve(String(destination)) === item.target) {
      await originalWriteFile(item.target, winner)
      await originalWriteFile(backupPath, backupWinner)
    }
    return originalLink(source, destination)
  }

  try {
    await assert.rejects(
      commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes"), { createPersistentBackup: true }),
      /rollback failed/
    )
  } finally {
    fsPromises.writeFile = originalWriteFile
    fsPromises.link = originalLink
  }

  assert.deepEqual(fs.readFileSync(item.target), winner)
  assert.ok(backupPath)
  assert.deepEqual(fs.readFileSync(backupPath), backupWinner)
  const rollbacks = fs.readdirSync(path.dirname(item.target)).filter((name) => /^\.workflow-builder-.*\.bak$/.test(name))
  assert.equal(rollbacks.length, 1)
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(item.target), rollbacks[0])), original)
})

test("authoring committed cleanup accepts temporary removal that mutates then rejects", async (t) => {
  const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
  const item = fixture(t, true)
  const original = Buffer.from("exact original")
  const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, original)
  const originalRm = fsPromises.rm
  let injected = false
  fsPromises.rm = async (target, options) => {
    if (!injected && String(target).endsWith(".tmp")) {
      injected = true
      await originalRm(target, options)
      throw new Error("temporary cleanup rejected after removal")
    }
    return originalRm(target, options)
  }

  let result
  try {
    result = await commitAuthoringFileAtomically(item.root, expectation, Buffer.from("new bytes"), { createPersistentBackup: true })
  } finally {
    fsPromises.rm = originalRm
  }

  assert.equal(result, "committed")
  assert.equal(injected, true)
  assert.equal(fs.readFileSync(item.target, "utf8"), "new bytes")
  const names = fs.readdirSync(path.dirname(item.target))
  assert.equal(names.some((name) => name.endsWith(".tmp")), false)
  assert.equal(names.filter((name) => /^WORKFLOW\.backup-.*\.md$/.test(name)).length, 1)
})

for (const existing of [true, false]) {
  for (const rejectionAfterPublish of [false, true]) {
    test(`authoring transaction preserves an in-place ${existing ? "replacement" : "creation"} after link ${rejectionAfterPublish ? "mutates then rejects" : "returns"}`, async (t) => {
      const { captureAuthoringFileExpectation, commitAuthoringFileAtomically } = require("../out/core/authoring/workflowAuthoringFileTransaction")
      const item = fixture(t, existing)
      const original = Buffer.from("exact original")
      const expectation = await captureAuthoringFileExpectation(item.root, item.relativePath, existing ? original : undefined)
      const winner = Buffer.from(`external in-place winner: ${existing}:${rejectionAfterPublish}`)
      const originalLink = fsPromises.link
      let injected = false
      fsPromises.link = async (source, destination) => {
        const result = await originalLink(source, destination)
        if (!injected && path.resolve(String(destination)) === item.target) {
          injected = true
          await fsPromises.writeFile(destination, winner)
          if (rejectionAfterPublish) throw new Error("authoring link rejected after in-place winner")
        }
        return result
      }

      try {
        await assert.rejects(
          commitAuthoringFileAtomically(item.root, expectation, Buffer.from("intended staged bytes"), { createPersistentBackup: existing }),
          /published authoring target changed/
        )
      } finally {
        fsPromises.link = originalLink
      }

      assert.equal(injected, true)
      assert.deepEqual(fs.readFileSync(item.target), winner)
      const names = fs.readdirSync(path.dirname(item.target))
      const rollbacks = names.filter((name) => /^\.workflow-builder-.*\.bak$/.test(name))
      const backups = names.filter((name) => /^WORKFLOW\.backup-.*\.md$/.test(name))
      assert.equal(rollbacks.length, existing ? 1 : 0)
      if (existing) assert.deepEqual(fs.readFileSync(path.join(path.dirname(item.target), rollbacks[0])), original)
      assert.deepEqual(backups, [])
    })
  }
}
