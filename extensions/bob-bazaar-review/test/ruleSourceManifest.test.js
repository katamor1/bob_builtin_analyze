const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  assignSourceIds,
  buildRuleSourceManifest
} = require("../out/ruleAuthoring/ruleSourceManifest")

const VALID_MANIFEST_SOURCE = Object.freeze({
  logicalName: "rules.pdf",
  mediaType: "pdf",
  sha256: "9".repeat(64),
  byteSize: 42,
  extractionStatus: "success",
  extractor: { id: "pdftotext", version: "24.02" },
  warnings: []
})

function buildSingleSourceManifest(overrides = {}, generatedAt = "2026-07-14T12:34:56.000Z") {
  return buildRuleSourceManifest({
    generatedAt,
    sources: [{ ...VALID_MANIFEST_SOURCE, ...overrides }]
  })
}

test("assignSourceIds extends colliding prefixes using the complete hash set", () => {
  const first = `${"a".repeat(12)}0${"1".repeat(51)}`
  const second = `${"a".repeat(12)}1${"2".repeat(51)}`
  const distinct = `b${"3".repeat(63)}`

  const forward = assignSourceIds([first, second, distinct])
  const reverse = assignSourceIds([distinct, second, first])

  assert.deepEqual([...forward], [...reverse])
  assert.equal(forward.get(first), `src-${first.slice(0, 13)}`)
  assert.equal(forward.get(second), `src-${second.slice(0, 13)}`)
  assert.equal(forward.get(distinct), `src-${distinct.slice(0, 12)}`)
  assert.equal(new Set(forward.values()).size, 3)
})

test("assignSourceIds rejects values that are not full lowercase SHA-256 digests", () => {
  for (const value of ["a".repeat(63), "a".repeat(65), "A".repeat(64), "not-a-hash"]) {
    assert.throws(() => assignSourceIds([value]), /SHA-256/)
  }
})

test("buildRuleSourceManifest requires an exact canonical UTC generatedAt timestamp", () => {
  for (const generatedAt of [
    "2026-07-14T12:34:56Z",
    "2026-07-14T12:34:56.000+00:00",
    "2026-7-14T12:34:56.000Z",
    "2026-02-30T12:34:56.000Z",
    "/private/docs/rules.pdf",
    "source body says deploy without review"
  ]) {
    assert.throws(
      () => buildSingleSourceManifest({}, generatedAt),
      /generatedAt.*canonical UTC ISO/i
    )
  }
})

test("buildRuleSourceManifest accepts only designed source media types", () => {
  for (const mediaType of ["txt", "PDF", "application/pdf", "/private/rules.pdf"]) {
    assert.throws(
      () => buildSingleSourceManifest({ logicalName: `rules.${mediaType}`, mediaType }),
      /mediaType.*docx.*xlsx.*pdf/i
    )
  }
})

test("buildRuleSourceManifest accepts only designed extraction statuses", () => {
  for (const extractionStatus of ["complete", "pending", "SUCCESS", "source text"]) {
    assert.throws(
      () => buildSingleSourceManifest({ extractionStatus }),
      /extractionStatus.*supported/i
    )
  }
})

test("buildRuleSourceManifest requires a non-negative safe-integer byteSize", () => {
  assert.equal(buildSingleSourceManifest({ byteSize: 0 }).sources[0].byte_size, 0)

  for (const byteSize of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "42"]) {
    assert.throws(
      () => buildSingleSourceManifest({ byteSize }),
      /byteSize.*non-negative safe integer/i
    )
  }
})

test("buildRuleSourceManifest emits only remote-safe source metadata", () => {
  const collidingHash = `${"c".repeat(12)}0${"4".repeat(51)}`
  const otherCollidingHash = `${"c".repeat(12)}1${"5".repeat(51)}`
  const manifest = buildRuleSourceManifest({
    generatedAt: "2026-07-14T12:34:56.000Z",
    sources: [
      {
        logicalName: "engineering-rules.docx",
        mediaType: "docx",
        sha256: collidingHash,
        byteSize: 1234,
        extractionStatus: "success",
        extractor: { id: "mammoth", version: "1.8.0" },
        warnings: ["image_omitted"],
        absolutePath: "/private/docs/engineering-rules.docx",
        text: "private source body",
        localMapping: { path: "/private/docs/engineering-rules.docx" }
      },
      {
        logicalName: "quality-rules.pdf",
        mediaType: "pdf",
        sha256: otherCollidingHash,
        byteSize: 5678,
        extractionStatus: "partial",
        extractor: { id: "pdftotext", version: "24.02" },
        warnings: []
      }
    ]
  })

  assert.deepEqual(manifest, {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T12:34:56.000Z",
    sources: [
      {
        source_id: `src-${collidingHash.slice(0, 13)}`,
        logical_name: "engineering-rules.docx",
        media_type: "docx",
        sha256: collidingHash,
        byte_size: 1234,
        extraction_status: "success",
        extractor: { id: "mammoth", version: "1.8.0" },
        warnings: ["image_omitted"]
      },
      {
        source_id: `src-${otherCollidingHash.slice(0, 13)}`,
        logical_name: "quality-rules.pdf",
        media_type: "pdf",
        sha256: otherCollidingHash,
        byte_size: 5678,
        extraction_status: "partial",
        extractor: { id: "pdftotext", version: "24.02" },
        warnings: []
      }
    ]
  })

  const serialized = JSON.stringify(manifest)
  assert.doesNotMatch(serialized, /\/private\/docs/)
  assert.doesNotMatch(serialized, /private source body/)
  assert.doesNotMatch(serialized, /localMapping/)
})

test("buildRuleSourceManifest rejects path-shaped data in shareable text fields", () => {
  const validSource = {
    logicalName: "rules.pdf",
    mediaType: "pdf",
    sha256: "d".repeat(64),
    byteSize: 42,
    extractionStatus: "success",
    extractor: { id: "pdftotext", version: "24.02" },
    warnings: []
  }
  const build = (source) => buildRuleSourceManifest({
    generatedAt: "2026-07-14T12:34:56.000Z",
    sources: [source]
  })

  assert.throws(
    () => build({ ...validSource, logicalName: "/private/docs/rules.pdf" }),
    /remote-safe.*logicalName/i
  )
  assert.throws(
    () => build({ ...validSource, logicalName: "C:\\private\\rules.pdf" }),
    /remote-safe.*logicalName/i
  )
  assert.throws(
    () => build({ ...validSource, logicalName: "\\\\server\\share\\rules.pdf" }),
    /remote-safe.*logicalName/i
  )
  assert.throws(
    () => build({ ...validSource, logicalName: "\\\\?\\C:\\private\\rules.pdf" }),
    /remote-safe.*logicalName/i
  )
  assert.throws(
    () => build({ ...validSource, warnings: ["failed while reading C:\\private\\rules.pdf"] }),
    /remote-safe.*warnings/i
  )
  assert.throws(
    () => build({ ...validSource, extractor: { id: "/opt/bin/pdftotext", version: "24.02" } }),
    /remote-safe.*extractor.id/i
  )
})

test("buildRuleSourceManifest accepts bounded warning codes instead of source prose", () => {
  const build = (warning) => buildRuleSourceManifest({
    generatedAt: "2026-07-14T12:34:56.000Z",
    sources: [{
      logicalName: "rules.pdf",
      mediaType: "pdf",
      sha256: "e".repeat(64),
      byteSize: 42,
      extractionStatus: "partial",
      extractor: { id: "pdftotext", version: "24.02" },
      warnings: [warning]
    }]
  })

  assert.deepEqual(build("low_text_density").sources[0].warnings, ["low_text_density"])
  assert.throws(() => build("source paragraph says deploy without review"), /remote-safe.*warnings/i)
  assert.throws(() => build(`${"x".repeat(129)}_warning`), /remote-safe.*warnings/i)
})

test("buildRuleSourceManifest rejects duplicate full hashes", () => {
  const sha256 = "f".repeat(64)
  const source = {
    logicalName: "rules.pdf",
    mediaType: "pdf",
    sha256,
    byteSize: 42,
    extractionStatus: "success",
    extractor: { id: "pdftotext", version: "24.02" },
    warnings: []
  }

  assert.throws(() => buildRuleSourceManifest({
    generatedAt: "2026-07-14T12:34:56.000Z",
    sources: [source, { ...source, logicalName: "duplicate.pdf" }]
  }), /duplicate.*SHA-256/i)
})
