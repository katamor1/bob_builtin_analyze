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

const uiCuePattern = /\b(?:command palette|command|panel|view|screen|button|menu|stage|title|label|gui|webview)\b|画面|パネル|ビュー|ボタン|メニュー|導線|表示名|起動|開く|切り替え|遷移|公開|コマンド/i
const technicalFenceLanguages = new Set([
  "bash", "c", "c++", "cpp", "css", "go", "html", "ini", "java", "javascript", "js", "jsx",
  "json", "php", "powershell", "ps1", "py", "python", "rb", "ruby", "rust", "scss", "sh",
  "shell", "sql", "toml", "ts", "tsx", "typescript", "xml", "yaml", "yml"
])

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

  const rootStat = fs.lstatSync(absoluteRoot)
  assert.equal(rootStat.isSymbolicLink(), false, `configured documentation root must not be a symlink: ${rootRelative}`)
  if (rootStat.isFile()) {
    assert.match(rootRelative, /\.md$/i, `configured file root must be Markdown: ${rootRelative}`)
    return [rootRelative]
  }
  assert.ok(rootStat.isDirectory(), `configured documentation root must be a file or directory: ${rootRelative}`)

  const files = []
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

function lineBounds(text, index) {
  const start = text.lastIndexOf("\n", index - 1) + 1
  const nextBreak = text.indexOf("\n", index)
  const end = nextBreak === -1 ? text.length : nextBreak
  return { line: text.slice(start, end) }
}

function openFenceAt(text, index) {
  const lines = text.slice(0, index).split(/\r?\n/)
  let open
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`~]*)?.*$/)
    if (!match) continue
    const marker = match[1][0]
    const length = match[1].length
    if (!open) {
      open = { marker, length, language: String(match[2] ?? "").toLowerCase() }
      continue
    }
    if (marker === open.marker && length >= open.length) open = undefined
  }
  return open
}

function isUserFacingLabelOccurrence(text, index) {
  const fence = openFenceAt(text, index)
  if (fence && technicalFenceLanguages.has(fence.language)) return false

  const { line } = lineBounds(text, index)
  const trimmed = line.trim()
  if (/^#{1,6}\s/.test(trimmed)) return true
  if (uiCuePattern.test(line)) return true
  if (/^[-*+]\s/.test(trimmed)) {
    const remainder = trimmed.replace(/^[-*+]\s+/, "")
    if (!/\b(?:module|class|function|test|fixture|directory|schema)\b/i.test(remainder)) return true
  }
  return false
}

function findReferences(text) {
  const matches = []
  for (const reference of obsolete) {
    const pattern = reference.kind === "label" ? phrasePattern(reference.token) : identifierPattern(reference.token)
    for (const match of text.matchAll(pattern)) {
      if (reference.kind === "label" && !isUserFacingLabelOccurrence(text, match.index)) continue
      matches.push({ ...reference, index: match.index })
    }
  }
  return matches.sort((a, b) => a.index - b.index)
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length
}

function topLevelReplacementNotice(text) {
  return text.split(/\r?\n/).slice(0, 12).find((line) => /^(?:Superseded|Replaced):\s+\S/.test(line))
}

function assertContainsAll(text, phrases, label) {
  for (const phrase of phrases) assert.ok(text.includes(phrase), `${label} must document: ${phrase}`)
}

const { contract, classification } = loadClassification()

test("documentation metadata recursively classifies the complete configured scope", () => {
  assert.ok(classification.size > 0)
  assert.ok(contract.historicalDocuments.length > 100, "reviewed historical inventory must remain explicit")
  assert.equal(classification.get("extensions/bob-code-consistency-review/docs/triage-integrity-ibm-bob-uat-runbook-ja.md"), "current")
  assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration1-ja.md"), "historical")
  assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration2-ja.md"), "historical")
  assert.equal(classification.get("extensions/bob-bazaar-review/docs/review-run-v3-iteration3-dashboard-ja.md"), "historical")
  assert.equal(classification.get("docs/workflows/code-consistency-review/README.md"), "current")
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
    for (const replacement of new Set(matches.flatMap((match) => match.replacements))) {
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
  assertContainsAll(mcpServer, ["BOB_BAZAAR_ENABLE_WRITE_TOOLS", "BOB_BAZAAR_ALLOWED_ROOTS", "writeToolsEnabled"], "Bazaar MCP server")
  assertContainsAll(projectRulesTools, ["requiredAllowedCwd", "requireWriteToolEnabled", 'new Set(["project_rules_init"])'], "Bazaar MCP project rules")
  assertContainsAll(mcpConfig, [".bob", "mcp.json", "BOB_BAZAAR_ALLOWED_ROOTS"], "VS Code MCP configuration")
  assert.equal(mcpConfig.includes("BOB_BAZAAR_ENABLE_WRITE_TOOLS"), false, "VS Code MCP configuration must not silently opt into MCP writes")
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

test("current operator guides route through canonical public surfaces", () => {
  const operatorCorpus = [
    "docs/gui-first-operation-operator-uat-guide-ja.md",
    "docs/ops/extensions-vsix-release-checklist-ja.md",
    "docs/training/phase4-template-customization-gui-core-ja.md",
    "docs/workflow-authoring-guide-ja.md",
    "extensions/workflow-register/docs/README-ja.md",
    "extensions/workflow-register/docs/basic-design-ja.md",
    "extensions/workflow-register/docs/command-palette-policy-ja.md",
    "extensions/workflow-register/docs/detailed-design-ja.md",
    "extensions/workflow-register/docs/run-state-schema-v1-ja.md",
    "extensions/workflow-register/docs/workflow-authoring-guide.md",
    "extensions/workflow-register/docs/workflow-run-retention-ja.md",
    "extensions/workflow-register/docs/workflow-runtime-debugging.md"
  ].map(readText).join("\n")

  assertContainsAll(operatorCorpus, [
    "Bob: 操作ハブを開く",
    "Bob Workflow: ワークフローを作成・編集",
    "Bob Bazaar Review: レビューを開始",
    "Bob Bazaar Review: 資料からプロジェクト規約を作成",
    "Bob Code Consistency Review: 整合プレレビューを開始",
    "Bob 操作ハブ",
    "標準テンプレートから作成"
  ], "current operator documentation")

  const forbidden = [
    "Bob 操作センター",
    "Run Control View",
    "Explorer view",
    "Workflow Register: Bob 操作ハブを開く",
    "Workflow Register: ワークフロー作成・編集を開く",
    "テンプレートカスタマイズ Studio",
    "Command Palette に `Bob ワークフロー:`",
    "Command Palette に `Bazaar レビュー:`",
    "Command Palette に `コード整合レビュー:`",
    "Bob Workflow: テンプレートから作成",
    "Bob Workflow: AI で新規設計",
    "Bob Workflow: 現在の定義を検証",
    "Bob Workflow: ワークスペース定義を検証",
    "Bob Workflow: 実行履歴を確認",
    "Bob Workflow: 診断を確認",
    "Bob Workflow: 実行を再開",
    "Bob Workflow: AI で改善",
    "Use the Command Palette command:"
  ]
  for (const phrase of forbidden) assert.equal(operatorCorpus.includes(phrase), false, `current operator documentation must not advertise: ${phrase}`)
})

test("canonical extension designs describe primary panels and safe update boundaries", () => {
  const bazaarDesign = [
    "extensions/bob-bazaar-review/docs/basic-design-ja.md",
    "extensions/bob-bazaar-review/docs/detailed-design-ja.md"
  ].map(readText).join("\n")
  assertContainsAll(bazaarDesign, [
    "Bob Bazaar Review: レビューを開始",
    "Bob Bazaar Review: 資料からプロジェクト規約を作成",
    "bobBazaarReviewGui",
    "レビュー結果取り込み",
    "指摘確認・振り分け",
    "レビュー実績",
    "review-run.json",
    "registerWorkflowProvidersWithRetry",
    "diff preview",
    "明示確認",
    "cancel時no-change",
    "BOB_BAZAAR_ENABLE_WRITE_TOOLS=1",
    "BOB_BAZAAR_ALLOWED_ROOTS"
  ], "Bazaar canonical design")
  for (const phrase of ["## 15. Phase 1 review record / triage", "## 17. Review Records 詳細"]) {
    assert.equal(bazaarDesign.includes(phrase), false, "Bazaar canonical design must not retain obsolete section: " + phrase)
  }

  const consistencyDesign = [
    "extensions/bob-code-consistency-review/docs/basic-design-ja.md",
    "extensions/bob-code-consistency-review/docs/detailed-design-ja.md"
  ].map(readText).join("\n")
  assertContainsAll(consistencyDesign, [
    "Bob Code Consistency Review: 整合プレレビューを開始",
    "bobCodeConsistencyReviewWizard",
    "トレーサビリティ整理",
    "レビュー結果取り込み",
    "指摘確認・振り分け",
    "triage-source.yaml",
    "triage-decisions.yaml",
    "TRIAGE_SOURCE_CHANGED",
    "TRIAGE_REVISION_CONFLICT",
    "既存`review-input.yaml`を上書きせずbackupだけ"
  ], "Code Consistency canonical design")
  for (const phrase of ["## 21. Human Triage 詳細", "人間 triage 担当者"]) {
    assert.equal(consistencyDesign.includes(phrase), false, "Code Consistency canonical design must not advertise: " + phrase)
  }
})

test("current decision documents use the primary review route and approved stage name", () => {
  const decisionDocs = [
    "docs/workflows/code-consistency-review/human-triage-spec.md",
    "extensions/bob-code-consistency-review/docs/README-ja.md",
    "extensions/bob-code-consistency-review/docs/triage-operator-extension-host-test-spec-ja.md"
  ].map(readText).join("\n")

  assertContainsAll(decisionDocs, [
    "Bob Code Consistency Review: 整合プレレビューを開始",
    "整合プレレビュー",
    "レビュー結果取り込み",
    "指摘確認・振り分け",
    "triage-source.yaml",
    "triage-decisions.yaml",
    "TRIAGE_SOURCE_CHANGED",
    "TRIAGE_REVISION_CONFLICT"
  ], "current decision documentation")

  for (const phrase of [
    "# 人間 triage 仕様",
    "# Human Triage Operator Extension Host テスト仕様",
    "Human Triage operator suite",
    "人間 triage 担当者"
  ]) {
    assert.equal(decisionDocs.includes(phrase), false, "current decision documentation must not advertise: " + phrase)
  }
})

test("obsolete matcher preserves retained settings and ignores internal domain terminology", () => {
  const obsoleteRunsView = ["workflowRegister", "runs"].join(".")
  assert.ok(findReferences(obsoleteRunsView).some((match) => match.token === obsoleteRunsView))
  assert.ok(findReferences(`view == ${obsoleteRunsView}`).some((match) => match.token === obsoleteRunsView))
  assert.deepEqual(findReferences("workflowRegister.runs.retention.enabled"), [])
  assert.deepEqual(findReferences('getConfiguration("workflowRegister.runs.retention")'), [])

  assert.ok(findReferences("## Human Triage").some((match) => match.token === "Human Triage"))
  assert.ok(findReferences("Command Palette から `Template Studio` を開く").some((match) => match.token === "Template Studio"))
  assert.ok(findReferences("| Result Capture | GUI stage |").some((match) => match.token === "Result Capture"))
  assert.ok(findReferences("- Campaign Dashboard を開く").some((match) => match.token === "Campaign Dashboard"))
  assert.ok(findReferences("画面タイトルは Traceability Prep").some((match) => match.token === "Traceability Prep"))

  const technicalJSDoc = [
    "```ts",
    "/**",
    " * 承認状態の変更権限は Traceability Prep Webview での人間操作に限定する。",
    " */",
    "```"
  ].join("\n")
  assert.deepEqual(findReferences(technicalJSDoc), [])
  assert.ok(findReferences("```md\n## Human Triage\n```").some((match) => match.token === "Human Triage"))
  assert.ok(findReferences("```text\nCommand Palette から Template Studio を開く\n```").some((match) => match.token === "Template Studio"))
  assert.ok(findReferences('```ts\nvscode.commands.executeCommand("bobBazaar.openResultCaptureGui")\n```')
    .some((match) => match.token === "bobBazaar.openResultCaptureGui"))

  assert.deepEqual(findReferences("| Result Capture | review-result JSON persistence | src/projectRules/resultCapture.ts |"), [])
  assert.deepEqual(findReferences("The Human Triage domain module stores decisions."), [])
  assert.deepEqual(findReferences("resultCaptureStage.test.js covers Human Triage persistence."), [])
})
