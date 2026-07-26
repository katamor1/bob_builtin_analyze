"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

const {
  canonicalSha
} = require("../out/core/processingOperationInput")

test("canonical hashing distinguishes bigint from text", () => {
  assert.notEqual(canonicalSha(1n), canonicalSha("1"))
  assert.notEqual(canonicalSha(-1n), canonicalSha("-1"))
})

test("canonical hashing distinguishes negative zero from zero", () => {
  assert.equal(Object.is(-0, 0), false)
  assert.notEqual(canonicalSha(-0), canonicalSha(0))
})

test("canonical processing identity format uses the current version", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "processingOperationInput.ts"),
    "utf8"
  )
  assert.match(source, /code-consistency-processing-input\/v3/)
})
