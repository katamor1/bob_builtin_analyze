import type { WorkflowCompilerEnvironmentState } from "./compilerEnvironment"
import type { WorkflowPackageDocumentV2 } from "./packageShape"
import type { WorkflowProviderSchemaEvidence } from "./providerContract"
import {
  bindWorkflowProvider,
  type BoundWorkflowProviderDispatchHandle,
  type WorkflowProviderLockEvidence,
  type WorkflowProviderOutputEvidence
} from "./providerRegistry"
import { CompilerSemanticFailure, schemaById, type CompilerSemanticFiles } from "./compilerFiles"
import { snapshotWorkflowLockBob } from "./workflowLockEnvironmentSnapshot"
import type { LockedBobBinding } from "./workflowLockContract"

export interface CompilerProviderBinding {
  readonly id: string
  readonly lockEvidence: WorkflowProviderLockEvidence
  readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
}

export interface CompilerBindings {
  readonly providers: readonly CompilerProviderBinding[]
  readonly bob: LockedBobBinding
}

const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply

export function bindCompilerEnvironment(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles,
  environment: WorkflowCompilerEnvironmentState
): CompilerBindings {
  const providers: CompilerProviderBinding[] = []
  for (let index = 0; index < document.providers.length; index += 1) {
    const declaration = document.providers[index]
    const requirement = objectFreeze({
      id: declaration.id,
      version: declaration.version,
      inputSchema: schemaEvidence(files, declaration.inputSchema, `/providers/${index}/inputSchema`),
      output: declaration.output.kind === "unit"
        ? objectFreeze({ kind: "unit" as const })
        : objectFreeze({
          kind: "value" as const,
          schema: schemaEvidence(files, declaration.output.schema, `/providers/${index}/output/schema`)
        }),
      errorSchema: schemaEvidence(files, declaration.errorSchema, `/providers/${index}/errorSchema`),
      sideEffect: declaration.sideEffect,
      idempotency: declaration.idempotency,
      requiredCapabilities: declaration.requiredCapabilities
    })
    const bound = bindWorkflowProvider({
      catalog: environment.providerCatalog,
      requirement,
      location: objectFreeze({ path: "workflow.yaml", pointer: `/providers/${index}` })
    })
    if (!bound.ok) {
      throw new CompilerSemanticFailure(
        "workflow.yaml",
        `/providers/${index}`,
        "Workflow provider contract does not match the audited catalog.",
        bound.diagnostics
      )
    }
    push(providers, objectFreeze({
      id: declaration.id,
      lockEvidence: bound.lockEvidence,
      dispatchHandle: bound.dispatchHandle
    }))
  }

  validateCommandOutputs(document, providers, files)

  let bob: LockedBobBinding
  try {
    bob = snapshotWorkflowLockBob(document.bob)
  } catch {
    throw new CompilerSemanticFailure(
      "workflow.yaml",
      "/bob/taskCapabilities",
      "Workflow Bob capability evidence is inconsistent."
    )
  }
  return objectFreeze({ providers: objectFreeze(providers), bob })
}

function validateCommandOutputs(
  document: WorkflowPackageDocumentV2,
  providers: readonly CompilerProviderBinding[],
  files: CompilerSemanticFiles
): void {
  for (let stepIndex = 0; stepIndex < document.steps.length; stepIndex += 1) {
    const step = document.steps[stepIndex]
    if (step.type !== "command") continue
    const provider = findProvider(providers, step.provider)
    if (provider === undefined) {
      throw new CompilerSemanticFailure(
        "workflow.yaml",
        `/steps/${stepIndex}/provider`,
        "Workflow command provider is not bound."
      )
    }
    const output = provider.lockEvidence.output
    if (step.output.kind !== output.kind) {
      throw new CompilerSemanticFailure(
        "workflow.yaml",
        `/steps/${stepIndex}/output/kind`,
        "Workflow command output kind does not match the provider contract."
      )
    }
    if (step.output.kind === "value" && output.kind === "value") {
      const schema = schemaEvidence(files, step.output.schema, `/steps/${stepIndex}/output/schema`)
      if (!sameSchemaEvidence(schema, output.schema)) {
        throw new CompilerSemanticFailure(
          "workflow.yaml",
          `/steps/${stepIndex}/output/schema`,
          "Workflow command output schema does not match the provider contract."
        )
      }
    }
  }
}

function schemaEvidence(
  files: CompilerSemanticFiles,
  id: string,
  pointer: string
): WorkflowProviderSchemaEvidence {
  const schema = schemaById(files, id, pointer)
  return objectFreeze({ id: schema.id, bytes: schema.bytes, digest: schema.digest })
}

function sameSchemaEvidence(
  left: WorkflowProviderSchemaEvidence,
  right: WorkflowProviderSchemaEvidence
): boolean {
  return left.id === right.id && left.bytes === right.bytes && left.digest === right.digest
}

function findProvider(
  values: readonly CompilerProviderBinding[],
  id: string
): CompilerProviderBinding | undefined {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].id === id) return values[index]
  }
  return undefined
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
