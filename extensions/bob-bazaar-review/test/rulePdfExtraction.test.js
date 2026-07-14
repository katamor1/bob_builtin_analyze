const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const { ExternalProcessError } = require("../out/bazaar/externalProcessRunner")
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

test("extractPdf invokes the bounded runner with the fixed argument array and no shell override", async () => {
  const absolutePath = path.resolve("fixtures", "rules.pdf")
  let captured
  const result = await extractPdf(absolutePath, options(async (runnerOptions) => {
    captured = runnerOptions
    return { stdout: Buffer.from("page one\f"), stderr: Buffer.alloc(0), exitCode: 0 }
  }))

  assert.equal(captured.command, "/configured/pdftotext")
  assert.deepEqual(captured.args, ["-layout", "-enc", "UTF-8", absolutePath, "-"])
  assert.equal(captured.cwd, path.dirname(absolutePath))
  assert.equal(captured.timeoutMs, 4321)
  assert.equal(captured.maxBufferBytes, 32 * 1024 * 1024)
  assert.deepEqual(captured.allowedExitCodes, [0])
  assert.equal(Object.hasOwn(captured, "shell"), false)
  assert.deepEqual(result.extractor, { id: "pdftotext", version: "external" })
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
