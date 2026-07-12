const assert = require("node:assert/strict")
const { test } = require("node:test")

const { summarizeTriageItems, validateTriage } = require("../out/records/reviewTriage")

function makeTriage(item) {
  const items = [{ finding_id: "F-1", rule_id: "RULE-1", ...item }]
  return {
    schema_version: "bazaar-review-triage/v1",
    review_id: "review-1",
    items,
    summary: summarizeTriageItems(items)
  }
}

const reviewResult = {
  review_id: "review-1",
  findings: [{ id: "F-1", rule_id: "RULE-1" }],
  checklist_results: []
}

test("accepted triage requires owner or action", () => {
  assert.match(validateTriage(makeTriage({ decision: "accepted" }), reviewResult).join("\n"), /owner or action is required/)
  assert.deepEqual(validateTriage(makeTriage({ decision: "accepted", owner: "team-a" }), reviewResult), [])
  assert.deepEqual(validateTriage(makeTriage({ decision: "accepted", action: "merge" }), reviewResult), [])
})

test("rejected triage requires a reason", () => {
  assert.match(validateTriage(makeTriage({ decision: "rejected" }), reviewResult).join("\n"), /reason is required when decision is rejected/)
  assert.deepEqual(validateTriage(makeTriage({ decision: "rejected", reason: "false positive" }), reviewResult), [])
})

test("needs_investigation triage requires owner and action", () => {
  assert.match(validateTriage(makeTriage({ decision: "needs_investigation", action: "inspect" }), reviewResult).join("\n"), /owner is required/)
  assert.match(validateTriage(makeTriage({ decision: "needs_investigation", owner: "team-a" }), reviewResult).join("\n"), /action is required/)
  assert.deepEqual(validateTriage(makeTriage({ decision: "needs_investigation", owner: "team-a", action: "inspect" }), reviewResult), [])
})

test("deferred triage requires a reason", () => {
  assert.match(validateTriage(makeTriage({ decision: "deferred" }), reviewResult).join("\n"), /reason is required when decision is deferred/)
  assert.deepEqual(validateTriage(makeTriage({ decision: "deferred", reason: "next release" }), reviewResult), [])
})
