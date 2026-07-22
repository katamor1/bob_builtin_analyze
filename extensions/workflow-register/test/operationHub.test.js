const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  assertContributesCommand,
  readJson,
  readSrc
} = require("./helpers/sourceReader")

test("package contributes Operation Hub as the only retained panel surface", () => {
  const packageJson = readJson("package.json")
  const core = readSrc("extension.ts")

  assertContributesCommand(packageJson, "workflowRegister.openOperationHub")
  assertContributesCommand(packageJson, "workflowRegister.refreshOperationHub")
  assert.equal(packageJson.contributes.views?.explorer?.length ?? 0, 0)
  assert.equal(packageJson.activationEvents.includes("onView:workflowRegister.operationHub"), false)
  assert.equal(packageJson.activationEvents.includes("onView:workflowRegister.runs"), false)
  assert.doesNotMatch(core, /registerWebviewViewProvider/)
  assert.doesNotMatch(core, /workflowRegister\.openOperationHubPanel/)
  assert.match(core, /registerCommand\("workflowRegister\.openOperationHub"[\s\S]*operationHub\.open/)
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.refreshOperationHub"))
  assert.match(core, /registerCommand\("workflowRegister\.refreshOperationHub"/)
  const provider = readSrc("gui", "operationHubProvider.ts")
  assert.match(provider, /createWebviewPanel\(\s*"workflowRegisterOperationHub",\s*"Bob 操作ハブ"/)
})

test("Operation Hub removes duplicate Runs and status-bar wiring", () => {
  const packageJson = readJson("package.json")
  const core = readSrc("extension.ts")
  const wrapper = readSrc("extensionWithAuthoring.ts")
  const provider = readSrc("gui", "operationHubProvider.ts")
  const contributionSurface = JSON.stringify({
    activationEvents: packageJson.activationEvents,
    commands: packageJson.contributes.commands,
    views: packageJson.contributes.views,
    menus: packageJson.contributes.menus
  })
  for (const source of [contributionSurface, core, wrapper, provider]) {
    assert.doesNotMatch(source, /workflowRegister\.runs/)
    assert.doesNotMatch(source, /refreshRunsView/)
    assert.doesNotMatch(source, /createStatusBarItem/)
    assert.doesNotMatch(source, /WorkflowRunControlView/)
  }
  assert.match(provider, /async refreshFromCommand\(\): Promise<void>/)
  assert.match(provider, /async open\(input\?: unknown\): Promise<void> \{[\s\S]*this\.applyOpenInput\(input\)[\s\S]*const panel = this\.ensurePanel\(\)[\s\S]*panel\.reveal\(vscode\.ViewColumn\.One\)[\s\S]*await this\.refreshPanel\(\)/)
})

test("Operation Hub model builds home setup catalog and run monitor sections", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "sample-repo",
    workspaceRoots: ["C:\\work\\sample-repo"],
    extensionStatus: [
      { id: "IBM.bob-code", label: "IBM Bob", available: false, unavailableReason: "IBM Bob 拡張がインストールされていません。" },
      { id: "local.bob-bazaar-review", label: "Bob Bazaar Review", available: false, unavailableReason: "Bob Bazaar Review 拡張がインストールされていません。" },
      { id: "local.bob-code-consistency-review", label: "Bob Code Consistency", available: false, unavailableReason: "Bob Code Consistency 拡張がインストールされていません。" }
    ],
    setup: {
      bobRootPresent: false,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: false,
      traceabilityPresent: true
    },
    workflows: [
      {
        id: "hidden.workflow",
        label: "Hidden",
        description: "hidden",
        hidden: true,
        inputs: {},
        artifacts: [],
        category: "dev"
      },
      {
        id: "qa.review",
        label: "QA Review",
        description: "レビューする",
        hidden: false,
        inputs: { target: { type: "string", required: true } },
        artifacts: [{ id: "summary", path: ".bob/summary.md" }],
        category: "QA"
      }
    ],
    runs: [
      {
        root: "C:\\work\\sample-repo",
        run: {
          runId: "run-1",
          workflowId: "qa.review",
          workflowName: "QA Review",
          status: "reviewing",
          currentStep: "humanGate",
          inputs: {},
          state: { report: ".bob/report.md" },
          steps: [
            { id: "collect", title: "収集", type: "command", status: "completed" },
            { id: "humanGate", title: "人間確認", type: "manual", status: "reviewing" }
          ],
          createdAt: "2026-07-05T01:00:00.000Z",
          updatedAt: "2026-07-05T01:02:00.000Z"
        }
      }
    ]
  })

  assert.equal(model.home.workspaceName, "sample-repo")
  assert.equal(model.home.activeRunCount, 1)
  assert.ok(model.home.recommendedActions.some((action) => action.id === "openBazaarReview"))
  assert.ok(model.setupChecklist.some((item) => item.id === "bobRoot" && item.status === "warning"))
  assert.ok(model.setupChecklist.some((item) => item.id === "mcpConfig" && item.status === "warning"))
  assert.deepEqual(model.workflowCatalog.map((workflow) => workflow.id), ["qa.review"])
  assert.equal(model.workflowCatalog[0].requiredInputCount, 1)
  assert.equal(model.runMonitor[0].statusLabel, "人による確認待ち")
  assert.ok(model.runMonitor[0].primaryActions.some((action) => (
    action.id === "acceptAndRunNextStep" &&
    action.commandId === "workflowRegister.acceptAndRunNextStep"
  )))
  const bazaar = model.home.recommendedActions.find((action) => action.id === "openBazaarReview")
  const consistency = model.home.recommendedActions.find((action) => action.id === "openConsistencyWizard")
  const builder = model.home.recommendedActions.find((action) => action.id === "openWorkflowBuilder")
  assert.equal(bazaar?.disabled, true)
  assert.equal(bazaar?.unavailableReason, "Bob Bazaar Review 拡張がインストールされていません。")
  assert.equal(consistency?.disabled, true)
  assert.equal(consistency?.unavailableReason, "Bob Code Consistency 拡張がインストールされていません。")
  assert.equal(builder?.disabled, undefined)
})

test("Operation Hub offers the next-step action for idle running workflow runs", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "sample-repo",
    workspaceRoots: ["C:\\work\\sample-repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: [
      {
        root: "C:\\work\\sample-repo",
        run: {
          runId: "run-2",
          workflowId: "qa.review",
          workflowName: "QA Review",
          status: "running",
          currentStep: "generate",
          inputs: {},
          state: {},
          steps: [
            { id: "collect", title: "収集", type: "command", status: "completed" },
            { id: "generate", title: "生成", type: "agent", status: "pending" }
          ],
          createdAt: "2026-07-05T01:00:00.000Z",
          updatedAt: "2026-07-05T01:02:00.000Z"
        }
      }
    ]
  })

  assert.equal(model.runMonitor[0].statusLabel, "次のステップを実行できます")
  assert.ok(model.runMonitor[0].primaryActions.some((action) => (
    action.id === "runNextStep" &&
    action.commandId === "workflowRegister.runNextStep" &&
    action.variant === "primary"
  )))
})

test("Operation Hub keeps future run-state versions read-only", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const model = buildOperationHubModel({
    workspaceName: "sample-repo",
    workspaceRoots: ["C:\\work\\sample-repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: [{
      root: "C:\\work\\sample-repo",
      run: {
        schemaVersion: "workflow-register/run-state/v2",
        runId: "future-read-only",
        workflowId: "qa.review",
        workflowName: "QA Review",
        status: "running",
        currentStep: "review",
        inputs: {},
        state: {},
        steps: [{ id: "review", title: "確認", type: "manual", status: "pending" }],
        createdAt: "2026-07-05T01:00:00.000Z",
        updatedAt: "2026-07-05T01:02:00.000Z"
      }
    }]
  })

  assert.deepEqual(model.runMonitor[0].primaryActions.map((action) => action.id), ["inspectRunControl"])
})

test("Operation Hub focused run is pinned first and marked for operator action", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "sample-repo",
    workspaceRoots: ["C:\\work\\sample-repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    focusedRunId: "run-older",
    runs: [
      {
        root: "C:\\work\\sample-repo",
        run: {
          runId: "run-newer",
          workflowId: "qa.review",
          workflowName: "Newer",
          status: "running",
          currentStep: "generate",
          inputs: {},
          state: {},
          steps: [{ id: "generate", title: "生成", type: "agent", status: "pending" }],
          createdAt: "2026-07-05T01:00:00.000Z",
          updatedAt: "2026-07-05T01:03:00.000Z"
        }
      },
      {
        root: "C:\\work\\sample-repo",
        run: {
          runId: "run-older",
          workflowId: "qa.review",
          workflowName: "Older",
          status: "reviewing",
          currentStep: "humanGate",
          inputs: {},
          state: {},
          steps: [{ id: "humanGate", title: "人間確認", type: "manual", status: "reviewing" }],
          createdAt: "2026-07-05T01:00:00.000Z",
          updatedAt: "2026-07-05T01:01:00.000Z"
        }
      }
    ]
  })

  assert.equal(model.runMonitor[0].runId, "run-older")
  assert.equal(model.runMonitor[0].focused, true)
  assert.equal(model.runMonitor[1].focused, false)
})

test("Operation Hub run focus keeps workspace identity when run ids collide", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const run = (root, updatedAt) => ({
    root,
    run: {
      runId: "shared-run",
      workflowId: "qa.review",
      workflowName: root,
      status: "running",
      currentStep: "generate",
      inputs: {},
      state: {},
      steps: [{ id: "generate", title: "生成", type: "agent", status: "pending" }],
      createdAt: updatedAt,
      updatedAt
    }
  })
  const model = buildOperationHubModel({
    workspaceName: "multi-root",
    workspaceRoots: ["C:\\work\\a", "C:\\work\\b"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    focusedRunId: "shared-run",
    focusedWorkspaceRoot: "C:\\work\\a",
    runs: [
      run("C:\\work\\b", "2026-07-05T01:04:00.000Z"),
      run("C:\\work\\a", "2026-07-05T01:03:00.000Z")
    ]
  })

  assert.equal(model.runMonitor.filter((item) => item.focused).length, 1)
  assert.equal(model.runMonitor[0].root, "C:\\work\\a")
})

test("Operation Hub html uses nonce protected scripts and data-action buttons", () => {
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const { buildOperationHubModel, OPERATION_HUB_ALLOWED_ACTIONS } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "repo",
    workspaceRoots: ["C:\\repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: false,
      runStatePresent: false,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: []
  })
  const html = renderOperationHubHtml({ model, cspSource: "vscode-resource:", nonce: "nonce-123" })

  assert.match(html, /nonce-123/)
  assert.match(html, /Bob 操作ハブ/)
  assert.match(html, /セットアップ/)
  assert.match(html, /ワークフロー一覧/)
  assert.match(html, /実行状況/)
  assert.match(html, /data-action="openWorkflowBuilder"/)
  assert.match(html, /vscode\.postMessage/)
  assert.doesNotMatch(html, /onclick=/)
  assert.doesNotMatch(html, /eval\(/)
  assert.ok(OPERATION_HUB_ALLOWED_ACTIONS.includes("acceptAndRunNextStep"))
  assert.ok(OPERATION_HUB_ALLOWED_ACTIONS.includes("openRunControl"))
  assert.equal(OPERATION_HUB_ALLOWED_ACTIONS.includes("openOperationHubPanel"), false)
})

test("Operation Hub html uses the retained panel layout", () => {
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "repo",
    workspaceRoots: ["C:\\repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [
      {
        id: "qa.review",
        label: "QA Review",
        description: "レビューする",
        hidden: false,
        inputs: {},
        artifacts: [],
        category: "QA"
      }
    ],
    runs: [
      {
        root: "C:\\repo",
        run: {
          runId: "run-wide",
          workflowId: "qa.review",
          workflowName: "QA Review",
          status: "reviewing",
          currentStep: "humanGate",
          inputs: {},
          state: {},
          steps: [{ id: "humanGate", title: "人間確認", type: "manual", status: "reviewing" }],
          createdAt: "2026-07-05T01:00:00.000Z",
          updatedAt: "2026-07-05T01:02:00.000Z"
        }
      }
    ]
  })

  const html = renderOperationHubHtml({ model, cspSource: "vscode-resource:", nonce: "nonce-123" })

  assert.match(html, /class="operation-hub"/)
  assert.doesNotMatch(html, /compact|panel-shell|primary-pane|secondary-pane/)
  assert.ok(html.indexOf('id="runs"') < html.indexOf('id="setup"'))
  assert.ok(html.indexOf('id="runs"') < html.indexOf('id="catalog"'))
})

test("Operation Hub html exposes the latest refresh time", () => {
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "repo",
    workspaceRoots: ["C:\\repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: false,
      runStatePresent: false,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: []
  })
  const html = renderOperationHubHtml({ model, cspSource: "vscode-resource:", nonce: "nonce-123", refreshedAt: "12:34:56" })

  assert.match(html, /更新 12:34:56/)
})

test("Operation Hub html highlights the focused run", () => {
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")

  const model = buildOperationHubModel({
    workspaceName: "sample-repo",
    workspaceRoots: ["C:\\work\\sample-repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    focusedRunId: "run-focus",
    runs: [
      {
        root: "C:\\work\\sample-repo",
        run: {
          runId: "run-focus",
          workflowId: "qa.review",
          workflowName: "QA Review",
          status: "reviewing",
          currentStep: "humanGate",
          inputs: {},
          state: {},
          steps: [{ id: "humanGate", title: "人間確認", type: "manual", status: "reviewing" }],
          createdAt: "2026-07-05T01:00:00.000Z",
          updatedAt: "2026-07-05T01:02:00.000Z"
        }
      }
    ]
  })
  const html = renderOperationHubHtml({ model, cspSource: "vscode-resource:", nonce: "nonce-123" })

  assert.match(html, /class="card focused-run"/)
  assert.match(html, /操作対象/)
  assert.match(html, /run-focus/)
})

test("Operation Hub provider routes accept-and-run-next with the run id", () => {
  const source = readSrc("gui", "operationHubProvider.ts")

  assert.match(source, /acceptAndRunNextStep: "workflowRegister\.acceptAndRunNextStep"/)
  assert.match(source, /const RUN_ID_ACTIONS: readonly OperationHubActionId\[] = \[/)
  assert.match(source, /"acceptAndRunNextStep"/)
  assert.match(source, /RUN_ID_ACTIONS\.includes\(message\.action\)/)
})

test("Operation Hub provider accepts run focus arguments from the open command", () => {
  const core = readSrc("extension.ts")
  const provider = readSrc("gui", "operationHubProvider.ts")

  assert.match(core, /registerCommand\("workflowRegister\.openOperationHub", \(input\?: unknown\) => operationHub\.open\(input\)\)/)
  assert.match(provider, /type OperationHubOpenInput = string \| \{ workspaceRoot\?: string; runId\?: string; stepId\?: string; reason\?: "stepGate" \| "paused" \}/)
  assert.match(provider, /private focusedRunId\?: string/)
  assert.match(provider, /private focusedWorkspaceRoot\?: string/)
  assert.match(provider, /private panel\?: vscode\.WebviewPanel/)
  assert.match(provider, /focusedRunId: this\.focusedRunId/)
  assert.match(provider, /const focusedWorkspaceRoot = await matchingCandidateRoot/)
  assert.match(provider, /focusedWorkspaceRoot\s*\n\s*\}/)
  assert.doesNotMatch(provider, /openPanel/)
  assert.match(provider, /panel\.reveal\(vscode\.ViewColumn\.One\)/)
  assert.match(provider, /createWebviewPanel\(\s*"workflowRegisterOperationHub"/)
  assert.match(provider, /retainContextWhenHidden: true/)
  assert.match(provider, /await this\.refreshPanel\(\)/)
})


test("Operation Hub renders Japanese-first headings and empty state", () => {
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const html = renderOperationHubHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-japanese",
    model: {
      home: {
        workspaceName: "sample-repo",
        workspaceRoots: ["/repo"],
        activeRunCount: 0,
        workflowCount: 0,
        recommendedActions: []
      },
      setupChecklist: [],
      workflowCatalog: [],
      runMonitor: []
    },
  })

  assert.match(html, /Bob 操作ハブ/)
  assert.match(html, /実行状況/)
  assert.match(html, /実行中または最近の実行はありません/)
  assert.doesNotMatch(html, /Run Monitor/)
})
