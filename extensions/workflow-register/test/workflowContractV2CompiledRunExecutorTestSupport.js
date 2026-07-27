const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")

const { rawPackageFromFiles } = require("./workflowContractV2LockTestSupport")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function canonicalSchema(id, body) {
  const canonical = require("../out/core/contractV2/canonicalJson.js")
  const value = { $schema: DIALECT, $id: id, ...body }
  const bytes = canonical.canonicalJsonBytes(value)
  return {
    bytes,
    evidence: {
      id,
      bytes: bytes.byteLength,
      digest: canonical.canonicalJsonDigest(value)
    }
  }
}

function workflowYaml(options) {
  const sideEffect = options.sideEffect ?? "none"
  const stepType = options.stepType ?? "command"
  const required = options.required !== false
  const workspaceWrite = sideEffect === "workspace-write"
  const runtimeRequiredArtifact = options.runtimeRequiredArtifact === true
  const hasArtifact = workspaceWrite || runtimeRequiredArtifact
  const hasInputs = options.withInput || options.skipCommand
  const inputs = hasInputs
    ? [
        "inputs:",
        "  - id: providerInput",
        "    title: Provider input",
        "    schema: schemas/input.json",
        "    required: true"
      ]
    : ["inputs: []"]
  if (options.skipCommand) {
    inputs.push(
      "  - id: shouldRun",
      "    title: Should run",
      "    schema: schemas/boolean.json",
      "    required: true"
    )
  }

  const entryPredicate = options.skipCommand
    ? [
        "    when:",
        "      kind: equals",
        "      left:",
        "        source: input",
        "        id: shouldRun",
        "        pointer: ''",
        "      right: true"
      ]
    : []
  const artifacts = hasArtifact
    ? ["    artifacts:", "      - report"]
    : ["    artifacts: []"]
  const transition = options.transitionGoto === undefined
    ? []
    : [
        "    transition:",
        "      decisions: []",
        "      default:",
        `        goto: ${options.transitionGoto}`
      ]
  const requiredArtifacts = hasArtifact
    ? [
        "requiredArtifacts:",
        "  - id: report",
        "    producedBy: invoke",
        "    path: artifacts/report.json",
        "    mediaType: application/json",
        "    schema: schemas/artifact.json",
        "    maxBytes: 4096",
        `    owner: ${runtimeRequiredArtifact ? "runtime" : "provider"}`,
        "    required: true"
      ]
    : ["requiredArtifacts: []"]

  const commandInput = hasInputs
    ? [
        "    input:",
        "      source: input",
        "      id: providerInput",
        "      pointer: ''"
      ]
    : [
        "    input:",
        "      source: literal",
        "      value:",
        "        message: hello"
      ]
  const output = [
    "    output:",
    "      kind: value",
    "      id: providerResult",
    "      schema: schemas/output.json",
    "      maxBytes: 4096"
  ]
  const step = stepType === "agent"
    ? [
        "  - id: invoke",
        "    title: Invoke agent",
        "    type: agent",
        `    required: ${required}`,
        ...entryPredicate,
        "    prompt: prompts/agent.md",
        "    context: []",
        ...output,
        ...artifacts,
        ...transition
      ]
    : [
        "  - id: invoke",
        "    title: Invoke provider",
        "    type: command",
        `    required: ${required}`,
        ...entryPredicate,
        "    provider: sample.provider",
        ...commandInput,
        ...output,
        ...artifacts,
        ...transition
      ]

  const requiredCapabilities = sideEffect === "workspace-write"
    ? ["    requiredCapabilities:", "      - workflow.effect.workspace-write"]
    : sideEffect === "external"
      ? ["    requiredCapabilities:", "      - workflow.effect.external"]
      : ["    requiredCapabilities: []"]
  const providers = stepType === "agent"
    ? ["providers: []"]
    : [
        "providers:",
        "  - id: sample.provider",
        "    version: 1.0.0",
        "    inputSchema: schemas/input.json",
        "    output: { kind: value, schema: schemas/output.json }",
        "    errorSchema: schemas/error.json",
        `    sideEffect: ${sideEffect}`,
        "    idempotency: idempotent",
        ...requiredCapabilities
      ]

  return Buffer.from([
    "schemaVersion: workflow-register/v2",
    "id: compiled-runtime",
    "name: Compiled runtime",
    "description: Compiled runtime fixture.",
    ...inputs,
    "steps:",
    ...step,
    ...requiredArtifacts,
    "resumePolicy:",
    "  mode: fail-closed",
    "  maxAttempts: 1",
    "  retainCommittedOutputs: false",
    "  allowArtifactReuse: false",
    ...providers,
    "bob:",
    "  profile: bob/2.0.1",
    "  requiredCapabilities: []",
    "  taskCapabilities: []",
    ""
  ].join("\n"), "utf8")
}

async function compiledRuntime(t, options = {}) {
  const canonical = require("../out/core/contractV2/canonicalJson.js")
  const stepType = options.stepType ?? "command"
  const hasInputs = options.withInput || options.skipCommand
  const hasArtifact = options.sideEffect === "workspace-write" || options.runtimeRequiredArtifact === true
  const schemas = {
    input: canonicalSchema("schemas/input.json", {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false
    }),
    output: canonicalSchema("schemas/output.json", options.outputSchemaBody ?? {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false
    }),
    error: canonicalSchema("schemas/error.json", {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
      additionalProperties: false
    }),
    artifact: canonicalSchema("schemas/artifact.json", options.artifactSchemaBody ?? { type: "object" }),
    boolean: canonicalSchema("schemas/boolean.json", { type: "boolean" })
  }
  const registryModule = require("../out/core/contractV2/providerRegistry.js")
  const registry = new registryModule.WorkflowProviderRegistry()
  const dispatch = options.dispatch ?? (async () => ({ ok: true }))
  const registration = registry.register({
    sourceId: "compiled-runtime-test",
    contract: {
      id: "sample.provider",
      version: "1.0.0",
      inputSchema: schemas.input.evidence,
      output: { kind: "value", schema: schemas.output.evidence },
      errorSchema: schemas.error.evidence,
      sideEffect: options.sideEffect ?? "none",
      idempotency: "idempotent",
      requiredCapabilities: options.sideEffect === "workspace-write"
        ? ["workflow.effect.workspace-write"]
        : options.sideEffect === "external"
          ? ["workflow.effect.external"]
          : [],
      dispatch
    }
  })
  t.after(() => registration.dispose())
  const catalog = registry.snapshot()
  const provider = catalog.evidence.providers[0]
  const providerEvidence = Object.freeze({
    id: provider.id,
    requestedVersion: "1.0.0",
    exactVersion: provider.version,
    contractDigest: provider.contractDigest,
    inputSchema: provider.inputSchema,
    output: provider.output,
    errorSchema: provider.errorSchema,
    sideEffect: provider.sideEffect,
    idempotency: provider.idempotency,
    requiredCapabilities: provider.requiredCapabilities
  })

  const files = {
    "workflow.yaml": workflowYaml(options),
    "workflow.lock.json": Buffer.from("{}", "utf8"),
    "schemas/output.json": schemas.output.bytes,
    ...(stepType === "command" || hasInputs ? { "schemas/input.json": schemas.input.bytes } : {}),
    ...(stepType === "command" ? { "schemas/error.json": schemas.error.bytes } : {}),
    ...(hasArtifact ? { "schemas/artifact.json": schemas.artifact.bytes } : {}),
    ...(options.skipCommand ? { "schemas/boolean.json": schemas.boolean.bytes } : {}),
    ...(stepType === "agent" ? { "prompts/agent.md": Buffer.from("Return a JSON value.\n", "utf8") } : {})
  }
  const providers = stepType === "command" ? [providerEvidence] : []
  const lock = require("../out/core/contractV2/workflowLock.js")
  const slot = { workflowId: "compiled-runtime" }
  const initial = rawPackageFromFiles(files, slot)
  const generated = lock.generateWorkflowPackageLock({
    rawPackage: initial,
    providers,
    bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
  })
  files["workflow.lock.json"] = lock.encodeWorkflowPackageLock(generated)
  const rawPackage = rawPackageFromFiles(files, slot)
  const compiler = require("../out/core/contractV2/index.js")
  const { snapshotBobContractProfile } = require("../out/core/contractV2/bobProfile.js")
  const environment = compiler.createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: catalog,
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })
  const planStore = new compiler.WorkflowPlanStore()
  const lease = await planStore.acquire({
    collectionId: "test/compiled-runtime",
    workflowId: rawPackage.workflowId,
    rawPackage,
    environment
  })
  t.after(() => lease.release())

  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-contract-v2-r4-"))
  t.after(() => fsp.rm(workspaceRoot, { recursive: true, force: true }))
  const { ContractV2GuardedRunStateStore } = require("../out/workflowContractV2RunStateStore.js")
  const runStore = new ContractV2GuardedRunStateStore({ workspaceRoot, engineVersion: "test" })
  const runWithLease = require("../out/core/contractV2/runPlanProvenance.js").runWithWorkflowContractV2PlanLease

  return {
    canonical,
    dispatch,
    lease,
    planStore,
    registry,
    runStore,
    runWithLease,
    workspaceRoot
  }
}

function subject() {
  return require("../out/core/contractV2/compiledRunExecutor.js")
}

module.exports = { compiledRuntime, subject }
