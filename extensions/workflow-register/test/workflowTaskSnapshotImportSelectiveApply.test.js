const assert = require("node:assert/strict")
const { test } = require("node:test")

function workflow() {
  return {
    id: "workflow-register.snapshot-selective",
    name: "snapshot-selective",
    label: "Snapshot Selective",
    description: "Selective task snapshot import.",
    schemaVersion: "workflow-register/v1",
    definitionHash: "sha256:definition-selective",
    filePath: ".bob/workflows/snapshot-selective/WORKFLOW.md",
    inputs: {},
    artifacts: [
      { id: "draft", producedBy: "draft", path: ".bob/workflows/runs/{{run.id}}/artifacts/draft/draft.md", schema: "text/markdown" },
      { id: "summary", producedBy: "summary", path: ".bob/workflows/runs/{{run.id}}/artifacts/summary/summary.md", schema: "text/markdown" }
    ],
    engineSteps: [
      { id: "draft", title: "Draft", type: "agent", prompt: "Draft", resultKey: "draft" },
      { id: "summary", title: "Summary", type: "agent", prompt: "Summary", resultKey: "summary" }
    ]
  }
}

function run() {
  return {
    runId: "run-selective",
    workflowId: "workflow-register.snapshot-selective",
    workflowName: "Snapshot Selective",
    status: "completed",
    inputs: {},
    state: {},
    steps: [
      { id: "draft", title: "Draft", type: "agent", status: "completed" },
      { id: "summary", title: "Summary", type: "agent", status: "completed" }
    ],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:01.000Z"
  }
}

function snapshot(stepId, text) {
  return {
    schemaVersion: "workflow-register/task-snapshot/v1",
    createdAt: stepId === "draft" ? "2026-07-12T00:00:02.000Z" : "2026-07-12T00:00:03.000Z",
    reason: "agent-output",
    runId: "run-selective",
    workflowId: "workflow-register.snapshot-selective",
    workflowDefinitionHash: "sha256:definition-selective",
    stepId,
    lastAssistantText: text
  }
}

function snapshotStore() {
  const items = [snapshot("draft", "Draft text"), snapshot("summary", "Summary text")]
  return {
    findLatestSnapshot: async (_runId, predicate) => {
      for (const item of [...items].reverse()) if (predicate(item)) return structuredClone(item)
      return undefined
    }
  }
}

async function preview(targetRun, readFile = async () => undefined) {
  const { previewArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImportPreview")
  return previewArtifactsFromTaskSnapshots({ workflow: workflow(), run: targetRun, snapshotStore: snapshotStore(), readFile })
}

test("selective apply writes only selected artifacts and one manifest transaction", async () => {
  const { importArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImport")
  const targetRun = run()
  const planned = await preview(targetRun)
  const writes = []
  let commits = 0

  const result = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: snapshotStore(),
    readFile: async () => undefined,
    selectedArtifactIds: ["draft"],
    expectedPreviewDigest: planned.previewDigest,
    writeFiles: async (batch, commitState) => {
      writes.push(...batch)
      await commitState()
      commits += 1
    },
    now: () => "2026-07-12T00:00:04.000Z"
  })

  assert.equal(result.ok, true, result.issues.map((issue) => issue.message).join("\n"))
  assert.equal(result.importedCount, 1)
  assert.equal(commits, 1)
  assert.equal(targetRun.state.draft, "Draft text")
  assert.equal(targetRun.state.summary, undefined)
  assert.ok(writes.some((write) => write.relativePath.endsWith("/draft/draft.md")))
  assert.equal(writes.some((write) => write.relativePath.endsWith("/summary/summary.md")), false)
  const manifestWrite = writes.find((write) => write.relativePath.endsWith("/artifacts/manifest.json"))
  const manifest = JSON.parse(manifestWrite.text)
  assert.deepEqual(manifest.artifacts.map((entry) => entry.id), ["draft"])
})

test("an explicit empty selection has no writes and no run-state mutation", async () => {
  const { importArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImport")
  const targetRun = run()
  const original = structuredClone(targetRun)
  const planned = await preview(targetRun)
  let writeCalls = 0

  const result = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: snapshotStore(),
    readFile: async () => undefined,
    selectedArtifactIds: [],
    expectedPreviewDigest: planned.previewDigest,
    writeFiles: async () => { writeCalls += 1 }
  })

  assert.equal(result.ok, false)
  assert.equal(result.importedCount, 0)
  assert.equal(writeCalls, 0)
  assert.deepEqual(targetRun, original)
  assert.match(result.issues.map((issue) => issue.message).join("\n"), /No task snapshot artifacts were selected/i)
})

test("changed existing files require explicit overwrite confirmation", async () => {
  const { importArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImport")
  const targetRun = run()
  const readFile = async (relativePath) => relativePath.endsWith("draft.md") ? "Old draft" : undefined
  const planned = await preview(targetRun, readFile)
  let writeCalls = 0

  const blocked = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: snapshotStore(),
    readFile,
    selectedArtifactIds: ["draft"],
    expectedPreviewDigest: planned.previewDigest,
    writeFiles: async () => { writeCalls += 1 }
  })
  assert.equal(blocked.ok, false)
  assert.equal(writeCalls, 0)
  assert.match(blocked.issues.map((issue) => issue.message).join("\n"), /explicit overwrite confirmation/i)

  const applied = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: snapshotStore(),
    readFile,
    selectedArtifactIds: ["draft"],
    expectedPreviewDigest: planned.previewDigest,
    overwriteExisting: true,
    writeFiles: async (_writes, commitState) => {
      writeCalls += 1
      await commitState()
    }
  })
  assert.equal(applied.ok, true, applied.issues.map((issue) => issue.message).join("\n"))
  assert.equal(writeCalls, 1)
})

test("apply refuses stale preview digests and existing-file changes before writing", async () => {
  const { importArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImport")
  const targetRun = run()
  const planned = await preview(targetRun, async () => "Old draft")
  let writeCalls = 0

  const result = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: snapshotStore(),
    readFile: async () => "Changed after preview",
    selectedArtifactIds: ["draft"],
    expectedPreviewDigest: planned.previewDigest,
    overwriteExisting: true,
    writeFiles: async () => { writeCalls += 1 }
  })

  assert.equal(result.ok, false)
  assert.equal(writeCalls, 0)
  assert.match(result.issues.map((issue) => issue.message).join("\n"), /preview.*changed|digest.*match/i)
})
