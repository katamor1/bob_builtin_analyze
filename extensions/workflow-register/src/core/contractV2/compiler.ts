import { types as utilTypes } from "node:util"

import {
  createCompiledWorkflowPlanHandle,
  type CompiledWorkflowPlanHandle
} from "./compiledPlan"
import {
  requireWorkflowCompilerEnvironmentState,
  type WorkflowCompilerEnvironment
} from "./compilerEnvironment"
import { bindCompilerEnvironment } from "./compilerBindings"
import {
  CompilerSemanticFailure,
  compileSemanticFiles
} from "./compilerFiles"
import { validateCompilerValueReferences } from "./compilerReferences"
import { validateCompilerSchemaRoles } from "./compilerSchemaRoles"
import { compileWorkflowExecution } from "./compilerWorkflow"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic
} from "./diagnostics"
import type { RawWorkflowPackage } from "./packageLoaderContract"
import { validateWorkflowContractV2PackageShape } from "./packageShape"
import {
  verifyWorkflowPackageLock,
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  WORKFLOW_COMPILER_POLICY_VERSIONS
} from "./workflowLock"
import {
  snapshotWorkflowLockGenerationRawPackage,
  workflowLockFileByPath
} from "./workflowLockSnapshot"
import { parseWorkflowContractV2Yaml } from "./yamlDocument"

export interface CompileWorkflowPackageInput {
  readonly rawPackage: RawWorkflowPackage
  readonly environment: WorkflowCompilerEnvironment
}

export type WorkflowPackageCompileResult =
  | {
      readonly ok: true
      readonly handle: CompiledWorkflowPlanHandle
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

const isProxy = utilTypes.isProxy
const arrayPush = Array.prototype.push
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const INPUT_FIELDS = objectFreeze(["rawPackage", "environment"] as const)
const RAW_PACKAGE_FIELDS = objectFreeze([
  "publication", "workflowId", "generation", "packageDigest", "files"
] as const)
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []

export function compileWorkflowPackage(input: CompileWorkflowPackageInput): WorkflowPackageCompileResult {
  let outer: Readonly<Record<"rawPackage" | "environment", unknown>>
  try {
    outer = snapshotExactRecord(input, INPUT_FIELDS, "Workflow compiler input")
  } catch {
    return failure("WF2_PACKAGE_LAYOUT_INVALID", "workflow.yaml", "", "Workflow package compiler input is invalid.")
  }

  const environment = outer.environment as WorkflowCompilerEnvironment
  const environmentState = requireWorkflowCompilerEnvironmentState(environment)

  try {
    const rawInput = snapshotCompilerRawPackageInput(outer.rawPackage)
    const rawIdentity = rawInput
    const rawPackage = snapshotWorkflowLockGenerationRawPackage(rawInput.rawPackage)
    const workflowFile = workflowLockFileByPath(rawPackage, "workflow.yaml")
    if (workflowFile === undefined) {
      return failure("WF2_PACKAGE_LAYOUT_INVALID", "workflow.yaml", "", "Workflow package is missing workflow.yaml.")
    }

    const parsed = parseWorkflowContractV2Yaml({
      bytes: reflectApply(bufferFrom, BufferConstructor, [workflowFile.bytes]) as Buffer,
      path: "workflow.yaml"
    })
    if (!parsed.ok) return objectFreeze({ ok: false as const, diagnostics: parsed.diagnostics })

    const shaped = validateWorkflowContractV2PackageShape({
      document: parsed.document,
      path: "workflow.yaml"
    })
    if (!shaped.ok) return objectFreeze({ ok: false as const, diagnostics: shaped.diagnostics })
    const document = shaped.value
    if (document.id !== rawPackage.workflowId) {
      throw new CompilerSemanticFailure(
        "workflow.yaml",
        "/id",
        "Workflow document id does not match the package slot id."
      )
    }

    const semanticFiles = compileSemanticFiles(rawPackage, document)
    validateCompilerValueReferences(document, semanticFiles)
    validateCompilerSchemaRoles(document, semanticFiles)
    const execution = compileWorkflowExecution(document, semanticFiles)
    const bindings = bindCompilerEnvironment(document, semanticFiles, environmentState)

    const providerEvidence: typeof bindings.providers[number]["lockEvidence"][] = []
    for (let index = 0; index < bindings.providers.length; index += 1) {
      push(providerEvidence, bindings.providers[index].lockEvidence)
    }
    let verified: ReturnType<typeof verifyWorkflowPackageLock>
    try {
      verified = verifyWorkflowPackageLock({
        rawPackage: rawPackage as unknown as RawWorkflowPackage,
        providers: providerEvidence,
        bob: document.bob
      })
    } catch {
      return failure("WF2_LOCK_MISMATCH", "workflow.lock.json", "", "Workflow package lock does not match compiled evidence.")
    }
    if (!verified.ok) return objectFreeze({ ok: false as const, diagnostics: verified.diagnostics })

    const publicPrompts: { readonly id: string; readonly text: string; readonly digest: string }[] = []
    const privatePrompts: { readonly id: string; readonly bytes: Uint8Array }[] = []
    for (let index = 0; index < semanticFiles.prompts.length; index += 1) {
      const prompt = semanticFiles.prompts[index]
      push(publicPrompts, objectFreeze({ id: prompt.id, text: prompt.text, digest: prompt.digest }))
      push(privatePrompts, objectFreeze({ id: prompt.id, bytes: prompt.normalizedBytes }))
    }

    const publicSchemas: { readonly dialect: string; readonly id: string; readonly digest: string }[] = []
    const privateSchemas: { readonly id: string; readonly compiled: typeof semanticFiles.schemas[number]["compiled"] }[] = []
    for (let index = 0; index < semanticFiles.schemas.length; index += 1) {
      const schema = semanticFiles.schemas[index]
      push(publicSchemas, objectFreeze({ dialect: schema.dialect, id: schema.id, digest: schema.digest }))
      push(privateSchemas, objectFreeze({ id: schema.id, compiled: schema.compiled }))
    }

    const privateProviders: {
      readonly id: string
      readonly dispatchHandle: typeof bindings.providers[number]["dispatchHandle"]
    }[] = []
    for (let index = 0; index < bindings.providers.length; index += 1) {
      push(privateProviders, objectFreeze({
        id: bindings.providers[index].id,
        dispatchHandle: bindings.providers[index].dispatchHandle
      }))
    }

    const plan = objectFreeze({
      schemaVersion: "workflow-compiled-plan/v2" as const,
      compilerContractVersion: WORKFLOW_COMPILER_CONTRACT_VERSION,
      policyVersions: WORKFLOW_COMPILER_POLICY_VERSIONS,
      workflowId: document.id,
      packageDigest: rawPackage.packageDigest,
      lockfileDigest: verified.lockfileDigest,
      environmentDigest: verified.lock.environmentDigest,
      workflow: execution.workflow,
      prompts: objectFreeze(publicPrompts),
      schemas: objectFreeze(publicSchemas),
      schemaCatalogDigest: semanticFiles.schemaCatalogDigest,
      predicates: execution.predicates,
      providerBindings: verified.lock.providers,
      bobProfileBinding: verified.lock.bob,
      requiredArtifacts: document.requiredArtifacts
    })

    const handle = createCompiledWorkflowPlanHandle({
      environment,
      publication: rawIdentity.publication,
      generation: rawIdentity.generation,
      plan,
      prompts: objectFreeze(privatePrompts),
      schemas: objectFreeze(privateSchemas),
      providers: objectFreeze(privateProviders)
    })
    return objectFreeze({ ok: true as const, handle, diagnostics: EMPTY_DIAGNOSTICS })
  } catch (error) {
    if (error instanceof CompilerSemanticFailure) {
      if (error.diagnostics !== undefined) {
        return objectFreeze({ ok: false as const, diagnostics: error.diagnostics })
      }
      return failure("WF2_PACKAGE_LAYOUT_INVALID", error.path, error.pointer, error.message)
    }
    return failure("WF2_PACKAGE_LAYOUT_INVALID", "workflow.yaml", "", "Workflow package compilation failed.")
  }
}

function snapshotCompilerRawPackageInput(value: unknown): {
  readonly publication: "published" | "staging"
  readonly generation: string
  readonly rawPackage: RawWorkflowPackage
} {
  const record = snapshotExactRecord(value, RAW_PACKAGE_FIELDS, "Workflow raw package")
  const publication = record.publication
  const generation = record.generation
  if ((publication !== "published" && publication !== "staging") || typeof generation !== "string") {
    throw new TypeError("Workflow raw package identity is invalid.")
  }
  return objectFreeze({
    publication,
    generation,
    rawPackage: record as unknown as RawWorkflowPackage
  })
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be an ordinary record.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !includes(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  for (let index = 0; index < fields.length; index += 1) {
    result[fields[index]] = dataValue(descriptors, fields[index], label)
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function dataValue(descriptors: PropertyDescriptorMap, key: string, label: string): unknown {
  const descriptor = descriptors[key]
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError(`${label}.${key} must be an enumerable own data property.`)
  return descriptor.value
}

function failure(
  code: WorkflowContractV2Diagnostic["code"],
  path: string,
  pointer: string,
  message: string
): WorkflowPackageCompileResult {
  const diagnostic = createWorkflowContractV2Diagnostic({
    code,
    severity: "error",
    message,
    location: objectFreeze({ path, pointer })
  })
  return objectFreeze({ ok: false as const, diagnostics: objectFreeze([diagnostic]) })
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
