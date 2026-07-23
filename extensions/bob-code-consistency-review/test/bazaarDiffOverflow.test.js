"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const runnerModulePath = require.resolve("../out/core/externalProcessRunner")
const collectorModulePath = require.resolve("../out/core/gitDiffCollector")

test("rejects Bazaar raw-diff overflow before parsing partial changed-file metadata", async () => {
  const runner = require(runnerModulePath)
  const originalRunExternalProcess = runner.runExternalProcess
  let calls = 0

  runner.runExternalProcess = async (options) => {
    calls += 1
    const retainedPrefix = Buffer.from([
      "=== modified file 'early.c'",
      "--- old/early.c",
      "+++ new/early.c",
      "+prefix only"
    ].join("\n"), "utf8").subarray(0, options.maxStdoutBytes)
    throw new runner.ExternalProcessError(
      `Command stdout exceeded ${options.maxStdoutBytes} bytes: ${options.command}`,
      "bufferExceeded",
      options.command,
      [...options.args],
      options.cwd,
      retainedPrefix,
      Buffer.alloc(0)
    )
  }
  delete require.cache[collectorModulePath]

  try {
    const { collectGitDiff } = require(collectorModulePath)
    await assert.rejects(
      () => collectGitDiff({
        review: { vcs: "bazaar", base: "1", head: "2" }
      }, {
        workspaceRoot: process.cwd(),
        bzrPath: "fake-bzr",
        limits: { maxRawDiffBytes: 64 }
      }),
      /Bazaar diff.*exceeded.*changed-file metadata/i
    )
    assert.equal(calls, 1)
  } finally {
    runner.runExternalProcess = originalRunExternalProcess
    delete require.cache[collectorModulePath]
  }
})
