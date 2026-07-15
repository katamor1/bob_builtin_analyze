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
const { splitDocumentChunk } = require("../out/ruleAuthoring/documentChunk")
const { buildRuleApplyPlan } = require("../out/ruleAuthoring/ruleApplyPlan")
const {
  executeRuleApplyTransaction,
  ruleApplyMetadataEquals,
  validateRuleApplyMetadata,
  withRuleApplyWorkspaceLock
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function manifestPlanDigest(manifest) {
  const metadata = validateRuleApplyMetadata(manifest.decisions, manifest.retirements)
  return sha256(Buffer.from(stableJson({
    schema_version: "bob-bazaar-review/rule-apply-plan-metadata/v1",
    run_id: manifest.run_id,
    targets: manifest.targets.map(({ asset, path: targetPath, expected_pre_image, post_image_sha256 }) => ({
      asset,
      path: targetPath,
      expected_pre_image,
      post_image_sha256
    })),
    decisions: metadata.decisions,
    retirements: metadata.retirements
  }), "utf8"))
}

async function rebindStoredPreviewToManifest(fixture, manifest) {
  const previewPath = resolveRuleAuthoringArtifactPath(fixture.run, "applyPreview")
  const preview = JSON.parse(await fs.readFile(previewPath, "utf8"))
  preview.targets = manifest.targets.map(({
    asset,
    path: targetPath,
    expected_pre_image,
    post_image_sha256
  }) => ({ asset, path: targetPath, expected_pre_image, post_image_sha256 }))
  preview.binding.plan_metadata_sha256 = manifestPlanDigest(manifest)
  await fs.writeFile(previewPath, `${JSON.stringify(preview, null, 2)}\n`)
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-authoring-completion-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
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
  let manifest
  if (options.execute !== false) {
    manifest = await executeRuleApplyTransaction(plan, {
      workspaceRoot: root,
      transactionId: "txn-real-accept",
      now: "2026-07-15T05:00:03.000Z"
    })
    if (options.complete !== false) {
      await persistRuleApplyCompletion(state, overlay, plan, manifest)
    }
  }
  const bytes = new Map()
  if (options.execute !== false) {
    for (const [asset, relativePath] of TARGETS) {
      bytes.set(asset, await fs.readFile(path.join(root, ...relativePath.split("/"))))
    }
  }
  const run = await readRuleAuthoringRun(getRuleAuthoringPaths(root, RUN_ID))
  return {
    root,
    run,
    state,
    proposal,
    proposalValidation,
    overlay,
    plan,
    manifest,
    sourceId,
    chunk,
    chunkId: chunk.chunk_id,
    bytes
  }
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
  const fixture = await realAcceptedApplyFixture(t)
  const result = await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID })

  assert.deepEqual(result, {
    status: "verified",
    runId: RUN_ID,
    transactionId: "txn-real-accept",
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

  const changedDecisions = structuredClone(fixture.overlay)
  changedDecisions.decisions["candidate-real-accept"] = {
    decision: "reject",
    reject_reason: "Do not replace a durably committed decision",
    reviewed_at: "2026-07-15T05:00:03.500Z"
  }
  await assert.rejects(
    persistRuleProposalDecisions(fixture.state, changedDecisions),
    /committed apply completion recovery is required/i,
    "durably committed targets must freeze Human Triage artifacts until completion recovery"
  )

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

test("a pending committed apply freezes every other authoring run until its completion is recovered", async (t) => {
  const fixture = await realAcceptedApplyFixture(t, { complete: false })
  const otherRunId = "authoring-completion-other"
  const otherRun = await createRuleAuthoringRun({
    workspaceRoot: fixture.root,
    runId: otherRunId,
    now: "2026-07-15T05:00:04.000Z"
  })

  const otherState = {
    ...structuredClone(fixture.state),
    run: otherRun,
    proposal: { ...structuredClone(fixture.proposal), run_id: otherRunId }
  }
  const otherDecisions = {
    ...structuredClone(fixture.overlay),
    run_id: otherRunId
  }
  await assert.rejects(
    persistRuleProposalDecisions(otherState, otherDecisions),
    /committed apply completion recovery is required/i
  )
  assert.deepEqual(
    await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, otherRunId)),
    otherRun,
    "a foreign pending commit must freeze decision artifacts before their run-store CAS"
  )

  await assert.rejects(
    recoverCommittedRuleAuthoringApply({ workspaceRoot: fixture.root, runId: otherRunId }),
    /another authoring run.*completion recovery/i
  )
  for (const [asset, relativePath] of TARGETS) {
    assert.deepEqual(
      await fs.readFile(path.join(fixture.root, ...relativePath.split("/"))),
      fixture.bytes.get(asset),
      asset
    )
  }

  assert.equal((await recoverCommittedRuleAuthoringApply({
    workspaceRoot: fixture.root,
    runId: RUN_ID
  })).status, "recovered")
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
    await recoverCommittedRuleAuthoringApply({ workspaceRoot: fixture.root, runId: otherRunId }),
    undefined,
    "an attached historical commit must not freeze later authoring runs"
  )
})

test("completed apply recovery is idempotent for GUI re-entry", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  assert.deepEqual(await recoverCommittedRuleAuthoringApply({
    workspaceRoot: fixture.root,
    runId: RUN_ID
  }), {
    status: "recovered",
    runId: RUN_ID,
    transactionId: fixture.manifest.transaction_id
  })
})

test("verification refuses to run outside the workspace snapshot while the apply lock is held", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  await withRuleApplyWorkspaceLock(
    fixture.root,
    "verification-lock-holder",
    async () => {
      await assert.rejects(
        verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
        (error) => error.code === "workspace_busy"
      )
    }
  )
  assert.equal(
    (await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID })).status,
    "verified"
  )
})

test("the final binding check, transaction, and completion share one workspace lock", async (t) => {
  const fixture = await realAcceptedApplyFixture(t, { execute: false })
  const validated = deferred()
  const release = deferred()
  const decisionPointer = fixture.state.run.artifacts.proposalDecisions
  let committedManifest

  const apply = withRuleApplyWorkspaceLock(
    fixture.root,
    RUN_ID,
    async (workspaceLockToken) => {
      const currentState = await loadRuleProposalTriageState({
        workspaceRoot: fixture.root,
        runId: RUN_ID
      })
      const currentPlan = buildRuleApplyPlan(
        currentState.bundle,
        currentState.proposal,
        currentState.decisions,
        currentState.evidence
      )
      await validateDisplayedRuleApplyPreview(currentState, currentPlan, workspaceLockToken)
      validated.resolve()
      await release.promise
      committedManifest = await executeRuleApplyTransaction(currentPlan, {
        workspaceRoot: fixture.root,
        transactionId: "txn-final-lock",
        now: "2026-07-15T05:00:03.000Z",
        workspaceLockToken
      })
      await persistRuleApplyCompletion(
        currentState,
        currentState.decisions,
        currentPlan,
        committedManifest,
        workspaceLockToken
      )
    }
  )

  await validated.promise
  const changedDecisions = structuredClone(fixture.overlay)
  changedDecisions.decisions["candidate-real-accept"] = {
    decision: "reject",
    reject_reason: "Concurrent second-window mutation",
    reviewed_at: "2026-07-15T05:00:03.500Z"
  }
  await assert.rejects(
    persistRuleProposalDecisions(fixture.state, changedDecisions),
    (error) => error.code === "workspace_busy"
  )
  release.resolve()
  await apply

  const completed = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, RUN_ID))
  assert.equal(completed.currentPhase, "completed")
  assert.equal(completed.artifacts.proposalDecisions, decisionPointer)
  assert.equal(completed.artifacts.applyManifest !== undefined, true)
  assert.equal(committedManifest.status, "committed")
  assert.equal(
    (await verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID })).status,
    "verified"
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
  const fixture = await realAcceptedApplyFixture(t)
  const provenancePath = path.join(fixture.root, ".bob", "review", "rule-provenance.json")
  const dangling = {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: NOW,
    rules: [{
      rule_id: "PRJ-9999",
      lifecycle: "retired",
      source_refs: [{
        source_id: `src-${"d".repeat(12)}`,
        chunk_id: `chunk-${"e".repeat(64)}`,
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
  await rebindStoredPreviewToManifest(fixture, manifest)

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /source.*provenance|provenance.*source/i
  )
})

test("rejects provenance locator or text hashes that differ from authoritative document chunks", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
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
  await rebindStoredPreviewToManifest(fixture, manifest)

  await assert.rejects(
    verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /authoritative document chunks/i
  )
})

test("rejects a committed manifest while the authoring run is not completed", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  const notComplete = {
    ...fixture.run,
    currentPhase: "apply",
    phases: {
      ...fixture.run.phases,
      apply: { status: "in_progress", startedAt: "2026-07-15T05:00:03.000Z" },
      completed: { status: "not_started" }
    },
    updatedAt: "2026-07-15T05:00:04.000Z"
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

test("completion verification never bypasses missing apply-binding or evidence artifacts", async (t) => {
  const cases = [
    [
      "all Human Triage binding pointers",
      ["ruleProposal", "proposalValidation", "proposalDecisions", "applyPreview"],
      /Committed apply binding ruleProposal artifact is missing/i
    ],
    [
      "one Human Triage binding pointer",
      ["applyPreview"],
      /Rule authoring applyPreview artifact is missing/i
    ],
    [
      "the authoritative evidence selection",
      ["evidenceSelection"],
      /Rule proposal validation evidenceSelection artifact is missing/i
    ]
  ]

  for (const [label, removedArtifacts, expectedError] of cases) {
    await t.test(label, async (st) => {
      const fixture = await realAcceptedApplyFixture(st)
      const run = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, RUN_ID))
      const artifacts = { ...run.artifacts }
      for (const artifact of removedArtifacts) delete artifacts[artifact]
      await fs.writeFile(
        getRuleAuthoringPaths(fixture.root, RUN_ID).authoringRunPath,
        `${JSON.stringify({
          ...run,
          artifacts,
          updatedAt: "2026-07-15T05:00:04.000Z"
        }, null, 2)}\n`
      )

      await assert.rejects(
        verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
        expectedError
      )
    })
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
  const fixture = await realAcceptedApplyFixture(t)
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

test("verification rejects an earlier target changed while a later target is being read", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
  const checklist = path.join(fixture.root, ".bob", "review", "checklist.json")
  const lastTarget = path.join(fixture.root, ".bob", "review", "rule-provenance.json")
  let mutated = false
  const gui = loadGuiWithFsPromises({
    ...fs,
    open: async (file, flags, ...rest) => {
      const handle = await fs.open(file, flags, ...rest)
      if (!mutated && path.resolve(String(file)) === lastTarget) {
        mutated = true
        const original = fixture.bytes.get("checklist")
        await fs.writeFile(checklist, Buffer.alloc(original.byteLength, 0x20))
      }
      return handle
    }
  })

  await assert.rejects(
    gui.verifyRuleAuthoringApply({ workspaceRoot: fixture.root, runId: RUN_ID }),
    /post-image verification failed|snapshot changed/i
  )
})

test("bounded verification rejects a target renamed after its file handle opens", async (t) => {
  const fixture = await realAcceptedApplyFixture(t)
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
  const fixture = await realAcceptedApplyFixture(t)
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
