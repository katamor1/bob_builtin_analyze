const assert = require("node:assert/strict")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

test("normal extension activation does not load rule authoring heavy dependencies", () => {
  const extensionEntry = path.join(extensionRoot, "out", "extension.js")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    const registeredCommands = []
    const disposable = { dispose() {} }
    const vscode = {
      commands: {
        registerCommand(commandId) {
          registeredCommands.push(commandId)
          return disposable
        }
      },
      extensions: {
        getExtension() { return undefined },
        onDidChange() { return disposable }
      }
    }
    Module._load = function(request, parent, isMain) {
      if (request === "vscode") return vscode
      return originalLoad.call(this, request, parent, isMain)
    }

    const extension = require(${JSON.stringify(extensionEntry)})
    const context = {
      subscriptions: [],
      asAbsolutePath(value) { return value },
      extensionPath: ${JSON.stringify(extensionRoot)}
    }
    extension.activate(context)

    if (!registeredCommands.includes("bobBazaar.openReviewGui")) {
      throw new Error("stubbed normal activation did not register the expected command")
    }
    const heavyModules = Object.keys(require.cache).filter((cachePath) =>
      /[\\\\/]node_modules[\\\\/](?:mammoth|cheerio|read-excel-file)(?:[\\\\/]|$)/.test(cachePath)
    )
    for (const registration of [...context.subscriptions].reverse()) registration.dispose?.()
    if (heavyModules.length > 0) {
      throw new Error("normal activation loaded heavy rule-authoring dependencies:\\n" + heavyModules.join("\\n"))
    }
  `

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: extensionRoot,
    encoding: "utf8",
    timeout: 10_000
  })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})
