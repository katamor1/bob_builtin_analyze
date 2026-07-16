const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const { test } = require("node:test")

const { splitDocumentChunk } = require("../out/ruleAuthoring/documentChunk")
const {
  RULE_APPLY_PLAN_SCHEMA_VERSION,
  buildRuleApplyPlan
} = require("../out/ruleAuthoring/ruleApplyPlan")

const RUN_ID = "run-20260715-apply"
const REVIEWED_AT = "2026-07-15T01:02:03.000Z"
const SOURCE_HASH = "a".repeat(64)
const SOURCE_ID = `src-${SOURCE_HASH.slice(0, 12)}`

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function present(bytes) {
  return { state: "present", bytes: Buffer.from(bytes) }
}

function missing() {
  return { state: "missing" }
}

function rule(overrides = {}) {
  return {
    category: "security",
    title: "Validate input",
    description: "Validate input before use.",
    severity_on_fail: "error",
    applies_when: ["changed_file_matches:**/*.ts"],
    evidence_required: true,
    review_hint: "Trace the trust boundary.",
    ...overrides
  }
}

function ruleOperation(candidateId, operation, targetRuleId, value, overrides = {}) {
  return {
    candidate_id: candidateId,
    operation,
    target_rule_id: targetRuleId,
    rule: value,
    source_refs: [{ source_id: SOURCE_ID, chunk_id: evidenceFixture().chunk.chunk_id }],
    confidence: "high",
    rationale: "The selected evidence supports this operation.",
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
    source_refs: [{ source_id: SOURCE_ID, chunk_id: evidenceFixture().chunk.chunk_id }],
    confidence: "high",
    rationale: "The selected evidence supports this operation.",
    conflict_ids: [],
    ...overrides
  }
}

function evidenceFixture() {
  const source = {
    source_id: SOURCE_ID,
    logical_name: "rules.docx",
    media_type: "docx",
    sha256: SOURCE_HASH,
    byte_size: 123,
    extraction_status: "success",
    extractor: { id: "mammoth", version: "1.8.0" },
    warnings: []
  }
  const chunk = splitDocumentChunk({
    sourceId: SOURCE_ID,
    mediaType: "docx",
    kind: "paragraph",
    locator: { heading_path: ["Rules"], block_index: 1 },
    text: "Untrusted source body that must never be copied to an approved asset."
  }, 32 * 1024)[0]
  return {
    sourceManifest: {
      schema_version: "bob-bazaar-review/rule-sources/v1",
      generated_at: "2026-07-15T00:00:00.000Z",
      sources: [source]
    },
    selection: {
      schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
      selected_chunks: [{
        source_id: SOURCE_ID,
        chunk_id: chunk.chunk_id,
        text_sha256: chunk.text_sha256
      }]
    },
    chunks: [chunk],
    chunk
  }
}

function approvedSource(index) {
  const hash = `${index.toString(16).padStart(2, "0")}${"0".repeat(62)}`
  return {
    source_id: `src-${hash.slice(0, 12)}`,
    logical_name: `approved-${index}.docx`,
    media_type: "docx",
    sha256: hash,
    byte_size: index + 1,
    extraction_status: "success",
    extractor: { id: "mammoth", version: "1.8.0" },
    warnings: []
  }
}

function bundle(overrides = {}) {
  const checklistBytes = jsonBytes({
    version: "1",
    project: "sample",
    rules: [
      { id: "PRJ-0001", ...rule({ title: "Existing update target" }) },
      {
        id: "PRJ-0003",
        ...rule({
          title: "Existing retire target",
          description: "First retirement line.\nSecond retirement line."
        }),
        absolute_path: "/private/legacy-policy.docx"
      }
    ]
  })
  const projectContextBytes = Buffer.from([
    "Manual prefix that must remain byte-for-byte.\r\n",
    "<!-- bob-managed-section:CTX-0002 -->\r\n",
    "## Existing context\r\n",
    "\r\n",
    "Old managed context.\r\n",
    "<!-- /bob-managed-section:CTX-0002 -->\r\n",
    "Manual suffix.\r\n"
  ].join(""), "utf8")
  const promptAddendumBytes = Buffer.from("Manual prompt guidance without managed sections.\n", "utf8")
  const ruleSourcesBytes = jsonBytes({
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T00:00:00.000Z",
    sources: []
  })
  const ruleProvenanceBytes = jsonBytes({
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: "1970-01-01T00:00:00.000Z",
    rules: [],
    markdown_sections: []
  })
  return {
    checklist: present(checklistBytes),
    projectContext: present(projectContextBytes),
    promptAddendum: present(promptAddendumBytes),
    ruleSources: present(ruleSourcesBytes),
    ruleProvenance: present(ruleProvenanceBytes),
    ...overrides
  }
}

function proposalFor(currentBundle, overrides = {}) {
  const evidence = evidenceFixture()
  return {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: RUN_ID,
    base: {
      checklist_sha256: hashAssetForProposal(currentBundle.checklist),
      project_context_sha256: hashAssetForProposal(currentBundle.projectContext),
      prompt_addendum_sha256: hashAssetForProposal(currentBundle.promptAddendum)
    },
    operations: [
      ruleOperation("rule-update", "update", "PRJ-0001", rule({ title: "Proposed title" })),
      ruleOperation("rule-add", "add", null, rule({ title: "New rule" }), {
        conflict_ids: ["conflict-1"]
      }),
      ruleOperation("rule-retire", "retire", "PRJ-0003", null)
    ],
    conflicts: [{
      conflict_id: "conflict-1",
      summary: "Sources disagree.",
      blocking: true,
      source_refs: [{ source_id: SOURCE_ID, chunk_id: evidence.chunk.chunk_id }],
      affected_candidate_ids: ["rule-add"],
      alternatives: [{
        alternative_id: "alternative-a",
        description: "Use the approved interpretation.",
        source_refs: [{ source_id: SOURCE_ID, chunk_id: evidence.chunk.chunk_id }]
      }]
    }],
    project_context_operations: [
      markdownOperation("context-update", "update", "CTX-0002", "Proposed heading", "Proposed body."),
      markdownOperation("context-add", "add", null, "Additional context", "Additional body.")
    ],
    prompt_addendum_operations: [
      markdownOperation("prompt-add", "add", null, "Prompt instruction", "Inspect boundaries first.")
    ],
    ...overrides
  }
}

function decisions(overrides = {}) {
  return {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {
      "rule-update": {
        decision: "edit",
        reviewed_at: REVIEWED_AT,
        edited_rule: rule({ title: "Human-edited title", severity_on_fail: "warning" })
      },
      "rule-add": {
        decision: "accept",
        reviewed_at: REVIEWED_AT,
        conflict_resolutions: { "conflict-1": "alternative-a" }
      },
      "rule-retire": { decision: "accept", reviewed_at: REVIEWED_AT },
      "context-update": {
        decision: "edit",
        reviewed_at: REVIEWED_AT,
        edited_markdown: { heading: "Human context", markdown: "Human-approved body." }
      },
      "context-add": { decision: "accept", reviewed_at: REVIEWED_AT },
      "prompt-add": {
        decision: "reject",
        reviewed_at: REVIEWED_AT,
        reject_reason: "Not applicable."
      },
      ...overrides
    }
  }
}

function hashAssetForProposal(asset) {
  return sha256(asset.state === "present" ? asset.bytes : Buffer.alloc(0))
}

function cloneBundle(value) {
  return Object.fromEntries(Object.entries(value).map(([key, asset]) => [
    key,
    asset.state === "present"
      ? { state: "present", bytes: Buffer.from(asset.bytes) }
      : { state: "missing" }
  ]))
}

function target(plan, asset) {
  const value = plan.targets.find((candidate) => candidate.asset === asset)
  assert.ok(value, `missing ${asset} target`)
  return value
}

function parseTarget(plan, asset) {
  return JSON.parse(Buffer.from(target(plan, asset).bytes).toString("utf8"))
}

test("materializes selective decisions with stable IDs, preserved manual Markdown, and retirement history", () => {
  const current = bundle()
  const proposal = proposalFor(current)
  const overlay = decisions()
  const evidence = evidenceFixture()
  const before = {
    bundle: cloneBundle(current),
    proposal: structuredClone(proposal),
    decisions: structuredClone(overlay),
    evidence: structuredClone(evidence)
  }

  const first = buildRuleApplyPlan(current, proposal, overlay, evidence)
  const second = buildRuleApplyPlan(current, proposal, overlay, evidence)

  assert.equal(first.schema_version, RULE_APPLY_PLAN_SCHEMA_VERSION)
  assert.equal(first.run_id, RUN_ID)
  assert.deepEqual(first.targets.map(({ asset, path }) => ({ asset, path })), [
    { asset: "checklist", path: ".bob/review/checklist.json" },
    { asset: "project_context", path: ".bob/review/project-context.md" },
    { asset: "prompt_addendum", path: ".bob/review/review-prompt-addendum.md" },
    { asset: "rule_sources", path: ".bob/review/rule-sources.json" },
    { asset: "rule_provenance", path: ".bob/review/rule-provenance.json" }
  ])
  assert.deepEqual(
    first.targets.map((item) => [item.asset, item.expected_pre_image, item.post_image_sha256]),
    second.targets.map((item) => [item.asset, item.expected_pre_image, item.post_image_sha256])
  )
  for (let index = 0; index < first.targets.length; index += 1) {
    assert.deepEqual(Buffer.from(first.targets[index].bytes), Buffer.from(second.targets[index].bytes))
    assert.equal(first.targets[index].post_image_sha256, sha256(first.targets[index].bytes))
  }

  const checklist = parseTarget(first, "checklist")
  assert.deepEqual(checklist.rules.map(({ id }) => id), ["PRJ-0001", "PRJ-0004"])
  assert.equal(checklist.rules[0].title, "Human-edited title")
  assert.equal(checklist.rules[0].severity_on_fail, "warning")
  assert.equal(checklist.rules[1].title, "New rule")

  const context = Buffer.from(target(first, "project_context").bytes).toString("utf8")
  assert.ok(context.startsWith("Manual prefix that must remain byte-for-byte.\r\n"))
  assert.ok(context.includes("Manual suffix.\r\n"))
  assert.ok(context.includes("bob-managed-section:CTX-0002"))
  assert.ok(context.includes("## Human context\r\n\r\nHuman-approved body."))
  assert.ok(context.includes("bob-managed-section:CTX-0003"))
  assert.ok(context.includes("## Additional context"))

  assert.deepEqual(
    Buffer.from(target(first, "prompt_addendum").bytes),
    current.promptAddendum.bytes,
    "a rejected proposal must leave the approved bytes unchanged"
  )

  const sources = parseTarget(first, "rule_sources")
  assert.deepEqual(sources.sources.map(({ source_id }) => source_id), [SOURCE_ID])
  assert.doesNotMatch(JSON.stringify(sources), /Untrusted source body/)

  const provenance = parseTarget(first, "rule_provenance")
  assert.equal(provenance.updated_at, REVIEWED_AT)
  assert.ok(provenance.rules.some((entry) => entry.rule_id === "PRJ-0004" && entry.lifecycle === "active"))
  assert.ok(provenance.markdown_sections.some((entry) =>
    entry.asset === "project-context" && entry.section_id === "CTX-0003" && entry.lifecycle === "active"
  ))
  const retirement = provenance.rules.find((entry) => entry.rule_id === "PRJ-0003")
  assert.equal(retirement.lifecycle, "retired")
  assert.equal(retirement.first_applied_at, REVIEWED_AT)
  assert.equal(retirement.last_applied_at, REVIEWED_AT)
  assert.equal(retirement.last_run_id, RUN_ID)
  assert.deepEqual(retirement.source_refs, [{
    source_id: SOURCE_ID,
    chunk_id: evidence.chunk.chunk_id,
    locator: evidence.chunk.locator,
    text_sha256: evidence.chunk.text_sha256
  }])
  assert.equal(first.retirements[0].target_id, "PRJ-0003")
  assert.equal(first.retirements[0].previous.title, "Existing retire target")
  assert.equal(first.retirements[0].previous.description, "First retirement line.\nSecond retirement line.")
  assert.equal(first.retirements[0].previous.absolute_path, undefined)

  assert.deepEqual(current, before.bundle)
  assert.deepEqual(proposal, before.proposal)
  assert.deepEqual(overlay, before.decisions)
  assert.deepEqual(evidence, before.evidence)
})

test("represents missing pre-images explicitly for every optional approved asset", () => {
  const current = bundle({
    projectContext: missing(),
    promptAddendum: missing(),
    ruleSources: missing(),
    ruleProvenance: missing()
  })
  const proposal = proposalFor(current, {
    operations: [],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const plan = buildRuleApplyPlan(current, proposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {}
  }, evidenceFixture())

  assert.equal(target(plan, "checklist").expected_pre_image.state, "present")
  for (const asset of ["project_context", "prompt_addendum", "rule_sources", "rule_provenance"]) {
    assert.deepEqual(target(plan, asset).expected_pre_image, { state: "missing" })
    assert.notEqual(target(plan, asset).post_image_sha256, "")
  }
})

test("preserves first-applied provenance and the current timestamp when no decision is applied", () => {
  const evidence = evidenceFixture()
  const firstAppliedAt = "2026-07-01T00:00:00.000Z"
  const lastAppliedAt = "2026-07-10T00:00:00.000Z"
  const priorProvenance = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: lastAppliedAt,
    rules: [{
      rule_id: "PRJ-0001",
      lifecycle: "active",
      source_refs: [{
        source_id: SOURCE_ID,
        chunk_id: evidence.chunk.chunk_id,
        locator: evidence.chunk.locator,
        text_sha256: evidence.chunk.text_sha256
      }],
      first_applied_at: firstAppliedAt,
      last_applied_at: lastAppliedAt,
      last_run_id: "run-prior"
    }],
    markdown_sections: []
  }
  const current = bundle({
    ruleSources: present(jsonBytes(evidence.sourceManifest)),
    ruleProvenance: present(jsonBytes(priorProvenance))
  })
  const updateProposal = proposalFor(current, {
    operations: [ruleOperation("rule-update", "update", "PRJ-0001", rule({ title: "Updated again" }))],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const updated = buildRuleApplyPlan(current, updateProposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: { "rule-update": { decision: "accept", reviewed_at: REVIEWED_AT } }
  }, evidence)
  const updatedProvenance = parseTarget(updated, "rule_provenance")
  assert.equal(updatedProvenance.updated_at, REVIEWED_AT)
  assert.equal(updatedProvenance.rules[0].first_applied_at, firstAppliedAt)
  assert.equal(updatedProvenance.rules[0].last_applied_at, REVIEWED_AT)

  const noOpProposal = proposalFor(current, {
    operations: [],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const unchanged = buildRuleApplyPlan(current, noOpProposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {}
  }, evidence)
  assert.equal(parseTarget(unchanged, "rule_provenance").updated_at, lastAppliedAt)
})

test("blocks accepted candidates whose blocking conflict has no validated resolution", () => {
  const current = bundle()
  const overlay = decisions({
    "rule-add": { decision: "accept", reviewed_at: REVIEWED_AT }
  })
  assert.throws(
    () => buildRuleApplyPlan(current, proposalFor(current), overlay, evidenceFixture()),
    /blocking conflict.*resolution/i
  )
})

test("hard-fails context and addendum above 256 KiB without returning truncated bytes", () => {
  for (const asset of ["project_context", "prompt_addendum"]) {
    const current = bundle()
    const operation = markdownOperation(
      "oversized",
      "add",
      null,
      "Large managed section",
      "x".repeat(256 * 1024)
    )
    const proposal = proposalFor(current, {
      operations: [],
      conflicts: [],
      project_context_operations: asset === "project_context" ? [operation] : [],
      prompt_addendum_operations: asset === "prompt_addendum" ? [operation] : []
    })
    const overlay = {
      schema_version: "bob-bazaar-review/proposal-decisions/v1",
      run_id: RUN_ID,
      decisions: { oversized: { decision: "accept", reviewed_at: REVIEWED_AT } }
    }
    assert.throws(
      () => buildRuleApplyPlan(current, proposal, overlay, evidenceFixture()),
      /approved Markdown.*byte limit/i
    )
  }
})

test("uses UTF-8 byte ceilings for rejection reasons and every persisted edit field", () => {
  const current = bundle()
  const proposal = proposalFor(current)
  const exactRejectReason = "😀".repeat(2_048)
  const exactDescription = "😀".repeat(2_048)
  const exactHeading = "😀".repeat(128)

  assert.doesNotThrow(() => buildRuleApplyPlan(current, proposal, decisions({
    "rule-update": {
      decision: "edit",
      reviewed_at: REVIEWED_AT,
      edited_rule: rule({ description: exactDescription })
    },
    "prompt-add": {
      decision: "reject",
      reviewed_at: REVIEWED_AT,
      reject_reason: exactRejectReason
    },
    "context-update": {
      decision: "edit",
      reviewed_at: REVIEWED_AT,
      edited_markdown: { heading: exactHeading, markdown: "Body" }
    }
  }), evidenceFixture()))

  for (const overlay of [
    decisions({
      "prompt-add": {
        decision: "reject",
        reviewed_at: REVIEWED_AT,
        reject_reason: `${exactRejectReason}😀`
      }
    }),
    decisions({
      "rule-update": {
        decision: "edit",
        reviewed_at: REVIEWED_AT,
        edited_rule: rule({ description: `${exactDescription}😀` })
      }
    }),
    decisions({
      "context-update": {
        decision: "edit",
        reviewed_at: REVIEWED_AT,
        edited_markdown: { heading: `${exactHeading}😀`, markdown: "Body" }
      }
    })
  ]) {
    assert.throws(
      () => buildRuleApplyPlan(current, proposal, overlay, evidenceFixture()),
      /byte|malformed|validation/i
    )
  }
})

test("a multibyte rule approved in one run remains valid retirement metadata in the next run", () => {
  const firstBundle = bundle()
  const multibyteRule = rule({
    category: "界".repeat(85),
    title: "😀".repeat(128),
    description: "😀".repeat(2_048),
    applies_when: [`diff_contains:${"界".repeat(336)}`],
    review_hint: "😀".repeat(1_024)
  })
  const firstProposal = proposalFor(firstBundle, {
    operations: [ruleOperation("rule-add-multibyte", "add", null, multibyteRule)],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const firstPlan = buildRuleApplyPlan(firstBundle, firstProposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: { "rule-add-multibyte": { decision: "accept", reviewed_at: REVIEWED_AT } }
  }, evidenceFixture())
  const secondBundle = {
    checklist: present(target(firstPlan, "checklist").bytes),
    projectContext: present(target(firstPlan, "project_context").bytes),
    promptAddendum: present(target(firstPlan, "prompt_addendum").bytes),
    ruleSources: present(target(firstPlan, "rule_sources").bytes),
    ruleProvenance: present(target(firstPlan, "rule_provenance").bytes)
  }
  const addedId = parseTarget(firstPlan, "checklist").rules.at(-1).id
  const secondProposal = proposalFor(secondBundle, {
    operations: [ruleOperation("rule-retire-multibyte", "retire", addedId, null)],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const secondPlan = buildRuleApplyPlan(secondBundle, secondProposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: { "rule-retire-multibyte": { decision: "accept", reviewed_at: REVIEWED_AT } }
  }, evidenceFixture())
  const { validateRuleApplyMetadata } = require("../out/ruleAuthoring/ruleApplyTransaction")

  assert.equal(secondPlan.retirements[0].previous.description, multibyteRule.description)
  assert.doesNotThrow(() => validateRuleApplyMetadata(secondPlan.decisions, secondPlan.retirements))
})

test("rejects a stale proposal base before materializing any target", () => {
  const current = bundle()
  const proposal = proposalFor(current)
  proposal.base.checklist_sha256 = "f".repeat(64)
  assert.throws(
    () => buildRuleApplyPlan(current, proposal, decisions(), evidenceFixture()),
    /proposal base.*approved asset/i
  )
})

test("rejects source/chunk and existing provenance referential-integrity failures", () => {
  const current = bundle()
  const badEvidence = evidenceFixture()
  badEvidence.selection.selected_chunks[0].source_id = `src-${"b".repeat(12)}`
  assert.throws(
    () => buildRuleApplyPlan(current, proposalFor(current), decisions(), badEvidence),
    /evidence.*identifiers/i
  )

  const provenance = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: "2026-07-14T00:00:00.000Z",
    rules: [{
      rule_id: "PRJ-0001",
      lifecycle: "active",
      source_refs: [{
        source_id: `src-${"c".repeat(12)}`,
        chunk_id: `chunk-${"d".repeat(64)}`,
        locator: { page: 1 },
        text_sha256: "e".repeat(64)
      }],
      first_applied_at: "2026-07-14T00:00:00.000Z",
      last_applied_at: "2026-07-14T00:00:00.000Z",
      last_run_id: "old-run"
    }],
    markdown_sections: []
  }
  const badCurrent = bundle({ ruleProvenance: present(jsonBytes(provenance)) })
  assert.throws(
    () => buildRuleApplyPlan(badCurrent, proposalFor(badCurrent), decisions(), evidenceFixture()),
    /provenance.*source/i
  )
})

test("recomputes chunk identity when a merged source uses an extended collision ID", () => {
  const evidence = evidenceFixture()
  const mergedSourceId = `src-${SOURCE_HASH.slice(0, 13)}`
  const collisionHash = `${"a".repeat(12)}b${"c".repeat(51)}`
  const current = bundle({
    ruleSources: present(jsonBytes({
      schema_version: "bob-bazaar-review/rule-sources/v1",
      generated_at: "2026-07-14T00:00:00.000Z",
      sources: [
        { ...evidence.sourceManifest.sources[0], source_id: mergedSourceId },
        {
          ...evidence.sourceManifest.sources[0],
          source_id: `src-${collisionHash.slice(0, 13)}`,
          logical_name: "collision.docx",
          sha256: collisionHash
        }
      ]
    }))
  })
  const proposal = proposalFor(current, {
    operations: [ruleOperation("rule-add", "add", null, rule({ title: "Collision-safe source" }))],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const expectedChunk = splitDocumentChunk({
    sourceId: mergedSourceId,
    mediaType: "docx",
    kind: evidence.chunk.kind,
    locator: evidence.chunk.locator,
    text: evidence.chunk.text
  }, 32 * 1024)[0]

  const plan = buildRuleApplyPlan(current, proposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: { "rule-add": { decision: "accept", reviewed_at: REVIEWED_AT } }
  }, evidence)

  const provenanceRef = parseTarget(plan, "rule_provenance").rules
    .find(({ rule_id }) => rule_id === "PRJ-0004").source_refs[0]
  assert.deepEqual(
    { source_id: provenanceRef.source_id, chunk_id: provenanceRef.chunk_id },
    { source_id: mergedSourceId, chunk_id: expectedChunk.chunk_id }
  )
  assert.deepEqual(plan.decisions[0].source_refs, [{
    source_id: mergedSourceId,
    chunk_id: expectedChunk.chunk_id
  }])
})

test("reserves retired provenance IDs when allocating every stable namespace", () => {
  const current = bundle({
    ruleProvenance: present(jsonBytes({
      schema_version: "bob-bazaar-review/rule-provenance/v1",
      updated_at: "2026-07-14T00:00:00.000Z",
      rules: [{
        rule_id: "PRJ-0009",
        lifecycle: "retired",
        source_refs: [],
        first_applied_at: "2026-07-10T00:00:00.000Z",
        last_applied_at: "2026-07-14T00:00:00.000Z",
        last_run_id: "run-retired-rule"
      }],
      markdown_sections: [
        {
          asset: "project-context",
          section_id: "CTX-0009",
          lifecycle: "retired",
          source_refs: [],
          last_applied_at: "2026-07-14T00:00:00.000Z",
          last_run_id: "run-retired-context"
        },
        {
          asset: "review-prompt-addendum",
          section_id: "PRM-0009",
          lifecycle: "retired",
          source_refs: [],
          last_applied_at: "2026-07-14T00:00:00.000Z",
          last_run_id: "run-retired-prompt"
        }
      ]
    }))
  })
  const proposal = proposalFor(current, {
    operations: [ruleOperation("rule-add", "add", null, rule({ title: "After retirement" }))],
    conflicts: [],
    project_context_operations: [
      markdownOperation("context-add", "add", null, "After retirement", "Context body.")
    ],
    prompt_addendum_operations: [
      markdownOperation("prompt-add", "add", null, "After retirement", "Prompt body.")
    ]
  })

  const plan = buildRuleApplyPlan(current, proposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {
      "rule-add": { decision: "accept", reviewed_at: REVIEWED_AT },
      "context-add": { decision: "accept", reviewed_at: REVIEWED_AT },
      "prompt-add": { decision: "accept", reviewed_at: REVIEWED_AT }
    }
  }, evidenceFixture())

  assert.equal(parseTarget(plan, "checklist").rules.at(-1).id, "PRJ-0010")
  assert.match(Buffer.from(target(plan, "project_context").bytes).toString("utf8"), /CTX-0010/)
  assert.match(Buffer.from(target(plan, "prompt_addendum").bytes).toString("utf8"), /PRM-0010/)
})

test("keeps a cumulative approved source manifest readable across a 20-to-21 transition", () => {
  const evidence = evidenceFixture()
  const current = bundle({
    ruleSources: present(jsonBytes({
      schema_version: "bob-bazaar-review/rule-sources/v1",
      generated_at: "2026-07-14T00:00:00.000Z",
      sources: Array.from({ length: 20 }, (_, index) => approvedSource(index))
    }))
  })
  const proposal = proposalFor(current, {
    operations: [ruleOperation("rule-add", "add", null, rule({ title: "Twenty-first source" }))],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const first = buildRuleApplyPlan(current, proposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: { "rule-add": { decision: "accept", reviewed_at: REVIEWED_AT } }
  }, evidence)
  assert.equal(parseTarget(first, "rule_sources").sources.length, 21)

  const nextBundle = {
    checklist: present(target(first, "checklist").bytes),
    projectContext: present(target(first, "project_context").bytes),
    promptAddendum: present(target(first, "prompt_addendum").bytes),
    ruleSources: present(target(first, "rule_sources").bytes),
    ruleProvenance: present(target(first, "rule_provenance").bytes)
  }
  const nextProposal = proposalFor(nextBundle, {
    operations: [],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  const second = buildRuleApplyPlan(nextBundle, nextProposal, {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {}
  }, evidence)

  assert.equal(parseTarget(second, "rule_sources").sources.length, 21)
})

test("rejects unknown and non-remote-safe fields at every rule-source manifest level", () => {
  const evidence = evidenceFixture()
  const variants = [
    (manifest) => { manifest.absolute_path = "/private/source.docx" },
    (manifest) => { manifest.sources[0].raw_text = "private source body" },
    (manifest) => { manifest.sources[0].extractor.absolute_path = "/private/extractor" },
    (manifest) => { manifest.sources[0].logical_name = "wrong-extension.pdf" }
  ]

  for (const mutate of variants) {
    const manifest = structuredClone(evidence.sourceManifest)
    mutate(manifest)
    const current = bundle({ ruleSources: present(jsonBytes(manifest)) })
    const proposal = proposalFor(current, {
      operations: [],
      conflicts: [],
      project_context_operations: [],
      prompt_addendum_operations: []
    })
    assert.throws(
      () => buildRuleApplyPlan(current, proposal, {
        schema_version: "bob-bazaar-review/proposal-decisions/v1",
        run_id: RUN_ID,
        decisions: {}
      }, evidence),
      /rule source manifest.*malformed/i
    )
  }

  const unsafeEvidence = evidenceFixture()
  unsafeEvidence.sourceManifest.sources[0].raw_text = "private source body"
  const current = bundle()
  const proposal = proposalFor(current, {
    operations: [ruleOperation("rule-add", "add", null, rule({ title: "Unsafe evidence" }))],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  })
  assert.throws(
    () => buildRuleApplyPlan(current, proposal, {
      schema_version: "bob-bazaar-review/proposal-decisions/v1",
      run_id: RUN_ID,
      decisions: { "rule-add": { decision: "accept", reviewed_at: REVIEWED_AT } }
    }, unsafeEvidence),
    /rule source manifest.*malformed/i
  )
})

test("rejects unknown fields at every rule-provenance level", () => {
  const evidence = evidenceFixture()
  const base = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: "2026-07-14T00:00:00.000Z",
    rules: [{
      rule_id: "PRJ-0001",
      lifecycle: "active",
      source_refs: [{
        source_id: SOURCE_ID,
        chunk_id: evidence.chunk.chunk_id,
        locator: evidence.chunk.locator,
        text_sha256: evidence.chunk.text_sha256
      }],
      first_applied_at: "2026-07-10T00:00:00.000Z",
      last_applied_at: "2026-07-14T00:00:00.000Z",
      last_run_id: "run-existing-rule"
    }],
    markdown_sections: [{
      asset: "project-context",
      section_id: "CTX-0002",
      lifecycle: "active",
      source_refs: [],
      last_applied_at: "2026-07-14T00:00:00.000Z",
      last_run_id: "run-existing-context"
    }]
  }
  const variants = [
    (provenance) => { provenance.raw_text = "private source body" },
    (provenance) => { provenance.rules[0].absolute_path = "/private/source.docx" },
    (provenance) => { provenance.rules[0].source_refs[0].raw_text = "private source body" },
    (provenance) => { provenance.markdown_sections[0].absolute_path = "/private/source.docx" }
  ]

  for (const mutate of variants) {
    const provenance = structuredClone(base)
    mutate(provenance)
    const current = bundle({
      ruleSources: present(jsonBytes(evidence.sourceManifest)),
      ruleProvenance: present(jsonBytes(provenance))
    })
    const proposal = proposalFor(current, {
      operations: [],
      conflicts: [],
      project_context_operations: [],
      prompt_addendum_operations: []
    })
    assert.throws(
      () => buildRuleApplyPlan(current, proposal, {
        schema_version: "bob-bazaar-review/proposal-decisions/v1",
        run_id: RUN_ID,
        decisions: {}
      }, evidence),
      /approved rule provenance.*malformed|source reference.*malformed/i
    )
  }
})

test("rejects path-shaped provenance run IDs while preserving valid Unicode run and custom rule IDs", () => {
  const evidence = evidenceFixture()
  const provenance = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: "2026-07-14T00:00:00.000Z",
    rules: [{
      rule_id: "custom/security:input",
      lifecycle: "retired",
      source_refs: [],
      first_applied_at: "2026-07-10T00:00:00.000Z",
      last_applied_at: "2026-07-14T00:00:00.000Z",
      last_run_id: "規約 適用"
    }],
    markdown_sections: [{
      asset: "project-context",
      section_id: "CTX-0009",
      lifecycle: "retired",
      source_refs: [],
      last_applied_at: "2026-07-14T00:00:00.000Z",
      last_run_id: "規約 適用"
    }]
  }
  const build = (currentProvenance) => {
    const current = bundle({ ruleProvenance: present(jsonBytes(currentProvenance)) })
    const proposal = proposalFor(current, {
      operations: [],
      conflicts: [],
      project_context_operations: [],
      prompt_addendum_operations: []
    })
    return buildRuleApplyPlan(current, proposal, {
      schema_version: "bob-bazaar-review/proposal-decisions/v1",
      run_id: RUN_ID,
      decisions: {}
    }, evidence)
  }

  const accepted = parseTarget(build(provenance), "rule_provenance")
  assert.equal(accepted.rules[0].rule_id, "custom/security:input")
  assert.equal(accepted.rules[0].last_run_id, "規約 適用")
  assert.equal(accepted.markdown_sections[0].last_run_id, "規約 適用")

  for (const [label, mutate] of [
    ["POSIX absolute path", (value) => { value.rules[0].last_run_id = "/home/alice/private/rules.docx" }],
    ["Windows absolute path", (value) => { value.markdown_sections[0].last_run_id = "C:\\Users\\Alice\\rules.docx" }],
    ["rule-entry C1 control", (value) => { value.rules[0].last_run_id = "run\u0085private" }],
    ["Markdown-entry C1 control", (value) => { value.markdown_sections[0].last_run_id = "run\u009fprivate" }]
  ]) {
    const unsafe = structuredClone(provenance)
    mutate(unsafe)
    assert.throws(() => build(unsafe), /approved rule provenance.*malformed/i, label)
  }
})
