const assert = require("node:assert/strict")
const { test } = require("node:test")

function preview() {
  return {
    ok: true,
    previewDigest: "sha256:preview",
    issues: [{ severity: "warning", artifactId: "draft", stepId: "draft", message: "Task snapshot is truncated." }],
    candidates: [
      {
        artifactId: "draft",
        stateKey: "draft",
        stepId: "draft",
        stepTitle: "Draft",
        snapshotCreatedAt: "2026-07-12T00:00:02.000Z",
        snapshotReason: "agent-output",
        extractionSource: "lastAssistantText",
        text: "new draft",
        path: ".bob/workflows/runs/run-1/artifacts/draft/draft.md",
        schema: "text/markdown",
        bytes: 9,
        sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        truncated: true,
        omittedMessageCount: 2,
        redactionPossible: false,
        existing: {
          exists: true,
          changed: true,
          bytes: 9,
          sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        diff: "--- existing\n+++ snapshot\n-old draft\n+new draft\n",
        defaultSelected: false,
        issues: []
      },
      {
        artifactId: "summary",
        stateKey: "summary",
        stepId: "summary",
        stepTitle: "Summary",
        snapshotCreatedAt: "2026-07-12T00:00:03.000Z",
        snapshotReason: "completed",
        extractionSource: "taskExport",
        text: "summary",
        path: ".bob/workflows/runs/run-1/artifacts/summary/summary.md",
        schema: "text/markdown",
        bytes: 7,
        sha256: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        truncated: false,
        redactionPossible: false,
        existing: { exists: false, changed: false },
        diff: "",
        defaultSelected: true,
        issues: []
      }
    ]
  }
}

const run = { runId: "run-1", workflowId: "workflow-register.import", status: "completed" }
const workflow = { id: "workflow-register.import", label: "Import Workflow" }

test("report includes source, target, checksum, truncation and existing-file diff", () => {
  const { formatTaskSnapshotImportPreviewReport } = require("../out/taskSnapshotImportReport")
  const lines = formatTaskSnapshotImportPreviewReport({ preview: preview(), run, workflow })
  const report = lines.join("\n")

  assert.match(report, /run-1/)
  assert.match(report, /Import Workflow/)
  assert.match(report, /Draft.*draft/s)
  assert.match(report, /lastAssistantText/)
  assert.match(report, /2026-07-12T00:00:02.000Z/)
  assert.match(report, /9バイト/)
  assert.match(report, /sha256:aaaaaaaa/)
  assert.match(report, /省略あり.*はい/)
  assert.match(report, /省略したメッセージ数.*2/)
  assert.match(report, /```diff[\s\S]*-old draft[\s\S]*\+new draft/)
  assert.doesNotMatch(report, /new draft\s*$/)
})

test("report chooses a code fence longer than any backtick run in snapshot diff", () => {
  const { formatTaskSnapshotImportPreviewReport } = require("../out/taskSnapshotImportReport")
  const value = preview()
  value.candidates[0].diff = "--- existing\n+++ snapshot\n-plain\n+```ts\n+const secret = true\n+```\n"
  const report = formatTaskSnapshotImportPreviewReport({ preview: value, run, workflow }).join("\n")
  const opening = report.match(/\n(`{4,})diff\n/)
  assert.ok(opening, report)
  assert.match(report, new RegExp(`\\n${opening[1]}\\n`))
  assert.match(report, /\+```ts/)
})

test("selection items preserve default selection and overwrite requirements", () => {
  const { taskSnapshotImportSelectionItems } = require("../out/taskSnapshotImportReport")
  const items = taskSnapshotImportSelectionItems(preview())

  assert.deepEqual(items.map((item) => ({ artifactId: item.artifactId, picked: item.picked, requiresOverwrite: item.requiresOverwrite })), [
    { artifactId: "draft", picked: false, requiresOverwrite: true },
    { artifactId: "summary", picked: true, requiresOverwrite: false }
  ])
})

test("selection flow always shows preview before pick and confirms changed existing files", async () => {
  const { chooseTaskSnapshotImportSelection } = require("../out/taskSnapshotImportReport")
  const calls = []
  const result = await chooseTaskSnapshotImportSelection({
    preview: preview(),
    run,
    workflow,
    prompts: {
      showPreview: async (lines) => { calls.push(["preview", lines.length]) },
      pickArtifacts: async (items) => {
        calls.push(["pick", items.map((item) => item.artifactId)])
        return ["draft", "summary"]
      },
      confirmOverwrite: async (count) => {
        calls.push(["confirm", count])
        return true
      }
    }
  })

  assert.deepEqual(calls.map((call) => call[0]), ["preview", "pick", "confirm"])
  assert.deepEqual(result, { selectedArtifactIds: ["draft", "summary"], overwriteExisting: true })
})

test("selection flow cancels when overwrite confirmation is declined", async () => {
  const { chooseTaskSnapshotImportSelection } = require("../out/taskSnapshotImportReport")
  const result = await chooseTaskSnapshotImportSelection({
    preview: preview(),
    run,
    workflow,
    prompts: {
      showPreview: async () => undefined,
      pickArtifacts: async () => ["draft"],
      confirmOverwrite: async () => false
    }
  })
  assert.equal(result, undefined)
})
