const assert = require("node:assert/strict")
const { test } = require("node:test")

test("containment normalization preserves Windows drive roots", () => {
  const { normalizeContainmentRoot } = require("../out/core/contractV2/packageLoaderIntrinsics.js")

  assert.equal(normalizeContainmentRoot("C:\\"), "C:\\")
  assert.equal(normalizeContainmentRoot("C:\\\\"), "C:\\")
  assert.equal(normalizeContainmentRoot("C:/"), "C:/")
  assert.equal(normalizeContainmentRoot("C:///"), "C:/")
  assert.equal(normalizeContainmentRoot("C:\\minimal\\"), "C:\\minimal")
  assert.equal(normalizeContainmentRoot("/tmp///"), "/tmp")
})
