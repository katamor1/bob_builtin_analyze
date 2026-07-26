const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  invocationSubject,
  providerRuntime
} = require("./workflowContractV2ProviderInvocationTestSupport")

function digest(character) {
  return `sha256:${character.repeat(64)}`
}

function signal() {
  return new AbortController().signal
}

async function root(t) {
  const value = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-contract-v2-artifact-review-"))
  t.after(() => fsp.rm(value, { recursive: true, force: true }))
  return value
}

async function commitOne(t, options) {
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    artifactMaxBytes: 4096,
    artifactMediaType: options.mediaType,
    artifactSchemaBody: options.schemaBody,
    artifactPath: options.artifactPath,
    dispatch: async (input) => {
      await input.effect.artifacts.writeArtifact({ id: "report", bytes: options.bytes })
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const runRoot = await root(t)
  const transactionModule = require("../out/core/contractV2/artifactTransaction.js")
  const transaction = await transactionModule.openWorkflowArtifactTransaction({
    lease: runtime.lease,
    runRoot,
    attemptId: options.attemptId,
    stepId: "invoke",
    inputDigest: digest("1")
  })
  const invocation = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt: transactionModule.workflowArtifactTransactionAttempt(transaction)
  })
  assert.equal(invocation.ok, true)
  const committed = await transactionModule.commitWorkflowArtifactTransaction(transaction, async () => {})
  return { committed, runRoot, transactionModule }
}

test("text artifacts decode as strict UTF-8 strings for their compiled schema", async (t) => {
  const result = await commitOne(t, {
    attemptId: "attempt-text",
    mediaType: "text/plain",
    schemaBody: { type: "string", const: "hello" },
    artifactPath: "artifacts/report.txt",
    bytes: Buffer.from("hello", "utf8")
  })
  assert.equal(result.committed.artifactSet.entries[0].mediaType, "text/plain")
})

test("binary artifacts validate the canonical base64 string representation", async (t) => {
  const result = await commitOne(t, {
    attemptId: "attempt-binary",
    mediaType: "application/octet-stream",
    schemaBody: { type: "string", const: "AAEC" },
    artifactPath: "artifacts/report.bin",
    bytes: Uint8Array.from([0, 1, 2])
  })
  assert.equal(result.committed.artifactSet.entries[0].mediaType, "application/octet-stream")
})

test("inspection rejects noncanonical artifact-set bytes even when JSON meaning is unchanged", async (t) => {
  const result = await commitOne(t, {
    attemptId: "attempt-manifest-drift",
    mediaType: "application/json",
    schemaBody: { type: "object" },
    artifactPath: "artifacts/report.json",
    bytes: Buffer.from('{"ok":true}', "utf8")
  })
  const manifestPath = path.join(result.runRoot, "attempts", "committed", "attempt-manifest-drift", "artifact-set.json")
  const parsed = JSON.parse(await fsp.readFile(manifestPath, "utf8"))
  await fsp.writeFile(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
  await assert.rejects(
    () => result.transactionModule.inspectCommittedWorkflowArtifactTransaction({
      runRoot: result.runRoot,
      attemptId: "attempt-manifest-drift",
      expectedArtifactSetDigest: result.committed.artifactSetDigest
    }),
    /canonical|manifest bytes|digest/i
  )
})

test("inspection rejects an extra file or directory in a committed attempt", async (t) => {
  const result = await commitOne(t, {
    attemptId: "attempt-extra",
    mediaType: "application/json",
    schemaBody: { type: "object" },
    artifactPath: "artifacts/report.json",
    bytes: Buffer.from('{"ok":true}', "utf8")
  })
  await fsp.writeFile(path.join(result.runRoot, "attempts", "committed", "attempt-extra", "unexpected.bin"), "unexpected", "utf8")
  await assert.rejects(
    () => result.transactionModule.inspectCommittedWorkflowArtifactTransaction({
      runRoot: result.runRoot,
      attemptId: "attempt-extra",
      expectedArtifactSetDigest: result.committed.artifactSetDigest
    }),
    /complete|extra|directory|artifact set/i
  )
})

test("artifact bytes are reverified after the manifest write and immediately before promotion", async (t) => {
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    artifactMaxBytes: 4096,
    artifactMediaType: "application/json",
    artifactSchemaBody: { type: "object" },
    artifactPath: "artifacts/report.json",
    dispatch: async (input) => {
      await input.effect.artifacts.writeArtifact({ id: "report", bytes: Buffer.from('{"ok":true}', "utf8") })
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const runRoot = await root(t)
  const workspacePath = require.resolve("../out/core/contractV2/attemptArtifactWorkspace.js")
  const transactionPath = require.resolve("../out/core/contractV2/artifactTransaction.js")
  const workspace = require(workspacePath)
  const originalWriteSet = workspace.writeAttemptArtifactSetFile
  workspace.writeAttemptArtifactSetFile = async (...args) => {
    await originalWriteSet(...args)
    await fsp.writeFile(path.join(runRoot, "attempts", "staging", "attempt-reverify", "artifacts", "report.json"), '{"ok":false}', "utf8")
  }
  delete require.cache[transactionPath]
  try {
    const transactionModule = require(transactionPath)
    const transaction = await transactionModule.openWorkflowArtifactTransaction({
      lease: runtime.lease,
      runRoot,
      attemptId: "attempt-reverify",
      stepId: "invoke",
      inputDigest: digest("1")
    })
    await invocationSubject().invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt: transactionModule.workflowArtifactTransactionAttempt(transaction)
    })
    await assert.rejects(
      () => transactionModule.commitWorkflowArtifactTransaction(transaction, async () => {}),
      /changed|hash|verification/i
    )
    assert.equal(fs.existsSync(path.join(runRoot, "attempts", "committed", "attempt-reverify")), false)
  } finally {
    workspace.writeAttemptArtifactSetFile = originalWriteSet
    delete require.cache[transactionPath]
  }
})

test("source pins the actual opened file before bytes are written and syncs each created parent", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "contractV2", "attemptArtifactWorkspace.ts"), "utf8")
  const open = source.indexOf("const opened = await openArtifactFileAnchored")
  const verify = source.indexOf("await verifyOpenedArtifactFileContainment")
  const write = source.indexOf("await opened.file.writeFile(bytes)")
  assert.ok(open >= 0 && open < verify && verify < write)
  assert.match(source, /if \(created\) await syncDirectory\(parent\)/)
  assert.match(source, /\/proc\/self\/fd\/\$\{parent\.fd\}/)
})
