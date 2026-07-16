import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { executeDeletion } from "../delete-retired-branches.mjs"

const mainSha = "a".repeat(40)
const branchSha = "b".repeat(40)

function manifest() {
  return {
    schemaVersion: "bob-builtin-analyze/branch-retirement-audit/v1",
    repository: "katamor1/bob_builtin_analyze",
    auditedMainSha: mainSha,
    mainGuard: {
      defaultBranch: "main",
      protected: true,
      protectionChecked: true,
      unprotectedExactShaGuardAuthorized: false
    },
    ready_for_deletion: true,
    blockedBranches: [],
    entries: [{
      branch: "agent/example",
      remoteHeadSha: branchSha,
      observedDisposition: "superseded",
      replacementPullRequests: [2],
      deletable: true,
      safeToRetire: true,
      reasons: []
    }]
  }
}

function adapter(overrides = {}) {
  const calls = []
  return {
    calls,
    async getWorktreeStatus() { calls.push("status"); return "" },
    async getCurrentBranch() { calls.push("branch"); return "integration/retire-superseded-branches-20260716-v2" },
    async getRemoteRepository() { calls.push("remote"); return "katamor1/bob_builtin_analyze" },
    async getDefaultBranch() { calls.push("default"); return "main" },
    async getMainSha() { calls.push("main"); return mainSha },
    async auditedMainIsAncestor() { calls.push("ancestor"); return true },
    async listRemoteBranches() { calls.push("refs"); return new Map([["main", mainSha], ["agent/example", branchSha]]) },
    async listOpenPullRequestRefs() { calls.push("open"); return new Set() },
    async listProtectedBranches() { calls.push("protected"); return new Set(["main"]) },
    async runAtomicPush(command) { calls.push(["push", command]); return { code: 0, stdout: "", stderr: "" } },
    async postVerify() {
      calls.push("verify")
      return {
        mainShaAfter: mainSha,
        postVerification: {
          targetsAbsent: true,
          defaultBranchIsMain: true,
          mainUnchangedDuringDeletion: true
        },
        remainingOpenPullRequests: []
      }
    },
    ...overrides
  }
}

async function outputPaths() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "branch-delete-"))
  return { dir, jsonPath: path.join(dir, "execution.json"), markdownPath: path.join(dir, "execution.md") }
}

test("defaults to dry-run and never pushes", async () => {
  const fake = adapter()
  const paths = await outputPaths()
  const result = await executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "dry-run",
    adapter: fake,
    ...paths
  })
  assert.equal(result.status, "dry-run")
  assert.equal(fake.calls.some((call) => Array.isArray(call) && call[0] === "push"), false)
  assert.equal(JSON.parse(await readFile(paths.jsonPath, "utf8")).status, "dry-run")
})

test("requires explicit exact-SHA authorization when main is unprotected", async () => {
  const unprotectedManifest = manifest()
  unprotectedManifest.mainGuard = {
    defaultBranch: "main",
    protected: false,
    protectionChecked: true,
    unprotectedExactShaGuardAuthorized: true
  }
  const fake = adapter({ async listProtectedBranches() { return new Set() } })
  const blockedPaths = await outputPaths()
  await assert.rejects(executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: unprotectedManifest,
    mode: "dry-run",
    adapter: fake,
    ...blockedPaths
  }), /exact-SHA guard/i)

  const allowedPaths = await outputPaths()
  const result = await executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: unprotectedManifest,
    mode: "dry-run",
    allowUnprotectedMainExactShaGuard: true,
    adapter: fake,
    ...allowedPaths
  })
  assert.equal(result.status, "dry-run")
  assert.equal(result.mainGuard.unprotectedExactShaGuardAuthorized, true)
})

test("requires explicit repository confirmation for apply", async () => {
  const paths = await outputPaths()
  await assert.rejects(executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: undefined,
    adapter: adapter(),
    ...paths
  }), /confirm-repository/i)
})

test("fails closed on repository mismatch, dirty worktree, or wrong branch", async () => {
  const paths = await outputPaths()
  await assert.rejects(executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: "katamor1/bob_builtin_analyze",
    adapter: adapter({ async getRemoteRepository() { return "other/repo" } }),
    ...paths
  }), /remote repository/i)

  await assert.rejects(executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: "katamor1/bob_builtin_analyze",
    adapter: adapter({ async getWorktreeStatus() { return " M file" } }),
    ...paths
  }), /clean worktree/i)

  await assert.rejects(executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: "katamor1/bob_builtin_analyze",
    adapter: adapter({ async getCurrentBranch() { return "main" } }),
    ...paths
  }), /execution branch/i)
})

test("does not push when a target head moved during preflight", async () => {
  const fake = adapter({ async listRemoteBranches() { return new Map([["main", mainSha], ["agent/example", "c".repeat(40)]]) } })
  const paths = await outputPaths()
  await assert.rejects(executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: "katamor1/bob_builtin_analyze",
    adapter: fake,
    ...paths
  }), /moved|does not match/i)
  assert.equal(fake.calls.some((call) => Array.isArray(call) && call[0] === "push"), false)
})

test("does not retry sequentially after an atomic push failure", async () => {
  const fake = adapter({ async runAtomicPush(command) { this.calls.push(["push", command]); return { code: 1, stdout: "", stderr: "atomic unsupported" } } })
  const paths = await outputPaths()
  const result = await executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: "katamor1/bob_builtin_analyze",
    adapter: fake,
    ...paths
  })
  assert.equal(result.status, "push_failed")
  assert.equal(fake.calls.filter((call) => Array.isArray(call) && call[0] === "push").length, 1)
  assert.equal(fake.calls.includes("verify"), false)
})

test("reports post-verification failure instead of claiming success", async () => {
  const fake = adapter({
    async postVerify() {
      return {
        mainShaAfter: mainSha,
        postVerification: { targetsAbsent: false, defaultBranchIsMain: true, mainUnchangedDuringDeletion: true },
        remainingOpenPullRequests: []
      }
    }
  })
  const paths = await outputPaths()
  const result = await executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    manifest: manifest(),
    mode: "apply",
    confirmRepository: "katamor1/bob_builtin_analyze",
    adapter: fake,
    ...paths
  })
  assert.equal(result.status, "verification_failed")
})

test("writes only final JSON and Markdown files and redacts URL userinfo", async () => {
  const paths = await outputPaths()
  await executeDeletion({
    repository: "katamor1/bob_builtin_analyze",
    remote: "https://token@example.com/repo.git",
    manifest: manifest(),
    mode: "dry-run",
    adapter: adapter(),
    ...paths
  })
  const json = await readFile(paths.jsonPath, "utf8")
  const markdown = await readFile(paths.markdownPath, "utf8")
  assert.doesNotMatch(json, /token@/)
  assert.doesNotMatch(markdown, /token@/)
  assert.deepEqual((await readdir(paths.dir)).sort(), ["execution.json", "execution.md"])
})
