const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { buildDocumentChunkId } = require("../out/ruleAuthoring/documentChunk")
const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  createRuleAuthoringRun,
  readRuleAuthoringRun
} = require("../out/ruleAuthoring/ruleAuthoringRunStore")

function artifactStore() {
  return require("../out/ruleAuthoring/ruleAuthoringArtifactStore")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-artifacts-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function canonicalChunk(sourceId, text, locator = { page: 1 }, title = "Policy") {
  return {
    schema_version: "bob-bazaar-review/document-chunk/v1",
    chunk_id: buildDocumentChunkId(sourceId, "pdf", "paragraph", locator),
    source_id: sourceId,
    kind: "paragraph",
    locator,
    title,
    text,
    text_sha256: sha256(text),
    flags: []
  }
}

function extractionFixture(root, options = {}) {
  const sourceHash = "a".repeat(64)
  const sourceId = `src-${sourceHash.slice(0, 12)}`
  const firstPath = path.join(root, "one", "policy.pdf")
  const secondPath = path.join(root, "two", "policy.pdf")
  const chunks = options.chunks ?? [
    canonicalChunk(sourceId, "first selected policy", { page: 1 }),
    canonicalChunk(sourceId, "second excluded policy", { page: 2 })
  ]
  const manifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T00:00:00.000Z",
    sources: [{
      source_id: sourceId,
      logical_name: "policy.pdf",
      media_type: "pdf",
      sha256: sourceHash,
      byte_size: 42,
      extraction_status: "success",
      extractor: { id: "fixture", version: "1" },
      warnings: []
    }]
  }
  return {
    selectedSources: [
      {
        selectedId: "selected-11111111111111111111111111111111",
        absolutePath: firstPath,
        logicalName: "policy.pdf",
        mediaType: "pdf",
        byteSize: 42
      },
      {
        selectedId: "selected-22222222222222222222222222222222",
        absolutePath: secondPath,
        logicalName: "policy.pdf",
        mediaType: "pdf",
        byteSize: 17
      }
    ],
    exclusionApprovals: [{
      selectedId: "selected-22222222222222222222222222222222",
      approved: true
    }],
    batch: {
      manifest,
      documents: [
        {
          logicalName: "policy.pdf",
          mediaType: "pdf",
          byteSize: 42,
          sha256: sourceHash,
          status: "success",
          warnings: [],
          extractor: { id: "fixture", version: "1" },
          chunks,
          shareable: true,
          localPath: firstPath
        },
        {
          logicalName: "policy.pdf",
          mediaType: "pdf",
          byteSize: 17,
          sha256: "b".repeat(64),
          status: "blocked",
          warnings: ["pdf.extraction_blocked"],
          extractor: { id: "fixture", version: "1" },
          chunks: [],
          shareable: false,
          localPath: secondPath
        }
      ],
      aiChunks: chunks,
      localSourceMappings: [
        {
          logicalName: "policy.pdf",
          absolutePath: firstPath,
          sha256: sourceHash,
          status: "success"
        },
        {
          logicalName: "policy.pdf",
          absolutePath: secondPath,
          sha256: "b".repeat(64),
          status: "blocked"
        }
      ],
      duplicates: [],
      diagnostics: [{ logical_name: "policy.pdf", code: "pdf.extraction_blocked" }]
    }
  }
}

test("default artifact adapters persist consent scope, resume exact selection, and publish only the confirmed filtered index", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "規約 適用",
    now: "2026-07-15T00:00:00.000Z"
  })
  const fixture = extractionFixture(root)
  const store = artifactStore()

  const extracted = await store.persistRuleAuthoringExtraction({
    workspaceRoot: root,
    run,
    runId: run.runId,
    batch: fixture.batch,
    selectedSources: fixture.selectedSources,
    exclusionApprovals: fixture.exclusionApprovals
  })
  const paths = getRuleAuthoringPaths(root, run.runId)

  assert.equal(extracted.scope.confirmed, false)
  assert.equal(extracted.run.artifacts.sourceIndex, undefined)
  assert.match(extracted.run.artifacts.sourceManifest, /\/generations\/gen-[a-f0-9]{32}\/source-manifest\.json$/)
  assert.match(extracted.run.artifacts.documentChunks, /\/generations\/gen-[a-f0-9]{32}\/document-chunks\.jsonl$/)
  assert.match(extracted.run.artifacts.sourceScope, /\/generations\/gen-[a-f0-9]{32}\/source-scope\.json$/)
  await assert.rejects(fs.lstat(path.join(paths.runDirectory, "source-index.json")), { code: "ENOENT" })
  await assert.rejects(
    store.loadConfirmedRuleAuthoringHandoff({ workspaceRoot: root, runId: run.runId }),
    /not confirmed|consent/i
  )

  const excludedChunkId = fixture.batch.aiChunks[1].chunk_id
  const updated = await store.updateRuleAuthoringScopeSelection({
    run: extracted.run,
    chunkId: excludedChunkId,
    included: false
  })
  await fs.rm(paths.sourceLocationsPath, { force: true })

  const restartedRun = await readRuleAuthoringRun(paths)
  const resumed = await store.resumeRuleAuthoringExtraction(restartedRun)
  assert.deepEqual(
    resumed.scope.chunks.map((chunk) => [chunk.chunk_id, chunk.included]),
    fixture.batch.aiChunks.map((chunk) => [chunk.chunk_id, chunk.chunk_id !== excludedChunkId])
  )
  assert.deepEqual(
    resumed.scope.sources.map((source) => [source.selected_id, source.extraction_status, source.exclusion_approved]),
    [
      ["selected-11111111111111111111111111111111", "success", false],
      ["selected-22222222222222222222222222222222", "blocked", true]
    ]
  )

  await assert.rejects(
    store.confirmRuleAuthoringScope({
      run: updated.run,
      expectedSummary: {
        logicalNames: ["policy.pdf"],
        selectedChunkCount: 2,
        utf8Bytes: 999
      }
    }),
    /displayed|summary|scope/i
  )
  assert.equal(
    (await readRuleAuthoringRun(paths)).artifacts.sourceIndex,
    undefined,
    "a display/canonical mismatch must fail before publishing consent"
  )

  const confirmed = await store.confirmRuleAuthoringScope({
    run: updated.run,
    expectedSummary: {
      logicalNames: ["policy.pdf"],
      selectedChunkCount: 1,
      utf8Bytes: Buffer.byteLength("first selected policy", "utf8")
    }
  })
  assert.equal(confirmed.status, "confirmed")
  assert.equal(confirmed.summary.selectedChunkCount, 1)
  assert.equal(confirmed.summary.utf8Bytes, Buffer.byteLength("first selected policy", "utf8"))
  assert.deepEqual(confirmed.summary.logicalNames, ["policy.pdf"])
  assert.match(confirmed.run.artifacts.sourceIndex, /\/generations\/gen-[a-f0-9]{32}\/source-index\.json$/)

  const handoff = await store.loadConfirmedRuleAuthoringHandoff({
    workspaceRoot: root,
    runId: run.runId
  })
  assert.equal(handoff.scope.confirmed, true)
  assert.equal(handoff.scope.selected_chunk_count, confirmed.summary.selectedChunkCount)
  assert.equal(handoff.scope.selected_text_utf8_bytes, confirmed.summary.utf8Bytes)
  assert.deepEqual(handoff.index.sources.map((source) => source.logical_name), confirmed.summary.logicalNames)
  assert.deepEqual(
    handoff.index.sources.flatMap((source) => source.chunks.map((chunk) => chunk.chunk_id)),
    [fixture.batch.aiChunks[0].chunk_id]
  )
  assert.deepEqual(
    handoff.chunks.map((chunk) => chunk.chunk_id),
    [fixture.batch.aiChunks[0].chunk_id],
    "the downstream handoff must not expose deselected canonical chunks"
  )
})

test("same-basename source outcomes remain bound to stable selected IDs instead of basename", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "same-basename" })
  const fixture = extractionFixture(root)
  const { persistRuleAuthoringExtraction } = artifactStore()

  const result = await persistRuleAuthoringExtraction({
    workspaceRoot: root,
    runId: run.runId,
    run,
    batch: fixture.batch,
    selectedSources: fixture.selectedSources,
    exclusionApprovals: fixture.exclusionApprovals
  })

  assert.deepEqual(result.scope.sources.map((source) => ({
    selected_id: source.selected_id,
    extraction_status: source.extraction_status,
    sha256: source.sha256
  })), [
    {
      selected_id: "selected-11111111111111111111111111111111",
      extraction_status: "success",
      sha256: "a".repeat(64)
    },
    {
      selected_id: "selected-22222222222222222222222222222222",
      extraction_status: "blocked",
      sha256: "b".repeat(64)
    }
  ])
})

test("a duplicate selection retains pathless approval metadata without borrowing the canonical source ID", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "duplicate-scope" })
  const fixture = extractionFixture(root)
  fixture.batch.documents = [fixture.batch.documents[0]]
  fixture.batch.localSourceMappings[1] = {
    logicalName: "policy.pdf",
    absolutePath: fixture.selectedSources[1].absolutePath,
    sha256: "a".repeat(64),
    status: "duplicate"
  }
  fixture.batch.duplicates = [{
    logical_name: "policy.pdf",
    sha256: "a".repeat(64),
    reason: "duplicate_in_run",
    duplicate_of: "policy.pdf"
  }]

  const result = await artifactStore().persistRuleAuthoringExtraction({
    workspaceRoot: root,
    runId: run.runId,
    run,
    batch: fixture.batch,
    selectedSources: fixture.selectedSources,
    exclusionApprovals: fixture.exclusionApprovals
  })

  assert.equal(result.scope.sources[0].source_id, `src-${"a".repeat(12)}`)
  assert.equal(result.scope.sources[1].source_id, undefined)
  assert.equal(result.scope.sources[1].extraction_status, "duplicate")
  assert.equal(result.scope.sources[1].exclusion_approved, true)
})

test("stale concurrent artifact writers cannot mutate the generation referenced by the winner", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "artifact-cas" })
  const fixture = extractionFixture(root)
  const store = artifactStore()
  const extracted = await store.persistRuleAuthoringExtraction({
    workspaceRoot: root,
    runId: run.runId,
    run,
    batch: fixture.batch,
    selectedSources: fixture.selectedSources,
    exclusionApprovals: fixture.exclusionApprovals
  })

  const results = await Promise.allSettled(fixture.batch.aiChunks.map((chunk) => (
    store.updateRuleAuthoringScopeSelection({
      run: extracted.run,
      chunkId: chunk.chunk_id,
      included: false
    })
  )))
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)

  const paths = getRuleAuthoringPaths(root, run.runId)
  const generations = await fs.readdir(paths.generationsDirectory)
  assert.equal(generations.length, 2, "the stale writer must fail before creating a referenced generation")
  const resumed = await store.resumeRuleAuthoringExtraction(await readRuleAuthoringRun(paths))
  assert.equal(resumed.scope.chunks.filter((chunk) => !chunk.included).length, 1)
})

test("missing or tampered pathless scope metadata fails closed", async (t) => {
  const store = artifactStore()

  await t.test("missing scope", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "missing-scope" })
    const fixture = extractionFixture(root)
    const extracted = await store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    })
    await fs.rm(path.join(root, extracted.run.artifacts.sourceScope))
    await assert.rejects(store.resumeRuleAuthoringExtraction(extracted.run), /scope|artifact/i)
  })

  await t.test("tampered revision", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "tampered-scope" })
    const fixture = extractionFixture(root)
    const extracted = await store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    })
    const scopePath = path.join(root, extracted.run.artifacts.sourceScope)
    const scope = JSON.parse(await fs.readFile(scopePath, "utf8"))
    scope.revision_sha256 = "0".repeat(64)
    await fs.writeFile(scopePath, `${JSON.stringify(scope)}\n`, "utf8")
    await assert.rejects(store.resumeRuleAuthoringExtraction(extracted.run), /revision|canonical|scope/i)
  })

  await t.test("tampered exclusion approval", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "tampered-approval" })
    const fixture = extractionFixture(root)
    fixture.exclusionApprovals = []
    const extracted = await store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    })
    const scopePath = path.join(root, extracted.run.artifacts.sourceScope)
    const scope = JSON.parse(await fs.readFile(scopePath, "utf8"))
    assert.equal(scope.sources[1].exclusion_approved, false)
    scope.sources[1].exclusion_approved = true
    await fs.writeFile(scopePath, `${JSON.stringify(scope)}\n`, "utf8")

    await assert.rejects(
      store.resumeRuleAuthoringExtraction(extracted.run),
      /canonical revision|scope revision/i
    )
  })
})

test("initial source-index overflow remains recoverable by deselecting chunks", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "overflow-recovery" })
  const sourceId = `src-${"a".repeat(12)}`
  const heading = "H".repeat(230)
  const chunks = Array.from({ length: 72 }, (_, index) => canonicalChunk(
    sourceId,
    String(index % 10),
    { heading_path: Array.from({ length: 64 }, () => `${heading}${index}`), page: index + 1 },
    `${heading}${index}`
  ))
  const fixture = extractionFixture(root, { chunks })
  const store = artifactStore()
  let state = await store.persistRuleAuthoringExtraction({
    workspaceRoot: root,
    runId: run.runId,
    run,
    batch: fixture.batch,
    selectedSources: fixture.selectedSources,
    exclusionApprovals: fixture.exclusionApprovals
  })

  const overflow = await store.confirmRuleAuthoringScope({ run: state.run })
  assert.equal(overflow.status, "overflow")
  assert.equal(overflow.run.artifacts.sourceIndex, undefined)

  for (const chunk of chunks.slice(-12)) {
    state = await store.updateRuleAuthoringScopeSelection({
      run: state.run,
      chunkId: chunk.chunk_id,
      included: false
    })
  }
  const recovered = await store.confirmRuleAuthoringScope({ run: state.run })
  assert.equal(recovered.status, "confirmed")
  assert.equal(recovered.summary.selectedChunkCount, chunks.length - 12)
})

test("workflow binding is CAS protected and preserves bounded Unicode IDs", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "規約 適用" })
  const { bindRuleAuthoringRunToWorkflow } = artifactStore()

  const results = await Promise.allSettled([
    bindRuleAuthoringRunToWorkflow({ run, workflowRunId: "実行 一" }),
    bindRuleAuthoringRunToWorkflow({ run, workflowRunId: "実行 二" })
  ])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)

  const persisted = await readRuleAuthoringRun(getRuleAuthoringPaths(root, run.runId))
  assert.ok(persisted.workflowRunId === "実行 一" || persisted.workflowRunId === "実行 二")
  await assert.rejects(
    bindRuleAuthoringRunToWorkflow({ run: persisted, workflowRunId: "別 実行" }),
    /another workflow|bound/i
  )
})
