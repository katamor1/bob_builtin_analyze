import type {
  CompiledWorkflowDefinition,
  CompiledWorkflowInput,
  CompiledWorkflowPlanPredicateRecord,
  CompiledWorkflowStep,
  CompiledWorkflowTransition
} from "./compiledPlan"
import { CompilerSemanticFailure, schemaById, type CompilerSemanticFiles } from "./compilerFiles"
import {
  bindLocalJsonSchemaViewForPredicate,
  type LocalJsonSchemaPredicateBinding
} from "./jsonSchemaCatalog"
import type {
  WorkflowPackageDocumentV2,
  WorkflowPredicateV2,
  WorkflowReferenceV2,
  WorkflowStepV2
} from "./packageShape"
import {
  compileWorkflowPredicate,
  type CompiledWorkflowPredicate,
  type CompiledWorkflowValueReference,
  type WorkflowPredicateInputSchemaBinding,
  type WorkflowPredicateSchemaEnvironment,
  type WorkflowPredicateStepSchemaBinding
} from "./predicate"

const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const objectHasOwn = Object.hasOwn
const reflectApply = Reflect.apply
const stringSlice = String.prototype.slice
const stringStartsWith = String.prototype.startsWith

export interface CompiledWorkflowExecution {
  readonly workflow: CompiledWorkflowDefinition
  readonly predicates: readonly CompiledWorkflowPlanPredicateRecord[]
}

interface PredicatePrefixBinding {
  readonly id: string
  readonly prefix: string
}

interface PredicateCompilationEnvironment {
  readonly schemas: WorkflowPredicateSchemaEnvironment
  readonly inputs: readonly PredicatePrefixBinding[]
  readonly outputs: readonly PredicatePrefixBinding[]
}

export function compileWorkflowExecution(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): CompiledWorkflowExecution {
  const environment = createPredicateEnvironment(document, files)
  const records: CompiledWorkflowPlanPredicateRecord[] = []
  const inputs: CompiledWorkflowInput[] = []

  for (let inputIndex = 0; inputIndex < document.inputs.length; inputIndex += 1) {
    const input = document.inputs[inputIndex]
    let requiredWhenPredicate: number | undefined
    if (input.requiredWhen !== undefined) {
      requiredWhenPredicate = records.length
      push(records, compilePredicateRecord(
        input.requiredWhen,
        objectFreeze({ kind: "inputRequiredWhen" as const, inputIndex }),
        "entry",
        `/inputs/${inputIndex}/requiredWhen`,
        environment
      ))
    }
    const compiled: {
      id: string
      title: string
      description?: string
      schema: string
      required: boolean
      default?: typeof input.default
      requiredWhenPredicate?: number
    } = {
      id: input.id,
      title: input.title,
      schema: input.schema,
      required: input.required
    }
    if (input.description !== undefined) compiled.description = input.description
    if (objectHasOwn(input, "default")) compiled.default = input.default
    if (requiredWhenPredicate !== undefined) compiled.requiredWhenPredicate = requiredWhenPredicate
    push(inputs, objectFreeze(compiled) as CompiledWorkflowInput)
  }

  const steps: CompiledWorkflowStep[] = []
  for (let stepIndex = 0; stepIndex < document.steps.length; stepIndex += 1) {
    const step = document.steps[stepIndex]
    let entryPredicate: number | undefined
    if (step.when !== undefined) {
      entryPredicate = records.length
      push(records, compilePredicateRecord(
        step.when,
        objectFreeze({ kind: "stepEntry" as const, stepIndex }),
        "entry",
        `/steps/${stepIndex}/when`,
        environment
      ))
    }
    const transition = step.transition === undefined
      ? undefined
      : compileTransition(step.transition, stepIndex, records, environment)
    push(steps, compileStep(step, entryPredicate, transition))
  }

  const workflow = objectFreeze({
    schemaVersion: "workflow-compiled-workflow/v2" as const,
    id: document.id,
    name: document.name,
    description: document.description,
    inputs: objectFreeze(inputs),
    steps: objectFreeze(steps),
    resumePolicy: document.resumePolicy
  })
  return objectFreeze({ workflow, predicates: objectFreeze(records) })
}

export function compileWorkflowPredicates(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): readonly CompiledWorkflowPlanPredicateRecord[] {
  return compileWorkflowExecution(document, files).predicates
}

function compileTransition(
  transition: NonNullable<WorkflowStepV2["transition"]>,
  stepIndex: number,
  records: CompiledWorkflowPlanPredicateRecord[],
  environment: PredicateCompilationEnvironment
): CompiledWorkflowTransition {
  const decisions: CompiledWorkflowTransition["decisions"][number][] = []
  for (let decisionIndex = 0; decisionIndex < transition.decisions.length; decisionIndex += 1) {
    const decision = transition.decisions[decisionIndex]
    const predicate = records.length
    push(records, compilePredicateRecord(
      decision.when,
      objectFreeze({ kind: "stepTransition" as const, stepIndex }),
      "postCommit",
      `/steps/${stepIndex}/transition/decisions/${decisionIndex}/when`,
      environment
    ))
    const compiled: {
      id: string
      predicate: number
      goto: string
      loop?: typeof decision.loop
    } = { id: decision.id, predicate, goto: decision.goto }
    if (decision.loop !== undefined) compiled.loop = decision.loop
    push(decisions, objectFreeze(compiled))
  }
  return objectFreeze({
    decisions: objectFreeze(decisions),
    default: transition.default
  })
}

function compileStep(
  step: WorkflowStepV2,
  entryPredicate: number | undefined,
  transition: CompiledWorkflowTransition | undefined
): CompiledWorkflowStep {
  const common: Record<string, unknown> = {
    id: step.id,
    title: step.title,
    type: step.type,
    required: step.required
  }
  if (entryPredicate !== undefined) common.entryPredicate = entryPredicate
  if (transition !== undefined) common.transition = transition

  if (step.type === "command") {
    return objectFreeze({
      ...common,
      provider: step.provider,
      input: step.input,
      output: step.output,
      artifacts: step.artifacts
    }) as unknown as CompiledWorkflowStep
  }
  if (step.type === "agent") {
    return objectFreeze({
      ...common,
      prompt: step.prompt,
      context: step.context,
      output: step.output,
      artifacts: step.artifacts
    }) as unknown as CompiledWorkflowStep
  }
  if (step.type === "manual") {
    const compiled: Record<string, unknown> = {
      ...common,
      prompt: step.prompt,
      output: step.output
    }
    if (step.form !== undefined) compiled.form = step.form
    if (step.approval !== undefined) compiled.approval = step.approval
    return objectFreeze(compiled) as unknown as CompiledWorkflowStep
  }
  return objectFreeze({
    ...common,
    source: step.source,
    artifacts: step.artifacts
  }) as unknown as CompiledWorkflowStep
}

function createPredicateEnvironment(
  document: WorkflowPackageDocumentV2,
  files: CompilerSemanticFiles
): PredicateCompilationEnvironment {
  const inputs: WorkflowPredicateInputSchemaBinding[] = []
  const steps: WorkflowPredicateStepSchemaBinding[] = []
  const inputPrefixes: PredicatePrefixBinding[] = []
  const outputPrefixes: PredicatePrefixBinding[] = []
  for (let index = 0; index < document.inputs.length; index += 1) {
    const input = document.inputs[index]
    const schema = schemaById(files, input.schema, `/inputs/${index}/schema`)
    const binding = bindLocalJsonSchemaViewForPredicate(schema.compiled)
    push(inputs, objectFreeze({
      id: input.id,
      schemaId: binding.compiled.evidence.rootId,
      schema: binding.compiled
    }))
    push(inputPrefixes, objectFreeze({ id: input.id, prefix: binding.pointerPrefix }))
  }
  for (let index = 0; index < document.steps.length; index += 1) {
    const step = document.steps[index]
    if (!("output" in step) || step.output.kind !== "value") {
      push(steps, objectFreeze({ kind: "noValue" as const }))
      continue
    }
    const schema = schemaById(files, step.output.schema, `/steps/${index}/output/schema`)
    const binding = bindLocalJsonSchemaViewForPredicate(schema.compiled)
    push(steps, objectFreeze({
      kind: "value" as const,
      id: step.output.id,
      schemaId: binding.compiled.evidence.rootId,
      schema: binding.compiled
    }))
    push(outputPrefixes, objectFreeze({ id: step.output.id, prefix: binding.pointerPrefix }))
  }
  return objectFreeze({
    schemas: objectFreeze({ inputs: objectFreeze(inputs), steps: objectFreeze(steps) }),
    inputs: objectFreeze(inputPrefixes),
    outputs: objectFreeze(outputPrefixes)
  })
}

function compilePredicateRecord(
  predicate: WorkflowPredicateV2,
  placement:
    | { readonly kind: "inputRequiredWhen"; readonly inputIndex: number }
    | { readonly kind: "stepEntry"; readonly stepIndex: number }
    | { readonly kind: "stepTransition"; readonly stepIndex: number },
  phase: "entry" | "postCommit",
  pointer: string,
  environment: PredicateCompilationEnvironment
): CompiledWorkflowPlanPredicateRecord {
  const location = objectFreeze({ path: "workflow.yaml", pointer })
  const prefixed = prefixPredicate(predicate, environment)
  const result = compileWorkflowPredicate({
    predicate: prefixed,
    placement,
    schemas: environment.schemas,
    location
  })
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
    predicate: lowerValidatedPredicate(result.predicate, environment)
  })
}

// Schema-view prefixes are validation-private. Retain the validated AST with package-relative value pointers.
function lowerValidatedPredicate(
  predicate: CompiledWorkflowPredicate,
  environment: PredicateCompilationEnvironment
): CompiledWorkflowPredicate {
  if ("predicates" in predicate) {
    const predicates: CompiledWorkflowPredicate[] = []
    for (let index = 0; index < predicate.predicates.length; index += 1) {
      push(predicates, lowerValidatedPredicate(predicate.predicates[index], environment))
    }
    return objectFreeze({ kind: predicate.kind, predicates: objectFreeze(predicates) })
  }
  if (predicate.kind === "not") {
    return objectFreeze({ kind: "not" as const, predicate: lowerValidatedPredicate(predicate.predicate, environment) })
  }
  const reference = predicate.left
  const values = reference.source === "input" ? environment.inputs : environment.outputs
  const prefix = findPrefix(values, reference.id)
  if (prefix === undefined || !reflectApply(stringStartsWith, reference.pointer, [prefix])) {
    throw new CompilerSemanticFailure("workflow.yaml", "", "Validated predicate reference is unavailable.")
  }
  const left: CompiledWorkflowValueReference = objectFreeze({
    source: reference.source,
    id: reference.id,
    pointer: reflectApply(stringSlice, reference.pointer, [prefix.length]) as string
  })
  if (predicate.kind === "exists") return objectFreeze({ kind: "exists" as const, left })
  return objectFreeze({ ...predicate, left })
}

function prefixPredicate(
  predicate: WorkflowPredicateV2,
  environment: PredicateCompilationEnvironment
): WorkflowPredicateV2 {
  if ("predicates" in predicate) {
    const predicates: WorkflowPredicateV2[] = []
    for (let index = 0; index < predicate.predicates.length; index += 1) {
      push(predicates, prefixPredicate(predicate.predicates[index], environment))
    }
    return objectFreeze({ kind: predicate.kind, predicates: objectFreeze(predicates) })
  }
  if (predicate.kind === "not") {
    return objectFreeze({ kind: "not" as const, predicate: prefixPredicate(predicate.predicate, environment) })
  }
  if (predicate.kind === "exists") {
    return objectFreeze({ kind: "exists" as const, left: prefixReference(predicate.left, environment) })
  }
  return objectFreeze({
    kind: predicate.kind,
    left: prefixReference(predicate.left, environment),
    right: predicate.right
  }) as WorkflowPredicateV2
}

function prefixReference(
  reference: WorkflowReferenceV2,
  environment: PredicateCompilationEnvironment
): WorkflowReferenceV2 {
  const values = reference.source === "input" ? environment.inputs : environment.outputs
  const prefix = findPrefix(values, reference.id)
  return objectFreeze({
    source: reference.source,
    id: reference.id,
    pointer: prefix === undefined ? reference.pointer : `${prefix}${reference.pointer}`
  })
}

function findPrefix(values: readonly PredicatePrefixBinding[], id: string): string | undefined {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].id === id) return values[index].prefix
  }
  return undefined
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
