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
  const workspaceFolder = smokeWorkspaceFolder()
  const config = {
    files: smokeTestFiles(),
    version: "1.106.1",
    extensionDevelopmentPath: process.cwd(),
    skipExtensionDependencies: true,
    ...(workspaceFolder ? { workspaceFolder } : {}),
    mocha: {
      timeout: 30_000,
      ui: "bdd"
    }
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  process.stdout.write(`Wrote ${configPath}\n`)
}

function smokeTestFiles() {
  const files = [__filename]
  const configured = process.env.SMOKE_EXTRA_FILES
  if (typeof configured !== "string" || configured.trim().length === 0) return files

  const seen = new Set(files.map((filePath) => path.resolve(filePath)))
  for (const entry of configured.split(",").map((value) => value.trim()).filter(Boolean)) {
    const resolved = path.resolve(process.cwd(), entry)
    if (!fs.existsSync(resolved)) {
      throw new Error(`Extension Host smoke extra test file does not exist: ${resolved}`)
    }
    if (!fs.statSync(resolved).isFile()) {
      throw new Error(`Extension Host smoke extra test path is not a file: ${resolved}`)
    }
    if (seen.has(resolved)) continue
    seen.add(resolved)
    files.push(resolved)
  }
  return files
}

function smokeWorkspaceFolder() {
  const configured = process.env.SMOKE_WORKSPACE_FOLDER
  if (typeof configured !== "string" || configured.trim().length === 0) return undefined

  const resolved = path.resolve(process.cwd(), configured.trim())
  if (!fs.existsSync(resolved)) {
    throw new Error(`Extension Host smoke workspace folder does not exist: ${resolved}`)
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Extension Host smoke workspace path is not a directory: ${resolved}`)
  }
  return resolved
}

function assertTestRuntimeAvailable() {
  const requiredPackages = [
    "@vscode/test-cli",
    "@vscode/test-electron"
  ]
  const missingPackages = []

  for (const packageName of requiredPackages) {
    try {
      require.resolve(packageName, { paths: [process.cwd()] })
    } catch {
      missingPackages.push(packageName)
    }
  }

  if (missingPackages.length > 0) {
    throw new Error(
      `Extension Host smoke requires these packages in the extension project: ${missingPackages.join(", ")}.`
    )
  }

  const cliBinaryName = process.platform === "win32" ? "vscode-test.cmd" : "vscode-test"
  const cliBinaryPath = path.join(process.cwd(), "node_modules", ".bin", cliBinaryName)
  if (!fs.existsSync(cliBinaryPath)) {
    throw new Error(`Extension Host smoke cannot find the project-local CLI binary: ${cliBinaryPath}`)
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
