const AUDIT_SCHEMA = "bob-builtin-analyze/branch-retirement-audit/v1"
const EXECUTION_SCHEMA = "bob-builtin-analyze/branch-retirement-execution/v1"
const SHA_PATTERN = /^[0-9a-f]{40}$/u

export function validateDeletionInputs(input) {
  assertRecord(input, "deletion inputs")
  const { manifest } = input
  assertRecord(manifest, "retirement manifest")
  if (manifest.schemaVersion !== AUDIT_SCHEMA) throw new Error(`Manifest schemaVersion must be '${AUDIT_SCHEMA}'.`)
  if (manifest.repository !== input.repository) throw new Error("Manifest repository does not match the confirmed repository.")
  if (manifest.ready_for_deletion !== true) throw new Error("Manifest ready_for_deletion must be true.")
  if (!Array.isArray(manifest.blockedBranches) || manifest.blockedBranches.length !== 0) {
    throw new Error("Manifest blockedBranches must be an empty array.")
  }
  assertSha(manifest.auditedMainSha, "manifest auditedMainSha")
  assertSha(input.currentMainSha, "currentMainSha")
  if (input.auditedMainIsAncestor !== true) throw new Error("Audited main must be an ancestor of current main.")
  if (!(input.remoteBranches instanceof Map)) throw new Error("remoteBranches must be a Map.")
  if (!(input.openPullRequestRefs instanceof Set)) throw new Error("openPullRequestRefs must be a Set.")
  if (!(input.protectedBranches instanceof Set)) throw new Error("protectedBranches must be a Set.")
  if (input.defaultBranch !== "main") throw new Error(`Expected default branch 'main', got '${input.defaultBranch}'.`)
  assertRecord(manifest.mainGuard, "manifest mainGuard")
  if (manifest.mainGuard.defaultBranch !== "main") throw new Error("Manifest mainGuard.defaultBranch must be 'main'.")
  if (manifest.mainGuard.protectionChecked !== true) throw new Error("Manifest mainGuard must record an independently verified protection query.")
  const mainProtected = input.protectedBranches.has("main")
  if (manifest.mainGuard.protected !== mainProtected) {
    throw new Error("Main protection state changed after audit; rerun the retirement audit.")
  }
  if (mainProtected) {
    if (manifest.mainGuard.unprotectedExactShaGuardAuthorized === true) {
      throw new Error("Protected main has stale unprotected exact-SHA guard authorization; rerun the retirement audit.")
    }
  } else if (input.allowUnprotectedMainExactShaGuard !== true || manifest.mainGuard.unprotectedExactShaGuardAuthorized !== true) {
    throw new Error("Unprotected main requires explicit exact-SHA guard authorization in both the manifest and deletion invocation.")
  }
  if (input.remoteBranches.get("main") !== input.currentMainSha) throw new Error("Remote main SHA does not match currentMainSha.")
  if (!Array.isArray(manifest.entries)) throw new Error("Manifest entries must be an array.")

  const seen = new Set()
  for (const entry of manifest.entries) {
    assertRecord(entry, "manifest entry")
    if (typeof entry.branch !== "string" || entry.branch.length === 0) throw new Error("Manifest entry branch must be non-empty.")
    if (seen.has(entry.branch)) throw new Error(`Duplicate branch '${entry.branch}' in manifest.`)
    seen.add(entry.branch)
    if (entry.branch === input.defaultBranch) throw new Error("The default branch may not be deleted.")
    if (entry.branch === input.executionBranch) throw new Error("The execution branch may not be included in the main deletion batch.")
    if (input.protectedBranches.has(entry.branch)) throw new Error(`Protected branch '${entry.branch}' may not be deleted.`)
    if (input.openPullRequestRefs.has(entry.branch)) throw new Error(`Branch '${entry.branch}' is referenced by an open pull request.`)

    if (entry.observedDisposition === "already-absent") {
      if (entry.remoteHeadSha !== null || input.remoteBranches.has(entry.branch)) {
        throw new Error(`Already-absent branch '${entry.branch}' unexpectedly exists.`)
      }
      continue
    }

    if (entry.deletable !== true || entry.safeToRetire !== true) {
      throw new Error(`Manifest entry '${entry.branch}' is not deletable.`)
    }
    assertSha(entry.remoteHeadSha, `${entry.branch}.remoteHeadSha`)
    const freshSha = input.remoteBranches.get(entry.branch)
    if (!freshSha) throw new Error(`Branch '${entry.branch}' disappeared after audit and must be re-audited as already-absent.`)
    assertSha(freshSha, `${entry.branch} fresh remote SHA`)
    if (freshSha !== entry.remoteHeadSha) throw new Error(`Branch '${entry.branch}' moved: fresh SHA does not match the audited SHA.`)
  }
  return true
}

export function buildAtomicDeletionPlan(input) {
  validateDeletionInputs(input)
  const branches = []
  const alreadyAbsent = []
  for (const entry of input.manifest.entries) {
    if (entry.observedDisposition === "already-absent") {
      alreadyAbsent.push(entry.branch)
      continue
    }
    branches.push({
      branch: entry.branch,
      expectedSha: entry.remoteHeadSha,
      disposition: entry.observedDisposition,
      replacementPullRequests: [...(entry.replacementPullRequests ?? [])]
    })
  }

  const command = branches.length === 0 ? null : [
    "git",
    "push",
    "--atomic",
    ...branches.map(({ branch, expectedSha }) => `--force-with-lease=refs/heads/${branch}:${expectedSha}`),
    input.remote,
    ...branches.map(({ branch }) => `:refs/heads/${branch}`)
  ]
  if (command) validateAtomicCommand(command, branches, input.remote)
  return {
    repository: input.repository,
    remote: input.remote,
    auditedMainSha: input.manifest.auditedMainSha,
    currentMainSha: input.currentMainSha,
    mainGuard: { ...input.manifest.mainGuard },
    branches,
    alreadyAbsent,
    command
  }
}

export function summarizeDeletionResult(plan, outcome) {
  const mode = outcome.mode ?? "dry-run"
  const verification = outcome.postVerification ?? null
  let status
  if (mode === "dry-run") status = "dry-run"
  else if (outcome.pushSucceeded !== true) status = "push_failed"
  else if (!verification || verification.targetsAbsent !== true || verification.defaultBranchIsMain !== true || verification.mainUnchangedDuringDeletion !== true) status = "verification_failed"
  else status = "success"

  return {
    schemaVersion: EXECUTION_SCHEMA,
    repository: plan.repository,
    status,
    mode,
    mainShaBefore: plan.currentMainSha,
    mainShaAfter: outcome.mainShaAfter ?? plan.currentMainSha,
    atomic: true,
    mainGuard: { ...plan.mainGuard },
    wouldDelete: mode === "dry-run" ? plan.branches : [],
    deleted: status === "success" ? plan.branches : [],
    alreadyAbsent: [...plan.alreadyAbsent],
    blocked: outcome.blocked ?? [],
    remainingOpenPullRequests: outcome.remainingOpenPullRequests ?? [],
    verification: verification ?? {
      targetsAbsent: mode === "dry-run" ? null : false,
      defaultBranchIsMain: mode === "dry-run" ? null : false,
      mainUnchangedDuringDeletion: mode === "dry-run" ? null : false
    },
    command: redactDeletionCommand(plan.command)
  }
}

export function redactDeletionCommand(command) {
  if (command === null) return null
  return command.map((part) => part.replace(/(https?:\/\/)[^/@\s]+@/gu, "$1***@"))
}

function validateAtomicCommand(command, branches, remote) {
  if (!Array.isArray(command) || command[0] !== "git" || command[1] !== "push" || !command.includes("--atomic")) {
    throw new Error("Deletion command must use git push --atomic.")
  }
  if (!command.includes(remote)) throw new Error("Deletion command is missing the configured remote.")
  for (const { branch, expectedSha } of branches) {
    const lease = `--force-with-lease=refs/heads/${branch}:${expectedSha}`
    const refspec = `:refs/heads/${branch}`
    if (!command.includes(lease)) throw new Error(`Deletion command is missing exact lease for '${branch}'.`)
    if (!command.includes(refspec)) throw new Error(`Deletion command is missing delete refspec for '${branch}'.`)
  }
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`)
}

function assertSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) throw new Error(`${label} must be a 40-character lowercase hex SHA.`)
}
