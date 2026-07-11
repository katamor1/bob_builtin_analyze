const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

function readSource(...segments) {
  return fs.readFileSync(path.join(__dirname, "..", "src", ...segments), "utf8")
}

test("Git and Bazaar diff collection use the bounded external process runner", () => {
  const source = readSource("core", "gitDiffCollector.ts")

  assert.match(source, /runExternalProcess/)
  assert.match(source, /timeoutMs/)
  assert.match(source, /signal/)
  assert.doesNotMatch(source, /execFileAsync|execFile\(/)
})

test("preprocess progress propagates cancellation into VCS collection", () => {
  const commandSource = readSource("reviewExecutionCommands.ts")
  const pipelineSource = readSource("core", "pipeline.ts")

  assert.match(commandSource, /cancellable:\s*true/)
  assert.match(commandSource, /AbortController/)
  assert.match(commandSource, /token\.onCancellationRequested/)
  assert.match(commandSource, /abortSignal:\s*controller\.signal/)
  assert.match(pipelineSource, /abortSignal/)
  assert.match(pipelineSource, /signal:\s*input\.abortSignal/)
})
