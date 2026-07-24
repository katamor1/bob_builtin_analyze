import type { LocalJsonSchemaInstanceKind } from "./jsonSchema"
import {
  inspectLocalJsonSchemaViewInstancePointer,
  validateLocalJsonSchemaViewValue
} from "./jsonSchemaCatalog"
import {
  validateLocalJsonSchemaManualContract,
  type LocalJsonSchemaManualFieldContract
} from "./jsonSchemaRole"
import type { WorkflowManualFieldV2, WorkflowPackageDocumentV2 } from "./packageShape"
import { CompilerSemanticFailure, schemaById, type CompilerSemanticFiles } from "./compilerFiles"

const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const objectHasOwn = Object.hasOwn
const stringEndsWith = String.prototype.endsWith
const reflectApply = Reflect.apply

export function validateCompilerSchemaRoles(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): void {
  validateInputDefaults(document, files)
  validateManualSchemas(document, files)
  validateArtifactSchemas(document, files)
}

function validateInputDefaults(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): void {
  for (let index = 0; index < document.inputs.length; index += 1) {
    const input = document.inputs[index]
    if (!objectHasOwn(input, "default")) continue
    const schema = schemaById(files, input.schema, `/inputs/${index}/schema`)
    const result = validateLocalJsonSchemaViewValue({
      compiled: schema.compiled,
      value: input.default,
      diagnosticCode: "WF2_PACKAGE_LAYOUT_INVALID",
      location: { path: "workflow.yaml", pointer: `/inputs/${index}/default` }
    })
    if (!result.ok) {
      throw new CompilerSemanticFailure(
        "workflow.yaml",
        `/inputs/${index}/default`,
        "Workflow input default does not match its schema.",
        result.diagnostics
      )
    }
  }
}

function validateManualSchemas(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): void {
  for (let stepIndex = 0; stepIndex < document.steps.length; stepIndex += 1) {
    const step = document.steps[stepIndex]
    if (step.type !== "manual") continue
    const schema = schemaById(files, step.output.schema, `/steps/${stepIndex}/output/schema`)
    const fields: LocalJsonSchemaManualFieldContract[] = []
    if (step.form !== undefined) {
      for (let index = 0; index < step.form.fields.length; index += 1) {
        push(fields, manualFieldContract(step.form.fields[index]))
      }
    }
    if (step.approval !== undefined) {
      push(fields, objectFreeze({
        id: "decision" as const,
        required: true as const,
        kind: "approval" as const
      }))
    }

    const result = validateLocalJsonSchemaManualContract({
      role: schema.role,
      fields: objectFreeze(fields)
    })
    if (result.ok) continue
    if (result.reason === "approval") {
      fail(`/steps/${stepIndex}/approval`, "Workflow manual approval schema does not match the decision contract.")
    }
    if (result.reason === "field-options" && result.fieldIndex !== undefined) {
      fail(
        `/steps/${stepIndex}/form/fields/${result.fieldIndex}/options`,
        "Workflow select options do not match the output schema."
      )
    }
    if (result.reason === "field-type" && result.fieldIndex !== undefined) {
      fail(
        `/steps/${stepIndex}/form/fields/${result.fieldIndex}/type`,
        "Workflow form field schema kind does not match."
      )
    }
    fail(`/steps/${stepIndex}/output/schema`, "Workflow manual output schema does not match the declared form.")
  }
}

function manualFieldContract(field: WorkflowManualFieldV2): LocalJsonSchemaManualFieldContract {
  if (field.type === "select") {
    return objectFreeze({
      id: field.id,
      required: field.required,
      kind: "select" as const,
      options: field.options
    })
  }
  return objectFreeze({
    id: field.id,
    required: field.required,
    kind: field.type
  })
}

function validateArtifactSchemas(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): void {
  for (let index = 0; index < document.requiredArtifacts.length; index += 1) {
    const artifact = document.requiredArtifacts[index]
    const schema = schemaById(files, artifact.schema, `/requiredArtifacts/${index}/schema`)
    const result = inspectLocalJsonSchemaViewInstancePointer({ compiled: schema.compiled, pointer: "" })
    if (!result.ok) {
      fail(`/requiredArtifacts/${index}/schema`, "Workflow artifact schema root is unresolved.")
    }
    if (isJsonMediaType(artifact.mediaType)) continue
    if (!sameKinds(result.kinds, ["string"])) {
      fail(`/requiredArtifacts/${index}/schema`, "Workflow text and binary artifact schemas must accept strings.")
    }
  }
}

function isJsonMediaType(mediaType: string): boolean {
  return mediaType === "application/json"
    || reflectApply(stringEndsWith, mediaType, ["+json"]) as boolean
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function sameKinds(
  left: readonly LocalJsonSchemaInstanceKind[],
  right: readonly LocalJsonSchemaInstanceKind[]
): boolean {
  return sameStrings(left, right)
}

function fail(pointer: string, message: string): never {
  throw new CompilerSemanticFailure("workflow.yaml", pointer, message)
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
