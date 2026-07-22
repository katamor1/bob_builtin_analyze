import {
  type ContributionManifestValidationContext,
  type WorkflowContributionManifest,
  validateContributionManifest
} from "./contributionManifest"
import { sha256Content } from "./contentDigest"
import { TextDecoder } from "node:util"
import { boundedDiagnosticText } from "./diagnosticText"
import {
  type ExtensionCommandCatalog,
  type ExtensionProductCommand,
  readExtensionCommandCatalog
} from "./extensionCommandCatalog"

export const WORKFLOW_CONTRIBUTION_CATALOG_SCHEMA_VERSION = "workflow-contribution-catalog/v1" as const

export interface WorkflowContributionCatalogInput {
  manifestPath: string
  manifestContent: string | Buffer
  context: ContributionManifestValidationContext
  readContent: (repositoryPath: string) => string | Buffer
}

export interface WorkflowContributionCatalogOwner {
  id: string
  version: string
  manifest_path: string
  manifest_sha256: string
}

export interface WorkflowContributionCatalogAsset {
  owner: string
  id: string
  path: string
  sha256: string
}

export interface WorkflowExternalCommandCatalogEntry {
  owner: string
  id: string
  contract_version: string
  workflow_paths: string[]
}

export interface WorkflowContributionCatalog {
  schema_version: typeof WORKFLOW_CONTRIBUTION_CATALOG_SCHEMA_VERSION
  registry_api: { min: string; max: string }
  owners: WorkflowContributionCatalogOwner[]
  action_providers: Array<WorkflowContributionManifest["action_providers"][number] & { owner: string }>
  preflight_checks: Array<WorkflowContributionManifest["preflight_checks"][number] & { owner: string }>
  result_sinks: Array<WorkflowContributionManifest["result_sinks"][number] & { owner: string }>
  agent_providers: Array<WorkflowContributionManifest["agent_provider"] extends infer T ? NonNullable<T> & { owner: string } : never>
  commands: ExtensionProductCommand[]
  external_commands: WorkflowExternalCommandCatalogEntry[]
  workflow_templates: WorkflowContributionCatalogAsset[]
  schemas: WorkflowContributionCatalogAsset[]
}

interface CatalogInputSnapshot extends WorkflowContributionCatalogInput {
  context: ContributionManifestValidationContext
}

interface ValidatedCatalogInput extends CatalogInputSnapshot {
  manifest: WorkflowContributionManifest
  commandCatalog: ExtensionCommandCatalog
}

interface NamedContribution {
  kind: string
  id: string
  owner: string
}

/**
 * Build a sorted catalog from manifest declarations and exact declared-file bytes.
 * This module deliberately receives all I/O as input, so catalog construction has
 * no VS Code or source-code parsing dependency.
 */
export function buildWorkflowContributionCatalog(inputs: readonly WorkflowContributionCatalogInput[]): WorkflowContributionCatalog {
  if (!Array.isArray(inputs)) throw new Error("workflow contribution catalog inputs must be an array")
  if (inputs.length === 0) throw new Error("workflow contribution catalog requires at least one manifest")

  const validated = inputs.map((input, index) => validateCatalogInput(input, index)).sort(compareCatalogInputs)
  assertUniqueOwners(validated)
  const registryApi = intersectRegistryRanges(validated)
  assertUniqueContributionIds(validated)
  assertUniqueContractVersions(validated)
  assertUniqueCommandIds(validated)

  return {
    schema_version: WORKFLOW_CONTRIBUTION_CATALOG_SCHEMA_VERSION,
    registry_api: registryApi,
    owners: validated.map((input) => ({
      id: input.manifest.owner.id,
      version: input.manifest.owner.version,
      manifest_path: input.manifestPath,
      manifest_sha256: sha256Content(input.manifestContent)
    })),
    action_providers: validated.flatMap((input) => input.manifest.action_providers
      .map((entry) => ({ ...entry, owner: input.manifest.owner.id })))
      .sort((left, right) => compareText(left.id, right.id) || compareText(left.owner, right.owner)),
    preflight_checks: validated.flatMap((input) => input.manifest.preflight_checks
      .map((entry) => ({ ...entry, owner: input.manifest.owner.id })))
      .sort((left, right) => compareText(left.id, right.id) || compareText(left.owner, right.owner)),
    result_sinks: validated.flatMap((input) => input.manifest.result_sinks
      .map((entry) => ({ ...entry, owner: input.manifest.owner.id })))
      .sort((left, right) => compareText(left.type, right.type) || compareText(left.owner, right.owner)),
    agent_providers: validated.flatMap((input) => input.manifest.agent_provider
      ? [{ ...input.manifest.agent_provider, owner: input.manifest.owner.id }]
      : []),
    commands: validated.flatMap((input) => input.commandCatalog.commands).sort(compareCommands),
    external_commands: validated.flatMap((input) => input.manifest.external_commands.map((command) => ({
      owner: input.manifest.owner.id,
      id: command.id,
      contract_version: command.contract_version,
      workflow_paths: [...command.workflow_paths].sort(compareText)
    }))).sort(compareExternalCommands),
    workflow_templates: validated.flatMap((input) => input.manifest.workflow_templates.map((template) => asset(
      input,
      template.id,
      template.source
    ))).sort(compareAssets),
    schemas: validated.flatMap((input) => input.manifest.schemas.map((schema) => asset(
      input,
      schema.id,
      schema.path
    ))).sort(compareAssets)
  }
}

function validateCatalogInput(input: unknown, index: number): ValidatedCatalogInput {
  const checked = snapshotCatalogInput(input, index)
  assertManifestPathMatchesOwnerDirectory(checked)
  const manifest = parseManifestContent(checked.manifestPath, checked.manifestContent)
  const validation = validateContributionManifest(manifest, checked.context)
  if (!validation.ok || !validation.manifest) {
    const diagnostics = validation.diagnostics.map((item) => `${item.code}: ${item.message}`).join("; ")
    throw new Error(`${checked.manifestPath}: invalid contribution manifest: ${diagnostics}`)
  }
  const packagePath = derivePackagePath(checked.context.ownerDirectory)
  const commandCatalog = readExtensionCommandCatalog(
    packagePath,
    readPackageContent(checked, packagePath),
    validation.manifest.owner
  )
  return { ...checked, manifest: validation.manifest, commandCatalog }
}

function assertManifestPathMatchesOwnerDirectory(input: CatalogInputSnapshot): void {
  const expectedManifestPath = `${input.context.ownerDirectory}/contracts/workflow-contributions.json`
  if (input.manifestPath !== expectedManifestPath) {
    throw new Error(
      `manifest path '${boundedDiagnosticText(input.manifestPath)}' must equal '${boundedDiagnosticText(expectedManifestPath)}' derived from ownerDirectory`
    )
  }
}

function derivePackagePath(ownerDirectory: string): string {
  const packagePath = `${ownerDirectory}/package.json`
  if (!isCanonicalPackagePath(packagePath)) {
    throw new Error(
      `derived package path '${boundedDiagnosticText(packagePath)}' is invalid; expected a normalized repository-relative package.json path`
    )
  }
  return packagePath
}

function isCanonicalPackagePath(value: string): boolean {
  return value.length > 0
    && value.length <= 2048
    && !value.startsWith("/")
    && !value.includes("\\")
    && !/^[A-Za-z]:/.test(value)
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
    && !/[*?\[\]{}!]/.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    && (value === "package.json" || value.endsWith("/package.json"))
}

function snapshotCatalogInput(input: unknown, index: number): CatalogInputSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`workflow contribution catalog input ${index} must be an object`)
  }
  let manifestPath: unknown
  let manifestContent: unknown
  let contextValue: unknown
  let readContent: unknown
  let expectedOwner: unknown
  let ownerId: unknown
  let ownerVersion: unknown
  let ownerDirectory: unknown
  try {
    const value = input as Partial<WorkflowContributionCatalogInput>
    manifestPath = value.manifestPath
    manifestContent = value.manifestContent
    contextValue = value.context
    readContent = value.readContent
    if (contextValue && typeof contextValue === "object" && !Array.isArray(contextValue)) {
      expectedOwner = (contextValue as Partial<ContributionManifestValidationContext>).expectedOwner
      ownerDirectory = (contextValue as Partial<ContributionManifestValidationContext>).ownerDirectory
      if (expectedOwner && typeof expectedOwner === "object" && !Array.isArray(expectedOwner)) {
        ownerId = (expectedOwner as Partial<ContributionManifestValidationContext["expectedOwner"]>).id
        ownerVersion = (expectedOwner as Partial<ContributionManifestValidationContext["expectedOwner"]>).version
      }
    }
  } catch {
    throw new Error(`workflow contribution catalog input ${index} metadata is invalid`)
  }

  if (typeof manifestPath !== "string" || manifestPath.length === 0) {
    throw new Error("workflow contribution catalog input requires a non-empty manifestPath")
  }
  if (typeof manifestContent !== "string" && !Buffer.isBuffer(manifestContent)) {
    throw new Error(`${manifestPath}: manifestContent must be a string or Buffer`)
  }
  if (typeof ownerId !== "string" || typeof ownerVersion !== "string" || typeof ownerDirectory !== "string") {
    throw new Error(`${manifestPath}: context must provide expectedOwner and ownerDirectory`)
  }
  if (typeof readContent !== "function") {
    throw new Error(`${manifestPath}: requires a readContent function`)
  }
  return {
    manifestPath,
    manifestContent: typeof manifestContent === "string" ? manifestContent : Buffer.from(manifestContent),
    context: {
      expectedOwner: { id: ownerId, version: ownerVersion },
      ownerDirectory
    },
    readContent: readContent as WorkflowContributionCatalogInput["readContent"]
  }
}

function parseManifestContent(manifestPath: string, content: string | Buffer): unknown {
  let text: string
  try {
    text = typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content)
    return JSON.parse(text)
  } catch {
    throw new Error(`${manifestPath}: manifest content must be valid UTF-8 JSON`)
  }
}

function assertUniqueOwners(inputs: readonly ValidatedCatalogInput[]): void {
  const paths = new Map<string, string>()
  for (const input of inputs) {
    const owner = input.manifest.owner.id
    const existing = paths.get(owner)
    if (existing) throw new Error(`duplicate owner '${owner}' in '${existing}' and '${input.manifestPath}'`)
    paths.set(owner, input.manifestPath)
  }
}

function intersectRegistryRanges(inputs: readonly ValidatedCatalogInput[]): { min: string; max: string } {
  const minimum = inputs.reduce((current, input) => maxRegistryVersion(current, input.manifest.registry_api.min), inputs[0].manifest.registry_api.min)
  const maximum = inputs.reduce((current, input) => minRegistryVersion(current, input.manifest.registry_api.max), inputs[0].manifest.registry_api.max)
  if (registryVersionNumber(minimum) > registryVersionNumber(maximum)) {
    throw new Error(`incompatible registry ranges: no shared version between '${minimum}' and '${maximum}'`)
  }
  return { min: minimum, max: maximum }
}

function assertUniqueContributionIds(inputs: readonly ValidatedCatalogInput[]): void {
  const values = new Map<string, NamedContribution>()
  for (const input of inputs) {
    const owner = input.manifest.owner.id
    const contributions: NamedContribution[] = [
      ...input.manifest.action_providers.map((entry) => ({ kind: "action provider", id: entry.id, owner })),
      ...input.manifest.preflight_checks.map((entry) => ({ kind: "preflight check", id: entry.id, owner })),
      ...input.manifest.result_sinks.map((entry) => ({ kind: "result sink", id: entry.type, owner })),
      ...(input.manifest.agent_provider ? [{ kind: "agent provider", id: input.manifest.agent_provider.id, owner }] : []),
      ...input.manifest.workflow_templates.map((entry) => ({ kind: "workflow template", id: entry.id, owner })),
      ...input.manifest.schemas.map((entry) => ({ kind: "schema", id: entry.id, owner }))
    ]
    for (const contribution of contributions) {
      const existing = values.get(contribution.id)
      if (existing) {
        const collision = existing.kind === contribution.kind ? "duplicate contribution id" : "cross-kind collision"
        throw new Error(`${collision} '${contribution.id}' between ${existing.kind} owned by '${existing.owner}' and ${contribution.kind} owned by '${contribution.owner}'`)
      }
      values.set(contribution.id, contribution)
    }
  }
}

function assertUniqueContractVersions(inputs: readonly ValidatedCatalogInput[]): void {
  const values = new Map<string, NamedContribution>()
  for (const input of inputs) {
    const owner = input.manifest.owner.id
    const contributions: NamedContribution[] = [
      ...input.manifest.action_providers.map((entry) => ({ kind: "action provider", id: entry.contract_version, owner })),
      ...input.manifest.preflight_checks.map((entry) => ({ kind: "preflight check", id: entry.contract_version, owner })),
      ...input.manifest.result_sinks.map((entry) => ({ kind: "result sink", id: entry.contract_version, owner })),
      ...(input.manifest.agent_provider ? [{ kind: "agent provider", id: input.manifest.agent_provider.contract_version, owner }] : []),
      ...input.manifest.external_commands.map((entry) => ({ kind: "external command", id: entry.contract_version, owner }))
    ]
    for (const contribution of contributions) {
      const existing = values.get(contribution.id)
      if (existing) {
        throw new Error(`duplicate contract version '${contribution.id}' between ${existing.kind} owned by '${existing.owner}' and ${contribution.kind} owned by '${contribution.owner}'`)
      }
      values.set(contribution.id, contribution)
    }
  }
}

function assertUniqueCommandIds(inputs: readonly ValidatedCatalogInput[]): void {
  const values = new Map<string, { kind: "product" | "external"; owner: string }>()
  for (const input of inputs) {
    const owner = input.manifest.owner.id
    const commands = [
      ...input.commandCatalog.commands.map((entry) => ({ kind: "product" as const, id: entry.id })),
      ...input.manifest.external_commands.map((entry) => ({ kind: "external" as const, id: entry.id }))
    ]
    for (const command of commands) {
      const existing = values.get(command.id)
      if (existing) {
        const label = existing.kind === command.kind
          ? `duplicate ${command.kind} command`
          : "product/external command collision"
        throw new Error(
          `${label} '${command.id}' between owner '${existing.owner}' and owner '${owner}'`
        )
      }
      values.set(command.id, { kind: command.kind, owner })
    }
  }
}

function asset(input: ValidatedCatalogInput, id: string, repositoryPath: string): WorkflowContributionCatalogAsset {
  return {
    owner: input.manifest.owner.id,
    id,
    path: repositoryPath,
    sha256: sha256Content(readDeclaredContent(input, repositoryPath))
  }
}

function readDeclaredContent(input: CatalogInputSnapshot, repositoryPath: string): string | Buffer {
  try {
    const content = input.readContent(repositoryPath)
    if (typeof content !== "string" && !Buffer.isBuffer(content)) throw new Error("invalid content type")
    return content
  } catch {
    throw new Error(`${input.manifestPath}: failed to read declared content '${repositoryPath}'`)
  }
}

function readPackageContent(input: CatalogInputSnapshot, packagePath: string): Buffer {
  let content: unknown
  try {
    content = input.readContent(packagePath)
  } catch {
    throw new Error(`failed to read package manifest '${boundedDiagnosticText(packagePath)}'`)
  }
  if (!Buffer.isBuffer(content)) {
    throw new Error(`${boundedDiagnosticText(packagePath)}: package manifest content must be a Buffer`)
  }
  return content
}

function compareCatalogInputs(left: ValidatedCatalogInput, right: ValidatedCatalogInput): number {
  return compareText(left.manifest.owner.id, right.manifest.owner.id) || compareText(left.manifestPath, right.manifestPath)
}

function compareAssets(left: WorkflowContributionCatalogAsset, right: WorkflowContributionCatalogAsset): number {
  return compareText(left.id, right.id) || compareText(left.owner, right.owner) || compareText(left.path, right.path)
}

function compareCommands(left: ExtensionProductCommand, right: ExtensionProductCommand): number {
  return compareText(left.id, right.id) || compareText(left.owner, right.owner) || compareText(left.package_path, right.package_path)
}

function compareExternalCommands(left: WorkflowExternalCommandCatalogEntry, right: WorkflowExternalCommandCatalogEntry): number {
  return compareText(left.id, right.id) || compareText(left.owner, right.owner) || compareText(left.contract_version, right.contract_version)
}

function registryVersionNumber(value: string): bigint {
  return BigInt(/^provider-registry\/v([1-9][0-9]*)$/.exec(value)![1])
}

function maxRegistryVersion(left: string, right: string): string {
  return registryVersionNumber(left) >= registryVersionNumber(right) ? left : right
}

function minRegistryVersion(left: string, right: string): string {
  return registryVersionNumber(left) <= registryVersionNumber(right) ? left : right
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
