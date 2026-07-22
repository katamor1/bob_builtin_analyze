import {
  CoreWorkflowDefinition,
  EngineStep,
  isCommandResultSink,
  isFileResultSink,
  ResultSinkDefinition,
  ResultSourceDefinition,
  WorkflowTransitionConditionDefinition
} from "./model"
import { validateApprovalExpression } from "./approvalGuardrails"
import { boundedDiagnosticText } from "./diagnosticText"
import { parseWorkflowMarkdown } from "./parser"
import { isReservedWorkflowStateKey } from "./stateKeys"

export type WorkflowDiagnosticSeverity = "error" | "warning" | "info"

export interface WorkflowDiagnostic {
  severity: WorkflowDiagnosticSeverity
  message: string
  filePath?: string
}

/** Structural authoring/runtime compilation; never performs repository contribution resolution. */
export interface CompileWorkflowDocumentOptions {
  sourceId: string
  filePath: string
  text: string
  strict?: boolean
}

export type RepositoryWorkflowPathSyntax = "canonical-repository" | "windows-separated"

export interface CompileWorkflowContractDocumentOptions {
  sourceId: string
  filePath: string
  filePathSyntax: RepositoryWorkflowPathSyntax
  text: string
  contributionCatalog: unknown
}

export type ValidateWorkflowTextOptions = CompileWorkflowDocumentOptions

export interface CompileWorkflowDocumentResult {
  ok: boolean
  workflow?: CoreWorkflowDefinition
  diagnostics: WorkflowDiagnostic[]
}

export type ValidateWorkflowResult = CompileWorkflowDocumentResult

interface ResultKeyProducer {
  stepId: string
  source: string
  index: number
}

interface SkipResumeWorkflowMetadata {
  skipResume?: {
    fileBound?: boolean
  }
}

interface WorkflowValidationOptions extends Omit<CompileWorkflowDocumentOptions, "sourceId" | "text"> {
  contributionLookup?: ContributionCatalogLookup
}

interface ContributionCatalogLookup {
  actionProviders: ReadonlyMap<string, number>
  preflightChecks: ReadonlyMap<string, number>
  resultSinks: ReadonlyMap<string, readonly string[]>
  productCommands: ReadonlyMap<string, number>
  externalCommands: ReadonlyMap<string, readonly (readonly string[])[]>
}

interface CatalogContributionSnapshot {
  key: string
  contractVersion: string
}

interface CatalogExternalCommandSnapshot {
  id: string
  owner: string
  location: string
  workflowPaths: readonly string[]
}

interface CatalogProductCommandSnapshot {
  id: string
  owner: string
  packagePath: string
  location: string
}

interface CatalogOwnerSnapshot {
  id: string
  packagePath: string
}

type ContributionCatalogSnapshotResult =
  | { ok: true; lookup: ContributionCatalogLookup }
  | { ok: false; reason: string }

interface WorkflowContractOptionsSnapshot {
  sourceId: string
  filePath: string
  filePathSyntax: unknown
  text: string
  contributionCatalog: unknown
}

type WorkflowContractOptionsSnapshotResult =
  | { ok: true; options: WorkflowContractOptionsSnapshot }
  | { ok: false; filePath: string; reason: string }

class ContributionCatalogSnapshotError extends Error {}
class WorkflowContractOptionsSnapshotError extends Error {}

const INVALID_WORKFLOW_CONTRACT_OPTIONS_PATH = "<workflow-contract-options>"

export function compileWorkflowDocument(options: CompileWorkflowDocumentOptions): CompileWorkflowDocumentResult {
  return compileWorkflowDocumentInternal({
    sourceId: options.sourceId,
    filePath: options.filePath,
    text: options.text,
    strict: options.strict
  })
}

/**
 * Contribution-aware repository contract gate. Unlike the structural
 * authoring/runtime compiler, this entrypoint always requires a generated
 * contribution catalog and always promotes warnings to errors.
 */
export function compileWorkflowContractDocument(
  options: CompileWorkflowContractDocumentOptions
): CompileWorkflowDocumentResult {
  const snapshot = snapshotWorkflowContractOptions(options)
  if (!snapshot.ok) return invalidWorkflowContractOptionsResult(snapshot.filePath, snapshot.reason)
  const contractOptions = snapshot.options
  if (contractOptions.filePathSyntax !== "canonical-repository" && contractOptions.filePathSyntax !== "windows-separated") {
    return {
      ok: false,
      workflow: undefined,
      diagnostics: [error(
        contractOptions.filePath,
        "Workflow file path syntax is invalid: expected 'canonical-repository' or 'windows-separated'."
      )]
    }
  }
  const filePath = contractOptions.filePathSyntax === "windows-separated"
    ? normalizeWindowsRepositoryPath(contractOptions.filePath)
    : contractOptions.filePath
  const catalog = snapshotContributionCatalog(contractOptions.contributionCatalog, true)
  if (!catalog.ok) return invalidContributionCatalogResult(filePath, catalog.reason)
  return compileWorkflowDocumentInternal({
    sourceId: contractOptions.sourceId,
    filePath,
    text: contractOptions.text,
    strict: true,
    contributionLookup: catalog.lookup
  })
}

function snapshotWorkflowContractOptions(value: unknown): WorkflowContractOptionsSnapshotResult {
  let diagnosticFilePath = INVALID_WORKFLOW_CONTRACT_OPTIONS_PATH
  try {
    if (!isPlainDataObject(value)) {
      return {
        ok: false,
        filePath: diagnosticFilePath,
        reason: "expected a non-null plain data object"
      }
    }
    const filePath = readWorkflowContractOption(value, "filePath")
    if (typeof filePath === "string" && filePath.length > 0) diagnosticFilePath = filePath
    const sourceId = readWorkflowContractOption(value, "sourceId")
    const filePathSyntax = readWorkflowContractOption(value, "filePathSyntax")
    const text = readWorkflowContractOption(value, "text")
    const contributionCatalog = readWorkflowContractOption(value, "contributionCatalog")
    if (typeof sourceId !== "string" || sourceId.length === 0) {
      throw new WorkflowContractOptionsSnapshotError("field 'sourceId' must be a non-empty string")
    }
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new WorkflowContractOptionsSnapshotError("field 'filePath' must be a non-empty string")
    }
    if (typeof text !== "string") {
      throw new WorkflowContractOptionsSnapshotError("field 'text' must be a string")
    }
    return {
      ok: true,
      options: Object.freeze({ sourceId, filePath, filePathSyntax, text, contributionCatalog })
    }
  } catch (error) {
    return {
      ok: false,
      filePath: diagnosticFilePath,
      reason: error instanceof WorkflowContractOptionsSnapshotError
        ? error.message
        : "options data could not be snapshotted"
    }
  }
}

function readWorkflowContractOption(
  options: Record<string, unknown>,
  field: keyof CompileWorkflowContractDocumentOptions
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(options, field)
  if (!descriptor || !("value" in descriptor)) {
    throw new WorkflowContractOptionsSnapshotError(`field '${field}' must be an own data property`)
  }
  return descriptor.value
}

function compileWorkflowDocumentInternal(
  options: CompileWorkflowDocumentOptions & { contributionLookup?: ContributionCatalogLookup }
): CompileWorkflowDocumentResult {
  const text = options.text.replace(/^\uFEFF/, "")
  const parsed = parseWorkflowMarkdown({ sourceId: options.sourceId, filePath: options.filePath, text })
  const diagnostics = parsed.diagnostics.map((line) => diagnosticFromParserLine(line, options.filePath))
  if (parsed.ok) diagnostics.push(...validateCoreWorkflow(parsed.workflow, options))
  const promoted = diagnostics.map((item): WorkflowDiagnostic =>
    options.strict && item.severity === "warning" ? { ...item, severity: "error" } : item
  )
  const ordered = canonicalDiagnostics(promoted)
  return {
    ok: parsed.ok && !ordered.some((item) => item.severity === "error"),
    workflow: parsed.ok ? parsed.workflow : undefined,
    diagnostics: ordered
  }
}

function invalidContributionCatalogResult(filePath: string, reason: string): CompileWorkflowDocumentResult {
  return {
    ok: false,
    workflow: undefined,
    diagnostics: [error(filePath, `Workflow contribution catalog is invalid: ${reason}.`)]
  }
}

function invalidWorkflowContractOptionsResult(filePath: string, reason: string): CompileWorkflowDocumentResult {
  return {
    ok: false,
    workflow: undefined,
    diagnostics: [error(filePath, `Workflow contract compile options are invalid: ${reason}.`)]
  }
}

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function snapshotContributionCatalog(value: unknown, validateValues: boolean): ContributionCatalogSnapshotResult {
  try {
    if (!isPlainDataObject(value)) {
      return { ok: false, reason: "expected a non-null plain data object" }
    }
    if (readOwnDataProperty(value, "schema_version", "schema_version") !== "workflow-contribution-catalog/v1") {
      throw new ContributionCatalogSnapshotError("field 'schema_version' must be 'workflow-contribution-catalog/v1'")
    }
    const owners = snapshotOwnerSection(value, validateValues)
    const actionProviders = snapshotContributionSection(value, "action_providers", "id", validateValues)
    const preflightChecks = snapshotContributionSection(value, "preflight_checks", "id", validateValues)
    const resultSinks = snapshotContributionSection(value, "result_sinks", "type", validateValues)
    const productCommands = snapshotProductCommandSection(value, validateValues)
    const externalCommands = snapshotExternalCommandSection(value, validateValues)
    assertCatalogCommandProvenance(owners, productCommands, externalCommands)
    assertUniqueCatalogCommandIds(productCommands, externalCommands)
    return {
      ok: true,
      lookup: {
        actionProviders: contributionCounts(actionProviders),
        preflightChecks: contributionCounts(preflightChecks),
        resultSinks: contributionVersions(resultSinks),
        productCommands: commandCounts(productCommands),
        externalCommands: externalCommandPaths(externalCommands)
      }
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof ContributionCatalogSnapshotError
        ? error.message
        : "catalog data could not be snapshotted"
    }
  }
}

function snapshotOwnerSection(
  catalog: Record<string, unknown>,
  validateValues: boolean
): readonly CatalogOwnerSnapshot[] {
  const { section, length } = snapshotCatalogArray(catalog, "owners")
  const snapshot: CatalogOwnerSnapshot[] = []
  const seen = new Map<string, string>()
  for (let index = 0; index < length; index += 1) {
    const entryPath = `owners[${index}]`
    const entry = readArrayDataItem(section, index, entryPath)
    if (!isPlainDataObject(entry)) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}' must be a plain data object`)
    }
    const id = readOwnDataProperty(entry, "id", `${entryPath}.id`)
    const version = readOwnDataProperty(entry, "version", `${entryPath}.version`)
    const manifestPath = readOwnDataProperty(entry, "manifest_path", `${entryPath}.manifest_path`)
    const manifestSha256 = readOwnDataProperty(entry, "manifest_sha256", `${entryPath}.manifest_sha256`)
    if (typeof id !== "string" || (validateValues && !EXTENSION_OWNER_ID_PATTERN.test(id))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.id' is invalid`)
    }
    if (typeof version !== "string" || (validateValues && !SEMVER_PATTERN.test(version))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.version' is invalid`)
    }
    if (
      typeof manifestPath !== "string"
      || (validateValues && !isCanonicalRepositoryFilePath(manifestPath, "workflow-contributions.json"))
    ) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.manifest_path' is invalid`)
    }
    if (typeof manifestSha256 !== "string" || (validateValues && !SHA256_PATTERN.test(manifestSha256))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.manifest_sha256' is invalid`)
    }
    const packagePath = packagePathFromOwnerManifest(id, manifestPath, entryPath, validateValues)
    const existing = seen.get(id)
    if (existing) {
      throw new ContributionCatalogSnapshotError(
        `duplicate owner '${boundedDiagnosticText(id)}' between '${existing}' and '${entryPath}'`
      )
    }
    seen.set(id, entryPath)
    snapshot.push(Object.freeze({ id, packagePath }))
  }
  return Object.freeze(snapshot)
}

function packagePathFromOwnerManifest(
  ownerId: string,
  manifestPath: string,
  entryPath: string,
  validateValues: boolean
): string {
  const suffix = "/contracts/workflow-contributions.json"
  if (!manifestPath.endsWith(suffix)) {
    if (validateValues) {
      throw new ContributionCatalogSnapshotError(
        `field '${entryPath}.manifest_path' must identify an owner contracts/workflow-contributions.json file`
      )
    }
    return ""
  }
  const ownerDirectory = manifestPath.slice(0, -suffix.length)
  const extensionName = ownerId.split(".")[1]
  const ownerDirectorySegments = ownerDirectory.split("/")
  if (validateValues && ownerDirectorySegments[ownerDirectorySegments.length - 1] !== extensionName) {
    throw new ContributionCatalogSnapshotError(
      `field '${entryPath}.manifest_path' does not match owner '${boundedDiagnosticText(ownerId)}'`
    )
  }
  const packagePath = `${ownerDirectory}/package.json`
  if (validateValues && !isCanonicalRepositoryFilePath(packagePath, "package.json")) {
    throw new ContributionCatalogSnapshotError(`field '${entryPath}.manifest_path' derives an invalid package path`)
  }
  return packagePath
}

function snapshotProductCommandSection(
  catalog: Record<string, unknown>,
  validateValues: boolean
): readonly CatalogProductCommandSnapshot[] {
  const { section, length } = snapshotCatalogArray(catalog, "commands")
  const snapshot: CatalogProductCommandSnapshot[] = []
  for (let index = 0; index < length; index += 1) {
    const entryPath = `commands[${index}]`
    const entry = readArrayDataItem(section, index, entryPath)
    if (!isPlainDataObject(entry)) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}' must be a plain data object`)
    }
    const id = readOwnDataProperty(entry, "id", `${entryPath}.id`)
    const owner = readOwnDataProperty(entry, "owner", `${entryPath}.owner`)
    const packagePath = readOwnDataProperty(entry, "package_path", `${entryPath}.package_path`)
    if (typeof id !== "string" || (validateValues && !CONTRIBUTION_ID_PATTERN.test(id))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.id' is invalid`)
    }
    if (typeof owner !== "string" || (validateValues && !EXTENSION_OWNER_ID_PATTERN.test(owner))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.owner' is invalid`)
    }
    if (typeof packagePath !== "string" || (validateValues && !isCanonicalRepositoryFilePath(packagePath, "package.json"))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.package_path' is invalid`)
    }
    snapshot.push(Object.freeze({ id, owner, packagePath, location: entryPath }))
  }
  return Object.freeze(snapshot)
}

function snapshotExternalCommandSection(
  catalog: Record<string, unknown>,
  validateValues: boolean
): readonly CatalogExternalCommandSnapshot[] {
  const { section, length } = snapshotCatalogArray(catalog, "external_commands")
  const snapshot: CatalogExternalCommandSnapshot[] = []
  for (let index = 0; index < length; index += 1) {
    const entryPath = `external_commands[${index}]`
    const entry = readArrayDataItem(section, index, entryPath)
    if (!isPlainDataObject(entry)) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}' must be a plain data object`)
    }
    const id = readOwnDataProperty(entry, "id", `${entryPath}.id`)
    const owner = readOwnDataProperty(entry, "owner", `${entryPath}.owner`)
    const contractVersion = readOwnDataProperty(entry, "contract_version", `${entryPath}.contract_version`)
    const workflowPathValues = readOwnDataProperty(entry, "workflow_paths", `${entryPath}.workflow_paths`)
    if (typeof id !== "string" || (validateValues && !CONTRIBUTION_ID_PATTERN.test(id))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.id' is invalid`)
    }
    if (typeof owner !== "string" || (validateValues && !EXTENSION_OWNER_ID_PATTERN.test(owner))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.owner' is invalid`)
    }
    if (
      typeof contractVersion !== "string"
      || (validateValues && (
        !CONTRIBUTION_CONTRACT_PATTERN.test(contractVersion)
        || contractVersion.length > MAX_CONTRIBUTION_CONTRACT_VERSION_LENGTH
      ))
    ) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.contract_version' is invalid`)
    }
    if (!Array.isArray(workflowPathValues)) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.workflow_paths' must be a non-empty array`)
    }
    const workflowPathLength = snapshotArrayLength(workflowPathValues, `${entryPath}.workflow_paths`)
    if (workflowPathLength === 0) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.workflow_paths' must be a non-empty array`)
    }
    const workflowPaths: string[] = []
    const seen = new Set<string>()
    for (let pathIndex = 0; pathIndex < workflowPathLength; pathIndex += 1) {
      const pathEntry = `${entryPath}.workflow_paths[${pathIndex}]`
      const workflowPath = readArrayDataItem(workflowPathValues, pathIndex, pathEntry)
      if (typeof workflowPath !== "string" || (validateValues && !isCanonicalRepositoryFilePath(workflowPath, "WORKFLOW.md"))) {
        throw new ContributionCatalogSnapshotError(`field '${pathEntry}' is invalid`)
      }
      if (seen.has(workflowPath)) {
        throw new ContributionCatalogSnapshotError(`field '${entryPath}.workflow_paths' contains a duplicate path`)
      }
      seen.add(workflowPath)
      workflowPaths.push(workflowPath)
    }
    snapshot.push(Object.freeze({ id, owner, location: entryPath, workflowPaths: Object.freeze(workflowPaths) }))
  }
  return Object.freeze(snapshot)
}

function assertCatalogCommandProvenance(
  owners: readonly CatalogOwnerSnapshot[],
  productCommands: readonly CatalogProductCommandSnapshot[],
  externalCommands: readonly CatalogExternalCommandSnapshot[]
): void {
  const ownersById = new Map(owners.map((owner) => [owner.id, owner]))
  for (const command of productCommands) {
    const owner = ownersById.get(command.owner)
    if (!owner) {
      throw new ContributionCatalogSnapshotError(
        `field '${command.location}.owner' has no matching owners record`
      )
    }
    if (command.packagePath !== owner.packagePath) {
      throw new ContributionCatalogSnapshotError(
        `field '${command.location}.package_path' does not match owner '${boundedDiagnosticText(command.owner)}' manifest_path-derived package path`
      )
    }
  }
  for (const command of externalCommands) {
    if (!ownersById.has(command.owner)) {
      throw new ContributionCatalogSnapshotError(
        `field '${command.location}.owner' has no matching owners record`
      )
    }
  }
}

function assertUniqueCatalogCommandIds(
  productCommands: readonly CatalogProductCommandSnapshot[],
  externalCommands: readonly CatalogExternalCommandSnapshot[]
): void {
  const seen = new Map<string, string>()
  for (const command of [...productCommands, ...externalCommands]) {
    const existing = seen.get(command.id)
    if (existing) {
      throw new ContributionCatalogSnapshotError(
        `duplicate command id '${boundedDiagnosticText(command.id)}' between '${existing}' and '${command.location}'`
      )
    }
    seen.set(command.id, command.location)
  }
}

function snapshotCatalogArray(
  catalog: Record<string, unknown>,
  field: string
): { section: unknown[]; length: number } {
  const section = readOwnDataProperty(catalog, field, field)
  if (!Array.isArray(section)) {
    throw new ContributionCatalogSnapshotError(`field '${field}' must be an array`)
  }
  return { section, length: snapshotArrayLength(section, field) }
}

function snapshotArrayLength(array: unknown[], field: string): number {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(array, "length")
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new ContributionCatalogSnapshotError(`field '${field}' must be an array`)
  }
  return length
}

function snapshotContributionSection(
  catalog: Record<string, unknown>,
  field: "action_providers" | "preflight_checks" | "result_sinks",
  keyField: "id" | "type",
  validateValues: boolean
): readonly CatalogContributionSnapshot[] {
  const section = readOwnDataProperty(catalog, field, field)
  if (!Array.isArray(section)) {
    throw new ContributionCatalogSnapshotError(`field '${field}' must be an array`)
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(section, "length")
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new ContributionCatalogSnapshotError(`field '${field}' must be an array`)
  }
  const snapshot: CatalogContributionSnapshot[] = []
  for (let index = 0; index < length; index += 1) {
    const entryPath = `${field}[${index}]`
    const entry = readArrayDataItem(section, index, entryPath)
    if (!isPlainDataObject(entry)) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}' must be a plain data object`)
    }
    const key = readOwnDataProperty(entry, keyField, `${entryPath}.${keyField}`)
    const contractVersion = readOwnDataProperty(entry, "contract_version", `${entryPath}.contract_version`)
    if (typeof key !== "string" || (validateValues && !CONTRIBUTION_ID_PATTERN.test(key))) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.${keyField}' is invalid`)
    }
    if (
      typeof contractVersion !== "string"
      || (validateValues && (
        !CONTRIBUTION_CONTRACT_PATTERN.test(contractVersion)
        || contractVersion.length > MAX_CONTRIBUTION_CONTRACT_VERSION_LENGTH
      ))
    ) {
      throw new ContributionCatalogSnapshotError(`field '${entryPath}.contract_version' is invalid`)
    }
    snapshot.push(Object.freeze({ key, contractVersion }))
  }
  return Object.freeze(snapshot)
}

function readOwnDataProperty(record: Record<string, unknown>, key: string, fieldPath: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor || !("value" in descriptor)) {
    throw new ContributionCatalogSnapshotError(`field '${fieldPath}' must be an own data property`)
  }
  return descriptor.value
}

function readArrayDataItem(array: unknown[], index: number, fieldPath: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index))
  if (!descriptor || !("value" in descriptor)) {
    throw new ContributionCatalogSnapshotError(`field '${fieldPath}' must be an own data property`)
  }
  return descriptor.value
}

function contributionCounts(entries: readonly CatalogContributionSnapshot[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1)
  return counts
}

function contributionVersions(entries: readonly CatalogContributionSnapshot[]): ReadonlyMap<string, readonly string[]> {
  const versions = new Map<string, readonly string[]>()
  for (const entry of entries) {
    versions.set(entry.key, Object.freeze([...(versions.get(entry.key) ?? []), entry.contractVersion]))
  }
  return versions
}

function commandCounts(entries: readonly CatalogProductCommandSnapshot[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1)
  return counts
}

function externalCommandPaths(
  entries: readonly CatalogExternalCommandSnapshot[]
): ReadonlyMap<string, readonly (readonly string[])[]> {
  const paths = new Map<string, readonly (readonly string[])[]>()
  for (const entry of entries) {
    paths.set(entry.id, Object.freeze([...(paths.get(entry.id) ?? []), entry.workflowPaths]))
  }
  return paths
}

function isCanonicalRepositoryFilePath(value: string, basename: string): boolean {
  return value.length > 0
    && value.length <= 2048
    && !value.startsWith("/")
    && !value.includes("\\")
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
    && !/^[A-Za-z]:/.test(value)
    && !/[*?\[\]{}!]/.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    && (value === basename || value.endsWith(`/${basename}`))
}

function normalizeWindowsRepositoryPath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

export function validateWorkflowText(options: ValidateWorkflowTextOptions): ValidateWorkflowResult {
  return compileWorkflowDocument(options)
}

function canonicalDiagnostics(diagnostics: WorkflowDiagnostic[]): WorkflowDiagnostic[] {
  const severityOrder: Record<WorkflowDiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 }
  return [...diagnostics].sort((left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity]
    || compareText(left.filePath ?? "", right.filePath ?? "")
    || compareText(left.message, right.message)
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateCoreWorkflow(
  workflow: CoreWorkflowDefinition,
  options: WorkflowValidationOptions
): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = []
  const filePath = options.filePath
  const stepIds = new Set<string>()
  const stepIndexes = new Map<string, number>()
  const resultKeyProducers = new Map<string, ResultKeyProducer[]>()
  const allowedCommandIds = new Set(workflow.guardrails.allowedCommandIds ?? [])
  const allowedCommands = workflow.guardrails.allowedCommands ?? []
  const deniedCommands = workflow.guardrails.deniedCommands ?? []

  if (workflow.todoRequired && (workflow.todos ?? []).length === 0) {
    diagnostics.push(error(filePath, "todoRequired is true but no todo items were found."))
  }
  if (workflow.stepMessage === "step") {
    for (const step of workflow.engineSteps) {
      if (step.type !== "result" && !step.prompt?.trim()) {
        diagnostics.push(warning(filePath, `stepMessage is 'step' but step '${step.id}' has no prompt.`))
      }
    }
  }

  for (const [index, step] of workflow.engineSteps.entries()) {
    if (stepIds.has(step.id)) diagnostics.push(error(filePath, `Duplicate step id '${step.id}'.`))
    stepIds.add(step.id)
    stepIndexes.set(step.id, index)
    if ("resultKey" in step && step.resultKey) addResultKeyProducer(resultKeyProducers, step.resultKey, step.id, "resultKey", index, diagnostics, filePath)
    if (step.type === "manual") {
      if (step.form?.resultKey) addResultKeyProducer(resultKeyProducers, step.form.resultKey, step.id, "form resultKey", index, diagnostics, filePath)
      if (step.approval?.resultKey) addResultKeyProducer(resultKeyProducers, step.approval.resultKey, step.id, "approval resultKey", index, diagnostics, filePath)
    }
    if (step.maxResultBytes !== undefined && step.maxResultBytes <= 0) {
      diagnostics.push(error(filePath, `Step '${step.id}' maxResultBytes must be greater than zero.`))
    }
    if (step.type === "command") {
      validateCommandStep(
        step,
        options,
        allowedCommandIds,
        allowedCommands,
        deniedCommands,
        diagnostics,
        filePath
      )
    }
  }
  validateResultKeyConflicts(resultKeyProducers, diagnostics, filePath)
  const resultKeys = new Set(resultKeyProducers.keys())

  validateTodoStepMapping(workflow, stepIds, diagnostics, filePath)
  validateStateReferences(workflow.engineSteps, resultKeys, options, diagnostics, filePath)
  validateBranching(workflow, stepIndexes, resultKeyProducers, diagnostics, filePath)
  validateArtifacts(workflow, stepIds, diagnostics, filePath)
  validateSkipResumeFileBound(workflow, resultKeyProducers, diagnostics, filePath)
  validateInputs(workflow, diagnostics, filePath)
  validatePreflight(workflow, options, diagnostics, filePath)
  validateGuardrails(workflow, options, diagnostics, filePath)
  validateTemplatePlaceholders(workflow, diagnostics, filePath)
  return diagnostics
}

function addResultKeyProducer(
  producers: Map<string, ResultKeyProducer[]>,
  key: string,
  stepId: string,
  source: string,
  index: number,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  if (isReservedWorkflowStateKey(key)) {
    diagnostics.push(error(filePath, `Step '${stepId}' ${source} '${key}' uses the reserved workflow state namespace.`))
  }
  const items = producers.get(key) ?? []
  items.push({ stepId, source, index })
  producers.set(key, items)
}

function validateResultKeyConflicts(
  producers: Map<string, ResultKeyProducer[]>,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  for (const [key, items] of producers) {
    if (items.length < 2) continue
    const first = items[0]
    for (const item of items.slice(1)) {
      diagnostics.push(error(
        filePath,
        `Step '${item.stepId}' ${item.source} '${key}' conflicts with step '${first.stepId}' ${first.source}.`
      ))
    }
  }
}

export function formatWorkflowDiagnostics(result: ValidateWorkflowResult): string[] {
  if (result.diagnostics.length === 0) return ["- ok: No workflow diagnostics."]
  const lines: string[] = []
  for (const item of result.diagnostics) {
    lines.push(`- ${item.severity}: ${item.filePath ? `${item.filePath}: ` : ""}${item.message}`)
    const hint = diagnosticHint(item.message)
    if (hint) lines.push(`  - hint: ${hint}`)
  }
  return lines
}

function validateCommandStep(
  step: Extract<EngineStep, { type: "command" }>,
  options: WorkflowValidationOptions,
  allowedCommandIds: ReadonlySet<string>,
  allowedCommands: readonly string[],
  deniedCommands: readonly string[],
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  if (!step.action.provider.trim()) diagnostics.push(error(filePath, `Command step '${step.id}' action.provider is empty.`))
  if (options.strict) {
    if (deniedCommands.includes(step.action.provider)) {
      diagnostics.push(error(
        filePath,
        `Command step '${boundedDiagnosticText(step.id)}' action provider '${boundedDiagnosticText(step.action.provider)}' is listed in workflow.guardrails.deniedCommands.`
      ))
    } else if (allowedCommands.length > 0 && !allowedCommands.includes(step.action.provider)) {
      diagnostics.push(error(
        filePath,
        `Command step '${boundedDiagnosticText(step.id)}' action provider '${boundedDiagnosticText(step.action.provider)}' must be listed in workflow.guardrails.allowedCommands.`
      ))
    }
  }
  if (options.contributionLookup) {
    const matchCount = options.contributionLookup.actionProviders.get(step.action.provider) ?? 0
    if (matchCount !== 1) {
      diagnostics.push(error(filePath, contributionMatchMessage(
        `Command step '${boundedDiagnosticText(step.id)}' action provider '${boundedDiagnosticText(step.action.provider)}'`,
        matchCount
      )))
    }
    if (step.action.provider === "vscode.executeCommand") {
      const commandId = Array.isArray(step.action.args) ? step.action.args[0] : undefined
      if (typeof commandId !== "string" || commandId.length === 0) {
        diagnostics.push(error(
          filePath,
          `Command step '${boundedDiagnosticText(step.id)}' vscode.executeCommand args[0] must be a non-empty command id.`
        ))
      } else {
        if (!allowedCommandIds.has(commandId)) {
          diagnostics.push(error(
            filePath,
            `Command step '${boundedDiagnosticText(step.id)}' vscode.executeCommand command '${boundedDiagnosticText(commandId)}' must be listed in workflow.guardrails.allowedCommandIds.`
          ))
        }
        validateCommandReference(
          commandId,
          `Command step '${boundedDiagnosticText(step.id)}' vscode.executeCommand command`,
          options.contributionLookup,
          diagnostics,
          filePath
        )
      }
    }
  }
}

function validateTodoStepMapping(workflow: CoreWorkflowDefinition, stepIds: Set<string>, diagnostics: WorkflowDiagnostic[], filePath: string): void {
  if (!workflow.todoAsSteps) return
  const todoIds = new Set(workflow.todos.map((todo) => todo.id))
  for (const todo of workflow.todos) {
    if (!stepIds.has(todo.id)) diagnostics.push(error(filePath, `Todo '${todo.id}' has no matching step.`))
  }
  for (const step of workflow.engineSteps) {
    if (!todoIds.has(step.id)) diagnostics.push(warning(filePath, `Step '${step.id}' has no matching Todo item.`))
  }
}

function validateStateReferences(
  steps: EngineStep[],
  resultKeys: Set<string>,
  options: WorkflowValidationOptions,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  for (const step of steps) {
    for (const key of step.includeState ?? []) {
      if (!resultKeys.has(key)) {
        diagnostics.push(error(filePath, `Step '${step.id}' includeState references unknown resultKey '${key}'.`))
      }
    }
    if ((step.type === "agent" || step.type === "result") && step.result) {
      validateResultSource(step.id, step.result, resultKeys, options, diagnostics, filePath)
    }
  }
}

function validateBranching(
  workflow: CoreWorkflowDefinition,
  stepIndexes: Map<string, number>,
  resultKeyProducers: Map<string, ResultKeyProducer[]>,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  const branching = workflow.branching
  const loopIds = new Set<string>()
  const loopEntrySteps = new Map<string, string>()
  if (branching) {
    for (const loop of branching.loops) {
      if (loopIds.has(loop.id)) diagnostics.push(error(filePath, `Duplicate branch loop id '${loop.id}'.`))
      loopIds.add(loop.id)
      loopEntrySteps.set(loop.id, loop.entryStep)
      if (!stepIndexes.has(loop.entryStep)) {
        diagnostics.push(error(filePath, `Branch loop '${loop.id}' entryStep references unknown step '${loop.entryStep}'.`))
      }
      if (loop.maxIterations <= 0) {
        diagnostics.push(error(filePath, `Branch loop '${loop.id}' maxIterations must be greater than zero.`))
      }
      if (loop.extensionSize <= 0) {
        diagnostics.push(error(filePath, `Branch loop '${loop.id}' extensionSize must be greater than zero.`))
      }
    }
  }

  for (const step of workflow.engineSteps) {
    if (!step.transition) continue
    if (branching?.enabled !== true) {
      diagnostics.push(error(filePath, `Step '${step.id}' defines transition but branching.enabled is not true.`))
    }
    validateTransition(step, stepIndexes, loopIds, loopEntrySteps, resultKeyProducers, diagnostics, filePath)
  }
}

function validateTransition(
  step: EngineStep,
  stepIndexes: Map<string, number>,
  loopIds: Set<string>,
  loopEntrySteps: Map<string, string>,
  resultKeyProducers: Map<string, ResultKeyProducer[]>,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  const transition = step.transition
  if (!transition) return
  const decisionIds = new Set<string>()
  for (const decision of transition.decisions) {
    if (decisionIds.has(decision.id)) {
      diagnostics.push(error(filePath, `Step '${step.id}' has Duplicate transition decision id '${decision.id}'.`))
    }
    decisionIds.add(decision.id)
    validateTransitionCondition(step.id, decision.id, decision.when, stepIndexes, resultKeyProducers, diagnostics, filePath)
    validateGoto(step, decision.goto, decision.loop, stepIndexes, loopIds, loopEntrySteps, diagnostics, filePath)
  }
  const defaultAction = transition.default ?? "next"
  if (defaultAction !== "next" && defaultAction !== "end" && defaultAction !== "fail") {
    validateGoto(step, defaultAction, undefined, stepIndexes, loopIds, loopEntrySteps, diagnostics, filePath, "transition default")
  }
}

function validateGoto(
  step: EngineStep,
  goto: string,
  loopId: string | undefined,
  stepIndexes: Map<string, number>,
  loopIds: Set<string>,
  loopEntrySteps: Map<string, string>,
  diagnostics: WorkflowDiagnostic[],
  filePath: string,
  label = "goto"
): void {
  if (loopId && !loopIds.has(loopId)) {
    diagnostics.push(error(filePath, `Step '${step.id}' ${label} loop references unknown loop '${loopId}'.`))
  }
  if (!stepIndexes.has(goto)) {
    diagnostics.push(error(filePath, `Step '${step.id}' ${label} references unknown step '${goto}'.`))
    return
  }
  const loopEntryStep = loopId ? loopEntrySteps.get(loopId) : undefined
  if (loopEntryStep && goto !== loopEntryStep) {
    diagnostics.push(error(filePath, `Step '${step.id}' ${label} loop '${loopId}' must target entryStep '${loopEntryStep}', not '${goto}'.`))
  }
  const currentIndex = stepIndexes.get(step.id) ?? 0
  const targetIndex = stepIndexes.get(goto) ?? currentIndex
  if (targetIndex < currentIndex && !loopId) {
    diagnostics.push(error(filePath, `Step '${step.id}' backward goto to '${goto}' must specify loop.`))
  }
}

function validateTransitionCondition(
  stepId: string,
  decisionId: string,
  condition: WorkflowTransitionConditionDefinition,
  stepIndexes: Map<string, number>,
  resultKeyProducers: Map<string, ResultKeyProducer[]>,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  const operators = [
    condition.equals !== undefined ? "equals" : undefined,
    condition.notEquals !== undefined ? "notEquals" : undefined,
    condition.in !== undefined ? "in" : undefined,
    condition.exists !== undefined ? "exists" : undefined,
    condition.truthy !== undefined ? "truthy" : undefined
  ].filter(Boolean)
  if (operators.length !== 1) {
    diagnostics.push(error(filePath, `Step '${stepId}' decision '${decisionId}' condition must specify exactly one operator.`))
  }
  const rootKey = condition.stateKey.split(".")[0]
  const producers = rootKey ? resultKeyProducers.get(rootKey) : undefined
  if (rootKey && !producers) {
    diagnostics.push(warning(filePath, `Step '${stepId}' decision '${decisionId}' condition stateKey '${condition.stateKey}' is not produced by a workflow resultKey.`))
    return
  }
  const currentIndex = stepIndexes.get(stepId)
  if (currentIndex === undefined || !producers) return
  const hasPriorProducer = producers.some((producer) => producer.index <= currentIndex)
  if (!hasPriorProducer) {
    const firstLaterProducer = [...producers].sort((left, right) => left.index - right.index)[0]
    diagnostics.push(error(
      filePath,
      `Step '${stepId}' decision '${decisionId}' condition stateKey '${condition.stateKey}' is produced by later step '${firstLaterProducer.stepId}'.`
    ))
  }
}

function validateResultSource(
  stepId: string,
  result: ResultSourceDefinition,
  resultKeys: Set<string>,
  options: WorkflowValidationOptions,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  if (result.source === "state" && !resultKeys.has(result.stateKey)) {
    diagnostics.push(error(filePath, `Step '${stepId}' result references unknown stateKey '${result.stateKey}'.`))
  }
  for (const [index, sink] of result.sinks.entries()) validateResultSink(stepId, sink, index, options, diagnostics, filePath)
}

function validateResultSink(
  stepId: string,
  sink: ResultSinkDefinition,
  index: number,
  options: WorkflowValidationOptions,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  validateResultSinkContribution(stepId, sink, index, options.contributionLookup, diagnostics, filePath)
  if (isCommandResultSink(sink)) {
    if (!sink.command.trim()) diagnostics.push(error(filePath, `Step '${stepId}' command result sink has no command.`))
    return
  }
  if (isFileResultSink(sink)) {
    if (!sink.path.trim()) diagnostics.push(error(filePath, `Step '${stepId}' file result sink has no path.`))
    return
  }
  if (!CUSTOM_SINK_TYPE_PATTERN.test(sink.type) || sink.type === "command" || sink.type === "file") {
    diagnostics.push(error(filePath, `Step '${stepId}' custom result sink has an invalid type.`))
  }
  if (
    !CUSTOM_SINK_CONTRACT_PATTERN.test(sink.contractVersion)
    || sink.contractVersion.length > MAX_CONTRIBUTION_CONTRACT_VERSION_LENGTH
  ) {
    diagnostics.push(error(filePath, `Step '${stepId}' custom result sink has an invalid contractVersion.`))
  }
  if (!sink.payload || typeof sink.payload !== "object" || Array.isArray(sink.payload)) {
    diagnostics.push(error(filePath, `Step '${stepId}' custom result sink payload must be an object.`))
  }
}

function validateResultSinkContribution(
  stepId: string,
  sink: ResultSinkDefinition,
  index: number,
  catalog: ContributionCatalogLookup | undefined,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  if (!catalog) return
  const location = `Step '${boundedDiagnosticText(stepId)}' result sink[${index}] type '${boundedDiagnosticText(sink.type)}'`
  const versions = catalog.resultSinks.get(sink.type) ?? []
  if (versions.length !== 1) {
    diagnostics.push(error(filePath, contributionMatchMessage(location, versions.length)))
    return
  }
  if (!isCommandResultSink(sink) && !isFileResultSink(sink) && sink.contractVersion !== versions[0]) {
    diagnostics.push(error(
      filePath,
      `${location} contractVersion '${boundedDiagnosticText(sink.contractVersion)}' does not match catalog contract_version '${boundedDiagnosticText(versions[0])}'.`
    ))
  }
}

function contributionMatchMessage(location: string, matchCount: number): string {
  return matchCount === 0
    ? `${location} has no contribution catalog match.`
    : `${location} has ${matchCount} contribution catalog matches.`
}

const CONTRIBUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/
const EXTENSION_OWNER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const CONTRIBUTION_CONTRACT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/v[1-9][0-9]*$/
const MAX_CONTRIBUTION_CONTRACT_VERSION_LENGTH = 256
const CUSTOM_SINK_TYPE_PATTERN = CONTRIBUTION_ID_PATTERN
const CUSTOM_SINK_CONTRACT_PATTERN = CONTRIBUTION_CONTRACT_PATTERN

function validateArtifacts(workflow: CoreWorkflowDefinition, stepIds: Set<string>, diagnostics: WorkflowDiagnostic[], filePath: string): void {
  const artifactIds = new Set<string>()
  for (const artifact of workflow.artifacts) {
    if (artifactIds.has(artifact.id)) diagnostics.push(error(filePath, `Duplicate artifact id '${artifact.id}'.`))
    artifactIds.add(artifact.id)
    if (artifact.producedBy && !stepIds.has(artifact.producedBy)) {
      diagnostics.push(error(filePath, `Artifact '${artifact.id}' references unknown producedBy step '${artifact.producedBy}'.`))
    }
  }
}

function validateSkipResumeFileBound(
  workflow: CoreWorkflowDefinition,
  resultKeyProducers: Map<string, ResultKeyProducer[]>,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  const skipResume = (workflow as CoreWorkflowDefinition & SkipResumeWorkflowMetadata).skipResume
  if (skipResume?.fileBound !== true) return

  const artifactsByProducerAndId = new Set(
    workflow.artifacts
      .filter((artifact) => artifact.producedBy)
      .map((artifact) => artifactKey(artifact.producedBy as string, artifact.id))
  )
  const producerKeys = new Set<string>()
  for (const [resultKey, producers] of resultKeyProducers) {
    for (const producer of producers) {
      producerKeys.add(artifactKey(producer.stepId, resultKey))
      if (!artifactsByProducerAndId.has(artifactKey(producer.stepId, resultKey))) {
        diagnostics.push(warning(
          filePath,
          `File-bound skip resume is enabled but step '${producer.stepId}' ${producer.source} '${resultKey}' has no matching artifact id produced by the same step.`
        ))
      }
    }
  }

  for (const step of workflow.engineSteps) {
    if (step.type === "agent" && !step.resultKey) {
      diagnostics.push(warning(filePath, `File-bound skip resume is enabled but agent step '${step.id}' has no resultKey to persist as an artifact.`))
    }
    if (step.type === "result" && !step.result.sinks.some((sink) => sink.type === "file")) {
      diagnostics.push(warning(filePath, `File-bound skip resume is enabled but result step '${step.id}' has no file sink.`))
    }
  }

  for (const artifact of workflow.artifacts) {
    if (!artifact.producedBy) {
      diagnostics.push(warning(filePath, `File-bound skip resume artifact '${artifact.id}' should declare producedBy.`))
      continue
    }
    if (!producerKeys.has(artifactKey(artifact.producedBy, artifact.id))) {
      diagnostics.push(warning(filePath, `File-bound skip resume artifact '${artifact.id}' does not match a resultKey produced by step '${artifact.producedBy}'.`))
    }
    if (!isRunScopedArtifactPath(artifact.path)) {
      diagnostics.push(warning(filePath, `File-bound skip resume artifact '${artifact.id}' path should include '{{run.id}}' or '{{runId}}'.`))
    }
  }
}

function artifactKey(stepId: string, artifactId: string): string {
  return `${stepId}\u0000${artifactId}`
}

function isRunScopedArtifactPath(path: string): boolean {
  return /\{\{\s*(?:run\.id|runId)\s*\}\}/.test(path)
}

function validateInputs(workflow: CoreWorkflowDefinition, diagnostics: WorkflowDiagnostic[], filePath: string): void {
  for (const [key, input] of Object.entries(workflow.inputs)) {
    if (input.type === "select" && (!input.options || input.options.length === 0)) {
      diagnostics.push(error(filePath, `Input '${key}' is select but has no options.`))
    }
    if (input.requiredWhen) {
      const referenced = input.requiredWhen.match(/^\s*(?:inputs\.)?([A-Za-z0-9_.-]+)\s*(?:==|!=)\s*.+$/)?.[1]
      if (!referenced) {
        diagnostics.push(warning(filePath, `Input '${key}' has an unsupported requiredWhen expression: ${input.requiredWhen}`))
      } else if (!workflow.inputs[referenced]) {
        diagnostics.push(error(filePath, `Input '${key}' requiredWhen references unknown input '${referenced}'.`))
      }
    }
  }
}

function validatePreflight(
  workflow: CoreWorkflowDefinition,
  options: WorkflowValidationOptions,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  for (const preflight of workflow.preflight) {
    for (const check of preflight.checks ?? []) {
      if (options.contributionLookup) {
        const matchCount = options.contributionLookup.preflightChecks.get(check) ?? 0
        if (matchCount !== 1) {
          diagnostics.push(error(filePath, contributionMatchMessage(
            `Preflight '${boundedDiagnosticText(preflight.id)}' check '${boundedDiagnosticText(check)}'`,
            matchCount
          )))
        }
      }
    }
  }
}

function validateGuardrails(
  workflow: CoreWorkflowDefinition,
  options: WorkflowValidationOptions,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  const allowed = new Set(workflow.guardrails.allowedCommands ?? [])
  for (const denied of workflow.guardrails.deniedCommands ?? []) {
    if (allowed.has(denied)) diagnostics.push(error(filePath, `Guardrail command '${denied}' is both allowed and denied.`))
  }
  const allowedCommandIds = new Set(workflow.guardrails.allowedCommandIds ?? [])
  if (options.contributionLookup) {
    for (const commandId of allowedCommandIds) {
      validateCommandReference(
        commandId,
        "Guardrail command id",
        options.contributionLookup,
        diagnostics,
        filePath
      )
    }
  }
  for (const denied of workflow.guardrails.deniedCommandIds ?? []) {
    if (allowedCommandIds.has(denied)) diagnostics.push(error(filePath, `Guardrail command id '${denied}' is both allowed and denied.`))
  }
  for (const rule of workflow.guardrails.requireApproval ?? []) {
    const issue = validateApprovalExpression(rule.when)
    if (issue) diagnostics.push(error(filePath, rule.id ? `${issue} (rule: ${rule.id})` : issue))
  }
}

function validateCommandReference(
  commandId: string,
  location: string,
  lookup: ContributionCatalogLookup,
  diagnostics: WorkflowDiagnostic[],
  filePath: string
): void {
  const productMatches = lookup.productCommands.get(commandId) ?? 0
  const externalDeclarations = lookup.externalCommands.get(commandId) ?? []
  const externalMatches = externalDeclarations.filter((paths) => paths.includes(filePath)).length
  const matchCount = productMatches + externalMatches
  const displayedId = boundedDiagnosticText(commandId)
  if (matchCount === 1) return
  if (matchCount === 0 && externalDeclarations.length > 0) {
    diagnostics.push(error(
      filePath,
      `${location} '${displayedId}' is not declared for workflow path '${boundedDiagnosticText(filePath)}'.`
    ))
    return
  }
  diagnostics.push(error(
    filePath,
    matchCount === 0
      ? `${location} '${displayedId}' has no command catalog match.`
      : `${location} '${displayedId}' has ${matchCount} command catalog matches.`
  ))
}

function validateTemplatePlaceholders(workflow: CoreWorkflowDefinition, diagnostics: WorkflowDiagnostic[], filePath: string): void {
  for (const artifact of workflow.artifacts) {
    warnBareTemplatePlaceholders(artifact.path, `artifact '${artifact.id}' path`, diagnostics, filePath)
  }
  for (const step of workflow.engineSteps) {
    warnBareTemplatePlaceholders(step.prompt, `step '${step.id}' prompt`, diagnostics, filePath)
    if (step.type === "command") warnBareTemplateValues(step.action.args, `step '${step.id}' action.args`, diagnostics, filePath)
    if ((step.type === "agent" || step.type === "result") && step.result) {
      if (step.result.source === "literal") warnBareTemplatePlaceholders(step.result.text, `step '${step.id}' result.text`, diagnostics, filePath)
      for (const sink of step.result.sinks) {
        if (isFileResultSink(sink)) warnBareTemplatePlaceholders(sink.path, `step '${step.id}' file sink path`, diagnostics, filePath)
        if (isCommandResultSink(sink)) warnBareTemplateValues(sink.args, `step '${step.id}' command sink args`, diagnostics, filePath)
      }
    }
  }
}

function warnBareTemplateValues(value: unknown, location: string, diagnostics: WorkflowDiagnostic[], filePath: string): void {
  if (typeof value === "string") {
    warnBareTemplatePlaceholders(value, location, diagnostics, filePath)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => warnBareTemplateValues(item, `${location}[${index}]`, diagnostics, filePath))
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    warnBareTemplateValues(item, `${location}.${key}`, diagnostics, filePath)
  }
}

function warnBareTemplatePlaceholders(value: string | undefined, location: string, diagnostics: WorkflowDiagnostic[], filePath: string): void {
  if (!value) return
  const matches = value.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)
  for (const match of matches) {
    diagnostics.push(warning(
      filePath,
      `Deprecated bare template placeholder '{{${match[1]}}}' in ${location}; use an explicit namespace such as '{{inputs.${match[1]}}}', '{{state.${match[1]}}}', or '{{json state.<resultKey>.${match[1]}}}'.`
    ))
  }
}

function diagnosticFromParserLine(line: string, filePath: string): WorkflowDiagnostic {
  const trimmed = line.replace(/^[-*]\s*/, "")
  if (trimmed.startsWith("fail:")) return error(filePath, withoutParserFilePath(trimmed.slice(5).trim(), filePath))
  if (trimmed.startsWith("warn:")) return warning(filePath, withoutParserFilePath(trimmed.slice(5).trim(), filePath))
  return { severity: "info", filePath, message: withoutParserFilePath(trimmed.replace(/^ok:\s*/, ""), filePath) }
}

function withoutParserFilePath(message: string, filePath: string): string {
  const prefix = `${filePath}: `
  return message.startsWith(prefix) ? message.slice(prefix.length) : message
}

function diagnosticHint(message: string): string | undefined {
  if (message.includes("includeState references unknown resultKey")) {
    return "Add resultKey to an earlier command or agent step, or remove the includeState entry."
  }
  if (message.includes("File-bound skip resume")) return "For skip-resumable workflows, give each reusable resultKey a same-id artifact with producedBy set to the producing step and a run-scoped path."
  if (message.includes("result references unknown stateKey")) return "Use a stateKey produced by an earlier resultKey."
  if (message.includes("Duplicate step id")) return "Each step id must be unique within one WORKFLOW.md."
  if (message.includes("select but has no options")) return "Add an options list to the select input."
  if (message.includes("producedBy step")) return "Set producedBy to the id of a step that exists in steps."
  if (message.includes("command id")) return "Keep each VS Code command id in either allowedCommandIds or deniedCommandIds, not both."
  if (message.includes("both allowed and denied")) return "Keep each command in either allowedCommands or deniedCommands, not both."
  if (message.includes("missing YAML front matter")) return "Start the file with a YAML front matter block delimited by ---."
  if (message.includes("invalid YAML")) return "Check indentation, list markers, and quoted strings in the front matter."
  return undefined
}

function error(filePath: string, message: string): WorkflowDiagnostic {
  return { severity: "error", filePath, message }
}

function warning(filePath: string, message: string): WorkflowDiagnostic {
  return { severity: "warning", filePath, message }
}
