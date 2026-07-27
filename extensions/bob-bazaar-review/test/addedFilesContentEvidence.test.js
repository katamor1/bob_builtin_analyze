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

test("added-file cancellation and deadline errors are not downgraded to missing evidence", async () => {
  for (const error of [
    Object.assign(new Error("cancelled"), { kind: "cancelled", terminationCause: "user" }),
    Object.assign(new Error("deadline"), { kind: "timeout", terminationCause: "deadline" }),
    Object.assign(new Error("processing cancellation"), { code: "processing_cancelled" })
  ]) {
    await assert.rejects(
      () => buildAddedFilesContent({
        cat: async () => { throw error }
      }, "/repo", "1", info, 128),
      (observed) => observed === error
    )
  }
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

test("binary added files are counted as unprocessed with a positive budget", async () => {
  const binaryInfo = {
    ...info,
    changedFiles: ["assets/new.bin"],
    changedFileEntries: [{ path: "assets/new.bin", status: "added", binary: true }]
  }
  const result = await buildAddedFilesContent({
    cat: async () => { throw new Error("binary cat must not be called") }
  }, "/repo", "1", binaryInfo, 128)

  assert.equal(result.evidence.skippedFileCount, 1)
  assert.deepEqual(result.evidence.readFailures, [])
  assert.match(result.section, /\[BINARY:/u)
})

test("zero added-file budget counts binary files as skipped evidence", async () => {
  const binaryInfo = {
    ...info,
    changedFiles: ["assets/new.bin"],
    changedFileEntries: [{ path: "assets/new.bin", status: "added", binary: true }]
  }
  const result = await buildAddedFilesContent({
    cat: async () => { throw new Error("binary cat must not be called") }
  }, "/repo", "1", binaryInfo, 0)

  assert.equal(result.section, undefined)
  assert.equal(result.evidence.skippedFileCount, 1)
})
