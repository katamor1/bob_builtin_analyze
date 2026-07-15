const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  commitRuleAuthoringArtifactGeneration,
  createRuleAuthoringRun,
  writeRuleAuthoringRun
} = require("../out/ruleAuthoring/ruleAuthoringRunStore")
const { buildDocumentChunkId } = require("../out/ruleAuthoring/documentChunk")
const {
  recoverCommittedRuleAuthoringApply,
  verifyRuleAuthoringApply
} = require("../out/ui/ruleProposalTriageGui")

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
  const fixture = await committedFixture(t, { stranded: true })
  assert.equal(fixture.run.currentPhase, "apply")
  assert.equal(fixture.run.artifacts.applyManifest, undefined)

  const recovered = await recoverCommittedRuleAuthoringApply({
    workspaceRoot: fixture.root,
    runId: RUN_ID
  })
  assert.deepEqual(recovered, {
    status: "recovered",
    runId: RUN_ID,
    transactionId: "txn-completion"
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
    "txn-completion",
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
