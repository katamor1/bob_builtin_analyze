const assert = require("node:assert/strict")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const MODULE = require.resolve("../out/webview/consistencyReviewWizard")

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function turn() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

test("an older model completion cannot replace the document snapshot used by the newest rendered model", async () => {
  const initialDiscovery = deferred()
  const olderDiscovery = deferred()
  const newestDiscovery = deferred()
  const discoveryQueue = [initialDiscovery, olderDiscovery, newestDiscovery]
  const renderedModels = []
  const writes = []
  let discoveryCalls = 0
  const { ConsistencyReviewWizardController } = loadController({
    discoverReviewInputCandidates: async () => {
      const next = discoveryQueue[discoveryCalls]
      discoveryCalls += 1
      if (!next) throw new Error("unexpected discovery call")
      return next.promise
    },
    renderedModels,
    writes
  })
  const panel = fakePanel()
  const controller = new ConsistencyReviewWizardController(
    { subscriptions: [] },
    panel,
    {
      resolveWorkspaceRoot: async () => "/workspace",
      createRenderToken: () => `token-${renderedModels.length + 1}`
    }
  )
  const initialDocument = candidate("docs/initial.md", "REQ-INITIAL")
  const olderDocument = candidate("docs/older.md", "REQ-OLDER")
  const newestDocument = candidate("docs/newest.md", "REQ-NEWEST")

  const initialization = controller.initialize()
  await turn()
  initialDiscovery.resolve({ documents: [initialDocument], warnings: [] })
  assert.deepEqual(await initialization, { status: "ok" })

  const olderLoad = controller.showStage("review")
  await turn()
  const newestLoad = controller.showStage("review")
  await turn()
  newestDiscovery.resolve({ documents: [newestDocument], warnings: [] })
  assert.deepEqual(await newestLoad, { status: "ok" })
  olderDiscovery.resolve({ documents: [olderDocument], warnings: [] })
  assert.deepEqual(await olderLoad, { status: "error", errors: ["stage is no longer active"] })

  assert.deepEqual(renderedModels.at(-1).documents, [newestDocument])
  await controller.createReviewInput({ documentPaths: [newestDocument.path] })
  assert.deepEqual(writes.map((write) => write.draft.artifact_candidates), [[{
    kind: "requirements",
    path: newestDocument.path,
    sections: ["REQ-NEWEST"]
  }]])
})

function loadController(harness) {
  const originalLoad = Module._load
  const vscode = {
    ViewColumn: { One: 1 },
    commands: { executeCommand: async () => undefined },
    window: {
      showErrorMessage: async () => undefined,
      showTextDocument: async () => undefined
    },
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async () => ({})
    }
  }
  delete require.cache[MODULE]
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") return vscode
    if (request === "../core/reviewInputDiscovery") return {
      discoverReviewInputCandidates: harness.discoverReviewInputCandidates
    }
    if (request === "../core/reviewInputBuilder") return {
      CHANGE_TYPE_VALUES: ["maintenance"],
      REVIEW_FOCUS_VALUES: ["requirement-code-consistency", "design-code-consistency", "test-gap"],
      VCS_VALUES: ["git"],
      writeReviewInputFromDraft: async (input) => {
        harness.writes.push(input)
        return { status: "ok", outputPath: input.outputPath, warnings: [] }
      }
    }
    if (request === "../core/fileSystem") return {
      resolveWorkspacePathStrict: (workspaceRoot, value) => path.resolve(workspaceRoot, value)
    }
    if (request === "../core/traceabilityCatalogStore") return {
      DEFAULT_TRACEABILITY_CATALOG_PATH: ".bob-trace/traceability-catalog.json",
      DEFAULT_TRACEABILITY_GATE_REPORT_PATH: ".bob-trace/gate-report.md",
      readTraceabilityCatalog: async () => ({ status: "error", errors: [] }),
      validateAndWriteTraceabilityGateReport: async () => ({ status: "error", errors: [] })
    }
    if (request === "../workspaceInitializer") return {
      getCodeConsistencyWorkspaceInitializationStatus: async () => ({
        initialized: true,
        workflowPath: "/workspace/.bob/workflows/code-consistency-review/WORKFLOW.md",
        missing: []
      })
    }
    if (request === "../workspaceResolver") return { resolveBobWorkspaceRoot: async () => "/workspace" }
    if (request === "./consistencyReviewWizardHtml") return {
      renderConsistencyReviewWizardHtml: ({ model }) => {
        harness.renderedModels.push(model)
        return `<main>${model.documents.map((document) => document.path).join(",")}</main>`
      }
    }
    if (request === "./consistencyHumanTriage") return { createConsistencyHumanTriageStage: () => undefined }
    if (request === "./consistencyResultCapture") return { createConsistencyResultCaptureStage: () => undefined }
    if (request === "./traceabilityPrepWebview") return { createTraceabilityPrepStage: () => undefined }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(MODULE)
  } finally {
    Module._load = originalLoad
  }
}

function fakePanel() {
  const webview = {
    cspSource: "vscode-resource:",
    html: "",
    onDidReceiveMessage: () => ({ dispose() {} }),
    postMessage: async () => true
  }
  return {
    webview,
    onDidDispose: () => ({ dispose() {} })
  }
}

function candidate(documentPath, section) {
  return {
    kind: "requirements",
    path: documentPath,
    sections: [section],
    label: documentPath
  }
}
