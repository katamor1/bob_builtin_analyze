"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

test("preprocessing rechecks cancellation after final ledger work and before success", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "pipeline.ts"),
    "utf8"
  )

  const finalLedger = source.indexOf("const finalLedger = await updateArtifactLedger(")
  const finalLedgerEnd = source.indexOf("\n    })", finalLedger)
  const finalCancellation = source.indexOf("cancellation.throwIfCancelled()", finalLedgerEnd)
  const warnings = source.indexOf("const warnings =", finalLedgerEnd)
  const success = source.indexOf("status: \"ok\"", warnings)

  assert.ok(finalLedger >= 0)
  assert.ok(finalLedgerEnd > finalLedger)
  assert.ok(finalCancellation > finalLedgerEnd)
  assert.ok(warnings > finalCancellation)
  assert.ok(success > warnings)
})
