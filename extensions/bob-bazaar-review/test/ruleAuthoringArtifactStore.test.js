const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { buildDocumentChunkId } = require("../out/ruleAuthoring/documentChunk")
const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")
const { createDocxFixture } = require("./helpers/ruleDocumentFixtures")
const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  createRuleAuthoringRun,
  readRuleAuthoringRun,
  writeRuleAuthoringRun
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
    existingManifest: undefined,
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

function artifactPointer(root, runId, basename, generationByte = "1") {
  const paths = getRuleAuthoringPaths(root, runId)
  return path.relative(
    root,
    path.join(paths.generationsDirectory, `gen-${generationByte.repeat(32)}`, basename)
  )
}

async function writeArtifacts(run, artifacts) {
  const next = {
    ...run,
    artifacts,
    updatedAt: new Date(Date.parse(run.updatedAt) + 1).toISOString()
  }
  await writeRuleAuthoringRun(next, run.updatedAt)
  return next
}

function renameFixtureSources(fixture, logicalName) {
  for (const source of fixture.selectedSources) source.logicalName = logicalName
  for (const source of fixture.batch.manifest.sources) source.logical_name = logicalName
  for (const document of fixture.batch.documents) document.logicalName = logicalName
  for (const mapping of fixture.batch.localSourceMappings) mapping.logicalName = logicalName
  for (const diagnostic of fixture.batch.diagnostics) diagnostic.logical_name = logicalName
  return fixture
}

function duplicateMultiplicityFixture(root, mode) {
  const logicalName = "policy.pdf"
  const sourceHash = "a".repeat(64)
  const sourceId = `src-${sourceHash.slice(0, 12)}`
  const count = mode === "existing" ? 2 : 3
  const selectedSources = Array.from({ length: count }, (_, index) => ({
    selectedId: `selected-${String(index + 1).repeat(32)}`,
    absolutePath: path.join(root, String(index + 1), logicalName),
    logicalName,
    mediaType: "pdf",
    byteSize: 42
  }))
  const canonical = canonicalChunk(sourceId, "canonical policy")
  const hasCanonical = mode === "in_run"
  const duplicateCount = hasCanonical ? count - 1 : count
  const existingManifest = hasCanonical ? undefined : {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T00:00:00.000Z",
    sources: [{
      source_id: sourceId,
      logical_name: "approved.pdf",
      media_type: "pdf",
      sha256: sourceHash,
      byte_size: 42,
      extraction_status: "success",
      extractor: { id: "fixture", version: "1" },
      warnings: []
    }]
  }
  return {
    existingManifest,
    selectedSources,
    exclusionApprovals: selectedSources.slice(hasCanonical ? 1 : 0).map((source) => ({
      selectedId: source.selectedId,
      approved: true
    })),
    batch: {
      manifest: {
        schema_version: "bob-bazaar-review/rule-sources/v1",
        generated_at: "2026-07-15T00:00:00.000Z",
        sources: hasCanonical ? [{
          source_id: sourceId,
          logical_name: logicalName,
          media_type: "pdf",
          sha256: sourceHash,
          byte_size: 42,
          extraction_status: "success",
          extractor: { id: "fixture", version: "1" },
          warnings: []
        }] : []
      },
      documents: hasCanonical ? [{
        logicalName,
        mediaType: "pdf",
        byteSize: 42,
        sha256: sourceHash,
        status: "success",
        warnings: [],
        extractor: { id: "fixture", version: "1" },
        chunks: [canonical],
        shareable: true,
        localPath: selectedSources[0].absolutePath
      }] : [],
      aiChunks: hasCanonical ? [canonical] : [],
      localSourceMappings: selectedSources.map((source, index) => ({
        logicalName,
        absolutePath: source.absolutePath,
        sha256: sourceHash,
        status: hasCanonical && index === 0 ? "success" : "duplicate"
      })),
      duplicates: Array.from({ length: duplicateCount }, () => ({
        logical_name: logicalName,
        sha256: sourceHash,
        reason: hasCanonical ? "duplicate_in_run" : "duplicate_existing_manifest",
        duplicate_of: hasCanonical ? logicalName : sourceId
      })),
      diagnostics: []
    }
  }
}

async function legacyDuplicateFixture(root, extension, mode, requestedCount) {
  const logicalName = `legacy.${extension}`
  const bytes = Buffer.from(`identical legacy ${extension} bytes`)
  const sha = sha256(bytes.toString("utf8"))
  const count = requestedCount ?? (mode === "existing" ? 2 : 3)
  const selectedSources = []
  const requests = []
  for (let index = 0; index < count; index += 1) {
    const directory = path.join(root, `legacy-${extension}-${index + 1}`)
    const absolutePath = path.join(directory, logicalName)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(absolutePath, bytes)
    selectedSources.push({
      selectedId: `selected-${String(index + 1).repeat(32)}`,
      absolutePath,
      logicalName,
      mediaType: extension,
      byteSize: bytes.length
    })
    requests.push({ filePath: absolutePath, logicalName })
  }
  const existingManifest = mode === "existing" ? {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T00:00:00.000Z",
    sources: [{
      source_id: `src-${sha.slice(0, 12)}`,
      logical_name: "approved.pdf",
      media_type: "pdf",
      sha256: sha,
      byte_size: bytes.length,
      extraction_status: "success",
      extractor: { id: "fixture", version: "1" },
      warnings: []
    }]
  } : undefined
  const batch = await extractRuleDocuments(requests, existingManifest)
  return {
    batch,
    existingManifest,
    selectedSources,
    exclusionApprovals: selectedSources.map((source) => ({
      selectedId: source.selectedId,
      approved: true
    }))
  }
}

async function mixedModernLegacyFixture(root, canonicalKind) {
  const names = canonicalKind === "modern"
    ? ["a.docx", "b.doc"]
    : ["a.doc", "b.doc", "c.docx"]
  const bytes = createDocxFixture()
  const selectedSources = []
  const requests = []
  for (const [index, logicalName] of names.entries()) {
    const directory = path.join(root, `mixed-${canonicalKind}-${index + 1}`)
    const absolutePath = path.join(directory, logicalName)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(absolutePath, bytes)
    selectedSources.push({
      selectedId: `selected-${String(index + 1).repeat(32)}`,
      absolutePath,
      logicalName,
      mediaType: path.extname(logicalName).slice(1),
      byteSize: bytes.length
    })
    requests.push({ filePath: absolutePath, logicalName })
  }
  const batch = await extractRuleDocuments(requests, undefined)
  return {
    batch,
    existingManifest: undefined,
    selectedSources,
    exclusionApprovals: selectedSources
      .filter((source) => {
        const mapping = batch.localSourceMappings.find((candidate) => candidate.absolutePath === source.absolutePath)
        return mapping?.status !== "success"
      })
      .map((source) => ({ selectedId: source.selectedId, approved: true }))
  }
}

test("resume treats a pointer-free run as empty but rejects inconsistent artifact lifecycles", async (t) => {
  const store = artifactStore()

  await t.test("fresh run", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "fresh-resume" })
    const resumed = await store.resumeRuleAuthoringExtraction(run)

    assert.deepEqual(resumed, {
      run,
      sources: [],
      chunks: [],
      includedChunkIds: []
    })
  })

  await t.test("invalidated run after restart", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "invalidated-resume" })
    const withExtraction = await writeArtifacts(run, {
      sourceManifest: artifactPointer(root, run.runId, "source-manifest.json"),
      documentChunks: artifactPointer(root, run.runId, "document-chunks.jsonl"),
      sourceScope: artifactPointer(root, run.runId, "source-scope.json")
    })
    const invalidated = await store.invalidateRuleAuthoringExtraction({ run: withExtraction })
    const restarted = await readRuleAuthoringRun(getRuleAuthoringPaths(root, run.runId))
    assert.equal(restarted.updatedAt, invalidated.updatedAt)

    const resumed = await store.resumeRuleAuthoringExtraction(restarted)
    assert.deepEqual(resumed.sources, [])
    assert.deepEqual(resumed.chunks, [])
    assert.deepEqual(resumed.includedChunkIds, [])
    assert.equal(Object.hasOwn(resumed, "scope"), false)
  })

  await t.test("partial Task 7 pointer set", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "partial-pointer-resume" })
    const partial = await writeArtifacts(run, {
      sourceManifest: artifactPointer(root, run.runId, "source-manifest.json")
    })

    await assert.rejects(store.resumeRuleAuthoringExtraction(partial), /partial|inconsistent.*artifact/i)
  })

  await t.test("downstream pointer without Task 7 scope", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "downstream-only-resume" })
    const downstreamOnly = await writeArtifacts(run, {
      evidenceSelection: artifactPointer(root, run.runId, "evidence-selection.json")
    })

    await assert.rejects(
      store.resumeRuleAuthoringExtraction(downstreamOnly),
      /downstream.*without.*extraction|inconsistent.*artifact/i
    )
  })
})

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
    existingManifest: fixture.existingManifest,
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
  assert.deepEqual(Object.keys(handoff).sort(), ["chunks", "index", "run", "summary"])
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

test("confirmed handoff exposes only selected sanitizer-backed source metadata", async (t) => {
  const cases = [
    ["api_key=supersecret.pdf", "api_key=[REDACTED_SECRET]"],
    ["C:private.pdf", "[REDACTED_PATH]"]
  ]

  for (const [rawName, safeName] of cases) {
    await t.test(rawName, async (t) => {
      const root = await workspace(t)
      const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: `safe-handoff-${safeName.length}` })
      const fixture = renameFixtureSources(extractionFixture(root), rawName)
      const store = artifactStore()
      const extracted = await store.persistRuleAuthoringExtraction({
        workspaceRoot: root,
        runId: run.runId,
        run,
        batch: fixture.batch,
        existingManifest: fixture.existingManifest,
        selectedSources: fixture.selectedSources,
        exclusionApprovals: fixture.exclusionApprovals
      })
      const confirmed = await store.confirmRuleAuthoringScope({
        run: extracted.run,
        expectedSummary: {
          logicalNames: [safeName],
          selectedChunkCount: 2,
          utf8Bytes: fixture.batch.aiChunks.reduce(
            (total, chunk) => total + Buffer.byteLength(chunk.text, "utf8"),
            0
          )
        }
      })
      assert.equal(confirmed.status, "confirmed")

      const handoff = await store.loadConfirmedRuleAuthoringHandoff({
        workspaceRoot: root,
        runId: run.runId
      })
      assert.deepEqual(Object.keys(handoff).sort(), ["chunks", "index", "run", "summary"])
      assert.deepEqual(handoff.index.sources.map((source) => source.logical_name), [safeName])
      assert.deepEqual(handoff.summary.logicalNames, [safeName])
      assert.equal(JSON.stringify(handoff).includes(rawName), false)
      assert.equal(Object.hasOwn(handoff, "scope"), false)
      assert.equal(Object.hasOwn(handoff, "manifest"), false)
    })
  }
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
    existingManifest: fixture.existingManifest,
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
    existingManifest: fixture.existingManifest,
    selectedSources: fixture.selectedSources,
    exclusionApprovals: fixture.exclusionApprovals
  })

  assert.equal(result.scope.sources[0].source_id, `src-${"a".repeat(12)}`)
  assert.equal(result.scope.sources[1].source_id, undefined)
  assert.equal(result.scope.sources[1].extraction_status, "duplicate")
  assert.equal(result.scope.sources[1].exclusion_approved, true)
})

test("duplicate scope metadata consumes identical records one-for-one", async (t) => {
  const store = artifactStore()

  for (const [mode, expectedCount] of [["existing", 2], ["in_run", 2]]) {
    await t.test(`${mode} multiplicity`, async (t) => {
      const root = await workspace(t)
      const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: `duplicates-${mode}` })
      const fixture = duplicateMultiplicityFixture(root, mode)
      const result = await store.persistRuleAuthoringExtraction({
        workspaceRoot: root,
        runId: run.runId,
        run,
        batch: fixture.batch,
        existingManifest: fixture.existingManifest,
        selectedSources: fixture.selectedSources,
        exclusionApprovals: fixture.exclusionApprovals
      })

      assert.equal(result.scope.sources.filter((source) => source.extraction_status === "duplicate").length, expectedCount)
      assert.ok(result.scope.sources
        .filter((source) => source.extraction_status === "duplicate")
        .every((source) => source.duplicate !== null && source.exclusion_approved))
    })
  }

  await t.test("missing record", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "duplicates-missing" })
    const fixture = duplicateMultiplicityFixture(root, "existing")
    fixture.batch.duplicates.pop()

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: fixture.existingManifest,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*missing|multiplicity/i)
  })

  await t.test("leftover record", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "duplicates-leftover" })
    const fixture = duplicateMultiplicityFixture(root, "existing")
    fixture.batch.duplicates.push(structuredClone(fixture.batch.duplicates[0]))

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: fixture.existingManifest,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*leftover|multiplicity|ambiguous/i)
  })
})

test("real legacy Office duplicate batches persist conversion scope with producer multiplicity", async (t) => {
  const store = artifactStore()

  for (const extension of ["doc", "xls"]) {
    for (const mode of ["in_run", "existing"]) {
      await t.test(`${extension} ${mode}`, async (t) => {
        const root = await workspace(t)
        const fixture = await legacyDuplicateFixture(root, extension, mode)
        const expectedDuplicates = mode === "existing"
          ? fixture.selectedSources.length
          : fixture.selectedSources.length - 1
        assert.equal(fixture.batch.duplicates.length, expectedDuplicates)
        assert.ok(fixture.batch.duplicates.every((record) => (
          record.reason === (mode === "existing" ? "duplicate_existing_manifest" : "duplicate_in_run")
        )))
        assert.deepEqual(
          fixture.batch.localSourceMappings.map((mapping) => mapping.status),
          fixture.selectedSources.map(() => "requires_conversion")
        )
        assert.deepEqual(
          fixture.batch.documents.map((document) => document.status),
          fixture.selectedSources.map(() => "requires_conversion")
        )

        const run = await createRuleAuthoringRun({
          workspaceRoot: root,
          runId: `legacy-${extension}-${mode}`
        })
        const persisted = await store.persistRuleAuthoringExtraction({
          workspaceRoot: root,
          runId: run.runId,
          run,
          batch: fixture.batch,
          existingManifest: fixture.existingManifest,
          selectedSources: fixture.selectedSources,
          exclusionApprovals: fixture.exclusionApprovals
        })

        assert.deepEqual(
          persisted.scope.sources.map((source) => source.extraction_status),
          fixture.selectedSources.map(() => "requires_conversion")
        )
        assert.ok(persisted.scope.sources.every((source) => (
          source.duplicate === null &&
          source.source_id === undefined &&
          source.exclusion_approved
        )))
        const resumed = await store.resumeRuleAuthoringExtraction(
          await readRuleAuthoringRun(getRuleAuthoringPaths(root, run.runId))
        )
        assert.deepEqual(
          resumed.sources.map((source) => [source.extractionStatus, source.exclusionApproved]),
          fixture.selectedSources.map(() => ["requires_conversion", true])
        )
      })
    }
  }
})

test("real mixed modern and legacy duplicate batches account for only legacy informational records", async (t) => {
  const store = artifactStore()

  for (const canonicalKind of ["modern", "legacy"]) {
    await t.test(`${canonicalKind} canonical`, async (t) => {
      const root = await workspace(t)
      const fixture = await mixedModernLegacyFixture(root, canonicalKind)
      const expectedStatuses = canonicalKind === "modern"
        ? ["partial", "requires_conversion"]
        : ["requires_conversion", "requires_conversion", "duplicate"]
      assert.deepEqual(
        fixture.selectedSources.map((source) => (
          fixture.batch.localSourceMappings.find((mapping) => mapping.absolutePath === source.absolutePath)?.status
        )),
        expectedStatuses
      )
      assert.equal(fixture.batch.duplicates.length, canonicalKind === "modern" ? 1 : 2)

      const run = await createRuleAuthoringRun({
        workspaceRoot: root,
        runId: `mixed-${canonicalKind}-canonical`
      })
      const persisted = await store.persistRuleAuthoringExtraction({
        workspaceRoot: root,
        runId: run.runId,
        run,
        batch: fixture.batch,
        existingManifest: fixture.existingManifest,
        selectedSources: fixture.selectedSources,
        exclusionApprovals: fixture.exclusionApprovals
      })

      assert.deepEqual(
        persisted.scope.sources.map((source) => source.extraction_status),
        expectedStatuses
      )
      assert.equal(
        persisted.scope.sources.filter((source) => source.duplicate !== null).length,
        canonicalKind === "modern" ? 0 : 1
      )
      assert.ok(persisted.scope.sources
        .filter((source) => source.extraction_status === "requires_conversion")
        .every((source) => source.duplicate === null && source.exclusion_approved))
    })
  }
})

test("legacy informational duplicate validation rejects malformed and wrong multiplicity", async (t) => {
  const store = artifactStore()
  const mutations = [
    ["malformed", (batch) => { batch.duplicates[0].duplicate_of = "" }],
    ["mixed reasons", (batch) => { batch.duplicates[0].reason = "duplicate_existing_manifest" }],
    ["excess", (batch) => { batch.duplicates.push(structuredClone(batch.duplicates[0])) }],
    ["missing", (batch) => { batch.duplicates.pop() }]
  ]

  for (const [label, mutate] of mutations) {
    await t.test(label, async (t) => {
      const root = await workspace(t)
      const fixture = await legacyDuplicateFixture(root, "doc", "in_run")
      mutate(fixture.batch)
      const run = await createRuleAuthoringRun({
        workspaceRoot: root,
        runId: `legacy-invalid-${label.replaceAll(" ", "-")}`
      })

      await assert.rejects(store.persistRuleAuthoringExtraction({
        workspaceRoot: root,
        runId: run.runId,
        run,
        batch: fixture.batch,
        existingManifest: fixture.existingManifest,
        selectedSources: fixture.selectedSources,
        exclusionApprovals: fixture.exclusionApprovals
      }), /duplicate.*(?:metadata|multiplicity|producer|legacy)/i)
    })
  }
})

test("complete extractor duplicate metadata is required before path-bound consumption", async (t) => {
  const store = artifactStore()

  await t.test("in-run legacy group with its only record removed", async (t) => {
    const root = await workspace(t)
    const fixture = await legacyDuplicateFixture(root, "doc", "in_run", 2)
    assert.equal(fixture.batch.duplicates.length, 1)
    fixture.batch.duplicates = []
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "missing-all-in-run" })

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: fixture.existingManifest,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*(?:missing|batch|multiplicity|base|context)/i)
  })

  await t.test("existing-manifest legacy group with every record removed", async (t) => {
    const root = await workspace(t)
    const fixture = await legacyDuplicateFixture(root, "xls", "existing")
    assert.equal(fixture.batch.duplicates.length, fixture.selectedSources.length)
    fixture.batch.duplicates = []
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "missing-all-existing" })

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: fixture.existingManifest,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*(?:missing|batch|multiplicity|base|context)/i)
  })

  await t.test("mixed modern and legacy group with its only informational record removed", async (t) => {
    const root = await workspace(t)
    const fixture = await mixedModernLegacyFixture(root, "modern")
    assert.equal(fixture.batch.duplicates.length, 1)
    fixture.batch.duplicates = []
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "missing-all-mixed" })

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: fixture.existingManifest,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*(?:missing|batch|multiplicity|base|context)/i)
  })

  await t.test("consumed modern duplicate cannot hide a missing legacy record", async (t) => {
    const root = await workspace(t)
    const fixture = await mixedModernLegacyFixture(root, "legacy")
    assert.deepEqual(
      fixture.batch.duplicates.map((record) => record.logical_name),
      ["b.doc", "c.docx"]
    )
    fixture.batch.duplicates = fixture.batch.duplicates.filter((record) => record.logical_name === "c.docx")
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "missing-legacy-after-consume" })

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: fixture.existingManifest,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*(?:missing|batch|multiplicity|base|context)/i)
  })

  await t.test("existing-manifest claim without its extraction base context", async (t) => {
    const root = await workspace(t)
    const fixture = await legacyDuplicateFixture(root, "doc", "existing")
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "existing-without-base" })

    await assert.rejects(store.persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: undefined,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /duplicate.*(?:missing|batch|multiplicity|base|context|existing)/i)
  })
})

test("artifact persistence requires one canonical extraction base property", async (t) => {
  await t.test("property is omitted", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "omitted-extraction-base" })
    const fixture = extractionFixture(root)

    await assert.rejects(artifactStore().persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /(?:extraction|duplicate).*(?:base|context|manifest|required)/i)
  })

  await t.test("property contains a noncanonical manifest", async (t) => {
    const root = await workspace(t)
    const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "noncanonical-extraction-base" })
    const fixture = extractionFixture(root)

    await assert.rejects(artifactStore().persistRuleAuthoringExtraction({
      workspaceRoot: root,
      runId: run.runId,
      run,
      batch: fixture.batch,
      existingManifest: {
        schema_version: "bob-bazaar-review/rule-sources/v1",
        generated_at: "2026-07-15T00:00:00.000Z",
        sources: [],
        unexpected: true
      },
      selectedSources: fixture.selectedSources,
      exclusionApprovals: fixture.exclusionApprovals
    }), /manifest.*canonical|canonical.*manifest/i)
  })
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
    existingManifest: fixture.existingManifest,
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
      existingManifest: fixture.existingManifest,
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
      existingManifest: fixture.existingManifest,
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
      existingManifest: fixture.existingManifest,
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
    existingManifest: fixture.existingManifest,
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
