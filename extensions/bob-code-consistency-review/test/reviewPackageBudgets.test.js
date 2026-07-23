"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  reserveManagedArtifactBytes,
  reserveMandatoryFirstBobInput
} = require("../out/core/reviewPackageBudgets")
const {
  PROCESSING_BUDGET_ABSOLUTE_MAXIMA,
  ProcessingBudgetLedger
} = require("../out/sharedProcessingBudgetRuntime")

const MiB = 1024 * 1024

function category(ledger, name) {
  return ledger.snapshot().categories.find((entry) => entry.category === name)
}

function bobOnlyProfile(limit) {
  return {
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      raw_diff_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: limit,
      total_operation_input_bytes: limit
    }
  }
}

test("preserves mandatory template values and only truncates optional markdown", () => {
  const ledger = new ProcessingBudgetLedger(bobOnlyProfile(120))
  const result = reserveMandatoryFirstBobInput({
    ledger,
    maximumBytes: 120,
    template: "BEGIN\n{{mandatory}}\nOPTIONAL\n{{optional}}\nEND\n",
    values: {
      mandatory: "must survive",
      optional: "line one\nline two\nline three\n".repeat(10)
    },
    mandatoryKeys: ["mandatory"]
  })

  assert.match(result.text, /must survive/)
  assert.match(result.text, /END\n$/)
  assert.match(result.text, /\[truncated: bob_input_bytes\]/)
  assert.ok(Buffer.byteLength(result.text, "utf8") <= 120)
  assert.equal(result.truncated, true)
  result.reservation.commit()
  assert.equal(category(ledger, "bob_input_bytes").committed, Buffer.byteLength(result.text, "utf8"))
})

test("rejects mandatory review metadata instead of truncating it", () => {
  const ledger = new ProcessingBudgetLedger(bobOnlyProfile(64))
  const before = ledger.snapshot()

  assert.throws(
    () => reserveMandatoryFirstBobInput({
      ledger,
      maximumBytes: 64,
      template: "META={{review.summary}}\n{{optional}}",
      values: {
        "review.summary": "x".repeat(80),
        optional: ""
      },
      mandatoryKeys: ["review.summary"]
    }),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "bob_input_bytes"
      && error.details?.limit === 64
  )
  assert.deepEqual(ledger.snapshot(), before)
})

test("enforces default and absolute Bob-input exact and plus-one boundaries", () => {
  for (const [profile, limit] of [
    [undefined, 2 * MiB],
    [{ limits: PROCESSING_BUDGET_ABSOLUTE_MAXIMA }, 8 * MiB]
  ]) {
    const exactLedger = new ProcessingBudgetLedger(profile)
    const exact = reserveMandatoryFirstBobInput({
      ledger: exactLedger,
      maximumBytes: limit,
      template: "{{mandatory}}",
      values: { mandatory: "x".repeat(limit) },
      mandatoryKeys: ["mandatory"]
    })
    assert.equal(Buffer.byteLength(exact.text, "utf8"), limit)
    exact.reservation.commit()

    const overLedger = new ProcessingBudgetLedger(profile)
    assert.throws(
      () => reserveMandatoryFirstBobInput({
        ledger: overLedger,
        maximumBytes: limit,
        template: "{{mandatory}}",
        values: { mandatory: "x".repeat(limit + 1) },
        mandatoryKeys: ["mandatory"]
      }),
      (error) => error?.code === "processing_budget_exceeded"
        && error.details?.constrainedCategory === "bob_input_bytes"
        && error.details?.limit === limit
        && error.details?.observed === limit + 1
    )
  }
})

test("fails Bob-input reservation when other inputs exhaust the total operation budget", () => {
  const ledger = new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      document_excerpt_bytes: 0,
      raw_diff_bytes: 100,
      bob_input_bytes: 100,
      total_operation_input_bytes: 100
    }
  })
  ledger.reserve("raw_diff_bytes", 60).commit()

  assert.throws(
    () => reserveMandatoryFirstBobInput({
      ledger,
      maximumBytes: 100,
      template: "{{mandatory}}",
      values: { mandatory: "x".repeat(50) },
      mandatoryKeys: ["mandatory"]
    }),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "total_operation_input_bytes"
      && error.details?.limit === 100
      && error.details?.observed === 110
  )
})

test("enforces default and absolute managed-artifact exact and plus-one boundaries", () => {
  for (const [profile, limit] of [
    [undefined, 16 * MiB],
    [{ limits: PROCESSING_BUDGET_ABSOLUTE_MAXIMA }, 64 * MiB]
  ]) {
    const exactLedger = new ProcessingBudgetLedger(profile)
    const exact = reserveManagedArtifactBytes(exactLedger, limit)
    exact.commit()
    assert.equal(category(exactLedger, "managed_artifact_bytes").committed, limit)

    const overLedger = new ProcessingBudgetLedger(profile)
    assert.throws(
      () => reserveManagedArtifactBytes(overLedger, limit + 1),
      (error) => error?.code === "processing_budget_exceeded"
        && error.details?.constrainedCategory === "managed_artifact_bytes"
        && error.details?.limit === limit
        && error.details?.observed === limit + 1
    )
  }
})
