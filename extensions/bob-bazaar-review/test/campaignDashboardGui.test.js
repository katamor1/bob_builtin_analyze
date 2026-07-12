const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const { extensionRoot, readJson } = require("./helpers/sourceReader")

test("contributes and registers the Campaign Dashboard command", () => {
  const packageJson = readJson("package.json")
  const extensionSource = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")
  const command = "bobBazaar.openCampaignDashboard"
  assert.ok(packageJson.activationEvents.includes(`onCommand:${command}`))
  assert.ok(packageJson.contributes.commands.some((item) => item.command === command))
  assert.ok(packageJson.contributes.menus.commandPalette.some((item) => item.command === command))
  assert.ok(extensionSource.includes(`registerCommand("${command}"`))
})

test("Campaign Dashboard Webview keeps CSP, allowlist, and formula-safe exports", () => {
  const gui = fs.readFileSync(path.join(extensionRoot, "src", "ui", "campaignDashboardGui.ts"), "utf8")
  const dashboard = fs.readFileSync(path.join(extensionRoot, "src", "dashboard", "campaignDashboard.ts"), "utf8")
  assert.ok(gui.includes("Content-Security-Policy"))
  assert.ok(gui.includes("script-src 'nonce-${nonce}'"))
  assert.ok(gui.includes('message.type !== "bazaarCampaignDashboard.action"'))
  assert.ok(gui.includes('message.action !== "refresh"'))
  assert.doesNotMatch(gui, /onclick\s*=/i)
  assert.match(dashboard, /\^\[=\+\\-@\]/)
  assert.ok(dashboard.includes("renderCampaignDashboardCsv"))
})
