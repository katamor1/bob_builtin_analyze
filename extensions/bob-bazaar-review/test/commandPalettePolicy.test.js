const assert = require("node:assert/strict")
const { test } = require("node:test")

const { readJson } = require("./helpers/sourceReader")

const expectedVisible = [
  ["bobBazaar.openReviewGui", "Bob Bazaar Review", "レビューを開始"],
  ["bobBazaar.authorProjectRulesFromDocuments", "Bob Bazaar Review", "資料からプロジェクト規約を作成"]
]

test("Command Palette exposes only the two approved Bazaar entry points", () => {
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
