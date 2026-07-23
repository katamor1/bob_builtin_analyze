const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const contractPath = path.join(repoRoot, "scripts", "three-extension-documentation-contract.json")

const canonical = {
  hub: "workflowRegister.openOperationHub",
  builder: "workflowRegister.openWorkflowBuilder",
  bazaar: "bobBazaar.openReviewGui",
  consistency: "bobCodeConsistency.openReviewWizard"
}

const obsolete = [
  { kind: "view", token: ["workflowRegister", "operationHub"].join("."), replacements: [canonical.hub] },
  { kind: "view", token: ["workflowRegister", "runs"].join("."), replacements: [canonical.hub] },
  { kind: "generated command", token: ["workflowRegister", "operationHub", "focus"].join("."), replacements: [canonical.hub] },
  { kind: "generated command", token: ["workflowRegister", "runs", "focus"].join("."), replacements: [canonical.hub] },
  { kind: "panel type", token: ["workflowRegister", "operationHubPanel"].join("."), replacements: [canonical.hub] },
  { kind: "command", token: ["workflowRegister", "openOperationHubPanel"].join("."), replacements: [canonical.hub] },
  { kind: "command", token: ["workflowRegister", "refreshRunsView"].join("."), replacements: [canonical.hub] },
  { kind: "command", token: ["bobTemplate", "openCustomizationStudio"].join("."), replacements: [canonical.builder] },
  { kind: "command", token: ["bobBazaar", "openCampaignDashboard"].join("."), replacements: [canonical.bazaar] },
  { kind: "command", token: ["bobBazaar", "openResultCaptureGui"].join("."), replacements: [canonical.bazaar] },
  { kind: "command", token: ["bobBazaar", "openHumanTriageGui"].join("."), replacements: [canonical.bazaar] },
  { kind: "command", token: ["bobCodeConsistency", "openResultCaptureGui"].join("."), replacements: [canonical.consistency] },
  { kind: "command", token: ["bobCodeConsistency", "openHumanTriageGui"].join("."), replacements: [canonical.consistency] },
  { kind: "label", token: ["Operation", "Hub"].join(" "), replacements: [canonical.hub] },
  { kind: "label", token: ["Runs", "View"].join(" "), replacements: [canonical.hub] },
  { kind: "label", token: ["Run", "Monitor"].join(" "), replacements: [canonical.hub] },
  { kind: "label", token: ["Template", "Studio"].join(" "), replacements: [canonical.builder] },
  { kind: "label", token: ["Result", "Capture"].join(" "), replacements: [canonical.bazaar, canonical.consistency] },
  { kind: "label", token: ["Human", "Triage"].join(" "), replacements: [canonical.bazaar, canonical.consistency] },
  { kind: "label", token: ["Campaign", "Dashboard"].join(" "), replacements: [canonical.bazaar] },
  { kind: "label", token: ["Traceability", "Prep"].join(" "), replacements: [canonical.consistency] }
]

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function normalizeRelative(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`)
  assert.ok(value.length > 0, `${label} must not be empty`)
  assert.equal(path.isAbsolute(value), false, `${label} must be repository-relative: ${value}`)
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"))
  assert.equal(normalized, value.replace(/\\/g, "/"), `${label} must be normalized: ${value}`)
  assert.ok(normalized !== ".." && !normalized.startsWith("../"), `${label} escapes the repository: ${value}`)
  return normalized
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function collectMarkdown(rootRelative) {
  const absoluteRoot = path.join(repoRoot, rootRelative)
  assert.ok(fs.existsSync(absoluteRoot), `configured documentation root is missing: ${rootRelative}`)
  const rootReal = fs.realpathSync(absoluteRoot)
  assert.ok(isInside(repoRoot, rootReal), `configured documentation root escapes repository: ${rootRelative}`)

  const files = []
  const rootStat = fs.lstatSync(absoluteRoot)
  assert.equal(rootStat.isSymbolicLink(), false, `configured documentation root must not be a symlink: ${rootRelative}`)

  if (rootStat.isFile()) {
    assert.match(rootRelative, /\.md$/i, `configured file root must be Markdown: ${rootRelative}`)
    return [rootRelative]
  }
  assert.ok(rootStat.isDirectory(), `configured documentation root must be a file or directory: ${rootRelative}`)

  function walk(absoluteDirectory) {
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(absoluteDirectory, entry.name)
      const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/")
      const stat = fs.lstatSync(absolutePath)
      assert.equal(stat.isSymbolicLink(), false, `documentation roots must not contain symlinks: ${relativePath}`)
      const real = fs.realpathSync(absolutePath)
      assert.ok(isInside(rootReal, real), `documentation path escapes configured root: ${relativePath}`)
      assert.ok(isInside(repoRoot, real), `documentation path escapes repository: ${relativePath}`)
      if (stat.isDirectory()) walk(absolutePath)
      else if (stat.isFile() && /\.md$/i.test(entry.name)) files.push(relativePath)
    }
  }

  walk(absoluteRoot)
  return files
}

function loadClassification() {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"))
  assert.deepEqual(Object.keys(contract).sort(), ["historicalDocuments", "roots", "schemaVersion"])
  assert.equal(contract.schemaVersion, 1)
  assert.ok(Array.isArray(contract.roots) && contract.roots.length > 0, "roots must be a non-empty array")
  assert.ok(Array.isArray(contract.historicalDocuments), "historicalDocuments must be an array")

  const roots = contract.roots.map((value, index) => normalizeRelative(value, `roots[${index}]`))
  const historical = contract.historicalDocuments.map((value, index) => normalizeRelative(value, `historicalDocuments[${index}]`))
  assert.equal(new Set(roots).size, roots.length, "documentation roots must be unique")
  assert.equal(new Set(historical).size, historical.length, "historical document entries must be unique")

  const discovered = roots.flatMap(collectMarkdown)
  assert.equal(new Set(discovered).size, discovered.length, "configured roots must not discover a Markdown document more than once")
  const discoveredSet = new Set(discovered)
  for (const historicalPath of historical) {
    assert.ok(discoveredSet.has(historicalPath), `historical document is missing or outside configured roots: ${historicalPath}`)
  }

  const historicalSet = new Set(historical)
  const classification = new Map(discovered.map((file) => [file, historicalSet.has(file) ? "historical" : "current"]))
  assert.equal(classification.size, discovered.length, "every discovered Markdown document must receive exactly one classification")
  return { contract, classification }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function identifierPattern(token) {
  return new RegExp(`(?<![A-Za-z0-9_.-])${escapeRegExp(token)}(?![A-Za-z0-9_.-])`, "g")
}

function phrasePattern(token) {
  return new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(token)}(?![A-Za-z0-9_-])`, "g")
}

function findReferences(text) {
  const matches = []
  for (const reference of obsolete) {
    const pattern = reference.kind === "label" ? phrasePattern(reference.token) : identifierPattern(reference.token)
    for (const match of text.matchAll(pattern)) {
      matches.push({ ...reference, index: match.index })
    }
  }
  return matches.sort((a, b) => a.index - b.index)
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length
}

function topLevelReplacementNotice(text) {
  const lines = text.split(/\r?\n/).slice(0, 12)
  return lines.find((line) => /^(?:Superseded|Replaced):\s+\S/.test(line))
}

function assertContainsAll(text, phrases, label) {
  for (const phrase of phrases) assert.ok(text.includes(phrase), `${label} must document: ${phrase}`)
}

const { classification } = loadClassification()

test("documentation metadata recursively classifies the complete configured scope", () => {
  assert.ok(classification.size > 0)
  assert.equal(classification.get("extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-runbook-ja.md"), "current")
  assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration1-ja.md"), "historical")
  assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration2-ja.md"), "historical")
  assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration3-dashboard-ja.md"), "historical")
})

test("current documents contain no obsolete public identifier or user-facing label", () => {
  const violations = []
  for (const [relativePath, kind] of classification) {
    if (kind !== "current") continue
    const text = readText(relativePath)
    for (const match of findReferences(text)) {
      violations.push(`${relativePath}:${lineNumber(text, match.index)}: ${match.kind} ${match.token}`)
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"))
})

test("historical obsolete references carry a top-level replacement notice naming every canonical route", () => {
  const violations = []
  for (const [relativePath, kind] of classification) {
    if (kind !== "historical") continue
    const text = readText(relativePath)
    const matches = findReferences(text)
    if (matches.length === 0) continue
    const notice = topLevelReplacementNotice(text)
    if (!notice) {
      violations.push(`${relativePath}: missing top-level Superseded:/Replaced: notice`)
      continue
    }
    const replacements = new Set(matches.flatMap((match) => match.replacements))
    for (const replacement of replacements) {
      if (!notice.includes(replacement)) violations.push(`${relativePath}: notice does not name ${replacement}`)
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"))
})

test("manifests and composition roots retain the approved main and soft-dependency contracts", () => {
  const manifests = {
    workflow: readJson("extensions/workflow-register/package.json"),
    bazaar: readJson("extensions/bob-bazaar-review/package.json"),
    consistency: readJson("extensions/bob-code-consistency-review/package.json")
  }
  assert.equal(manifests.workflow.main, "./out/extensionWithAuthoring.js")
  assert.equal(manifests.bazaar.main, "./out/extension.js")
  assert.equal(manifests.consistency.main, "./out/extension.js")
  for (const [name, manifest] of Object.entries(manifests)) {
    assert.ok(!manifest.extensionDependencies || manifest.extensionDependencies.length === 0, `${name}: extensionDependencies must stay empty`)
  }

  const workflowRoot = readText("extensions/workflow-register/src/extensionWithAuthoring.ts")
  const bazaarRoot = readText("extensions/bob-bazaar-review/src/extension.ts")
  const consistencyRoot = readText("extensions/bob-code-consistency-review/src/extension.ts")
  assertContainsAll(workflowRoot, [canonical.hub, canonical.builder], "workflow-register composition root")
  assertContainsAll(bazaarRoot, [canonical.bazaar, "bobBazaar.authorProjectRulesFromDocuments"], "Bazaar composition root")
  assertContainsAll(consistencyRoot, [canonical.consistency, "bobCodeConsistency.initializeWorkspace"], "Code Consistency composition root")
})

test("template refresh, workspace initialization, and MCP source preserve their write-safety contracts", () => {
  const templateRefresh = readText("extensions/bob-bazaar-review/src/workspace/templateRefresh.ts")
  assertContainsAll(templateRefresh, ["diffPreview", "confirmOverwrite", 'skippedReason: "cancelled"', "copyFile(target, backupPath)", "writeFile(target, sourceContent)"], "Bazaar template refresh")
  assert.ok(templateRefresh.indexOf("confirmOverwrite") < templateRefresh.indexOf("copyFile(target, backupPath)"), "confirmation must precede backup")
  assert.ok(templateRefresh.indexOf("copyFile(target, backupPath)") < templateRefresh.indexOf("writeFile(target, sourceContent)"), "backup must precede replacement")

  const initializer = readText("extensions/bob-code-consistency-review/src/workspaceInitializer.ts")
  assertContainsAll(initializer, ["publishWorkflowTemplate", 'status: "unchanged"', "reviewInputBackupPath", "上書きせず、バックアップだけ作成"], "Code Consistency initializer")

  const mcpServer = readText("extensions/bob-bazaar-review/src/mcp/server.ts")
  const projectRulesTools = readText("extensions/bob-bazaar-review/src/mcp/projectRulesTools.ts")
  const mcpConfig = readText("extensions/bob-bazaar-review/src/mcp/mcpConfig.ts")
  assertContainsAll(mcpServer, ["BOB_BAZAAR_ENABLE_WRITE_TOOLS", "BOB_BAZAAR_ALLOWED_ROOTS", "project_rules_init"], "Bazaar MCP server")
  assertContainsAll(projectRulesTools, ["requiredAllowedCwd", "requireWriteToolEnabled", "project_rules_init"], "Bazaar MCP project rules")
  assertContainsAll(mcpConfig, [".bob", "mcp.json"], "VS Code MCP configuration")
})

test("current documentation states the canonical routes and the approved cross-extension facts", () => {
  const currentCorpus = [...classification]
    .filter(([, kind]) => kind === "current")
    .map(([relativePath]) => readText(relativePath))
    .join("\n")

  assertContainsAll(currentCorpus, [
    "Bob 操作ハブ",
    "ワークフロー作成・編集",
    "標準テンプレートから作成",
    "レビュー結果取り込み",
    "指摘確認・振り分け",
    "レビュー実績",
    "整合プレレビュー",
    "トレーサビリティ整理",
    "soft dependency",
    "BOB_BAZAAR_ENABLE_WRITE_TOOLS=1",
    "BOB_BAZAAR_ALLOWED_ROOTS",
    ".bob/mcp.json",
    "review-input.yaml"
  ], "current documentation corpus")

  const bazaarDocs = [
    "extensions/bob-bazaar-review/README.md",
    "extensions/bob-bazaar-review/docs/basic-design-ja.md",
    "extensions/bob-bazaar-review/docs/detailed-design-ja.md",
    "extensions/bob-bazaar-review/docs/unit-test-spec-ja.md",
    "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
  ].map(readText).join("\n")
  assertContainsAll(bazaarDocs, ["diff", "確認", "バックアップ", "cancel", "project_rules_init", "read-only"], "Bazaar canonical documents")

  const consistencyDocs = [
    "extensions/bob-code-consistency-review/README.md",
    "extensions/bob-code-consistency-review/docs/basic-design-ja.md",
    "extensions/bob-code-consistency-review/docs/detailed-design-ja.md",
    "extensions/bob-code-consistency-review/docs/unit-test-spec-ja.md",
    "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
  ].map(readText).join("\n")
  assertContainsAll(consistencyDocs, ["workflow", "バックアップ", "review-input.yaml", "上書き", "変更しない"], "Code Consistency canonical documents")
})

test("obsolete matcher preserves retained run-retention settings", () => {
  const obsoleteRunsView = ["workflowRegister", "runs"].join(".")
  assert.ok(findReferences(obsoleteRunsView).some((match) => match.token === obsoleteRunsView))
  assert.ok(findReferences(`view == ${obsoleteRunsView}`).some((match) => match.token === obsoleteRunsView))
  assert.deepEqual(findReferences("workflowRegister.runs.retention.enabled"), [])
  assert.deepEqual(findReferences('getConfiguration("workflowRegister.runs.retention")'), [])
})
