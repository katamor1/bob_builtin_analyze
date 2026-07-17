const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")
const ts = require("typescript")
const { readSrc } = require("./helpers/sourceReader")

const root = path.resolve(__dirname, "..")
const commandIds = [
  "workflowRegister.inspectRunStorage",
  "workflowRegister.previewRunCleanup",
  "workflowRegister.cleanupCompletedRuns",
  "workflowRegister.deleteSelectedRuns",
  "workflowRegister.pinRun",
  "workflowRegister.unpinRun"
]
const commandHandlers = new Map([
  ["workflowRegister.inspectRunStorage", "inspectWorkflowRunStorage"],
  ["workflowRegister.previewRunCleanup", "previewWorkflowRunCleanup"],
  ["workflowRegister.cleanupCompletedRuns", "cleanupCompletedWorkflowRuns"],
  ["workflowRegister.deleteSelectedRuns", "deleteSelectedWorkflowRuns"],
  ["workflowRegister.pinRun", "pinWorkflowRun"],
  ["workflowRegister.unpinRun", "unpinWorkflowRun"]
])
const destructiveCommandHandlers = new Map([
  ["workflowRegister.cleanupCompletedRuns", "cleanupCompletedWorkflowRuns"],
  ["workflowRegister.deleteSelectedRuns", "deleteSelectedWorkflowRuns"],
  ["workflowRegister.pinRun", "pinWorkflowRun"],
  ["workflowRegister.unpinRun", "unpinWorkflowRun"]
])

function loadRetentionCommands({
  vscode,
  RetentionService,
  workspaceRoots,
  reports = { showMarkdownReport: async () => undefined },
  requireTrustedWorkspace = async () => undefined
}) {
  const modulePath = path.join(root, "out", "commands", "runRetention.js")
  const originalLoad = Module._load
  delete require.cache[require.resolve(modulePath)]
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    if (request === "../core/runtime/runRetentionService") {
      return { WorkflowRunRetentionService: RetentionService }
    }
    if (request === "../core/workspaceRoots") return workspaceRoots
    if (request === "../reports") return reports
    if (request === "../workspaceTrust") return { requireTrustedWorkspace }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function emptyInspection() {
  return {
    summary: {
      runCount: 0,
      totalBytes: 0,
      terminalRunCount: 0,
      recoverableRunCount: 0,
      pinnedRunCount: 0,
      referencedRunCount: 0,
      readOnlyRunCount: 0,
      unknownRunCount: 0,
      blockedRunCount: 0,
      measurementIncompleteRunCount: 0,
      referenceGraphComplete: true
    },
    inventory: [],
    referenceGraphComplete: true
  }
}

function emptyPlan() {
  return {
    createdAt: "2026-07-15T00:00:00.000Z",
    candidateRunIds: [],
    totalBytes: 0,
    reclaimBytes: 0,
    digest: "empty-plan",
    decisions: []
  }
}

function destructiveCommandPlan() {
  return {
    createdAt: "2026-07-15T00:00:00.000Z",
    candidateRunIds: ["eligible-run"],
    totalBytes: 4096,
    reclaimBytes: 2048,
    digest: "non-empty-plan",
    decisions: [{
      runId: "eligible-run",
      action: "delete",
      status: "completed",
      bytes: 2048,
      reasons: ["completedDays"],
      blockers: []
    }]
  }
}

function expectedCleanupReport(workspaceRoot) {
  return {
    title: "実行履歴の削除候補",
    summary: "1件を削除可能、2.0 KiBを解放予定。",
    lines: [
      `- ワークスペース: ${workspaceRoot}`,
      "- 作成日時: 2026-07-15T00:00:00.000Z",
      "- 削除候補: 1件",
      "- 合計サイズ: 4.0 KiB",
      "- 解放予定: 2.0 KiB",
      "- 計画ダイジェスト: non-empty-plan",
      "",
      "判定:",
      "- eligible-run: delete; 状態=completed; サイズ=2.0 KiB; 理由=completedDays; 除外理由=なし"
    ]
  }
}

function assertRetentionActivationSafety(retentionSource, extensionSource) {
  assert.doesNotMatch(retentionSource, /setInterval|setTimeout|onStartupFinished/)
  assert.doesNotMatch(retentionSource, /get<[^>]+>\("enabled"|runs\.retention\.enabled/)
  const sourceFile = ts.createSourceFile(
    "extensionWithAuthoring.ts",
    extensionSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  const usesByHandler = new Map([...destructiveCommandHandlers.values()].map((handler) => [handler, []]))
  const usesByCommandId = new Map([...destructiveCommandHandlers.keys()].map((commandId) => [commandId, []]))
  const visit = (node) => {
    if (ts.isIdentifier(node) && usesByHandler.has(node.text) && !ts.isImportSpecifier(node.parent)) {
      usesByHandler.get(node.text).push(node)
    }
    if (ts.isStringLiteral(node) && usesByCommandId.has(node.text)) usesByCommandId.get(node.text).push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  for (const [commandId, handler] of destructiveCommandHandlers) {
    const uses = usesByHandler.get(handler)
    assert.equal(uses.length, 1, `${handler} must execute exactly once and only as its registered command callback`)
    const call = uses[0].parent
    assert.ok(
      ts.isCallExpression(call) && call.expression === uses[0],
      `${handler} must execute only as its registered command callback`
    )
    let callback = call.parent
    while (callback && !ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) callback = callback.parent
    assert.ok(callback, `${handler} must execute only as its registered command callback`)
    const registration = callback.parent
    assert.ok(
      ts.isCallExpression(registration)
        && registration.arguments[1] === callback
        && ts.isPropertyAccessExpression(registration.expression)
        && registration.expression.name.text === "registerCommand"
        && ts.isPropertyAccessExpression(registration.expression.expression)
        && registration.expression.expression.name.text === "commands"
        && ts.isIdentifier(registration.expression.expression.expression)
        && registration.expression.expression.expression.text === "vscode",
      `${handler} must execute only as its registered command callback`
    )
    assert.ok(ts.isStringLiteral(registration.arguments[0]), `${handler} command id must be a string literal`)
    assert.equal(registration.arguments[0].text, commandId, `${handler} must be registered for ${commandId}`)
    const commandIdUses = usesByCommandId.get(commandId)
    assert.equal(commandIdUses.length, 1, `${commandId} must appear exactly once and only as its registered command callback id`)
    assert.strictEqual(commandIdUses[0], registration.arguments[0], `${commandId} must appear only as its registered command callback id`)
  }
}

function assertRetentionSmokeCoverage(workflow) {
  const lines = workflow.split(/\r?\n/)
  const linuxStart = lines.findIndex((line) => line === "  workflow-register:")
  const linuxEnd = lines.findIndex((line, index) => index > linuxStart && line === "  bob-bazaar-review:")
  const windowsStart = lines.findIndex((line) => line === "          - extension: workflow-register")
  const windowsEnd = lines.findIndex((line, index) => index > windowsStart && line === "          - extension: bob-bazaar-review")
  assert.notEqual(linuxStart, -1, "Linux workflow-register job must exist")
  assert.notEqual(linuxEnd, -1, "Linux workflow-register job must have a bounded section")
  assert.notEqual(windowsStart, -1, "Windows workflow-register matrix entry must exist")
  assert.notEqual(windowsEnd, -1, "Windows workflow-register matrix entry must have a bounded section")
  const linuxSmoke = lines.slice(linuxStart, linuxEnd)
    .find((line) => line.trimStart().startsWith("SMOKE_COMMANDS:"))
  const windowsSmoke = lines.slice(windowsStart, windowsEnd)
    .find((line) => line.trimStart().startsWith("smoke_commands:"))
  assert.ok(linuxSmoke, "Linux smoke list must exist")
  assert.ok(windowsSmoke, "Windows smoke list must exist")
  for (const id of commandIds) {
    assert.equal(linuxSmoke.split(id).length - 1, 1, `${id} must appear exactly once in the Linux smoke list`)
    assert.equal(windowsSmoke.split(id).length - 1, 1, `${id} must appear exactly once in the Windows smoke list`)
  }
}

async function exerciseDestructiveCommand(commandName, accepted) {
  const workspaceRoot = path.resolve(`retention-confirmation-${commandName}`)
  const plan = destructiveCommandPlan()
  assert.equal(plan.candidateRunIds.length > 0, true, "destructive confirmation fixture must use a non-empty plan")
  const events = []
  const reports = []
  const modalCalls = []
  const applyPlans = []
  const previewPlans = []
  const inventory = [{
    runId: "eligible-run",
    status: "completed",
    bytes: 2048,
    updatedAt: "2026-07-14T00:00:00.000Z",
    pinned: false,
    referencedBy: []
  }]
  const vscode = {
    workspace: {
      workspaceFolders: [{ name: "workspace", uri: { fsPath: workspaceRoot } }],
      getConfiguration: () => ({ get: (_key, fallback) => fallback })
    },
    window: {
      showQuickPick: async (items) => items,
      showWarningMessage: async (...args) => {
        events.push("modal")
        modalCalls.push(args)
        return accepted ? "削除" : undefined
      },
      showInformationMessage: async () => undefined
    }
  }
  class RetentionServiceStub {
    constructor({ workspaceRoot: selectedRoot }) {
      assert.equal(selectedRoot, workspaceRoot)
    }

    async inventory() {
      return inventory
    }

    async preview() {
      events.push("preview")
      previewPlans.push(plan)
      return plan
    }

    async apply(receivedPlan) {
      events.push("apply")
      applyPlans.push(receivedPlan)
      return { removedRunIds: ["eligible-run"], reclaimedBytes: 2048, transactionId: "cleanup-1" }
    }
  }
  const commands = loadRetentionCommands({
    vscode,
    RetentionService: RetentionServiceStub,
    workspaceRoots: {
      findWorkflowRootCandidates: async () => [{ name: "workspace", root: workspaceRoot }],
      fallbackWorkspaceRootCandidates: () => [{ name: "workspace", root: workspaceRoot }]
    },
    reports: {
      showMarkdownReport: async (title, summary, lines) => {
        events.push("report-start")
        reports.push({ title, summary, lines })
        await new Promise((resolve) => setImmediate(resolve))
        events.push("report")
      }
    }
  })

  const result = await commands[commandName]({ workspaceRoot })
  return { applyPlans, events, modalCalls, plan, previewPlans, reports, result, workspaceRoot }
}

function assertPreviewThenModal(outcome) {
  assert.deepEqual(outcome.reports, [expectedCleanupReport(outcome.workspaceRoot)])
  assert.equal(outcome.previewPlans.length, 1)
  assert.equal(outcome.modalCalls.length, 1)
  assert.deepEqual(outcome.modalCalls[0].slice(1), [{ modal: true }, "削除"])
  assert.ok(outcome.events.indexOf("preview") < outcome.events.indexOf("report"))
  assert.ok(outcome.events.indexOf("report") < outcome.events.indexOf("modal"))
}

test("retention command adapter exposes preview-first explicit operations without automatic scheduling", () => {
  const source = readSrc("commands", "runRetention.ts")
  const extension = readSrc("extensionWithAuthoring.ts")
  assert.match(source, /export async function inspectWorkflowRunStorage/)
  assert.match(source, /export async function previewWorkflowRunCleanup/)
  assert.match(source, /export async function cleanupCompletedWorkflowRuns/)
  assert.match(source, /export async function deleteSelectedWorkflowRuns/)
  assert.match(source, /export async function pinWorkflowRun/)
  assert.match(source, /export async function unpinWorkflowRun/)
  assert.match(source, /showMarkdownReport/)
  assert.match(source, /showWarningMessage[\s\S]*modal: true/)
  assertRetentionActivationSafety(source, extension)
})

test("retention activation safety rejects direct and scheduled destructive handler execution", () => {
  const source = readSrc("commands", "runRetention.ts")
  const extension = readSrc("extensionWithAuthoring.ts")
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).activationEvents.includes("onStartupFinished"), true)

  const direct = extension.replace(
    "  const api = activateCore(context)",
    "  const api = activateCore(context)\n  cleanupCompletedWorkflowRuns(undefined)"
  )
  const scheduled = extension.replace(
    "  const api = activateCore(context)",
    "  const api = activateCore(context)\n  setTimeout(() => deleteSelectedWorkflowRuns(undefined), 0)"
  )
  const scheduledReference = extension.replace(
    "  const api = activateCore(context)",
    "  const api = activateCore(context)\n  setTimeout(pinWorkflowRun, 0)"
  )
  const scheduledCommandDispatch = extension.replace(
    "  const api = activateCore(context)",
    "  const api = activateCore(context)\n  setTimeout(() => vscode.commands.executeCommand(\"workflowRegister.cleanupCompletedRuns\"), 0)"
  )
  assert.notEqual(direct, extension)
  assert.notEqual(scheduled, extension)
  assert.notEqual(scheduledReference, extension)
  assert.notEqual(scheduledCommandDispatch, extension)
  assert.throws(() => assertRetentionActivationSafety(source, direct), /registered command callback/)
  assert.throws(() => assertRetentionActivationSafety(source, scheduled), /registered command callback/)
  assert.throws(() => assertRetentionActivationSafety(source, scheduledReference), /registered command callback/)
  assert.throws(() => assertRetentionActivationSafety(source, scheduledCommandDispatch), /registered command callback/)
})

test("extension contributes, registers and disposes every exact retention handler", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const extension = readSrc("extensionWithAuthoring.ts")
  const subscriptionStart = extension.indexOf("context.subscriptions.push(")
  const subscriptionEnd = extension.indexOf("\n  )", subscriptionStart)
  assert.notEqual(subscriptionStart, -1)
  assert.notEqual(subscriptionEnd, -1)
  const subscriptions = extension.slice(subscriptionStart, subscriptionEnd)
  const palette = packageJson.contributes.menus.commandPalette
  for (const [id, handler] of commandHandlers) {
    assert.equal(packageJson.activationEvents.filter((entry) => entry === `onCommand:${id}`).length, 1, id)
    assert.equal(packageJson.contributes.commands.filter((entry) => entry.command === id).length, 1, id)
    assert.equal(palette.filter((entry) => entry.command === id).length, 1, id)
    assert.match(
      subscriptions,
      new RegExp(`vscode\\.commands\\.registerCommand\\(\\s*"${id.replaceAll(".", "\\.")}"\\s*,\\s*\\(input\\) => ${handler}\\(input\\)\\s*\\)`),
      `${id} must register ${handler} inside context.subscriptions.push`
    )
  }
})

test("retention settings are disabled by default and bounded", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const properties = packageJson.contributes.configuration.properties
  assert.equal(properties["workflowRegister.runs.retention.enabled"].type, "boolean")
  assert.equal(properties["workflowRegister.runs.retention.enabled"].default, false)
  assert.equal(properties["workflowRegister.runs.retention.completedDays"].type, "number")
  assert.equal(properties["workflowRegister.runs.retention.completedDays"].default, 30)
  assert.equal(properties["workflowRegister.runs.retention.maxCompletedRuns"].type, "integer")
  assert.equal(properties["workflowRegister.runs.retention.maxCompletedRuns"].default, 100)
  assert.match(
    properties["workflowRegister.runs.retention.maxCompletedRuns"].description,
    /終了済みの実行.*completed.*failed/
  )
  assert.equal(properties["workflowRegister.runs.retention.maxTotalBytes"].type, "integer")
  assert.equal(properties["workflowRegister.runs.retention.maxTotalBytes"].default, 524288000)
  for (const key of [
    "workflowRegister.runs.retention.completedDays",
    "workflowRegister.runs.retention.maxCompletedRuns",
    "workflowRegister.runs.retention.maxTotalBytes"
  ]) {
    assert.equal(properties[key].minimum, 0)
  }
})

test("Linux and Windows extension-host smoke cover every retention command", () => {
  const workflow = fs.readFileSync(path.join(root, "..", "..", ".github", "workflows", "extensions-quality.yml"), "utf8")
  assertRetentionSmokeCoverage(workflow)
})

test("retention smoke coverage rejects Linux duplicates that are absent from Windows", () => {
  const workflow = fs.readFileSync(path.join(root, "..", "..", ".github", "workflows", "extensions-quality.yml"), "utf8")
  const id = "workflowRegister.cleanupCompletedRuns"
  const lines = workflow.split(/\r?\n/)
  const linuxIndex = lines.findIndex((line) => line.includes("SMOKE_COMMANDS:") && line.includes(id))
  const windowsIndex = lines.findIndex((line) => line.includes("smoke_commands:") && line.includes(id))
  assert.notEqual(linuxIndex, -1)
  assert.notEqual(windowsIndex, -1)
  lines[linuxIndex] = `${lines[linuxIndex]},${id}`
  lines[windowsIndex] = lines[windowsIndex].replace(`,${id}`, "")
  assert.throws(() => assertRetentionSmokeCoverage(lines.join("\n")), /Linux smoke list|Windows smoke list/)
})

test("destructive retention commands preview before modal cancellation or exact-plan apply", async (t) => {
  for (const commandName of ["cleanupCompletedWorkflowRuns", "deleteSelectedWorkflowRuns"]) {
    for (const accepted of [false, true]) {
      await t.test(`${commandName} ${accepted ? "accept" : "cancel"}`, async () => {
        const outcome = await exerciseDestructiveCommand(commandName, accepted)
        assertPreviewThenModal(outcome)
        if (!accepted) {
          assert.equal(outcome.applyPlans.length, 0)
          assert.equal(outcome.result, "実行履歴の整理を中止しました。")
          return
        }
        assert.ok(outcome.events.indexOf("modal") < outcome.events.indexOf("apply"))
        assert.equal(outcome.applyPlans.length, 1)
        assert.strictEqual(outcome.applyPlans[0], outcome.previewPlans[0])
        assert.deepEqual(outcome.result, {
          removedRunIds: ["eligible-run"],
          reclaimedBytes: 2048,
          transactionId: "cleanup-1"
        })
      })
    }
  }
})

test("retention reports expose identifiers, counts and blockers but not run body values", () => {
  const source = readSrc("commands", "runRetention.ts")
  assert.match(source, /candidateRunIds|reclaimBytes|blockers|reasons/)
  assert.doesNotMatch(source, /run\.inputs|run\.state|artifactBody|taskExport|lastAssistantText/)
})

test("destructive exported commands require trust before root, service, UI or filesystem side effects", async () => {
  const sideEffects = []
  let trustCalls = 0
  const vscode = {
    workspace: {
      get workspaceFolders() {
        sideEffects.push("workspaceFolders")
        return []
      },
      getConfiguration() {
        sideEffects.push("configuration")
        return { get: (_key, fallback) => fallback }
      }
    },
    window: new Proxy({}, {
      get: (_target, property) => async () => {
        sideEffects.push(`window.${String(property)}`)
        return undefined
      }
    })
  }
  class RetentionServiceStub {
    constructor() {
      sideEffects.push("service")
      throw new Error("service must not be constructed before workspace trust")
    }
  }
  const commands = loadRetentionCommands({
    vscode,
    RetentionService: RetentionServiceStub,
    workspaceRoots: {
      findWorkflowRootCandidates: async () => {
        sideEffects.push("find-roots")
        return []
      },
      fallbackWorkspaceRootCandidates: () => {
        sideEffects.push("fallback-roots")
        return []
      }
    },
    reports: {
      showMarkdownReport: async () => { sideEffects.push("report") }
    },
    requireTrustedWorkspace: async () => {
      trustCalls += 1
      return "Workspace trust is required."
    }
  })

  for (const name of [
    "cleanupCompletedWorkflowRuns",
    "deleteSelectedWorkflowRuns",
    "pinWorkflowRun",
    "unpinWorkflowRun"
  ]) {
    assert.equal(await commands[name](), "Workspace trust is required.", name)
  }
  assert.equal(trustCalls, 4)
  assert.deepEqual(sideEffects, [])
})

test("inspect and preview remain read-only in an untrusted workspace", async () => {
  const workspaceRoot = path.resolve("untrusted-retention-workspace")
  const events = []
  const vscode = {
    workspace: {
      workspaceFolders: [{ name: "workspace", uri: { fsPath: workspaceRoot } }],
      getConfiguration: () => ({ get: (_key, fallback) => fallback })
    },
    window: {}
  }
  class RetentionServiceStub {
    constructor({ workspaceRoot: selectedRoot }) {
      events.push(`service:${selectedRoot}`)
    }

    async inspect() {
      events.push("inspect")
      return emptyInspection()
    }

    async preview() {
      events.push("preview")
      return emptyPlan()
    }
  }
  let trustCalls = 0
  const commands = loadRetentionCommands({
    vscode,
    RetentionService: RetentionServiceStub,
    workspaceRoots: {
      findWorkflowRootCandidates: async () => [{ name: "workspace", root: workspaceRoot }],
      fallbackWorkspaceRootCandidates: () => [{ name: "workspace", root: workspaceRoot }]
    },
    reports: {
      showMarkdownReport: async () => { events.push("report") }
    },
    requireTrustedWorkspace: async () => {
      trustCalls += 1
      return "Workspace trust is required."
    }
  })

  assert.deepEqual(await commands.inspectWorkflowRunStorage(), emptyInspection().summary)
  assert.deepEqual(await commands.previewWorkflowRunCleanup(), emptyPlan())
  assert.equal(trustCalls, 0)
  assert.deepEqual(events, [
    `service:${workspaceRoot}`,
    "inspect",
    "report",
    `service:${workspaceRoot}`,
    "preview",
    "report"
  ])
})

test("workflow root selection handles zero, one, multiple, cancellation and requested roots", async (t) => {
  const rootA = path.resolve("retention-root-a")
  const rootB = path.resolve("retention-root-b")
  const cases = [
    { name: "zero folders", folders: undefined, candidates: [], expected: undefined, quickPick: "forbidden" },
    { name: "one root", folders: [rootA], candidates: [rootA], expected: rootA, quickPick: "forbidden" },
    { name: "multiple roots", folders: [rootA, rootB], candidates: [rootA, rootB], pick: rootB, expected: rootB },
    { name: "cancel multiple roots", folders: [rootA, rootB], candidates: [rootA, rootB], expected: undefined },
    { name: "valid requested root", folders: [rootA, rootB], candidates: [rootA, rootB], requested: rootB, expected: rootB, quickPick: "forbidden" },
    { name: "invalid requested root", folders: [rootA, rootB], candidates: [rootA, rootB], requested: path.resolve("retention-root-missing"), expected: undefined, quickPick: "forbidden" }
  ]

  for (const item of cases) {
    await t.test(item.name, async () => {
      const constructed = []
      let quickPickCalls = 0
      const folders = item.folders?.map((folder) => ({ name: path.basename(folder), uri: { fsPath: folder } }))
      const vscode = {
        workspace: { workspaceFolders: folders },
        window: {
          showQuickPick: async (items) => {
            quickPickCalls += 1
            return items.find((entry) => entry.root === item.pick)
          }
        }
      }
      class RetentionServiceStub {
        constructor({ workspaceRoot }) {
          constructed.push(workspaceRoot)
        }

        async inspect() {
          return emptyInspection()
        }
      }
      const commands = loadRetentionCommands({
        vscode,
        RetentionService: RetentionServiceStub,
        workspaceRoots: {
          findWorkflowRootCandidates: async () => item.candidates.map((candidate) => ({ name: path.basename(candidate), root: candidate })),
          fallbackWorkspaceRootCandidates: () => item.candidates.map((candidate) => ({ name: path.basename(candidate), root: candidate }))
        }
      })

      const result = await commands.inspectWorkflowRunStorage(item.requested ? { workspaceRoot: item.requested } : undefined)
      if (item.expected) {
        assert.deepEqual(result, emptyInspection().summary)
        assert.deepEqual(constructed, [item.expected])
      } else {
        assert.equal(result, "ワークフローのワークスペースが選択されていません。対象のフォルダーを開いてから再実行してください。")
        assert.deepEqual(constructed, [])
      }
      assert.equal(quickPickCalls, item.quickPick === "forbidden" ? 0 : 1)
    })
  }
})

test("multi-root pin selects the root before resolving a duplicate run id", async () => {
  const rootA = path.resolve("retention-duplicate-root-a")
  const rootB = path.resolve("retention-duplicate-root-b")
  const events = []
  const vscode = {
    workspace: {
      workspaceFolders: [
        { name: "A", uri: { fsPath: rootA } },
        { name: "B", uri: { fsPath: rootB } }
      ]
    },
    window: {
      showQuickPick: async (items) => {
        if (items[0]?.root) {
          events.push("pick-root")
          return items.find((item) => item.root === rootB)
        }
        events.push("pick-run")
        return items.find((item) => item.runId === "duplicate-run")
      },
      showInputBox: async () => {
        events.push("pin-note")
        return "retain duplicate"
      },
      showInformationMessage: async () => { events.push("information") }
    }
  }
  class RetentionServiceStub {
    constructor({ workspaceRoot }) {
      this.workspaceRoot = workspaceRoot
      events.push(`service:${workspaceRoot}`)
    }

    async inventory() {
      events.push(`inventory:${this.workspaceRoot}`)
      return [{
        runId: "duplicate-run",
        status: "completed",
        bytes: 12,
        updatedAt: "2026-07-15T00:00:00.000Z",
        pinned: false,
        referencedBy: []
      }]
    }

    async setPinned(runId, pinned, note) {
      events.push(`setPinned:${this.workspaceRoot}:${runId}:${pinned}:${note}`)
    }
  }
  const commands = loadRetentionCommands({
    vscode,
    RetentionService: RetentionServiceStub,
    workspaceRoots: {
      findWorkflowRootCandidates: async () => [
        { name: "A", root: rootA },
        { name: "B", root: rootB }
      ],
      fallbackWorkspaceRootCandidates: () => []
    },
    requireTrustedWorkspace: async () => {
      events.push("trust")
      return undefined
    }
  })

  assert.deepEqual(await commands.pinWorkflowRun(), { runId: "duplicate-run", pinned: true })
  assert.deepEqual(events, [
    "trust",
    "pick-root",
    `service:${rootB}`,
    `inventory:${rootB}`,
    "pick-run",
    "pin-note",
    `setPinned:${rootB}:duplicate-run:true:retain duplicate`,
    "information"
  ])
})

test("storage inspection renders one snapshot and only explicit metadata fields", async () => {
  const workspaceRoot = path.resolve("retention-command-workspace")
  const inspection = {
    summary: {
      runCount: 1,
      totalBytes: 42,
      terminalRunCount: 1,
      recoverableRunCount: 0,
      pinnedRunCount: 0,
      referencedRunCount: 0,
      readOnlyRunCount: 0,
      unknownRunCount: 0,
      blockedRunCount: 0,
      measurementIncompleteRunCount: 0,
      referenceGraphComplete: true
    },
    inventory: [{
      runId: "safe-run",
      status: "completed",
      updatedAt: "2026-07-13T00:00:00.000Z",
      bytes: 42,
      pinned: false,
      referencedBy: [],
      lockPresent: false,
      journalPending: false,
      inspectionStatus: "valid",
      measurementComplete: true,
      rawEntryName: "RAW_ENTRY_SECRET",
      decodeError: "DECODE_PAYLOAD_SECRET"
    }],
    referenceGraphComplete: true
  }
  let inspectionCalls = 0
  let report
  class RetentionServiceStub {
    async inspect() {
      inspectionCalls += 1
      return inspection
    }

    async summarize() {
      throw new Error("storage command must not start a second summary scan")
    }

    async inventory() {
      throw new Error("storage command must not start a second inventory scan")
    }
  }
  const vscode = {
    workspace: {
      workspaceFolders: [{ name: "workspace", uri: { fsPath: workspaceRoot } }]
    },
    window: {}
  }
  const modulePath = path.join(root, "out", "commands", "runRetention.js")
  const originalLoad = Module._load
  delete require.cache[require.resolve(modulePath)]
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    if (request === "../core/runtime/runRetentionService") {
      return { WorkflowRunRetentionService: RetentionServiceStub }
    }
    if (request === "../core/workspaceRoots") {
      return {
        findWorkflowRootCandidates: async () => [{ name: "workspace", root: workspaceRoot }],
        fallbackWorkspaceRootCandidates: () => [{ name: "workspace", root: workspaceRoot }]
      }
    }
    if (request === "../reports") {
      return {
        showMarkdownReport: async (title, summary, lines) => {
          report = { title, summary, lines }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  let commands
  try {
    commands = require(modulePath)
  } finally {
    Module._load = originalLoad
  }

  const result = await commands.inspectWorkflowRunStorage({ workspaceRoot })

  assert.equal(result, inspection.summary)
  assert.equal(inspectionCalls, 1)
  const rendered = JSON.stringify(report)
  assert.match(rendered, /safe-run/)
  assert.match(rendered, /completed/)
  assert.doesNotMatch(rendered, /RAW_ENTRY_SECRET|DECODE_PAYLOAD_SECRET/)
})
