const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")
const zlib = require("node:zlib")

const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const {
  extractRuleDocument,
  extractRuleDocuments
} = require("../out/ruleAuthoring/extraction/documentExtractor")
const { createDocxFixture, createXlsxFixture } = require("./helpers/ruleDocumentFixtures")
const { createStoredZip } = require("./helpers/storedZipFixture")

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-documents-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

function freshExtractionProbe(filePath, expectedError, expectedLoads) {
  const documentExtractorPath = path.join(
    __dirname,
    "..",
    "out",
    "ruleAuthoring",
    "extraction",
    "documentExtractor.js"
  )
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    const loads = { mammoth: 0, excel: 0, fflate: 0 }
    Module._load = function(request, parent, isMain) {
      if (request === "mammoth") loads.mammoth += 1
      if (request === "read-excel-file/node") loads.excel += 1
      if (request === "fflate") loads.fflate += 1
      return originalLoad.call(this, request, parent, isMain)
    }
    require(${JSON.stringify(documentExtractorPath)}).extractRuleDocument({ filePath: ${JSON.stringify(filePath)} })
      .then(() => { throw new Error("invalid OOXML unexpectedly reached extraction success") })
      .catch((error) => {
        if (!${expectedError.toString()}.test(error.message)) throw error
        const expected = ${JSON.stringify(expectedLoads)}
        for (const [name, count] of Object.entries(expected)) {
          if (loads[name] !== count) throw new Error(name + " loads: " + loads[name])
        }
      })
  `
  return spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })
}

test("extractRuleDocument validates a normal DOCX stored-entry CRC before loading Mammoth", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "bad-crc.docx")
  await fs.writeFile(filePath, createDocxFixture({
    additionalEntries: [{ name: "custom/bad-crc.bin", data: Buffer.from("tampered"), crc32: 0 }]
  }))

  const result = freshExtractionProbe(filePath, /CRC/i, { mammoth: 0 })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocument consumes a normal XLSX deflate payload exactly before loading any parser", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "trailing-deflate.xlsx")
  const inflated = Buffer.from("validated")
  const compressed = Buffer.concat([zlib.deflateRawSync(inflated), Buffer.from("junk")])
  await fs.writeFile(filePath, createXlsxFixture({
    additionalEntries: [{
      name: "custom/trailing-deflate.bin",
      data: compressed,
      crc32: crc32(inflated),
      compressionMethod: 8,
      compressedSize: compressed.length,
      uncompressedSize: inflated.length
    }]
  }))

  const result = freshExtractionProbe(filePath, /consumed exactly/i, { excel: 0, fflate: 0 })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocument bounds every normal OOXML deflate payload before loading a parser", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "under-declared.docx")
  const inflated = Buffer.alloc(2 * 1024 * 1024, 0x41)
  const compressed = zlib.deflateRawSync(inflated)
  await fs.writeFile(filePath, createDocxFixture({
    additionalEntries: [{
      name: "custom/under-declared.bin",
      data: compressed,
      compressionMethod: 8,
      compressedSize: compressed.length,
      uncompressedSize: 1
    }]
  }))

  const result = freshExtractionProbe(filePath, /deflate output.*declared size/i, { mammoth: 0 })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocument gives DOCX and normal XLSX parsers only validated snapshot Buffers", async (t) => {
  const directory = await temporaryDirectory(t)
  const docxPath = path.join(directory, "rules.docx")
  const xlsxPath = path.join(directory, "rules.xlsx")
  await fs.writeFile(docxPath, createDocxFixture())
  await fs.writeFile(xlsxPath, createXlsxFixture())
  const docxExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "docxExtractor.js")
  const xlsxExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "xlsxExtractor.js")
  const documentExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "documentExtractor.js")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let docxBufferSeen = false
    let xlsxBufferSeen = false
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain)
      if (request === "mammoth" && parent?.filename === ${JSON.stringify(docxExtractorPath)}) {
        return {
          ...loaded,
          async convertToHtml(input, options) {
            if (!Buffer.isBuffer(input?.buffer) || Object.hasOwn(input, "path")) {
              throw new Error("DOCX parser did not receive a Buffer-only input")
            }
            docxBufferSeen = true
            return loaded.convertToHtml(input, options)
          }
        }
      }
      if (request === "read-excel-file/node" && parent?.filename === ${JSON.stringify(xlsxExtractorPath)}) {
        const wrapped = async function(input, options) {
          if (!Buffer.isBuffer(input)) throw new Error("XLSX parser did not receive a Buffer")
          xlsxBufferSeen = true
          return loaded(input, options)
        }
        Object.assign(wrapped, loaded)
        return wrapped
      }
      return loaded
    }
    const { extractRuleDocument } = require(${JSON.stringify(documentExtractorPath)})
    Promise.resolve()
      .then(() => extractRuleDocument({ filePath: ${JSON.stringify(docxPath)} }))
      .then(() => extractRuleDocument({ filePath: ${JSON.stringify(xlsxPath)} }))
      .then(() => {
        if (!docxBufferSeen) throw new Error("DOCX Buffer input was not observed")
        if (!xlsxBufferSeen) throw new Error("XLSX Buffer input was not observed")
      })
  `

  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocuments rejects a same-size same-mtime OOXML replacement before parser load", async (t) => {
  const directory = await temporaryDirectory(t)
  const triggerPath = path.join(directory, "a-trigger.pdf")
  const docxPath = path.join(directory, "z-rules.docx")
  const original = createDocxFixture()
  const replacement = Buffer.from(original)
  const payloadOffset = replacement.indexOf(Buffer.from("Review every change."))
  assert.ok(payloadOffset >= 0)
  replacement[payloadOffset] ^= 0x01
  await fs.writeFile(triggerPath, "trigger")
  await fs.writeFile(docxPath, original)
  const originalStat = await fs.stat(docxPath, { bigint: true })
  const documentExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "documentExtractor.js")
  const script = `
    const Module = require("node:module")
    const fs = require("node:fs/promises")
    const originalLoad = Module._load
    let mammothLoads = 0
    Module._load = function(request, parent, isMain) {
      if (request === "mammoth") mammothLoads += 1
      return originalLoad.call(this, request, parent, isMain)
    }
    const replacement = Buffer.from(${JSON.stringify(replacement.toString("base64"))}, "base64")
    require(${JSON.stringify(documentExtractorPath)}).extractRuleDocuments([
      {
        filePath: ${JSON.stringify(triggerPath)},
        pdf: {
          runner: async () => {
            await fs.writeFile(${JSON.stringify(docxPath)}, replacement)
            await fs.utimes(
              ${JSON.stringify(docxPath)},
              new Date(${Number(originalStat.atimeNs / 1_000_000n)}),
              new Date(${Number(originalStat.mtimeNs / 1_000_000n)})
            )
            return { stdout: Buffer.from("trigger"), stderr: Buffer.alloc(0), exitCode: 0 }
          }
        }
      },
      { filePath: ${JSON.stringify(docxPath)} }
    ], undefined)
      .then(() => { throw new Error("replaced OOXML unexpectedly extracted") })
      .catch((error) => {
        if (!/fingerprint|source.*changed/i.test(error.message)) throw error
        if (mammothLoads !== 0) throw new Error("mammoth loads: " + mammothLoads)
      })
  `

  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

test("extractRuleDocument rebuilds a validated missing-both XLSX only in memory", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "minimal.xlsx")
  await fs.writeFile(filePath, createXlsxFixture({ omitStyles: true }))

  const result = await extractRuleDocument({ filePath })

  assert.equal(result.status, "success")
  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row]), [
    ["Second", 1],
    ["Second", 3],
    ["First", 2]
  ])
})

test("extractRuleDocument rejects an invalid XLSX in preflight before an extension fflate load", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "duplicate-entry.xlsx")
  await fs.writeFile(filePath, createStoredZip([
    { name: "[Content_Types].xml", data: "types" },
    { name: "xl/workbook.xml", data: "first" },
    { name: "xl/workbook.xml", data: "second" }
  ]))
  const archivePath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "ooxmlArchive.js")
  const documentExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "documentExtractor.js")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let compatibilityLoads = 0
    Module._load = function(request, parent, isMain) {
      if (request === "fflate" && parent?.filename === ${JSON.stringify(archivePath)}) compatibilityLoads += 1
      return originalLoad.call(this, request, parent, isMain)
    }
    require(${JSON.stringify(documentExtractorPath)}).extractRuleDocument({ filePath: ${JSON.stringify(filePath)} })
      .then(() => { throw new Error("invalid XLSX unexpectedly extracted") })
      .catch((error) => {
        if (!/duplicate entry/i.test(error.message)) throw error
        if (compatibilityLoads !== 0) throw new Error("fflate compatibility loads: " + compatibilityLoads)
      })
  `
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocument rejects a stored-size mismatch before an extension fflate load", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "stored-size-mismatch.xlsx")
  await fs.writeFile(filePath, createStoredZip([
    { name: "[Content_Types].xml", data: "types" },
    { name: "xl/workbook.xml", data: Buffer.alloc(1024), uncompressedSize: 0 }
  ]))
  const archivePath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "ooxmlArchive.js")
  const documentExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "documentExtractor.js")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let compatibilityLoads = 0
    Module._load = function(request, parent, isMain) {
      if (request === "fflate" && parent?.filename === ${JSON.stringify(archivePath)}) compatibilityLoads += 1
      return originalLoad.call(this, request, parent, isMain)
    }
    require(${JSON.stringify(documentExtractorPath)}).extractRuleDocument({ filePath: ${JSON.stringify(filePath)} })
      .then(() => { throw new Error("invalid XLSX unexpectedly extracted") })
      .catch((error) => {
        if (!/stored entry size mismatch/i.test(error.message)) throw error
        if (compatibilityLoads !== 0) throw new Error("fflate compatibility loads: " + compatibilityLoads)
      })
  `
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocument rejects a truncated stored payload in preflight before an extension fflate load", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "truncated-stored-payload.xlsx")
  await fs.writeFile(filePath, createStoredZip([
    { name: "[Content_Types].xml", data: "types" },
    { name: "xl/workbook.xml", data: Buffer.from("x"), compressedSize: 1024, uncompressedSize: 1024 }
  ]))
  const archivePath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "ooxmlArchive.js")
  const documentExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "documentExtractor.js")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let compatibilityLoads = 0
    Module._load = function(request, parent, isMain) {
      if (request === "fflate" && parent?.filename === ${JSON.stringify(archivePath)}) compatibilityLoads += 1
      return originalLoad.call(this, request, parent, isMain)
    }
    require(${JSON.stringify(documentExtractorPath)}).extractRuleDocument({ filePath: ${JSON.stringify(filePath)} })
      .then(() => { throw new Error("invalid XLSX unexpectedly extracted") })
      .catch((error) => {
        if (!/entry payload.*truncated/i.test(error.message)) throw error
        if (compatibilityLoads !== 0) throw new Error("fflate compatibility loads: " + compatibilityLoads)
      })
  `
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

test("extractRuleDocument bounds deflate output before loading fflate or read-excel-file", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "under-declared-deflate.xlsx")
  const inflated = Buffer.alloc(2 * 1024 * 1024, 0x41)
  const compressed = zlib.deflateRawSync(inflated)
  await fs.writeFile(filePath, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{
      name: "custom/under-declared.bin",
      data: compressed,
      compressionMethod: 8,
      compressedSize: compressed.length,
      uncompressedSize: 1
    }]
  }))
  const archivePath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "ooxmlArchive.js")
  const documentExtractorPath = path.join(__dirname, "..", "out", "ruleAuthoring", "extraction", "documentExtractor.js")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let compatibilityLoads = 0
    let parserLoads = 0
    Module._load = function(request, parent, isMain) {
      if (request === "fflate" && parent?.filename === ${JSON.stringify(archivePath)}) compatibilityLoads += 1
      if (request === "read-excel-file/node") parserLoads += 1
      return originalLoad.call(this, request, parent, isMain)
    }
    require(${JSON.stringify(documentExtractorPath)}).extractRuleDocument({ filePath: ${JSON.stringify(filePath)} })
      .then(() => { throw new Error("invalid XLSX unexpectedly extracted") })
      .catch((error) => {
        if (!/deflate output.*declared size/i.test(error.message)) throw error
        if (compatibilityLoads !== 0) throw new Error("fflate compatibility loads: " + compatibilityLoads)
        if (parserLoads !== 0) throw new Error("read-excel-file loads: " + parserLoads)
      })
  `
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

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

test("extractRuleDocument rejects a logical name whose extension relabels the selected path", async (t) => {
  const directory = await temporaryDirectory(t)
  const legacyPath = path.join(directory, "actual.doc")
  const pdfPath = path.join(directory, "actual.pdf")
  await fs.writeFile(legacyPath, "legacy bytes")
  await fs.writeFile(pdfPath, "pdf bytes")
  let pdfRunnerCalled = false

  await assert.rejects(
    () => extractRuleDocument({
      filePath: legacyPath,
      logicalName: "relabeled.pdf",
      pdf: {
        runner: async () => {
          pdfRunnerCalled = true
          return { stdout: Buffer.from("must not run"), stderr: Buffer.alloc(0), exitCode: 0 }
        }
      }
    }),
    /logical name.*extension.*selected path|extension.*match/i
  )
  await assert.rejects(
    () => extractRuleDocument({ filePath: pdfPath, logicalName: "relabeled.doc" }),
    /logical name.*extension.*selected path|extension.*match/i
  )
  assert.equal(pdfRunnerCalled, false)
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

test("extractRuleDocuments clamps caller-raised file, source, and aggregate byte ceilings", async (t) => {
  const directory = await temporaryDirectory(t)
  const raisedLimits = {
    ...DEFAULT_RULE_AUTHORING_LIMITS,
    maxSourceFiles: DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles + 100,
    maxSourceBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes * 4,
    maxAggregateSourceBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes * 4
  }

  await assert.rejects(
    () => extractRuleDocuments(
      Array.from({ length: DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles + 1 }, (_, index) => ({
        filePath: path.join(directory, `missing-${index}.doc`)
      })),
      undefined,
      raisedLimits
    ),
    /file.*limit/i
  )

  const oversizedPath = path.join(directory, "oversized.pdf")
  await fs.writeFile(oversizedPath, "")
  await fs.truncate(oversizedPath, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes + 1)
  await assert.rejects(
    () => extractRuleDocuments([{ filePath: oversizedPath }], undefined, raisedLimits),
    /per-source limit/i
  )

  const aggregateSource = path.join(directory, "aggregate-0.doc")
  await fs.writeFile(aggregateSource, "")
  await fs.truncate(aggregateSource, 20 * 1024 * 1024 + 1)
  const aggregatePaths = [aggregateSource]
  for (let index = 1; index < 5; index += 1) {
    const hardLink = path.join(directory, `aggregate-${index}.doc`)
    await fs.link(aggregateSource, hardLink)
    aggregatePaths.push(hardLink)
  }
  await assert.rejects(
    () => extractRuleDocuments(
      aggregatePaths.map((filePath) => ({ filePath })),
      undefined,
      raisedLimits
    ),
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
      extractor: { id: "pdf-pdftotext-layout", version: "1" },
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
      extractor: { id: "pdf-pdftotext-layout", version: "1" },
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

test("extractRuleDocuments classifies duplicate legacy Office requests as requires_conversion", async (t) => {
  const directory = await temporaryDirectory(t)
  const first = path.join(directory, "first.doc")
  const second = path.join(directory, "second.doc")
  await fs.writeFile(first, "identical legacy bytes")
  await fs.writeFile(second, "identical legacy bytes")

  const result = await extractRuleDocuments(
    [{ filePath: second }, { filePath: first }],
    undefined,
    DEFAULT_RULE_AUTHORING_LIMITS
  )

  assert.equal(result.duplicates.length, 1)
  assert.equal(result.duplicates[0].reason, "duplicate_in_run")
  assert.deepEqual(result.documents.map((document) => document.status), [
    "requires_conversion",
    "requires_conversion"
  ])
  assert.deepEqual(result.localSourceMappings.map((mapping) => mapping.status), [
    "requires_conversion",
    "requires_conversion"
  ])
  assert.deepEqual(result.manifest.sources, [])
  assert.deepEqual(result.aiChunks, [])
})

test("extractRuleDocuments classifies unsupported selected paths before existing-manifest deduplication", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "unsupported.txt")
  const bytes = Buffer.from("approved bytes")
  await fs.writeFile(filePath, bytes)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const existingManifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T00:00:00.000Z",
    sources: [{
      source_id: `src-${sha256.slice(0, 12)}`,
      logical_name: "approved.pdf",
      media_type: "pdf",
      sha256,
      byte_size: bytes.length,
      extraction_status: "success",
      extractor: { id: "pdf-layout-adapter", version: "1" },
      warnings: []
    }]
  }

  await assert.rejects(
    () => extractRuleDocuments([{ filePath }], existingManifest, DEFAULT_RULE_AUTHORING_LIMITS),
    /unsupported.*extension/i
  )
})
