"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const Ajv = require("ajv")

const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const { compileWorkflowContractDocument } = require("../out/core/workflowValidator")

const fixtureManifestPath = path.join(__dirname, "fixtures", "workflow-contributions", "valid.json")
const declaredSamplePath = "extensions/sample-extension/samples/sample-review/.bob/workflows/sample-review/WORKFLOW.md"

function manifestFixture({ owner = "local.sample-extension", version = "1.2.3", includeContracts = true } = {}) {
  const manifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8"))
  manifest.owner = { id: owner, version }
  if (owner !== "local.sample-extension") {
    manifest.workflow_templates = []
    manifest.workflow_claims = []
    manifest.workflow_exclusions = []
    manifest.external_commands = []
    manifest.schemas = []
    manifest.action_providers = []
    manifest.preflight_checks = []
    manifest.result_sinks = []
    delete manifest.agent_provider
  } else if (includeContracts) {
    manifest.action_providers.push({
      id: "vscode.executeCommand",
      contract_version: "vscode.execute-command/v1",
      input_schema: "sample.collect-input",
      output_schema: "sample.collect-output",
      error_codes: []
    })
    manifest.result_sinks.push({
      type: "command",
      contract_version: "sample.command-result/v1",
      payload_schema: "sample.report-payload"
    })
  }
  return manifest
}

function packageJson(owner, version, commands) {
  const [publisher, name] = owner.split(".")
  return Buffer.from(JSON.stringify({
    publisher,
    name,
    version,
    contributes: {
      commands: commands.map((command) => ({ command, title: command }))
    }
  }))
}

function catalogEntry({
  manifest = manifestFixture(),
  ownerDirectory = "extensions/sample-extension",
  commands = ["sample.capture"],
  packageBytes,
  readPackage
} = {}) {
  const manifestPath = `${ownerDirectory}/contracts/workflow-contributions.json`
  const packagePath = `${ownerDirectory}/package.json`
  return {
    manifestPath,
    manifestContent: JSON.stringify(manifest),
    context: {
      expectedOwner: manifest.owner,
      ownerDirectory
    },
    readContent(repositoryPath) {
      if (repositoryPath === packagePath) {
        return readPackage
          ? readPackage()
          : packageBytes ?? packageJson(manifest.owner.id, manifest.owner.version, commands)
      }
      return `declared fixture bytes: ${repositoryPath}`
    }
  }
}

function buildCatalog(overrides) {
  return buildWorkflowContributionCatalog([catalogEntry(overrides)])
}

function commandWorkflow(commandId, { allowedCommandIds = [commandId], includeCommandSink } = {}) {
  const renderedId = typeof commandId === "string" ? JSON.stringify(commandId) : String(commandId)
  const allowed = allowedCommandIds.length > 0
    ? `  allowedCommandIds:\n${allowedCommandIds.map((id) => `    - ${JSON.stringify(id)}`).join("\n")}\n`
    : ""
  const resultStep = includeCommandSink
    ? `  - id: publish-result
    title: Publish result
    type: result
    result:
      source: state
      stateKey: commandResult
      sinks:
        - type: command
          command: ${JSON.stringify(includeCommandSink)}
`
    : ""
  return `---
schemaVersion: workflow-register/v1
name: command-contract
description: Resolve VS Code commands from extension package manifests.
guardrails:
  allowedCommands:
    - vscode.executeCommand
${allowed}steps:
  - id: invoke-command
    title: Invoke command
    type: command
    action:
      provider: vscode.executeCommand
      args:
        - ${renderedId}
    resultKey: commandResult
${resultStep}---
# Command contract
`
}

function compile(text, contributionCatalog = buildCatalog(), filePath = declaredSamplePath) {
  return compileWorkflowContractDocument({
    sourceId: "workflow-register",
    filePath,
    filePathSyntax: "canonical-repository",
    text,
    contributionCatalog
  })
}

function messages(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.message)
}

test("strict facade rejects an undeclared vscode.executeCommand command id", () => {
  const result = compile(commandWorkflow("sample.notContributed"))

  assert.equal(result.ok, false)
  assert.ok(messages(result).some((message) => /sample\.notContributed.*no command catalog match/i.test(message)), messages(result))
})

test("generated catalog rejects duplicate product command ids across extension packages", () => {
  const secondManifest = manifestFixture({ owner: "local.second-extension", version: "2.0.0" })

  assert.throws(
    () => buildWorkflowContributionCatalog([
      catalogEntry({ commands: ["shared.command"] }),
      catalogEntry({
        manifest: secondManifest,
        ownerDirectory: "extensions/second-extension",
        commands: ["shared.command"]
      })
    ]),
    /duplicate product command.*shared\.command.*local\.sample-extension.*local\.second-extension/i
  )
})

test("strict facade rejects an external sample command outside its exact declared workflow path", () => {
  const otherSamplePath = "extensions/sample-extension/samples/other/.bob/workflows/other/WORKFLOW.md"
  const result = compile(commandWorkflow("sample.externalReview"), buildCatalog(), otherSamplePath)

  assert.equal(result.ok, false)
  assert.ok(messages(result).some((message) => /sample\.externalReview.*not declared for workflow path/i.test(message)), messages(result))
})

test("strict facade rejects a workflow command removed from its owning extension package bytes", () => {
  const present = compile(commandWorkflow("sample.capture"), buildCatalog({ commands: ["sample.capture"] }))
  const removed = compile(commandWorkflow("sample.capture"), buildCatalog({ commands: [] }))

  assert.equal(present.ok, true, messages(present).join("\n"))
  assert.equal(removed.ok, false)
  assert.ok(messages(removed).some((message) => /sample\.capture.*no command catalog match/i.test(message)), messages(removed))
})

test("strict facade requires a path-scoped external vscode.executeCommand id in allowedCommandIds", () => {
  const result = compile(commandWorkflow("sample.externalReview", { allowedCommandIds: [] }))

  assert.equal(result.ok, false)
  assert.ok(messages(result).some((message) => /sample\.externalReview.*allowedCommandIds/i.test(message)), messages(result))
})

test("strict facade requires a product vscode.executeCommand id in allowedCommandIds", () => {
  const result = compile(commandWorkflow("sample.capture", { allowedCommandIds: [] }))

  assert.equal(result.ok, false)
  assert.ok(messages(result).some((message) => /sample\.capture.*allowedCommandIds/i.test(message)), messages(result))
})

for (const [name, mutateCatalog, duplicateId] of [
  ["product/product", (catalog) => {
    catalog.commands.push({ ...catalog.commands[0] })
  }, "sample.capture"],
  ["external/external", (catalog) => {
    catalog.external_commands.push({
      ...catalog.external_commands[0],
      workflow_paths: [...catalog.external_commands[0].workflow_paths]
    })
  }, "sample.externalReview"],
  ["product/external", (catalog) => {
    catalog.external_commands.push({
      owner: "local.sample-extension",
      id: "sample.capture",
      contract_version: "other.sample-capture/v1",
      workflow_paths: ["extensions/other-extension/samples/other/WORKFLOW.md"]
    })
  }, "sample.capture"]
]) {
  test(`strict facade rejects global ${name} command duplicates before path filtering`, () => {
    const catalog = buildCatalog()
    mutateCatalog(catalog)
    const result = compile(commandWorkflow("sample.capture"), catalog)
    const repeated = compile(commandWorkflow("sample.capture"), catalog)

    assert.equal(result.ok, false)
    assert.equal(result.workflow, undefined)
    assert.equal(result.diagnostics.length, 1)
    assert.match(result.diagnostics[0].message, new RegExp(`catalog is invalid.*duplicate command id '${duplicateId.replace(".", "\\.")}'`, "i"))
    assert.deepEqual(repeated, result)
  })
}

for (const [name, commandId] of [["empty", ""], ["non-string", 42]]) {
  test(`strict facade rejects ${name} vscode.executeCommand args[0]`, () => {
    const result = compile(commandWorkflow(commandId, { allowedCommandIds: [] }))

    assert.equal(result.ok, false)
    assert.ok(messages(result).some((message) => /args\[0\].*non-empty command id/i.test(message)), messages(result))
  })
}

test("strict facade leaves command result sink execution policy to the runtime sink registry", () => {
  const result = compile(commandWorkflow("sample.capture", { includeCommandSink: "sample.missingSink" }))

  assert.equal(result.ok, true, messages(result).join("\n"))
})

test("duplicate command catalog diagnostics are deterministic and bound the echoed id", () => {
  const duplicateId = "x".repeat(200)
  const catalog = buildCatalog()
  catalog.commands.push(
    { owner: "local.sample-extension", id: duplicateId, package_path: "extensions/sample-extension/package.json" },
    { owner: "local.sample-extension", id: duplicateId, package_path: "extensions/sample-extension/package.json" }
  )
  const first = compile(commandWorkflow("sample.capture"), catalog)
  const second = compile(commandWorkflow("sample.capture"), catalog)
  const displayed = first.diagnostics[0].message.match(/duplicate command id '([^']+)'/)?.[1]

  assert.equal(first.ok, false)
  assert.deepEqual(second, first)
  assert.equal(typeof displayed, "string")
  assert.ok(Buffer.byteLength(displayed, "utf8") <= 256)
})

test("strict facade resolves every guardrail allowedCommandIds entry through the same command catalog", () => {
  const result = compile(commandWorkflow("sample.capture", {
    allowedCommandIds: ["sample.capture", "sample.guardrailOnlyMissing"]
  }))

  assert.equal(result.ok, false)
  assert.ok(messages(result).some((message) => /guardrail command id.*sample\.guardrailOnlyMissing.*no command catalog match/i.test(message)), messages(result))
})

test("package command bytes are read once and invalid UTF-8 fails closed", () => {
  let reads = 0
  const packageBytes = packageJson("local.sample-extension", "1.2.3", ["sample.capture"])
  const catalog = buildWorkflowContributionCatalog([catalogEntry({
    readPackage() {
      reads += 1
      return packageBytes
    }
  })])

  assert.equal(reads, 1)
  assert.deepEqual(catalog.commands, [{
    owner: "local.sample-extension",
    id: "sample.capture",
    package_path: "extensions/sample-extension/package.json"
  }])
  assert.throws(
    () => buildCatalog({ packageBytes: Buffer.from([0xc3, 0x28]) }),
    /package manifest content must be valid UTF-8 JSON/i
  )
  assert.throws(
    () => buildCatalog({ packageBytes: packageJson("local.sample-extension", "1.2.3", ["sample.capture"]).toString("utf8") }),
    /package manifest content must be a Buffer/i
  )
})

for (const [name, mutateCatalog, expected] of [
  ["duplicate owners", (catalog) => {
    catalog.owners.push({ ...catalog.owners[0] })
  }, /duplicate owner.*local\.sample-extension/i],
  ["an owner accessor", (catalog) => {
    const owner = { ...catalog.owners[0] }
    Object.defineProperty(owner, "id", { enumerable: true, get() { return "local.sample-extension" } })
    catalog.owners[0] = owner
  }, /owners\[0\]\.id.*own data property/i],
  ["an invented product-command owner", (catalog) => {
    catalog.commands[0].owner = "local.invented-extension"
  }, /commands\[0\]\.owner.*owners record/i],
  ["an invented external-command owner", (catalog) => {
    catalog.external_commands[0].owner = "local.invented-extension"
  }, /external_commands\[0\]\.owner.*owners record/i],
  ["a product command package outside its owner directory", (catalog) => {
    catalog.commands[0].package_path = "extensions/unrelated/package.json"
  }, /commands\[0\]\.package_path.*owner.*manifest_path/i],
  ["a control character in an external workflow path", (catalog) => {
    catalog.external_commands[0].workflow_paths = ["extensions/sample-\nextension/WORKFLOW.md"]
  }, /external_commands\[0\]\.workflow_paths\[0\].*invalid/i]
]) {
  test(`strict facade rejects ${name} before workflow command lookup`, () => {
    const catalog = buildCatalog()
    mutateCatalog(catalog)
    const result = compile(commandWorkflow("sample.capture"), catalog)

    assert.equal(result.ok, false)
    assert.equal(result.workflow, undefined)
    assert.equal(result.diagnostics.length, 1)
    assert.match(result.diagnostics[0].message, expected)
  })
}

test("catalog rejects an overlong derived package path before reading it and bounds the diagnostic", () => {
  const ownerDirectory = `${"a".repeat(2030)}/long-extension`
  const manifest = manifestFixture({ owner: "local.long-extension", version: "2.0.0" })
  let reads = 0
  let caught
  try {
    buildWorkflowContributionCatalog([catalogEntry({
      manifest,
      ownerDirectory,
      readPackage() {
        reads += 1
        return packageJson(manifest.owner.id, manifest.owner.version, [])
      }
    })])
  } catch (error) {
    caught = error
  }

  assert.ok(caught instanceof Error)
  assert.equal(reads, 0)
  assert.match(caught.message, /package path.*invalid/i)
  assert.equal(caught.message.includes(ownerDirectory), false)
  const displayedPath = caught.message.match(/package path '([^']+)'/)?.[1]
  assert.equal(typeof displayedPath, "string")
  assert.ok(Buffer.byteLength(displayedPath, "utf8") <= 256)
})

test("generated product and external commands round-trip through the closed catalog schema", () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "schema", "workflow-contribution-catalog.v1.schema.json"),
    "utf8"
  ))
  const validate = new Ajv({ strict: true }).compile(schema)
  const catalog = buildCatalog({ commands: ["sample.capture"] })

  assert.equal(validate(catalog), true, JSON.stringify(validate.errors, null, 2))
  assert.deepEqual(catalog.commands.map((entry) => entry.id), ["sample.capture"])
  assert.deepEqual(catalog.external_commands, [{
    owner: "local.sample-extension",
    id: "sample.externalReview",
    contract_version: "sample.external-review/v1",
    workflow_paths: [declaredSamplePath]
  }])

  for (const [field, values] of [
    ["package_path", [
      "../package.json",
      "./package.json",
      "extensions/../package.json",
      "extensions/./package.json",
      "extensions\\sample-extension\\package.json",
      "/extensions/sample-extension/package.json",
      "C:/extensions/sample-extension/package.json",
      "extensions/sample-extension/not-package.json",
      "extensions/*/package.json"
    ]],
    ["workflow_paths", [
      "../WORKFLOW.md",
      "./WORKFLOW.md",
      "extensions/../WORKFLOW.md",
      "extensions/./WORKFLOW.md",
      "extensions\\sample-extension\\WORKFLOW.md",
      "/extensions/sample-extension/WORKFLOW.md",
      "C:/extensions/sample-extension/WORKFLOW.md",
      "extensions/sample-extension/not-workflow.md",
      "extensions/*/WORKFLOW.md",
      "extensions/sample-\nextension/WORKFLOW.md"
    ]]
  ]) {
    for (const invalidPath of values) {
      const mutated = structuredClone(catalog)
      if (field === "package_path") mutated.commands[0].package_path = invalidPath
      else mutated.external_commands[0].workflow_paths = [invalidPath]
      assert.equal(validate(mutated), false, `${field}: ${invalidPath}`)
    }
  }
})

test("product and external workflow-command discovery contains no fixed package inventory or global allowlist", () => {
  const contractSource = fs.readFileSync(path.join(__dirname, "workflowContractFiles.test.js"), "utf8")
  const commandCatalogSources = ["contributionCatalog.ts", "extensionCommandCatalog.ts"]
    .map((name) => fs.readFileSync(path.join(__dirname, "..", "src", "core", name), "utf8"))
    .join("\n")

  assert.equal(contractSource.includes("const packagePaths ="), false)
  assert.equal(contractSource.includes("sampleExternalCommandAllowlist"), false)
  assert.equal(contractSource.includes('fs.readFileSync(path.join(repoRoot, repositoryPath), "utf8")'), false)
  assert.equal(commandCatalogSources.includes("const packagePaths ="), false)
  assert.equal(commandCatalogSources.includes("globalCommandAllowlist"), false)
  assert.equal(commandCatalogSources.includes('from "vscode"'), false)
  assert.equal(commandCatalogSources.includes("matchAll("), false)
})
