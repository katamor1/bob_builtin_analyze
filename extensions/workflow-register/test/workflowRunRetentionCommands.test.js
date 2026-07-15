const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")
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

test("retention command adapter exposes preview-first explicit operations without automatic scheduling", () => {
  const source = readSrc("commands", "runRetention.ts")
  assert.match(source, /export async function inspectWorkflowRunStorage/)
  assert.match(source, /export async function previewWorkflowRunCleanup/)
  assert.match(source, /export async function cleanupCompletedWorkflowRuns/)
  assert.match(source, /export async function deleteSelectedWorkflowRuns/)
  assert.match(source, /export async function pinWorkflowRun/)
  assert.match(source, /export async function unpinWorkflowRun/)
  assert.match(source, /showMarkdownReport/)
  assert.match(source, /showWarningMessage[\s\S]*modal: true/)
  assert.doesNotMatch(source, /setInterval|setTimeout|onStartupFinished/)
  assert.doesNotMatch(source, /get<[^>]+>\("enabled"|runs\.retention\.enabled/)
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
  for (const id of commandIds) {
    assert.equal(workflow.split(id).length - 1, 2, `${id} must be smoked once on Linux and once on Windows`)
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
        assert.equal(result, "No workflow workspace selected.")
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
