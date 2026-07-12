const assert = require("node:assert/strict")
const { test } = require("node:test")

function workflow() {
  return {
    id: "workflow-register.snapshot-safe-defaults",
    name: "snapshot-safe-defaults",
    label: "Snapshot Safe Defaults",
    description: "Safe implicit task snapshot import.",
    schemaVersion: "workflow-register/v1",
    definitionHash: "sha256:safe-defaults",
    filePath: ".bob/workflows/snapshot-safe-defaults/WORKFLOW.md",
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
    runId: "run-safe-defaults",
    workflowId: "workflow-register.snapshot-safe-defaults",
    workflowName: "Snapshot Safe Defaults",
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

function snapshots() {
  return [
    {
      schemaVersion: "workflow-register/task-snapshot/v1",
      createdAt: "2026-07-12T00:00:02.000Z",
      reason: "agent-output",
      runId: "run-safe-defaults",
      workflowId: "workflow-register.snapshot-safe-defaults",
      workflowDefinitionHash: "sha256:safe-defaults",
      stepId: "draft",
      lastAssistantText: "partial draft",
      truncated: true,
      omittedMessageCount: 2
    },
    {
      schemaVersion: "workflow-register/task-snapshot/v1",
      createdAt: "2026-07-12T00:00:03.000Z",
      reason: "agent-output",
      runId: "run-safe-defaults",
      workflowId: "workflow-register.snapshot-safe-defaults",
      workflowDefinitionHash: "sha256:safe-defaults",
      stepId: "summary",
      lastAssistantText: "token=[REDACTED]"
    }
  ]
}

function snapshotStore() {
  const items = snapshots()
  return {
    findLatestSnapshot: async (_runId, predicate) => {
      for (const item of [...items].reverse()) {
        if (predicate(item)) return structuredClone(item)
      }
      return undefined
    }
  }
}

test("implicit import writes only default-safe candidates", async () => {
  const { importArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImport")
  const targetRun = run()
  let writeCalls = 0

  const result = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: snapshotStore(),
    writeFiles: async () => { writeCalls += 1 }
  })

  assert.equal(result.ok, false)
  assert.equal(result.importedCount, 0)
  assert.equal(writeCalls, 0)
  assert.deepEqual(targetRun.state, {})
  assert.match(result.issues.map((issue) => issue.message).join("\n"), /safe for automatic import|select candidates explicitly/i)
})

test("an explicitly reviewed truncated candidate remains importable", async () => {
  const { importArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImport")
  const { previewArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImportPreview")
  const targetRun = run()
  const store = snapshotStore()
  const preview = await previewArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: store,
    readFile: async () => undefined
  })
  let writeCalls = 0

  const result = await importArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: targetRun,
    snapshotStore: store,
    readFile: async () => undefined,
    selectedArtifactIds: ["draft"],
    expectedPreviewDigest: preview.previewDigest,
    writeFiles: async (_writes, commitState) => {
      writeCalls += 1
      await commitState()
    }
  })

  assert.equal(result.ok, true, result.issues.map((issue) => issue.message).join("\n"))
  assert.equal(result.importedCount, 1)
  assert.equal(writeCalls, 1)
  assert.equal(targetRun.state.draft, "partial draft")
  assert.equal(targetRun.state.summary, undefined)
})
