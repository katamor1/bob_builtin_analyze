import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  auditRetirement,
  renderRetirementMarkdown,
  writeAuditOutputs
} from "../audit-branch-retirement.mjs"

const shaA = "a".repeat(40)
const shaB = "b".repeat(40)

function map() {
  return {
    schemaVersion: "bob-builtin-analyze/branch-retirement-map/v1",
    repository: "katamor1/bob_builtin_analyze",
    baselineMain: shaA,
    entries: [
      {
        branch: "agent/example",
        expectedHeadSha: shaB,
        expectedDisposition: "superseded",
        predecessorPullRequests: [1],
        replacementPullRequests: [2],
        requiredMainPaths: ["src/example.ts"],
        forbiddenMainPaths: [".github/workflows/example.yml"],
        evidenceChecks: ["example-check"]
      }
    ]
  }
}

function adapter(overrides = {}) {
  const calls = []
  return {
    calls,
    async getMainSha() { calls.push("getMainSha"); return shaA },
    async getDefaultBranch() { calls.push("getDefaultBranch"); return "main" },
    async listRemoteBranches() { calls.push("listRemoteBranches"); return new Map([["agent/example", shaB], ["agent/unknown", "c".repeat(40)]]) },
    async listOpenPullRequestRefs() { calls.push("listOpenPullRequestRefs"); return new Set() },
    async listProtectedBranches() { calls.push("listProtectedBranches"); return new Set(["main"]) },
    async isProtectionVerified() { calls.push("isProtectionVerified"); return true },
    async getPullRequestEvidence() { calls.push("getPullRequestEvidence"); return { replacementsMerged: true, predecessorClosed: true, productionReplacementMerged: true } },
    async checkMainPaths(required, forbidden) {
      calls.push("checkMainPaths")
      return {
        required: { passed: true, missing: [], checked: required },
        forbidden: { passed: true, present: [], checked: forbidden }
      }
    },
    async runBehaviorChecks(ids) { calls.push("runBehaviorChecks"); return { passed: true, checks: ids.map((id) => ({ id, passed: true })) } },
    async compareBranch() { calls.push("compareBranch"); return { observedDisposition: "superseded", uniqueUnintegratedFiles: [], diffFiles: ["src/example.ts"] } },
    async confirmRemoteHead() { calls.push("confirmRemoteHead"); return shaB },
    ...overrides
  }
}

test("audits only allowlisted branches in map order and never adds unknown refs", async () => {
  const fake = adapter()
  const result = await auditRetirement({
    map: map(),
    adapter: fake,
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true,
    generatedAt: "2026-07-16T00:00:00.000Z"
  })
  assert.deepEqual(result.entries.map((entry) => entry.branch), ["agent/example"])
  assert.equal(result.entries[0].deletable, true)
  assert.equal(result.ready_for_deletion, true)
  assert.equal(fake.calls.includes("push"), false)
  assert.equal(fake.calls.includes("delete"), false)
})

test("fails closed when remote enumeration or GitHub PR discovery fails", async () => {
  await assert.rejects(
    auditRetirement({ map: map(), adapter: adapter({ async listRemoteBranches() { throw new Error("ls-remote failed") } }) }),
    /ls-remote failed/
  )
  await assert.rejects(
    auditRetirement({ map: map(), adapter: adapter({ async listOpenPullRequestRefs() { throw new Error("PR query failed") } }) }),
    /PR query failed/
  )
})

test("marks a moved head as blocked", async () => {
  const result = await auditRetirement({
    map: map(),
    adapter: adapter({ async confirmRemoteHead() { return "c".repeat(40) } }),
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true
  })
  assert.equal(result.entries[0].deletable, false)
  assert.match(result.entries[0].reasons.join("\n"), /moved|SHA/i)
})

test("marks a missing branch already-absent and keeps the audit ready", async () => {
  const result = await auditRetirement({
    map: map(),
    adapter: adapter({ async listRemoteBranches() { return new Map() } }),
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true
  })
  assert.equal(result.entries[0].observedDisposition, "already-absent")
  assert.equal(result.entries[0].deletable, false)
  assert.equal(result.entries[0].safeToRetire, true)
  assert.equal(result.ready_for_deletion, true)
})



test("requires protected main when branch protection enumeration is verified", async () => {
  await assert.rejects(
    auditRetirement({
      map: map(),
      adapter: adapter({ async listProtectedBranches() { return new Set() } }),
      review: { critical: 0, important: 0 },
      hostedGatesPassed: true
    }),
    /main.*protected/i
  )
})

test("permits an explicitly authorized unprotected main only with the exact-SHA guard", async () => {
  const result = await auditRetirement({
    map: map(),
    adapter: adapter({ async listProtectedBranches() { return new Set() } }),
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true,
    allowUnprotectedMainExactShaGuard: true
  })
  assert.equal(result.ready_for_deletion, true)
  assert.deepEqual(result.mainGuard, {
    defaultBranch: "main",
    protected: false,
    protectionChecked: true,
    unprotectedExactShaGuardAuthorized: true
  })
})

test("rejects an unprotected non-main default branch even when the exact-SHA guard is requested", async () => {
  await assert.rejects(
    auditRetirement({
      map: map(),
      adapter: adapter({
        async getDefaultBranch() { return "trunk" },
        async listProtectedBranches() { return new Set() }
      }),
      review: { critical: 0, important: 0 },
      hostedGatesPassed: true,
      allowUnprotectedMainExactShaGuard: true
    }),
    /default branch.*main/i
  )
})

test("fails closed when branch protection enumeration is not verified", async () => {
  const result = await auditRetirement({
    map: map(),
    adapter: adapter({ async isProtectionVerified() { return false } }),
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true
  })
  assert.equal(result.entries[0].deletable, false)
  assert.match(result.entries[0].reasons.join("\n"), /protection.*not independently verified/i)
  assert.equal(result.ready_for_deletion, false)
})

test("writes matching JSON and Markdown atomically", async () => {
  const result = await auditRetirement({
    map: map(),
    adapter: adapter(),
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true,
    generatedAt: "2026-07-16T00:00:00.000Z"
  })
  const dir = await mkdtemp(path.join(os.tmpdir(), "retirement-audit-"))
  const jsonPath = path.join(dir, "audit.json")
  const markdownPath = path.join(dir, "audit.md")
  await writeAuditOutputs(result, { jsonPath, markdownPath })
  const parsed = JSON.parse(await readFile(jsonPath, "utf8"))
  const markdown = await readFile(markdownPath, "utf8")
  assert.deepEqual(parsed.entries.map((entry) => entry.branch), ["agent/example"])
  assert.deepEqual(extractMarkdownBranches(markdown), ["agent/example"])
  assert.equal(markdown, renderRetirementMarkdown(result))
  assert.deepEqual((await readdir(dir)).sort(), ["audit.json", "audit.md"])
})

function extractMarkdownBranches(markdown) {
  return [...markdown.matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1])
}
