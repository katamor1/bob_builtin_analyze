#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vscode = require("vscode")

const extensionRoot = path.resolve(__dirname, "..", "extensions", "bob-code-consistency-review")
const YAML = require(require.resolve("yaml", { paths: [extensionRoot] }))
const {
  loadHumanTriageWorkspace,
  saveHumanTriageDecisions
} = require(path.join(extensionRoot, "out", "triage", "humanTriageWorkspace.js"))

const EXTENSION_ID = "local.bob-code-consistency-review"
const BOB_OUTPUT_PATH = ".bob-review/bob-output/bob-output.yaml"
const TRIAGE_PATH = ".bob-review/human-triage"
const REVIEW_PACKAGE_PATH = ".bob-review/review-package"
const HUMAN_TRIAGE_TAB_LABEL = "整合プレレビュー"
const HUMAN_TRIAGE_VIEW_TYPE = "bobCodeConsistencyReviewWizard"
const TAB_STATE_TIMEOUT_MS = 5_000
const TAB_STATE_POLL_INTERVAL_MS = 50
const temporaryRoots = []

describe("Human Triage operator Extension Host flows", function () {
  this.timeout(30_000)

  before(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(extension, `Extension Host did not discover ${EXTENSION_ID}`)
    await extension.activate()
    assert.equal(extension.isActive, true)
  })

  after(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors").then(undefined, () => undefined)
    for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true })
    const operatorRoot = operatorWorkspaceRoot()
    fs.rmSync(path.join(operatorRoot, ".bob-review"), { recursive: true, force: true })
  })

  it("persists decisions across reloads and rejects stale source and revision tokens", async () => {
    const workspaceRoot = createTemporaryWorkspace("operator-flow")
    writeBobOutput(workspaceRoot, { reviewId: "operator-flow", variant: "initial" })

    const generated = await executeTriage(workspaceRoot)
    assert.equal(generated.status, "ok", JSON.stringify(generated))

    const initial = await loadHumanTriageWorkspace({ workspaceRoot, outDir: TRIAGE_PATH })
    assert.equal(initial.decisionRevision, 0)
    assert.equal(initial.items.find((item) => item.source_id === "PRE-001")?.decision, undefined)

    const saved = await saveHumanTriageDecisions({
      workspaceRoot,
      outDir: TRIAGE_PATH,
      expectedSourceSha256: initial.sourceSha256,
      expectedDecisionRevision: initial.decisionRevision,
      items: [acceptedPatch("confirmed during operator flow")]
    })
    assert.equal(saved.decisionRevision, 1)

    const reopened = await loadHumanTriageWorkspace({ workspaceRoot, outDir: TRIAGE_PATH })
    const reopenedFinding = reopened.items.find((item) => item.source_id === "PRE-001")
    assert.equal(reopenedFinding?.decision, "accepted")
    assert.equal(reopenedFinding?.owner, "operator-owner")
    assert.match(readTriageFile(workspaceRoot, "accepted-findings.md"), /PRE-001/)

    const staleSourceToken = {
      sourceSha256: reopened.sourceSha256,
      decisionRevision: reopened.decisionRevision
    }
    writeBobOutput(workspaceRoot, { reviewId: "operator-flow", variant: "regenerated" })
    const regenerated = await executeTriage(workspaceRoot)
    assert.equal(regenerated.status, "ok", JSON.stringify(regenerated))

    await assert.rejects(
      saveHumanTriageDecisions({
        workspaceRoot,
        outDir: TRIAGE_PATH,
        expectedSourceSha256: staleSourceToken.sourceSha256,
        expectedDecisionRevision: staleSourceToken.decisionRevision,
        items: [acceptedPatch("stale source must not save")]
      }),
      /TRIAGE_SOURCE_CHANGED/
    )

    const current = await loadHumanTriageWorkspace({ workspaceRoot, outDir: TRIAGE_PATH })
    const updated = await saveHumanTriageDecisions({
      workspaceRoot,
      outDir: TRIAGE_PATH,
      expectedSourceSha256: current.sourceSha256,
      expectedDecisionRevision: current.decisionRevision,
      items: [acceptedPatch("current operator save")]
    })
    assert.equal(updated.decisionRevision, current.decisionRevision + 1)

    await assert.rejects(
      saveHumanTriageDecisions({
        workspaceRoot,
        outDir: TRIAGE_PATH,
        expectedSourceSha256: current.sourceSha256,
        expectedDecisionRevision: current.decisionRevision,
        items: [acceptedPatch("stale revision must not save")]
      }),
      /TRIAGE_REVISION_CONFLICT/
    )
  })

  it("migrates matching legacy decisions and records unmatched source IDs", async () => {
    const workspaceRoot = createTemporaryWorkspace("legacy-migration")
    writeBobOutput(workspaceRoot, { reviewId: "legacy-migration", variant: "legacy" })
    const triageDir = path.join(workspaceRoot, TRIAGE_PATH)
    fs.mkdirSync(triageDir, { recursive: true })
    fs.writeFileSync(path.join(triageDir, "triage-result.yaml"), YAML.stringify({
      schema_version: 1,
      review_id: "legacy-migration",
      triaged_by: "legacy-operator",
      triaged_at: "2026-07-12T13:00:00.000Z",
      items: [
        {
          source_id: "PRE-001",
          source_type: "finding",
          decision: "accepted",
          final_severity: "high",
          owner: "legacy-owner",
          reason: "legacy decision retained",
          review_comment: "legacy review comment",
          follow_up: { required: true, action: "legacy follow-up", due: "2026-07-20" }
        },
        {
          source_id: "OLD-999",
          source_type: "finding",
          decision: "rejected",
          reason: "no longer present"
        }
      ]
    }), "utf8")

    const migrated = await executeTriage(workspaceRoot)
    assert.equal(migrated.status, "ok", JSON.stringify(migrated))

    const decisions = YAML.parse(readTriageFile(workspaceRoot, "triage-decisions.yaml"))
    assert.equal(decisions.decision_revision, 1)
    assert.equal(decisions.triaged_by, "legacy-operator")
    assert.equal(decisions.items["PRE-001"].decision, "accepted")
    assert.equal(decisions.items["PRE-001"].follow_up.action, "legacy follow-up")
    assert.equal(decisions.items["OLD-999"], undefined)
    assert.match(readTriageFile(workspaceRoot, "migration-report.md"), /OLD-999/)
    assert.match(readTriageFile(workspaceRoot, "accepted-findings.md"), /PRE-001/)
    assert.ok(fs.readdirSync(triageDir).some((name) => name.startsWith("triage-result.yaml.bak-")))
  })

  it("opens and reopens the Human Triage Webview without an unhandled rejection", async () => {
    const workspaceRoot = operatorWorkspaceRoot()
    fs.rmSync(path.join(workspaceRoot, ".bob-review"), { recursive: true, force: true })
    writeBobOutput(workspaceRoot, { reviewId: "webview-reopen", variant: "webview" })
    const generated = await executeTriage(workspaceRoot)
    assert.equal(generated.status, "ok", JSON.stringify(generated))

    const initial = await loadHumanTriageWorkspace({ workspaceRoot, outDir: TRIAGE_PATH })
    await saveHumanTriageDecisions({
      workspaceRoot,
      outDir: TRIAGE_PATH,
      expectedSourceSha256: initial.sourceSha256,
      expectedDecisionRevision: initial.decisionRevision,
      items: [acceptedPatch("persisted before Webview reopen")]
    })

    const unhandled = []
    const onUnhandled = (reason) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)
    try {
      await openAndCloseHumanTriage()
      await openAndCloseHumanTriage()
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }

    assert.deepEqual(unhandled.map(errorText), [])
    const reopened = await loadHumanTriageWorkspace({ workspaceRoot, outDir: TRIAGE_PATH })
    assert.equal(reopened.items.find((item) => item.source_id === "PRE-001")?.decision, "accepted")
  })
})

async function executeTriage(workspaceRoot) {
  return vscode.commands.executeCommand("bobCodeConsistency.triage", {
    workspaceRoot,
    bobOutputPath: BOB_OUTPUT_PATH,
    triagePath: TRIAGE_PATH,
    reviewPackagePath: REVIEW_PACKAGE_PATH
  })
}

async function openAndCloseHumanTriage() {
  const readinessUri = vscode.Uri.file(path.join(operatorWorkspaceRoot(), "README.md"))
  const readinessDocument = await vscode.workspace.openTextDocument(readinessUri)
  assert.equal(readinessDocument.isUntitled, false, "workbench readiness must use the fixture README")
  assert.equal(readinessDocument.isDirty, false, "workbench readiness must not dirty the fixture README")
  await vscode.window.showTextDocument(readinessDocument, {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
    preserveFocus: false
  })
  await waitForTabSelection(
    () => vscode.window.tabGroups.all.length > 0 ? findTabForUri(readinessUri) : undefined,
    "the fixture README editor to materialize the editor workbench"
  )
  assert.ok(vscode.window.tabGroups.all.length > 0, "editor workbench must expose at least one tab group")

  await vscode.commands.executeCommand("bobCodeConsistency.openReviewWizard", { initialStage: "triage" })
  const targetTab = await waitForTabSelection(
    () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab
      return isHumanTriageWebviewTab(activeTab) ? activeTab : undefined
    },
    `active Webview tab ${JSON.stringify(HUMAN_TRIAGE_TAB_LABEL)} to appear`
  )
  const closed = await vscode.window.tabGroups.close(targetTab)
  assert.equal(closed, true, `failed to close Webview tab ${JSON.stringify(HUMAN_TRIAGE_TAB_LABEL)}`)
  await waitForTabSelection(
    () => {
      const remainingTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs)
      const targetIsOpen = remainingTabs.some((tab) => tab === targetTab || isHumanTriageWebviewTab(tab))
      return targetIsOpen ? undefined : findTabForUri(readinessUri)
    },
    `Webview tab ${JSON.stringify(HUMAN_TRIAGE_TAB_LABEL)} to disappear while the fixture README remains open`
  )
}

function isHumanTriageWebviewTab(tab) {
  const viewType = tab?.input?.viewType
  return tab?.label === HUMAN_TRIAGE_TAB_LABEL &&
    (viewType === HUMAN_TRIAGE_VIEW_TYPE || viewType === `mainThreadWebview-${HUMAN_TRIAGE_VIEW_TYPE}`)
}

function findTabForUri(uri) {
  const expected = uri.toString()
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => tab.input?.uri?.toString() === expected)
}

async function waitForTabSelection(selectTab, description) {
  const deadline = Date.now() + TAB_STATE_TIMEOUT_MS
  while (true) {
    const selectedTab = selectTab()
    if (selectedTab !== undefined) return selectedTab

    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(
        `Timed out after ${TAB_STATE_TIMEOUT_MS}ms waiting for ${description}; ${describeTabState()}`
      )
    }
    await delay(Math.min(TAB_STATE_POLL_INTERVAL_MS, remaining))
  }
}

function describeTabState() {
  const groups = vscode.window.tabGroups.all
  const activeLabel = vscode.window.tabGroups.activeTabGroup.activeTab?.label
  const visibleLabels = groups
    .map((group) => group.activeTab?.label)
    .filter((label) => typeof label === "string")
  const openLabels = groups.flatMap((group) => group.tabs.map((tab) => tab.label))
  const openInputs = groups.flatMap((group) => group.tabs.map((tab) => ({
    label: tab.label,
    inputType: tab.input?.constructor?.name ?? null,
    viewType: tab.input?.viewType ?? null
  })))
  return `active=${JSON.stringify(activeLabel ?? null)}, visible=${JSON.stringify(visibleLabels)}, open=${JSON.stringify(openLabels)}, inputs=${JSON.stringify(openInputs)}`
}

function createTemporaryWorkspace(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bob-triage-${label}-`))
  temporaryRoots.push(root)
  return root
}

function operatorWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders ?? []
  assert.equal(folders.length, 1, "triage operator smoke must open exactly one workspace folder")
  assert.equal(path.basename(folders[0].uri.fsPath), "triage-operator-workspace")
  return folders[0].uri.fsPath
}

function writeBobOutput(workspaceRoot, input) {
  const outputPath = path.join(workspaceRoot, BOB_OUTPUT_PATH)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, YAML.stringify({
    schema_version: 1,
    review_summary: {
      review_id: input.reviewId,
      package_id: `package-${input.variant}`,
      target_range: "base..head",
      result_type: "pre_review",
      final_approval: "not_performed",
      scope_statement: `operator fixture ${input.variant}`
    },
    findings: [
      {
        id: "PRE-001",
        category: "risk",
        severity: "high",
        confidence: "medium",
        summary: `timeout behavior ${input.variant}`,
        evidence: [{ evidence_id: "SRC-0001", type: "code", ref: "src/a.ts:1-5" }],
        reason: "changed behavior differs from the expected flow",
        impact: "the caller may receive the wrong result",
        recommended_action: "confirm and correct the timeout branch",
        human_check: "review the requirement with the design owner"
      }
    ],
    questions: [
      {
        id: "Q-001",
        category: "owner-decision",
        summary: "confirm whether timeout is in scope",
        reason: "the ticket is ambiguous",
        evidence: [{ evidence_id: "TICKET-0001", type: "ticket", ref: "ISSUE-1" }],
        suggested_owner: "design-owner",
        suggested_action: "ask the design owner"
      }
    ],
    coverage_notes: [],
    rejected_or_uncertain: []
  }), "utf8")
}

function acceptedPatch(reason) {
  return {
    source_id: "PRE-001",
    decision: "accepted",
    final_severity: "high",
    owner: "operator-owner",
    reason,
    review_comment: "send to formal review",
    follow_up: {
      required: true,
      action: "fix implementation",
      due: "2026-07-20"
    }
  }
}

function readTriageFile(workspaceRoot, fileName) {
  return fs.readFileSync(path.join(workspaceRoot, TRIAGE_PATH, fileName), "utf8")
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function errorText(value) {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value)
}
