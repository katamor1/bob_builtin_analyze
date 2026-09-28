#!/usr/bin/env node
"use strict"

const fs = require("node:fs")

function normalizeEvidenceValue(value) {
  if (typeof value !== "string" || value.trim() === "") return "unavailable"
  return value.replace(/\r\n?|\n/g, " ").trim()
}

function collectBaseline(env = process.env, nodeVersion = process.version) {
  return {
    commit: normalizeEvidenceValue(env.CI_VERIFIED_HEAD_SHA || env.GITHUB_SHA),
    runId: normalizeEvidenceValue(env.GITHUB_RUN_ID),
    runAttempt: normalizeEvidenceValue(env.GITHUB_RUN_ATTEMPT),
    runnerOs: normalizeEvidenceValue(env.RUNNER_OS),
    runnerArch: normalizeEvidenceValue(env.RUNNER_ARCH),
    imageOs: normalizeEvidenceValue(env.ImageOS),
    imageVersion: normalizeEvidenceValue(env.ImageVersion),
    nodeVersion: normalizeEvidenceValue(nodeVersion)
  }
}

function escapeMarkdownTableValue(value) {
  return normalizeEvidenceValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
}

function renderMarkdown(record) {
  const rows = [
    ["Commit", record.commit],
    ["Run ID", record.runId],
    ["Run attempt", record.runAttempt],
    ["Runner OS", record.runnerOs],
    ["Runner architecture", record.runnerArch],
    ["Runner image OS", record.imageOs],
    ["Runner image version", record.imageVersion],
    ["Node.js", record.nodeVersion]
  ]
  return [
    "## CI Baseline Environment",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${label} | ${escapeMarkdownTableValue(value)} |`),
    ""
  ].join("\n")
}

function emitBaseline({
  env = process.env,
  nodeVersion = process.version,
  stdout = process.stdout,
  appendFileSync = fs.appendFileSync
} = {}) {
  const record = collectBaseline(env, nodeVersion)
  stdout.write(`${JSON.stringify(record)}\n`)
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, renderMarkdown(record), "utf8")
  }
  return record
}

if (require.main === module) {
  try {
    emitBaseline()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

module.exports = {
  collectBaseline,
  emitBaseline,
  renderMarkdown
}
