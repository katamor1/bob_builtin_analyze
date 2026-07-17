const assert = require("node:assert/strict")
const { test } = require("node:test")

const { readJson } = require("./helpers/sourceReader")

const expectedCategory = "Bob Bazaar レビュー"

function commandPaletteCommands(packageJson) {
  const paletteIds = new Set(packageJson.contributes.menus.commandPalette.map((entry) => entry.command))
  return packageJson.contributes.commands.filter((command) => paletteIds.has(command.command))
}

test("Command Palette display names use the Japanese-first Bob category before the colon", () => {
  const packageJson = readJson("package.json")
  const commands = commandPaletteCommands(packageJson)
  assert.ok(commands.length > 0, "commandPalette must expose commands")

  for (const command of commands) {
    assert.equal(command.category, expectedCategory, `${command.command} category`)
    assert.doesNotMatch(command.title, /[:：]/, `${command.command} title must not duplicate the Command Palette category`)

    const displayName = `${command.category}: ${command.title}`
    const prefix = displayName.slice(0, displayName.indexOf(":"))
    assert.ok(displayName.startsWith("Bob "), `${command.command} display name must start with Bob`)
    assert.equal(prefix, expectedCategory, `${command.command} prefix before colon`)
  }
})
