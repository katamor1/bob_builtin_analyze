const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")

function readSource(...parts) {
  return parts.map((part) => fs.readFileSync(path.join(extensionRoot, "src", part), "utf8")).join("\n")
}

test("Bazaar companion extension has no required companion extension dependency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")
  const extensionDependencies = packageJson.extensionDependencies ?? []

  assert.ok(!extensionDependencies.includes("IBM.bob-code"))
  assert.ok(!extensionDependencies.includes("local.workflow-register"))
  assert.ok(packageJson.activationEvents.includes("onStartupFinished"))
  assert.match(source, /const WORKFLOW_REGISTER_EXTENSION_ID = "local\.workflow-register"/)
  assert.match(source, /registerWorkflowProviders\(context\)\.catch/)
  assert.match(source, /id: "bobBazaar\.openReviewGui"/)
  assert.match(source, /initialTargetFromWorkflowInputs\(input\.inputs, input\)/)
  assert.match(source, /id: "bobBazaar\.collectReviewContext"/)
  assert.match(source, /id: "bobBazaar\.loadReviewRules"/)
  assert.match(source, /execute: \(input\) => loadReviewRules\(input\)/)
  assert.match(source, /id: "bobBazaar\.captureReviewResult"/)
  assert.match(source, new RegExp([
    "execute: \\(input\\) => captureReviewResult\\(firstStringArg\\(input\\.args\\), \\{",
    "expectedChecklistItems: expectedChecklistItemsFromState\\(input\\.state\\),",
    "workspaceRoot: stringInput\\(input\\.workflowRoot\\),",
    "workflowState: input\\.state",
    "\\}\\)"
  ].join("[\\s\\S]*")))
})

test("Bazaar review commands stop after creating markdown when IBM Bob is absent", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /import \{ isBobCodeExtensionAvailable \} from "\.\/bobCodeExtension"/)
  assert.match(source, /if \(!isBobCodeExtensionAvailable\(\)\) \{[\s\S]*IBM Bob 拡張機能が見つからないため[\s\S]*return[\s\S]*\}/)
  assert.match(source, /Markdown を作成しました/)
})

test("Bazaar review commands auto-add the generated packet to Bob when workflow-register is absent", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /function isWorkflowRegisterExtensionAvailable\(\): boolean/)
  assert.match(source, new RegExp([
    "if \\(!isWorkflowRegisterExtensionAvailable\\(\\)\\) \\{",
    "await addPacketToBobContext\\(editor\\.document\\.uri, packet\\)",
    "workflow-register 未導入"
  ].join("[\\s\\S]*")))
  assert.match(source, /Bob チャットへ挿入しました/)
})

test("Bazaar capture command accepts workflow context appended by result sinks", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, new RegExp([
    "registerCommand\\(",
    "\"bobBazaar\\.captureReviewResult\"",
    "captureReviewResult\\(inputText, captureOptionsFromCommandArgs\\(args\\)\\)"
  ].join("[\\s\\S]*")))
  assert.match(source, /function captureOptionsFromCommandArgs\(args: unknown\[\]\): CaptureReviewResultOptions/)
  assert.match(source, /const workflowState = recordStringMap\(context\.state\)/)
  assert.match(source, /workflowState[\s\S]*\}/)
})

test("Bazaar workflow provider resolves repository root independently from workflowRoot", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")
  const guiSource = fs.readFileSync(path.join(extensionRoot, "src", "reviewGui.ts"), "utf8")

  assert.match(source, /workflowRoot\?: string/)
  assert.match(source, /bazaarRoot\?: string/)
  assert.match(source, /repositoryRoot\?: string/)
  assert.match(source, /const explicitBazaarRoot =[\s\S]*stringInput\(input\?\.bazaarRoot\)[\s\S]*stringInput\(input\?\.repositoryRoot\)/)
  assert.match(source, /bazaarRoot: explicitBazaarRoot/)
  assert.match(source, /resolveBazaarWorkspaceFolder/)
  assert.match(source, /resolveBobWorkspaceFolder/)
  assert.match(guiSource, /private bazaarWorkspaceFolder\?: vscode\.WorkspaceFolder/)
  assert.match(guiSource, /private bobWorkspaceFolder\?: vscode\.WorkspaceFolder/)
  assert.match(guiSource, /resolveBazaarWorkspaceFolder\(\{[\s\S]*workflowRoot: this\.initialTarget\?\.workflowRoot/)
  assert.match(guiSource, /resolveBobWorkspaceFolder\(\{[\s\S]*workflowRoot: this\.initialTarget\?\.workflowRoot/)
  assert.match(guiSource, /buildProjectRulesSectionForWorkspace\(bobFolder\.uri\.fsPath\)/)
  assert.doesNotMatch(guiSource, /workspaceFolders\?\.\[0\]|workspaceFolders\?\[0\]/)
})

test("Bazaar review GUI accepts workflow inputs as initial target values", () => {
  const extensionSource = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")
  const guiSource = readSource("reviewGui.ts", "reviewGuiHtml.ts", "reviewGuiTypes.ts")

  assert.match(extensionSource, /function initialTargetFromWorkflowInputs\(inputs: Record<string, unknown>, input\?: WorkflowActionExecutionInput\)/)
  assert.match(extensionSource, /revisionMode: targetMode\(inputs\.revisionMode\)/)
  assert.match(guiSource, /export interface BazaarReviewInitialTarget/)
  assert.match(guiSource, /openBazaarReviewGui\(context: vscode\.ExtensionContext, initialTarget\?: BazaarReviewInitialTarget\)/)
  assert.match(guiSource, /new BazaarReviewGuiController\(context, panel, initialTarget\)/)
  assert.match(guiSource, /const initialTargetJson = JSON\.stringify\(initialTarget \?\? \{\}\)/)
  assert.match(guiSource, /applyInitialTarget\(initialTarget\)/)
})

test("Bazaar workflow template starts review target selection from the GUI by default", () => {
  const workflowPath = path.join(extensionRoot, "templates", ".bob", "workflows", "bazaar-project-rule-review", "WORKFLOW.md")
  const workflow = fs.readFileSync(workflowPath, "utf8")

  assert.match(workflow, /revisionMode:[\s\S]*?prompt: false/)
  assert.match(workflow, /revision:[\s\S]*?prompt: false/)
  assert.match(workflow, /baseRevision:[\s\S]*?prompt: false/)
  assert.match(workflow, /targetRevision:[\s\S]*?prompt: false/)
  assert.doesNotMatch(workflow, /requiredWhen:/)
})

test("Bazaar workflow template declares the providers owned by this extension", () => {
  const workflowPath = path.join(extensionRoot, "templates", ".bob", "workflows", "bazaar-project-rule-review", "WORKFLOW.md")
  const workflow = fs.readFileSync(workflowPath, "utf8")

  assert.match(workflow, /^stepCompletion: manual$/m)
  assert.match(workflow, /^stepMessage: step$/m)
  assert.doesNotMatch(workflow, /```workflow-step/)
  assert.doesNotMatch(workflow, /^## Step:/m)
  assert.match(workflow, /^steps:$/m)
  assertWorkflowProvider(workflow, "review-input", "openReviewGui", "false", undefined, "false")
  assertWorkflowProvider(workflow, "collect-context", "collectReviewContext", "true", "true", "true")
  assertWorkflowProvider(workflow, "load-rules", "loadReviewRules", "true", "true", "true")
})

function assertWorkflowProvider(workflow, stepId, provider, sendResult, required, completeOnSuccess) {
  const parts = [
    `id: ${stepId}`,
    `provider: bobBazaar\\.${provider}`,
    `sendResult: ${sendResult}`
  ]
  if (required !== undefined) parts.push(`required: ${required}`)
  parts.push(`completeOnSuccess: ${completeOnSuccess}`)
  assert.match(workflow, new RegExp(parts.join("[\\s\\S]*?")))
}
