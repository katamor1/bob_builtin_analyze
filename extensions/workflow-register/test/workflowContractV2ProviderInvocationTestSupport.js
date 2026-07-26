const {
  rawPackageFromFiles
} = require("./workflowContractV2LockTestSupport")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function canonicalSchema(id, body) {
  const canonical = require("../out/core/contractV2/canonicalJson.js")
  const value = { $schema: DIALECT, $id: id, ...body }
  const bytes = canonical.canonicalJsonBytes(value)
  return {
    value,
    bytes,
    evidence: {
      id,
      bytes: bytes.byteLength,
      digest: canonical.canonicalJsonDigest(value)
    }
  }
}

function providerSchemas(options = {}) {
  return {
    input: canonicalSchema("schemas/input.json", {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false
    }),
    output: canonicalSchema("schemas/output.json", {
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
    artifact: canonicalSchema(
      "schemas/artifact.json",
      options.artifactSchemaBody ?? { type: "object" }
    )
  }
}

function workflowYaml(options) {
  const output = options.outputKind === "unit"
    ? ["      kind: unit"]
    : [
        "      kind: value",
        "      id: providerResult",
        "      schema: schemas/output.json",
        `      maxBytes: ${options.maxOutputBytes ?? 16777216}`
      ]
  const workspaceWrite = options.sideEffect === "workspace-write"
  const stepArtifacts = workspaceWrite
    ? ["    artifacts:", "      - report"]
    : ["    artifacts: []"]
  const requiredArtifacts = workspaceWrite
    ? [
        "requiredArtifacts:",
        "  - id: report",
        "    producedBy: invoke",
        `    path: ${options.artifactPath ?? "artifacts/report.json"}`,
        `    mediaType: ${options.artifactMediaType ?? "application/json"}`,
        "    schema: schemas/artifact.json",
        `    maxBytes: ${options.artifactMaxBytes ?? 64}`,
        "    owner: provider",
        `    required: ${options.artifactRequired === true ? "true" : "false"}`
      ]
    : ["requiredArtifacts: []"]
  return Buffer.from([
    "schemaVersion: workflow-register/v2",
    "id: provider-workflow",
    "name: Provider workflow",
    "description: Provider invocation fixture.",
    "inputs: []",
    "steps:",
    "  - id: invoke",
    "    title: Invoke provider",
    "    type: command",
    "    required: true",
    "    provider: sample.provider",
    "    input:",
    "      source: literal",
    "      value:",
    "        message: hello",
    "    output:",
    ...output,
    ...stepArtifacts,
    ...requiredArtifacts,
    "resumePolicy:",
    "  mode: fail-closed",
    "  maxAttempts: 1",
    "  retainCommittedOutputs: false",
    "  allowArtifactReuse: false",
    "providers:",
    "  - id: sample.provider",
    "    version: 1.0.0",
    "    inputSchema: schemas/input.json",
    `    output: ${options.outputKind === "unit" ? "{ kind: unit }" : "{ kind: value, schema: schemas/output.json }"}`,
    "    errorSchema: schemas/error.json",
    `    sideEffect: ${options.sideEffect ?? "none"}`,
    `    idempotency: ${options.idempotency ?? "idempotent"}`,
    ...requiredCapabilityYaml(options.sideEffect ?? "none"),
    "bob:",
    "  profile: bob/2.0.1",
    "  requiredCapabilities: []",
    "  taskCapabilities: []",
    ""
  ].join("\n"), "utf8")
}

function requiredCapabilityYaml(sideEffect) {
  if (sideEffect === "workspace-write") {
    return [
      "    requiredCapabilities:",
      "      - workflow.effect.workspace-write"
    ]
  }
  if (sideEffect === "external") {
    return [
      "    requiredCapabilities:",
      "      - workflow.effect.external"
    ]
  }
  return ["    requiredCapabilities: []"]
}

function lockedProviderEvidence(contractEvidence) {
  return Object.freeze({
    id: contractEvidence.id,
    requestedVersion: "1.0.0",
    exactVersion: contractEvidence.version,
    contractDigest: contractEvidence.contractDigest,
    inputSchema: contractEvidence.inputSchema,
    output: contractEvidence.output,
    errorSchema: contractEvidence.errorSchema,
    sideEffect: contractEvidence.sideEffect,
    idempotency: contractEvidence.idempotency,
    requiredCapabilities: contractEvidence.requiredCapabilities
  })
}

async function providerRuntime(options = {}) {
  const schemas = providerSchemas(options)
  const providerRegistry = require("../out/core/contractV2/providerRegistry.js")
  const registry = new providerRegistry.WorkflowProviderRegistry()
  const dispatch = options.dispatch ?? (() => options.outputKind === "unit" ? undefined : { ok: true })
  const registration = registry.register({
    sourceId: "test.provider",
    contract: {
      id: "sample.provider",
      version: "1.0.0",
      inputSchema: schemas.input.evidence,
      output: options.outputKind === "unit"
        ? { kind: "unit" }
        : { kind: "value", schema: schemas.output.evidence },
      errorSchema: schemas.error.evidence,
      sideEffect: options.sideEffect ?? "none",
      idempotency: options.idempotency ?? "idempotent",
      requiredCapabilities: requiredCapabilityValues(options.sideEffect ?? "none"),
      dispatch
    }
  })
  const catalog = registry.snapshot()
  const providerEvidence = lockedProviderEvidence(catalog.evidence.providers[0])
  const files = {
    "workflow.yaml": workflowYaml(options),
    "workflow.lock.json": Buffer.from("{}", "utf8"),
    "schemas/input.json": schemas.input.bytes,
    "schemas/error.json": schemas.error.bytes,
    ...(options.outputKind === "unit" ? {} : { "schemas/output.json": schemas.output.bytes }),
    ...(options.sideEffect === "workspace-write" ? { "schemas/artifact.json": schemas.artifact.bytes } : {})
  }
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const initial = rawPackageFromFiles(files)
  const lock = lockModule.generateWorkflowPackageLock({
    rawPackage: initial,
    providers: [providerEvidence],
    bob: {
      profile: "bob/2.0.1",
      requiredCapabilities: [],
      taskCapabilities: []
    }
  })
  files["workflow.lock.json"] = lockModule.encodeWorkflowPackageLock(lock)
  const rawPackage = rawPackageFromFiles(files)
  const compiler = require("../out/core/contractV2/index.js")
  const { snapshotBobContractProfile } = require("../out/core/contractV2/bobProfile.js")
  const environment = compiler.createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: catalog,
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })
  const store = new compiler.WorkflowPlanStore()
  const lease = await store.acquire({
    collectionId: "test/providers",
    workflowId: rawPackage.workflowId,
    rawPackage,
    environment
  })
  return {
    catalog,
    dispatch,
    environment,
    files,
    lease,
    lock,
    providerEvidence,
    rawPackage,
    registration,
    registry,
    schemas,
    store
  }
}

function requiredCapabilityValues(sideEffect) {
  if (sideEffect === "workspace-write") return ["workflow.effect.workspace-write"]
  if (sideEffect === "external") return ["workflow.effect.external"]
  return []
}

function createAttempt(options = {}) {
  const attemptModule = require("../out/core/contractV2/providerAttemptStaging.js")
  const staged = []
  let releaseStage
  const waitForStage = options.pauseStage
    ? new Promise((resolve) => { releaseStage = resolve })
    : undefined
  const attempt = attemptModule.createWorkflowAttemptStaging({
    ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    stageArtifact: async (input) => {
      if (waitForStage) await waitForStage
      staged.push({ id: input.id, bytes: Buffer.from(input.bytes) })
    }
  })
  return {
    attempt,
    staged,
    releaseStage: () => releaseStage?.()
  }
}

function invocationSubject() {
  return require("../out/core/contractV2/providerInvocation.js")
}

module.exports = {
  createAttempt,
  invocationSubject,
  providerRuntime
}
