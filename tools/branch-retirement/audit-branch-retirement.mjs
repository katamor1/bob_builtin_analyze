#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process"
import { readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"

import {
  evaluateRetirementEntry,
  summarizeRetirementAudit,
  validateRetirementMap
} from "./retirementPolicy.mjs"

const execFile = promisify(execFileCallback)
const SHA_PATTERN = /^[0-9a-f]{40}$/u

export async function auditRetirement({
  map,
  adapter,
  review = { critical: null, important: null },
  hostedGatesPassed = false,
  allowUnprotectedMainExactShaGuard = false,
  generatedAt = new Date().toISOString()
}) {
  validateRetirementMap(map)
  if (!adapter || typeof adapter !== "object") throw new Error("audit adapter is required")

  const auditedMainSha = await adapter.getMainSha()
  assertSha(auditedMainSha, "audited main SHA")
  const defaultBranch = await adapter.getDefaultBranch()
  if (defaultBranch !== "main") throw new Error(`Expected default branch 'main', got '${defaultBranch}'.`)
  const remoteBranches = await adapter.listRemoteBranches()
  if (!(remoteBranches instanceof Map)) throw new Error("listRemoteBranches must return a Map")
  const openRefs = await adapter.listOpenPullRequestRefs()
  const protectedBranches = await adapter.listProtectedBranches()
  if (!(openRefs instanceof Set) || !(protectedBranches instanceof Set)) {
    throw new Error("open PR refs and protected branches must be Sets")
  }
  const protectionChecked = typeof adapter.isProtectionVerified === "function"
    ? await adapter.isProtectionVerified()
    : false
  const mainProtected = protectedBranches.has("main")
  const unprotectedExactShaGuardAuthorized = protectionChecked === true
    && mainProtected === false
    && allowUnprotectedMainExactShaGuard === true
  if (protectionChecked === true && !mainProtected && !unprotectedExactShaGuardAuthorized) {
    throw new Error("The default branch 'main' must be protected, or the exact-SHA unprotected-main guard must be explicitly authorized.")
  }
  const mainGuard = {
    defaultBranch,
    protected: mainProtected,
    protectionChecked: protectionChecked === true,
    unprotectedExactShaGuardAuthorized
  }

  const entries = []
  for (const entry of map.entries) {
    const initialHead = remoteBranches.get(entry.branch)
    if (!initialHead) {
      entries.push(evaluateRetirementEntry(entry, { exists: false, reasons: [] }))
      continue
    }
    assertSha(initialHead, `${entry.branch} remote head`)

    const pullEvidence = await adapter.getPullRequestEvidence(entry)
    const paths = await adapter.checkMainPaths(entry.requiredMainPaths, entry.forbiddenMainPaths, auditedMainSha, entry)
    const behaviorChecks = await adapter.runBehaviorChecks(entry.evidenceChecks, entry, auditedMainSha)
    const comparison = await adapter.compareBranch(entry, auditedMainSha, initialHead)
    const confirmedHead = await adapter.confirmRemoteHead(entry.branch)
    const observation = {
      exists: true,
      remoteHeadSha: initialHead,
      headStable: confirmedHead === initialHead,
      observedDisposition: comparison.observedDisposition ?? entry.expectedDisposition,
      replacementPullRequestsMerged: pullEvidence.replacementsMerged === true,
      diagnosticTargetClosed: pullEvidence.predecessorClosed === true,
      productionReplacementMerged: pullEvidence.productionReplacementMerged === true,
      requiredMainPaths: paths.required,
      forbiddenMainPaths: paths.forbidden,
      behaviorChecks,
      openPullRequestReference: openRefs.has(entry.branch),
      protectionChecked: protectionChecked === true,
      protected: protectedBranches.has(entry.branch),
      uniqueUnintegratedFiles: comparison.uniqueUnintegratedFiles ?? [],
      diffFiles: comparison.diffFiles ?? [],
      reasons: comparison.reasons ?? []
    }
    const evaluated = evaluateRetirementEntry(entry, observation)
    evaluated.diffFiles = observation.diffFiles
    entries.push(evaluated)
  }

  return summarizeRetirementAudit({
    repository: map.repository,
    auditedMainSha,
    entries,
    mainGuard,
    review,
    hostedGatesPassed,
    generatedAt
  })
}

export function renderRetirementMarkdown(audit) {
  const lines = [
    "# Branch retirement reconciliation",
    "",
    `- Repository: \`${audit.repository}\``,
    `- Audited main: \`${audit.auditedMainSha}\``,
    `- Main guard: ${audit.mainGuard.protected ? "protected branch" : audit.mainGuard.unprotectedExactShaGuardAuthorized ? "explicit exact-SHA guard for unprotected main" : "not authorized"}`,
    `- Generated: ${audit.generatedAt}`,
    `- Ready for deletion: **${audit.ready_for_deletion ? "YES" : "NO"}**`,
    `- Hosted gates: **${audit.hostedGatesPassed ? "PASS" : "NOT PASS"}**`,
    `- Whole-diff review: Critical ${audit.review.critical ?? "n/a"} / Important ${audit.review.important ?? "n/a"}`,
    "",
    "| Branch | Remote head | Disposition | Deletable | Replacements | Reasons |",
    "| --- | --- | --- | ---: | --- | --- |"
  ]
  for (const entry of audit.entries) {
    lines.push(`| \`${escapeTable(entry.branch)}\` | ${entry.remoteHeadSha ? `\`${entry.remoteHeadSha}\`` : "absent"} | ${entry.observedDisposition} | ${entry.deletable ? "yes" : "no"} | ${entry.replacementPullRequests.map((number) => `#${number}`).join(", ") || "-"} | ${escapeTable(entry.reasons.join("; ") || "-")} |`)
  }
  lines.push("", "## Blocked branches", "")
  if (audit.blockedBranches.length === 0) lines.push("None.")
  else audit.blockedBranches.forEach((branch) => lines.push(`- \`${branch}\``))
  lines.push("")
  return `${lines.join("\n")}\n`
}

export async function writeAuditOutputs(audit, { jsonPath, markdownPath }) {
  if (!jsonPath || !markdownPath) throw new Error("jsonPath and markdownPath are required")
  await atomicWrite(jsonPath, `${JSON.stringify(audit, null, 2)}\n`)
  try {
    await atomicWrite(markdownPath, renderRetirementMarkdown(audit))
  } catch (error) {
    await rm(jsonPath, { force: true })
    throw error
  }
}

export class CommandAuditAdapter {
  constructor({ repository, remote = "origin", base = "main", runner = runCommand, reviewedObservations = {} }) {
    this.repository = repository
    this.remote = remote
    this.base = base
    this.runner = runner
    this.reviewedObservations = reviewedObservations
  }

  async getMainSha() {
    const output = await this.runner("git", ["rev-parse", "--verify", this.base])
    return output.stdout.trim()
  }

  async getDefaultBranch() {
    const output = await this.runner("gh", ["api", `repos/${this.repository}`, "--jq", ".default_branch"])
    return output.stdout.trim()
  }

  async listRemoteBranches() {
    const output = await this.runner("git", ["ls-remote", "--heads", this.remote])
    return parseLsRemote(output.stdout)
  }

  async listOpenPullRequestRefs() {
    const output = await this.runner("gh", ["api", "--paginate", `repos/${this.repository}/pulls?state=open&per_page=100`])
    const pulls = parseJson(output.stdout, "open pull requests")
    const refs = new Set()
    for (const pull of pulls) {
      if (pull?.head?.ref) refs.add(pull.head.ref)
      if (pull?.base?.ref) refs.add(pull.base.ref)
    }
    return refs
  }

  async listProtectedBranches() {
    const output = await this.runner("gh", ["api", "--paginate", `repos/${this.repository}/branches?per_page=100`])
    const branches = parseJson(output.stdout, "repository branches")
    return new Set(branches.filter((branch) => branch?.protected === true).map((branch) => branch.name))
  }

  async isProtectionVerified() { return true }

  async getPullRequestEvidence(entry) {
    const all = [...new Set([...(entry.predecessorPullRequests ?? []), ...(entry.replacementPullRequests ?? []), ...(entry.relatedProductionPullRequests ?? [])])]
    const records = new Map()
    for (const number of all) {
      const output = await this.runner("gh", ["api", `repos/${this.repository}/pulls/${number}`])
      records.set(number, parseJson(output.stdout, `pull request #${number}`))
    }
    const merged = (number) => Boolean(records.get(number)?.merged_at || records.get(number)?.merged === true)
    const closed = (number) => records.get(number)?.state === "closed"
    return {
      replacementsMerged: (entry.replacementPullRequests ?? []).every(merged),
      predecessorClosed: (entry.predecessorPullRequests ?? []).every(closed),
      productionReplacementMerged: (entry.relatedProductionPullRequests ?? entry.replacementPullRequests ?? []).every(merged)
    }
  }

  async checkMainPaths(required, forbidden, mainSha) {
    const missing = []
    const present = []
    for (const file of required) {
      const result = await this.runner("git", ["cat-file", "-e", `${mainSha}:${file}`], { allowFailure: true })
      if (result.code !== 0) missing.push(file)
    }
    for (const file of forbidden) {
      const result = await this.runner("git", ["cat-file", "-e", `${mainSha}:${file}`], { allowFailure: true })
      if (result.code === 0) present.push(file)
    }
    return {
      required: { passed: missing.length === 0, missing, checked: [...required] },
      forbidden: { passed: present.length === 0, present, checked: [...forbidden] }
    }
  }

  async runBehaviorChecks(ids, entry) {
    const observation = this.reviewedObservations[entry.branch]
    const checks = ids.map((id) => {
      const item = observation?.behaviorChecks?.find((candidate) => candidate.id === id)
      return item ?? { id, passed: false, detail: "No reviewed observation was supplied." }
    })
    return { passed: checks.every((item) => item.passed === true), checks }
  }

  async compareBranch(entry, mainSha, remoteHeadSha) {
    const observation = this.reviewedObservations[entry.branch]
    if (observation) {
      return {
        observedDisposition: observation.observedDisposition ?? entry.expectedDisposition,
        uniqueUnintegratedFiles: observation.uniqueUnintegratedFiles ?? [],
        diffFiles: observation.diffFiles ?? [],
        reasons: observation.reasons ?? []
      }
    }
    const output = await this.runner("git", ["diff", "--name-only", `${mainSha}...${remoteHeadSha}`])
    const diffFiles = output.stdout.split(/\r?\n/u).filter(Boolean)
    return {
      observedDisposition: "blocked-unique",
      uniqueUnintegratedFiles: diffFiles,
      diffFiles,
      reasons: ["No reviewed branch comparison was supplied; live audit fails closed."]
    }
  }

  async confirmRemoteHead(branch) {
    const output = await this.runner("git", ["ls-remote", "--heads", this.remote, `refs/heads/${branch}`])
    const parsed = parseLsRemote(output.stdout)
    return parsed.get(branch) ?? null
  }
}

export class ObservationAuditAdapter {
  constructor(observations) {
    this.observations = observations
  }
  async getMainSha() { return this.observations.mainSha }
  async getDefaultBranch() { return this.observations.defaultBranch ?? "main" }
  async listRemoteBranches() { return new Map(Object.entries(this.observations.remoteBranches ?? {})) }
  async listOpenPullRequestRefs() { return new Set(this.observations.openPullRequestRefs ?? []) }
  async listProtectedBranches() { return new Set(this.observations.protectedBranches ?? []) }
  async isProtectionVerified() { return this.observations.protectedBranchesVerified === true }
  async getPullRequestEvidence(entry) { return this.observations.entries[entry.branch]?.pullEvidence ?? {} }
  async checkMainPaths(required, forbidden, _mainSha, entry) {
    const observation = this.observations.entries[entry.branch]
    if (!observation) {
      return {
        required: { passed: false, missing: [...required], checked: [...required] },
        forbidden: { passed: false, present: [], checked: [...forbidden] }
      }
    }
    return observation.paths
  }
  async runBehaviorChecks(ids, entry) {
    const observation = this.observations.entries[entry.branch]
    const checks = ids.map((id) => observation?.behaviorChecks?.find((item) => item.id === id) ?? { id, passed: false })
    return { passed: checks.every((item) => item.passed === true), checks }
  }
  async compareBranch(entry) {
    const observation = this.observations.entries[entry.branch] ?? {}
    return {
      observedDisposition: observation.observedDisposition ?? entry.expectedDisposition,
      uniqueUnintegratedFiles: observation.uniqueUnintegratedFiles ?? [],
      diffFiles: observation.diffFiles ?? [],
      reasons: observation.reasons ?? []
    }
  }
  async confirmRemoteHead(branch) { return this.observations.remoteBranches?.[branch] ?? null }
}

async function main(argv) {
  const args = parseArgs(argv)
  const map = parseJson(await readFile(args.map, "utf8"), "retirement map")
  let adapter
  if (args.observations) {
    const observations = parseJson(await readFile(args.observations, "utf8"), "reviewed observations")
    adapter = createObservationAdapter(observations)
  } else {
    let reviewedObservations = {}
    if (args.reviewedObservations) {
      const reviewed = parseJson(await readFile(args.reviewedObservations, "utf8"), "reviewed branch observations")
      reviewedObservations = reviewed.entries ?? reviewed
    }
    adapter = new CommandAuditAdapter({
      repository: args.repository,
      remote: args.remote,
      base: args.base,
      reviewedObservations
    })
  }
  const result = await auditRetirement({
    map,
    adapter,
    review: { critical: args.reviewCritical, important: args.reviewImportant },
    hostedGatesPassed: args.hostedGatesPassed,
    allowUnprotectedMainExactShaGuard: args.allowUnprotectedMainExactShaGuard
  })
  await writeAuditOutputs(result, { jsonPath: args.json, markdownPath: args.markdown })
  process.stdout.write(`${JSON.stringify({ ready_for_deletion: result.ready_for_deletion, blockedBranches: result.blockedBranches })}\n`)
  if (!result.ready_for_deletion) process.exitCode = 2
}

function createObservationAdapter(observations) {
  return {
    async getMainSha() { return observations.mainSha },
    async getDefaultBranch() { return observations.defaultBranch ?? "main" },
    async listRemoteBranches() { return new Map(Object.entries(observations.remoteBranches ?? {})) },
    async listOpenPullRequestRefs() { return new Set(observations.openPullRequestRefs ?? []) },
    async listProtectedBranches() { return new Set(observations.protectedBranches ?? []) },
    async isProtectionVerified() { return observations.protectedBranchesVerified === true },
    async getPullRequestEvidence(entry) { return observations.entries?.[entry.branch]?.pullEvidence ?? {} },
    async checkMainPaths(required, forbidden, _mainSha, entry) {
      const observation = observations.entries?.[entry.branch]
      return observation?.paths ?? {
        required: { passed: false, missing: [...required], checked: [...required] },
        forbidden: { passed: false, present: [], checked: [...forbidden] }
      }
    },
    async runBehaviorChecks(ids, entry) {
      const observation = observations.entries?.[entry.branch]
      const checks = ids.map((id) => observation?.behaviorChecks?.find((item) => item.id === id) ?? { id, passed: false })
      return { passed: checks.every((item) => item.passed === true), checks }
    },
    async compareBranch(entry) {
      const observation = observations.entries?.[entry.branch] ?? {}
      return {
        observedDisposition: observation.observedDisposition ?? entry.expectedDisposition,
        uniqueUnintegratedFiles: observation.uniqueUnintegratedFiles ?? [],
        diffFiles: observation.diffFiles ?? [],
        reasons: observation.reasons ?? []
      }
    },
    async confirmRemoteHead(branch) { return observations.remoteBranches?.[branch] ?? null }
  }
}

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith("--")) throw new Error(`Unexpected argument '${key}'.`)
    if (key === "--hosted-gates-passed" || key === "--allow-unprotected-main-with-exact-sha-guard") { values.set(key, true); continue }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for '${key}'.`)
    values.set(key, value)
    index += 1
  }
  const required = ["--repository", "--map", "--json", "--markdown"]
  for (const key of required) if (!values.has(key)) throw new Error(`Missing required argument '${key}'.`)
  return {
    repository: values.get("--repository"),
    remote: values.get("--remote") ?? "origin",
    base: values.get("--base") ?? "main",
    map: values.get("--map"),
    json: values.get("--json"),
    markdown: values.get("--markdown"),
    observations: values.get("--observations"),
    reviewedObservations: values.get("--reviewed-observations"),
    reviewCritical: parseCount(values.get("--review-critical")),
    reviewImportant: parseCount(values.get("--review-important")),
    hostedGatesPassed: values.get("--hosted-gates-passed") === true,
    allowUnprotectedMainExactShaGuard: values.get("--allow-unprotected-main-with-exact-sha-guard") === true
  }
}

function parseCount(value) {
  if (value === undefined) return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) throw new Error(`Invalid review count '${value}'.`)
  return number
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

function parseLsRemote(text) {
  const branches = new Map()
  for (const line of text.split(/\r?\n/u)) {
    if (!line) continue
    const match = line.match(/^([0-9a-f]{40})\s+refs\/heads\/(.+)$/u)
    if (!match) throw new Error(`Malformed ls-remote line: '${line}'.`)
    branches.set(match[2], match[1])
  }
  return branches
}

function parseJson(text, label) {
  try { return JSON.parse(text) } catch (error) { throw new Error(`Failed to parse ${label}: ${error.message}`) }
}

async function atomicWrite(target, content) {
  const directory = path.dirname(target)
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" })
  try { await rename(temporary, target) } catch (error) { await rm(temporary, { force: true }); throw error }
}

function assertSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) throw new Error(`${label} must be a 40-character lowercase hex SHA.`)
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ")
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
