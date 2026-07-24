import type { CompiledWorkflowPlanPredicateRecord } from "./compiledPlan"
import { CompilerSemanticFailure, schemaById, type CompilerSemanticFiles } from "./compilerFiles"
import type { WorkflowPackageDocumentV2 } from "./packageShape"
import {
  compileWorkflowPredicate,
  type WorkflowPredicateInputSchemaBinding,
  type WorkflowPredicateSchemaEnvironment,
  type WorkflowPredicateStepSchemaBinding
} from "./predicate"

const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply

export function compileWorkflowPredicates(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): readonly CompiledWorkflowPlanPredicateRecord[] {
  const schemas = createPredicateEnvironment(document, files)
  const records: CompiledWorkflowPlanPredicateRecord[] = []

  for (let inputIndex = 0; inputIndex < document.inputs.length; inputIndex += 1) {
    const input = document.inputs[inputIndex]
    if (input.requiredWhen === undefined) continue
    push(records, compilePredicateRecord(
      input.requiredWhen,
      objectFreeze({ kind: "inputRequiredWhen" as const, inputIndex }),
      "entry",
      `/inputs/${inputIndex}/requiredWhen`,
      schemas
    ))
  }

  for (let stepIndex = 0; stepIndex < document.steps.length; stepIndex += 1) {
    const step = document.steps[stepIndex]
    if (step.when !== undefined) {
      push(records, compilePredicateRecord(
        step.when,
        objectFreeze({ kind: "stepEntry" as const, stepIndex }),
        "entry",
        `/steps/${stepIndex}/when`,
        schemas
      ))
    }
    if (step.transition === undefined) continue
    for (let decisionIndex = 0; decisionIndex < step.transition.decisions.length; decisionIndex += 1) {
      push(records, compilePredicateRecord(
        step.transition.decisions[decisionIndex].when,
        objectFreeze({ kind: "stepTransition" as const, stepIndex }),
        "postCommit",
        `/steps/${stepIndex}/transition/decisions/${decisionIndex}/when`,
        schemas
      ))
    }
  }

  return objectFreeze(records)
}

function createPredicateEnvironment(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): WorkflowPredicateSchemaEnvironment {
  const inputs: WorkflowPredicateInputSchemaBinding[] = []
  const steps: WorkflowPredicateStepSchemaBinding[] = []
  for (let index = 0; index < document.inputs.length; index += 1) {
    const input = document.inputs[index]
    const schema = schemaById(files, input.schema, `/inputs/${index}/schema`)
    push(inputs, objectFreeze({ id: input.id, schemaId: input.schema, schema: schema.compiled }))
  }
  for (let index = 0; index < document.steps.length; index += 1) {
    const step = document.steps[index]
    if (!("output" in step) || step.output.kind !== "value") {
      push(steps, objectFreeze({ kind: "noValue" as const }))
      continue
    }
    const schema = schemaById(files, step.output.schema, `/steps/${index}/output/schema`)
    push(steps, objectFreeze({
      kind: "value" as const,
      id: step.output.id,
      schemaId: step.output.schema,
      schema: schema.compiled
    }))
  }
  return objectFreeze({ inputs: objectFreeze(inputs), steps: objectFreeze(steps) })
}

function compilePredicateRecord(
  predicate: unknown,
  placement:
    | { readonly kind: "inputRequiredWhen"; readonly inputIndex: number }
    | { readonly kind: "stepEntry"; readonly stepIndex: number }
    | { readonly kind: "stepTransition"; readonly stepIndex: number },
  phase: "entry" | "postCommit",
  pointer: string,
  schemas: WorkflowPredicateSchemaEnvironment
): CompiledWorkflowPlanPredicateRecord {
  const location = objectFreeze({ path: "workflow.yaml", pointer })
  const result = compileWorkflowPredicate({ predicate, placement, schemas, location })
  if (!result.ok) {
    throw new CompilerSemanticFailure(
      "workflow.yaml",
      pointer,
      "Workflow predicate failed compilation.",
      result.diagnostics
    )
  }
  return objectFreeze({
    phase,
    placement,
    location,
    predicate: result.predicate
  }) as unknown as CompiledWorkflowPlanPredicateRecord
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
