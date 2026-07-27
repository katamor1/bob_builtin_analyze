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

const request = {
  mode: "revisionRange",
  baseRevision: "1",
  targetRevision: "2"
}

const options = {
  includeAddedFiles: false,
  maxAddedFileContentBytes: 1024
}

test("non-cancellation range log failure remains observable as missing log evidence", async () => {
  const prepared = await prepareTarget(
    clientWithLogFailure(new Error("log command failed")),
    "/repo",
    request,
    options
  )

  assert.equal(prepared.log, undefined)
  assert.equal(prepared.info.mode, "revisionRange")
  assert.equal(prepared.info.changedFileCount, 1)
})

test("range log cancellation and deadline failures are not downgraded to missing evidence", async () => {
  for (const error of [
    Object.assign(new Error("cancelled"), { code: "processing_cancelled", kind: "user" }),
    Object.assign(new Error("deadline"), { kind: "timeout", terminationCause: "deadline" })
  ]) {
    await assert.rejects(
      () => prepareTarget(clientWithLogFailure(error), "/repo", request, options),
      (observed) => observed === error
    )
  }
})
