import { posix } from "node:path"
import Ajv, { type ErrorObject } from "ajv"

const contributionManifestSchema = require("../../schema/workflow-contributions.v1.schema.json") as object

export const CONTRIBUTION_MANIFEST_SCHEMA_VERSION = "workflow-contributions/v1" as const

export interface ContributionOwner {
  id: string
  version: string
}

export interface ContributionRegistryApiRange {
  min: string
  max: string
}

export interface ActionProviderContribution {
  id: string
  contract_version: string
  input_schema: string
  output_schema: string
  error_codes: string[]
}

export interface PreflightCheckContribution {
  id: string
  contract_version: string
  result_schema: string
}

export interface ResultSinkContribution {
  type: string
  contract_version: string
  payload_schema: string
}

export interface AgentProviderContribution {
  id: string
  contract_version: string
  capabilities: string[]
}

export interface WorkflowTemplateContribution {
  id: string
  source: string
  destinations: string[]
}

export interface SchemaContribution {
  id: string
  path: string
}

export interface WorkflowContributionManifest {
  schema_version: typeof CONTRIBUTION_MANIFEST_SCHEMA_VERSION
  owner: ContributionOwner
  registry_api: ContributionRegistryApiRange
  action_providers: ActionProviderContribution[]
  preflight_checks: PreflightCheckContribution[]
  result_sinks: ResultSinkContribution[]
  agent_provider?: AgentProviderContribution
  workflow_templates: WorkflowTemplateContribution[]
  schemas: SchemaContribution[]
}

export interface ContributionManifestValidationContext {
  expectedOwner: ContributionOwner
  /** Normalized repository-relative POSIX directory that owns the manifest. */
  ownerDirectory: string
}

export interface ContributionManifestDiagnostic {
  code: string
  path: string
  message: string
}

export interface ContributionManifestValidationResult {
  ok: boolean
  diagnostics: ContributionManifestDiagnostic[]
  manifest?: WorkflowContributionManifest
}

const ajv = new Ajv({ allErrors: true, strict: true })
const validateStructure = ajv.compile<WorkflowContributionManifest>(contributionManifestSchema)
const REGISTRY_VERSION_PATTERN = /^provider-registry\/v([1-9][0-9]*)$/
const DIAGNOSTIC_BYTE_LIMIT = 256

/**
 * Validate an already-decoded contribution manifest without filesystem or VS Code access.
 */
export function validateContributionManifest(
  value: unknown,
  context: ContributionManifestValidationContext
): ContributionManifestValidationResult {
  if (!validateStructure(value)) {
    return failure((validateStructure.errors ?? []).map(fromAjvError))
  }

  const manifest = value as WorkflowContributionManifest
  const diagnostics: ContributionManifestDiagnostic[] = []
  validateOwner(manifest, context, diagnostics)
  validateRegistryRange(manifest.registry_api, diagnostics)
  validateIdentifiers(manifest, diagnostics)
  validateSchemaReferences(manifest, diagnostics)
  validateOwnedPaths(manifest, context.ownerDirectory, diagnostics)

  if (diagnostics.length > 0) return failure(diagnostics)
  return { ok: true, diagnostics: [], manifest }
}

function validateOwner(
  manifest: WorkflowContributionManifest,
  context: ContributionManifestValidationContext,
  diagnostics: ContributionManifestDiagnostic[]
): void {
  if (manifest.owner.id !== context.expectedOwner.id) {
    diagnostics.push(diagnostic(
      "owner.id_mismatch",
      "/owner/id",
      `owner id '${manifest.owner.id}' does not match expected owner '${context.expectedOwner.id}'`
    ))
  }
  if (manifest.owner.version !== context.expectedOwner.version) {
    diagnostics.push(diagnostic(
      "owner.version_mismatch",
      "/owner/version",
      `owner version '${manifest.owner.version}' does not match expected version '${context.expectedOwner.version}'`
    ))
  }

  if (!isNormalizedRepoPath(context.ownerDirectory)) {
    diagnostics.push(diagnostic(
      "owner.directory_not_normalized",
      "/owner",
      `owner directory '${context.ownerDirectory}' must be a normalized repository-relative POSIX path`
    ))
    return
  }
  const extensionName = manifest.owner.id.split(".")[1]
  if (posix.basename(context.ownerDirectory) !== extensionName) {
    diagnostics.push(diagnostic(
      "owner.directory_mismatch",
      "/owner/id",
      `owner directory '${context.ownerDirectory}' does not match extension id '${manifest.owner.id}'`
    ))
  }
}

function validateRegistryRange(
  range: ContributionRegistryApiRange,
  diagnostics: ContributionManifestDiagnostic[]
): void {
  const min = BigInt(REGISTRY_VERSION_PATTERN.exec(range.min)![1])
  const max = BigInt(REGISTRY_VERSION_PATTERN.exec(range.max)![1])
  if (min > max) {
    diagnostics.push(diagnostic(
      "registry.invalid_range",
      "/registry_api",
      `registry minimum '${range.min}' exceeds maximum '${range.max}'`
    ))
  }
}

interface IdentifierEntry {
  namespace: string
  path: string
  id: string
  contractVersion?: string
  contractPath?: string
}

function validateIdentifiers(
  manifest: WorkflowContributionManifest,
  diagnostics: ContributionManifestDiagnostic[]
): void {
  const entries: IdentifierEntry[] = [
    ...manifest.action_providers.map((item, index) => ({
      namespace: "action_providers",
      path: `/action_providers/${index}/id`,
      id: item.id,
      contractVersion: item.contract_version,
      contractPath: `/action_providers/${index}/contract_version`
    })),
    ...manifest.preflight_checks.map((item, index) => ({
      namespace: "preflight_checks",
      path: `/preflight_checks/${index}/id`,
      id: item.id,
      contractVersion: item.contract_version,
      contractPath: `/preflight_checks/${index}/contract_version`
    })),
    ...manifest.result_sinks.map((item, index) => ({
      namespace: "result_sinks",
      path: `/result_sinks/${index}/type`,
      id: item.type,
      contractVersion: item.contract_version,
      contractPath: `/result_sinks/${index}/contract_version`
    })),
    ...(manifest.agent_provider ? [{
      namespace: "agent_provider",
      path: "/agent_provider/id",
      id: manifest.agent_provider.id,
      contractVersion: manifest.agent_provider.contract_version,
      contractPath: "/agent_provider/contract_version"
    }] : []),
    ...manifest.workflow_templates.map((item, index) => ({
      namespace: "workflow_templates",
      path: `/workflow_templates/${index}/id`,
      id: item.id
    })),
    ...manifest.schemas.map((item, index) => ({
      namespace: "schemas",
      path: `/schemas/${index}/id`,
      id: item.id
    }))
  ]

  const identifiers = new Map<string, IdentifierEntry>()
  for (const entry of entries) {
    const existing = identifiers.get(entry.id)
    if (existing) {
      const code = existing.namespace === entry.namespace
        ? "identifier.duplicate"
        : "identifier.cross_namespace_collision"
      diagnostics.push(diagnostic(
        code,
        entry.path,
        `identifier '${entry.id}' is already declared at '${existing.path}'`
      ))
    } else {
      identifiers.set(entry.id, entry)
    }
  }

  const contracts = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.contractVersion || !entry.contractPath) continue
    const existing = contracts.get(entry.contractVersion)
    if (existing) {
      diagnostics.push(diagnostic(
        "contract_version.duplicate",
        entry.contractPath,
        `contract version '${entry.contractVersion}' is already declared at '${existing}'`
      ))
    } else {
      contracts.set(entry.contractVersion, entry.contractPath)
    }
  }

  validateUniqueValues(
    manifest.schemas.map((item, index) => ({ value: item.path, path: `/schemas/${index}/path` })),
    "path.duplicate",
    "schema path",
    diagnostics
  )
}

function validateUniqueValues(
  entries: Array<{ value: string; path: string }>,
  code: string,
  label: string,
  diagnostics: ContributionManifestDiagnostic[]
): void {
  const firstPaths = new Map<string, string>()
  for (const entry of entries) {
    const existing = firstPaths.get(entry.value)
    if (existing) {
      diagnostics.push(diagnostic(code, entry.path, `${label} '${entry.value}' is already declared at '${existing}'`))
    } else {
      firstPaths.set(entry.value, entry.path)
    }
  }
}

function validateSchemaReferences(
  manifest: WorkflowContributionManifest,
  diagnostics: ContributionManifestDiagnostic[]
): void {
  const declared = new Set(manifest.schemas.map((item) => item.id))
  const references = [
    ...manifest.action_providers.flatMap((item, index) => [
      { value: item.input_schema, path: `/action_providers/${index}/input_schema` },
      { value: item.output_schema, path: `/action_providers/${index}/output_schema` }
    ]),
    ...manifest.preflight_checks.map((item, index) => ({
      value: item.result_schema,
      path: `/preflight_checks/${index}/result_schema`
    })),
    ...manifest.result_sinks.map((item, index) => ({
      value: item.payload_schema,
      path: `/result_sinks/${index}/payload_schema`
    }))
  ]
  for (const reference of references) {
    if (!declared.has(reference.value)) {
      diagnostics.push(diagnostic(
        "schema_reference.unknown",
        reference.path,
        `schema reference '${reference.value}' is not declared by this manifest`
      ))
    }
  }
}

function validateOwnedPaths(
  manifest: WorkflowContributionManifest,
  ownerDirectory: string,
  diagnostics: ContributionManifestDiagnostic[]
): void {
  if (!isNormalizedRepoPath(ownerDirectory)) return
  const paths = [
    ...manifest.schemas.map((item, index) => ({ value: item.path, path: `/schemas/${index}/path` })),
    ...manifest.workflow_templates.flatMap((item, index) => [
      { value: item.source, path: `/workflow_templates/${index}/source` },
      ...item.destinations.map((destination, destinationIndex) => ({
        value: destination,
        path: `/workflow_templates/${index}/destinations/${destinationIndex}`
      }))
    ])
  ]
  for (const entry of paths) {
    if (!isNormalizedRepoPath(entry.value)) {
      diagnostics.push(diagnostic(
        "path.not_normalized",
        entry.path,
        `path '${entry.value}' must be a normalized repository-relative POSIX path`
      ))
      continue
    }
    if (entry.value !== ownerDirectory && !entry.value.startsWith(`${ownerDirectory}/`)) {
      diagnostics.push(diagnostic(
        "path.outside_owner",
        entry.path,
        `path '${entry.value}' is outside owner directory '${ownerDirectory}'`
      ))
    }
  }
}

function isNormalizedRepoPath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || /^[A-Za-z]:\//.test(value)) return false
  if (value.includes("\\") || value.includes("//") || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false
  if (value === "." || value.endsWith("/") || posix.normalize(value) !== value) return false
  return value.split("/").every((segment) => segment !== "." && segment !== ".." && segment.length > 0)
}

function fromAjvError(error: ErrorObject): ContributionManifestDiagnostic {
  let path = error.instancePath || "/"
  let message = error.message ?? "schema validation failed"
  if (error.keyword === "additionalProperties") {
    const property = String((error.params as { additionalProperty?: unknown }).additionalProperty ?? "unknown")
    path = appendPointer(path, property)
    message = `unknown property '${property}'`
  } else if (error.keyword === "required") {
    const property = String((error.params as { missingProperty?: unknown }).missingProperty ?? "unknown")
    path = appendPointer(path, property)
    message = `required property '${property}' is missing`
  }
  return diagnostic(`schema.${error.keyword}`, path, message)
}

function appendPointer(base: string, segment: string): string {
  const escaped = segment.replace(/~/g, "~0").replace(/\//g, "~1")
  return base === "/" ? `/${escaped}` : `${base}/${escaped}`
}

function diagnostic(code: string, path: string, message: string): ContributionManifestDiagnostic {
  return {
    code: boundedText(code),
    path: boundedText(path),
    message: boundedText(message)
  }
}

function boundedText(value: string): string {
  const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "�")
  if (Buffer.byteLength(sanitized, "utf8") <= DIAGNOSTIC_BYTE_LIMIT) return sanitized
  let result = ""
  let bytes = 0
  for (const character of sanitized) {
    const nextBytes = Buffer.byteLength(character, "utf8")
    if (bytes + nextBytes > DIAGNOSTIC_BYTE_LIMIT) break
    result += character
    bytes += nextBytes
  }
  return result
}

function failure(diagnostics: ContributionManifestDiagnostic[]): ContributionManifestValidationResult {
  return {
    ok: false,
    diagnostics: [...diagnostics].sort((left, right) => (
      compareCodeUnits(left.path, right.path)
      || compareCodeUnits(left.code, right.code)
      || compareCodeUnits(left.message, right.message)
    ))
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
