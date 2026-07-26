"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  buildAddedFilesContent
} = require("../out/bazaar/revisionInfo")

const info = {
  revision: "1",
  author: "author",
  committer: "committer",
  timestamp: "2026-07-26T00:00:00Z",
  message: "change",
  changedFileCount: 1,
  changedFiles: ["src/new.txt"],
  changedFileEntries: [{ path: "src/new.txt", status: "added" }],
  logText: ""
}

function commandResult(stdout) {
  return { stdout, stderr: "", command: "bzr", args: ["cat"], cwd: "/repo" }
}

test("oversized added files retain exact observed and source-byte evidence", async () => {
  assert.equal(typeof buildAddedFilesContent, "function")
  const result = await buildAddedFilesContent({
    cat: async () => commandResult("é".repeat(512))
  }, "/repo", "1", info, 128)

  assert.equal(result.evidence.observedContentBytes, 1024)
  assert.ok(result.evidence.processedContentBytes < 128)
  assert.ok(result.evidence.renderedContentBytes <= 128)
  assert.equal(result.evidence.truncated, true)
  assert.equal(result.evidence.skippedFileCount, 0)
  assert.deepEqual(result.evidence.readFailures, [])
})

test("added-file cat failures are returned as structured evidence", async () => {
  assert.equal(typeof buildAddedFilesContent, "function")
  const result = await buildAddedFilesContent({
    cat: async () => { throw new Error("cat\u0000 failed") }
  }, "/repo", "1", info, 128)

  assert.deepEqual(result.evidence.readFailures, [
    { path: "src/new.txt", message: "cat failed" }
  ])
  assert.match(result.section, /読み込めませんでした/u)
})

test("zero added-file budget records skipped text files without reading them", async () => {
  assert.equal(typeof buildAddedFilesContent, "function")
  const result = await buildAddedFilesContent({
    cat: async () => { throw new Error("cat must not be called") }
  }, "/repo", "1", info, 0)

  assert.equal(result.section, undefined)
  assert.equal(result.evidence.skippedFileCount, 1)
  assert.deepEqual(result.evidence.readFailures, [])
})
