import {
  inspectLocalJsonSchemaInstancePointer,
  validateLocalJsonSchemaValue,
  type LocalJsonSchemaInstanceKind
} from "./jsonSchema"
import { type JsonValue } from "./jsonValue"
import type { WorkflowManualFieldV2, WorkflowPackageDocumentV2 } from "./packageShape"
import { CompilerSemanticFailure, schemaById, type CompilerSemanticFiles } from "./compilerFiles"

const arrayIsArray = Array.isArray
const arrayPush = Array.prototype.push
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const stringEndsWith = String.prototype.endsWith
const stringStartsWith = String.prototype.startsWith
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
    const result = validateLocalJsonSchemaValue({
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
    const root = requireJsonObject(schema.document, `/steps/${stepIndex}/output/schema`)
    if (root.type !== "object" || root.additionalProperties !== false) {
      fail(`/steps/${stepIndex}/output/schema`, "Workflow manual output schema must be a closed object.")
    }
    const properties = requireJsonObject(root.properties, `/steps/${stepIndex}/output/schema`)
    const expectedFields: { readonly id: string; readonly required: boolean; readonly field?: WorkflowManualFieldV2 }[] = []
    if (step.form !== undefined) {
      for (let index = 0; index < step.form.fields.length; index += 1) {
        const field = step.form.fields[index]
        push(expectedFields, { id: field.id, required: field.required, field })
      }
    }
    if (step.approval !== undefined) push(expectedFields, { id: "decision", required: true })

    const propertyKeys = objectKeys(properties)
    sortText(propertyKeys)
    const expectedKeys: string[] = []
    for (let index = 0; index < expectedFields.length; index += 1) push(expectedKeys, expectedFields[index].id)
    sortText(expectedKeys)
    if (!sameStrings(propertyKeys, expectedKeys)) {
      fail(`/steps/${stepIndex}/output/schema`, "Workflow manual output properties do not match the declared form.")
    }

    const required = readStringArray(root.required)
    const expectedRequired: string[] = []
    for (let index = 0; index < expectedFields.length; index += 1) {
      if (expectedFields[index].required) push(expectedRequired, expectedFields[index].id)
    }
    sortText(required)
    sortText(expectedRequired)
    if (!sameStrings(required, expectedRequired)) {
      fail(`/steps/${stepIndex}/output/schema`, "Workflow manual output required properties do not match the declared form.")
    }

    for (let fieldIndex = 0; fieldIndex < expectedFields.length; fieldIndex += 1) {
      const entry = expectedFields[fieldIndex]
      const property = requireJsonObject(properties[entry.id], `/steps/${stepIndex}/output/schema`)
      if (entry.id === "decision") {
        if (property.type !== "string" || !sameStrings(readStringArray(property.enum), ["approved", "rejected"])) {
          fail(`/steps/${stepIndex}/approval`, "Workflow manual approval schema does not match the decision contract.")
        }
        continue
      }
      const field = entry.field as WorkflowManualFieldV2
      if (field.type === "string") {
        if (property.type !== "string") fail(`/steps/${stepIndex}/form/fields/${fieldIndex}/type`, "Workflow form field schema kind does not match.")
      } else if (field.type === "number") {
        if (property.type !== "number") fail(`/steps/${stepIndex}/form/fields/${fieldIndex}/type`, "Workflow form field schema kind does not match.")
      } else if (field.type === "boolean") {
        if (property.type !== "boolean") fail(`/steps/${stepIndex}/form/fields/${fieldIndex}/type`, "Workflow form field schema kind does not match.")
      } else {
        if (
          property.type !== "string"
          || !sameStrings(readStringArray(property.enum), [...field.options])
        ) {
          fail(`/steps/${stepIndex}/form/fields/${fieldIndex}/options`, "Workflow select options do not match the output schema.")
        }
      }
    }
  }
}

function validateArtifactSchemas(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): void {
  for (let index = 0; index < document.requiredArtifacts.length; index += 1) {
    const artifact = document.requiredArtifacts[index]
    const schema = schemaById(files, artifact.schema, `/requiredArtifacts/${index}/schema`)
    const result = inspectLocalJsonSchemaInstancePointer({ compiled: schema.compiled, pointer: "" })
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

function requireJsonObject(value: unknown, pointer: string): Readonly<Record<string, JsonValue>> {
  if (value === null || typeof value !== "object" || arrayIsArray(value)) {
    fail(pointer, "Workflow schema role requires an object schema.")
  }
  return value as Readonly<Record<string, JsonValue>>
}

function readStringArray(value: unknown): string[] {
  if (!arrayIsArray(value)) return []
  const result: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") return []
    push(result, value[index])
  }
  return result
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

function sortText(values: string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && values[insertion - 1] > value) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

function fail(pointer: string, message: string): never {
  throw new CompilerSemanticFailure("workflow.yaml", pointer, message)
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
