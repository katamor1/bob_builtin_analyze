const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  readExtensionFile,
  readJson,
  readSourceSet
} = require("./helpers/sourceReader")

test("Bazaar companion extension has no required companion extension dependency", () => {
  const packageJson = readJson("package.json")
  const source = readSourceSet(["extension.ts", "workflow/workflowRegisterBridge.ts", "workflow/workflowProviders.ts", "workflow/workflowActions.ts"])
  const extensionDependencies = packageJson.extensionDependencies ?? []

  assert.ok(!extensionDependencies.includes("IBM.bob-code"))
  assert.ok(!extensionDependencies.includes("local.workflow-register"))
  assert.ok(packageJson.activationEvents.includes("onStartupFinished"))
  assert.match(source, /const WORKFLOW_REGISTER_EXTENSION_ID = "local\.workflow-register"/)
  assert.match(source, /registerWorkflowProvidersWithRetry\(context\)/)
  assert.match(source, /id: "bobBazaar\.openReviewGui"/)
  assert.match(source, /initialTargetFromWorkflowInputs\(input\.inputs, input\)/)
  assert.match(source, /id: "bobBazaar\.collectReviewContext"/)
  assert.match(source, /execute: \(input\) => collectReviewContext\(input\)/)
  assert.match(source, /id: "bobBazaar\.loadReviewRules"/)
  assert.match(source, /execute: \(input\) => loadReviewRules\(input\)/)
  assert.match(source, /id: "bobBazaar\.captureReviewResult"/)
  assert.match(source, /execute: \(input\) => captureReviewResult\(firstStringArg\(input\.args\), captureOptionsFromCommandArgs\(\[input\]\)\)/)
  for (const providerId of [
    "openRuleAuthoringGui",
    "loadRuleSourceIndex",
    "captureRuleEvidenceSelection",
    "loadSelectedRuleEvidence",
    "captureRuleProposal",
    "openRuleProposalTriageGui",
    "verifyRuleAuthoringApply"
  ]) {
    assert.match(source, new RegExp(`id: "bobBazaar\\.${providerId}"`))
  }
  assert.match(source, /openRuleAuthoringGui\(context, \{[\s\S]*workspaceRoot: stringInput\(input\.workflowRoot\)[\s\S]*runId: stringInput\(input\.runId\)[\s\S]*stepId: stringInput\(input\.stepId\)/)
  assert.match(source, /if \(result\.status !== "confirmed"\)[\s\S]*return result\.authoringSession/)
  assert.match(source, /resolveRuleAuthoringWorkflowTarget\(input\)/)
  assert.match(source, /openRuleProposalTriageGui\(context, \{[\s\S]*workspaceRoot: target\.workspaceRoot,[\s\S]*runId: target\.runId/)
  assert.match(source, /if \(result\.status !== "applied"\)[\s\S]*const completed = await completeCurrentWorkflowStepAfterGuiAction/)
  assert.match(source, /if \(!completed\)[\s\S]*could not complete its workflow step/)
})

test("Bazaar capture command accepts workflow context appended by result sinks", () => {
  const source = readSourceSet(["extension.ts", "workflow/workflowRegisterBridge.ts"])

  assert.match(source, new RegExp([
    "registerCommand\\(",
    "\"bobBazaar\\.captureReviewResult\"",
    "captureReviewResult\\(inputText, captureOptionsFromCommandArgs\\(args\\)\\)"
  ].join("[\\s\\S]*")))
  assert.match(source, /export function captureOptionsFromCommandArgs\(args: unknown\[\]\): CaptureReviewResultOptions/)
  assert.match(source, /const workflowState = recordStringMap\(context\.state\)/)
  assert.match(source, /expectedChecklistItems: expectedChecklistItemsFromState\(workflowState\)/)
  assert.match(source, /expectedRuleIds: expectedRuleIdsFromState\(workflowState\)/)
  assert.match(source, /reviewResultSchema: reviewResultSchemaFromState\(workflowState\)/)
  assert.match(source, /workspaceRoot: stringInput\(context\.workflowRoot\)/)
})

test("Bazaar workflow provider registration retries optional workflow-register integration", () => {
  const source = readSourceSet([
    "extension.ts",
    "workflow/workflowProviders.ts",
    "workflow/retryRegistrationController.ts"
  ])

  assert.match(source, /registerWorkflowProvidersWithRetry\(context\)/)
  assert.match(source, /WORKFLOW_PROVIDER_RETRY_DELAYS_MS/)
  assert.match(source, /vscode\.extensions\.onDidChange/)
  assert.match(source, /setTimeout\(/)
  assert.match(source, /timers\.delete\(timer\)/)
  assert.match(source, /providersRegistered/)
})

test("Bazaar provider retry lifecycle recovers restarts and disposes stale or late registrations", () => {
  const source = readSourceSet([
    "workflow/workflowProviders.ts",
    "workflow/retryRegistrationController.ts"
  ])

  assert.match(source, /let disposed = false/)
  assert.match(source, /let generation = 0/)
  assert.match(source, /let registeredApi: Api \| undefined/)
  assert.match(source, /let registrationAttempt: Promise<boolean> \| undefined/)
  assert.match(source, /let activeRegistrations: DisposableLike\[\] = \[\]/)
  assert.match(source, /const currentAttempt = performAttempt\(generation\)/)
  assert.match(source, /if \(disposed \|\| attemptGeneration !== generation\)/)
  assert.match(source, /disposeRegistrations\(result\.registrations\)/)
  assert.match(source, /if \(registrationAttempt === currentAttempt\) registrationAttempt = undefined/)
  assert.match(source, /currentApi === registeredApi/)
  assert.match(source, /disposeRegistrations\(activeRegistrations\)/)
  assert.doesNotMatch(source, /^let workflowProviderRegistrationAttempt/m)
})

test("Bazaar workflow providers bind installed provenance and return the atomic registration", () => {
  const source = readSourceSet(["workflow/workflowRegisterBridge.ts", "workflow/workflowProviders.ts"])

  assert.match(source, /const BAZAAR_PROVIDER_SOURCE_ID = "local\.bob-bazaar-review"/)
  assert.match(source, /sourceId: BAZAAR_PROVIDER_SOURCE_ID/)
  assert.match(source, /id: context\.extension\.id/)
  assert.match(source, /version: typeof extensionVersion === "string" \? extensionVersion : ""/)
  assert.match(source, /ownerDirectory: "extensions\/bob-bazaar-review"/)
  assert.match(source, /registrations: \[registration\]/)
})

test("Bazaar workflow template starts review target selection from the GUI by default", () => {
  const workflow = readExtensionFile("templates", ".bob", "workflows", "bazaar-project-rule-review", "WORKFLOW.md")

  assert.match(workflow, /revisionMode:[\s\S]*?prompt: false/)
  assert.match(workflow, /revision:[\s\S]*?prompt: false/)
  assert.match(workflow, /baseRevision:[\s\S]*?prompt: false/)
  assert.match(workflow, /targetRevision:[\s\S]*?prompt: false/)
  assert.doesNotMatch(workflow, /requiredWhen:/)
})

test("Bazaar workflow template declares the providers owned by this extension", () => {
  const workflow = readExtensionFile("templates", ".bob", "workflows", "bazaar-project-rule-review", "WORKFLOW.md")

  assert.match(workflow, /^stepCompletion: manual$/m)
  assert.match(workflow, /^stepMessage: step$/m)
  assert.doesNotMatch(workflow, /```workflow-step/)
  assert.doesNotMatch(workflow, /^## Step:/m)
  assert.match(workflow, /^steps:$/m)
  assertWorkflowProvider(workflow, "review-input", "openReviewGui", "false", undefined, "false")
  assertWorkflowProvider(workflow, "collect-context", "collectReviewContext", "true", "true", "true")
  assertWorkflowProvider(workflow, "load-rules", "loadReviewRules", "true", "true", "true")
})

test("Bazaar load-rules workflow result exposes project rule ids and schema to result capture", () => {
  const source = readSourceSet(["workflow/workflowActions.ts"])

  assert.match(source, /ruleIds: string\[\]/)
  assert.match(source, /reviewResultSchema: unknown/)
  assert.match(source, /const ruleIds = checklist\.rules\.map\(\(rule\) => rule\.id\)/)
  assert.match(source, /ruleIds,/)
  assert.match(source, /reviewResultSchema: schema/)
})

test("rule authoring public command and bounded host configuration are contributed without standalone workflow execution", () => {
  const packageJson = readJson("package.json")
  const source = readSourceSet([
    "extension.ts",
    "workspace/workspaceCommands.ts",
    "ui/ruleAuthoringGui.ts",
    "workflow/workflowProviders.ts"
  ])
  const commandId = "bobBazaar.authorProjectRulesFromDocuments"
  assert.ok(packageJson.activationEvents.includes(`onCommand:${commandId}`))
  assert.ok(packageJson.contributes.commands.some(({ command }) => command === commandId))
  assert.ok(packageJson.contributes.menus.commandPalette.some(({ command }) => command === commandId))
  assert.match(source, /authorProjectRulesFromDocuments\(context\)/)
  assert.match(source, /initializeRuleAuthoringWorkspaceFromTemplates/)
  assert.match(source, /openRuleAuthoringGui\(context, \{/)
  assert.match(source, /bazaar-project-rule-authoring/)
  assert.doesNotMatch(source, /runWorkflow\s*\(/)

  const expected = {
    pdfToTextPath: "pdftotext",
    maxSourceFiles: 20,
    maxSourceBytes: 26214400,
    maxAggregateSourceBytes: 104857600,
    maxChunkBytes: 32768,
    maxSelectedEvidenceBytes: 1048576
  }
  for (const [key, value] of Object.entries(expected)) {
    const setting = packageJson.contributes.configuration.properties[`bobBazaar.ruleAuthoring.${key}`]
    assert.ok(setting, `missing rule authoring configuration ${key}`)
    assert.equal(setting.default, value)
  }
  assert.match(source, /Math\.min\(value as number, ceiling\)/)
  assert.match(source, /Math\.min\(candidate, DEFAULT_RULE_AUTHORING_LIMITS\[key\]\)/)
  assert.match(source, /pdfToTextPath: configuration\.pdfToTextPath/)
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
