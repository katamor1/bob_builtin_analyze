const MAP_SCHEMA = "bob-builtin-analyze/branch-retirement-map/v1"
const AUDIT_SCHEMA = "bob-builtin-analyze/branch-retirement-audit/v1"
const SHA_PATTERN = /^[0-9a-f]{40}$/u
const BRANCH_PATTERN = /^(?![./])(?!.*(?:\.\.|@\{|\\|\s))(?!.*\/$)[A-Za-z0-9][A-Za-z0-9._/-]*$/u
const DISPOSITIONS = new Set([
  "merged-source",
  "superseded",
  "diagnostic-only",
  "temporary-automation",
  "blocked-unique",
  "already-absent"
])

export function validateRetirementMap(map) {
  assertRecord(map, "retirement map")
  if (map.schemaVersion !== MAP_SCHEMA) {
    throw new Error(`Retirement map schemaVersion must be '${MAP_SCHEMA}'.`)
  }
  if (typeof map.repository !== "string" || !/^[^/]+\/[^/]+$/u.test(map.repository)) {
    throw new Error("Retirement map repository must use owner/name form.")
  }
  assertSha(map.baselineMain, "baselineMain")
  if (!Array.isArray(map.entries)) throw new Error("Retirement map entries must be an array.")

  const branches = new Set()
  for (const [index, entry] of map.entries.entries()) {
    assertRecord(entry, `entry ${index}`)
    const branch = entry.branch
    if (typeof branch !== "string" || !BRANCH_PATTERN.test(branch)) {
      throw new Error(`Entry ${index} has an invalid branch name.`)
    }
    if (branch === "main") throw new Error("The default branch 'main' may not be a retirement target.")
    if (branches.has(branch)) throw new Error(`Duplicate branch '${branch}' in retirement map.`)
    branches.add(branch)

    assertSha(entry.expectedHeadSha, `${branch}.expectedHeadSha`)
    if (!DISPOSITIONS.has(entry.expectedDisposition) || entry.expectedDisposition === "already-absent") {
      throw new Error(`Entry '${branch}' has an unsupported expected disposition '${entry.expectedDisposition}'.`)
    }

    const replacements = integerArray(entry.replacementPullRequests, `${branch}.replacementPullRequests`)
    integerArray(entry.predecessorPullRequests ?? [], `${branch}.predecessorPullRequests`)
    const related = integerArray(entry.relatedProductionPullRequests ?? [], `${branch}.relatedProductionPullRequests`)
    if ((entry.expectedDisposition === "merged-source" || entry.expectedDisposition === "superseded") && replacements.length === 0) {
      throw new Error(`Entry '${branch}' requires at least one replacement pull request.`)
    }
    if (entry.expectedDisposition === "diagnostic-only" && related.length === 0) {
      throw new Error(`Diagnostic-only entry '${branch}' requires a related production pull request.`)
    }
    if (entry.expectedDisposition === "temporary-automation" && related.length === 0) {
      throw new Error(`Temporary automation entry '${branch}' requires a related production pull request.`)
    }

    const required = stringArray(entry.requiredMainPaths, `${branch}.requiredMainPaths`)
    const forbidden = stringArray(entry.forbiddenMainPaths, `${branch}.forbiddenMainPaths`)
    stringArray(entry.evidenceChecks, `${branch}.evidenceChecks`)
    const forbiddenSet = new Set(forbidden)
    const overlap = required.filter((path) => forbiddenSet.has(path))
    if (overlap.length > 0) {
      throw new Error(`Entry '${branch}' has paths that are both required and forbidden: ${overlap.join(", ")}.`)
    }
  }
  return true
}

export function evaluateRetirementEntry(entry, observation) {
  assertRecord(entry, "retirement entry")
  assertRecord(observation, `observation for ${entry.branch}`)

  if (observation.exists === false) {
    return {
      branch: entry.branch,
      remoteHeadSha: null,
      expectedHeadSha: entry.expectedHeadSha,
      expectedDisposition: entry.expectedDisposition,
      observedDisposition: "already-absent",
      replacementPullRequests: [...entry.replacementPullRequests],
      predecessorPullRequests: [...(entry.predecessorPullRequests ?? [])],
      requiredMainPaths: observation.requiredMainPaths ?? { passed: true, missing: [] },
      forbiddenMainPaths: observation.forbiddenMainPaths ?? { passed: true, present: [] },
      behaviorChecks: observation.behaviorChecks ?? { passed: true, checks: [] },
      openPullRequestReference: false,
      protected: false,
      uniqueUnintegratedFiles: [],
      deletable: false,
      safeToRetire: true,
      reasons: uniqueStrings(observation.reasons ?? [])
    }
  }

  const reasons = [...(observation.reasons ?? [])]
  const remoteHeadSha = observation.remoteHeadSha
  if (typeof remoteHeadSha !== "string" || !SHA_PATTERN.test(remoteHeadSha)) {
    reasons.push("remote head SHA is missing or malformed")
  }
  if (remoteHeadSha !== entry.expectedHeadSha) reasons.push("remote head SHA does not match the audited expected SHA")
  if (observation.headStable !== true) reasons.push("remote head moved during audit")
  if (observation.observedDisposition !== entry.expectedDisposition) {
    reasons.push(`observed disposition '${observation.observedDisposition}' does not match '${entry.expectedDisposition}'`)
  }

  if (entry.expectedDisposition === "merged-source" || entry.expectedDisposition === "superseded") {
    if (observation.replacementPullRequestsMerged !== true) reasons.push("replacement pull request evidence is not fully merged")
  }
  if (entry.expectedDisposition === "diagnostic-only" || entry.expectedDisposition === "temporary-automation") {
    if (observation.diagnosticTargetClosed !== true) reasons.push("diagnostic or automation predecessor is not closed")
    if (observation.productionReplacementMerged !== true) reasons.push("related production replacement is not merged")
  }
  if (observation.requiredMainPaths?.passed !== true) reasons.push("required main paths are missing")
  if (observation.forbiddenMainPaths?.passed !== true) reasons.push("forbidden temporary paths are present on main")
  if (observation.behaviorChecks?.passed !== true) reasons.push("one or more behavior evidence checks failed")
  if (observation.openPullRequestReference === true) reasons.push("branch is referenced by an open pull request")
  if (observation.protectionChecked !== true) reasons.push("branch protection state was not independently verified")
  if (observation.protected === true) reasons.push("branch is protected")
  if ((observation.uniqueUnintegratedFiles ?? []).length > 0) reasons.push("unique unintegrated files or contracts remain")
  if (observation.observedDisposition === "blocked-unique") reasons.push("branch contains a blocked unique change")

  const normalizedReasons = uniqueStrings(reasons)
  const deletable = normalizedReasons.length === 0 && observation.observedDisposition !== "blocked-unique"
  return {
    branch: entry.branch,
    remoteHeadSha: typeof remoteHeadSha === "string" ? remoteHeadSha : null,
    expectedHeadSha: entry.expectedHeadSha,
    expectedDisposition: entry.expectedDisposition,
    observedDisposition: observation.observedDisposition,
    replacementPullRequests: [...entry.replacementPullRequests],
    predecessorPullRequests: [...(entry.predecessorPullRequests ?? [])],
    requiredMainPaths: observation.requiredMainPaths ?? { passed: false, missing: [] },
    forbiddenMainPaths: observation.forbiddenMainPaths ?? { passed: false, present: [] },
    behaviorChecks: observation.behaviorChecks ?? { passed: false, checks: [] },
    openPullRequestReference: observation.openPullRequestReference === true,
    protectionChecked: observation.protectionChecked === true,
    protected: observation.protected === true,
    uniqueUnintegratedFiles: [...(observation.uniqueUnintegratedFiles ?? [])],
    deletable,
    safeToRetire: deletable,
    reasons: normalizedReasons
  }
}

export function summarizeRetirementAudit({ repository, auditedMainSha, entries, mainGuard, review, hostedGatesPassed, generatedAt = new Date().toISOString() }) {
  if (typeof repository !== "string" || !/^[^/]+\/[^/]+$/u.test(repository)) throw new Error("repository must use owner/name form")
  assertSha(auditedMainSha, "auditedMainSha")
  if (!Array.isArray(entries)) throw new Error("entries must be an array")
  assertRecord(mainGuard, "mainGuard")
  if (mainGuard.defaultBranch !== "main") throw new Error("mainGuard.defaultBranch must be 'main'.")
  if (typeof mainGuard.protectionChecked !== "boolean") throw new Error("mainGuard.protectionChecked must be a boolean.")
  if (typeof mainGuard.protected !== "boolean" || typeof mainGuard.unprotectedExactShaGuardAuthorized !== "boolean") {
    throw new Error("mainGuard protection fields must be booleans.")
  }
  if (mainGuard.protectionChecked && !mainGuard.protected && !mainGuard.unprotectedExactShaGuardAuthorized) {
    throw new Error("Unprotected main requires explicit exact-SHA guard authorization.")
  }
  if (mainGuard.protected && mainGuard.unprotectedExactShaGuardAuthorized) {
    throw new Error("Protected main may not claim unprotected exact-SHA guard authorization.")
  }
  const reviewGreen = review?.critical === 0 && review?.important === 0
  const mainGuardGreen = mainGuard.protectionChecked === true
    && (mainGuard.protected === true || mainGuard.unprotectedExactShaGuardAuthorized === true)
  const blockedBranches = entries.filter((entry) => entry.safeToRetire !== true).map((entry) => entry.branch)
  return {
    schemaVersion: AUDIT_SCHEMA,
    repository,
    auditedMainSha,
    mainGuard: { ...mainGuard },
    generatedAt,
    ready_for_deletion: blockedBranches.length === 0 && mainGuardGreen && reviewGreen && hostedGatesPassed === true,
    blockedBranches,
    review: {
      critical: Number.isInteger(review?.critical) ? review.critical : null,
      important: Number.isInteger(review?.important) ? review.important : null
    },
    hostedGatesPassed: hostedGatesPassed === true,
    entries
  }
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`)
}

function assertSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) throw new Error(`${label} must be a 40-character lowercase hex SHA.`)
}

function integerArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new Error(`${label} must be an array of positive integer pull request numbers.`)
  }
  return value
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`)
  }
  const duplicate = value.find((item, index) => value.indexOf(item) !== index)
  if (duplicate) throw new Error(`${label} contains duplicate value '${duplicate}'.`)
  return value
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))]
}
