const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")

function loadBobWorkspaceInit() {
  const modulePath = require.resolve("../out/workspace/bobWorkspaceInit")
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return {}
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

test("refreshTemplateFile backs up an existing different file before overwriting", async () => {
  const { refreshTemplateFile } = require("../out/workspace/templateRefresh")
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-template-refresh-"))
  const source = path.join(root, "source", "WORKFLOW.md")
  const target = path.join(root, "workspace", ".bob", "workflows", "review", "WORKFLOW.md")
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(source, "template workflow\n", "utf8")
  await fs.writeFile(target, "custom workflow\n", "utf8")

  const result = await refreshTemplateFile(source, target)

  assert.equal(result.refreshed, true)
  assert.ok(result.backupPath)
  assert.equal(await fs.readFile(target, "utf8"), "template workflow\n")
  assert.equal(await fs.readFile(result.backupPath, "utf8"), "custom workflow\n")
})

test("refreshTemplateFile skips identical files without creating backups", async () => {
  const { refreshTemplateFile } = require("../out/workspace/templateRefresh")
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-template-refresh-same-"))
  const source = path.join(root, "source", "WORKFLOW.md")
  const target = path.join(root, "workspace", ".bob", "workflows", "review", "WORKFLOW.md")
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(source, "template workflow\n", "utf8")
  await fs.writeFile(target, "template workflow\n", "utf8")

  const result = await refreshTemplateFile(source, target)
  const entries = await fs.readdir(path.dirname(target))

  assert.equal(result.refreshed, false)
  assert.equal(result.backupPath, undefined)
  assert.deepEqual(entries, ["WORKFLOW.md"])
})

test("refreshTemplateFile leaves an existing different file untouched when overwrite confirmation is declined", async () => {
  const { refreshTemplateFile } = require("../out/workspace/templateRefresh")
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-template-refresh-decline-"))
  const source = path.join(root, "source", "WORKFLOW.md")
  const target = path.join(root, "workspace", ".bob", "workflows", "review", "WORKFLOW.md")
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(source, "template workflow\n", "utf8")
  await fs.writeFile(target, "custom workflow\n", "utf8")

  const result = await refreshTemplateFile(source, target, {
    confirmOverwrite: async () => false
  })
  const entries = await fs.readdir(path.dirname(target))

  assert.equal(result.refreshed, false)
  assert.equal(result.backupPath, undefined)
  assert.equal(await fs.readFile(target, "utf8"), "custom workflow\n")
  assert.deepEqual(entries, ["WORKFLOW.md"])
})

test("refreshTemplateFile passes a bounded diff preview to overwrite confirmation", async () => {
  const { refreshTemplateFile } = require("../out/workspace/templateRefresh")
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bazaar-template-refresh-preview-"))
  const source = path.join(root, "source", "WORKFLOW.md")
  const target = path.join(root, "workspace", ".bob", "workflows", "review", "WORKFLOW.md")
  const previews = []
  await fs.mkdir(path.dirname(source), { recursive: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(source, ["name: template", "workspaceRequired: false", "new step"].join("\n"), "utf8")
  await fs.writeFile(target, ["name: custom", "workspaceRequired: true", "custom step"].join("\n"), "utf8")

  const result = await refreshTemplateFile(source, target, {
    confirmOverwrite: async (preview) => {
      previews.push(preview)
      return true
    }
  })

  assert.equal(result.refreshed, true)
  assert.equal(previews.length, 1)
  assert.equal(previews[0].sourcePath, source)
  assert.equal(previews[0].targetPath, target)
  assert.match(previews[0].diffPreview, /--- .*WORKFLOW\.md/)
  assert.match(previews[0].diffPreview, /\+\+\+ .*WORKFLOW\.md/)
  assert.match(previews[0].diffPreview, /-workspaceRequired: true/)
  assert.match(previews[0].diffPreview, /\+workspaceRequired: false/)
  assert.ok(previews[0].diffPreview.length <= 12000)
})

test("authoring readiness is separate, missing-only, and refreshes only its managed workflow", async (t) => {
  const {
    getBobWorkspaceStatus,
    getRuleAuthoringWorkspaceStatus,
    initializeRuleAuthoringWorkspaceFromTemplates
  } = loadBobWorkspaceInit()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-authoring-readiness-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const workspaceFolder = { uri: { fsPath: root } }
  const context = {
    asAbsolutePath(relative) {
      return path.join(extensionRoot, relative)
    }
  }

  const legacyBefore = await getBobWorkspaceStatus(workspaceFolder)
  const authoringBefore = await getRuleAuthoringWorkspaceStatus(workspaceFolder)
  assert.equal(legacyBefore.initialized, false)
  assert.equal(authoringBefore.initialized, false)
  assert.equal(
    legacyBefore.missing.some((item) => item.includes("bazaar-project-rule-authoring")),
    false,
    "legacy workspace readiness must not gain Task 9 requirements"
  )

  const initialized = await initializeRuleAuthoringWorkspaceFromTemplates({
    context,
    workspaceFolder,
    confirmWorkflowRefresh: async () => {
      throw new Error("a missing workflow must not request overwrite confirmation")
    }
  })
  assert.equal(initialized.initialized, true)
  assert.equal(await fs.readFile(path.join(root, ".bob", "review", "project-context.md"), "utf8"), "")
  assert.equal(await fs.readFile(path.join(root, ".bob", "review", "review-prompt-addendum.md"), "utf8"), "")
  assert.equal(
    await fs.readFile(path.join(root, ".bob", "review", "rule-authoring", ".gitignore"), "utf8"),
    "/*\n!/.gitignore\n"
  )

  const contextPath = path.join(root, ".bob", "review", "project-context.md")
  const authoringWorkflowPath = path.join(
    root,
    ".bob",
    "workflows",
    "bazaar-project-rule-authoring",
    "WORKFLOW.md"
  )
  const reviewWorkflowPath = path.join(
    root,
    ".bob",
    "workflows",
    "bazaar-project-rule-review",
    "WORKFLOW.md"
  )
  await fs.writeFile(contextPath, "project-owned context\n", "utf8")
  await fs.writeFile(authoringWorkflowPath, "workspaceRequired: true\ntitle: custom authoring\n", "utf8")
  await fs.mkdir(path.dirname(reviewWorkflowPath), { recursive: true })
  await fs.writeFile(reviewWorkflowPath, "custom review workflow\n", "utf8")

  const declined = await initializeRuleAuthoringWorkspaceFromTemplates({
    context,
    workspaceFolder,
    confirmWorkflowRefresh: async () => false
  })
  assert.equal(declined.initialized, false)
  assert.equal(await fs.readFile(contextPath, "utf8"), "project-owned context\n")
  assert.equal(await fs.readFile(authoringWorkflowPath, "utf8"), "workspaceRequired: true\ntitle: custom authoring\n")
  assert.equal(await fs.readFile(reviewWorkflowPath, "utf8"), "custom review workflow\n")

  const accepted = await initializeRuleAuthoringWorkspaceFromTemplates({
    context,
    workspaceFolder,
    confirmWorkflowRefresh: async () => true
  })
  assert.equal(accepted.initialized, true)
  assert.equal(await fs.readFile(contextPath, "utf8"), "project-owned context\n")
  assert.match(await fs.readFile(authoringWorkflowPath, "utf8"), /title: 資料からプロジェクト規約を作成/)
  assert.equal(await fs.readFile(reviewWorkflowPath, "utf8"), "custom review workflow\n")
  const authoringEntries = await fs.readdir(path.dirname(authoringWorkflowPath))
  assert.ok(authoringEntries.some((entry) => /^WORKFLOW\.md\.bak-/.test(entry)))
})
