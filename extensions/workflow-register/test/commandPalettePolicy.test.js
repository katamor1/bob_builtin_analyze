const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot, readJson } = require("./helpers/sourceReader")

const expectedCategory = "Bob Workflow"

function commandPaletteCommands(packageJson) {
  const paletteIds = new Set(packageJson.contributes.menus.commandPalette.map((entry) => entry.command))
  return packageJson.contributes.commands.filter((command) => paletteIds.has(command.command))
}

test("Command Palette display names use the approved Bob Workflow category before the colon", () => {
  const packageJson = readJson("package.json")
  const commands = commandPaletteCommands(packageJson)
  assert.ok(commands.length > 0, "commandPalette must expose commands")

  for (const command of commands) {
    assert.equal(command.category, expectedCategory, `${command.command} category`)
    assert.doesNotMatch(command.title, /[:：]/, `${command.command} title must not duplicate the Command Palette category`)

    const displayName = `${command.category}: ${command.title}`
    const prefix = displayName.slice(0, displayName.indexOf(":"))
    assert.equal(prefix, expectedCategory, `${command.command} prefix before colon`)
    assert.ok(displayName.startsWith(`${expectedCategory}: `), `${command.command} display name must use the approved category`)
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
