const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { validateWorkflowText } = require("../out/core/workflowValidator")
const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const { createWorkflowInventory, discoverContributionManifests } = require("../scripts/discover-tracked-workflows")

const repoRoot = path.resolve(__dirname, "..", "..", "..")
const packagePaths = [
  "extensions/workflow-register/package.json",
  "extensions/bob-bazaar-review/package.json",
  "extensions/bob-code-consistency-review/package.json"
]
const sampleExternalCommandAllowlist = readSampleExternalCommandAllowlist()

const integrationWorkflowPairs = [
  {
    templatePath: "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
    mirrorPath: ".bob/workflows/bazaar-project-rule-review/WORKFLOW.md"
  },
  {
    templatePath: "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md",
    mirrorPath: ".bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md"
  },
  {
    templatePath: "extensions/bob-code-consistency-review/templates/.bob/workflows/code-consistency-review/WORKFLOW.md",
    mirrorPath: ".bob/workflows/code-consistency-review/WORKFLOW.md"
  }
]

test("all tracked claimed workflow contracts are discovered and strict-clean", () => {
  const workflowPaths = createWorkflowInventory(repoRoot)
    .filter((entry) => entry.kind === "claim")
    .map((entry) => entry.path)
  const commandIds = discoverContributedCommandIds()

  for (const relativePath of workflowPaths) {
    const text = readRepoFile(relativePath)
    const validation = validateStrictText(text, relativePath)
    assert.equal(validation.ok, true, `${relativePath}\n${formatDiagnostics(validation)}`)
    assertNestedCommandContracts(relativePath, validation.workflow, commandIds)
  }
})

test("integration workflow templates match their workspace mirrors", () => {
  for (const { templatePath, mirrorPath } of integrationWorkflowPairs) {
    const templateText = readRepoFile(templatePath)
    const mirrorText = readRepoFile(mirrorPath)
    assert.equal(mirrorText, templateText, `${mirrorPath} must match ${templatePath}`)
  }
})

test("sample external command allowlist is path-scoped and guardrail-declared", () => {
  const samplePath = "extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md"
  const validation = validateStrictText(readRepoFile(samplePath), samplePath)
  assert.equal(validation.ok, true, formatDiagnostics(validation))
  const commandIds = discoverContributedCommandIds()

  assert.doesNotThrow(() => assertNestedCommandContracts(samplePath, validation.workflow, commandIds))
  assert.throws(
    () => assertNestedCommandContracts(".bob/workflows/production-copy/WORKFLOW.md", validation.workflow, commandIds),
    /uncontributed command 'example\.preapprovalCheck'/
  )
})

test("result step prompt and includeState are accepted as Bob runtime fields", () => {
  const validation = validateStrictText(`---
schemaVersion: workflow-register/v1
name: result-runtime-fields
description: Result runtime field validation.
stepMessage: step
steps:
  - id: collect
    title: Collect context
    type: command
    prompt: Collect the context.
    action:
      provider: sample.collect
    resultKey: context
  - id: save
    title: Save context
    type: result
    prompt: Save the collected context.
    includeState:
      - context
    result:
      source: state
      stateKey: context
      sinks:
        - type: file
          path: .bob/workflows/runs/{{run.id}}/context.json
---
# Result runtime fields
`, "test/fixtures/inline/WORKFLOW.md", {
    availableActionProviders: ["sample.collect"],
    availablePreflightChecks: []
  })

  assert.equal(validation.ok, true, formatDiagnostics(validation))
  assert.equal(validation.workflow.engineSteps[1].prompt, "Save the collected context.")
  assert.deepEqual(validation.workflow.engineSteps[1].includeState, ["context"])
})

test("step messages allow result steps to use their result definition without a prompt", () => {
  const validation = validateStrictText(`---
schemaVersion: workflow-register/v1
name: result-step-without-prompt
description: Result step prompt fallback validation.
stepMessage: step
steps:
  - id: write
    title: Write result
    type: result
    result:
      source: literal
      text: done
      sinks:
        - type: file
          path: .bob/workflows/runs/{{run.id}}/done.txt
---
# Result step without prompt
`, "test/fixtures/inline/WORKFLOW.md", {
    availableActionProviders: [],
    availablePreflightChecks: []
  })

  assert.equal(validation.ok, true, formatDiagnostics(validation))
})

function discoverContributedCommandIds() {
  const result = new Set()
  for (const relativePath of packagePaths) {
    const packageJson = JSON.parse(readRepoFile(relativePath))
    for (const item of packageJson.contributes?.commands ?? []) {
      if (typeof item.command === "string" && item.command.trim()) result.add(item.command.trim())
    }
  }
  return result
}

function assertNestedCommandContracts(relativePath, workflow, commandIds) {
  for (const step of workflow.engineSteps) {
    if (step.type !== "command" || step.action.provider !== "vscode.executeCommand") continue
    const args = step.action.args
    const commandId = Array.isArray(args) ? args[0] : undefined
    assert.equal(typeof commandId, "string", `${relativePath}: step '${step.id}' must pass a command id as vscode.executeCommand args[0]`)
    assert.ok(
      commandIds.has(commandId) || isDeclaredSampleExternalCommand(relativePath, workflow, commandId),
      `${relativePath}: step '${step.id}' references uncontributed command '${commandId}'`
    )
  }

  for (const commandId of workflow.guardrails?.allowedCommandIds ?? []) {
    assert.ok(
      commandIds.has(commandId) || isDeclaredSampleExternalCommand(relativePath, workflow, commandId),
      `${relativePath}: guardrails allow uncontributed command '${commandId}'`
    )
  }
}

function isDeclaredSampleExternalCommand(relativePath, workflow, commandId) {
  if (typeof commandId !== "string") return false
  const allowedCommands = sampleExternalCommandAllowlist.get(relativePath)
  return allowedCommands?.has(commandId) === true &&
    (workflow.guardrails?.allowedCommandIds ?? []).includes(commandId)
}

function readSampleExternalCommandAllowlist() {
  const allowlist = new Map()
  for (const manifestPath of discoverContributionManifestPaths()) {
    const manifest = JSON.parse(readRepoFile(manifestPath))
    for (const command of manifest.external_commands) {
      for (const workflowPath of command.workflow_paths) {
        const commandIds = allowlist.get(workflowPath) ?? new Set()
        commandIds.add(command.id)
        allowlist.set(workflowPath, commandIds)
      }
    }
  }
  return allowlist
}

function validateStrictText(text, filePath = "test/fixtures/inline/WORKFLOW.md", overrides = {}) {
  const legacyCompatibilityMode = overrides.availableActionProviders && overrides.availablePreflightChecks
  const contributionOptions = legacyCompatibilityMode
    ? {
        availableActionProviders: overrides.availableActionProviders,
        availablePreflightChecks: overrides.availablePreflightChecks
      }
    : { contributionCatalog: readGeneratedContributionCatalog() }
  return validateWorkflowText({
    sourceId: "workflow-register",
    filePath,
    text,
    strict: true,
    ...contributionOptions
  })
}

function readGeneratedContributionCatalog() {
  return buildWorkflowContributionCatalog(discoverContributionManifestPaths().map((manifestPath) => {
    const ownerDirectory = path.posix.dirname(path.posix.dirname(manifestPath))
    const packagePath = path.join(repoRoot, ownerDirectory, "package.json")
    const packageJson = fs.existsSync(packagePath)
      ? JSON.parse(fs.readFileSync(packagePath, "utf8"))
      : undefined
    return {
      manifestPath,
      manifestContent: readRepoFile(manifestPath),
      context: packageJson && {
        expectedOwner: { id: `${packageJson.publisher}.${packageJson.name}`, version: packageJson.version },
        ownerDirectory
      },
      readContent: (repositoryPath) => fs.readFileSync(path.join(repoRoot, repositoryPath), "utf8")
    }
  }))
}

function discoverContributionManifestPaths() {
  return discoverContributionManifests(repoRoot).map((entry) => entry.path)
}

function formatDiagnostics(validation) {
  return validation.diagnostics.map((item) => `${item.severity}: ${item.message}`).join("\n")
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split("/")), "utf8")
}
