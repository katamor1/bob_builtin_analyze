#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vscode = require("vscode")

const TAB_TIMEOUT_MS = 10_000
const TAB_POLL_INTERVAL_MS = 50

describe("Consolidated extension operator surfaces", function () {
  this.timeout(60_000)

  before(async () => {
    const extensionId = requiredEnvironmentValue("SMOKE_EXTENSION_ID")
    const extension = vscode.extensions.getExtension(extensionId)
    assert.ok(extension, `Extension Host did not discover ${extensionId}`)
    await extension.activate()
    assert.equal(extension.isActive, true, `${extensionId} did not activate`)
    assert.equal(vscode.workspace.workspaceFolders?.length ?? 0, 1, "surface smoke requires exactly one workspace folder")
  })

  after(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors").then(undefined, () => undefined)
  })

  it("registers the configured public and hidden workflow commands", async () => {
    const publicCommands = requiredEnvironmentList("SURFACE_PUBLIC_COMMANDS")
    const hiddenCommands = requiredEnvironmentList("SURFACE_HIDDEN_COMMANDS")
    const overlap = publicCommands.filter((command) => hiddenCommands.includes(command))
    assert.deepEqual(overlap, [], "public and hidden command expectations must not overlap")

    const registered = new Set(await vscode.commands.getCommands(true))
    for (const command of [...publicCommands, ...hiddenCommands]) {
      assert.ok(registered.has(command), `Extension Host did not register ${command}`)
    }
  })

  it("opens every configured primary panel with the canonical view type and title", async () => {
    const expectations = primaryPanelExpectations()
    const readinessUri = await materializeWorkbench()
    const unhandled = []
    const onUnhandled = (reason) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)

    try {
      for (const expectation of expectations) {
        await vscode.commands.executeCommand(expectation.command)
        const targetTab = await waitForTab(
          () => findPanelTab(expectation),
          `${expectation.command} to open ${JSON.stringify(expectation.title)} (${expectation.viewType})`
        )
        const closed = await vscode.window.tabGroups.close(targetTab)
        assert.equal(closed, true, `failed to close ${expectation.command} panel`)
        await waitForTab(
          () => findPanelTab(expectation) ? undefined : findTabForUri(readinessUri),
          `${expectation.command} panel to close while the fixture README remains open`
        )
      }
      await delay(100)
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }

    assert.deepEqual(unhandled.map(errorText), [])
  })
})

function requiredEnvironmentValue(name) {
  const value = process.env[name]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required for the consolidated surface Extension Host test`)
  }
  return value.trim()
}

function requiredEnvironmentList(name) {
  const values = requiredEnvironmentValue(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.length === 0) throw new Error(`${name} must include at least one value`)
  if (new Set(values).size !== values.length) throw new Error(`${name} contains duplicate values`)
  return values
}

function primaryPanelExpectations() {
  return requiredEnvironmentValue("SURFACE_PRIMARY_PANELS")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const fields = entry.split("|").map((field) => field.trim())
      if (fields.length !== 3 || fields.some((field) => field.length === 0)) {
        throw new Error(`Invalid SURFACE_PRIMARY_PANELS entry: ${entry}`)
      }
      return { command: fields[0], viewType: fields[1], title: fields[2] }
    })
}

async function materializeWorkbench() {
  const workspace = vscode.workspace.workspaceFolders?.[0]
  assert.ok(workspace, "surface smoke workspace is not open")
  const readmePath = path.join(workspace.uri.fsPath, "README.md")
  assert.equal(fs.existsSync(readmePath), true, `surface smoke README is missing: ${readmePath}`)
  const uri = vscode.Uri.file(readmePath)
  const document = await vscode.workspace.openTextDocument(uri)
  assert.equal(document.isUntitled, false)
  assert.equal(document.isDirty, false)
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
    preserveFocus: false
  })
  await waitForTab(() => findTabForUri(uri), "the fixture README editor to materialize the workbench")
  return uri
}

function findPanelTab(expectation) {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => {
      const viewType = tab.input?.viewType
      return tab.label === expectation.title &&
        (viewType === expectation.viewType || viewType === `mainThreadWebview-${expectation.viewType}`)
    })
}

function findTabForUri(uri) {
  const expected = uri.toString()
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => tab.input?.uri?.toString() === expected)
}

async function waitForTab(selectTab, description) {
  const deadline = Date.now() + TAB_TIMEOUT_MS
  while (true) {
    const tab = selectTab()
    if (tab !== undefined) return tab
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(`Timed out after ${TAB_TIMEOUT_MS}ms waiting for ${description}; ${describeTabState()}`)
    }
    await delay(Math.min(TAB_POLL_INTERVAL_MS, remaining))
  }
}

function describeTabState() {
  const groups = vscode.window.tabGroups.all
  const activeLabel = vscode.window.tabGroups.activeTabGroup.activeTab?.label
  const openInputs = groups.flatMap((group) => group.tabs.map((tab) => ({
    label: tab.label,
    inputType: tab.input?.constructor?.name ?? null,
    viewType: tab.input?.viewType ?? null
  })))
  return `active=${JSON.stringify(activeLabel ?? null)}, inputs=${JSON.stringify(openInputs)}`
}

function errorText(value) {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
