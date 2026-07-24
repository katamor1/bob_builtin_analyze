const assert = require("node:assert/strict")
const path = require("node:path")
const { performance } = require("node:perf_hooks")
const { test } = require("node:test")

const { ExternalProcessError } = require("../out/bazaar/externalProcessRunner")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const {
  extractPdf,
  PDF_LOW_TEXT_DENSITY_CHARACTERS
} = require("../out/ruleAuthoring/extraction/pdfExtractor")

function options(runner, overrides = {}) {
  return {
    sourceId: "src-fedcba987654",
    command: "/configured/pdftotext",
    timeoutMs: 4321,
    maxOutputBytes: 32 * 1024 * 1024,
    maxChunkBytes: 32 * 1024,
    runner,
    ...overrides
  }
}

test("extractPdf invokes the bounded runner with a fixed argv and absolute deadline", async () => {
  const absolutePath = path.resolve("fixtures", "rules.pdf")
  const before = performance.now()
  let captured
  const result = await extractPdf(absolutePath, options(async (runnerOptions) => {
    captured = runnerOptions
    return { stdout: Buffer.from("page one\f"), stderr: Buffer.alloc(0), exitCode: 0 }
  }))

  assert.equal(captured.command, "/configured/pdftotext")
  assert.deepEqual(captured.args, ["-layout", "-enc", "UTF-8", absolutePath, "-"])
  assert.equal(captured.cwd, path.dirname(absolutePath))
  assert.ok(captured.deadline.expires_at_monotonic_ms >= before + 4000)
  assert.ok(captured.deadline.expires_at_monotonic_ms <= performance.now() + 4321)
  assert.equal(Object.hasOwn(captured, "timeoutMs"), false)
  assert.equal(captured.maxStdoutBytes, 32 * 1024 * 1024)
  assert.equal(Object.hasOwn(captured, "maxBufferBytes"), false)
  assert.deepEqual(captured.allowedExitCodes, [0])
  assert.equal(Object.hasOwn(captured, "shell"), false)
  assert.deepEqual(result.extractor, { id: "pdf-pdftotext-layout", version: "1" })
})

test("extractPdf preserves an operation deadline supplied by its caller", async () => {
  const deadline = Object.freeze({ expires_at_monotonic_ms: 987654321 })
  let captured
  await extractPdf("deadline.pdf", options(async (runnerOptions) => {
    captured = runnerOptions
    return { stdout: Buffer.from("text\f"), stderr: Buffer.alloc(0), exitCode: 0 }
  }, { deadline }))
  assert.equal(captured.deadline, deadline)
})

test("extractPdf preserves interior blank pages and removes only the final trailing blank page", async () => {
  const result = await extractPdf("relative.pdf", options(async () => ({
    stdout: Buffer.from("first\f\fthird\f"),
    stderr: Buffer.alloc(0),
    exitCode: 0
  })))

  assert.deepEqual(result.chunks.map((chunk) => chunk.locator.page), [1, 2, 3])
  assert.deepEqual(result.chunks.map((chunk) => chunk.text), ["first", "", "third"])
  assert.deepEqual(result.chunks[1].flags, ["empty_page"])
})

test("extractPdf clamps raised output/chunk limits while preserving lower caller limits", async () => {
  const oversizedPage = "z".repeat(DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes + 1)
  const captures = []
  const raised = await extractPdf("raised.pdf", options(async (runnerOptions) => {
    captures.push(runnerOptions)
    return { stdout: Buffer.from(oversizedPage), stderr: Buffer.alloc(0), exitCode: 0 }
  }, {
    maxOutputBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxPdfOutputBytes * 2,
    maxChunkBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes * 2
  }))
  const lowered = await extractPdf("lowered.pdf", options(async (runnerOptions) => {
    captures.push(runnerOptions)
    return { stdout: Buffer.from("123456789"), stderr: Buffer.alloc(0), exitCode: 0 }
  }, {
    maxOutputBytes: 1024,
    maxChunkBytes: 8
  }))

  assert.equal(captures[0].maxStdoutBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxPdfOutputBytes)
  assert.equal(raised.chunks.length, 2)
  assert.ok(raised.chunks.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes))
  assert.equal(captures[1].maxStdoutBytes, 1024)
  assert.deepEqual(lowered.chunks.map((chunk) => chunk.text), ["12345678", "9"])
})

test("extractPdf classifies empty output as requires_ocr and flags low-density text", async () => {
  const empty = await extractPdf("empty.pdf", options(async () => ({
    stdout: Buffer.from(" \r\n"), stderr: Buffer.alloc(0), exitCode: 0
  })))
  const sparse = await extractPdf("sparse.pdf", options(async () => ({
    stdout: Buffer.from("x".repeat(PDF_LOW_TEXT_DENSITY_CHARACTERS - 1)),
    stderr: Buffer.alloc(0),
    exitCode: 0
  })))
  const threshold = await extractPdf("threshold.pdf", options(async () => ({
    stdout: Buffer.from("x".repeat(PDF_LOW_TEXT_DENSITY_CHARACTERS)),
    stderr: Buffer.alloc(0),
    exitCode: 0
  })))

  assert.equal(empty.status, "requires_ocr")
  assert.deepEqual(empty.chunks, [])
  assert.ok(empty.warnings.includes("ocr_required"))
  assert.equal(sparse.status, "success")
  assert.ok(sparse.warnings.includes("low_text_density"))
  assert.equal(PDF_LOW_TEXT_DENSITY_CHARACTERS, 32)
  assert.deepEqual(threshold.warnings, [])
})

for (const [kind, warning] of [
  ["timeout", "pdf_timeout"],
  ["cancelled", "pdf_cancelled"],
  ["bufferExceeded", "pdf_output_overflow"]
]) {
  test(`extractPdf maps ${kind} failures to a sanitized blocked result`, async () => {
    const rawPath = "/private/rules.pdf"
    const runner = async () => {
      throw new ExternalProcessError(
        `raw diagnostic for ${rawPath}`,
        kind,
        rawPath,
        [rawPath],
        "/private"
      )
    }
    const result = await extractPdf(rawPath, options(runner))

    assert.equal(result.status, "blocked")
    assert.deepEqual(result.chunks, [])
    assert.deepEqual(result.warnings, [warning])
    assert.doesNotMatch(JSON.stringify(result), /private|raw diagnostic/)
  })
}
