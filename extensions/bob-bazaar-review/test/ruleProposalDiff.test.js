const assert = require("node:assert/strict")
const { test } = require("node:test")

const { diffRuleProposal } = require("../out/ruleAuthoring/ruleProposalDiff")

function rule(overrides = {}) {
  return {
    category: "security",
    title: "Validate input",
    description: "Validate input before use.",
    severity_on_fail: "error",
    applies_when: [],
    evidence_required: false,
    review_hint: "Check the boundary.",
    ...overrides
  }
}

function operation(candidateId, operationName, targetRuleId, value) {
  return {
    candidate_id: candidateId,
    operation: operationName,
    target_rule_id: targetRuleId,
    rule: value,
    source_refs: [{ source_id: "src-aaaaaaaaaaaa", chunk_id: `chunk-${"b".repeat(64)}` }],
    confidence: "high",
    rationale: "Evidence supports the proposal.",
    conflict_ids: []
  }
}

function markdownOperation(candidateId, operationName, targetSectionId, heading, markdown) {
  return {
    candidate_id: candidateId,
    operation: operationName,
    target_section_id: targetSectionId,
    heading,
    markdown,
    source_refs: [{ source_id: "src-aaaaaaaaaaaa", chunk_id: `chunk-${"b".repeat(64)}` }],
    confidence: "high",
    rationale: "Evidence supports the proposal.",
    conflict_ids: []
  }
}

function proposal(overrides = {}) {
  return {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: "run-20260714-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    base: {
      checklist_sha256: "1".repeat(64),
      project_context_sha256: "2".repeat(64),
      prompt_addendum_sha256: "3".repeat(64)
    },
    operations: [],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: [],
    ...overrides
  }
}

function currentBundle(overrides = {}) {
  return {
    checklist: {
      version: "1",
      project: "sample",
      rules: []
    },
    projectContextSections: [],
    promptAddendumSections: [],
    ...overrides
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

test("diffRuleProposal preserves proposal order and returns explicit before/after values", () => {
  const existingRule = { id: "PRJ-0002", ...rule({ title: "Existing" }) }
  const contextSection = { id: "CTX-0002", heading: "Context", markdown: "Old context" }
  const promptSection = { id: "PRM-0004", heading: "Prompt", markdown: "Old prompt" }
  const inputProposal = proposal({
    operations: [
      operation("rule-update", "update", "PRJ-0002", rule({ title: "Updated" })),
      operation("rule-add", "add", null, rule({ title: "Added" }))
    ],
    project_context_operations: [
      markdownOperation("context-update", "update", "CTX-0002", "Context", "New context"),
      markdownOperation("context-add", "add", null, "Additional", "More context")
    ],
    prompt_addendum_operations: [
      markdownOperation("prompt-retire", "retire", "PRM-0004", null, null)
    ]
  })
  const bundle = currentBundle({
    checklist: { version: "1", project: "sample", rules: [existingRule] },
    projectContextSections: [contextSection],
    promptAddendumSections: [promptSection]
  })
  const proposalSnapshot = structuredClone(inputProposal)
  const bundleSnapshot = structuredClone(bundle)

  const result = diffRuleProposal(deepFreeze(inputProposal), deepFreeze(bundle))

  assert.deepEqual(result.rules.map(({ candidateId }) => candidateId), ["rule-update", "rule-add"])
  assert.deepEqual(result.projectContext.map(({ candidateId }) => candidateId), ["context-update", "context-add"])
  assert.deepEqual(result.promptAddendum.map(({ candidateId }) => candidateId), ["prompt-retire"])
  assert.deepEqual(result.rules[0], {
    candidateId: "rule-update",
    operation: "update",
    targetId: "PRJ-0002",
    before: existingRule,
    after: rule({ title: "Updated" }),
    noOp: false
  })
  assert.deepEqual(result.rules[1], {
    candidateId: "rule-add",
    operation: "add",
    targetId: null,
    before: null,
    after: rule({ title: "Added" }),
    noOp: false
  })
  assert.deepEqual(result.projectContext[0], {
    candidateId: "context-update",
    operation: "update",
    targetId: "CTX-0002",
    before: contextSection,
    after: { heading: "Context", markdown: "New context" },
    noOp: false
  })
  assert.deepEqual(result.promptAddendum[0], {
    candidateId: "prompt-retire",
    operation: "retire",
    targetId: "PRM-0004",
    before: promptSection,
    after: null,
    noOp: false
  })
  assert.deepEqual(inputProposal, proposalSnapshot)
  assert.deepEqual(bundle, bundleSnapshot)
})

test("diffRuleProposal reports semantic no-op updates without sharing mutable values", () => {
  const existingRule = {
    id: "PRJ-0001",
    category: "security",
    title: "Validate input",
    description: "Validate input before use.",
    severity_on_fail: "error"
  }
  const contextSection = { id: "CTX-0001", heading: "Context", markdown: "Same" }
  const inputProposal = proposal({
    operations: [operation("rule-no-op", "update", "PRJ-0001", rule({ review_hint: "" }))],
    project_context_operations: [
      markdownOperation("context-no-op", "update", "CTX-0001", "Context", "Same")
    ]
  })
  const bundle = currentBundle({
    checklist: { version: "1", project: "sample", rules: [existingRule] },
    projectContextSections: [contextSection]
  })

  const result = diffRuleProposal(inputProposal, bundle)

  assert.equal(result.rules[0].noOp, true)
  assert.equal(result.projectContext[0].noOp, true)
  assert.notEqual(result.rules[0].before, existingRule)
  assert.notEqual(result.rules[0].after, inputProposal.operations[0].rule)
  assert.notEqual(result.projectContext[0].before, contextSection)

  result.rules[0].before.title = "mutated output"
  result.rules[0].after.title = "mutated output"
  result.projectContext[0].before.markdown = "mutated output"
  assert.equal(existingRule.title, "Validate input")
  assert.equal(inputProposal.operations[0].rule.title, "Validate input")
  assert.equal(contextSection.markdown, "Same")
})

test("diffRuleProposal retains exact prior values for retire operations", () => {
  const existingRule = {
    id: "PRJ-0009",
    ...rule({ applies_when: ["changed_file_matches:src/**"] }),
    project_metadata: { owner: "controls", tags: ["legacy"] }
  }
  const contextSection = {
    id: "CTX-0007",
    heading: "Legacy context",
    markdown: "Retained in diff history."
  }
  const inputProposal = proposal({
    operations: [operation("rule-retire", "retire", "PRJ-0009", null)],
    project_context_operations: [
      markdownOperation("context-retire", "retire", "CTX-0007", null, null)
    ]
  })
  const result = diffRuleProposal(inputProposal, currentBundle({
    checklist: { version: "1", project: "sample", rules: [existingRule] },
    projectContextSections: [contextSection]
  }))

  assert.deepEqual(result.rules[0].before, existingRule)
  assert.notEqual(result.rules[0].before.project_metadata, existingRule.project_metadata)
  assert.notEqual(result.rules[0].before.project_metadata.tags, existingRule.project_metadata.tags)
  assert.equal(result.rules[0].after, null)
  assert.equal(result.rules[0].noOp, false)
  assert.deepEqual(result.projectContext[0].before, contextSection)
  assert.equal(result.projectContext[0].after, null)
  assert.equal(result.projectContext[0].noOp, false)
})

test("diffRuleProposal rejects missing or duplicate current targets deterministically", () => {
  const updateProposal = proposal({
    operations: [operation("rule-update", "update", "PRJ-0001", rule())]
  })

  assert.throws(
    () => diffRuleProposal(updateProposal, currentBundle()),
    /current rule target is unavailable/i
  )
  assert.throws(
    () => diffRuleProposal(updateProposal, currentBundle({
      checklist: {
        version: "1",
        project: "sample",
        rules: [
          { id: "PRJ-0001", ...rule() },
          { id: "PRJ-0001", ...rule({ title: "Duplicate" }) }
        ]
      }
    })),
    /current rule target is ambiguous/i
  )

  const missingSections = proposal({
    project_context_operations: [
      markdownOperation("context-retire", "retire", "CTX-0001", null, null)
    ],
    prompt_addendum_operations: [
      markdownOperation("prompt-update", "update", "PRM-0001", "Heading", "Body")
    ]
  })
  assert.throws(
    () => diffRuleProposal(missingSections, currentBundle()),
    /current project context section target is unavailable/i
  )

  assert.throws(
    () => diffRuleProposal(proposal({
      prompt_addendum_operations: [
        markdownOperation("prompt-retire", "retire", "PRM-0001", null, null)
      ]
    }), currentBundle({
      promptAddendumSections: [
        { id: "PRM-0001", heading: "One", markdown: "First" },
        { id: "PRM-0001", heading: "Two", markdown: "Second" }
      ]
    })),
    /current prompt addendum section target is ambiguous/i
  )
})

test("diffRuleProposal does not call an update a no-op when unsupported current fields would be removed", () => {
  const existingRule = {
    id: "PRJ-0001",
    ...rule(),
    project_metadata: { owner: "controls" }
  }
  const result = diffRuleProposal(proposal({
    operations: [operation("rule-update", "update", "PRJ-0001", rule())]
  }), currentBundle({
    checklist: { version: "1", project: "sample", rules: [existingRule] }
  }))

  assert.equal(result.rules[0].noOp, false)
  assert.deepEqual(result.rules[0].before, existingRule)
})

test("diffRuleProposal safely preserves an own __proto__ field from checklist JSON", () => {
  const existingRule = JSON.parse(JSON.stringify({
    id: "PRJ-0001",
    ...rule(),
    project_metadata: { owner: "controls" }
  }))
  Object.defineProperty(existingRule, "__proto__", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: { polluted: "workspace data" }
  })

  const result = diffRuleProposal(proposal({
    operations: [operation("rule-retire", "retire", "PRJ-0001", null)]
  }), currentBundle({
    checklist: { version: "1", project: "sample", rules: [existingRule] }
  }))

  assert.equal(Object.hasOwn(result.rules[0].before, "__proto__"), true)
  assert.deepEqual(result.rules[0].before.__proto__, { polluted: "workspace data" })
  assert.equal(Object.getPrototypeOf(result.rules[0].before), Object.prototype)
  assert.equal({}.polluted, undefined)
})

test("diffRuleProposal does not allocate IDs or resolve conflicts", () => {
  const inputProposal = proposal({
    operations: [
      {
        ...operation("rule-add", "add", null, rule()),
        conflict_ids: ["conflict-1"]
      }
    ],
    conflicts: [{
      conflict_id: "conflict-1",
      summary: "A blocking choice remains.",
      blocking: true,
      source_refs: [{ source_id: "src-aaaaaaaaaaaa", chunk_id: `chunk-${"b".repeat(64)}` }],
      affected_candidate_ids: ["rule-add"],
      alternatives: []
    }]
  })

  const result = diffRuleProposal(inputProposal, currentBundle())

  assert.equal(result.rules[0].targetId, null)
  assert.equal(result.rules[0].after.id, undefined)
  assert.equal(result.rules[0].noOp, false)
})
