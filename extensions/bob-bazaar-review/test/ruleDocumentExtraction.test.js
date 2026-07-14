const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const {
  extractRuleDocument,
  extractRuleDocuments
} = require("../out/ruleAuthoring/extraction/documentExtractor")

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-documents-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

test("extractRuleDocument classifies legacy Office sources as local-only conversion requests", async (t) => {
  const directory = await temporaryDirectory(t)
  const docPath = path.join(directory, "legacy.doc")
  const xlsPath = path.join(directory, "legacy.xls")
  await fs.writeFile(docPath, "legacy doc bytes")
  await fs.writeFile(xlsPath, "legacy xls bytes")

  for (const filePath of [docPath, xlsPath]) {
    const result = await extractRuleDocument({ filePath })
    assert.equal(result.status, "requires_conversion")
    assert.deepEqual(result.chunks, [])
    assert.equal(result.shareable, false)
    assert.equal(result.localPath, filePath)
    assert.deepEqual(result.warnings, ["conversion_required"])
  }

  const batch = await extractRuleDocuments(
    [{ filePath: docPath }, { filePath: xlsPath }],
    undefined,
    DEFAULT_RULE_AUTHORING_LIMITS
  )
  assert.deepEqual(batch.manifest.sources, [])
  assert.deepEqual(batch.aiChunks, [])
  assert.deepEqual(batch.localSourceMappings.map((item) => item.absolutePath).sort(), [docPath, xlsPath].sort())
  assert.doesNotMatch(JSON.stringify(batch.manifest), new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("extractRuleDocument rejects unsupported extensions without echoing an absolute path", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "secret-source.txt")
  await fs.writeFile(filePath, "private source prose")

  await assert.rejects(
    () => extractRuleDocument({ filePath }),
    (error) => {
      assert.match(error.message, /unsupported.*extension/i)
      assert.doesNotMatch(error.message, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      assert.doesNotMatch(error.message, /private source prose/)
      return true
    }
  )
})

test("extractRuleDocument enforces the default 25 MiB per-source limit before dispatch", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "too-large.pdf")
  await fs.writeFile(filePath, "")
  await fs.truncate(filePath, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes + 1)
  let called = false

  await assert.rejects(
    () => extractRuleDocument({
      filePath,
      limits: { maxSourceBytes: Number.MAX_SAFE_INTEGER },
      pdf: {
        runner: async () => {
          called = true
          return { stdout: Buffer.from("ignored"), stderr: Buffer.alloc(0), exitCode: 0 }
        }
      }
    }),
    /25|source.*limit/i
  )
  assert.equal(called, false)
})

test("extractRuleDocument derives chunk source IDs instead of accepting caller-forged identity", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "identity.pdf")
  await fs.writeFile(filePath, "pdf source bytes")
  const sha256 = createHash("sha256").update("pdf source bytes").digest("hex")

  const result = await extractRuleDocument({
    filePath,
    sourceId: "src-forged",
    pdf: {
      runner: async () => ({
        stdout: Buffer.from("enough extracted PDF text for the source identity"),
        stderr: Buffer.alloc(0),
        exitCode: 0
      })
    }
  })

  assert.ok(result.chunks.length > 0)
  assert.ok(result.chunks.every((chunk) => chunk.source_id === `src-${sha256.slice(0, 12)}`))
})

test("extractRuleDocuments rejects file-count and aggregate-byte overflow before accepting an input prefix", async (t) => {
  const directory = await temporaryDirectory(t)
  const files = [path.join(directory, "a.doc"), path.join(directory, "b.xls")]
  await fs.writeFile(files[0], "abc")
  await fs.writeFile(files[1], "def")

  await assert.rejects(
    () => extractRuleDocuments(files.map((filePath) => ({ filePath })), undefined, {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxSourceFiles: 1
    }),
    /file.*limit/i
  )
  await assert.rejects(
    () => extractRuleDocuments(files.map((filePath) => ({ filePath })).reverse(), undefined, {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxAggregateSourceBytes: 5
    }),
    /aggregate.*limit/i
  )
})

test("extractRuleDocument discards a snapshot changed while the format adapter runs", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "changing.pdf")
  await fs.writeFile(filePath, "before")

  await assert.rejects(
    () => extractRuleDocument({
      filePath,
      pdf: {
        runner: async () => {
          await fs.writeFile(filePath, "after!")
          return { stdout: Buffer.from("extracted stale text"), stderr: Buffer.alloc(0), exitCode: 0 }
        }
      }
    }),
    /source.*changed|fingerprint/i
  )
})

test("extractRuleDocuments reports full-hash duplicates within the run and against an existing manifest independent of input order", async (t) => {
  const directory = await temporaryDirectory(t)
  const paths = {
    alpha: path.join(directory, "alpha.pdf"),
    copy: path.join(directory, "copy.pdf"),
    existing: path.join(directory, "existing-copy.pdf")
  }
  await fs.writeFile(paths.alpha, "same bytes")
  await fs.writeFile(paths.copy, "same bytes")
  await fs.writeFile(paths.existing, "approved bytes")
  const existingHash = createHash("sha256").update("approved bytes").digest("hex")
  const existingManifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T00:00:00.000Z",
    sources: [{
      source_id: `src-${existingHash.slice(0, 12)}`,
      logical_name: "approved.pdf",
      media_type: "pdf",
      sha256: existingHash,
      byte_size: 14,
      extraction_status: "success",
      extractor: { id: "pdftotext", version: "external" },
      warnings: []
    }]
  }
  const runner = async () => ({ stdout: Buffer.from("enough extracted PDF text for rules"), stderr: Buffer.alloc(0), exitCode: 0 })
  const requests = Object.values(paths).map((filePath) => ({ filePath, pdf: { runner } }))

  const forward = await extractRuleDocuments(requests, existingManifest, DEFAULT_RULE_AUTHORING_LIMITS)
  const reverse = await extractRuleDocuments([...requests].reverse(), existingManifest, DEFAULT_RULE_AUTHORING_LIMITS)

  assert.deepEqual(forward.duplicates, reverse.duplicates)
  assert.deepEqual(forward.duplicates.map((item) => item.reason), [
    "duplicate_in_run",
    "duplicate_existing_manifest"
  ])
  assert.ok(forward.duplicates.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)))
  assert.deepEqual(forward.manifest.sources.map((source) => source.logical_name), ["alpha.pdf"])
  assert.doesNotMatch(JSON.stringify(forward.manifest), /bob-rule-documents|enough extracted|absolutePath|localPath/)
})

test("extractRuleDocuments rejects a non-canonical existing manifest before duplicate diagnostics can echo it", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "duplicate.pdf")
  await fs.writeFile(filePath, "approved bytes")
  const sha256 = createHash("sha256").update("approved bytes").digest("hex")
  const malformedManifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T00:00:00.000Z",
    sources: [{
      source_id: "/private/source-id",
      logical_name: "approved.pdf",
      media_type: "pdf",
      sha256,
      byte_size: 14,
      extraction_status: "success",
      extractor: { id: "pdftotext", version: "external" },
      warnings: []
    }]
  }

  await assert.rejects(
    () => extractRuleDocuments([{ filePath }], malformedManifest, DEFAULT_RULE_AUTHORING_LIMITS),
    (error) => {
      assert.match(error.message, /existing.*manifest.*canonical|manifest.*invalid/i)
      assert.doesNotMatch(error.message, /private|source-id/)
      return true
    }
  )
})
