"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const workflowCompiler = require("../out/core/workflowCompiler")
const {
  compileWorkflowContractDocument,
  compileWorkflowDocument
} = workflowCompiler
const { validateWorkflowText } = require("../out/core/workflowValidator")

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
    readContent: (repositoryPath) => repositoryPath.endsWith("/package.json")
      ? Buffer.from(JSON.stringify({
        publisher: "local",
        name: "sample-extension",
        version: "1.2.3",
        contributes: { commands: [{ command: "sample.capture", title: "Capture" }] }
      }))
      : `declared test bytes: ${repositoryPath}`
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

function agentResultWorkflowText() {
  return workflowText().replace(
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
}

function compile(text, contributionCatalog = generatedTestCatalog(), overrides = {}) {
  return compileWorkflowContractDocument({
    sourceId: "workflow-register",
    filePath: "extensions/sample-extension/samples/sample-review/.bob/workflows/sample-review/WORKFLOW.md",
    filePathSyntax: "canonical-repository",
    text,
    contributionCatalog,
    ...overrides
  })
}

function messages(result) {
  return result.diagnostics.map((item) => item.message)
}

function compileContractOptions(contributionCatalog) {
  return {
    sourceId: "workflow-register",
    filePath: "extensions/sample-extension/WORKFLOW.md",
    filePathSyntax: "canonical-repository",
    text: workflowText(),
    contributionCatalog
  }
}

function assertInvalidCatalog(contributionCatalog, reason) {
  const options = compileContractOptions(contributionCatalog)
  const first = compileWorkflowContractDocument(options)
  const second = compileWorkflowContractDocument(options)
  assert.equal(first.ok, false)
  assert.equal(first.workflow, undefined)
  assert.deepEqual(second, first)
  assert.deepEqual(first.diagnostics, [{
    severity: "error",
    filePath: options.filePath,
    message: `Workflow contribution catalog is invalid: ${reason}.`
  }])
}

function hostileValue(prefix) {
  return `${prefix}\u0000\u001f\u007f\u0085${"界".repeat(200)}😀tail`
}

function contractVersionOfLength(length) {
  return `${"a".repeat(length - 3)}/v1`
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

test("strict compile resolves action, preflight, custom sink version, and built-in sink types from a generated catalog", () => {
  const result = compile(workflowText())

  assert.equal(result.ok, true, messages(result).join("\n"))
})

test("catalog-aware core validation is not exported outside the mandatory document facade", () => {
  const workflowValidator = require("../out/core/workflowValidator")

  assert.equal(workflowCompiler.validateCoreWorkflow, undefined)
  assert.equal(workflowValidator.validateCoreWorkflow, undefined)
})

for (const [name, structuralCompile] of [
  ["compileWorkflowDocument", compileWorkflowDocument],
  ["validateWorkflowText", validateWorkflowText]
]) {
  test(`${name} ignores a forged contributionLookup capability`, () => {
    const options = {
      sourceId: "workflow-register",
      filePath: "extensions/sample-extension/WORKFLOW.md",
      text: workflowText(),
      strict: true
    }
    const baseline = structuralCompile(options)
    const forged = structuralCompile({
      ...options,
      contributionLookup: {
        actionProviders: new Map(),
        preflightChecks: new Map(),
        resultSinks: new Map()
      }
    })

    assert.equal(baseline.ok, true, messages(baseline).join("\n"))
    assert.deepEqual(forged, baseline)
  })

  test(`${name} ignores a malformed contributionLookup capability without throwing`, () => {
    const options = {
      sourceId: "workflow-register",
      filePath: "extensions/sample-extension/WORKFLOW.md",
      text: workflowText(),
      strict: true
    }
    const baseline = structuralCompile(options)
    const contributionLookup = new Proxy({}, {
      get() {
        throw new Error("must not escape")
      }
    })
    let result

    assert.doesNotThrow(() => {
      result = structuralCompile({ ...options, contributionLookup })
    })
    assert.deepEqual(result, baseline)
  })
}

test("mandatory workflow contract facade retains private contribution resolution", () => {
  const result = compile(workflowText({ provider: "sample.missing" }))

  assert.equal(result.ok, false)
  assert.ok(messages(result).includes(
    "Command step 'collect-context' action provider 'sample.missing' has no contribution catalog match."
  ))
})

test("repository contract compilation requires a non-null generated catalog", () => {
  assert.equal(typeof compileWorkflowContractDocument, "function")
  const options = {
    sourceId: "workflow-register",
    filePath: "extensions/sample-extension/WORKFLOW.md",
    filePathSyntax: "canonical-repository",
    text: workflowText()
  }

  for (const contributionCatalog of [undefined, null]) {
    const result = compileWorkflowContractDocument({ ...options, contributionCatalog })
    assert.equal(result.ok, false)
    assert.equal(result.workflow, undefined)
    assert.deepEqual(result.diagnostics, [{
      severity: "error",
      filePath: options.filePath,
      message: "Workflow contribution catalog is invalid: expected a non-null plain data object."
    }])
  }

  const result = compileWorkflowContractDocument({
    ...options,
    contributionCatalog: generatedTestCatalog()
  })
  assert.equal(result.ok, true, messages(result).join("\n"))
})

for (const field of ["action_providers", "preflight_checks", "result_sinks", "commands", "external_commands"]) {
  test(`repository contract compilation rejects non-array catalog field ${field}`, () => {
    const catalog = generatedTestCatalog()
    catalog[field] = null
    assertInvalidCatalog(catalog, `field '${field}' must be an array`)
  })
}

for (const field of ["commands", "external_commands"]) {
  test(`repository contract compilation rejects accessor catalog metadata ${field} without invoking it`, () => {
    const catalog = generatedTestCatalog()
    let reads = 0
    Object.defineProperty(catalog, field, {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1
        throw new Error("must not escape")
      }
    })

    assertInvalidCatalog(catalog, `field '${field}' must be an own data property`)
    assert.equal(reads, 0)
  })
}

test("repository contract compilation rejects external command workflow path accessors without invoking them", () => {
  const catalog = generatedTestCatalog()
  let reads = 0
  Object.defineProperty(catalog.external_commands[0], "workflow_paths", {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1
      throw new Error("must not escape")
    }
  })

  assertInvalidCatalog(
    catalog,
    "field 'external_commands[0].workflow_paths' must be an own data property"
  )
  assert.equal(reads, 0)
})

test("repository contract compilation contains throwing command catalog array traps", () => {
  const catalog = generatedTestCatalog()
  catalog.commands = new Proxy(catalog.commands, {
    getOwnPropertyDescriptor() {
      throw new Error("must not escape")
    }
  })

  assertInvalidCatalog(catalog, "catalog data could not be snapshotted")
})

test("repository contract compilation rejects accessor catalog metadata without invoking it", () => {
  const catalog = generatedTestCatalog()
  let reads = 0
  Object.defineProperty(catalog, "action_providers", {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1
      throw new Error("must not escape")
    }
  })

  assertInvalidCatalog(catalog, "field 'action_providers' must be an own data property")
  assert.equal(reads, 0)
})

test("repository contract compilation contains throwing catalog metadata traps", () => {
  const catalog = new Proxy(generatedTestCatalog(), {
    getOwnPropertyDescriptor() {
      throw new Error("must not escape")
    }
  })

  assertInvalidCatalog(catalog, "catalog data could not be snapshotted")
})

test("repository contract compilation contains a revoked top-level catalog proxy", () => {
  const revocable = Proxy.revocable(generatedTestCatalog(), {})
  revocable.revoke()

  assertInvalidCatalog(revocable.proxy, "catalog data could not be snapshotted")
})

test("repository contract compilation rejects invalid catalog contribution versions", () => {
  const catalog = generatedTestCatalog()
  catalog.result_sinks[0].contract_version = "sample.report/v0"

  assertInvalidCatalog(catalog, "field 'result_sinks[0].contract_version' is invalid")
})

for (const { field, keyField, key, label } of [
  { field: "action_providers", keyField: "id", key: "sample.collect", label: "action provider" },
  { field: "preflight_checks", keyField: "id", key: "sample.workspaceReady", label: "preflight check" },
  { field: "result_sinks", keyField: "type", key: "file", label: "built-in file result sink" }
]) {
  test(`repository contract compilation bounds ${label} contract_version at 256 characters`, () => {
    const acceptedCatalog = generatedTestCatalog()
    const acceptedIndex = acceptedCatalog[field].findIndex((entry) => entry[keyField] === key)
    assert.notEqual(acceptedIndex, -1)
    acceptedCatalog[field][acceptedIndex].contract_version = contractVersionOfLength(256)
    const accepted = compile(workflowText(), acceptedCatalog)
    assert.equal(accepted.ok, true, messages(accepted).join("\n"))

    const rejectedCatalog = generatedTestCatalog()
    const rejectedIndex = rejectedCatalog[field].findIndex((entry) => entry[keyField] === key)
    assert.notEqual(rejectedIndex, -1)
    rejectedCatalog[field][rejectedIndex].contract_version = contractVersionOfLength(257)
    assertInvalidCatalog(
      rejectedCatalog,
      `field '${field}[${rejectedIndex}].contract_version' is invalid`
    )
  })
}

test("repository contract compilation rejects a changing path syntax accessor without aliasing literal backslashes", () => {
  const literalBackslashPath = "extensions/sample-extension/literal\\backslash/WORKFLOW.md"
  const options = compileContractOptions(generatedTestCatalog())
  options.filePath = literalBackslashPath
  let reads = 0
  Object.defineProperty(options, "filePathSyntax", {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1
      return reads === 1 ? "canonical-repository" : "windows-separated"
    }
  })

  const first = compileWorkflowContractDocument(options)
  const second = compileWorkflowContractDocument(options)
  assert.equal(reads, 0)
  assert.deepEqual(second, first)
  assert.deepEqual(first, {
    ok: false,
    workflow: undefined,
    diagnostics: [{
      severity: "error",
      filePath: literalBackslashPath,
      message: "Workflow contract compile options are invalid: field 'filePathSyntax' must be an own data property."
    }]
  })
})

for (const field of ["sourceId", "filePath", "text", "contributionCatalog"]) {
  test(`repository contract compilation rejects accessor option ${field} without invoking it`, () => {
    const options = compileContractOptions(generatedTestCatalog())
    let reads = 0
    Object.defineProperty(options, field, {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1
        throw new Error("must not escape")
      }
    })

    const result = compileWorkflowContractDocument(options)
    assert.equal(reads, 0)
    assert.deepEqual(result, {
      ok: false,
      workflow: undefined,
      diagnostics: [{
        severity: "error",
        filePath: field === "filePath" ? "<workflow-contract-options>" : options.filePath,
        message: `Workflow contract compile options are invalid: field '${field}' must be an own data property.`
      }]
    })
  })
}

test("repository contract compilation contains throwing option descriptor traps", () => {
  const options = new Proxy(compileContractOptions(generatedTestCatalog()), {
    getOwnPropertyDescriptor() {
      throw new Error("must not escape")
    }
  })

  const result = compileWorkflowContractDocument(options)
  assert.deepEqual(result, {
    ok: false,
    workflow: undefined,
    diagnostics: [{
      severity: "error",
      filePath: "<workflow-contract-options>",
      message: "Workflow contract compile options are invalid: options data could not be snapshotted."
    }]
  })
})

for (const filePath of [null, 42]) {
  test(`repository contract compilation rejects non-string file path ${String(filePath)}`, () => {
    const options = compileContractOptions(generatedTestCatalog())
    options.filePath = filePath

    const result = compileWorkflowContractDocument(options)
    assert.deepEqual(result, {
      ok: false,
      workflow: undefined,
      diagnostics: [{
        severity: "error",
        filePath: "<workflow-contract-options>",
        message: "Workflow contract compile options are invalid: field 'filePath' must be a non-empty string."
      }]
    })
  })
}

test("strict compile rejects a missing action provider at the command step", () => {
  const missing = compile(workflowText({ provider: "sample.missing" }))
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Command step 'collect-context' action provider 'sample.missing' has no contribution catalog match."
  ))
})

test("strict compile rejects an ambiguous action provider at the command step", () => {
  const ambiguousCatalog = generatedTestCatalog()
  ambiguousCatalog.action_providers.push({ ...ambiguousCatalog.action_providers[0], owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Command step 'collect-context' action provider 'sample.collect' has 2 contribution catalog matches."
  ))
})

test("strict compile rejects a missing preflight check at the block and check", () => {
  const missing = compile(workflowText({ check: "sample.missingReady" }))
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Preflight 'repository-ready' check 'sample.missingReady' has no contribution catalog match."
  ))
})

test("strict compile rejects an ambiguous preflight check at the block and check", () => {
  const ambiguousCatalog = generatedTestCatalog()
  ambiguousCatalog.preflight_checks.push({ ...ambiguousCatalog.preflight_checks[0], owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Preflight 'repository-ready' check 'sample.workspaceReady' has 2 contribution catalog matches."
  ))
})

test("strict compile rejects an unknown custom result sink at the exact index", () => {
  const missing = compile(workflowText({ customType: "sample.missingReport", customVersion: "sample.missing-report/v1" }))
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Step 'publish-result' result sink[0] type 'sample.missingReport' has no contribution catalog match."
  ))
})

test("strict compile rejects an ambiguous custom result sink at the exact index", () => {
  const ambiguousCatalog = generatedTestCatalog()
  const custom = ambiguousCatalog.result_sinks.find((entry) => entry.type === "sample.report")
  ambiguousCatalog.result_sinks.push({ ...custom, owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Step 'publish-result' result sink[0] type 'sample.report' has 2 contribution catalog matches."
  ))
})

test("strict compile rejects a version-incompatible custom result sink at the exact index", () => {
  const incompatible = compile(workflowText({ customVersion: "sample.report/v2" }))
  assert.equal(incompatible.ok, false)
  assert.ok(messages(incompatible).includes(
    "Step 'publish-result' result sink[0] type 'sample.report' contractVersion 'sample.report/v2' does not match catalog contract_version 'sample.report/v1'."
  ))
})

test("strict compile rejects a missing built-in sink without requiring a workflow version", () => {
  const missingCatalog = generatedTestCatalog()
  missingCatalog.result_sinks = missingCatalog.result_sinks.filter((entry) => entry.type !== "file")
  const missing = compile(workflowText(), missingCatalog)
  assert.equal(missing.ok, false)
  assert.ok(messages(missing).includes(
    "Step 'publish-result' result sink[1] type 'file' has no contribution catalog match."
  ))
})

test("strict compile rejects an ambiguous built-in sink without requiring a workflow version", () => {
  const ambiguousCatalog = generatedTestCatalog()
  const command = ambiguousCatalog.result_sinks.find((entry) => entry.type === "command")
  ambiguousCatalog.result_sinks.push({ ...command, owner: "local.duplicate" })
  const ambiguous = compile(workflowText(), ambiguousCatalog)
  assert.equal(ambiguous.ok, false)
  assert.ok(messages(ambiguous).includes(
    "Step 'publish-result' result sink[2] type 'command' has 2 contribution catalog matches."
  ))
})

test("catalog diagnostics bound and sanitize every newly echoed contribution value", () => {
  const cases = [
    {
      name: "action provider",
      source: "provider: sample.collect",
      replacement: `provider: ${JSON.stringify(hostileValue("provider"))}`,
      catalogField: "action_providers",
      find: (message) => message.includes("action provider"),
      location: /Command step 'collect-context' action provider/
    },
    {
      name: "preflight check",
      source: "- sample.workspaceReady",
      replacement: `- ${JSON.stringify(hostileValue("check"))}`,
      catalogField: "preflight_checks",
      find: (message) => message.includes("Preflight"),
      location: /Preflight 'repository-ready' check/
    }
  ]

  for (const item of cases) {
    const catalog = generatedTestCatalog()
    catalog[item.catalogField] = []
    const result = compile(workflowText().replace(item.source, item.replacement), catalog)
    assert.equal(result.ok, false, item.name)
    const diagnostic = result.diagnostics.find((candidate) => item.find(candidate.message))
    assertSafeCatalogDiagnostic(diagnostic, item.location)
  }
})

test("a missing agent result sink reports the agent step id and exact sink index", () => {
  const text = agentResultWorkflowText()
  const expectedLocation = "Step 'analyze-output' result sink[0] type 'sample.report'"

  const missingCatalog = generatedTestCatalog()
  missingCatalog.result_sinks = missingCatalog.result_sinks.filter((entry) => entry.type !== "sample.report")
  assert.ok(messages(compile(text, missingCatalog)).includes(
    `${expectedLocation} has no contribution catalog match.`
  ))
})

test("an ambiguous agent result sink reports the agent step id and exact sink index", () => {
  const text = agentResultWorkflowText()
  const expectedLocation = "Step 'analyze-output' result sink[0] type 'sample.report'"
  const ambiguousCatalog = generatedTestCatalog()
  const sink = ambiguousCatalog.result_sinks.find((entry) => entry.type === "sample.report")
  ambiguousCatalog.result_sinks.push({ ...sink, owner: "local.duplicate" })
  assert.ok(messages(compile(text, ambiguousCatalog)).includes(
    `${expectedLocation} has 2 contribution catalog matches.`
  ))
})

test("an incompatible agent result sink reports the agent step id and exact sink index", () => {
  const text = agentResultWorkflowText()
  const expectedLocation = "Step 'analyze-output' result sink[0] type 'sample.report'"
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

test("canonical repository paths preserve POSIX literal backslashes without aliasing slash paths", () => {
  const slashPath = "extensions/sample-extension/literal/backslash/WORKFLOW.md"
  const literalBackslashPath = "extensions/sample-extension/literal\\backslash/WORKFLOW.md"
  const text = workflowText({ provider: "sample.missing" })
  const slash = compile(text, generatedTestCatalog(), { filePath: slashPath })
  const literalBackslash = compile(text, generatedTestCatalog(), { filePath: literalBackslashPath })

  assert.equal(slash.workflow.filePath, slashPath)
  assert.equal(literalBackslash.workflow.filePath, literalBackslashPath)
  assert.notDeepEqual(literalBackslash.diagnostics, slash.diagnostics)
  assert.ok(literalBackslash.diagnostics.every((item) => item.filePath === literalBackslashPath))
})

test("explicit Windows-separated repository paths normalize deterministically", () => {
  const slashPath = "extensions/sample-extension/samples/sample-review/.bob/workflows/sample-review/WORKFLOW.md"
  const backslashPath = slashPath.replaceAll("/", "\\")
  const text = workflowText({ provider: "sample.missing" })
  const slash = compile(text, generatedTestCatalog(), { filePath: slashPath })
  const backslash = compile(text, generatedTestCatalog(), {
    filePath: backslashPath,
    filePathSyntax: "windows-separated"
  })

  assert.deepEqual(backslash.diagnostics, slash.diagnostics)
  assert.equal(backslash.workflow.filePath, slashPath)
})

for (const filePathSyntax of [undefined, "auto-detect"]) {
  test(`repository contract compilation rejects non-explicit file path syntax ${String(filePathSyntax)}`, () => {
    const options = compileContractOptions(generatedTestCatalog())
    options.filePathSyntax = filePathSyntax

    const result = compileWorkflowContractDocument(options)
    assert.equal(result.ok, false)
    assert.equal(result.workflow, undefined)
    assert.deepEqual(result.diagnostics, [{
      severity: "error",
      filePath: options.filePath,
      message: "Workflow file path syntax is invalid: expected 'canonical-repository' or 'windows-separated'."
    }])
  })
}

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
    const result = compileWorkflowContractDocument({
      sourceId: "workflow-register",
      filePath: repositoryPath,
      filePathSyntax: "canonical-repository",
      text: fs.readFileSync(path.join(repositoryRoot, repositoryPath), "utf8"),
      contributionCatalog: catalog
    })
    assert.equal(result.ok, true, `${repositoryPath}\n${messages(result).join("\n")}`)
  }
})
