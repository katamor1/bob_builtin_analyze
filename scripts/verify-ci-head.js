#!/usr/bin/env node
"use strict"

const { execFileSync } = require("node:child_process")
const fs = require("node:fs")

function requireSha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a full lowercase commit SHA`)
  }
  return value
}

function verifyCiHead(env = process.env, cwd = process.cwd()) {
  const event = env.GITHUB_EVENT_NAME
  if (!["pull_request", "push", "workflow_dispatch"].includes(event)) {
    throw new Error("unsupported CI event")
  }
  const expectedHeadSha = requireSha(env.EXPECTED_HEAD_SHA, "expected head")
  if (event === "workflow_dispatch") {
    const dispatchHeadSha = requireSha(env.DISPATCH_HEAD_SHA, "dispatch head")
    if (dispatchHeadSha !== expectedHeadSha) throw new Error("dispatch input does not match expected head")
    if (!/^[0-9a-f]{32}$/.test(env.DISPATCH_NONCE ?? "")) {
      throw new Error("dispatch nonce must be 32 lowercase hexadecimal characters")
    }
  }
  if (event !== "pull_request" && requireSha(env.GITHUB_SHA, "trigger SHA") !== expectedHeadSha) {
    throw new Error("trigger does not match expected head; dispatch from the same revision")
  }
  const actualHeadSha = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000
  }).trim()
  if (actualHeadSha !== expectedHeadSha) throw new Error("checkout does not match expected head")
  return {
    event,
    expectedHeadSha,
    actualHeadSha,
    ...(event === "workflow_dispatch" ? { dispatchNonce: env.DISPATCH_NONCE } : {})
  }
}

if (require.main === module) {
  try {
    const record = verifyCiHead()
    if (process.env.GITHUB_ENV) {
      fs.appendFileSync(process.env.GITHUB_ENV, `CI_VERIFIED_HEAD_SHA=${record.actualHeadSha}\n`, "utf8")
    }
    process.stdout.write(`${JSON.stringify(record)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = { verifyCiHead }
