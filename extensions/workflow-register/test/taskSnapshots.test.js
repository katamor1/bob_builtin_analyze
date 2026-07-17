const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-snapshots-"))
}

function snapshot(overrides = {}) {
  return {
    schemaVersion: "workflow-register/task-snapshot/v1",
    createdAt: "2026-06-30T00:00:00.000Z",
    reason: "step-start",
    runId: "run-1",
    workflowId: "workflow-register.snapshot",
    logicalWorkflowId: "snapshot",
    workflowDefinitionHash: "hash-1",
    stepId: "collect",
    runStatus: "running",
    runCurrentStep: "collect",
    taskMetadata: { inputs: { revision: "77" } },
    messages: [
      { role: "user", content: "start" },
      { role: "assistant", content: "analysis" }
    ],
    lastAssistantText: "analysis",
    handoff: undefined,
    ...overrides
  }
}

test("file task snapshot store writes snapshots, latest.json, and summaries", async () => {
  const { FileTaskSnapshotStore } = require("../out/core/taskSnapshots")

  const workspaceRoot = tempDir()
  const store = new FileTaskSnapshotStore({ workspaceRoot, now: () => "2026-06-30T00:00:00.000Z" })
  const saved = await store.saveSnapshot(snapshot({ reason: "workflow-start" }))
  const latest = await store.loadLatest("run-1")
  const summaries = await store.listSnapshots("run-1")

  assert.match(saved.path, /task-snapshots/)
  assert.equal(latest.reason, "workflow-start")
  assert.equal(latest.messages, undefined)
  assert.equal(latest.lastAssistantText, "analysis")
  assert.equal(summaries.length, 1)
  assert.equal(summaries[0].reason, "workflow-start")
  assert.equal(summaries[0].hasLastAssistantText, true)
  assert.ok(fs.existsSync(path.join(workspaceRoot, ".bob", "workflows", "runs", "run-1", "task-snapshots", "latest.json")))
  assert.match(fs.readFileSync(path.join(workspaceRoot, ".gitignore"), "utf8"), /^\.bob\/workflows\/runs\/$/m)
})

test("file task snapshot store truncates oversized messages and prunes old snapshots", async () => {
  const { FileTaskSnapshotStore } = require("../out/core/taskSnapshots")

  const workspaceRoot = tempDir()
  let tick = 0
  const store = new FileTaskSnapshotStore({
    workspaceRoot,
    now: () => `2026-06-30T00:00:0${tick++}.000Z`,
    maxBytes: 700,
    maxPerRun: 2,
    includeMessages: true,
    pruneOnSave: true
  })

  await store.saveSnapshot(snapshot({ reason: "workflow-start", messages: [{ role: "assistant", content: "x".repeat(1200) }], lastAssistantText: "x".repeat(1200) }))
  await store.saveSnapshot(snapshot({ reason: "step-start", stepId: "collect" }))
  await store.saveSnapshot(snapshot({ reason: "agent-output", stepId: "analyze", lastAssistantText: "fresh output" }))
  const summaries = await store.listSnapshots("run-1")
  const latest = await store.loadLatest("run-1")

  assert.equal(summaries.length, 2)
  assert.equal(summaries.map((item) => item.reason).join(","), "step-start,agent-output")
  assert.equal(latest.reason, "agent-output")
  assert.equal(latest.lastAssistantText, "fresh output")
})

test("file task snapshot store hard-caps the final formatted JSON", async () => {
  const {
    DEFAULT_TASK_SNAPSHOT_BYTES,
    DEFAULT_TASK_SNAPSHOTS_PER_RUN,
    FileTaskSnapshotStore,
    MAX_TASK_SNAPSHOT_BYTES,
    MAX_TASK_SNAPSHOTS_PER_RUN,
    MIN_TASK_SNAPSHOT_BYTES,
    MIN_TASK_SNAPSHOTS_PER_RUN,
    normalizeTaskSnapshotLimits
  } = require("../out/core/taskSnapshots")

  assert.equal(MAX_TASK_SNAPSHOT_BYTES, 1024 * 1024)
  assert.equal(MAX_TASK_SNAPSHOTS_PER_RUN, 500)
  assert.deepEqual(
    normalizeTaskSnapshotLimits({
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxPerRun: Number.MAX_SAFE_INTEGER
    }),
    {
      maxBytes: MAX_TASK_SNAPSHOT_BYTES,
      maxPerRun: MAX_TASK_SNAPSHOTS_PER_RUN
    }
  )
  assert.deepEqual(
    normalizeTaskSnapshotLimits({ maxBytes: Number.NaN, maxPerRun: -1 }),
    {
      maxBytes: DEFAULT_TASK_SNAPSHOT_BYTES,
      maxPerRun: DEFAULT_TASK_SNAPSHOTS_PER_RUN
    }
  )
  assert.deepEqual(
    normalizeTaskSnapshotLimits({ maxBytes: 1, maxPerRun: 0.5 }),
    {
      maxBytes: MIN_TASK_SNAPSHOT_BYTES,
      maxPerRun: MIN_TASK_SNAPSHOTS_PER_RUN
    }
  )
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
  const properties = packageJson.contributes.configuration.properties
  assert.equal(properties["workflowRegister.taskSnapshots.maxBytes"].maximum, MAX_TASK_SNAPSHOT_BYTES)
  assert.equal(properties["workflowRegister.taskSnapshots.maxPerRun"].maximum, MAX_TASK_SNAPSHOTS_PER_RUN)
  const workspaceRoot = tempDir()
  const maxBytes = 1024
  const store = new FileTaskSnapshotStore({
    workspaceRoot,
    now: () => "2026-06-30T00:00:00.000Z",
    maxBytes,
    includeMessages: true
  })
  const saved = await store.saveSnapshot(snapshot({
    taskMetadata: { payload: "m".repeat(4096) },
    messages: [{ role: "assistant", content: "c".repeat(4096) }],
    taskExport: { payload: "e".repeat(4096) },
    lastAssistantText: "a".repeat(4096),
    handoff: { resultCommand: "capture", error: "h".repeat(4096) }
  }))
  const latestPath = path.join(
    workspaceRoot,
    ".bob",
    "workflows",
    "runs",
    "run-1",
    "task-snapshots",
    "latest.json"
  )
  const savedBytes = fs.readFileSync(saved.path)
  const latestBytes = fs.readFileSync(latestPath)
  const latest = JSON.parse(latestBytes.toString("utf8"))

  assert.ok(savedBytes.length <= maxBytes, `saved snapshot used ${savedBytes.length} bytes`)
  assert.ok(latestBytes.length <= maxBytes, `latest snapshot used ${latestBytes.length} bytes`)
  assert.equal(latest.truncated, true)
  assert.equal(latest.runId, "run-1")
  assert.equal(latest.workflowId, "workflow-register.snapshot")
  assert.equal(latest.stepId, "collect")
})

test("file task snapshot store redacts secret-like values before saving snapshots", async () => {
  const { FileTaskSnapshotStore } = require("../out/core/taskSnapshots")

  const workspaceRoot = tempDir()
  const store = new FileTaskSnapshotStore({
    workspaceRoot,
    now: () => "2026-06-30T00:00:00.000Z",
    includeMessages: true
  })
  const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890"
  const token = "OPENAI_API_KEY=abcdef1234567890abcdef"
  const password = "password=hunter2"

  const saved = await store.saveSnapshot(snapshot({
    taskMetadata: { env: token },
    messages: [
      { role: "user", content: `token ${secret}` },
      { role: "assistant", content: password }
    ],
    taskExport: { request: { authorization: `Bearer ${secret}` } },
    lastAssistantText: `done with ${password}`,
    handoff: { error: `failed with ${token}` }
  }))
  const raw = fs.readFileSync(saved.path, "utf8")
  const latestRaw = fs.readFileSync(path.join(workspaceRoot, ".bob", "workflows", "runs", "run-1", "task-snapshots", "latest.json"), "utf8")
  const latest = JSON.parse(latestRaw)

  for (const text of [raw, latestRaw]) {
    assert.doesNotMatch(text, /sk-proj-[A-Za-z0-9_-]+/)
    assert.doesNotMatch(text, /OPENAI_API_KEY=abcdef/)
    assert.doesNotMatch(text, /password=hunter2/)
    assert.match(text, /\[REDACTED\]/)
  }
  assert.match(latest.messages[0].content, /\[REDACTED\]/)
  assert.match(latest.taskMetadata.env, /\[REDACTED\]/)
  assert.match(latest.taskExport.request.authorization, /\[REDACTED\]/)
  assert.match(latest.handoff.error, /\[REDACTED\]/)
})

test("file task snapshot store keeps workflow runs ignored idempotently", async () => {
  const { FileTaskSnapshotStore } = require("../out/core/taskSnapshots")

  const workspaceRoot = tempDir()
  fs.writeFileSync(path.join(workspaceRoot, ".gitignore"), "node_modules/\n.bob/workflows/runs/\n", "utf8")
  const store = new FileTaskSnapshotStore({ workspaceRoot, now: () => "2026-06-30T00:00:00.000Z" })

  await store.saveSnapshot(snapshot({ reason: "workflow-start" }))
  await store.saveSnapshot(snapshot({ reason: "step-start" }))
  const gitignore = fs.readFileSync(path.join(workspaceRoot, ".gitignore"), "utf8")

  assert.equal((gitignore.match(/^\.bob\/workflows\/runs\/$/gm) ?? []).length, 1)
})

test("file task snapshot store rejects an external task-snapshots directory alias", async (t) => {
  const { FileTaskSnapshotStore } = require("../out/core/taskSnapshots")
  const workspaceRoot = tempDir()
  const runDirectory = path.join(workspaceRoot, ".bob", "workflows", "runs", "run-1")
  const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-task-snapshot-outside-"))
  const latestBytes = `${JSON.stringify(snapshot({ reason: "agent-output", lastAssistantText: "outside latest" }))}\n`
  const historyName = "20260630T000000Z-agent-output.json"
  const historyBytes = `${JSON.stringify(snapshot({ reason: "agent-output", lastAssistantText: "outside history" }))}\n`
  fs.mkdirSync(runDirectory, { recursive: true })
  fs.writeFileSync(path.join(outsideDirectory, "latest.json"), latestBytes)
  fs.writeFileSync(path.join(outsideDirectory, historyName), historyBytes)
  try {
    fs.symlinkSync(
      outsideDirectory,
      path.join(runDirectory, "task-snapshots"),
      process.platform === "win32" ? "junction" : "dir"
    )
  } catch (error) {
    fs.rmSync(outsideDirectory, { recursive: true, force: true })
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`directory alias unavailable: ${error.code}`)
      return
    }
    throw error
  }
  t.after(() => fs.rmSync(outsideDirectory, { recursive: true, force: true }))
  const store = new FileTaskSnapshotStore({ workspaceRoot })

  await assert.rejects(store.loadLatest("run-1"), /workspace|outside|symlink|junction|alias|direct/i)
  await assert.rejects(store.findLatestSnapshot("run-1", () => true), /workspace|outside|symlink|junction|alias|direct/i)

  assert.equal(fs.readFileSync(path.join(outsideDirectory, "latest.json"), "utf8"), latestBytes)
  assert.equal(fs.readFileSync(path.join(outsideDirectory, historyName), "utf8"), historyBytes)
})

test("file task snapshot store does not read external snapshot file aliases", async (t) => {
  const { FileTaskSnapshotStore } = require("../out/core/taskSnapshots")
  const workspaceRoot = tempDir()
  const snapshotDirectory = path.join(workspaceRoot, ".bob", "workflows", "runs", "run-1", "task-snapshots")
  const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-task-snapshot-file-outside-"))
  const externalFile = path.join(outsideDirectory, "external.json")
  const externalBytes = `${JSON.stringify(snapshot({ reason: "agent-output", lastAssistantText: "outside file" }))}\n`
  const historyName = "20260630T000000Z-agent-output.json"
  fs.mkdirSync(snapshotDirectory, { recursive: true })
  fs.writeFileSync(externalFile, externalBytes)
  try {
    fs.symlinkSync(externalFile, path.join(snapshotDirectory, "latest.json"), "file")
    fs.symlinkSync(externalFile, path.join(snapshotDirectory, historyName), "file")
  } catch (error) {
    fs.rmSync(outsideDirectory, { recursive: true, force: true })
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`file alias unavailable: ${error.code}`)
      return
    }
    throw error
  }
  t.after(() => fs.rmSync(outsideDirectory, { recursive: true, force: true }))
  const store = new FileTaskSnapshotStore({ workspaceRoot })

  await assert.rejects(store.loadLatest("run-1"), /workspace|outside|symlink|alias|direct/i)
  assert.equal(await store.findLatestSnapshot("run-1", () => true), undefined)
  assert.equal(fs.readFileSync(externalFile, "utf8"), externalBytes)
})
