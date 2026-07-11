#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")

if (process.argv.includes("--write-config")) {
  writeTestConfiguration()
} else {
  registerExtensionHostTests()
}

function writeTestConfiguration() {
  assertTestRuntimeAvailable()
  const configPath = path.join(process.cwd(), ".vscode-test.json")
  const config = {
    files: __filename,
    version: "1.106.1",
    extensionDevelopmentPath: process.cwd(),
    skipExtensionDependencies: true,
    mocha: {
      timeout: 30_000,
      ui: "bdd"
    }
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  process.stdout.write(`Wrote ${configPath}\n`)
}

function assertTestRuntimeAvailable() {
  try {
    require.resolve("@vscode/test-electron", { paths: [process.cwd()] })
  } catch {
    throw new Error(
      "@vscode/test-electron must be installed in the extension project before running Extension Host smoke tests."
    )
  }
}

function registerExtensionHostTests() {
  const assert = require("node:assert/strict")
  const vscode = require("vscode")

  describe("Extension Host activation smoke", () => {
    it("activates the extension and registers representative commands", async () => {
      const extensionId = requiredEnvironmentValue("SMOKE_EXTENSION_ID")
      const requiredCommands = requiredEnvironmentValue("SMOKE_COMMANDS")
        .split(",")
        .map((command) => command.trim())
        .filter(Boolean)

      assert.ok(requiredCommands.length > 0, "SMOKE_COMMANDS must include at least one command id")

      const extension = vscode.extensions.getExtension(extensionId)
      assert.ok(extension, `Extension Host did not discover ${extensionId}`)

      await extension.activate()
      assert.equal(extension.isActive, true, `${extensionId} did not activate`)

      const registeredCommands = new Set(await vscode.commands.getCommands(true))
      for (const command of requiredCommands) {
        assert.ok(registeredCommands.has(command), `${extensionId} did not register ${command}`)
      }
    })
  })
}

function requiredEnvironmentValue(name) {
  const value = process.env[name]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required for the Extension Host smoke test`)
  }
  return value.trim()
}
