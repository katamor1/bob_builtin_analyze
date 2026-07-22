import { TextDecoder } from "node:util"
import {
  type ContributionManifestValidationContext,
  type ContributionManifestDiagnostic,
  type WorkflowContributionManifest,
  validateContributionManifest
} from "./contributionManifest"
import { boundedDiagnosticText } from "./diagnosticText"

const MAX_INPUTS = 256
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const MAX_TEMPLATES = 1024
const MAX_DESTINATIONS_PER_TEMPLATE = 64
const MAX_CONTENT_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_CONTENT_BYTES = 32 * 1024 * 1024
const MAX_DIAGNOSTICS = 256

export interface WorkflowTemplateMirrorInput {
  manifestPath: string
  manifestContent: Buffer
  context: ContributionManifestValidationContext
  readContent: (repositoryPath: string) => Buffer
}

export interface WorkflowContractAssetDiagnostic {
  code: string
  path: string
  message: string
}

export interface WorkflowContractAssetValidationResult {
  ok: boolean
  diagnostics: WorkflowContractAssetDiagnostic[]
}

interface MirrorInputSnapshot extends WorkflowTemplateMirrorInput {
  manifestContent: Buffer
  context: ContributionManifestValidationContext
}

interface ValidatedMirrorInput extends MirrorInputSnapshot {
  manifest: WorkflowContributionManifest
}

/**
 * Validate every manifest-declared template mirror using exact repository bytes.
 * All caller-owned metadata is snapshotted from own data descriptors before a
 * callback can run, so accessors and revoked proxies are rejected inertly.
 */
export function validateWorkflowTemplateMirrors(inputs: readonly WorkflowTemplateMirrorInput[]): WorkflowContractAssetValidationResult {
  const diagnostics: WorkflowContractAssetDiagnostic[] = []
  let inputRecords: unknown[]
  try {
    inputRecords = snapshotArray(inputs, MAX_INPUTS)
  } catch (error) {
    const code = error instanceof InputLimitError ? "template.input_limit" : "template.input_invalid"
    return result([diagnostic(code, "/inputs", code === "template.input_limit"
      ? `template mirror input count exceeds ${MAX_INPUTS}`
      : "template mirror inputs must be a bounded own-data array")])
  }

  const snapshots: MirrorInputSnapshot[] = []
  for (let index = 0; index < inputRecords.length; index += 1) {
    const snapshot = snapshotInput(inputRecords[index], index, diagnostics)
    if (snapshot) snapshots.push(snapshot)
  }
  if (diagnostics.length > 0) return result(diagnostics)

  const validated: ValidatedMirrorInput[] = []
  for (const snapshot of snapshots) {
    const expectedManifestPath = `${snapshot.context.ownerDirectory}/contracts/workflow-contributions.json`
    if (snapshot.manifestPath !== expectedManifestPath) {
      diagnostics.push(diagnostic(
        "manifest.path_mismatch",
        snapshot.manifestPath,
        `manifest path '${snapshot.manifestPath}' must equal '${expectedManifestPath}' derived from owner directory`
      ))
      continue
    }
    const parsed = parseManifest(snapshot, diagnostics)
    if (parsed === undefined) continue
    const validation = validateContributionManifest(parsed, snapshot.context)
    if (!validation.ok || !validation.manifest) {
      diagnostics.push(...validation.diagnostics.map(manifestDiagnostic))
      continue
    }
    if (!withinManifestCollectionLimits(validation.manifest, snapshot.manifestPath, diagnostics)) continue
    validated.push({ ...snapshot, manifest: validation.manifest })
  }
  if (diagnostics.length > 0) return result(diagnostics)

  const contentBudget = { bytes: 0, exceeded: false }
  for (const input of validated) {
    if (contentBudget.exceeded) break
    validateMirrors(input, diagnostics, contentBudget)
  }
  return result(diagnostics)
}

function snapshotInput(
  input: unknown,
  index: number,
  diagnostics: WorkflowContractAssetDiagnostic[]
): MirrorInputSnapshot | undefined {
  try {
    const values = closedOwnDataRecord(input, ["context", "manifestContent", "manifestPath", "readContent"])
    const manifestPath = values.manifestPath
    const manifestContent = values.manifestContent
    const readContent = values.readContent
    if (typeof manifestPath !== "string" || manifestPath.length === 0 || manifestPath.length > 2048) {
      throw new Error("manifestPath must be a bounded non-empty string")
    }
    if (!Buffer.isBuffer(manifestContent) || manifestContent.length > MAX_MANIFEST_BYTES) {
      throw new Error("manifestContent must be a bounded Buffer")
    }
    if (typeof readContent !== "function") throw new Error("readContent must be a function")

    const contextValues = closedOwnDataRecord(values.context, ["expectedOwner", "ownerDirectory"])
    const ownerValues = closedOwnDataRecord(contextValues.expectedOwner, ["id", "version"])
    if (
      typeof ownerValues.id !== "string" || ownerValues.id.length === 0 || ownerValues.id.length > 256 ||
      typeof ownerValues.version !== "string" || ownerValues.version.length === 0 || ownerValues.version.length > 256 ||
      typeof contextValues.ownerDirectory !== "string" || contextValues.ownerDirectory.length === 0 || contextValues.ownerDirectory.length > 2048
    ) {
      throw new Error("context fields must be bounded non-empty strings")
    }
    return {
      manifestPath,
      manifestContent: Buffer.from(manifestContent),
      context: {
        expectedOwner: { id: ownerValues.id, version: ownerValues.version },
        ownerDirectory: contextValues.ownerDirectory
      },
      readContent: readContent as (repositoryPath: string) => Buffer
    }
  } catch {
    diagnostics.push(diagnostic(
      "template.input_invalid",
      `/inputs/${index}`,
      `template mirror input ${index} metadata is invalid`
    ))
    return undefined
  }
}

function parseManifest(
  input: MirrorInputSnapshot,
  diagnostics: WorkflowContractAssetDiagnostic[]
): unknown | undefined {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input.manifestContent)
    return JSON.parse(text)
  } catch {
    diagnostics.push(diagnostic(
      "manifest.invalid_utf8_json",
      input.manifestPath,
      `manifest '${input.manifestPath}' must contain valid UTF-8 JSON`
    ))
    return undefined
  }
}

function withinManifestCollectionLimits(
  manifest: WorkflowContributionManifest,
  manifestPath: string,
  diagnostics: WorkflowContractAssetDiagnostic[]
): boolean {
  if (manifest.workflow_templates.length > MAX_TEMPLATES) {
    diagnostics.push(diagnostic(
      "template.collection_limit",
      `${manifestPath}#/workflow_templates`,
      `workflow template count exceeds ${MAX_TEMPLATES}`
    ))
    return false
  }
  for (let index = 0; index < manifest.workflow_templates.length; index += 1) {
    if (manifest.workflow_templates[index].destinations.length > MAX_DESTINATIONS_PER_TEMPLATE) {
      diagnostics.push(diagnostic(
        "template.collection_limit",
        `${manifestPath}#/workflow_templates/${index}/destinations`,
        `workflow template destination count exceeds ${MAX_DESTINATIONS_PER_TEMPLATE}`
      ))
      return false
    }
  }
  return true
}

function validateMirrors(
  input: ValidatedMirrorInput,
  diagnostics: WorkflowContractAssetDiagnostic[],
  contentBudget: { bytes: number; exceeded: boolean }
): void {
  const templateClaims = new Set(
    input.manifest.workflow_claims.filter((claim) => claim.role === "template").map((claim) => claim.path)
  )
  const destinationClaims = new Set(
    input.manifest.workflow_claims.filter((claim) => claim.role !== "template").map((claim) => claim.path)
  )
  const destinationOwners = new Map<string, string>()
  const sourcePaths = new Set<string>()
  const destinationPaths = new Set<string>()

  for (const [templateIndex, template] of input.manifest.workflow_templates.entries()) {
    const templatePath = `${input.manifestPath}#/workflow_templates/${templateIndex}`
    sourcePaths.add(template.source)
    if (!templateClaims.has(template.source)) {
      diagnostics.push(diagnostic(
        "template.source_unclaimed",
        `${templatePath}/source`,
        `template source '${template.source}' must have a template workflow claim`
      ))
    }
    for (const [destinationIndex, destination] of template.destinations.entries()) {
      destinationPaths.add(destination)
      if (!destinationClaims.has(destination)) {
        diagnostics.push(diagnostic(
          "template.destination_orphan",
          `${templatePath}/destinations/${destinationIndex}`,
          `template destination '${destination}' has no non-template workflow claim`
        ))
      }
      const previous = destinationOwners.get(destination)
      if (previous) {
        diagnostics.push(diagnostic(
          "template.destination_duplicate",
          `${templatePath}/destinations/${destinationIndex}`,
          `template destination '${destination}' is already owned by '${previous}'`
        ))
      } else {
        destinationOwners.set(destination, template.id)
      }
    }
  }

  const bytes = new Map<string, Buffer>()
  for (const repositoryPath of [...new Set([...sourcePaths, ...destinationPaths])].sort(compareCodeUnits)) {
    try {
      const content = input.readContent(repositoryPath)
      if (!Buffer.isBuffer(content)) throw new Error("content is not a Buffer")
      if (content.length > MAX_CONTENT_BYTES) {
        diagnostics.push(diagnostic(
          "template.content_too_large",
          repositoryPath,
          `template mirror content '${repositoryPath}' exceeds ${MAX_CONTENT_BYTES} bytes`
        ))
        continue
      }
      if (contentBudget.bytes + content.length > MAX_TOTAL_CONTENT_BYTES) {
        diagnostics.push(diagnostic(
          "template.content_budget_exceeded",
          repositoryPath,
          `template mirror content exceeds the ${MAX_TOTAL_CONTENT_BYTES}-byte aggregate budget`
        ))
        contentBudget.exceeded = true
        break
      }
      contentBudget.bytes += content.length
      bytes.set(repositoryPath, Buffer.from(content))
    } catch {
      const source = sourcePaths.has(repositoryPath)
      diagnostics.push(diagnostic(
        source ? "template.source_unavailable" : "template.destination_unavailable",
        repositoryPath,
        `${source ? "template source" : "template destination"} '${repositoryPath}' is unavailable as exact bytes`
      ))
    }
  }

  for (const template of input.manifest.workflow_templates) {
    const source = bytes.get(template.source)
    if (!source) continue
    for (const destination of template.destinations) {
      const destinationContent = bytes.get(destination)
      if (destinationContent && !source.equals(destinationContent)) {
        diagnostics.push(diagnostic(
          "template.byte_mismatch",
          destination,
          `template destination '${destination}' differs byte-for-byte from source '${template.source}'`
        ))
      }
    }
  }
}

function snapshotArray(value: unknown, maximumLength: number): unknown[] {
  if (!Array.isArray(value)) throw new Error("value must be an array")
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
  const lengthValue = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined
  if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    throw new Error("array length must be an own data property")
  }
  if (lengthValue > maximumLength) throw new InputLimitError()
  const expectedKeys = new Set(["length", ...Array.from({ length: lengthValue }, (_, index) => String(index))])
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !expectedKeys.has(key))) {
    throw new Error("array shape is not closed")
  }
  const snapshot: unknown[] = []
  for (let index = 0; index < lengthValue; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !("value" in descriptor)) throw new Error("array elements must be own data properties")
    snapshot.push(descriptor.value)
  }
  return snapshot
}

function closedOwnDataRecord(value: unknown, expectedKeys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("value must be an object")
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actualKeys = Reflect.ownKeys(descriptors)
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) throw new Error("object shape is not closed")
  const snapshot: Record<string, unknown> = {}
  for (const key of expectedKeys) {
    const descriptor = descriptors[key]
    if (!descriptor || !("value" in descriptor)) throw new Error(`${key} must be an own data property`)
    snapshot[key] = descriptor.value
  }
  return snapshot
}

class InputLimitError extends Error {}

function manifestDiagnostic(value: ContributionManifestDiagnostic): WorkflowContractAssetDiagnostic {
  return diagnostic(value.code, value.path, value.message)
}

function diagnostic(code: string, path: string, message: string): WorkflowContractAssetDiagnostic {
  return {
    code: boundedDiagnosticText(code),
    path: boundedDiagnosticText(path),
    message: boundedDiagnosticText(message)
  }
}

function result(diagnostics: WorkflowContractAssetDiagnostic[]): WorkflowContractAssetValidationResult {
  const sorted = diagnostics.slice().sort((left, right) => (
    compareCodeUnits(left.path, right.path)
    || compareCodeUnits(left.code, right.code)
    || compareCodeUnits(left.message, right.message)
  )).slice(0, MAX_DIAGNOSTICS)
  return { ok: sorted.length === 0, diagnostics: sorted }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
