const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const { constants: fsConstants } = require("node:fs")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  commitRuleAuthoringArtifactGeneration,
  createRuleAuthoringRun,
  readRuleAuthoringRun,
  writeRuleAuthoringRun
} = require("../out/ruleAuthoring/ruleAuthoringRunStore")
const { buildDocumentChunkId, splitDocumentChunk } = require("../out/ruleAuthoring/documentChunk")
const { buildRuleApplyPlan } = require("../out/ruleAuthoring/ruleApplyPlan")
const {
  executeRuleApplyTransaction,
  ruleApplyMetadataEquals,
  validateRuleApplyMetadata
} = require("../out/ruleAuthoring/ruleApplyTransaction")
const { resolveRuleAuthoringArtifactPath } = require("../out/ruleAuthoring/ruleAuthoringArtifactStore")
const {
  createRuleProposalValidationArtifact,
  loadRuleProposalTriageState,
  persistRuleApplyCompletion,
  persistRuleApplyPreview,
  persistRuleProposalDecisions,
  recoverCommittedRuleAuthoringApply,
  validateDisplayedRuleApplyPreview,
  verifyRuleAuthoringApply
} = require("../out/ui/ruleProposalTriageGui")

const GUI_MODULE = path.join(__dirname, "..", "out", "ui", "ruleProposalTriageGui.js")

const RUN_ID = "authoring-completion"
const NOW = "2026-07-15T04:05:06.000Z"
const TARGETS = Object.freeze([
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
])

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function json(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-authoring-completion-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

function completedRun(current) {
  const phases = Object.fromEntries(Object.keys(current.phases).map((phase) => [phase, {
    status: "completed",
    startedAt: current.createdAt,
    completedAt: NOW
  }]))
  return {
    ...current,
    currentPhase: "completed",
    phases,
    updatedAt: NOW
  }
}

async function committedFixture(t, options = {}) {
  const root = await workspace(t)
  const sourceId = `src-${"a".repeat(12)}`
  const locator = { page: 2 }
  const chunkId = buildDocumentChunkId(sourceId, "pdf", "page", locator)
  const chunkText = "Authoritative completion evidence"
  const sourceManifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: NOW,
    sources: options.withProvenance === false ? [] : [{
      source_id: sourceId,
      logical_name: "policy.pdf",
      media_type: "pdf",
      sha256: "a".repeat(64),
      byte_size: 100,
      extraction_status: "success",
      extractor: { id: "pdftotext", version: "1" },
      warnings: []
    }]
  }
  const provenance = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: NOW,
    rules: options.withProvenance === false ? [] : [{
      rule_id: "PRJ-0001",
      lifecycle: "active",
      source_refs: [{
        source_id: sourceId,
        chunk_id: chunkId,
        locator,
        text_sha256: sha256(Buffer.from(chunkText, "utf8"))
      }],
      first_applied_at: NOW,
      last_applied_at: NOW,
      last_run_id: RUN_ID
    }],
    markdown_sections: []
  }
  const bytes = new Map([
    ["checklist", json({
      version: "1",
      project: "completion-test",
      rules: options.withProvenance === false ? [] : [{
        id: "PRJ-0001",
        category: "security",
        title: "Validate input",
        description: "Validate input at trust boundaries.",
        severity_on_fail: "error",
        applies_when: [],
        evidence_required: true,
        review_hint: "Inspect boundary validation."
      }]
    })],
    ["project_context", Buffer.from("", "utf8")],
    ["prompt_addendum", Buffer.from("", "utf8")],
    ["rule_sources", json(sourceManifest)],
    ["rule_provenance", json(provenance)]
  ])
  await fs.mkdir(path.join(root, ".bob", "review"), { recursive: true })
  for (const [asset, relativePath] of TARGETS) {
    await fs.writeFile(path.join(root, ...relativePath.split("/")), bytes.get(asset))
  }
  const manifest = {
    schema_version: "bob-bazaar-review/apply-manifest/v1",
    transaction_id: "txn-completion",
    run_id: RUN_ID,
    status: "committed",
    committed_at: NOW,
    backup_directory: ".bob/review/rule-authoring/backups/txn-completion",
    targets: TARGETS.map(([asset, targetPath]) => ({
      asset,
      path: targetPath,
      expected_pre_image: { state: "missing" },
      post_image_sha256: sha256(bytes.get(asset)),
      state: "replaced"
    })),
    decisions: [],
    retirements: []
  }
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: RUN_ID,
    now: "2026-07-15T04:00:00.000Z"
  })
  const commonArtifactFiles = {
    sourceManifest: `${JSON.stringify(sourceManifest, null, 2)}\n`,
    documentChunks: `${JSON.stringify({
      schema_version: "bob-bazaar-review/document-chunk/v1",
      chunk_id: chunkId,
      source_id: sourceId,
      kind: "page",
      locator,
      title: "Policy",
      text: chunkText,
      text_sha256: sha256(Buffer.from(chunkText, "utf8")),
      flags: []
    })}\n`
  }
  const next = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: root,
    runId: RUN_ID,
    expectedUpdatedAt: run.updatedAt,
    files: options.stranded
      ? {
          ...commonArtifactFiles,
          proposalDecisions: `${JSON.stringify({
            schema_version: "bob-bazaar-review/proposal-decisions/v1",
            run_id: RUN_ID,
            decisions: {}
          })}\n`,
          applyPreview: `${JSON.stringify({
            schema_version: "bob-bazaar-review/apply-preview/v1",
            run_id: RUN_ID,
            generated_at: NOW,
            targets: manifest.targets,
            decision_summary: { accepted: 0, edited: 0, rejected: 0 }
          })}\n`
        }
      : { ...commonArtifactFiles, applyManifest: `${JSON.stringify(manifest, null, 2)}\n` },
    buildNextRun: (current, artifacts) => options.stranded
      ? {
          ...current,
          currentPhase: "apply",
          phases: Object.fromEntries(Object.keys(current.phases).map((phase) => [phase,
            ["sources", "extraction", "evidence_selection", "proposal", "human_review"].includes(phase)
              ? { status: "completed", startedAt: current.createdAt, completedAt: NOW }
              : phase === "apply"
                ? { status: "in_progress", startedAt: NOW }
                : { status: "not_started" }
          ])),
          artifacts,
          updatedAt: NOW
        }
      : { ...completedRun(current), artifacts }
  })
  if (options.stranded) {
    const transactionDirectory = path.join(
      root,
      ".bob",
      "review",
      "rule-authoring",
      "transactions",
      manifest.transaction_id
    )
    await fs.mkdir(transactionDirectory, { recursive: true })
    await fs.writeFile(
      path.join(transactionDirectory, "apply-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
    await fs.writeFile(
      path.join(transactionDirectory, "transaction-journal.json"),
      `${JSON.stringify({
        schema_version: "bob-bazaar-review/rule-apply-transaction/v1",
        transaction_id: manifest.transaction_id,
        run_id: RUN_ID,
        status: "committed",
        created_at: NOW,
        updated_at: NOW,
        targets: manifest.targets.map((target) => ({
          ...target,
          backup_path: null,
          staging_path: `.bob/review/rule-authoring/transactions/${manifest.transaction_id}/staging/${target.asset}.stage`
        })),
        decisions: [],
        retirements: []
      }, null, 2)}\n`
    )
  }
  return { root, run: next, manifest, bytes, sourceId, chunkId }
}

async function realAcceptedApplyFixture(t, options = {}) {
  const root = await workspace(t)
  const checklistBytes = json({ version: "1", project: "completion-real", rules: [] })
  const contextBytes = Buffer.from("", "utf8")
  const addendumBytes = Buffer.from("", "utf8")
  await fs.mkdir(path.join(root, ".bob", "review"), { recursive: true })
  await fs.writeFile(path.join(root, ".bob", "review", "checklist.json"), checklistBytes)
  await fs.writeFile(path.join(root, ".bob", "review", "project-context.md"), contextBytes)
  await fs.writeFile(path.join(root, ".bob", "review", "review-prompt-addendum.md"), addendumBytes)

  const sourceHash = "b".repeat(64)
  const sourceId = `src-${sourceHash.slice(0, 12)}`
  const [chunk] = splitDocumentChunk({
    sourceId,
    mediaType: "docx",
    kind: "paragraph",
    locator: { heading_path: ["Security"], block_index: 1 },
    text: "Every external request must be validated before use."
  }, 32 * 1024)
  const sourceManifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T05:00:01.000Z",
    sources: [{
      source_id: sourceId,
      logical_name: "security-policy.docx",
      media_type: "docx",
      sha256: sourceHash,
      byte_size: 128,
      extraction_status: "success",
      extractor: { id: "mammoth", version: "1.8.0" },
      warnings: []
    }]
  }
  const evidenceSelection = {
    schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
    selected_chunks: [{
      source_id: sourceId,
      chunk_id: chunk.chunk_id,
      text_sha256: chunk.text_sha256
    }]
  }
  const proposal = {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: RUN_ID,
    base: {
      checklist_sha256: sha256(checklistBytes),
      project_context_sha256: sha256(contextBytes),
      prompt_addendum_sha256: sha256(addendumBytes)
    },
    operations: [{
      candidate_id: "candidate-real-accept",
      operation: "add",
      target_rule_id: null,
      rule: {
        category: "security",
        title: "Validate external requests",
        description: "Validate external requests before use.",
        severity_on_fail: "error",
        applies_when: ["changed_file_matches:**/*.ts"],
        evidence_required: true,
        review_hint: "Inspect the request trust boundary."
      },
      source_refs: [{ source_id: sourceId, chunk_id: chunk.chunk_id }],
      confidence: "high",
      rationale: "The selected policy evidence requires validation.",
      conflict_ids: []
    }],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  }
  const validationContext = {
    runId: RUN_ID,
    base: {
      checklistSha256: proposal.base.checklist_sha256,
      projectContextSha256: proposal.base.project_context_sha256,
      promptAddendumSha256: proposal.base.prompt_addendum_sha256
    },
    existingRuleIds: [],
    existingProjectContextSectionIds: [],
    existingPromptAddendumSectionIds: [],
    selectedEvidence: [{ source_id: sourceId, chunk_id: chunk.chunk_id }]
  }
  const initial = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: RUN_ID,
    now: "2026-07-15T05:00:00.000Z"
  })
  const evidenceRun = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: root,
    runId: RUN_ID,
    expectedUpdatedAt: initial.updatedAt,
    files: {
      sourceManifest: `${JSON.stringify(sourceManifest)}\n`,
      documentChunks: `${JSON.stringify(chunk)}\n`,
      evidenceSelection: `${JSON.stringify(evidenceSelection)}\n`
    },
    buildNextRun: (run, artifacts) => ({
      ...run,
      artifacts,
      updatedAt: "2026-07-15T05:00:00.500Z"
    })
  })
  const proposalValidation = createRuleProposalValidationArtifact(
    proposal,
    validationContext,
    "2026-07-15T05:00:01.000Z",
    {
      run: evidenceRun,
      evidence: { sourceManifest, chunks: [chunk], selection: evidenceSelection }
    }
  )
  await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: root,
    runId: RUN_ID,
    expectedUpdatedAt: evidenceRun.updatedAt,
    files: {
      ruleProposal: `${JSON.stringify(proposal)}\n`,
      proposalValidation: `${JSON.stringify(proposalValidation)}\n`
    },
    buildNextRun: (run, artifacts) => ({
      ...run,
      currentPhase: "human_review",
      phases: Object.fromEntries(Object.keys(run.phases).map((phase) => [phase,
        ["sources", "extraction", "evidence_selection", "proposal"].includes(phase)
          ? { status: "completed", startedAt: run.createdAt, completedAt: "2026-07-15T05:00:01.000Z" }
          : phase === "human_review"
            ? { status: "in_progress", startedAt: "2026-07-15T05:00:01.000Z" }
            : { status: "not_started" }
      ])),
      artifacts,
      updatedAt: "2026-07-15T05:00:01.000Z"
    })
  })

  const overlay = {
    schema_version: "bob-bazaar-review/proposal-decisions/v1",
    run_id: RUN_ID,
    decisions: {
      "candidate-real-accept": {
        decision: "accept",
        reviewed_at: "2026-07-15T05:00:02.000Z"
      }
    }
  }
  let state = await loadRuleProposalTriageState({ workspaceRoot: root, runId: RUN_ID })
  state = await persistRuleProposalDecisions(state, overlay)
  const plan = buildRuleApplyPlan(state.bundle, state.proposal, overlay, state.evidence)
  state = await persistRuleApplyPreview(state, overlay, plan)
  assert.equal(state.run.currentPhase, "apply")
  assert.equal(state.run.phases.human_review.status, "completed")
  assert.equal(state.run.phases.apply.status, "in_progress")
  const manifest = await executeRuleApplyTransaction(plan, {
    workspaceRoot: root,
    transactionId: "txn-real-accept",
    now: "2026-07-15T05:00:03.000Z"
  })
  if (options.complete !== false) {
    await persistRuleApplyCompletion(state, overlay, plan, manifest)
  }
  return { root, state, proposal, proposalValidation, overlay, plan, manifest, sourceId, chunk }
}

function loadGuiWithFsPromises(fsOverride) {
  const originalLoad = Module._load
  const previousModule = require.cache[GUI_MODULE]
  delete require.cache[GUI_MODULE]
  Module._load = function load(request, parent, isMain) {
    if (request === "node:fs/promises" && parent?.filename === GUI_MODULE) return fsOverride
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(GUI_MODULE)
  } finally {
    Module._load = originalLoad
    delete require.cache[GUI_MODULE]
    if (previousModule) require.cache[GUI_MODULE] = previousModule
  }
}

test("verifies only the authoritative committed manifest, all current post-images, provenance references, and completed phase", async (t) => {
  const fixture = await committedFixture(t)
  const result = await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID })

  assert.deepEqual(result, {
    status: "verified",
    runId: RUN_ID,
    transactionId: "txn-completion",
    targetCount: 5
  })

  await t.test("missing current post-image fails closed", async () => {
    await fs.unlink(path.join(fixture.root, ".bob", "review", "project-context.md"))
    await assert.rejects(
      verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
      /post-image verification failed/i
    )
  })
})

test("re-attaches a committed transaction when completion persistence was interrupted", async (t) => {
  const fixture = await realAcceptedApplyFixture(t, { complete: false })
  assert.equal(fixture.state.run.currentPhase, "apply")
  assert.equal(fixture.state.run.artifacts.applyManifest, undefined)

  const recovered = await recoverCommittedRuleAuthoringApply({
    workspaceRoot: fixture.root,
    runId: RUN_ID
  })
  assert.deepEqual(recovered, {
    status: "recovered",
    runId: RUN_ID,
    transactionId: "txn-real-accept"
  })
  assert.equal(
    (await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID })).status,
    "verified"
  )

  await fs.unlink(path.join(
    fixture.root,
    ".bob",
    "review",
    "rule-authoring",
    "transactions",
    fixture.manifest.transaction_id,
    "apply-manifest.json"
  ))
  assert.equal(
    (await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID })).status,
    "verified",
    "verification must use the recovered authoritative run artifact pointer"
  )
})

test("fails closed when the authoritative apply manifest is missing even if a run-root decoy exists", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: RUN_ID,
    now: "2026-07-15T04:00:00.000Z"
  })
  const complete = completedRun(run)
  await writeRuleAuthoringRun(complete, run.updatedAt)
  const paths = getRuleAuthoringPaths(root, RUN_ID)
  await fs.writeFile(paths.runDirectory + "/apply-manifest.json", JSON.stringify({ status: "committed" }))

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: root, runId: RUN_ID }),
    /apply manifest artifact is missing/i
  )
})

test("rejects a committed hash-valid bundle with dangling source provenance", async (t) => {
  const fixture = await committedFixture(t, { withProvenance: false })
  const provenancePath = path.join(fixture.root, ".bob", "review", "rule-provenance.json")
  const dangling = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: NOW,
    rules: [{
      rule_id: "PRJ-9999",
      lifecycle: "retired",
      source_refs: [{
        source_id: fixture.sourceId,
        chunk_id: fixture.chunkId,
        locator: { page: 9 },
        text_sha256: "d".repeat(64)
      }],
      first_applied_at: NOW,
      last_applied_at: NOW,
      last_run_id: RUN_ID
    }],
    markdown_sections: []
  }
  const danglingBytes = json(dangling)
  await fs.writeFile(provenancePath, danglingBytes)

  const manifestPath = fixture.run.artifacts.applyManifest
  assert.ok(manifestPath)
  const absoluteManifestPath = path.join(fixture.root, ...manifestPath.split("/"))
  const manifest = JSON.parse(await fs.readFile(absoluteManifestPath, "utf8"))
  manifest.targets.find(({ asset }) => asset === "rule_provenance").post_image_sha256 = sha256(danglingBytes)
  await fs.writeFile(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /source.*provenance|provenance.*source/i
  )
})

test("rejects provenance locator or text hashes that differ from authoritative document chunks", async (t) => {
  const fixture = await committedFixture(t)
  const provenancePath = path.join(fixture.root, ".bob", "review", "rule-provenance.json")
  const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"))
  provenance.rules[0].source_refs[0].locator = { page: 999 }
  provenance.rules[0].source_refs[0].text_sha256 = "d".repeat(64)
  const tamperedBytes = json(provenance)
  await fs.writeFile(provenancePath, tamperedBytes)

  const absoluteManifestPath = path.join(
    fixture.root,
    ...fixture.run.artifacts.applyManifest.split("/")
  )
  const manifest = JSON.parse(await fs.readFile(absoluteManifestPath, "utf8"))
  manifest.targets.find(({ asset }) => asset === "rule_provenance").post_image_sha256 = sha256(tamperedBytes)
  await fs.writeFile(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /authoritative document chunks/i
  )
})

test("rejects a committed manifest while the authoring run is not completed", async (t) => {
  const fixture = await committedFixture(t)
  const notComplete = {
    ...fixture.run,
    currentPhase: "apply",
    phases: {
      ...fixture.run.phases,
      apply: { status: "in_progress", startedAt: NOW },
      completed: { status: "not_started" }
    },
    updatedAt: "2026-07-15T04:05:07.000Z"
  }
  // The run store deliberately prevents phase rollback, so this fixture writes
  // the otherwise schema-valid interrupted state directly.
  await fs.writeFile(
    getRuleAuthoringPaths(fixture.root, RUN_ID).authoringRunPath,
    `${JSON.stringify(notComplete, null, 2)}\n`
  )

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /run phase is not completed/i
  )
})

test("real accepted proposal plan commits, persists completion, and verifies ID-only manifest refs", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  assert.deepEqual(fixture.manifest.decisions[0].source_refs, [{
    source_id: fixture.sourceId,
    chunk_id: fixture.chunk.chunk_id
  }])
  assert.equal(fixture.manifest.decisions[0].source_refs[0].locator, undefined)
  assert.equal(fixture.manifest.decisions[0].source_refs[0].text_sha256, undefined)

  assert.deepEqual(
    await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    {
      status: "verified",
      runId: RUN_ID,
      transactionId: "txn-real-accept",
      targetCount: 5
    }
  )
  const completed = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, RUN_ID))
  assert.equal(completed.phases.apply.status, "completed")
  assert.equal(completed.phases.completed.status, "completed")
})

test("binds proposal validation to exact evidence artifact pointers, digests, and selected text identities", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  const validationPath = resolveRuleAuthoringArtifactPath(fixture.state.run, "proposalValidation")
  const validation = JSON.parse(await fs.readFile(validationPath, "utf8"))
  assert.deepEqual(Object.keys(validation.evidence_binding).sort(), [
    "document_chunks", "evidence_selection", "selected_evidence", "source_manifest"
  ])
  assert.equal(
    validation.evidence_binding.source_manifest.artifact,
    fixture.state.run.artifacts.sourceManifest
  )
  assert.equal(
    validation.evidence_binding.document_chunks.artifact,
    fixture.state.run.artifacts.documentChunks
  )
  assert.equal(
    validation.evidence_binding.evidence_selection.artifact,
    fixture.state.run.artifacts.evidenceSelection
  )
  assert.deepEqual(validation.evidence_binding.selected_evidence, [{
    source_id: fixture.sourceId,
    chunk_id: fixture.chunk.chunk_id,
    text_sha256: fixture.chunk.text_sha256
  }])
  for (const key of ["source_manifest", "document_chunks", "evidence_selection"]) {
    assert.match(validation.evidence_binding[key].sha256, /^[a-f0-9]{64}$/)
  }
})

test("strictly rejects malformed or version-mismatched evidence during load", async (t) => {
  const cases = [
    ["source manifest exact keys", "sourceManifest", (value) => { value.extra = true }],
    ["document chunk text SHA", "documentChunks", (value) => { value.text += " tampered" }],
    ["document chunk deterministic ID", "documentChunks", (value) => { value.locator.block_index = 99 }],
    ["evidence selection exact keys", "evidenceSelection", (value) => { value.extra = true }],
    ["selected text SHA", "evidenceSelection", (value) => {
      value.selected_chunks[0].text_sha256 = "f".repeat(64)
    }],
    ["validation evidence pointer", "proposalValidation", (value) => {
      value.evidence_binding.source_manifest.artifact = "generations/gen-decoy/source-manifest.json"
    }]
  ]
  for (const [label, artifactKey, mutate] of cases) {
    await t.test(label, async (st) => {
      const fixture = await realAcceptedApplyFixture(st)
      const artifactPath = resolveRuleAuthoringArtifactPath(fixture.state.run, artifactKey)
      const raw = await fs.readFile(artifactPath, "utf8")
      const value = artifactKey === "documentChunks"
        ? JSON.parse(raw.trim().split(/\r?\n/)[0])
        : JSON.parse(raw)
      mutate(value)
      await fs.writeFile(artifactPath, `${JSON.stringify(value)}\n`)
      await assert.rejects(
        loadRuleProposalTriageState({ workspaceRoot: fixture.root, runId: RUN_ID }),
        /evidence|source manifest|document chunk|validation/i
      )
    })
  }
})

test("completion verification recomputes authoritative chunk text SHA", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  const chunkPath = resolveRuleAuthoringArtifactPath(fixture.state.run, "documentChunks")
  const chunk = JSON.parse((await fs.readFile(chunkPath, "utf8")).trim())
  chunk.text = `${chunk.text} undetected-tail`
  await fs.writeFile(chunkPath, `${JSON.stringify(chunk)}\n`)

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /document chunk|text.*sha|authoritative evidence/i
  )
})

test("completion verification revalidates the proposal evidence-version binding", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  const validationPath = resolveRuleAuthoringArtifactPath(fixture.state.run, "proposalValidation")
  const validation = JSON.parse(await fs.readFile(validationPath, "utf8"))
  validation.evidence_binding.evidence_selection.sha256 = "f".repeat(64)
  await fs.writeFile(validationPath, `${JSON.stringify(validation)}\n`)

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /binding|selected evidence|validation/i
  )
})

test("committed recovery is bound to exact proposal, validation, overlay, preview, plan, and journal metadata", async (t) => {
  const cases = [
    ["proposal", async (fixture) => {
      const file = resolveRuleAuthoringArtifactPath(fixture.state.run, "ruleProposal")
      const value = JSON.parse(await fs.readFile(file, "utf8"))
      value.operations[0].rationale = "A different but schema-valid rationale."
      await fs.writeFile(file, `${JSON.stringify(value)}\n`)
    }],
    ["validation", async (fixture) => {
      const file = resolveRuleAuthoringArtifactPath(fixture.state.run, "proposalValidation")
      const value = JSON.parse(await fs.readFile(file, "utf8"))
      value.validated_at = "2026-07-15T05:00:01.001Z"
      await fs.writeFile(file, `${JSON.stringify(value)}\n`)
    }],
    ["decision overlay", async (fixture) => {
      const file = resolveRuleAuthoringArtifactPath(fixture.state.run, "proposalDecisions")
      const value = JSON.parse(await fs.readFile(file, "utf8"))
      value.decisions["candidate-real-accept"].reviewed_at = "2026-07-15T05:00:02.001Z"
      await fs.writeFile(file, `${JSON.stringify(value)}\n`)
    }],
    ["apply preview plan digest", async (fixture) => {
      const file = resolveRuleAuthoringArtifactPath(fixture.state.run, "applyPreview")
      const value = JSON.parse(await fs.readFile(file, "utf8"))
      value.binding = { ...value.binding, plan_metadata_sha256: "f".repeat(64) }
      await fs.writeFile(file, `${JSON.stringify(value)}\n`)
    }],
    ["journal decisions", async (fixture) => {
      const file = path.join(
        fixture.root,
        ".bob",
        "review",
        "rule-authoring",
        "transactions",
        fixture.manifest.transaction_id,
        "transaction-journal.json"
      )
      const value = JSON.parse(await fs.readFile(file, "utf8"))
      value.decisions[0].reviewed_at = "2026-07-15T05:00:02.001Z"
      await fs.writeFile(file, `${JSON.stringify(value)}\n`)
    }]
  ]

  for (const [label, mutate] of cases) {
    await t.test(label, async (st) => {
      const fixture = await realAcceptedApplyFixture(st, { complete: false })
      await mutate(fixture)
      if (label === "apply preview plan digest") {
        await assert.rejects(
          validateDisplayedRuleApplyPreview(fixture.state, fixture.plan),
          /committed apply binding/i,
          "the displayed preview binding must fail before another transaction can start"
        )
        await assert.rejects(
          persistRuleApplyCompletion(
            fixture.state,
            fixture.overlay,
            fixture.plan,
            fixture.manifest
          ),
          /committed apply binding/i,
          "normal completion persistence must enforce the same binding as restart recovery"
        )
      }
      await assert.rejects(
        recoverCommittedRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
        /committed apply binding/i
      )
      const run = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, RUN_ID))
      assert.equal(run.artifacts.applyManifest, undefined)
      assert.notEqual(run.currentPhase, "completed")
    })
  }
})

test("strictly rejects malformed or duplicate manifest decision and retirement records", async (t) => {
  const sourceRefs = [{ source_id: `src-${"c".repeat(12)}`, chunk_id: `chunk-${"d".repeat(64)}` }]
  const decision = (candidateId, targetAsset, operation, targetId, outcome = "accept") => ({
    candidate_id: candidateId,
    target_asset: targetAsset,
    operation,
    decision: outcome,
    target_id: targetId,
    reviewed_at: "2026-07-15T05:00:02.000Z",
    source_refs: outcome === "reject" ? [] : structuredClone(sourceRefs),
    conflict_resolutions: {}
  })
  const validDecisions = [
    decision("valid-rule-update", "rule", "update", "PRJ-0001"),
    decision("valid-context-update", "project_context", "update", "CTX-0001", "edit"),
    decision("valid-prompt-update", "prompt_addendum", "update", "PRM-0001"),
    decision("valid-rule-retire", "rule", "retire", "PRJ-0002"),
    decision("valid-context-retire", "project_context", "retire", "CTX-0002"),
    decision("valid-prompt-retire", "prompt_addendum", "retire", "PRM-0002"),
    decision("valid-rejected-add", "rule", "add", null, "reject")
  ]
  const validRetirements = [
    {
      candidate_id: "valid-rule-retire",
      target_asset: "rule",
      target_id: "PRJ-0002",
      decision: "accept",
      reviewed_at: "2026-07-15T05:00:02.000Z",
      source_refs: structuredClone(sourceRefs),
      previous: {
        id: "PRJ-0002",
        category: "security",
        title: "Retired rule",
        description: "First line.\nSecond line.",
        severity_on_fail: "warning",
        applies_when: ["diff_contains:legacy"],
        evidence_required: true,
        review_hint: "Review\tlegacy behavior."
      }
    },
    {
      candidate_id: "valid-context-retire",
      target_asset: "project_context",
      target_id: "CTX-0002",
      decision: "accept",
      reviewed_at: "2026-07-15T05:00:02.000Z",
      source_refs: structuredClone(sourceRefs),
      previous: { heading: "Context", markdown: "First line.\nSecond line." }
    },
    {
      candidate_id: "valid-prompt-retire",
      target_asset: "prompt_addendum",
      target_id: "PRM-0002",
      decision: "accept",
      reviewed_at: "2026-07-15T05:00:02.000Z",
      source_refs: structuredClone(sourceRefs),
      previous: { heading: "Prompt", markdown: "Inspect this.\nThen inspect that." }
    }
  ]
  assert.deepEqual(
    validateRuleApplyMetadata(validDecisions, validRetirements),
    { decisions: validDecisions, retirements: validRetirements }
  )
  const reorderedDecisions = validDecisions.map((record) =>
    Object.fromEntries(Object.entries(record).reverse()))
  const reorderedRetirements = validRetirements.map((record) =>
    Object.fromEntries(Object.entries(record).reverse()))
  assert.equal(
    ruleApplyMetadataEquals(
      validDecisions,
      validRetirements,
      reorderedDecisions,
      reorderedRetirements
    ),
    true,
    "journal/manifest metadata equality must be canonical rather than key-order-sensitive"
  )

  const cases = [
    ["unknown decision key", (manifest) => { manifest.decisions[0].absolute_path = "/private/policy.docx" }],
    ["duplicate candidate", (manifest) => { manifest.decisions.push(structuredClone(manifest.decisions[0])) }],
    ["invalid target operation", (manifest) => {
      manifest.decisions[0].target_asset = "project_context"
      manifest.decisions[0].target_id = "PRJ-0001"
    }],
    ["invalid decision timestamp", (manifest) => { manifest.decisions[0].reviewed_at = "not-a-time" }],
    ["unknown source ref key", (manifest) => { manifest.decisions[0].source_refs[0].locator = { page: 1 } }],
    ["invalid conflict resolution", (manifest) => {
      manifest.decisions[0].conflict_resolutions = { "../conflict": "alternative-a" }
    }],
    ["malformed retirement previous value", (manifest) => {
      const decision = {
        candidate_id: "candidate-retire",
        target_asset: "rule",
        operation: "retire",
        decision: "accept",
        target_id: "PRJ-9999",
        reviewed_at: "2026-07-15T05:00:02.000Z",
        source_refs: structuredClone(manifest.decisions[0].source_refs),
        conflict_resolutions: {}
      }
      manifest.decisions.push(decision)
      manifest.retirements.push({
        candidate_id: decision.candidate_id,
        target_asset: decision.target_asset,
        target_id: decision.target_id,
        decision: decision.decision,
        reviewed_at: decision.reviewed_at,
        source_refs: structuredClone(decision.source_refs),
        previous: {
          id: "PRJ-9999",
          category: "security",
          title: "Retired",
          description: "Retired rule.",
          severity_on_fail: "error",
          absolute_path: "/private/policy.docx"
        }
      })
    }]
  ]

  for (const [label, mutate] of cases) {
    await t.test(label, async (st) => {
      const fixture = await realAcceptedApplyFixture(st)
      const file = resolveRuleAuthoringArtifactPath(
        await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, RUN_ID)),
        "applyManifest"
      )
      const manifest = JSON.parse(await fs.readFile(file, "utf8"))
      mutate(manifest)
      await fs.writeFile(file, `${JSON.stringify(manifest)}\n`)
      await assert.rejects(
        verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
        /manifest|decision|retirement|malformed/i
      )
    })
  }
})

test("bounded verification rejects a final symlink even if open follows it", async (t) => {
  const fixture = await committedFixture(t, { withProvenance: false })
  const target = path.join(fixture.root, ".bob", "review", "checklist.json")
  const linked = path.join(fixture.root, "same-checklist.json")
  await fs.writeFile(linked, fixture.bytes.get("checklist"))
  await fs.unlink(target)
  await fs.symlink(linked, target)
  const gui = loadGuiWithFsPromises({
    ...fs,
    open: async (file, flags, ...rest) => path.resolve(String(file)) === target
      ? fs.open(file, fsConstants.O_RDONLY, ...rest)
      : fs.open(file, flags, ...rest)
  })

  await assert.rejects(
    gui.verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /post-image verification failed/i
  )
})

test("bounded verification rejects a target renamed after its file handle opens", async (t) => {
  const fixture = await committedFixture(t, { withProvenance: false })
  const target = path.join(fixture.root, ".bob", "review", "checklist.json")
  let swapped = false
  const gui = loadGuiWithFsPromises({
    ...fs,
    open: async (file, flags, ...rest) => {
      const handle = await fs.open(file, flags, ...rest)
      if (!swapped && path.resolve(String(file)) === target) {
        swapped = true
        await fs.rename(target, `${target}.opened`)
        await fs.writeFile(target, fixture.bytes.get("checklist"))
      }
      return handle
    }
  })

  await assert.rejects(
    gui.verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /post-image verification failed/i
  )
})

test("bounded verification rejects same-inode mutation after bytes are read", async (t) => {
  const fixture = await committedFixture(t, { withProvenance: false })
  const target = path.join(fixture.root, ".bob", "review", "checklist.json")
  let mutated = false
  const gui = loadGuiWithFsPromises({
    ...fs,
    open: async (file, flags, ...rest) => {
      const handle = await fs.open(file, flags, ...rest)
      if (path.resolve(String(file)) !== target) return handle
      return new Proxy(handle, {
        get(object, property) {
          if (property === "readFile") return async (...args) => {
            const bytes = await object.readFile(...args)
            if (!mutated) {
              mutated = true
              await fs.writeFile(target, Buffer.alloc(bytes.byteLength, 0x20))
            }
            return bytes
          }
          const value = Reflect.get(object, property, object)
          return typeof value === "function" ? value.bind(object) : value
        }
      })
    }
  })

  await assert.rejects(
    gui.verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /post-image verification failed/i
  )
})
