const assert = require("node:assert/strict")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")

const {
  parseAndValidateRuleProposal
} = require("../out/ruleAuthoring/ruleProposalValidation")
const {
  RULE_PROPOSAL_V1_JSON_SCHEMA,
  validateRuleProposalSchema
} = require("../out/ruleAuthoring/ruleProposalSchema")
const { DEFAULT_CHECKLIST } = require("../out/projectRules/defaults")

const ONE_MIB = 1024 * 1024
const HASHES = Object.freeze({
  checklist: "a".repeat(64),
  projectContext: "b".repeat(64),
  promptAddendum: "c".repeat(64)
})
const EVIDENCE = Object.freeze([
  Object.freeze({
    source_id: `src-${"d".repeat(12)}`,
    chunk_id: `chunk-${"e".repeat(64)}`
  }),
  Object.freeze({
    source_id: `src-${"f".repeat(12)}`,
    chunk_id: `chunk-${"1".repeat(64)}`
  })
])

function validationContext(overrides = {}) {
  return {
    runId: "run-20260715-001",
    base: {
      checklistSha256: HASHES.checklist,
      projectContextSha256: HASHES.projectContext,
      promptAddendumSha256: HASHES.promptAddendum
    },
    existingRuleIds: ["PRJ-0001", "PRJ-0002"],
    existingProjectContextSectionIds: ["CTX-0001", "CTX-0002"],
    existingPromptAddendumSectionIds: ["PRM-0001", "PRM-0002"],
    selectedEvidence: EVIDENCE.map((item) => ({ ...item })),
    ...overrides
  }
}

function sourceRef(index = 0) {
  return { ...EVIDENCE[index] }
}

function rulePayload(overrides = {}) {
  return {
    category: "安全性",
    title: "境界値を確認する",
    description: "外部入力の境界値と失敗経路を確認する。",
    severity_on_fail: "error",
    applies_when: ["changed_file_matches:**/*.ts", "diff_contains:unsafeCall("],
    evidence_required: true,
    review_hint: "入力から副作用までを追跡する。",
    ...overrides
  }
}

function ruleOperation(candidateId, operation, targetRuleId, rule, overrides = {}) {
  return {
    candidate_id: candidateId,
    operation,
    target_rule_id: targetRuleId,
    rule,
    source_refs: [sourceRef()],
    confidence: "high",
    rationale: "資料に明示された規約である。",
    conflict_ids: [],
    ...overrides
  }
}

function markdownOperation(candidateId, operation, targetSectionId, heading, markdown, overrides = {}) {
  return {
    candidate_id: candidateId,
    operation,
    target_section_id: targetSectionId,
    heading,
    markdown,
    source_refs: [sourceRef()],
    confidence: "medium",
    rationale: "設計資料の背景情報を反映する。",
    conflict_ids: [],
    ...overrides
  }
}

function validProposal() {
  return {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: "run-20260715-001",
    base: {
      checklist_sha256: HASHES.checklist,
      project_context_sha256: HASHES.projectContext,
      prompt_addendum_sha256: HASHES.promptAddendum
    },
    operations: [
      ruleOperation("rule-add", "add", null, rulePayload(), { conflict_ids: ["conflict-1"] }),
      ruleOperation("rule-update", "update", "PRJ-0001", rulePayload({ severity_on_fail: "warning" })),
      ruleOperation("rule-retire", "retire", "PRJ-0002", null)
    ],
    conflicts: [{
      conflict_id: "conflict-1",
      summary: "二つの資料で適用範囲が異なる。",
      blocking: true,
      source_refs: [sourceRef(), sourceRef(1)],
      affected_candidate_ids: ["rule-add", "ctx-add"],
      alternatives: [
        {
          alternative_id: "alternative-a",
          description: "広い適用範囲を採用する。",
          source_refs: [sourceRef()]
        },
        {
          alternative_id: "alternative-b",
          description: "限定した適用範囲を採用する。",
          source_refs: [sourceRef(1)]
        }
      ]
    }],
    project_context_operations: [
      markdownOperation("ctx-add", "add", null, "責務", "状態遷移の責務を記録する。", {
        conflict_ids: ["conflict-1"]
      }),
      markdownOperation("ctx-update", "update", "CTX-0001", "更新後", "更新後の背景情報。"),
      markdownOperation("ctx-retire", "retire", "CTX-0002", null, null)
    ],
    prompt_addendum_operations: [
      markdownOperation("prm-add", "add", null, "重点観点", "境界値を重点的に確認する。"),
      markdownOperation("prm-update", "update", "PRM-0001", "更新観点", "更新された観点。"),
      markdownOperation("prm-retire", "retire", "PRM-0002", null, null)
    ]
  }
}

function validate(proposal, context = validationContext()) {
  return parseAndValidateRuleProposal(JSON.stringify(proposal), context)
}

function assertInvalid(result, code) {
  assert.equal(result.valid, false)
  assert.ok(result.issues.length > 0)
  assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues))
  assert.equal(Object.prototype.hasOwnProperty.call(result, "proposal"), false)
}

test("accepts valid add, update, and retire operations for every asset", () => {
  const proposal = validProposal()
  const context = validationContext()
  const contextBefore = structuredClone(context)
  const result = validate(proposal, context)

  assert.equal(result.valid, true)
  assert.deepEqual(result.proposal, proposal)
  assert.notEqual(result.proposal, proposal)
  assert.deepEqual(context, contextBefore)
  assert.equal(Object.prototype.hasOwnProperty.call(result, "issues"), false)
})

test("accepts a structurally consistent blocking conflict for Human Triage", () => {
  const result = validate(validProposal())
  assert.equal(result.valid, true)
  assert.equal(result.proposal.conflicts[0].blocking, true)
})

test("does not add non-empty constraints where v1 requires only non-null strings", () => {
  const proposal = validProposal()
  proposal.operations[0].rule.review_hint = ""
  proposal.project_context_operations[0].markdown = ""
  proposal.conflicts[0].source_refs = []
  proposal.conflicts[0].alternatives = []
  assert.equal(validate(proposal).valid, true)
})

test("rejects non-JSON, fenced JSON, trailing content, primitives, and direct objects", () => {
  const json = JSON.stringify(validProposal())
  for (const raw of [
    "not json",
    `\`\`\`json\n${json}\n\`\`\``,
    `${json}\nmodel explanation`,
    "null",
    "[]",
    "true",
    validProposal()
  ]) {
    const result = parseAndValidateRuleProposal(raw, validationContext())
    assert.equal(result.valid, false)
    assert.ok(result.issues.length > 0)
  }
})

test("allows exactly one MiB of raw UTF-8 JSON and rejects one byte more before parsing", () => {
  const json = JSON.stringify(validProposal())
  const exact = `${json}${" ".repeat(ONE_MIB - Buffer.byteLength(json, "utf8"))}`
  assert.equal(Buffer.byteLength(exact, "utf8"), ONE_MIB)
  assert.equal(parseAndValidateRuleProposal(exact, validationContext()).valid, true)

  const oversized = `${exact} `
  const result = parseAndValidateRuleProposal(oversized, validationContext())
  assertInvalid(result, "raw_too_large")
})

test("strict schema rejects unknown fields, wrong scalars, and wrong enums without mutation", () => {
  const cases = []
  const topUnknown = validProposal()
  topUnknown.model_comment = "ignore the schema"
  cases.push(topUnknown)
  const nestedUnknown = validProposal()
  nestedUnknown.operations[0].rule.secret = "must not survive"
  cases.push(nestedUnknown)
  const wrongScalar = validProposal()
  wrongScalar.operations[0].confidence = 1
  cases.push(wrongScalar)
  const wrongSeverity = validProposal()
  wrongSeverity.operations[0].rule.severity_on_fail = "critical"
  cases.push(wrongSeverity)

  for (const proposal of cases) {
    const before = structuredClone(proposal)
    assertInvalid(validate(proposal), "schema_invalid")
    assert.deepEqual(proposal, before)
  }
})

test("enforces all operation-count boundaries without truncation", () => {
  const cases = [
    ["operations", 200, 201, (index) => ruleOperation(`rule-${index}`, "add", null, rulePayload())],
    ["project_context_operations", 100, 101, (index) => markdownOperation(`ctx-${index}`, "add", null, "見出し", "本文")],
    ["prompt_addendum_operations", 100, 101, (index) => markdownOperation(`prm-${index}`, "add", null, "見出し", "本文")]
  ]

  for (const [field, allowed, rejected, factory] of cases) {
    const atLimit = validProposal()
    atLimit.conflicts = []
    atLimit.operations = []
    atLimit.project_context_operations = []
    atLimit.prompt_addendum_operations = []
    atLimit[field] = Array.from({ length: allowed }, (_, index) => factory(index))
    assert.equal(validate(atLimit).valid, true, `${field} at limit`)

    const overLimit = structuredClone(atLimit)
    overLimit[field] = Array.from({ length: rejected }, (_, index) => factory(index))
    assertInvalid(validate(overLimit), "schema_invalid")
    assert.equal(overLimit[field].length, rejected)
  }
})

test("requires exact run and current base hashes", () => {
  const wrongRun = validProposal()
  wrongRun.run_id = "run-other"
  assertInvalid(validate(wrongRun), "run_mismatch")

  for (const field of ["checklist_sha256", "project_context_sha256", "prompt_addendum_sha256"]) {
    const stale = validProposal()
    stale.base[field] = "9".repeat(64)
    assertInvalid(validate(stale), "stale_base")
  }
})

test("candidate IDs are globally unique across all assets", () => {
  const proposal = validProposal()
  proposal.project_context_operations[1].candidate_id = proposal.operations[0].candidate_id
  assertInvalid(validate(proposal), "duplicate_candidate_id")
})

test("enforces the rule operation matrix and existing targets", () => {
  const invalidCases = [
    ["add target", (op) => { op.target_rule_id = "PRJ-0001" }],
    ["add body", (op) => { op.rule = null }],
    ["update target", (op) => { op.target_rule_id = null }],
    ["update body", (op) => { op.rule = null }],
    ["update missing", (op) => { op.target_rule_id = "PRJ-9999" }],
    ["retire target", (op) => { op.target_rule_id = null }],
    ["retire body", (op) => { op.rule = rulePayload() }],
    ["retire missing", (op) => { op.target_rule_id = "PRJ-9999" }]
  ]
  for (const [label, mutate] of invalidCases) {
    const proposal = validProposal()
    const op = label.startsWith("add")
      ? proposal.operations[0]
      : label.startsWith("update") ? proposal.operations[1] : proposal.operations[2]
    mutate(op)
    assertInvalid(validate(proposal), label.endsWith("missing") ? "missing_target" : "operation_matrix")
  }
})

test("updates and retires legacy IDs from the default checklist", () => {
  const proposal = validProposal()
  proposal.operations[1].target_rule_id = "RT-001"
  proposal.operations[2].target_rule_id = "IF-001"
  const context = validationContext({
    existingRuleIds: DEFAULT_CHECKLIST.rules.map((rule) => rule.id)
  })

  const result = validate(proposal, context)
  assert.equal(result.valid, true)
})

test("matches bounded Unicode custom rule IDs without treating them as path segments", () => {
  const proposal = validProposal()
  proposal.operations[1].target_rule_id = "規約/外部I/F #1"
  proposal.operations[2].target_rule_id = "legacy rule: two"
  const result = validate(proposal, validationContext({
    existingRuleIds: ["規約/外部I/F #1", "legacy rule: two"]
  }))
  assert.equal(result.valid, true)
})

test("enforces both managed Markdown operation matrices and target namespaces", () => {
  for (const field of ["project_context_operations", "prompt_addendum_operations"]) {
    const invalidCases = [
      [0, (op) => { op.target_section_id = field === "project_context_operations" ? "CTX-0001" : "PRM-0001" }],
      [0, (op) => { op.heading = null }],
      [0, (op) => { op.markdown = null }],
      [1, (op) => { op.target_section_id = null }],
      [1, (op) => { op.heading = null }],
      [1, (op) => { op.markdown = null }],
      [2, (op) => { op.target_section_id = null }],
      [2, (op) => { op.heading = "unexpected" }],
      [2, (op) => { op.markdown = "unexpected" }]
    ]
    for (const [index, mutate] of invalidCases) {
      const proposal = validProposal()
      mutate(proposal[field][index])
      assertInvalid(validate(proposal), "operation_matrix")
    }

    const missing = validProposal()
    missing[field][1].target_section_id = field === "project_context_operations" ? "CTX-9999" : "PRM-9999"
    assertInvalid(validate(missing), "missing_target")

    const wrongNamespace = validProposal()
    wrongNamespace[field][1].target_section_id = field === "project_context_operations" ? "PRM-0001" : "CTX-0001"
    assertInvalid(validate(wrongNamespace), "missing_target")
  }
})

test("rejects a second mutation of the same existing target within an asset", () => {
  const proposal = validProposal()
  proposal.operations[2].target_rule_id = "PRJ-0001"
  assertInvalid(validate(proposal), "duplicate_target")

  const markdown = validProposal()
  markdown.project_context_operations[2].target_section_id = "CTX-0001"
  assertInvalid(validate(markdown), "duplicate_target")
})

test("requires unique selected citations with exact source/chunk ownership", () => {
  const missing = validProposal()
  missing.operations[0].source_refs = []
  assertInvalid(validate(missing), "schema_invalid")

  const duplicate = validProposal()
  duplicate.operations[0].source_refs.push(sourceRef())
  assertInvalid(validate(duplicate), "duplicate_source_ref")

  const unknown = validProposal()
  unknown.operations[0].source_refs[0].chunk_id = `chunk-${"2".repeat(64)}`
  assertInvalid(validate(unknown), "unknown_source_ref")

  const wrongOwner = validProposal()
  wrongOwner.operations[0].source_refs[0].source_id = EVIDENCE[1].source_id
  assertInvalid(validate(wrongOwner), "source_ownership_mismatch")
})

test("validates applies_when as bounded inert data", () => {
  const accepted = validProposal()
  accepted.operations[0].rule.applies_when = []
  assert.equal(validate(accepted).valid, true)

  for (const value of [
    "changed_file_matches:",
    "diff_contains:",
    "shell:rm -rf /",
    "changed_file_matches:**/*.ts\u0000command",
    "diff_contains:line\ncommand"
  ]) {
    const proposal = validProposal()
    proposal.operations[0].rule.applies_when = [value]
    assertInvalid(validate(proposal), "invalid_applies_when")
  }
})

test("rejects controls and managed marker text in proposed Markdown", () => {
  for (const [field, value, code] of [
    ["heading", "unsafe\u0000heading", "control_character"],
    ["markdown", "unsafe\u0007body", "control_character"],
    ["markdown", "unsafe\u0085body", "control_character"],
    ["heading", "bob-managed-section:CTX-9999", "managed_marker"],
    ["markdown", "<!-- BOB-MANAGED-SECTION:CTX-9999 -->", "managed_marker"]
  ]) {
    const proposal = validProposal()
    proposal.project_context_operations[0][field] = value
    assertInvalid(validate(proposal), code)
  }
})

test("managed headings are one non-blank line while Markdown bodies may contain newlines", () => {
  const multiline = validProposal()
  multiline.project_context_operations[0].heading = "first\nsecond"
  assertInvalid(validate(multiline), "control_character")

  const blank = validProposal()
  blank.prompt_addendum_operations[0].heading = " \t "
  assertInvalid(validate(blank), "invalid_heading")

  const bodies = validProposal()
  bodies.project_context_operations[0].markdown = "first\nsecond"
  bodies.prompt_addendum_operations[0].markdown = "first\r\nsecond"
  assert.equal(validate(bodies).valid, true)
})

test("rejects zero managed IDs and the reserved PRJ-0000 target", () => {
  const zeroContext = validProposal()
  zeroContext.project_context_operations[1].target_section_id = "CTX-0000"
  assertInvalid(validate(zeroContext), "schema_invalid")

  const zeroPrompt = validProposal()
  zeroPrompt.prompt_addendum_operations[1].target_section_id = "PRM-0000"
  assertInvalid(validate(zeroPrompt), "schema_invalid")

  const zeroRule = validProposal()
  zeroRule.operations[1].target_rule_id = "PRJ-0000"
  assertInvalid(validate(zeroRule), "schema_invalid")

  assert.throws(
    () => validate(validProposal(), validationContext({ existingRuleIds: ["PRJ-0000"] })),
    /context/i
  )
})

test("rejects inconsistent and duplicate conflict graph references", () => {
  const cases = [
    ["duplicate_conflict_id", (proposal) => proposal.conflicts.push(structuredClone(proposal.conflicts[0]))],
    ["duplicate_conflict_ref", (proposal) => proposal.operations[0].conflict_ids.push("conflict-1")],
    ["unknown_conflict", (proposal) => proposal.operations[0].conflict_ids[0] = "conflict-missing"],
    ["duplicate_candidate_ref", (proposal) => proposal.conflicts[0].affected_candidate_ids.push("rule-add")],
    ["unknown_candidate", (proposal) => proposal.conflicts[0].affected_candidate_ids[0] = "candidate-missing"],
    ["conflict_graph_mismatch", (proposal) => proposal.conflicts[0].affected_candidate_ids.pop()],
    ["conflict_graph_mismatch", (proposal) => proposal.project_context_operations[0].conflict_ids = []],
    ["duplicate_alternative_id", (proposal) => {
      proposal.conflicts[0].alternatives[1].alternative_id = "alternative-a"
    }],
    ["duplicate_source_ref", (proposal) => proposal.conflicts[0].alternatives[0].source_refs.push(sourceRef())]
  ]

  for (const [code, mutate] of cases) {
    const proposal = validProposal()
    mutate(proposal)
    assertInvalid(validate(proposal), code)
  }
})

test("diagnostics are normalized, bounded, and do not echo hostile proposal text", () => {
  const proposal = validProposal()
  proposal.operations = Array.from({ length: 200 }, (_, index) => ruleOperation(
    `candidate-${index}`,
    "update",
    "PRJ-9999",
    rulePayload({
      description: `/home/alice/private/${index}/secret`,
      review_hint: `password=do-not-echo-${index}`
    }),
    { rationale: `API_KEY=do-not-echo-${index}` }
  ))
  proposal.conflicts = []
  proposal.project_context_operations = []
  proposal.prompt_addendum_operations = []

  const result = validate(proposal)
  assert.equal(result.valid, false)
  assert.ok(result.issues.length <= 100)
  for (const issue of result.issues) {
    assert.deepEqual(Object.keys(issue).sort(), ["code", "message", "operationId", "path"].sort())
    assert.ok(issue.path.length <= 256)
    assert.ok(issue.code.length <= 64)
    assert.ok(issue.message.length <= 256)
  }
  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /home\/alice|password=|API_KEY=|do-not-echo/)
})

test("diagnostic operation IDs are structural and never echo AI candidate IDs", () => {
  const proposal = validProposal()
  proposal.operations[1].candidate_id = "API_KEY:do-not-echo"
  proposal.operations[1].target_rule_id = "missing-target"

  const result = validate(proposal)

  assertInvalid(result, "missing_target")
  assert.doesNotMatch(JSON.stringify(result), /API_KEY|do-not-echo/)
  const targetIssue = result.issues.find((issue) => issue.code === "missing_target")
  assert.equal(targetIssue.operationId, "operations:1")
})

test("the schema helper does not expose raw Ajv parameters or hostile property names", () => {
  const proposal = validProposal()
  proposal["password-/home/alice/private"] = "do-not-echo"
  const result = validateRuleProposalSchema(proposal)

  assert.equal(result.valid, false)
  assert.ok(result.errors.length <= 100)
  assert.deepEqual(Object.keys(result.errors[0]).sort(), ["instancePath", "keyword"])
  assert.doesNotMatch(JSON.stringify(result), /password|home\/alice|do-not-echo|additionalProperty/)
})

test("the exported proposal schema is deeply frozen before lazy compilation", () => {
  assert.equal(Object.isFrozen(RULE_PROPOSAL_V1_JSON_SCHEMA), true)
  assert.equal(Object.isFrozen(RULE_PROPOSAL_V1_JSON_SCHEMA.$defs.rule), true)
  assert.equal(Object.isFrozen(RULE_PROPOSAL_V1_JSON_SCHEMA.$defs.rule.properties), true)
  assert.equal(
    Reflect.set(RULE_PROPOSAL_V1_JSON_SCHEMA.$defs.rule, "additionalProperties", true),
    false
  )

  const proposal = validProposal()
  proposal.operations[0].rule.hostile_unknown = true
  assert.equal(validateRuleProposalSchema(proposal).valid, false)
})

test("schema validation fails fast for a near-limit Cartesian error payload", () => {
  const proposal = {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: "run-20260715-001",
    base: {
      checklist_sha256: HASHES.checklist,
      project_context_sha256: HASHES.projectContext,
      prompt_addendum_sha256: HASHES.promptAddendum
    },
    operations: [],
    conflicts: Array.from({ length: 200 }, (_, conflictIndex) => ({
      conflict_id: `conflict-${conflictIndex}`,
      summary: "s",
      blocking: true,
      source_refs: [],
      affected_candidate_ids: ["candidate-x"],
      alternatives: Array.from({ length: 20 }, (_, alternativeIndex) => ({
        alternative_id: `alternative-${alternativeIndex}`,
        description: "d",
        source_refs: Array(37).fill(null)
      }))
    })),
    project_context_operations: [],
    prompt_addendum_operations: []
  }
  const raw = JSON.stringify(proposal)
  assert.ok(Buffer.byteLength(raw, "utf8") > 950_000)
  assert.ok(Buffer.byteLength(raw, "utf8") < ONE_MIB)

  const schemaResult = validateRuleProposalSchema(proposal)
  assert.equal(schemaResult.valid, false)
  assert.equal(schemaResult.errors.length, 1)
  const result = parseAndValidateRuleProposal(raw, validationContext())
  assert.equal(result.valid, false)
  assert.equal(result.issues.length, 1)
})

test("programmer-invalid context throws before hostile raw proposal handling", () => {
  assert.throws(
    () => parseAndValidateRuleProposal({ hostile: true }, validationContext({
      base: {
        checklistSha256: "not-a-hash",
        projectContextSha256: HASHES.projectContext,
        promptAddendumSha256: HASHES.promptAddendum
      }
    })),
    /context/i
  )

  assert.throws(
    () => parseAndValidateRuleProposal("not JSON", validationContext({
      selectedEvidence: [sourceRef(), sourceRef()]
    })),
    /context/i
  )
})

test("Ajv loads lazily and the strict schema compiles only once", () => {
  const modulePath = path.resolve(__dirname, "..", "out", "ruleAuthoring", "ruleProposalValidation.js")
  const proposal = {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: "run-lazy-ajv",
    base: {
      checklist_sha256: HASHES.checklist,
      project_context_sha256: HASHES.projectContext,
      prompt_addendum_sha256: HASHES.promptAddendum
    },
    operations: [],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  }
  const context = validationContext({
    runId: "run-lazy-ajv",
    existingRuleIds: [],
    existingProjectContextSectionIds: [],
    existingPromptAddendumSectionIds: [],
    selectedEvidence: []
  })
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let ajvLoads = 0
    let compileCalls = 0
    Module._load = function(request, parent, isMain) {
      if (request !== "ajv") return originalLoad.call(this, request, parent, isMain)
      ajvLoads += 1
      const actual = originalLoad.call(this, request, parent, isMain)
      class CountingAjv extends actual.default {
        compile(schema) {
          compileCalls += 1
          return super.compile(schema)
        }
      }
      return { ...actual, default: CountingAjv }
    }
    const validation = require(${JSON.stringify(modulePath)})
    if (ajvLoads !== 0) throw new Error("Ajv loaded during module import")
    const raw = ${JSON.stringify(JSON.stringify(proposal))}
    const context = ${JSON.stringify(context)}
    if (!validation.parseAndValidateRuleProposal(raw, context).valid) throw new Error("first validation failed")
    if (!validation.parseAndValidateRuleProposal(raw, context).valid) throw new Error("second validation failed")
    if (ajvLoads !== 1) throw new Error("Ajv load count: " + ajvLoads)
    if (compileCalls !== 1) throw new Error("Ajv compile count: " + compileCalls)
  `
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: 10_000
  })
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})
