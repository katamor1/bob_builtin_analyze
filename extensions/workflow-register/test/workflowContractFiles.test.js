const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { compileWorkflowContractDocument } = require("../out/core/workflowValidator")
const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const { validateCommandGuardrails } = require("../out/core/guardrails")
const { validateWorkflowTemplateMirrors } = require("../out/core/templateMirrorValidator")
const { createWorkflowInventory, discoverContributionManifests } = require("../scripts/discover-tracked-workflows")

const repoRoot = path.resolve(__dirname, "..", "..", "..")

test("all tracked claimed workflow contracts are discovered and strict-clean", () => {
  const workflowPaths = createWorkflowInventory(repoRoot)
    .filter((entry) => entry.kind === "claim")
    .map((entry) => entry.path)

  for (const relativePath of workflowPaths) {
    const text = readRepoFile(relativePath)
    const validation = validateStrictText(text, relativePath)
    assert.equal(validation.ok, true, `${relativePath}\n${formatDiagnostics(validation)}`)
  }
})

test("all dynamically declared workflow templates exactly match their mirrors", () => {
  const inputs = discoverContributionManifestPaths().map((manifestPath) => {
    const ownerDirectory = path.posix.dirname(path.posix.dirname(manifestPath))
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, ownerDirectory, "package.json"), "utf8"))
    return {
      manifestPath,
      manifestContent: fs.readFileSync(path.join(repoRoot, manifestPath)),
      context: {
        expectedOwner: { id: `${packageJson.publisher}.${packageJson.name}`, version: packageJson.version },
        ownerDirectory
      },
      readContent: (repositoryPath) => fs.readFileSync(path.join(repoRoot, repositoryPath))
    }
  })

  const validation = validateWorkflowTemplateMirrors(inputs)

  assert.equal(
    validation.ok,
    true,
    validation.diagnostics.map((item) => `${item.code}: ${item.path}: ${item.message}`).join("\n")
  )
})

test("sample external command contract is accepted only at its exact manifest-declared path", () => {
  const samplePath = "extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md"
  const text = readRepoFile(samplePath)
  const contributionCatalog = readWorkflowRegisterContributionCatalog()
  const validation = validateStrictText(text, samplePath, contributionCatalog)
  assert.equal(validation.ok, true, formatDiagnostics(validation))
  const wrongPath = validateStrictText(text, ".bob/workflows/production-copy/WORKFLOW.md", contributionCatalog)
  assert.equal(wrongPath.ok, false)
  assert.match(formatDiagnostics(wrongPath), /example\.preapprovalCheck.*not declared for workflow path/i)

  const missingAllowedCommandId = validateStrictText(
    text.replace("  allowedCommandIds:\n    - example.preapprovalCheck\n", ""),
    samplePath,
    contributionCatalog
  )
  assert.equal(missingAllowedCommandId.ok, false)
  assert.match(formatDiagnostics(missingAllowedCommandId), /example\.preapprovalCheck.*allowedCommandIds/i)

  for (const [name, mutatedText, expectedRuntimeError] of [
    [
      "non-allowlisted provider",
      text.replace("    - vscode.executeCommand\n", "    - workflowRegister.runMechanicalChecks\n"),
      /not allowed by workflow guardrails.*vscode\.executeCommand/i
    ],
    [
      "denied provider",
      text
        .replace("    - vscode.executeCommand\n", "    - workflowRegister.runMechanicalChecks\n")
        .replace("    - shell\n", "    - vscode.executeCommand\n"),
      /denied by workflow guardrails.*vscode\.executeCommand/i
    ]
  ]) {
    const strictResult = validateStrictText(mutatedText, samplePath, contributionCatalog)
    assert.ok(strictResult.workflow)
    const runtimeError = validateCommandGuardrails(
      { guardrails: strictResult.workflow.guardrails },
      "vscode.executeCommand",
      ["example.preapprovalCheck"]
    )
    assert.match(runtimeError ?? "", expectedRuntimeError, name)

    assert.equal(strictResult.ok, false, `${name}: ${formatDiagnostics(strictResult)}`)
    assert.match(formatDiagnostics(strictResult), /vscode\.executeCommand.*(?:allowedCommands|deniedCommands)/i)
  }
})

test("real-style repository reads preserve invalid package bytes for fatal decoding", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-command-bytes-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const manifestPath = "extensions/sample-extension/contracts/workflow-contributions.json"
  const packagePath = "extensions/sample-extension/package.json"
  const packageFile = path.join(temporaryRoot, ...packagePath.split("/"))
  fs.mkdirSync(path.dirname(packageFile), { recursive: true })
  fs.writeFileSync(packageFile, Buffer.from([0xc3, 0x28]))
  const manifestContent = readRepoFile("extensions/workflow-register/test/fixtures/workflow-contributions/valid.json")

  assert.throws(
    () => buildWorkflowContributionCatalog([{
      manifestPath,
      manifestContent,
      context: {
        expectedOwner: { id: "local.sample-extension", version: "1.2.3" },
        ownerDirectory: "extensions/sample-extension"
      },
      readContent: (repositoryPath) => fs.readFileSync(path.join(temporaryRoot, ...repositoryPath.split("/")))
    }]),
    /package manifest content must be valid UTF-8 JSON/i
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
      provider: workflowRegister.runMechanicalChecks
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
`, "test/fixtures/inline/WORKFLOW.md", readWorkflowRegisterContributionCatalog())

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
`, "test/fixtures/inline/WORKFLOW.md", readWorkflowRegisterContributionCatalog())

  assert.equal(validation.ok, true, formatDiagnostics(validation))
})

function validateStrictText(text, filePath = "test/fixtures/inline/WORKFLOW.md", contributionCatalog = readGeneratedContributionCatalog()) {
  return compileWorkflowContractDocument({
    sourceId: "workflow-register",
    filePath,
    filePathSyntax: "canonical-repository",
    text,
    contributionCatalog
  })
}

function readGeneratedContributionCatalog() {
  return buildContributionCatalog(discoverContributionManifestPaths())
}

function readWorkflowRegisterContributionCatalog() {
  return buildContributionCatalog(["extensions/workflow-register/contracts/workflow-contributions.json"])
}

function buildContributionCatalog(manifestPaths) {
  return buildWorkflowContributionCatalog(manifestPaths.map((manifestPath) => {
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
      readContent: (repositoryPath) => fs.readFileSync(path.join(repoRoot, repositoryPath))
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
