export const WORKFLOW_CONTRACT_REPORT_SCHEMA_VERSION = "workflow-contract-report/v1" as const

const SHA1 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const OWNER = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const CONTRACT = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/v[1-9][0-9]*$/
const CHECK_NAMES = ["command", "discovery", "mirror", "strict-compile", "vsix"] as const

export const WORKFLOW_CONTRACT_REPORT_LIMITS = Object.freeze({
  reportBytes: 64 * 1024 * 1024,
  manifests: 64,
  schemasPerManifest: 64,
  workflows: 4096,
  resolutions: 8192,
  vsix: 64,
  checks: 5,
  textCodePoints: 512,
  pathCodePoints: 1024,
  ownerCodePoints: 200,
  semverCodePoints: 200,
  contractCodePoints: 256,
  diagnostics: 64
} as const)

export interface WorkflowContractSchemaRecord { path: string; sha256: string }
export interface WorkflowContractManifestRecord {
  owner: string
  version: string
  path: string
  sha256: string
  schemas: WorkflowContractSchemaRecord[]
}
export type WorkflowContractWorkflowRecord =
  | { path: string; owner: string; classification: "claim"; role: string }
  | { path: string; owner: string; classification: "exclusion"; reason: string }
export type WorkflowContractResolutionKind = "action_provider" | "preflight_check" | "result_sink" | "agent_provider"
export interface WorkflowContractProviderResolution {
  workflow_path: string
  kind: WorkflowContractResolutionKind
  location: string
  id: string
  owner: string
  contract_version: string
}
export interface WorkflowContractProductCommandResolution {
  workflow_path: string
  kind: "command"
  location: string
  id: string
  owner: string
  source: "product"
  package_path: string
}
export interface WorkflowContractExternalCommandResolution {
  workflow_path: string
  kind: "command"
  location: string
  id: string
  owner: string
  source: "external"
  contract_version: string
  declared_workflow_path: string
}
export type WorkflowContractResolution = WorkflowContractProviderResolution | WorkflowContractProductCommandResolution | WorkflowContractExternalCommandResolution
export interface WorkflowContractVsixRecord { owner: string; archive_path: string; sha256: string; status: "passed" }
export interface WorkflowContractCheckRecord { name: typeof CHECK_NAMES[number]; status: "passed" }
export interface WorkflowContractReport {
  schema_version: typeof WORKFLOW_CONTRACT_REPORT_SCHEMA_VERSION
  commit_sha: string
  tree_sha: string
  worktree_clean: true
  manifests: WorkflowContractManifestRecord[]
  workflows: WorkflowContractWorkflowRecord[]
  resolutions: WorkflowContractResolution[]
  vsix: WorkflowContractVsixRecord[]
  checks: WorkflowContractCheckRecord[]
  warnings: []
}
export interface WorkflowContractReportExpectations {
  expectedCommitSha?: string
  expectedTreeSha?: string
  expectedWorkflowPaths?: readonly string[]
}
export interface WorkflowContractReportValidationResult {
  ok: boolean
  report?: WorkflowContractReport
  diagnostics: string[]
}

class SnapshotError extends Error {}

export function validateWorkflowContractReport(
  value: unknown,
  expectations: WorkflowContractReportExpectations = {}
): WorkflowContractReportValidationResult {
  try {
    const expected = snapshotExpectations(expectations)
    const report = snapshotReport(value)
    const diagnostics: string[] = []
    if (expected.expectedCommitSha !== undefined && report.commit_sha !== expected.expectedCommitSha) {
      addDiagnostic(diagnostics, "report commit_sha does not match the expected commit")
    }
    if (expected.expectedTreeSha !== undefined && report.tree_sha !== expected.expectedTreeSha) {
      addDiagnostic(diagnostics, "report tree_sha does not match the expected tree")
    }
    const owners = new Set(report.manifests.map((record) => record.owner))
    if (owners.size !== report.manifests.length) addDiagnostic(diagnostics, "report manifests contain a duplicate owner")
    const manifestPaths = new Set(report.manifests.map((record) => record.path))
    if (manifestPaths.size !== report.manifests.length) addDiagnostic(diagnostics, "report manifests contain a duplicate path")
    const packagePathByOwner = new Map(report.manifests.map((record) => [record.owner, packagePathForManifest(record.path)]))
    const claimedPaths = new Set(report.workflows.filter((workflow) => workflow.classification === "claim").map((workflow) => workflow.path))
    for (const workflow of report.workflows) {
      if (!owners.has(workflow.owner)) addDiagnostic(diagnostics, "workflow classification owner has no manifest owner")
    }
    for (const resolution of report.resolutions) {
      if (!owners.has(resolution.owner)) addDiagnostic(diagnostics, "resolution owner has no manifest owner")
      if (!claimedPaths.has(resolution.workflow_path)) {
        addDiagnostic(diagnostics, "resolution workflow_path has no claimed workflow record")
      }
      if (resolution.kind === "command" && resolution.source === "external" && resolution.declared_workflow_path !== resolution.workflow_path) {
        addDiagnostic(diagnostics, "external command declared_workflow_path must match workflow_path")
      }
      if (resolution.kind === "command" && resolution.source === "product" && resolution.package_path !== packagePathByOwner.get(resolution.owner)) {
        addDiagnostic(diagnostics, "product command package_path does not match its manifest owner")
      }
    }
    const vsixOwners = report.vsix.map((record) => record.owner)
    if (!sameStrings(vsixOwners, [...owners].sort(compareText))) addDiagnostic(diagnostics, "VSIX records must cover every manifest owner exactly once")
    if (expected.expectedWorkflowPaths !== undefined) {
      const expectedPaths = snapshotExpectedPaths(expected.expectedWorkflowPaths)
      const actual = report.workflows.map((record) => record.path)
      if (!sameStrings(actual, expectedPaths)) addDiagnostic(diagnostics, "report workflow records do not match expected workflow paths")
    }
    return diagnostics.length === 0 ? { ok: true, report, diagnostics } : { ok: false, diagnostics }
  } catch (error) {
    return { ok: false, diagnostics: [error instanceof SnapshotError ? error.message : "report data could not be snapshotted"] }
  }
}

function snapshotExpectations(value: unknown): WorkflowContractReportExpectations {
  const record = ownRecord(value, "report expectations")
  const output: WorkflowContractReportExpectations = {}
  for (const key of ["expectedCommitSha", "expectedTreeSha", "expectedWorkflowPaths"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key)) output[key] = ownData(record, key, `report expectations.${key}`) as never
  }
  return output
}

export function serializeWorkflowContractReport(value: unknown): Buffer {
  const validation = validateWorkflowContractReport(value)
  if (!validation.ok || !validation.report) throw new Error(`workflow contract report is invalid: ${validation.diagnostics.join("; ")}`)
  assertGenerationBudget(validation.report)
  const output = Buffer.from(`${JSON.stringify(validation.report, null, 2)}\n`, "utf8")
  if (output.length > WORKFLOW_CONTRACT_REPORT_LIMITS.reportBytes) throw new Error("workflow contract report exceeds its byte limit")
  return output
}

function snapshotReport(value: unknown): WorkflowContractReport {
  const record = closedRecord(value, [
    "schema_version", "commit_sha", "tree_sha", "worktree_clean", "manifests", "workflows", "resolutions", "vsix", "checks", "warnings"
  ], "report")
  if (record.schema_version !== WORKFLOW_CONTRACT_REPORT_SCHEMA_VERSION) fail("report schema_version is invalid")
  const commitSha = stringField(record.commit_sha, "commit_sha", SHA1)
  const treeSha = stringField(record.tree_sha, "tree_sha", SHA1)
  if (record.worktree_clean !== true) fail("report worktree_clean must be true")
  const manifests = snapshotArray(record.manifests, "manifests", WORKFLOW_CONTRACT_REPORT_LIMITS.manifests, snapshotManifest)
  const workflows = snapshotArray(record.workflows, "workflows", WORKFLOW_CONTRACT_REPORT_LIMITS.workflows, snapshotWorkflow)
  const resolutions = snapshotArray(record.resolutions, "resolutions", WORKFLOW_CONTRACT_REPORT_LIMITS.resolutions, snapshotResolution)
  const vsix = snapshotArray(record.vsix, "vsix", WORKFLOW_CONTRACT_REPORT_LIMITS.vsix, snapshotVsix)
  const checks = snapshotArray(record.checks, "checks", WORKFLOW_CONTRACT_REPORT_LIMITS.checks, snapshotCheck)
  const warnings = snapshotArray(record.warnings, "warnings", 0, () => "")
  if (warnings.length !== 0) fail("report warnings must be empty")
  if (manifests.length === 0) fail("report manifests must not be empty")
  assertCanonical(manifests, manifestKey, "manifests")
  for (const [index, manifest] of manifests.entries()) assertCanonical(manifest.schemas, (item) => item.path, `manifests[${index}].schemas`)
  assertCanonical(workflows, (item) => item.path, "workflows")
  assertCanonical(resolutions, resolutionKey, "resolutions")
  assertCanonical(vsix, (item) => item.owner, "vsix")
  assertCanonical(checks, (item) => item.name, "checks")
  if (!sameStrings(checks.map((check) => check.name), [...CHECK_NAMES])) fail("report checks must contain the five canonical passed checks")
  return {
    schema_version: WORKFLOW_CONTRACT_REPORT_SCHEMA_VERSION,
    commit_sha: commitSha,
    tree_sha: treeSha,
    worktree_clean: true,
    manifests,
    workflows,
    resolutions,
    vsix,
    checks,
    warnings: []
  }
}

function snapshotManifest(value: unknown, index: number): WorkflowContractManifestRecord {
  const record = closedRecord(value, ["owner", "version", "path", "sha256", "schemas"], `manifests[${index}]`)
  return {
    owner: stringField(record.owner, `manifests[${index}].owner`, OWNER, WORKFLOW_CONTRACT_REPORT_LIMITS.ownerCodePoints),
    version: stringField(record.version, `manifests[${index}].version`, SEMVER, WORKFLOW_CONTRACT_REPORT_LIMITS.semverCodePoints),
    path: pathField(record.path, `manifests[${index}].path`),
    sha256: stringField(record.sha256, `manifests[${index}].sha256`, SHA256),
    schemas: snapshotArray(record.schemas, `manifests[${index}].schemas`, WORKFLOW_CONTRACT_REPORT_LIMITS.schemasPerManifest, (entry, schemaIndex) => {
      const schema = closedRecord(entry, ["path", "sha256"], `manifests[${index}].schemas[${schemaIndex}]`)
      return {
        path: pathField(schema.path, `manifests[${index}].schemas[${schemaIndex}].path`),
        sha256: stringField(schema.sha256, `manifests[${index}].schemas[${schemaIndex}].sha256`, SHA256)
      }
    })
  }
}

function snapshotWorkflow(value: unknown, index: number): WorkflowContractWorkflowRecord {
  const base = ownRecord(value, `workflows[${index}]`)
  const classification = ownData(base, "classification", `workflows[${index}].classification`)
  if (classification === "claim") {
    const record = closedRecord(base, ["path", "owner", "classification", "role"], `workflows[${index}]`)
    return { path: pathField(record.path, `workflows[${index}].path`), owner: stringField(record.owner, `workflows[${index}].owner`, OWNER, WORKFLOW_CONTRACT_REPORT_LIMITS.ownerCodePoints), classification, role: textField(record.role, `workflows[${index}].role`) }
  }
  if (classification === "exclusion") {
    const record = closedRecord(base, ["path", "owner", "classification", "reason"], `workflows[${index}]`)
    return { path: pathField(record.path, `workflows[${index}].path`), owner: stringField(record.owner, `workflows[${index}].owner`, OWNER, WORKFLOW_CONTRACT_REPORT_LIMITS.ownerCodePoints), classification, reason: textField(record.reason, `workflows[${index}].reason`) }
  }
  return fail(`workflows[${index}].classification is invalid`)
}

function snapshotResolution(value: unknown, index: number): WorkflowContractResolution {
  const base = ownRecord(value, `resolutions[${index}]`)
  const kind = ownData(base, "kind", `resolutions[${index}].kind`)
  const prefix = `resolutions[${index}]`
  if (kind === "command") {
    const source = ownData(base, "source", `${prefix}.source`)
    if (source === "product") {
      const record = closedRecord(base, ["workflow_path", "kind", "location", "id", "owner", "source", "package_path"], prefix)
      return { ...resolutionBase(record, prefix), kind, source, package_path: pathField(record.package_path, `${prefix}.package_path`) }
    }
    if (source === "external") {
      const record = closedRecord(base, ["workflow_path", "kind", "location", "id", "owner", "source", "contract_version", "declared_workflow_path"], prefix)
      return {
        ...resolutionBase(record, prefix), kind, source,
        contract_version: stringField(record.contract_version, `${prefix}.contract_version`, CONTRACT, WORKFLOW_CONTRACT_REPORT_LIMITS.contractCodePoints),
        declared_workflow_path: pathField(record.declared_workflow_path, `${prefix}.declared_workflow_path`)
      }
    }
    return fail(`${prefix}.source is invalid`)
  }
  if (!["action_provider", "preflight_check", "result_sink", "agent_provider"].includes(String(kind))) fail(`${prefix}.kind is invalid`)
  const record = closedRecord(base, ["workflow_path", "kind", "location", "id", "owner", "contract_version"], prefix)
  return {
    ...resolutionBase(record, prefix),
    kind: kind as WorkflowContractResolutionKind,
    contract_version: stringField(record.contract_version, `${prefix}.contract_version`, CONTRACT, WORKFLOW_CONTRACT_REPORT_LIMITS.contractCodePoints)
  }
}

function resolutionBase(record: Record<string, unknown>, prefix: string): Omit<WorkflowContractProviderResolution, "kind" | "contract_version"> {
  return {
    workflow_path: pathField(record.workflow_path, `${prefix}.workflow_path`),
    location: textField(record.location, `${prefix}.location`),
    id: textField(record.id, `${prefix}.id`),
    owner: stringField(record.owner, `${prefix}.owner`, OWNER, WORKFLOW_CONTRACT_REPORT_LIMITS.ownerCodePoints)
  }
}

function snapshotVsix(value: unknown, index: number): WorkflowContractVsixRecord {
  const record = closedRecord(value, ["owner", "archive_path", "sha256", "status"], `vsix[${index}]`)
  if (record.status !== "passed") fail(`vsix[${index}].status must be passed`)
  return { owner: stringField(record.owner, `vsix[${index}].owner`, OWNER, WORKFLOW_CONTRACT_REPORT_LIMITS.ownerCodePoints), archive_path: pathField(record.archive_path, `vsix[${index}].archive_path`), sha256: stringField(record.sha256, `vsix[${index}].sha256`, SHA256), status: "passed" }
}

function snapshotCheck(value: unknown, index: number): WorkflowContractCheckRecord {
  const record = closedRecord(value, ["name", "status"], `checks[${index}]`)
  if (!CHECK_NAMES.includes(record.name as typeof CHECK_NAMES[number])) fail(`checks[${index}].name is invalid`)
  if (record.status !== "passed") fail(`checks[${index}].status must be passed`)
  return { name: record.name as typeof CHECK_NAMES[number], status: "passed" }
}

function snapshotArray<T>(value: unknown, field: string, maximum: number, item: (value: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`)
  const length = ownData(value, "length", `${field}.length`)
  if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > maximum) fail(`${field} exceeds its item limit`)
  const output: T[] = []
  for (let index = 0; index < (length as number); index += 1) output.push(item(ownData(value, String(index), `${field}[${index}]`), index))
  return output
}

function snapshotExpectedPaths(paths: readonly string[]): string[] {
  const snapshot = snapshotArray(paths, "expectedWorkflowPaths", WORKFLOW_CONTRACT_REPORT_LIMITS.workflows, (value, index) => pathField(value, `expectedWorkflowPaths[${index}]`))
  assertCanonical(snapshot, (value) => value, "expectedWorkflowPaths")
  return snapshot
}

function ownRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(`${field} must be a plain object`)
  return value as Record<string, unknown>
}

function closedRecord(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  const record = ownRecord(value, field)
  const actual = Reflect.ownKeys(record)
  if (actual.some((key) => typeof key !== "string") || actual.length !== keys.length || keys.some((key) => !actual.includes(key))) fail(`${field} has missing or unknown properties`)
  const output: Record<string, unknown> = {}
  for (const key of keys) output[key] = ownData(record, key, `${field}.${key}`)
  return output
}

function ownData(record: object, key: string, field: string): unknown {
  let descriptor: PropertyDescriptor | undefined
  try { descriptor = Object.getOwnPropertyDescriptor(record, key) } catch { return fail(`${field} could not be snapshotted`) }
  if (!descriptor || !("value" in descriptor)) fail(`${field} must be an own data property`)
  return descriptor.value
}

function stringField(value: unknown, field: string, pattern: RegExp, maximum: number = WORKFLOW_CONTRACT_REPORT_LIMITS.textCodePoints): string {
  const text = textField(value, field, maximum)
  if (!pattern.test(text)) fail(`${field} is invalid`)
  return text
}

function textField(value: unknown, field: string, maximum: number = WORKFLOW_CONTRACT_REPORT_LIMITS.textCodePoints): string {
  if (typeof value !== "string" || value.length === 0 || [...value].length > maximum || /[\u0000-\u001f\u007f-\u009f]/.test(value)) fail(`${field} is invalid`)
  return value
}

function pathField(value: unknown, field: string): string {
  const text = textField(value, field, WORKFLOW_CONTRACT_REPORT_LIMITS.pathCodePoints)
  if (text.startsWith("/") || text.includes("\\") || /^[A-Za-z]:/.test(text) || text.split("/").some((part) => !part || part === "." || part === "..")) fail(`${field} is not a canonical repository path`)
  return text
}

function assertCanonical<T>(items: readonly T[], keyOf: (item: T) => string, field: string): void {
  let previous: string | undefined
  for (const item of items) {
    const key = keyOf(item)
    if (previous !== undefined && compareText(previous, key) >= 0) fail(`${field} contains a duplicate or is not in canonical order`)
    previous = key
  }
}

function manifestKey(record: WorkflowContractManifestRecord): string { return `${record.owner}\u0000${record.path}` }
function resolutionKey(record: WorkflowContractResolution): string { return `${record.workflow_path}\u0000${record.kind}\u0000${record.location}\u0000${record.id}\u0000${record.owner}` }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }
function sameStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]) }
function packagePathForManifest(manifestPath: string): string {
  const parts = manifestPath.split("/")
  return `${parts.slice(0, -2).join("/")}/package.json`
}
function addDiagnostic(diagnostics: string[], message: string): void {
  if (diagnostics.length < WORKFLOW_CONTRACT_REPORT_LIMITS.diagnostics) diagnostics.push(message)
  else if (diagnostics.length === WORKFLOW_CONTRACT_REPORT_LIMITS.diagnostics) diagnostics.push("additional diagnostics omitted")
}
function assertGenerationBudget(report: WorkflowContractReport): void {
  const outputBytes = estimatePrettyJsonBytes(report, 0) + 1
  if (outputBytes > WORKFLOW_CONTRACT_REPORT_LIMITS.reportBytes) throw new Error("workflow contract report exceeds its generation byte budget")
}
function estimatePrettyJsonBytes(value: unknown, depth: number): number {
  if (typeof value === "string") {
    let bytes = 2
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
        bytes += 2
      } else if (code < 0x20) {
        bytes += 6
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4
          index += 1
        } else {
          bytes += 6
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        bytes += 6
      } else {
        bytes += Buffer.byteLength(value[index], "utf8")
      }
    }
    return bytes
  }
  if (typeof value === "boolean") return value ? 4 : 5
  if (typeof value === "number") return String(value).length
  if (Array.isArray(value)) {
    if (value.length === 0) return 2
    return 3 + (2 * depth) + value.reduce((sum, item, index) => (
      sum + (2 * (depth + 1)) + estimatePrettyJsonBytes(item, depth + 1) + (index + 1 < value.length ? 1 : 0) + 1
    ), 0)
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
    if (entries.length === 0) return 2
    return 3 + (2 * depth) + entries.reduce((sum, [key, item], index) => (
      sum + (2 * (depth + 1)) + estimatePrettyJsonBytes(key, depth + 1) + 2 + estimatePrettyJsonBytes(item, depth + 1) + (index + 1 < entries.length ? 1 : 0) + 1
    ), 0)
  }
  return 4
}
function fail(message: string): never { throw new SnapshotError(message) }
