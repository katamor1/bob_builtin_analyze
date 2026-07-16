#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  collectBaseline,
  emitBaseline,
  renderMarkdown
} = require("./ci-baseline-summary")

const completeEnv = {
  GITHUB_SHA: "abc123",
  GITHUB_RUN_ID: "42",
  GITHUB_RUN_ATTEMPT: "2",
  RUNNER_OS: "Linux",
  RUNNER_ARCH: "X64",
  ImageOS: "ubuntu24",
  ImageVersion: "20260714.240.1",
  GITHUB_STEP_SUMMARY: "summary.md",
  SECRET_TOKEN: "must-not-appear"
}

test("collectBaseline returns only the fixed evidence allowlist", () => {
  assert.deepEqual(collectBaseline(completeEnv, "v22.23.1"), {
    commit: "abc123",
    runId: "42",
    runAttempt: "2",
    runnerOs: "Linux",
    runnerArch: "X64",
    imageOs: "ubuntu24",
    imageVersion: "20260714.240.1",
    nodeVersion: "v22.23.1"
  })
})

test("collectBaseline marks missing values unavailable", () => {
  assert.deepEqual(collectBaseline({}, ""), {
    commit: "unavailable",
    runId: "unavailable",
    runAttempt: "unavailable",
    runnerOs: "unavailable",
    runnerArch: "unavailable",
    imageOs: "unavailable",
    imageVersion: "unavailable",
    nodeVersion: "unavailable"
  })
})

test("renderMarkdown keeps fixed order and escapes table control text", () => {
  const markdown = renderMarkdown({
    ...collectBaseline(completeEnv, "v22.23.1"),
    runId: "42|43\n<script>"
  })

  assert.match(markdown, /^## CI Baseline Environment\n/m)
  assert.match(markdown, /\| Run ID \| 42\\\|43 &lt;script&gt; \|/)
  assert.doesNotMatch(markdown, /must-not-appear/)
})

test("emitBaseline writes allowlisted JSON and appends the summary", () => {
  let stdout = ""
  const appends = []

  const record = emitBaseline({
    env: completeEnv,
    nodeVersion: "v22.23.1",
    stdout: { write: (chunk) => { stdout += chunk } },
    appendFileSync: (...args) => { appends.push(args) }
  })

  assert.deepEqual(JSON.parse(stdout), record)
  assert.doesNotMatch(stdout, /must-not-appear/)
  assert.equal(appends.length, 1)
  assert.equal(appends[0][0], "summary.md")
  assert.equal(appends[0][2], "utf8")
  assert.match(appends[0][1], /ubuntu24/)
})

test("emitBaseline succeeds without a step summary file", () => {
  let appendCalls = 0
  emitBaseline({
    env: { GITHUB_SHA: "abc123" },
    nodeVersion: "v22.23.1",
    stdout: { write: () => {} },
    appendFileSync: () => { appendCalls += 1 }
  })
  assert.equal(appendCalls, 0)
})
