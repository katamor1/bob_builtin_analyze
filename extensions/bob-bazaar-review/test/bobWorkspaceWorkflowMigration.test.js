const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

test("workspace initialization migrates only obsolete agent limits and preserves user prompts and command limits", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-workflow-migration-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const extensionRoot = path.resolve(__dirname, "..")
  await fs.cp(path.join(extensionRoot, "templates/.bob"), path.join(root, ".bob"), { recursive: true })
  const file = path.join(root, ".bob/workflows/bazaar-project-rule-review/WORKFLOW.md")
  const template = await fs.readFile(file, "utf8")
  const customized = template.replace("    resultKey: reviewAnalysis", "    resultKey: reviewAnalysis\n    maxResultBytes: 20000")
    .replace("    title: 変更内容をプロジェクト固有ルールに照らして分析", "    title: カスタム分析手順")
  await fs.writeFile(file, customized)
  const previews = []
  const originalLoad = Module._load
  const modulePath = require.resolve("../out/workspace/bobWorkspaceInit")
  delete require.cache[modulePath]
  Module._load = function(request, parent, isMain) {
    return request === "vscode" ? {
      workspace: { openTextDocument: async options => { previews.push(options.content); return {} } },
      window: { showTextDocument: async () => {}, showWarningMessage: async () => "更新" }
    } : originalLoad.call(this, request, parent, isMain)
  }
  let initialize
  try { initialize = require(modulePath).initializeBobWorkspaceFromTemplates } finally { Module._load = originalLoad }
  await initialize({ context: { asAbsolutePath: relative => path.join(extensionRoot, relative) },
    workspaceFolder: { uri: { fsPath: root } }, bzrPath: "bzr", serverName: "bazaar" })
  const migrated = await fs.readFile(file, "utf8")
  const expected = customized.replace(/(    resultKey: reviewAnalysis\r?\n)    maxResultBytes: 20000\r?\n/, "$1")
  assert.equal(migrated, expected, "only the obsolete agent property may change")
  assert.equal((migrated.match(/maxResultBytes:/g) || []).length, 2)
  assert.ok(previews.some(preview => preview.includes("-    maxResultBytes: 20000")))
  const backup = (await fs.readdir(path.dirname(file))).find(name => name.startsWith("WORKFLOW.md.bak-"))
  assert.ok(backup)
  assert.equal(await fs.readFile(path.join(path.dirname(file), backup), "utf8"), customized)
})
