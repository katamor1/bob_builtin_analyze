#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process"
import { readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"

import {
  buildAtomicDeletionPlan,
  summarizeDeletionResult
} from "./deletionPolicy.mjs"

const execFile = promisify(execFileCallback)
const EXECUTION_BRANCH = "integration/retire-superseded-branches-20260716-v2"

export async function executeDeletion({
  repository,
  remote = "origin",
  manifest,
  mode = "dry-run",
  confirmRepository,
  allowUnprotectedMainExactShaGuard = false,
  adapter,
  jsonPath,
  markdownPath,
  generatedAt = new Date().toISOString()
}) {
  if (mode !== "dry-run" && mode !== "apply") throw new Error(`Unsupported mode '${mode}'.`)
  if (!adapter || typeof adapter !== "object") throw new Error("deletion adapter is required")
  if (mode === "apply" && confirmRepository !== repository) {
    throw new Error(`Apply requires --confirm-repository ${repository}.`)
  }

  const worktreeStatus = await adapter.getWorktreeStatus()
  if (worktreeStatus.trim()) throw new Error("Branch retirement requires a clean worktree.")
  const currentBranch = await adapter.getCurrentBranch()
  if (mode === "apply" && currentBranch !== EXECUTION_BRANCH) {
    throw new Error(`Apply must run from execution branch '${EXECUTION_BRANCH}'.`)
  }
  const remoteRepository = await adapter.getRemoteRepository(remote)
  if (remoteRepository !== repository) {
    throw new Error(`Configured remote repository '${remoteRepository}' does not match '${repository}'.`)
  }

  const defaultBranch = await adapter.getDefaultBranch(repository)
  const currentMainSha = await adapter.getMainSha(remote)
  const auditedMainIsAncestor = await adapter.auditedMainIsAncestor(manifest.auditedMainSha, currentMainSha)
  const remoteBranches = await adapter.listRemoteBranches(remote)
  const openPullRequestRefs = await adapter.listOpenPullRequestRefs(repository)
  const protectedBranches = await adapter.listProtectedBranches(repository)

  const plan = buildAtomicDeletionPlan({
    manifest,
    repository,
    remote,
    defaultBranch,
    currentMainSha,
    auditedMainIsAncestor,
    remoteBranches,
    openPullRequestRefs,
    protectedBranches,
    allowUnprotectedMainExactShaGuard,
    executionBranch: EXECUTION_BRANCH
  })

  if (mode === "dry-run") {
    const result = {
      ...summarizeDeletionResult(plan, { mode: "dry-run" }),
      generatedAt,
      currentBranch,
      wouldDeleteCount: plan.branches.length,
      blockedCount: 0
    }
    await writeExecutionOutputs(result, { jsonPath, markdownPath })
    return result
  }

  if (plan.command === null) {
    const verification = await adapter.postVerify(plan, repository)
    const result = {
      ...summarizeDeletionResult(plan, { mode: "apply", pushSucceeded: true, ...verification }),
      generatedAt,
      currentBranch
    }
    await writeExecutionOutputs(result, { jsonPath, markdownPath })
    return result
  }

  const push = await adapter.runAtomicPush(plan.command)
  if (push.code !== 0) {
    const result = {
      ...summarizeDeletionResult(plan, { mode: "apply", pushSucceeded: false, blocked: [{ reason: push.stderr || "atomic push failed" }] }),
      generatedAt,
      currentBranch
    }
    await writeExecutionOutputs(result, { jsonPath, markdownPath })
    return result
  }

  const verification = await adapter.postVerify(plan, repository)
  const result = {
    ...summarizeDeletionResult(plan, { mode: "apply", pushSucceeded: true, ...verification }),
    generatedAt,
    currentBranch
  }
  await writeExecutionOutputs(result, { jsonPath, markdownPath })
  return result
}

export function renderExecutionMarkdown(result) {
  const lines = [
    "# Branch retirement execution",
    "",
    `- Repository: \`${result.repository}\``,
    `- Status: **${result.status}**`,
    `- Mode: ${result.mode}`,
    `- Main before: \`${result.mainShaBefore}\``,
    `- Main after: \`${result.mainShaAfter}\``,
    `- Atomic: ${result.atomic ? "yes" : "no"}`,
    `- Main guard: ${result.mainGuard.protected ? "protected branch" : result.mainGuard.unprotectedExactShaGuardAuthorized ? "explicit exact-SHA guard for unprotected main" : "not authorized"}`,
    `- Generated: ${result.generatedAt ?? "n/a"}`,
    "",
    "## Target branches",
    ""
  ]
  const targets = result.mode === "dry-run" ? result.wouldDelete : result.deleted
  if (targets.length === 0) lines.push("None.")
  else for (const entry of targets) lines.push(`- \`${entry.branch}\` at \`${entry.expectedSha}\` → ${entry.replacementPullRequests.map((number) => `#${number}`).join(", ") || "no PR"}`)
  lines.push("", "## Already absent", "")
  if (result.alreadyAbsent.length === 0) lines.push("None.")
  else result.alreadyAbsent.forEach((branch) => lines.push(`- \`${branch}\``))
  lines.push("", "## Verification", "", `- targets absent: ${formatNullable(result.verification.targetsAbsent)}`, `- default branch is main: ${formatNullable(result.verification.defaultBranchIsMain)}`, `- main unchanged during deletion: ${formatNullable(result.verification.mainUnchangedDuringDeletion)}`, "")
  return `${lines.join("\n")}\n`
}

export async function writeExecutionOutputs(result, { jsonPath, markdownPath }) {
  if (!jsonPath || !markdownPath) throw new Error("jsonPath and markdownPath are required")
  await atomicWrite(jsonPath, `${JSON.stringify(result, null, 2)}\n`)
  try {
    await atomicWrite(markdownPath, renderExecutionMarkdown(result))
  } catch (error) {
    await rm(jsonPath, { force: true })
    throw error
  }
}

export class CommandDeletionAdapter {
  constructor({ runner = runCommand } = {}) { this.runner = runner }
  async getWorktreeStatus() { return (await this.runner("git", ["status", "--porcelain=v1"])).stdout }
  async getCurrentBranch() { return (await this.runner("git", ["branch", "--show-current"])).stdout.trim() }
  async getRemoteRepository(remote) {
    const url = (await this.runner("git", ["remote", "get-url", remote])).stdout.trim()
    return repositoryFromRemoteUrl(url)
  }
  async getDefaultBranch(repository) {
    const output = await this.runner("gh", ["api", `repos/${repository}`, "--jq", ".default_branch"])
    return output.stdout.trim()
  }
  async getMainSha(remote) {
    await this.runner("git", ["fetch", "--no-tags", remote, "main"])
    return (await this.runner("git", ["rev-parse", `refs/remotes/${remote}/main`])).stdout.trim()
  }
  async auditedMainIsAncestor(audited, current) {
    const result = await this.runner("git", ["merge-base", "--is-ancestor", audited, current], { allowFailure: true })
    return result.code === 0
  }
  async listRemoteBranches(remote) {
    const output = await this.runner("git", ["ls-remote", "--heads", remote])
    return parseLsRemote(output.stdout)
  }
  async listOpenPullRequestRefs(repository) {
    const output = await this.runner("gh", ["api", "--paginate", `repos/${repository}/pulls?state=open&per_page=100`])
    const pulls = parseJson(output.stdout, "open pull requests")
    const refs = new Set()
    for (const pull of pulls) {
      if (pull?.head?.ref) refs.add(pull.head.ref)
      if (pull?.base?.ref) refs.add(pull.base.ref)
    }
    return refs
  }
  async listProtectedBranches(repository) {
    const output = await this.runner("gh", ["api", "--paginate", `repos/${repository}/branches?per_page=100`])
    const branches = parseJson(output.stdout, "branches")
    return new Set(branches.filter((entry) => entry?.protected === true).map((entry) => entry.name))
  }
  async runAtomicPush(command) {
    if (!Array.isArray(command) || command[0] !== "git") throw new Error("Atomic push command must be an argv array beginning with git.")
    return this.runner(command[0], command.slice(1), { allowFailure: true })
  }
  async postVerify(plan, repository) {
    const remoteBranches = await this.listRemoteBranches(plan.remote)
    const defaultBranch = await this.getDefaultBranch(repository)
    const mainShaAfter = remoteBranches.get("main")
    const openRefs = await this.listOpenPullRequestRefs(repository)
    return {
      mainShaAfter,
      remainingOpenPullRequests: [...openRefs],
      postVerification: {
        targetsAbsent: plan.branches.every(({ branch }) => !remoteBranches.has(branch)),
        defaultBranchIsMain: defaultBranch === "main",
        mainUnchangedDuringDeletion: mainShaAfter === plan.currentMainSha
      }
    }
  }
}

async function main(argv) {
  const args = parseArgs(argv)
  const manifest = parseJson(await readFile(args.manifest, "utf8"), "retirement manifest")
  const result = await executeDeletion({
    repository: args.repository,
    remote: args.remote,
    manifest,
    mode: args.mode,
    confirmRepository: args.confirmRepository,
    allowUnprotectedMainExactShaGuard: args.allowUnprotectedMainExactShaGuard,
    adapter: new CommandDeletionAdapter(),
    jsonPath: args.executionJson,
    markdownPath: args.executionMarkdown
  })
  process.stdout.write(`${JSON.stringify({ status: result.status, targets: result.wouldDelete?.length ?? result.deleted?.length ?? 0 })}\n`)
  if (result.status === "push_failed" || result.status === "verification_failed") process.exitCode = 2
}

function parseArgs(argv) {
  const values = new Map()
  let mode = "dry-run"
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === "--dry-run") { mode = "dry-run"; continue }
    if (key === "--apply") { mode = "apply"; continue }
    if (key === "--allow-unprotected-main-with-exact-sha-guard") { values.set(key, true); continue }
    if (!key.startsWith("--")) throw new Error(`Unexpected argument '${key}'.`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for '${key}'.`)
    values.set(key, value)
    index += 1
  }
  for (const key of ["--repository", "--manifest", "--execution-json", "--execution-markdown"]) {
    if (!values.has(key)) throw new Error(`Missing required argument '${key}'.`)
  }
  return {
    repository: values.get("--repository"),
    remote: values.get("--remote") ?? "origin",
    manifest: values.get("--manifest"),
    executionJson: values.get("--execution-json"),
    executionMarkdown: values.get("--execution-markdown"),
    confirmRepository: values.get("--confirm-repository"),
    allowUnprotectedMainExactShaGuard: values.get("--allow-unprotected-main-with-exact-sha-guard") === true,
    mode
  }
}

async function runCommand(command, args, { allowFailure = false } = {}) {
  try {
    const result = await execFile(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
    return { code: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
  } catch (error) {
    const result = { code: Number.isInteger(error.code) ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message }
    if (allowFailure) return result
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`)
  }
}

function repositoryFromRemoteUrl(value) {
  const sanitized = value.replace(/^[^@]+@(?=github\.com[:/])/u, "")
  const match = sanitized.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/u)
  if (!match) throw new Error("Remote URL does not identify a GitHub owner/repository pair.")
  return `${match[1]}/${match[2]}`
}

function parseLsRemote(text) {
  const branches = new Map()
  for (const line of text.split(/\r?\n/u)) {
    if (!line) continue
    const match = line.match(/^([0-9a-f]{40})\s+refs\/heads\/(.+)$/u)
    if (!match) throw new Error(`Malformed ls-remote line '${line}'.`)
    branches.set(match[2], match[1])
  }
  return branches
}

function parseJson(text, label) {
  try { return JSON.parse(text) } catch (error) { throw new Error(`Failed to parse ${label}: ${error.message}`) }
}

async function atomicWrite(target, content) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" })
  try { await rename(temporary, target) } catch (error) { await rm(temporary, { force: true }); throw error }
}

function formatNullable(value) { return value === null ? "not run" : value ? "yes" : "no" }

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
