"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { prepareTarget } = require("../out/bazaar/reviewTarget")

function commandResult(stdout, args) {
  return { stdout, stderr: "", command: "bzr", args, cwd: "/repo" }
}

function clientWithLogFailure(error) {
  return {
    root: async () => "/repo",
    diffRange: async () => commandResult("=== modified file 'src/a.cpp'\n+ok\n", ["diff"]),
    log: async () => { throw error }
  }
}

const rangeRequest = {
  mode: "revisionRange",
  baseRevision: "1",
  targetRevision: "2"
}

const options = {
  includeAddedFiles: false,
  maxAddedFileContentBytes: 1024
}

test("revision-range log failures are propagated instead of producing incomplete metadata", async () => {
  for (const error of [
    new Error("log command failed"),
    Object.assign(new Error("cancelled"), { code: "processing_cancelled", kind: "user" }),
    Object.assign(new Error("deadline"), { kind: "timeout", terminationCause: "deadline" })
  ]) {
    await assert.rejects(
      () => prepareTarget(clientWithLogFailure(error), "/repo", rangeRequest, options),
      (observed) => observed === error
    )
  }
})

test("working-tree added files produce structured skipped-content evidence", async () => {
  const prepared = await prepareTarget({
    root: async () => "/repo",
    diffWorkingTree: async () => commandResult("=== added file 'src/new.txt'\n+new\n", ["diff"]),
    status: async () => commandResult("added: src/new.txt\n", ["status"])
  }, "/repo", {
    mode: "workingTreeSinceRevision",
    baseRevision: "1"
  }, {
    includeAddedFiles: true,
    maxAddedFileContentBytes: 1024
  })

  assert.deepEqual(prepared.addedFilesEvidence, {
    observedContentBytes: 0,
    processedContentBytes: 0,
    renderedContentBytes: 0,
    truncated: false,
    skippedFileCount: 1,
    readFailures: []
  })
})
