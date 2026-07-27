import * as nodePath from "node:path"

import {
  commitWorkflowArtifactTransaction,
  openWorkflowArtifactTransaction,
  workflowArtifactTransactionAttempt,
  type WorkflowArtifactTransaction
} from "./artifactTransaction"
import { canonicalJsonBytes, canonicalJsonDigest, canonicalJsonText } from "./canonicalJson"
import type {
  CompiledWorkflowPlan,
  CompiledWorkflowPlanPrivateState,
  CompiledWorkflowStep
} from "./compiledPlan"
import { validateLocalJsonSchemaViewValue, type CompiledLocalJsonSchemaView } from "./jsonSchemaCatalog"
import type { JsonValue } from "./jsonValue"
import type { AgentProvider, WorkflowRunState } from "../model"
import { parseStrictJson } from "./packageLoaderInput"
import type { WorkflowPlanLease } from "./planLease"
import {
  createWorkflowAttemptStaging,
  withWorkflowAttemptStagingIdempotencyKey,
  type WorkflowAttemptStaging
} from "./providerAttemptStaging"
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"
import { invokeCompiledWorkflowProvider } from "./providerInvocation"
import {
  compiledAttemptId,
  compiledExecutionOrdinalStateKey,
  compiledLogicalEffectOrdinal,
  compiledProviderIdempotencyKey,
  findCompiledPrompt,
  findCompiledProvider,
  findCompiledSchema,
  persistCompiledOutputs,
  resolveCompiledReference,
  resolveCompiledTemplate
} from "./compiledRunValues"
import {
  COMMITTED_OUTPUTS_KEY,
  RESULT_KEY,
  type CompiledRuntimeContext,
  type CompiledStepExecutionResult,
  type CompiledWorkflowRunStore
} from "./compiledRunTypes"

interface PendingStepOutput {
  readonly id: string
  readonly value: JsonValue
}

interface StateUpdate {
  readonly key: string
  readonly value: string
}

interface PreviousStateValue {
  readonly key: string
  readonly present: boolean
  readonly value?: string
}

const arrayJoin = Array.prototype.join
const arrayPush = Array.prototype.push
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const DateConstructor = Date
const dateToISOString = Date.prototype.toISOString
const objectFreeze = Object.freeze
const objectHasOwn = Object.hasOwn
const reflectApply = Reflect.apply
const MAX_AGENT_RAW_TEXT_BYTES = 16_777_216

export async function executeCompiledStep(input: {
  readonly lease: WorkflowPlanLease
  readonly plan: CompiledWorkflowPlan
  readonly privateState: CompiledWorkflowPlanPrivateState
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly workspaceRoot: string
  readonly signal: AbortSignal
  readonly agentProvider?: AgentProvider
  readonly context: CompiledRuntimeContext
  readonly step: CompiledWorkflowStep
  readonly stepIndex: number
}): Promise<CompiledStepExecutionResult> {
  if (input.step.type === "command") return executeCommandStep({ ...input, step: input.step })
  if (input.step.type === "agent") return executeAgentStep({ ...input, step: input.step })
  if (input.step.type === "manual") return holdManualStep(input)
  return executeResultStep({ ...input, step: input.step })
}

export function markCompiledStepCompleted(run: WorkflowRunState, index: number): void {
  const step = run.steps[index]
  step.status = "completed"
  step.completedAt = now()
  delete step.error
}

async function executeCommandStep(input: {
  readonly lease: WorkflowPlanLease
  readonly plan: CompiledWorkflowPlan
  readonly privateState: CompiledWorkflowPlanPrivateState
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly workspaceRoot: string
  readonly signal: AbortSignal
  readonly context: CompiledRuntimeContext
  readonly step: Extract<CompiledWorkflowStep, { readonly type: "command" }>
  readonly stepIndex: number
}): Promise<CompiledStepExecutionResult> {
  const provider = findCompiledProvider(input.plan.providerBindings, input.step.provider)
  const value = resolveCompiledTemplate(input.step.input, input.context)
  const inputDigest = canonicalJsonDigest(value) as import("./providerContract").Sha256Digest
  const attemptId = compiledAttemptId(input.stepIndex, input.run.steps[input.stepIndex].attempt ?? 1)
  const logicalEffectOrdinal = compiledLogicalEffectOrdinal(input.run, input.step.id)
  const idempotencyKey = provider.idempotency === "key-required"
    ? compiledProviderIdempotencyKey({
        runId: input.run.runId,
        stepId: input.step.id,
        logicalEffectOrdinal,
        inputDigest,
        planDigest: input.lease.planDigest,
        provider
      })
    : undefined

  let transaction: WorkflowArtifactTransaction | undefined
  let attempt: WorkflowAttemptStaging
  if (provider.sideEffect === "workspace-write") {
    transaction = await openWorkflowArtifactTransaction({
      lease: input.lease,
      runRoot: nodePath.join(input.workspaceRoot, ".bob", "workflows", "runs", input.run.runId),
      attemptId,
      stepId: input.step.id,
      inputDigest
    })
    const transactionAttempt = workflowArtifactTransactionAttempt(transaction)
    attempt = idempotencyKey === undefined
      ? transactionAttempt
      : withWorkflowAttemptStagingIdempotencyKey(transactionAttempt, idempotencyKey)
  } else {
    attempt = createWorkflowAttemptStaging({
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      stageArtifact: () => {
        throw new Error("Compiled provider attempted an artifact write without workspace-write authority.")
      }
    })
  }

  const invoked = await invokeCompiledWorkflowProvider({
    lease: input.lease,
    stepId: input.step.id,
    value,
    signal: input.signal,
    attempt
  })
  if (!invoked.ok) {
    const message = invoked.failure === "provider-error"
      ? "Compiled workflow provider reported a validated error."
      : `Compiled workflow provider validation failed: ${joinDiagnosticCodes(invoked.diagnostics)}`
    await failCompiledStep(
      input.runStore,
      input.run,
      input.stepIndex,
      message,
      input.step.required,
      logicalEffectOrdinal
    )
    return objectFreeze({ kind: "failed" as const })
  }

  const output: PendingStepOutput | undefined = invoked.output.kind === "value"
    ? objectFreeze({
        id: input.step.output.kind === "value" ? input.step.output.id : input.step.id,
        value: invoked.output.value
      })
    : undefined

  let reconciledRun: WorkflowRunState | undefined
  if (transaction !== undefined) {
    await commitWorkflowArtifactTransaction(transaction, async (evidence) => {
      reconciledRun = await commitCompiledStepState({
        run: input.run,
        runStore: input.runStore,
        context: input.context,
        stepIndex: input.stepIndex,
        executionOrdinal: logicalEffectOrdinal,
        output,
        stateUpdates: objectFreeze([objectFreeze({
          key: `workflow.contractV2.artifactSet.${input.step.id}`,
          value: canonicalJsonText({ attemptId, artifactSetDigest: evidence.artifactSetDigest })
        })])
      })
    })
  } else {
    reconciledRun = await commitCompiledStepState({
      run: input.run,
      runStore: input.runStore,
      context: input.context,
      stepIndex: input.stepIndex,
      executionOrdinal: logicalEffectOrdinal,
      output
    })
  }
  return objectFreeze({
    kind: "completed" as const,
    ...(reconciledRun === undefined ? {} : { run: reconciledRun })
  })
}

async function executeAgentStep(input: {
  readonly plan: CompiledWorkflowPlan
  readonly privateState: CompiledWorkflowPlanPrivateState
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly workspaceRoot: string
  readonly agentProvider?: AgentProvider
  readonly context: CompiledRuntimeContext
  readonly step: Extract<CompiledWorkflowStep, { readonly type: "agent" }>
  readonly stepIndex: number
}): Promise<CompiledStepExecutionResult> {
  if (input.agentProvider === undefined || typeof input.agentProvider.run !== "function") {
    throw new Error("Compiled workflow agent provider is unavailable.")
  }
  const executionOrdinal = compiledLogicalEffectOrdinal(input.run, input.step.id)
  const prompt = findCompiledPrompt(input.plan, input.step.prompt)
  const contextValues: JsonValue[] = []
  for (let index = 0; index < input.step.context.length; index += 1) {
    push(contextValues, resolveCompiledReference(input.step.context[index], input.context))
  }
  const renderedPrompt = contextValues.length === 0
    ? prompt
    : `${prompt}\n\nContext:\n${canonicalJsonText(contextValues)}`
  const text = await input.agentProvider.run({
    workflowId: input.plan.workflowId,
    runId: input.run.runId,
    stepId: input.step.id,
    prompt: renderedPrompt,
    inputs: input.run.inputs,
    state: input.run.state,
    workflowRoot: input.workspaceRoot
  })
  const value = decodeCompiledAgentOutput(
    text,
    findCompiledSchema(input.privateState, input.step.output.schema),
    input.step.output.maxBytes,
    input.stepIndex
  )
  if (value === undefined) {
    await failCompiledStep(
      input.runStore,
      input.run,
      input.stepIndex,
      "Compiled workflow agent output is invalid.",
      input.step.required,
      executionOrdinal
    )
    return objectFreeze({ kind: "failed" as const })
  }
  const reconciledRun = await commitCompiledStepState({
    run: input.run,
    runStore: input.runStore,
    context: input.context,
    stepIndex: input.stepIndex,
    executionOrdinal,
    output: objectFreeze({ id: input.step.output.id, value })
  })
  return objectFreeze({
    kind: "completed" as const,
    ...(reconciledRun === undefined ? {} : { run: reconciledRun })
  })
}

function decodeCompiledAgentOutput(
  text: unknown,
  schema: CompiledLocalJsonSchemaView,
  maximumBytes: number,
  stepIndex: number
): JsonValue | undefined {
  if (typeof text !== "string") return undefined
  const bytes = reflectApply(bufferFrom, BufferConstructor, [text, "utf8"]) as Buffer
  if (bytes.byteLength > MAX_AGENT_RAW_TEXT_BYTES) return undefined

  const candidates: unknown[] = []
  try {
    push(candidates, parseStrictJson(bytes, "Compiled workflow agent output"))
  } catch {
    // A non-JSON response may still be the exact value for a string schema.
  }
  push(candidates, text)

  for (let index = 0; index < candidates.length; index += 1) {
    const bounded = snapshotBoundedWorkflowProviderEnvelope(candidates[index], maximumBytes)
    if (bounded === undefined) continue
    const validated = validateLocalJsonSchemaViewValue({
      compiled: schema,
      value: bounded,
      diagnosticCode: "WF2_PROVIDER_OUTPUT_INVALID",
      location: objectFreeze({ path: "workflow.yaml", pointer: `/steps/${stepIndex}/output` })
    })
    if (validated.ok && canonicalJsonBytes(validated.value).byteLength <= maximumBytes) return validated.value
  }
  return undefined
}

async function holdManualStep(input: {
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly stepIndex: number
}): Promise<CompiledStepExecutionResult> {
  const stepState = input.run.steps[input.stepIndex]
  stepState.status = "held"
  input.run.status = "held"
  input.run.currentStep = stepState.id
  await input.runStore.saveRun(input.run)
  return objectFreeze({ kind: "held" as const })
}

async function executeResultStep(input: {
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly context: CompiledRuntimeContext
  readonly step: Extract<CompiledWorkflowStep, { readonly type: "result" }>
  readonly stepIndex: number
}): Promise<CompiledStepExecutionResult> {
  const value = input.step.source.source === "literal"
    ? input.step.source.value
    : resolveCompiledReference(input.step.source, input.context)
  const reconciledRun = await commitCompiledStepState({
    run: input.run,
    runStore: input.runStore,
    context: input.context,
    stepIndex: input.stepIndex,
    executionOrdinal: compiledLogicalEffectOrdinal(input.run, input.step.id),
    stateUpdates: objectFreeze([objectFreeze({ key: RESULT_KEY, value: canonicalJsonText(value) })])
  })
  return objectFreeze({
    kind: "completed" as const,
    ...(reconciledRun === undefined ? {} : { run: reconciledRun })
  })
}

async function commitCompiledStepState(input: {
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly context: CompiledRuntimeContext
  readonly stepIndex: number
  readonly executionOrdinal: number
  readonly output?: PendingStepOutput
  readonly stateUpdates?: readonly StateUpdate[]
}): Promise<WorkflowRunState | undefined> {
  const step = input.run.steps[input.stepIndex]
  if (compiledLogicalEffectOrdinal(input.run, step.id) !== input.executionOrdinal) {
    throw new Error("Compiled workflow execution ordinal changed before commit.")
  }
  const previousStepStatus = step.status
  const previousCompletedAt = step.completedAt
  const previousError = step.error
  const previousUpdatedAt = input.run.updatedAt

  const outputId = input.output?.id
  const hadOutput = outputId !== undefined && objectHasOwn(input.context.outputs, outputId)
  const previousOutput = outputId === undefined ? undefined : input.context.outputs[outputId]
  const hadCommittedOutputs = objectHasOwn(input.run.state, COMMITTED_OUTPUTS_KEY)
  const previousCommittedOutputs = input.run.state[COMMITTED_OUTPUTS_KEY]

  const updates: StateUpdate[] = []
  for (let index = 0; index < (input.stateUpdates?.length ?? 0); index += 1) {
    push(updates, input.stateUpdates![index])
  }
  push(updates, objectFreeze({
    key: compiledExecutionOrdinalStateKey(step.id),
    value: String(input.executionOrdinal)
  }))
  const previousState: PreviousStateValue[] = []
  for (let index = 0; index < updates.length; index += 1) {
    const update = updates[index]
    push(previousState, objectFreeze({
      key: update.key,
      present: objectHasOwn(input.run.state, update.key),
      ...(objectHasOwn(input.run.state, update.key) ? { value: input.run.state[update.key] } : {})
    }))
  }

  let expectedCommittedOutputs: string | undefined
  try {
    if (input.output !== undefined) input.context.outputs[input.output.id] = input.output.value
    persistCompiledOutputs(input.run, input.context.outputs)
    expectedCommittedOutputs = input.run.state[COMMITTED_OUTPUTS_KEY]
    for (let index = 0; index < updates.length; index += 1) {
      input.run.state[updates[index].key] = updates[index].value
    }
    markCompiledStepCompleted(input.run, input.stepIndex)
    await input.runStore.saveRun(input.run)
    return undefined
  } catch (error) {
    if (expectedCommittedOutputs !== undefined) {
      let persisted: WorkflowRunState | undefined
      try {
        persisted = await input.runStore.loadRun(input.run.runId)
      } catch {
        persisted = undefined
      }
      if (
        persisted !== undefined
        && runMatchesCommittedStepState(
          persisted,
          input.run,
          input.stepIndex,
          expectedCommittedOutputs,
          updates
        )
      ) return persisted
    }

    if (outputId !== undefined) {
      if (hadOutput) input.context.outputs[outputId] = previousOutput as JsonValue
      else delete input.context.outputs[outputId]
    }
    if (hadCommittedOutputs) input.run.state[COMMITTED_OUTPUTS_KEY] = previousCommittedOutputs
    else delete input.run.state[COMMITTED_OUTPUTS_KEY]
    for (let index = 0; index < previousState.length; index += 1) {
      const previous = previousState[index]
      if (previous.present) input.run.state[previous.key] = previous.value as string
      else delete input.run.state[previous.key]
    }
    step.status = previousStepStatus
    if (previousCompletedAt === undefined) delete step.completedAt
    else step.completedAt = previousCompletedAt
    if (previousError === undefined) delete step.error
    else step.error = previousError
    input.run.updatedAt = previousUpdatedAt
    throw error
  }
}

function runMatchesCommittedStepState(
  persisted: WorkflowRunState,
  expectedRun: WorkflowRunState,
  stepIndex: number,
  expectedCommittedOutputs: string,
  updates: readonly StateUpdate[]
): boolean {
  if (
    persisted.runId !== expectedRun.runId
    || persisted.workflowId !== expectedRun.workflowId
    || persisted.workflowDefinitionHash !== expectedRun.workflowDefinitionHash
    || persisted.status !== expectedRun.status
    || persisted.currentStep !== expectedRun.currentStep
    || persisted.state[COMMITTED_OUTPUTS_KEY] !== expectedCommittedOutputs
  ) return false
  const persistedStep = persisted.steps[stepIndex]
  const expectedStep = expectedRun.steps[stepIndex]
  if (
    persistedStep === undefined
    || expectedStep === undefined
    || persistedStep.id !== expectedStep.id
    || persistedStep.status !== "completed"
  ) return false
  for (let index = 0; index < updates.length; index += 1) {
    if (persisted.state[updates[index].key] !== updates[index].value) return false
  }
  return true
}

async function failCompiledStep(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  stepIndex: number,
  message: string,
  required: boolean,
  executionOrdinal: number
): Promise<void> {
  const step = run.steps[stepIndex]
  step.status = "failed"
  step.error = message
  step.completedAt = now()
  if (required) {
    run.status = "failed"
    run.error = message
  } else {
    run.status = "running"
    delete run.error
    run.state[compiledExecutionOrdinalStateKey(step.id)] = String(executionOrdinal)
  }
  await store.saveRun(run)
}

function joinDiagnosticCodes(
  diagnostics: readonly { readonly code: string }[]
): string {
  const codes: string[] = []
  for (let index = 0; index < diagnostics.length; index += 1) push(codes, diagnostics[index].code)
  return reflectApply(arrayJoin, codes, [","]) as string
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}

function now(): string {
  const value = new DateConstructor()
  return reflectApply(dateToISOString, value, []) as string
}
