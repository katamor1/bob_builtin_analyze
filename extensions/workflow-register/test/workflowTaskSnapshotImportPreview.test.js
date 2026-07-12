const assert = require("node:assert/strict")
const { test } = require("node:test")

function workflow() {
  return {
    id: "workflow-register.snapshot-preview",
    name: "snapshot-preview",
    label: "Snapshot Preview",
    description: "Preview task snapshot import.",
    schemaVersion: "workflow-register/v1",
    definitionHash: "sha256:definition-preview",
    filePath: ".bob/workflows/snapshot-preview/WORKFLOW.md",
    inputs: {},
    artifacts: [
      { id: "draft", producedBy: "draft", path: ".bob/workflows/runs/{{run.id}}/artifacts/draft/draft.md", schema: "text/markdown" },
      { id: "summary", producedBy: "summary", path: ".bob/workflows/runs/{{run.id}}/artifacts/summary/summary.md", schema: "text/markdown" }
    ],
    engineSteps: [
      { id: "draft", title: "Draft", type: "agent", prompt: "Draft", resultKey: "draft" },
      { id: "summary", title: "Summary", type: "agent", prompt: "Summarize", resultKey: "summary" }
    ]
  }
}

function run() {
  return {
    runId: "run-preview",
    workflowId: "workflow-register.snapshot-preview",
    workflowName: "Snapshot Preview",
    status: "completed",
    inputs: {},
    state: { sentinel: "unchanged" },
    steps: [
      { id: "draft", title: "Draft", type: "agent", status: "completed" },
      { id: "summary", title: "Summary", type: "agent", status: "completed" }
    ],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:01.000Z"
  }
}

function snapshot(stepId, values = {}) {
  return {
    schemaVersion: "workflow-register/task-snapshot/v1",
    createdAt: values.createdAt || `2026-07-12T00:00:0${stepId === "draft" ? 2 : 3}.000Z`,
    reason: values.reason || "agent-output",
    runId: "run-preview",
    workflowId: "workflow-register.snapshot-preview",
    workflowDefinitionHash: "sha256:definition-preview",
    stepId,
    lastAssistantText: values.lastAssistantText,
    taskExport: values.taskExport,
    truncated: values.truncated,
    omittedMessageCount: values.omittedMessageCount
  }
}

function snapshotStore(items) {
  return {
    findLatestSnapshot: async (_runId, predicate) => {
      for (const item of [...items].reverse()) {
        if (predicate(item)) return structuredClone(item)
      }
      return undefined
    }
  }
}

test("preview is deterministic, classifies sources, and has no side effects", async () => {
  const { previewArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImportPreview")
  const targetRun = run()
  const originalRun = structuredClone(targetRun)
  const store = snapshotStore([
    snapshot("draft", { lastAssistantText: "Recovered draft" }),
    snapshot("summary", { taskExport: { resultText: "Recovered summary" } })
  ])
  const reads = []
  const readFile = async (relativePath) => {
    reads.push(relativePath)
    return undefined
  }

  const first = await previewArtifactsFromTaskSnapshots({ workflow: workflow(), run: targetRun, snapshotStore: store, readFile })
  const second = await previewArtifactsFromTaskSnapshots({ workflow: workflow(), run: targetRun, snapshotStore: store, readFile })

  assert.deepEqual(targetRun, originalRun)
  assert.equal(first.ok, true, first.issues.map((issue) => issue.message).join("\n"))
  assert.equal(first.previewDigest, second.previewDigest)
  assert.deepEqual(first.candidates.map((candidate) => ({
    artifactId: candidate.artifactId,
    source: candidate.extractionSource,
    selected: candidate.defaultSelected,
    bytes: candidate.bytes,
    path: candidate.path,
    existing: candidate.existing.exists
  })), [
    {
      artifactId: "draft",
      source: "lastAssistantText",
      selected: true,
      bytes: Buffer.byteLength("Recovered draft", "utf8"),
      path: ".bob/workflows/runs/run-preview/artifacts/draft/draft.md",
      existing: false
    },
    {
      artifactId: "summary",
      source: "taskExport",
      selected: true,
      bytes: Buffer.byteLength("Recovered summary", "utf8"),
      path: ".bob/workflows/runs/run-preview/artifacts/summary/summary.md",
      existing: false
    }
  ])
  assert.ok(first.candidates.every((candidate) => /^sha256:[a-f0-9]{64}$/.test(candidate.sha256)))
  assert.deepEqual(reads, [
    ".bob/workflows/runs/run-preview/artifacts/draft/draft.md",
    ".bob/workflows/runs/run-preview/artifacts/summary/summary.md",
    ".bob/workflows/runs/run-preview/artifacts/draft/draft.md",
    ".bob/workflows/runs/run-preview/artifacts/summary/summary.md"
  ])
})

test("truncated and redacted snapshots are surfaced and default to unselected", async () => {
  const { previewArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImportPreview")
  const store = snapshotStore([
    snapshot("draft", { lastAssistantText: "partial\n... [truncated to 1024 bytes]", truncated: true, omittedMessageCount: 4 }),
    snapshot("summary", { lastAssistantText: "token=[REDACTED]" })
  ])

  const preview = await previewArtifactsFromTaskSnapshots({ workflow: workflow(), run: run(), snapshotStore: store, readFile: async () => undefined })

  const draft = preview.candidates.find((candidate) => candidate.artifactId === "draft")
  const summary = preview.candidates.find((candidate) => candidate.artifactId === "summary")
  assert.equal(draft.truncated, true)
  assert.equal(draft.defaultSelected, false)
  assert.equal(draft.omittedMessageCount, 4)
  assert.equal(summary.redactionPossible, true)
  assert.equal(summary.defaultSelected, false)
})

test("existing changed files include a bounded diff and default to unselected", async () => {
  const { previewArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImportPreview")
  const existingText = "Old draft\nsecond line\n"
  const store = snapshotStore([
    snapshot("draft", { lastAssistantText: "New draft\nsecond line\n" }),
    snapshot("summary", { lastAssistantText: "Summary" })
  ])

  const preview = await previewArtifactsFromTaskSnapshots({
    workflow: workflow(),
    run: run(),
    snapshotStore: store,
    readFile: async (relativePath) => relativePath.endsWith("draft.md") ? existingText : undefined,
    maxDiffBytes: 256
  })

  const candidate = preview.candidates.find((item) => item.artifactId === "draft")
  assert.equal(candidate.existing.exists, true)
  assert.equal(candidate.existing.changed, true)
  assert.equal(candidate.defaultSelected, false)
  assert.match(candidate.existing.sha256, /^sha256:[a-f0-9]{64}$/)
  assert.match(candidate.diff, /-Old draft/)
  assert.match(candidate.diff, /\+New draft/)
  assert.ok(Buffer.byteLength(candidate.diff, "utf8") <= 256)
})

test("preview records blockers without producing candidates for unsafe paths", async () => {
  const { previewArtifactsFromTaskSnapshots } = require("../out/core/artifacts/taskSnapshotImportPreview")
  const targetWorkflow = workflow()
  targetWorkflow.artifacts[0].path = "../outside.md"
  const preview = await previewArtifactsFromTaskSnapshots({
    workflow: targetWorkflow,
    run: run(),
    snapshotStore: snapshotStore([snapshot("draft", { lastAssistantText: "Draft" }), snapshot("summary", { lastAssistantText: "Summary" })]),
    readFile: async () => undefined
  })

  assert.equal(preview.ok, false)
  assert.ok(preview.issues.some((issue) => issue.severity === "error" && issue.artifactId === "draft" && /workspace-relative safe path/.test(issue.message)))
  assert.equal(preview.candidates.some((candidate) => candidate.artifactId === "draft"), false)
})
