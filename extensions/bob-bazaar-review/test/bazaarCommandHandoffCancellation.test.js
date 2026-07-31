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
  assert.ok(processing >= 0, `${label} must run the processing boundary`)
  assert.ok(cancellation > processing, `${label} must recheck cancellation after processing`)
  assert.ok(handoff > cancellation, `${label} must not offer Bob handoff before the cancellation check`)
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
