"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  canonicalSha
} = require("../out/core/processingOperationInput")

test("canonical hashing distinguishes absent, undefined, and null object properties", () => {
  assert.notEqual(canonicalSha({}), canonicalSha({ value: undefined }))
  assert.notEqual(canonicalSha({ value: undefined }), canonicalSha({ value: null }))
})

test("canonical hashing distinguishes undefined and null array entries", () => {
  assert.notEqual(canonicalSha([undefined]), canonicalSha([null]))
})
