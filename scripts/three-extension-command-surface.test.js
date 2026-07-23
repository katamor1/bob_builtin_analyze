const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const extensionNames = [
  "workflow-register",
  "bob-bazaar-review",
  "bob-code-consistency-review"
]

const expectedVisible = [
  ["workflowRegister.openOperationHub", "Bob", "操作ハブを開く"],
  ["workflowRegister.openWorkflowBuilder", "Bob Workflow", "ワークフローを作成・編集"],
  ["bobBazaar.openReviewGui", "Bob Bazaar Review", "レビューを開始"],
  ["bobBazaar.authorProjectRulesFromDocuments", "Bob Bazaar Review", "資料からプロジェクト規約を作成"],
  ["bobCodeConsistency.openReviewWizard", "Bob Code Consistency Review", "整合プレレビューを開始"]
]

const obsolete = {
  viewIds: [
    ["workflowRegister", "operationHub"].join("."),
    ["workflowRegister", "runs"].join(".")
  ],
  generatedViewCommands: [
    ["workflowRegister", "operationHub", "focus"].join("."),
    ["workflowRegister", "runs", "focus"].join(".")
  ],
  panelTypes: [["workflowRegister", "operationHubPanel"].join(".")],
  commandIds: [
    ["workflowRegister", "openOperationHubPanel"].join("."),
    ["workflowRegister", "refreshRunsView"].join("."),
    ["bobTemplate", "openCustomizationStudio"].join("."),
    ["bobBazaar", "openCampaignDashboard"].join("."),
    ["bobBazaar", "openResultCaptureGui"].join("."),
    ["bobBazaar", "openHumanTriageGui"].join("."),
    ["bobCodeConsistency", "openResultCaptureGui"].join("."),
    ["bobCodeConsistency", "openHumanTriageGui"].join(".")
  ]
}

const allObsoleteIds = Object.values(obsolete).flat()
const obsoleteKinds = new Map(
  Object.entries(obsolete).flatMap(([kind, ids]) => ids.map((id) => [id, kind]))
)

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

function packageInfo(extensionName) {
  const relativePath = `extensions/${extensionName}/package.json`
  return { extensionName, relativePath, packageJson: readJson(relativePath) }
}

function commandPaletteEntries(packageJson) {
  return packageJson.contributes?.menus?.commandPalette ?? []
}

function visibleTriples(packageJson) {
  const commands = new Map(
    (packageJson.contributes?.commands ?? []).map((entry) => [entry.command, entry])
  )
  return commandPaletteEntries(packageJson)
    .filter((entry) => entry.when !== "false")
    .map((entry) => {
      const command = commands.get(entry.command)
      assert.ok(command, `commandPalette references unknown command ${entry.command}`)
      return [entry.command, command.category, command.title]
    })
}

function identifierPattern(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![A-Za-z0-9_.-])${escaped}(?![A-Za-z0-9_.-])`)
}

function findObsoleteId(text) {
  return allObsoleteIds.find((id) => identifierPattern(id).test(text))
}

function collectFiles(root, predicate) {
  if (!fs.existsSync(root)) return []
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "out" || entry.name === "dist") continue
    const absolutePath = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...collectFiles(absolutePath, predicate))
    else if (entry.isFile() && predicate(absolutePath)) result.push(absolutePath)
  }
  return result
}

function liveTextFiles() {
  const files = []
  for (const extensionName of extensionNames) {
    for (const subdir of ["src", "test"]) {
      files.push(...collectFiles(
        path.join(repoRoot, "extensions", extensionName, subdir),
        (file) => /\.(?:[cm]?[jt]sx?|json|ya?ml|md|html|css)$/.test(file)
      ))
    }
  }
  files.push(...collectFiles(path.join(repoRoot, "docs", "workflows"), () => true))
  files.push(...collectFiles(path.join(repoRoot, "scripts"), (file) => file !== __filename))
  files.push(...collectFiles(path.join(repoRoot, ".github", "workflows"), () => true))
  return files.sort()
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split("\n").length
}

function textualObsoleteMatches() {
  const matches = []
  for (const absolutePath of liveTextFiles()) {
    const text = fs.readFileSync(absolutePath, "utf8")
    for (const id of allObsoleteIds) {
      const pattern = new RegExp(identifierPattern(id).source, "g")
      for (const match of text.matchAll(pattern)) {
        matches.push({
          path: path.relative(repoRoot, absolutePath),
          line: lineNumber(text, match.index),
          id,
          kind: obsoleteKinds.get(id)
        })
      }
    }
  }
  return matches
}

function manifestObsoleteMatches() {
  const matches = []
  for (const { relativePath, packageJson } of extensionNames.map(packageInfo)) {
    const fields = []
    for (const command of packageJson.contributes?.commands ?? []) {
      fields.push(["contributes.commands", command.command])
    }
    for (const activationEvent of packageJson.activationEvents ?? []) {
      if (activationEvent.startsWith("onCommand:")) fields.push(["activationEvents.command", activationEvent.slice("onCommand:".length)])
      if (activationEvent.startsWith("onView:")) fields.push(["activationEvents.view", activationEvent.slice("onView:".length)])
    }
    for (const [container, views] of Object.entries(packageJson.contributes?.views ?? {})) {
      for (const view of views) fields.push([`contributes.views.${container}`, view.id])
    }
    for (const [menu, entries] of Object.entries(packageJson.contributes?.menus ?? {})) {
      for (const entry of entries) fields.push([`contributes.menus.${menu}`, entry.command])
    }
    for (const [field, value] of fields) {
      if (allObsoleteIds.includes(value)) {
        matches.push({ path: relativePath, field, id: value, kind: obsoleteKinds.get(value) })
      }
    }
  }
  return matches
}

function sourceContainsRegistration(extensionName, commandId) {
  const files = collectFiles(
    path.join(repoRoot, "extensions", extensionName, "src"),
    (file) => /\.[cm]?tsx?$/.test(file)
  )
  return files.some((file) => {
    const source = fs.readFileSync(file, "utf8")
    const escaped = commandId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`registerCommand\\(\\s*["']${escaped}["']`).test(source)
  })
}

test("the cross-extension Command Palette exposes exactly the five approved entries", () => {
  const actual = extensionNames.flatMap((name) => visibleTriples(packageInfo(name).packageJson))
  assert.deepEqual(actual, expectedVisible)
})

test("every non-public contributed command has an explicit hidden Command Palette entry", () => {
  const publicIds = new Set(expectedVisible.map(([command]) => command))
  for (const { extensionName, packageJson } of extensionNames.map(packageInfo)) {
    const paletteEntries = commandPaletteEntries(packageJson)
    const paletteByCommand = new Map(paletteEntries.map((entry) => [entry.command, entry]))
    assert.equal(paletteByCommand.size, paletteEntries.length, `${extensionName}: duplicate commandPalette entry`)
    assert.equal(paletteEntries.length, packageJson.contributes.commands.length, `${extensionName}: commandPalette partition`)
    for (const command of packageJson.contributes?.commands ?? []) {
      const palette = paletteByCommand.get(command.command)
      assert.ok(palette, `${extensionName}: missing commandPalette entry for ${command.command}`)
      assert.equal(
        palette.when,
        publicIds.has(command.command) ? undefined : "false",
        `${extensionName}: unexpected visibility for ${command.command}`
      )
    }
  }
})

test("representative workflow commands retain activation, contribution, and runtime registration", () => {
  const representativeCommands = [
    ["workflow-register", "workflowRegister.runWorkflow"],
    ["workflow-register", "bobTemplate.generateWorkflow"],
    ["bob-bazaar-review", "bobBazaar.records.createRecord"],
    ["bob-code-consistency-review", "bobCodeConsistency.initializeWorkspace"]
  ]
  for (const [extensionName, commandId] of representativeCommands) {
    const packageJson = packageInfo(extensionName).packageJson
    assert.ok(packageJson.activationEvents.includes(`onCommand:${commandId}`), `${commandId}: activation`)
    assert.ok(packageJson.contributes.commands.some((entry) => entry.command === commandId), `${commandId}: contribution`)
    assert.ok(sourceContainsRegistration(extensionName, commandId), `${commandId}: runtime registration`)
    const palette = commandPaletteEntries(packageJson).find((entry) => entry.command === commandId)
    assert.deepEqual(palette, { command: commandId, when: "false" }, `${commandId}: hidden palette entry`)
  }
})

test("obsolete matcher recognizes every exact ID and preserves retained run-retention settings", () => {
  for (const id of allObsoleteIds) assert.equal(findObsoleteId(id), id, id)
  const obsoleteRunsView = ["workflowRegister", "runs"].join(".")
  assert.equal(findObsoleteId(`view == ${obsoleteRunsView}`), obsoleteRunsView)
  assert.equal(findObsoleteId("workflowRegister.runs.retention.enabled"), undefined)
  assert.equal(findObsoleteId('getConfiguration("workflowRegister.runs.retention")'), undefined)
})

test("live manifests contain no exact obsolete command or view fields", () => {
  assert.deepEqual(manifestObsoleteMatches(), [])
})

test("live source, tests, workflow templates, scripts, and workflow YAML contain no obsolete token", () => {
  const matches = textualObsoleteMatches()
  assert.deepEqual(
    matches,
    [],
    matches.map((match) => `${match.path}:${match.line}: ${match.kind} ${match.id}`).join("\n")
  )
})
