const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { buildDocumentChunkId } = require("../out/ruleAuthoring/documentChunk")
const {
  confirmRuleAuthoringScope,
  persistRuleAuthoringExtraction,
  resolveRuleAuthoringArtifactPath
} = require("../out/ruleAuthoring/ruleAuthoringArtifactStore")
const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  commitRuleAuthoringArtifactGeneration,
  createRuleAuthoringRun,
  readRuleAuthoringRun
} = require("../out/ruleAuthoring/ruleAuthoringRunStore")
const { loadSelectedEvidence } = require("../out/ruleAuthoring/evidenceSelection")
const {
  captureRuleEvidenceSelection,
  captureRuleProposal,
  createRuleAuthoringWorkflowActions,
  loadRuleSourceIndex,
  loadSelectedRuleEvidence,
  verifyRuleAuthoringApplyAction
} = require("../out/workflow/ruleAuthoringWorkflowActions")

const ONE_MIB = 1024 * 1024
const WORKFLOW_RUN_ID = "workflow-authoring-001"

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-authoring-actions-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

function canonicalChunk(sourceId, text, page = 1) {
  const locator = { page }
  return {
    schema_version: "bob-bazaar-review/document-chunk/v1",
    chunk_id: buildDocumentChunkId(sourceId, "pdf", "paragraph", locator),
    source_id: sourceId,
    kind: "paragraph",
    locator,
    title: `Policy page ${page}`,
    text,
    text_sha256: sha256(text),
    flags: []
  }
}

async function confirmedFixture(t, options = {}) {
  const root = await workspace(t)
  const checklistText = json({ version: "1", project: "workflow-actions", rules: [] })
  const projectContextText = options.projectContextText ?? ""
  const promptAddendumText = options.promptAddendumText ?? ""
  await fs.mkdir(path.join(root, ".bob", "review"), { recursive: true })
  await fs.writeFile(path.join(root, ".bob", "review", "checklist.json"), checklistText)
  await fs.writeFile(path.join(root, ".bob", "review", "project-context.md"), projectContextText)
  await fs.writeFile(path.join(root, ".bob", "review", "review-prompt-addendum.md"), promptAddendumText)

  const sourceHash = "a".repeat(64)
  const sourceId = `src-${sourceHash.slice(0, 12)}`
  const chunks = options.chunks ?? [canonicalChunk(sourceId, "Validate every external request before use.")]
  const logicalName = "security-policy.pdf"
  const sourcePath = path.join(root, logicalName)
  const selectedId = "selected-11111111111111111111111111111111"
  const manifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T00:00:01.000Z",
    sources: [{
      source_id: sourceId,
      logical_name: logicalName,
      media_type: "pdf",
      sha256: sourceHash,
      byte_size: 42,
      extraction_status: "success",
      extractor: { id: "fixture", version: "1" },
      warnings: []
    }]
  }
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: options.runId ?? "authoring-workflow-actions",
    workflowRunId: WORKFLOW_RUN_ID,
    now: "2026-07-15T00:00:00.000Z"
  })
  const extracted = await persistRuleAuthoringExtraction({
    workspaceRoot: root,
    runId: run.runId,
    run,
    existingManifest: undefined,
    selectedSources: [{
      selectedId,
      absolutePath: sourcePath,
      logicalName,
      mediaType: "pdf",
      byteSize: 42
    }],
    exclusionApprovals: [],
    batch: {
      manifest,
      documents: [{
        logicalName,
        mediaType: "pdf",
        byteSize: 42,
        sha256: sourceHash,
        status: "success",
        warnings: [],
        extractor: { id: "fixture", version: "1" },
        chunks,
        shareable: true,
        localPath: sourcePath
      }],
      aiChunks: chunks,
      localSourceMappings: [{
        logicalName,
        absolutePath: sourcePath,
        sha256: sourceHash,
        status: "success"
      }],
      duplicates: [],
      diagnostics: []
    }
  })
  const confirmed = await confirmRuleAuthoringScope({ run: extracted.run })
  assert.equal(confirmed.status, "confirmed")
  return {
    root,
    checklistText,
    projectContextText,
    promptAddendumText,
    sourceId,
    chunks,
    run: confirmed.run,
    input: {
      args: undefined,
      inputs: {},
      state: { authoringSession: JSON.stringify({ run_id: run.runId }) },
      workflowRoot: root,
      runId: WORKFLOW_RUN_ID,
      stepId: "test-step"
    }
  }
}

function selectionFor(fixture) {
  return {
    schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
    selected_chunks: fixture.chunks.map((chunk) => ({
      source_id: chunk.source_id,
      chunk_id: chunk.chunk_id,
      text_sha256: chunk.text_sha256
    }))
  }
}

function proposalFor(fixture) {
  return {
    schema_version: "bob-bazaar-review/rule-proposal/v1",
    run_id: fixture.run.runId,
    base: {
      checklist_sha256: sha256(fixture.checklistText),
      project_context_sha256: sha256(fixture.projectContextText),
      prompt_addendum_sha256: sha256(fixture.promptAddendumText)
    },
    operations: [],
    conflicts: [],
    project_context_operations: [],
    prompt_addendum_operations: []
  }
}

function withText(input, text) {
  return { ...input, args: { text } }
}

function assertGenerationPointer(relativePath, runId, basename) {
  assert.match(
    relativePath,
    new RegExp(`^\\.bob/review/rule-authoring/runs/${runId}/generations/gen-[a-f0-9]{32}/${basename}$`)
  )
}

test("workflow actions resolve one state-bound authoring run and publish exact generation artifacts", async (t) => {
  const fixture = await confirmedFixture(t)
  const loaded = await loadRuleSourceIndex(fixture.input)

  assert.equal(loaded.status, "ok")
  assert.deepEqual(loaded.authoringSession, { run_id: fixture.run.runId })
  assert.deepEqual(loaded.source_index.sources[0].chunks.map(({ chunk_id }) => chunk_id), [fixture.chunks[0].chunk_id])
  assert.equal(loaded.artifact_path, fixture.run.artifacts.sourceIndex)
  assertGenerationPointer(loaded.artifact_path, fixture.run.runId, "source-index\\.json")
  assert.deepEqual(loaded.$workflow, {
    artifacts: [{ id: "ruleSourceIndex", ownership: "provider", path: loaded.artifact_path }]
  })

  await assert.rejects(
    loadRuleSourceIndex({
      ...fixture.input,
      inputs: { runId: "caller-selected-other-run" }
    }),
    /mismatch|does not match/i
  )
  await assert.rejects(
    loadRuleSourceIndex({
      ...fixture.input,
      state: { authoringSession: JSON.stringify({ run_id: "another-authoring-run" }) }
    }),
    /does not exist|ENOENT|identity/i
  )

  await assert.rejects(
    captureRuleEvidenceSelection(withText(fixture.input, "not JSON")),
    /strict versioned JSON shape/i
  )
  const unknownSelection = selectionFor(fixture)
  unknownSelection.selected_chunks[0].chunk_id = `chunk-${"f".repeat(64)}`
  await assert.rejects(
    captureRuleEvidenceSelection(withText(fixture.input, JSON.stringify(unknownSelection))),
    /unknown or mismatched/i
  )

  const selectionRaw = JSON.stringify(selectionFor(fixture))
  const captured = await captureRuleEvidenceSelection(withText(fixture.input, selectionRaw))
  assert.equal(captured.status, "captured")
  assertGenerationPointer(captured.artifact_path, fixture.run.runId, "evidence-selection\\.json")
  assert.deepEqual(captured.$workflow.artifacts, [{
    id: "ruleEvidenceSelection",
    ownership: "provider",
    path: captured.artifact_path
  }])

  const capturedRun = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  const resumedCapture = await captureRuleEvidenceSelection(withText(fixture.input, selectionRaw))
  const recapturedRun = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  assert.equal(resumedCapture.status, "resumed")
  assert.equal(resumedCapture.artifact_path, captured.artifact_path)
  assert.equal(recapturedRun.updatedAt, capturedRun.updatedAt)

  const evidence = await loadSelectedRuleEvidence(fixture.input)
  assert.equal(evidence.status, "loaded")
  assert.match(evidence.evidence, /<<<UNTRUSTED_RULE_EVIDENCE boundary=0/)
  assert.match(evidence.evidence, /Validate every external request before use\./)
  assertGenerationPointer(evidence.artifact_path, fixture.run.runId, "selected-evidence\\.md")
  assert.deepEqual(evidence.$workflow.artifacts, [{
    id: "ruleEvidence",
    ownership: "provider",
    path: evidence.artifact_path
  }])

  const evidenceRun = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  const resumedEvidence = await loadSelectedRuleEvidence(fixture.input)
  const reloadedRun = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  assert.equal(resumedEvidence.status, "resumed")
  assert.equal(resumedEvidence.evidence, evidence.evidence)
  assert.equal(reloadedRun.updatedAt, evidenceRun.updatedAt)

  const invalidProposal = await captureRuleProposal(withText(fixture.input, "not JSON"))
  assert.equal(invalidProposal.status, "error")
  assert.ok(invalidProposal.issues.some(({ code }) => code === "invalid_json"))
  assert.equal(Object.hasOwn(invalidProposal, "$workflow"), false)

  const proposalRaw = JSON.stringify(proposalFor(fixture))
  const proposal = await captureRuleProposal(withText(fixture.input, proposalRaw))
  assert.equal(proposal.status, "captured")
  assertGenerationPointer(proposal.artifacts.rule_proposal_raw, fixture.run.runId, "rule-proposal\\.raw\\.txt")
  assertGenerationPointer(proposal.artifacts.rule_proposal, fixture.run.runId, "rule-proposal\\.json")
  assertGenerationPointer(proposal.artifacts.proposal_validation, fixture.run.runId, "proposal-validation\\.json")
  assert.deepEqual(proposal.$workflow.artifacts, [
    { id: "ruleProposalRaw", ownership: "provider", path: proposal.artifacts.rule_proposal_raw },
    { id: "ruleProposal", ownership: "provider", path: proposal.artifacts.rule_proposal },
    { id: "ruleProposalValidation", ownership: "provider", path: proposal.artifacts.proposal_validation }
  ])

  const proposalRun = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  const resumedProposal = await captureRuleProposal(withText(fixture.input, proposalRaw))
  const recapturedProposalRun = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  assert.equal(resumedProposal.status, "resumed")
  assert.deepEqual(resumedProposal.artifacts, proposal.artifacts)
  assert.equal(recapturedProposalRun.updatedAt, proposalRun.updatedAt)
})

test("selected evidence accepts exactly 1 MiB and rejects the same payload below that boundary", async (t) => {
  const sourceId = `src-${"a".repeat(12)}`
  const chunks = Array.from({ length: 32 }, (_, index) =>
    canonicalChunk(sourceId, index < 31 ? "x".repeat(32 * 1024) : "x", index + 1))
  let selection = {
    schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
    selected_chunks: chunks.map(({ source_id, chunk_id, text_sha256 }) => ({
      source_id,
      chunk_id,
      text_sha256
    }))
  }
  const initialEvidence = loadSelectedEvidence(selection, chunks, ONE_MIB)
  const deficit = ONE_MIB - Buffer.byteLength(initialEvidence, "utf8")
  assert.ok(deficit > 0 && deficit < 32 * 1024)
  chunks[31].text += "x".repeat(deficit)
  chunks[31].text_sha256 = sha256(chunks[31].text)
  selection = {
    ...selection,
    selected_chunks: chunks.map(({ source_id, chunk_id, text_sha256 }) => ({
      source_id,
      chunk_id,
      text_sha256
    }))
  }
  assert.equal(Buffer.byteLength(loadSelectedEvidence(selection, chunks, ONE_MIB), "utf8"), ONE_MIB)

  const fixture = await confirmedFixture(t, { chunks, runId: "authoring-one-mib" })
  await captureRuleEvidenceSelection(withText(fixture.input, JSON.stringify(selection)))
  const belowBoundary = createRuleAuthoringWorkflowActions({ maxSelectedEvidenceBytes: ONE_MIB - 1 })
  await assert.rejects(
    belowBoundary.loadSelectedRuleEvidence(fixture.input),
    /byte limit/i
  )
  const exact = await loadSelectedRuleEvidence(fixture.input)
  assert.equal(Buffer.byteLength(exact.evidence, "utf8"), ONE_MIB)
})

test("verification action delegates final apply validation and exposes the authoritative apply manifest", async (t) => {
  const fixture = await confirmedFixture(t)
  const selectionRaw = JSON.stringify(selectionFor(fixture))
  await captureRuleEvidenceSelection(withText(fixture.input, selectionRaw))
  await loadSelectedRuleEvidence(fixture.input)
  await captureRuleProposal(withText(fixture.input, JSON.stringify(proposalFor(fixture))))
  const before = await readRuleAuthoringRun(getRuleAuthoringPaths(fixture.root, fixture.run.runId))
  const completedAt = new Date(Date.parse(before.updatedAt) + 1).toISOString()
  const completed = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: fixture.root,
    runId: fixture.run.runId,
    expectedUpdatedAt: before.updatedAt,
    files: { applyManifest: json({ schema_version: "test/apply-manifest", run_id: fixture.run.runId }) },
    buildNextRun: (current, artifacts) => ({
      ...current,
      currentPhase: "completed",
      phases: Object.fromEntries(Object.keys(current.phases).map((phase) => [phase, {
        status: "completed",
        startedAt: current.phases[phase].startedAt ?? current.createdAt,
        completedAt: completedAt
      }])),
      artifacts,
      updatedAt: completedAt
    })
  })
  const calls = []
  const actions = createRuleAuthoringWorkflowActions({
    verifyRuleAuthoringApply: async (input) => {
      calls.push(input)
      return {
        status: "verified",
        runId: input.runId,
        transactionId: "transaction-001",
        targetCount: 5
      }
    }
  })

  const result = await actions.verifyRuleAuthoringApply(fixture.input)
  assert.deepEqual(calls, [{ workspaceRoot: fixture.root, runId: fixture.run.runId }])
  assert.equal(result.status, "verified")
  assert.equal(result.artifact_path, completed.artifacts.applyManifest)
  assert.equal(resolveRuleAuthoringArtifactPath(completed, "applyManifest"), path.join(fixture.root, ...result.artifact_path.split("/")))
  assert.deepEqual(result.$workflow.artifacts, [{
    id: "ruleApplyManifest",
    ownership: "provider",
    path: result.artifact_path
  }])

  await assert.rejects(
    verifyRuleAuthoringApplyAction({
      ...fixture.input,
      state: { authoringSession: JSON.stringify({ run_id: "different-run" }) }
    }),
    /does not exist|ENOENT|identity/i
  )
})
