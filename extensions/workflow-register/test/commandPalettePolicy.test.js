const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot, readJson } = require("./helpers/sourceReader")

const expectedVisible = [
  ["workflowRegister.openOperationHub", "Bob", "操作ハブを開く"],
  ["workflowRegister.openWorkflowBuilder", "Bob Workflow", "ワークフローを作成・編集"]
]

test("Command Palette exposes only the two approved workflow entry points", () => {
  const packageJson = readJson("package.json")
  const commands = new Map(packageJson.contributes.commands.map((command) => [command.command, command]))
  const visible = packageJson.contributes.menus.commandPalette
    .filter((entry) => entry.when !== "false")
    .map(({ command }) => [command, commands.get(command).category, commands.get(command).title])
  assert.deepEqual(visible, expectedVisible)

  const publicIds = new Set(expectedVisible.map(([command]) => command))
  for (const entry of packageJson.contributes.menus.commandPalette) {
    if (!publicIds.has(entry.command)) assert.equal(entry.when, "false", entry.command)
  }
})

test("extension-local docs document the Command Palette display-name policy", () => {
  const readme = fs.readFileSync(path.join(extensionRoot, "docs", "command-palette-policy-ja.md"), "utf8")

  for (const phrase of [
    "Command Palette 表示名ポリシー",
    "`Bob Workflow: <日本語の操作名>`",
    "`category`",
    "`title`",
    "英語の機能領域名 `Bob Workflow`"
  ]) {
    assert.ok(readme.includes(phrase), `local docs must document: ${phrase}`)
  }
})
