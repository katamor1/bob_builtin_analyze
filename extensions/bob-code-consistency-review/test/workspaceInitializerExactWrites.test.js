const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")
const { initializeCodeConsistencyWorkspace } = requireWithVscodeMock("../out/workspaceInitializer")

test("workspace initialization preserves arbitrary existing bytes in both backups", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-consistency-init-exact-"))
  const workflowPath = path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  const reviewInputPath = path.join(workspaceRoot, "review-input.yaml")
  const previousWorkflow = Buffer.from([0x70, 0x72, 0x65, 0x76, 0x0a, 0x82, 0xa0, 0x81, 0x40, 0xff, 0x00])
  const existingReviewInputBefore = Buffer.from([0x72, 0x65, 0x76, 0x69, 0x65, 0x77, 0x3a, 0x0a, 0x82, 0xa2, 0x81, 0x40, 0xfe])
  await fs.mkdir(path.dirname(workflowPath), { recursive: true })
  await fs.writeFile(workflowPath, previousWorkflow)
  await fs.writeFile(reviewInputPath, existingReviewInputBefore)

  const result = await initializeCodeConsistencyWorkspace({
    context: { asAbsolutePath: (relativePath) => path.join(extensionRoot, relativePath) },
    workspaceRoot
  })

  const bundledWorkflow = await fs.readFile(
    path.join(extensionRoot, "templates", ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  )
  const existingReviewInputAfter = await fs.readFile(reviewInputPath)
  assert.deepEqual(existingReviewInputAfter, existingReviewInputBefore)
  assert.deepEqual(await fs.readFile(workflowPath), bundledWorkflow)
  assert.ok(result.backupPath)
  assert.ok(result.reviewInputBackupPath)
  assert.deepEqual(await fs.readFile(result.backupPath), previousWorkflow)
  assert.deepEqual(await fs.readFile(result.reviewInputBackupPath), existingReviewInputBefore)
  assert.match(result.message, /review-input\.yaml.*上書きせず/)
})

test("workspace initialization returns distinct workflow and review-input outcomes", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-consistency-init-outcomes-"))
  const workflowPath = path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  const reviewInputPath = path.join(workspaceRoot, "review-input.yaml")
  await fs.mkdir(path.dirname(workflowPath), { recursive: true })
  await fs.writeFile(workflowPath, "previous workflow\n", "utf8")
  await fs.writeFile(reviewInputPath, "review:\n  id: existing-project-review\n", "utf8")

  const result = await initializeCodeConsistencyWorkspace({
    context: { asAbsolutePath: (relativePath) => path.join(extensionRoot, relativePath) },
    workspaceRoot
  })

  assert.equal(result.status, "updated")
  assert.deepEqual(result.workflowResult, {
    status: "updated",
    path: workflowPath,
    backupPath: result.backupPath,
    message: `コード整合プレレビュー workflow を更新しました: ${workflowPath}`
  })
  assert.deepEqual(result.reviewInputResult, {
    status: "unchanged",
    path: reviewInputPath,
    backupPath: result.reviewInputBackupPath,
    message: `既存の review-input.yaml を検出したため上書きせず、バックアップだけ作成しました: ${result.reviewInputBackupPath}`
  })
})

test("workspace initialization rejects an external review-input path before writing anything", async (t) => {
  const workspaceRoot = await temporaryDirectory(t, "bob-consistency-init-contained-")
  const outsideRoot = await temporaryDirectory(t, "bob-consistency-init-outside-")
  const outsideReviewInput = path.join(outsideRoot, "review-input.yaml")
  let rejected = false

  try {
    await initializeCodeConsistencyWorkspace({
      context: extensionContext(),
      workspaceRoot,
      reviewInputPath: outsideReviewInput
    })
  } catch {
    rejected = true
  }

  assert.deepEqual({
    rejected,
    outsideCreated: await pathExists(outsideReviewInput),
    workspaceEntries: await fs.readdir(workspaceRoot)
  }, {
    rejected: true,
    outsideCreated: false,
    workspaceEntries: []
  })
})

test("workspace initialization rejects direct targets and escaping existing parents for every write surface", async (t) => {
  const observations = []
  const directCases = [
    {
      name: "workflow target",
      relativePath: path.join(".bob", "workflows", "code-consistency-review", "WORKFLOW.md"),
      prepareReviewInput: false
    },
    { name: "review-input target", relativePath: "review-input.yaml", prepareReviewInput: false },
    {
      name: "placeholder target",
      relativePath: path.join("docs", "review-input-placeholder.md"),
      prepareReviewInput: false
    },
    { name: ".gitignore target", relativePath: ".gitignore", prepareReviewInput: true }
  ]

  for (const scenario of directCases) {
    const workspaceRoot = await temporaryDirectory(t, `bob-consistency-init-${scenario.name.replace(/[^a-z]/gi, "-")}-`)
    const outsideRoot = await temporaryDirectory(t, "bob-consistency-init-direct-outside-")
    const outsidePath = path.join(outsideRoot, "victim")
    const outsideBytes = Buffer.from(`${scenario.name} outside bytes\n`, "utf8")
    const target = path.join(workspaceRoot, scenario.relativePath)
    await fs.writeFile(outsidePath, outsideBytes)
    await fs.mkdir(path.dirname(target), { recursive: true })
    if (!await createSymlink(t, outsidePath, target, "file")) return
    if (scenario.prepareReviewInput) {
      await fs.writeFile(path.join(workspaceRoot, "review-input.yaml"), "review:\n  id: existing\n", "utf8")
    }

    observations.push(await observeRejectedInitialization(
      scenario.name,
      workspaceRoot,
      {},
      async () => (await fs.readFile(outsidePath)).equals(outsideBytes)
    ))
  }

  const parentCases = [
    {
      name: "workflow parent",
      linkRelativePath: ".bob",
      escapedRelativePath: path.join("workflows", "code-consistency-review", "WORKFLOW.md"),
      options: {}
    },
    {
      name: "review-input parent",
      linkRelativePath: "custom-review",
      escapedRelativePath: "review-input.yaml",
      options: { reviewInputPath: path.join("custom-review", "review-input.yaml") }
    },
    {
      name: "placeholder parent",
      linkRelativePath: "docs",
      escapedRelativePath: "review-input-placeholder.md",
      options: {}
    }
  ]

  for (const scenario of parentCases) {
    const workspaceRoot = await temporaryDirectory(t, "bob-consistency-init-parent-")
    const outsideRoot = await temporaryDirectory(t, "bob-consistency-init-parent-outside-")
    const linkPath = path.join(workspaceRoot, scenario.linkRelativePath)
    const escapedPath = path.join(outsideRoot, scenario.escapedRelativePath)
    if (!await createSymlink(t, outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir")) return

    observations.push(await observeRejectedInitialization(
      scenario.name,
      workspaceRoot,
      scenario.options,
      async () => !await pathExists(escapedPath)
    ))
  }

  assert.deepEqual(observations, observations.map(({ name }) => ({
    name,
    rejected: true,
    outsidePreserved: true
  })))
})

test("workspace initialization never overwrites a review input that appears during exclusive creation", async (t) => {
  const workspaceRoot = await temporaryDirectory(t, "bob-consistency-init-review-race-")
  const reviewInputPath = path.join(workspaceRoot, "review-input.yaml")
  const concurrentBytes = Buffer.from([0x72, 0x61, 0x63, 0x65, 0x3a, 0x0a, 0x82, 0xa0, 0xff])
  const originalOpen = fs.open
  const originalWriteFile = fs.writeFile
  let injected = false
  const injectConcurrentFile = async (target) => {
    if (injected || path.resolve(String(target)) !== path.resolve(reviewInputPath)) return
    injected = true
    await originalWriteFile(reviewInputPath, concurrentBytes)
  }

  fs.open = async (target, flags, ...args) => {
    if (flags === "wx") await injectConcurrentFile(target)
    return originalOpen(target, flags, ...args)
  }
  fs.writeFile = async (target, ...args) => {
    await injectConcurrentFile(target)
    return originalWriteFile(target, ...args)
  }

  let result
  try {
    result = await initializeCodeConsistencyWorkspace({ context: extensionContext(), workspaceRoot })
  } finally {
    fs.open = originalOpen
    fs.writeFile = originalWriteFile
  }

  assert.equal(injected, true)
  assert.deepEqual(await fs.readFile(reviewInputPath), concurrentBytes)
  assert.equal(result.reviewInputResult.status, "unchanged")
  assert.ok(result.reviewInputBackupPath)
  assert.deepEqual(await fs.readFile(result.reviewInputBackupPath), concurrentBytes)
})

test("workspace workflow publication failure restores original bytes and removes transaction artifacts", async (t) => {
  const workspaceRoot = await temporaryDirectory(t, "bob-consistency-init-rollback-")
  const workflowPath = path.join(workspaceRoot, ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
  const originalBytes = Buffer.from([0x6f, 0x6c, 0x64, 0x0a, 0x82, 0xa0, 0xff])
  await fs.mkdir(path.dirname(workflowPath), { recursive: true })
  await fs.writeFile(workflowPath, originalBytes)

  const originalLink = fs.link
  const originalRename = fs.rename
  const originalWriteFile = fs.writeFile
  let injected = false
  const publicationFailure = async (source, target, operation) => {
    if (!injected && path.resolve(String(target)) === path.resolve(workflowPath)) {
      injected = true
      throw new Error(`forced workflow ${operation} failure`)
    }
    return undefined
  }

  fs.link = async (source, target, ...args) => {
    await publicationFailure(source, target, "link")
    return originalLink(source, target, ...args)
  }
  fs.rename = async (source, target, ...args) => {
    await publicationFailure(source, target, "rename")
    return originalRename(source, target, ...args)
  }
  fs.writeFile = async (target, ...args) => {
    if (!injected && path.resolve(String(target)) === path.resolve(workflowPath)) {
      injected = true
      await originalWriteFile(target, Buffer.from("partial workflow write\n", "utf8"))
      throw new Error("forced workflow direct-write failure")
    }
    return originalWriteFile(target, ...args)
  }

  try {
    await assert.rejects(
      initializeCodeConsistencyWorkspace({ context: extensionContext(), workspaceRoot }),
      /forced workflow/
    )
  } finally {
    fs.link = originalLink
    fs.rename = originalRename
    fs.writeFile = originalWriteFile
  }

  assert.equal(injected, true)
  assert.deepEqual(await fs.readFile(workflowPath), originalBytes)
  assert.deepEqual(
    (await listRelativeFiles(workspaceRoot)).filter((entry) => /(?:\.bak-|\.tmp$|rollback|workspace-init)/i.test(entry)),
    []
  )
})

function extensionContext() {
  return { asAbsolutePath: (relativePath) => path.join(extensionRoot, relativePath) }
}

async function temporaryDirectory(t, prefix) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

async function observeRejectedInitialization(name, workspaceRoot, options, outsideIsPreserved) {
  let rejected = false
  try {
    await initializeCodeConsistencyWorkspace({ context: extensionContext(), workspaceRoot, ...options })
  } catch {
    rejected = true
  }
  return { name, rejected, outsidePreserved: await outsideIsPreserved() }
}

async function createSymlink(t, target, linkPath, type) {
  try {
    await fs.symlink(target, linkPath, type)
    return true
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`symlink creation is unavailable: ${error.code}`)
      return false
    }
    throw error
  }
}

async function pathExists(filePath) {
  try {
    await fs.lstat(filePath)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

async function listRelativeFiles(root) {
  const result = []
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.shift()
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(fullPath)
      else result.push(path.relative(root, fullPath).replace(/\\/g, "/"))
    }
  }
  return result.sort()
}

function requireWithVscodeMock(modulePath) {
  const originalLoad = Module._load
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") return {}
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(modulePath) } finally { Module._load = originalLoad }
}
