const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  clampExecBufferBytes,
  clampMaxAddedFileContentBytes,
  clampMaxDiffBytes,
  maxBufferForDiffBytes,
  truncateUtf8
} = require("../out/bazaar/reviewLimits")

test("review byte limits clamp non-finite, low, and high values", () => {
  assert.equal(clampMaxDiffBytes(Number.NaN), 1024 * 1024)
  assert.equal(clampMaxDiffBytes(-1), 32 * 1024)
  assert.equal(clampMaxDiffBytes(99 * 1024 * 1024), 5 * 1024 * 1024)

  assert.equal(clampMaxAddedFileContentBytes(Number.POSITIVE_INFINITY), 256 * 1024)
  assert.equal(clampMaxAddedFileContentBytes(-1), 0)
  assert.equal(clampMaxAddedFileContentBytes(99 * 1024 * 1024), 2 * 1024 * 1024)
})

test("Bazaar exec buffer limits are derived and clamped", () => {
  assert.equal(maxBufferForDiffBytes(32 * 1024), 2 * 1024 * 1024)
  assert.equal(maxBufferForDiffBytes(5 * 1024 * 1024), 10 * 1024 * 1024)
  assert.equal(clampExecBufferBytes(Number.NaN), 10 * 1024 * 1024)
  assert.equal(clampExecBufferBytes(-1), 2 * 1024 * 1024)
  assert.equal(clampExecBufferBytes(99 * 1024 * 1024), 20 * 1024 * 1024)
})

test("truncateUtf8 terminates for zero and negative limits", () => {
  const zero = truncateUtf8("abcdef", 0, "diff")
  const negative = truncateUtf8("abcdef", -1, "diff")

  assert.equal(zero, "")
  assert.equal(negative, "")
})

test("truncateUtf8 keeps multibyte characters valid while truncating", () => {
  const output = truncateUtf8("あいうえお", 8, "diff")

  assert.ok(Buffer.byteLength(output, "utf8") <= 8)
  assert.equal(Buffer.from(output, "utf8").toString("utf8"), output)
})

test("truncateUtf8 includes its truncation notice inside every byte budget", () => {
  for (const maxBytes of [0, 1, 8, 64]) {
    const output = truncateUtf8("x".repeat(1024), maxBytes, "diff")
    assert.ok(
      Buffer.byteLength(output, "utf8") <= maxBytes,
      `retained ${Buffer.byteLength(output, "utf8")} bytes for a ${maxBytes}-byte budget`
    )
  }
})
