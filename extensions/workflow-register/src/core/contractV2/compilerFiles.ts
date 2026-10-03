import { TextDecoder as NodeTextDecoder } from "node:util"

import { canonicalJsonBytes, canonicalJsonDigest } from "./canonicalJson"
import type { WorkflowContractV2Diagnostic } from "./diagnostics"
import {
  WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
  type LocalJsonSchemaSource
} from "./jsonSchema"
import {
  compileLocalJsonSchemaCatalog,
  inspectLocalJsonSchemaViewDocumentDependencies,
  type CompiledLocalJsonSchemaView,
  type CompiledLocalJsonSchemaViewRoot
} from "./jsonSchemaCatalog"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"
import {
  createLocalJsonSchemaRoleHandle,
  type LocalJsonSchemaRoleHandle
} from "./jsonSchemaRole"
import { parseStrictJson } from "./packageLoaderInput"
import type { WorkflowPackageDocumentV2 } from "./packageShape"
import type { Sha256Digest } from "./providerContract"
import {
  workflowLockFileByPath,
  type WorkflowLockRawPackageSnapshot
} from "./workflowLockSnapshot"

export class CompilerSemanticFailure extends Error {
  constructor(
    readonly path: string,
    readonly pointer: string,
    message: string,
    readonly diagnostics?: readonly WorkflowContractV2Diagnostic[]
  ) {
    super(message)
  }
}

export interface CompilerPromptEvidence {
  readonly id: string
  readonly path: string
  readonly text: string
  readonly digest: Sha256Digest
  readonly normalizedBytes: Uint8Array
}

export interface CompilerSchemaEvidence {
  readonly id: string
  readonly dialect: typeof WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT
  readonly digest: Sha256Digest
  readonly bytes: number
  readonly role: LocalJsonSchemaRoleHandle
  readonly compiled: CompiledLocalJsonSchemaView
}

export interface CompilerSemanticFiles {
  readonly prompts: readonly CompilerPromptEvidence[]
  readonly schemas: readonly CompilerSchemaEvidence[]
  readonly schemaCatalogDigest: Sha256Digest
}

const TextDecoderConstructor = NodeTextDecoder
const textDecoderDecode = NodeTextDecoder.prototype.decode
const arrayPush = Array.prototype.push
const arraySort = Array.prototype.sort
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply
const stringEndsWith = String.prototype.endsWith
const stringReplace = String.prototype.replace
const stringSlice = String.prototype.slice
const stringStartsWith = String.prototype.startsWith
const Uint8ArrayConstructor = Uint8Array

export function compileSemanticFiles(
  rawPackage: WorkflowLockRawPackageSnapshot,
  document: WorkflowPackageDocumentV2
): CompilerSemanticFiles {
  const promptReferences = collectPromptReferences(document)
  const schemaReferences = collectSchemaReferences(document)
  const promptPaths: string[] = []
  const schemaPaths: string[] = []
  for (let index = 0; index < rawPackage.files.length; index += 1) {
    const path = rawPackage.files[index].path
    if (startsWith(path, "prompts/") && endsWith(path, ".md")) push(promptPaths, path)
    if (startsWith(path, "schemas/") && endsWith(path, ".json")) push(schemaPaths, path)
  }
  sortText(promptPaths)
  sortText(schemaPaths)
  assertExactReferenceSet(promptReferences, promptPaths, "prompt")
  assertReferenceSubset(schemaReferences, schemaPaths, "schema")

  const prompts: CompilerPromptEvidence[] = []
  for (let index = 0; index < promptPaths.length; index += 1) {
    const path = promptPaths[index]
    const file = workflowLockFileByPath(rawPackage, path)
    if (file === undefined) throw new CompilerSemanticFailure(path, "", "Workflow prompt is missing.")
    const text = decodePrompt(file.bytes, path)
    const normalizedBytes = reflectApply(bufferFrom, BufferConstructor, [text, "utf8"]) as Buffer
    push(prompts, objectFreeze({
      id: slice(path, "prompts/".length, path.length - ".md".length),
      path,
      text,
      digest: file.digest,
      normalizedBytes: new Uint8ArrayConstructor(normalizedBytes)
    }))
  }

  const schemaSources: LocalJsonSchemaSource[] = []
  const schemaCanonical: { readonly id: string; readonly bytes: number; readonly digest: Sha256Digest }[] = []
  for (let index = 0; index < schemaPaths.length; index += 1) {
    const path = schemaPaths[index]
    const file = workflowLockFileByPath(rawPackage, path)
    if (file === undefined) throw new CompilerSemanticFailure(path, "", "Workflow schema is missing.")
    let parsed: JsonValue
    try {
      parsed = cloneAndFreezeJsonValue(parseStrictJson(file.bytes, "Workflow local schema"))
    } catch {
      throw new CompilerSemanticFailure(path, "", "Workflow local schema is invalid JSON.")
    }
    const canonical = canonicalJsonBytes(parsed)
    push(schemaCanonical, objectFreeze({
      id: path,
      bytes: canonical.byteLength,
      digest: canonicalJsonDigest(parsed) as Sha256Digest
    }))
    push(schemaSources, objectFreeze({
      id: path,
      schema: parsed,
      location: objectFreeze({ path, pointer: "" })
    }))
  }

  let compiledRoots: readonly CompiledLocalJsonSchemaViewRoot[] = objectFreeze([])
  if (schemaPaths.length > 0) {
    const compiled = compileLocalJsonSchemaCatalog({
      rootIds: objectFreeze(schemaPaths),
      schemas: objectFreeze(schemaSources),
      diagnosticCode: "WF2_PACKAGE_LAYOUT_INVALID",
      location: objectFreeze({ path: "workflow.yaml", pointer: "" })
    })
    if (!compiled.ok) {
      throw new CompilerSemanticFailure(
        "workflow.yaml",
        "",
        "Workflow local schema catalog failed compilation.",
        compiled.diagnostics
      )
    }
    compiledRoots = compiled.roots
  }

  const schemas: CompilerSchemaEvidence[] = []
  for (let index = 0; index < schemaPaths.length; index += 1) {
    const id = schemaPaths[index]
    const root = findCompiledRoot(compiledRoots, id)
    const canonical = findById(schemaCanonical, id)
    const source = findById(schemaSources, id)
    if (root === undefined || canonical === undefined || source === undefined) {
      throw new CompilerSemanticFailure(id, "", "Workflow local schema evidence is unavailable.")
    }
    const ownEvidence = findSchemaEvidence(root.compiled.evidence.schemas, id)
    if (ownEvidence === undefined || ownEvidence.schemaDigest !== canonical.digest) {
      throw new CompilerSemanticFailure(id, "", "Workflow local schema digest evidence does not match.")
    }
    push(schemas, objectFreeze({
      id,
      dialect: WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
      digest: canonical.digest,
      bytes: canonical.bytes,
      role: createLocalJsonSchemaRoleHandle({
        compiled: root.compiled,
        schema: source.schema
      }),
      compiled: root.compiled
    }))
  }

  const reachableSchemaIds: string[] = []
  for (let index = 0; index < schemaReferences.length; index += 1) {
    const root = findById(schemas, schemaReferences[index])
    if (root === undefined) {
      throw new CompilerSemanticFailure("workflow.yaml", "", "Workflow references a missing local schema.")
    }
    const dependencies = inspectLocalJsonSchemaViewDocumentDependencies({ compiled: root.compiled })
    for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) {
      pushUnique(reachableSchemaIds, dependencies[dependencyIndex])
    }
  }
  sortText(reachableSchemaIds)
  assertExactReferenceSet(reachableSchemaIds, schemaPaths, "schema")

  const publicSchemas: { readonly dialect: string; readonly id: string; readonly digest: Sha256Digest }[] = []
  for (let index = 0; index < schemas.length; index += 1) {
    push(publicSchemas, objectFreeze({
      dialect: schemas[index].dialect,
      id: schemas[index].id,
      digest: schemas[index].digest
    }))
  }
  return objectFreeze({
    prompts: objectFreeze(prompts),
    schemas: objectFreeze(schemas),
    schemaCatalogDigest: canonicalJsonDigest(objectFreeze({
      dialect: WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
      schemas: objectFreeze(publicSchemas)
    })) as Sha256Digest
  })
}

export function schemaById(
  files: CompilerSemanticFiles,
  id: string,
  pointer: string
): CompilerSchemaEvidence {
  for (let index = 0; index < files.schemas.length; index += 1) {
    if (files.schemas[index].id === id) return files.schemas[index]
  }
  throw new CompilerSemanticFailure("workflow.yaml", pointer, "Workflow references a missing local schema.")
}

function collectPromptReferences(document: WorkflowPackageDocumentV2): readonly string[] {
  const values: string[] = []
  for (let index = 0; index < document.steps.length; index += 1) {
    const step = document.steps[index]
    if ((step.type === "agent" || step.type === "manual") && typeof step.prompt === "string") {
      pushUnique(values, step.prompt)
    }
  }
  sortText(values)
  return objectFreeze(values)
}

function collectSchemaReferences(document: WorkflowPackageDocumentV2): readonly string[] {
  const values: string[] = []
  for (let index = 0; index < document.inputs.length; index += 1) pushUnique(values, document.inputs[index].schema)
  for (let index = 0; index < document.providers.length; index += 1) {
    const provider = document.providers[index]
    pushUnique(values, provider.inputSchema)
    pushUnique(values, provider.errorSchema)
    if (provider.output.kind === "value") pushUnique(values, provider.output.schema)
  }
  for (let index = 0; index < document.steps.length; index += 1) {
    const step = document.steps[index]
    if ("output" in step && step.output.kind === "value") pushUnique(values, step.output.schema)
  }
  for (let index = 0; index < document.requiredArtifacts.length; index += 1) {
    pushUnique(values, document.requiredArtifacts[index].schema)
  }
  sortText(values)
  return objectFreeze(values)
}

function assertReferenceSubset(
  referenced: readonly string[],
  physical: readonly string[],
  kind: "prompt" | "schema"
): void {
  for (let index = 0; index < referenced.length; index += 1) {
    if (!contains(physical, referenced[index])) {
      throw new CompilerSemanticFailure(
        referenced[index] ?? "workflow.yaml",
        "",
        `Workflow ${kind} reference is missing from the package.`
      )
    }
  }
}

function assertExactReferenceSet(
  referenced: readonly string[],
  physical: readonly string[],
  kind: "prompt" | "schema"
): void {
  const maximum = referenced.length > physical.length ? referenced.length : physical.length
  for (let index = 0; index < maximum; index += 1) {
    if (referenced[index] !== physical[index]) {
      const path = physical[index] ?? referenced[index] ?? "workflow.yaml"
      throw new CompilerSemanticFailure(path, "", `Workflow ${kind} references and package files do not match.`)
    }
  }
}

function decodePrompt(bytes: Uint8Array, path: string): string {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new CompilerSemanticFailure(path, "", "Workflow prompt must not contain a UTF-8 byte-order mark.")
  }
  let text: string
  try {
    const decoder = new TextDecoderConstructor("utf-8", { fatal: true, ignoreBOM: true })
    text = reflectApply(textDecoderDecode, decoder, [bytes]) as string
  } catch {
    throw new CompilerSemanticFailure(path, "", "Workflow prompt must be valid UTF-8.")
  }
  return reflectApply(stringReplace, text, [/\r\n?/gu, "\n"]) as string
}

function startsWith(value: string, prefix: string): boolean {
  return reflectApply(stringStartsWith, value, [prefix]) as boolean
}

function endsWith(value: string, suffix: string): boolean {
  return reflectApply(stringEndsWith, value, [suffix]) as boolean
}

function slice(value: string, start: number, end: number): string {
  return reflectApply(stringSlice, value, [start, end]) as string
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}

function sortText(values: string[]): void {
  reflectApply(arraySort, values, [(left: string, right: string) => left < right ? -1 : left > right ? 1 : 0])
}

function pushUnique(values: string[], value: string): void {
  if (!contains(values, value)) push(values, value)
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function findById<T extends { readonly id: string }>(values: readonly T[], id: string): T | undefined {
  for (let index = 0; index < values.length; index += 1) if (values[index].id === id) return values[index]
  return undefined
}

function findCompiledRoot(
  values: readonly CompiledLocalJsonSchemaViewRoot[],
  id: string
): CompiledLocalJsonSchemaViewRoot | undefined {
  for (let index = 0; index < values.length; index += 1) if (values[index].id === id) return values[index]
  return undefined
}

function findSchemaEvidence(
  values: readonly { readonly id: string; readonly schemaDigest: string }[],
  id: string
): { readonly id: string; readonly schemaDigest: string } | undefined {
  for (let index = 0; index < values.length; index += 1) if (values[index].id === id) return values[index]
  return undefined
}
