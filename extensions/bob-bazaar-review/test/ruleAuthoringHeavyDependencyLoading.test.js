const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")
const { createDocxFixture, createXlsxFixture } = require("./helpers/ruleDocumentFixtures")

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

for (const fixture of [
  {
    label: "DOCX",
    fileName: "rules.docx",
    bytes: createDocxFixture(),
    modulePath: "ruleAuthoring/extraction/docxExtractor.js",
    functionName: "extractDocx",
    expected: ["mammoth", "cheerio"],
    absent: ["read-excel-file"]
  },
  {
    label: "XLSX",
    fileName: "rules.xlsx",
    bytes: createXlsxFixture(),
    modulePath: "ruleAuthoring/extraction/xlsxExtractor.js",
    functionName: "extractXlsx",
    expected: ["read-excel-file"],
    absent: ["mammoth", "cheerio"]
  }
]) {
  test(`${fixture.label} dependencies load only after its matching extractor call`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bob-rule-heavy-"))
    const filePath = path.join(directory, fixture.fileName)
    fs.writeFileSync(filePath, fixture.bytes)
    try {
      const modulePath = path.join(extensionRoot, "out", fixture.modulePath)
      const script = `
        function loaded(name) {
          return Object.keys(require.cache).some((cachePath) =>
            cachePath.includes("node_modules" + require("node:path").sep + name + require("node:path").sep)
          )
        }
        const extractor = require(${JSON.stringify(modulePath)})[${JSON.stringify(fixture.functionName)}]
        for (const name of ${JSON.stringify([...fixture.expected, ...fixture.absent])}) {
          if (loaded(name)) throw new Error(name + " loaded before extractor call")
        }
        extractor(${JSON.stringify(filePath)}, {
          sourceId: "src-0123456789ab",
          maxChunkBytes: 32768
        }).then(() => {
          for (const name of ${JSON.stringify(fixture.expected)}) {
            if (!loaded(name)) throw new Error(name + " missing after matching extractor call")
          }
          for (const name of ${JSON.stringify(fixture.absent)}) {
            if (loaded(name)) throw new Error(name + " loaded by the wrong extractor")
          }
        })
      `
      const result = spawnSync(process.execPath, ["-e", script], {
        cwd: extensionRoot,
        encoding: "utf8",
        timeout: 10_000
      })
      assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
}
