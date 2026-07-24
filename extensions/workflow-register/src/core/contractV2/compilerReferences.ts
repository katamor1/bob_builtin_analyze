import { inspectLocalJsonSchemaViewInstancePointer } from "./jsonSchemaCatalog"
import type { WorkflowPackageDocumentV2, WorkflowValueTemplateV2 } from "./packageShape"
import { CompilerSemanticFailure, schemaById, type CompilerSemanticFiles } from "./compilerFiles"

interface WorkflowReference {
  readonly source: "input" | "committedOutput"
  readonly id: string
  readonly pointer: string
}

interface InputBinding {
  readonly id: string
  readonly schemaId: string
}

interface OutputBinding {
  readonly id: string
  readonly schemaId: string
  readonly stepIndex: number
}

interface ReferenceEnvironment {
  readonly inputs: readonly InputBinding[]
  readonly outputs: readonly OutputBinding[]
}

const arrayPop = Array.prototype.pop
const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const objectKeys = Object.keys
const reflectApply = Reflect.apply
const stringReplace = String.prototype.replace

export function validateCompilerValueReferences(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): void {
  const environment = createReferenceEnvironment(document)
  for (let stepIndex = 0; stepIndex < document.steps.length; stepIndex += 1) {
    const step = document.steps[stepIndex]
    if (step.type === "command") {
      validateTemplate(step.input, `/steps/${stepIndex}/input`, stepIndex, files, environment)
      continue
    }
    if (step.type === "agent") {
      for (let contextIndex = 0; contextIndex < step.context.length; contextIndex += 1) {
        validateReference(
          step.context[contextIndex],
          `/steps/${stepIndex}/context/${contextIndex}`,
          stepIndex,
          files,
          environment
        )
      }
      continue
    }
    if (step.type === "result" && step.source.source !== "literal") {
      validateReference(step.source, `/steps/${stepIndex}/source`, stepIndex, files, environment)
    }
  }
}

function createReferenceEnvironment(document: WorkflowPackageDocumentV2): ReferenceEnvironment {
  const inputs: InputBinding[] = []
  const outputs: OutputBinding[] = []
  for (let index = 0; index < document.inputs.length; index += 1) {
    push(inputs, objectFreeze({
      id: document.inputs[index].id,
      schemaId: document.inputs[index].schema
    }))
  }
  for (let index = 0; index < document.steps.length; index += 1) {
    const step = document.steps[index]
    if (!("output" in step) || step.output.kind !== "value") continue
    push(outputs, objectFreeze({
      id: step.output.id,
      schemaId: step.output.schema,
      stepIndex: index
    }))
  }
  return objectFreeze({ inputs: objectFreeze(inputs), outputs: objectFreeze(outputs) })
}

function validateTemplate(
  root: WorkflowValueTemplateV2,
  rootPointer: string,
  stepIndex: number,
  files: CompilerSemanticFiles,
  environment: ReferenceEnvironment
): void {
  const stack: { readonly value: WorkflowValueTemplateV2; readonly pointer: string }[] = []
  push(stack, objectFreeze({ value: root, pointer: rootPointer }))
  while (stack.length > 0) {
    const entry = pop(stack)
    if (entry === undefined) break
    const value = entry.value
    if (value.source === "input" || value.source === "committedOutput") {
      validateReference(value, entry.pointer, stepIndex, files, environment)
      continue
    }
    if (value.source === "array") {
      for (let index = value.items.length - 1; index >= 0; index -= 1) {
        push(stack, objectFreeze({
          value: value.items[index],
          pointer: `${entry.pointer}/items/${index}`
        }))
      }
      continue
    }
    if (value.source === "object") {
      const keys = objectKeys(value.properties)
      sortText(keys)
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]
        push(stack, objectFreeze({
          value: value.properties[key],
          pointer: `${entry.pointer}/properties/${escapePointer(key)}`
        }))
      }
    }
  }
}

function validateReference(
  reference: WorkflowReference,
  pointer: string,
  stepIndex: number,
  files: CompilerSemanticFiles,
  environment: ReferenceEnvironment
): void {
  let schemaId: string | undefined
  if (reference.source === "input") {
    schemaId = findInput(environment.inputs, reference.id)?.schemaId
  } else {
    const output = findOutput(environment.outputs, reference.id)
    if (output !== undefined && output.stepIndex < stepIndex) schemaId = output.schemaId
  }
  if (schemaId === undefined) {
    throw new CompilerSemanticFailure(
      "workflow.yaml",
      `${pointer}/id`,
      "Workflow value reference is not visible at this lexical position."
    )
  }
  const schema = schemaById(files, schemaId, `${pointer}/id`)
  const inspected = inspectLocalJsonSchemaViewInstancePointer({
    compiled: schema.compiled,
    pointer: reference.pointer
  })
  if (!inspected.ok) {
    throw new CompilerSemanticFailure(
      "workflow.yaml",
      `${pointer}/pointer`,
      "Workflow value reference pointer does not resolve in its declared schema."
    )
  }
}

function findInput(values: readonly InputBinding[], id: string): InputBinding | undefined {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].id === id) return values[index]
  }
  return undefined
}

function findOutput(values: readonly OutputBinding[], id: string): OutputBinding | undefined {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].id === id) return values[index]
  }
  return undefined
}

function escapePointer(value: string): string {
  const tilde = reflectApply(stringReplace, value, [/~/gu, "~0"]) as string
  return reflectApply(stringReplace, tilde, [/\//gu, "~1"]) as string
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

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}

function pop<T>(values: T[]): T | undefined {
  return reflectApply(arrayPop, values, []) as T | undefined
}
