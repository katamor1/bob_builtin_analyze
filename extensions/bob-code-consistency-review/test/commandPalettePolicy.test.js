const assert = require("node:assert/strict")
const { test } = require("node:test")

const { readJson } = require("./helpers/sourceReader")

const expectedVisible = [
  ["bobCodeConsistency.openReviewWizard", "Bob Code Consistency Review", "整合プレレビューを開始"]
]

test("Command Palette exposes only the approved consistency-review entry point", () => {
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
