"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const { compileWorkflowDocument, validateCoreWorkflow } = require("../out/core/workflowCompiler")

const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
const fixtureManifestPath = path.join(__dirname, "fixtures", "workflow-contributions", "valid.json")

function generatedTestCatalog() {
  const manifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8"))
  manifest.result_sinks.push(
    {
      type: "command",
      contract_version: "sample.command-result/v1",
      payload_schema: "sample.report-payload"
    },
    {
      type: "file",
      contract_version: "sample.file-result/v1",
      payload_schema: "sample.report-payload"
    }
  )
  return buildWorkflowContributionCatalog([{
    manifestPath: "extensions/sample-extension/contracts/workflow-contributions.json",
    manifestContent: JSON.stringify(manifest),
    context: {
      expectedOwner: { id: "local.sample-extension", version: "1.2.3" },
      ownerDirectory: "extensions/sample-extension"
    },
    readContent: (repositoryPath) => `declared test bytes: ${repositoryPath}`
  }])
}

function workflowText({
  provider = "sample.collect",
  check = "sample.workspaceReady",
  customType = "sample.report",
  customVersion = "sample.report/v1",
  extraTopLevel = ""
} = {}) {
  return `---
schemaVersion: workflow-register/v1
name: contribution-resolution
description: Resolve workflow contributions from a generated catalog.
${extraTopLevel}preflight:
  - id: repository-ready
    checks:
      - ${check}
steps:
  - id: collect-context
    title: Collect context
    type: command
    action:
      provider: ${provider}
    resultKey: context
  - id: publish-result
    title: Publish result
    type: result
    result:
      source: state
      stateKey: context
      sinks:
        - type: ${customType}
          contractVersion: ${customVersion}
          payload:
            channel: audit
        - type: file
          path: .bob/workflows/runs/{{run.id}}/result.txt
        - type: command
          command: sample.capture
---
# Contribution resolution
`
}

function compile(text, contributionCatalog = generatedTestCatalog(), overrides = {}) {
  return compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: "extensions/sample-extension/samples/sample-review/.bob/workflows/sample-review/WORKFLOW.md",
    text,
    strict: true,
    contributionCatalog,
    ...overrides
  })
}

function messages(result) {
  return result.diagnostics.map((item) => item.message)
}

function hostileValue(prefix) {
  return `${prefix}\u0000\u001f\u007f\u0085${"界".repeat(200)}😀tail`
}

function assertNoSplitSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      assert.ok(index + 1 < value.length, `split high surrogate: ${JSON.stringify(value)}`)
      const next = value.charCodeAt(index + 1)
      assert.ok(next >= 0xdc00 && next <= 0xdfff, `split high surrogate: ${JSON.stringify(value)}`)
      index += 1
    } else {
      assert.ok(code < 0xdc00 || code > 0xdfff, `orphan low surrogate: ${JSON.stringify(value)}`)
    }
  }
}

function assertSafeCatalogDiagnostic(diagnostic, location) {
  assert.ok(diagnostic, location)
  assert.match(diagnostic.message, /�/)
  assert.doesNotMatch(diagnostic.message, /[\u0000-\u001f\u007f-\u009f]/)
  const displayedValues = [...diagnostic.message.matchAll(/'([^']*)'/g)].map((match) => match[1])
  assert.ok(displayedValues.length > 0, diagnostic.message)
  for (const value of displayedValues) {
    assert.ok(Buffer.byteLength(value, "utf8") <= 256, `${Buffer.byteLength(value, "utf8")}: ${value}`)
    assertNoSplitSurrogate(value)
  }
  assert.match(diagnostic.message, location)
}

function parsedWorkflow() {
  const result = compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: "extensions/sample-extension/WORKFLOW.md",
    text: workflowText()
  })
  assert.equal(result.ok, true, messages(result).join("\n"))
  return structuredClone(result.workflow)
}

test("strict compile resolves action, preflight, custom sink version, and built-in sink types from a generated catalog", () => {
  const result = compile(workflowText())

  assert.equal(result.ok, true, messages(result).join("\n"))
})

test("strict compile rejects missing and ambiguous action providers at the command step", () => {
  const missing = compile(workflowText({ provider: "sample.missing" }))
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Command step 'collect-context' action provider 'sample.missing' has no contribution catalog match."
  ))

  const ambiguousCatalog = generatedTestCatalog()
  ambiguousCatalog.action_providers.push({ ...ambiguousCatalog.action_providers[0], owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Command step 'collect-context' action provider 'sample.collect' has 2 contribution catalog matches."
  ))
})

test("strict compile rejects missing and ambiguous preflight checks at the block and check", () => {
  const missing = compile(workflowText({ check: "sample.missingReady" }))
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Preflight 'repository-ready' check 'sample.missingReady' has no contribution catalog match."
  ))

  const ambiguousCatalog = generatedTestCatalog()
  ambiguousCatalog.preflight_checks.push({ ...ambiguousCatalog.preflight_checks[0], owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Preflight 'repository-ready' check 'sample.workspaceReady' has 2 contribution catalog matches."
  ))
})

test("strict compile rejects unknown, ambiguous, and version-incompatible custom result sinks at the exact index", () => {
  const missing = compile(workflowText({ customType: "sample.missingReport", customVersion: "sample.missing-report/v1" }))
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Step 'publish-result' result sink[0] type 'sample.missingReport' has no contribution catalog match."
  ))

  const ambiguousCatalog = generatedTestCatalog()
  const custom = ambiguousCatalog.result_sinks.find((entry) => entry.type === "sample.report")
  ambiguousCatalog.result_sinks.push({ ...custom, owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Step 'publish-result' result sink[0] type 'sample.report' has 2 contribution catalog matches."
  ))

  const incompatible = compile(workflowText({ customVersion: "sample.report/v2" }))
  assert.equal(incompatible.ok, false)
  assert.ok(messages(incompatible).includes(
    "Step 'publish-result' result sink[0] type 'sample.report' contractVersion 'sample.report/v2' does not match catalog contract_version 'sample.report/v1'."
  ))
})

test("strict compile resolves built-in sinks by type and rejects missing or ambiguous matches without requiring workflow versions", () => {
  const missingCatalog = generatedTestCatalog()
  missingCatalog.result_sinks = missingCatalog.result_sinks.filter((entry) => entry.type !== "file")
  const missing = compile(workflowText(), missingCatalog)
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Step 'publish-result' result sink[1] type 'file' has no contribution catalog match."
  ))

  const ambiguousCatalog = generatedTestCatalog()
  const command = ambiguousCatalog.result_sinks.find((entry) => entry.type === "command")
  ambiguousCatalog.result_sinks.push({ ...command, owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Step 'publish-result' result sink[2] type 'command' has 2 contribution catalog matches."
  ))
})

test("catalog mode is authoritative over legacy provider and preflight compatibility arrays", () => {
  const result = compile(workflowText(), generatedTestCatalog(), {
    availableActionProviders: [],
    availablePreflightChecks: []
  })
  assert.equal(result.ok, true, messages(result).join("\n"))

  const legacyOnly = compile(workflowText({ provider: "legacy.only", check: "legacy.ready" }), generatedTestCatalog(), {
    availableActionProviders: ["legacy.only"],
    availablePreflightChecks: ["legacy.ready"]
  })
  assert.equal(legacyOnly.ok, false)
  assert.ok(messages(legacyOnly).some((message) => message.includes("action provider 'legacy.only' has no contribution catalog match")))
  assert.ok(messages(legacyOnly).some((message) => message.includes("check 'legacy.ready' has no contribution catalog match")))
})

test("catalog diagnostics bound and sanitize every newly echoed contribution value", () => {
  const cases = [
    {
      name: "action provider",
      mutate(workflow, catalog) {
        workflow.engineSteps[0].action.provider = hostileValue("provider")
        catalog.action_providers = []
      },
      find: (message) => message.includes("action provider"),
      location: /Command step 'collect-context' action provider/
    },
    {
      name: "preflight check",
      mutate(workflow, catalog) {
        workflow.preflight[0].checks[0] = hostileValue("check")
        catalog.preflight_checks = []
      },
      find: (message) => message.includes("Preflight"),
      location: /Preflight 'repository-ready' check/
    },
    {
      name: "result sink type",
      mutate(workflow, catalog) {
        workflow.engineSteps[1].result.sinks[0].type = hostileValue("sink")
        catalog.result_sinks = []
      },
      find: (message) => message.includes("result sink[0] type") && message.includes("catalog match"),
      location: /Step 'publish-result' result sink\[0\] type/
    },
    {
      name: "workflow custom contractVersion",
      mutate(workflow) {
        workflow.engineSteps[1].result.sinks[0].contractVersion = hostileValue("workflow-version")
      },
      find: (message) => message.includes("does not match catalog contract_version"),
      location: /Step 'publish-result' result sink\[0\] type 'sample\.report' contractVersion/
    },
    {
      name: "catalog contract_version",
      mutate(_workflow, catalog) {
        catalog.result_sinks.find((entry) => entry.type === "sample.report").contract_version = hostileValue("catalog-version")
      },
      find: (message) => message.includes("does not match catalog contract_version"),
      location: /Step 'publish-result' result sink\[0\] type 'sample\.report' contractVersion/
    }
  ]

  for (const item of cases) {
    const workflow = parsedWorkflow()
    const catalog = generatedTestCatalog()
    item.mutate(workflow, catalog)
    const diagnostics = validateCoreWorkflow(workflow, {
      filePath: "extensions/sample-extension/WORKFLOW.md",
      strict: true,
      contributionCatalog: catalog
    })
    const diagnostic = diagnostics.find((candidate) => item.find(candidate.message))
    assertSafeCatalogDiagnostic(diagnostic, item.location)
  }
})

test("catalog resolution matches original raw values instead of their sanitized diagnostic display", () => {
  const workflow = parsedWorkflow()
  const catalog = generatedTestCatalog()
  const rawAction = `raw\u0000${"界".repeat(200)}`
  const collidingAction = `raw\u0001${"界".repeat(200)}`
  const rawCheck = `ready\u007f${"界".repeat(200)}`
  const collidingCheck = `ready\u0085${"界".repeat(200)}`
  const rawSink = `sink\u001f${"界".repeat(200)}`
  const collidingSink = `sink\u009f${"界".repeat(200)}`
  const rawVersion = `version\u0000${"界".repeat(200)}`

  workflow.engineSteps[0].action.provider = rawAction
  workflow.preflight[0].checks[0] = rawCheck
  workflow.engineSteps[1].result.sinks[0].type = rawSink
  workflow.engineSteps[1].result.sinks[0].contractVersion = rawVersion
  catalog.action_providers = [
    { ...catalog.action_providers[0], id: rawAction },
    { ...catalog.action_providers[0], id: collidingAction }
  ]
  catalog.preflight_checks = [
    { ...catalog.preflight_checks[0], id: rawCheck },
    { ...catalog.preflight_checks[0], id: collidingCheck }
  ]
  const sink = catalog.result_sinks.find((entry) => entry.type === "sample.report")
  const builtInSinks = catalog.result_sinks.filter((entry) => entry.type === "command" || entry.type === "file")
  catalog.result_sinks = [
    { ...sink, type: rawSink, contract_version: rawVersion },
    { ...sink, type: collidingSink, contract_version: rawVersion },
    ...builtInSinks
  ]

  const diagnostics = validateCoreWorkflow(workflow, {
    filePath: "extensions/sample-extension/WORKFLOW.md",
    strict: true,
    contributionCatalog: catalog
  })
  assert.equal(diagnostics.some((item) => item.message.includes("contribution catalog match")), false)
  assert.equal(diagnostics.some((item) => item.message.includes("does not match catalog contract_version")), false)
})

test("agent result sinks report the agent step id and exact sink index for missing, ambiguous, and incompatible references", () => {
  const text = workflowText().replace(
    /  - id: publish-result[\s\S]*?        - type: command\n          command: sample\.capture\n/,
    `  - id: analyze-output
    title: Analyze output
    type: agent
    prompt: Analyze the collected context.
    result:
      source: agent
      sinks:
        - type: sample.report
          contractVersion: sample.report/v1
          payload:
            channel: audit
`
  )
  const expectedLocation = "Step 'analyze-output' result sink[0] type 'sample.report'"

  const missingCatalog = generatedTestCatalog()
  missingCatalog.result_sinks = missingCatalog.result_sinks.filter((entry) => entry.type !== "sample.report")
  assert.ok(messages(compile(text, missingCatalog)).includes(
    `${expectedLocation} has no contribution catalog match.`
  ))

  const ambiguousCatalog = generatedTestCatalog()
  const sink = ambiguousCatalog.result_sinks.find((entry) => entry.type === "sample.report")
  ambiguousCatalog.result_sinks.push({ ...sink, owner: "local.duplicate" })
  assert.ok(messages(compile(text, ambiguousCatalog)).includes(
    `${expectedLocation} has 2 contribution catalog matches.`
  ))

  const incompatibleText = text.replace("contractVersion: sample.report/v1", "contractVersion: sample.report/v2")
  assert.ok(messages(compile(incompatibleText)).includes(
    `${expectedLocation} contractVersion 'sample.report/v2' does not match catalog contract_version 'sample.report/v1'.`
  ))
})

test("strict catalog compile promotes parser and semantic warnings to errors", () => {
  const parserWarning = compile(workflowText({ extraTopLevel: "futureField: true\n" }))
  assert.equal(parserWarning.ok, false)
  assert.ok(parserWarning.diagnostics.some((item) =>
    item.severity === "error" && item.message === "unknown top-level field 'futureField'."
  ))
})

test("catalog diagnostics normalize repository separators deterministically", () => {
  const slashPath = "extensions/sample-extension/samples/sample-review/.bob/workflows/sample-review/WORKFLOW.md"
  const backslashPath = slashPath.replaceAll("/", "\\")
  const text = workflowText({ provider: "sample.missing" })
  const slash = compile(text, generatedTestCatalog(), { filePath: slashPath })
  const backslash = compile(text, generatedTestCatalog(), { filePath: backslashPath })

  assert.deepEqual(backslash.diagnostics, slash.diagnostics)
  assert.equal(backslash.workflow.filePath, slashPath)
})

test("provenance-backed workflow-register catalog strictly compiles only its present claimed workflows from real bytes", () => {
  const extensionDirectory = "extensions/workflow-register"
  const manifestPath = `${extensionDirectory}/contracts/workflow-contributions.json`
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, extensionDirectory, "package.json"), "utf8"))
  const manifestContent = fs.readFileSync(path.join(repositoryRoot, manifestPath), "utf8")
  const manifest = JSON.parse(manifestContent)
  const catalog = buildWorkflowContributionCatalog([{
    manifestPath,
    manifestContent,
    context: {
      expectedOwner: { id: `${packageJson.publisher}.${packageJson.name}`, version: packageJson.version },
      ownerDirectory: extensionDirectory
    },
    readContent: (repositoryPath) => fs.readFileSync(path.join(repositoryRoot, repositoryPath))
  }])
  const presentClaims = manifest.workflow_claims
    .map((claim) => claim.path)
    .filter((repositoryPath) => fs.existsSync(path.join(repositoryRoot, repositoryPath)))

  assert.ok(presentClaims.length > 0)
  for (const repositoryPath of presentClaims) {
    const result = compileWorkflowDocument({
      sourceId: "workflow-register",
      filePath: repositoryPath,
      text: fs.readFileSync(path.join(repositoryRoot, repositoryPath), "utf8"),
      strict: true,
      contributionCatalog: catalog
    })
    assert.equal(result.ok, true, `${repositoryPath}\n${messages(result).join("\n")}`)
  }
})
