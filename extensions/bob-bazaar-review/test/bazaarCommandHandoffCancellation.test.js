"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

function functionSlice(source, functionName, nextFunctionName) {
  const start = source.indexOf(`export async function ${functionName}(`)
  const end = nextFunctionName
    ? source.indexOf(`export async function ${nextFunctionName}(`, start + 1)
    : source.length
  assert.ok(start >= 0, `${functionName} must exist`)
  assert.ok(end > start, `${functionName} slice must be bounded`)
  return source.slice(start, end)
}

function assertCancellationBeforeHandoff(source, label) {
  const processing = source.indexOf("const result = await runBazaarReviewProcessingOperation(")
  const cancellation = source.indexOf("throwIfReviewCancelled(signal)", processing)
  const handoff = source.indexOf("await showAndOfferBobContext(", cancellation)
  const signalArgument = source.indexOf("signal", handoff)
  assert.ok(processing >= 0, `${label} must run the processing boundary`)
  assert.ok(cancellation > processing, `${label} must recheck cancellation after processing`)
  assert.ok(handoff > cancellation, `${label} must not offer Bob handoff before the cancellation check`)
  assert.ok(signalArgument > handoff, `${label} must pass the cancellation signal into the handoff helper`)
}

test("both command-palette Bazaar review flows recheck cancellation before Bob handoff", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "bazaar", "bazaarReviewCommands.ts"),
    "utf8"
  )

  assertCancellationBeforeHandoff(
    functionSlice(source, "reviewRevision", "reviewRange"),
    "single-revision review"
  )
  assertCancellationBeforeHandoff(
    functionSlice(source, "reviewRange", undefined),
    "revision-range review"
  )
  assert.match(source, /function throwIfReviewCancelled\(signal: AbortSignal\): void/)
})

test("handoff helper rechecks cancellation after every awaited user boundary", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "bazaar", "bazaarReviewCommands.ts"),
    "utf8"
  )
  const start = source.indexOf("async function showAndOfferBobContext(")
  const end = source.indexOf("async function addPacketToBobContext(", start)
  assert.ok(start >= 0 && end > start)
  const helper = source.slice(start, end)

  assert.match(helper, /filename: string, signal: AbortSignal/)
  const firstGate = helper.indexOf("throwIfReviewCancelled(signal)")
  const openDocument = helper.indexOf("const document = await vscode.workspace.openTextDocument")
  assert.ok(firstGate >= 0 && firstGate < openDocument)

  const postOpenGate = helper.indexOf("throwIfReviewCancelled(signal)", firstGate + 1)
  const showDocument = helper.indexOf("const editor = await vscode.window.showTextDocument")
  assert.ok(postOpenGate > openDocument && postOpenGate < showDocument)

  const postShowGate = helper.indexOf("throwIfReviewCancelled(signal)", postOpenGate + 1)
  const directHandoff = helper.indexOf("await addPacketToBobContext(editor.document.uri, packet)", postShowGate)
  assert.ok(postShowGate > showDocument)
  assert.ok(directHandoff > postShowGate)

  const actionPrompt = helper.indexOf("const action = await vscode.window.showInformationMessage")
  const postActionGate = helper.indexOf("throwIfReviewCancelled(signal)", postShowGate + 1)
  const actionBranch = helper.indexOf('if (action === "Bob コンテキストへ追加")', postActionGate)
  assert.ok(postActionGate > actionPrompt)
  assert.ok(actionBranch > postActionGate)

  const saveDialog = helper.indexOf("const target = await vscode.window.showSaveDialog")
  const postSaveGate = helper.indexOf("throwIfReviewCancelled(signal)", postActionGate + 1)
  const directoryCreate = helper.indexOf("await vscode.workspace.fs.createDirectory", postSaveGate)
  assert.ok(postSaveGate > saveDialog)
  assert.ok(directoryCreate > postSaveGate)

  const postDirectoryGate = helper.indexOf("throwIfReviewCancelled(signal)", postSaveGate + 1)
  const fileWrite = helper.indexOf("await vscode.workspace.fs.writeFile", postDirectoryGate)
  assert.ok(postDirectoryGate > directoryCreate)
  assert.ok(fileWrite > postDirectoryGate)
})
