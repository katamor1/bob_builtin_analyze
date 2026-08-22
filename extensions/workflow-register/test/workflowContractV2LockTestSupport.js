const crypto = require("node:crypto")

function digestBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`
}

function canonicalText(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(",")}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(",")}}`
}

function packageDigest(files) {
  const evidence = Object.entries(files)
    .map(([logicalPath, bytes]) => ({ path: logicalPath, digest: digestBytes(bytes) }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  return digestBytes(Buffer.from(canonicalText({ files: evidence }), "utf8"))
}

function sourceFiles(lockBytes = Buffer.from("{}", "utf8")) {
  return {
    "workflow.yaml": Buffer.from([
      "schemaVersion: workflow-register/v2",
      "id: minimal",
      "name: Minimal",
      "description: Minimal lock fixture.",
      "inputs: []",
      "steps:",
      "  - id: finish",
      "    title: Finish",
      "    type: result",
      "    required: true",
      "    source: { source: literal, value: null }",
      "    artifacts: []",
      "requiredArtifacts: []",
      "resumePolicy:",
      "  mode: fail-closed",
      "  maxAttempts: 1",
      "  retainCommittedOutputs: false",
      "  allowArtifactReuse: false",
      "providers: []",
      "bob:",
      "  profile: bob/2.0.1",
      "  requiredCapabilities: []",
      "  taskCapabilities: []",
      ""
    ].join("\n"), "utf8"),
    "workflow.lock.json": Buffer.from(lockBytes),
    "prompts/intro.md": Buffer.from("Review the input.\n", "utf8"),
    "schemas/error.json": Buffer.from('{"$id":"schemas/error.json","$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}', "utf8"),
    "schemas/request.json": Buffer.from('{"$id":"schemas/request.json","$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}', "utf8"),
    "schemas/response.json": Buffer.from('{"$id":"schemas/response.json","$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}', "utf8")
  }
}

function rawPackageFromFiles(files, overrides = {}) {
  const digest = packageDigest(files)
  const rawFiles = Object.keys(files).sort().map((logicalPath) => {
    const bytes = Uint8Array.from(files[logicalPath])
    return {
      path: logicalPath,
      bytes,
      byteLength: bytes.byteLength,
      digest: digestBytes(bytes)
    }
  })
  return {
    publication: "published",
    workflowId: "minimal",
    generation: digest,
    packageDigest: digest,
    files: rawFiles,
    ...overrides
  }
}

function schemaEvidence(files, id) {
  const bytes = files[id]
  return { id, bytes: bytes.byteLength, digest: digestBytes(bytes) }
}

function providerEvidence(files, options = {}) {
  const alphaCapabilities = options.reverseCapabilities
    ? ["workflow.effect.workspace-write", "provider.alpha"]
    : ["provider.alpha", "workflow.effect.workspace-write"]
  const providers = [
    {
      id: "alpha.provider",
      requestedVersion: "^1.0.0",
      exactVersion: "1.2.3",
      contractDigest: digestBytes(Buffer.from("alpha-provider-contract", "utf8")),
      inputSchema: schemaEvidence(files, "schemas/request.json"),
      output: { kind: "value", schema: schemaEvidence(files, "schemas/response.json") },
      errorSchema: schemaEvidence(files, "schemas/error.json"),
      sideEffect: "workspace-write",
      idempotency: "key-required",
      requiredCapabilities: alphaCapabilities
    },
    {
      id: "beta.provider",
      requestedVersion: "~2.0.0",
      exactVersion: "2.0.4",
      contractDigest: digestBytes(Buffer.from("beta-provider-contract", "utf8")),
      inputSchema: schemaEvidence(files, "schemas/request.json"),
      output: { kind: "unit" },
      errorSchema: schemaEvidence(files, "schemas/error.json"),
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: ["provider.beta"]
    }
  ]
  return options.reverseProviders ? providers.reverse() : providers
}

function bobEvidence(options = {}) {
  const requiredCapabilities = ["source.log", "task.sendMessage", "task.toSerializable"]
  const taskCapabilities = ["task.sendMessage", "task.toSerializable"]
  return {
    profile: "bob/2.0.1",
    requiredCapabilities: options.reverseCapabilities ? requiredCapabilities.reverse() : requiredCapabilities,
    taskCapabilities: options.reverseCapabilities ? taskCapabilities.reverse() : taskCapabilities
  }
}

function generationInput(options = {}) {
  const files = options.files ?? sourceFiles()
  return {
    rawPackage: options.rawPackage ?? rawPackageFromFiles(files),
    providers: options.providers ?? providerEvidence(files, options),
    bob: options.bob ?? bobEvidence(options)
  }
}

function withEncodedLock(subject, options = {}) {
  const placeholderFiles = sourceFiles()
  const input = generationInput({ ...options, files: placeholderFiles })
  const lock = subject.generateWorkflowPackageLock(input)
  const lockBytes = subject.encodeWorkflowPackageLock(lock)
  const files = sourceFiles(lockBytes)
  return {
    input: generationInput({
      ...options,
      files,
      rawPackage: rawPackageFromFiles(files),
      providers: providerEvidence(files, options),
      bob: bobEvidence(options)
    }),
    lock,
    lockBytes
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function replaceLockBytes(input, lockBytes) {
  const files = {}
  for (const file of input.rawPackage.files) files[file.path] = Buffer.from(file.bytes)
  files["workflow.lock.json"] = Buffer.from(lockBytes)
  return { ...input, rawPackage: rawPackageFromFiles(files) }
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  if (!Object.isFrozen(value)) throw new Error("expected deeply frozen evidence")
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen)
}

function subject() {
  return require("../out/core/contractV2/workflowLock.js")
}

module.exports = {
  assertDeepFrozen,
  bobEvidence,
  canonicalText,
  cloneJson,
  digestBytes,
  generationInput,
  packageDigest,
  providerEvidence,
  rawPackageFromFiles,
  replaceLockBytes,
  sourceFiles,
  subject,
  withEncodedLock
}
