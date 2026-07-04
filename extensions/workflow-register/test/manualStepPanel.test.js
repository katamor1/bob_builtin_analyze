const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  buildManualStepActionViewModel,
  renderManualStepHtml
} = require("../out/webview/manualStepPanel")

function workflow() {
  return {
    id: "manual-action-sample",
    name: "manual-action-sample",
    label: "Manual Action Sample",
    description: "Manual workflow.",
    schemaVersion: "workflow-register/v1",
    workflowFile: ".bob/workflows/manual-action-sample/WORKFLOW.md",
    inputs: {},
    state: {},
    engineSteps: []
  }
}

function run() {
  return {
    runId: "run-1",
    workflowId: "manual-action-sample",
    workflowName: "Manual Action Sample",
    status: "held",
    currentStep: "check-file",
    inputs: { reportName: "report-a" },
    state: { reportPath: ".bob/artifacts/report-a.md" },
    steps: [{ id: "check-file", title: "Check file", type: "manual", status: "held" }],
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z"
  }
}

function step() {
  return {
    id: "check-file",
    title: "Check file",
    type: "manual",
    prompt: "Fallback prompt.",
    userAction: {
      message: "Open {{state.reportPath}} for {{inputs.reportName}} in {{workflow.id}} / {{step.id}}.",
      completeLabel: "確認完了",
      confirmOnComplete: true,
      confirmMessage: "Complete {{step.id}} for {{run.id}}?"
    }
  }
}

test("manual step view model renders userAction templates and active metadata", () => {
  const viewModel = buildManualStepActionViewModel({
    workflow: workflow(),
    run: run(),
    step: step(),
    active: { key: "active-1" }
  })

  assert.equal(viewModel.status, "active")
  assert.equal(viewModel.activeKey, "active-1")
  assert.equal(viewModel.message, "Open .bob/artifacts/report-a.md for report-a in manual-action-sample / check-file.")
  assert.equal(viewModel.completeLabel, "確認完了")
  assert.equal(viewModel.confirmOnComplete, true)
  assert.equal(viewModel.confirmMessage, "Complete check-file for run-1?")
  assert.deepEqual(viewModel.stateKeys, ["reportPath"])
})

test("manual step view model falls back to prompt and default button label", () => {
  const manualStep = { ...step(), userAction: undefined }
  const viewModel = buildManualStepActionViewModel({
    workflow: workflow(),
    run: run(),
    step: manualStep,
    active: { key: "active-1" }
  })

  assert.equal(viewModel.message, "Fallback prompt.")
  assert.equal(viewModel.completeLabel, "完了")
  assert.equal(viewModel.confirmOnComplete, false)
})

test("manual step html escapes workflow content and posts active key completion", () => {
  const viewModel = {
    activeKey: "active-1",
    runId: "run-1",
    workflowId: "manual-action-sample",
    workflowLabel: "Manual <Action>",
    stepId: "check-file",
    stepTitle: "Check <file>",
    status: "active",
    message: "Read <script>alert(1)</script>\n- item",
    completeLabel: "Done <now>",
    confirmOnComplete: false,
    workflowFile: ".bob/workflows/manual-action-sample/WORKFLOW.md",
    stateKeys: ["reportPath"]
  }

  const html = renderManualStepHtml({ cspSource: "vscode-resource:", nonce: "nonce-123", viewModel })

  assert.match(html, /Manual &lt;Action&gt;/)
  assert.match(html, /Read &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /Done &lt;now&gt;/)
  assert.match(html, /type: 'completeManualStep'/)
  assert.match(html, /activeKey: viewModel\.activeKey/)
  assert.doesNotMatch(html, /refreshButton/)
})

test("manual step html is read-only when active task handle is missing", () => {
  const viewModel = buildManualStepActionViewModel({
    workflow: workflow(),
    run: run(),
    step: step(),
    active: undefined
  })
  const html = renderManualStepHtml({ cspSource: "vscode-resource:", nonce: "nonce-123", viewModel })

  assert.equal(viewModel.status, "heldWithoutActiveTask")
  assert.match(html, /現在の Bob task への接続がありません/)
  assert.doesNotMatch(html, /completeManualStep/)
})

test("manual step html shows a completed footer after panel completion", () => {
  const viewModel = {
    activeKey: undefined,
    runId: "run-1",
    workflowId: "manual-action-sample",
    workflowLabel: "Manual Action Sample",
    stepId: "check-file",
    stepTitle: "Check file",
    status: "completed",
    message: "この step は完了しました。",
    completeLabel: "確認完了",
    confirmOnComplete: false,
    workflowFile: ".bob/workflows/manual-action-sample/WORKFLOW.md",
    stateKeys: []
  }

  const html = renderManualStepHtml({ cspSource: "vscode-resource:", nonce: "nonce-123", viewModel })

  assert.match(html, /この step は完了しました/)
  assert.match(html, /Run Control View/)
  assert.doesNotMatch(html, /現在の Bob task への接続がありません/)
  assert.doesNotMatch(html, /completeManualStep/)
})
