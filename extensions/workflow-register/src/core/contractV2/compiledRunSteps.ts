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
import { validateLocalJsonSchemaViewValue } from "./jsonSchemaCatalog"
import type { JsonValue } from "./jsonValue"
import type { AgentProvider, WorkflowRunState } from "../model"
import type { WorkflowPlanLease } from "./planLease"
import {
  createWorkflowAttemptStaging,
  withWorkflowAttemptStagingIdempotencyKey,
  type WorkflowAttemptStaging
} from "./providerAttemptStaging"
import { invokeCompiledWorkflowProvider } from "./providerInvocation"
import {
  compiledAttemptId,
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

interface PendingCommandOutput {
  readonly id: string
  readonly value: JsonValue
}

interface ArtifactVisibilityEvidence {
  readonly attemptId: string
  readonly artifactSetDigest: string
}

const arrayJoin = Array.prototype.join
const arrayPush = Array.prototype.push
const DateConstructor = Date
const dateToISOString = Date.prototype.toISOString
const objectFreeze = Object.freeze
const objectHasOwn = Object.hasOwn
const reflectApply = Reflect.apply

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
  const idempotencyKey = provider.idempotency === "key-required"
    ? compiledProviderIdempotencyKey({
        runId: input.run.runId,
        stepId: input.step.id,
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
    await failCompiledStep(input.runStore, input.run, input.stepIndex, message)
    return objectFreeze({ kind: "failed" as const })
  }

  const output: PendingCommandOutput | undefined = invoked.output.kind === "value"
    ? objectFreeze({
        id: input.step.output.kind === "value" ? input.step.output.id : input.step.id,
        value: invoked.output.value
      })
    : undefined

  if (transaction !== undefined) {
    await commitWorkflowArtifactTransaction(transaction, async (evidence) => {
      await commitCommandStepState({
        run: input.run,
        runStore: input.runStore,
        context: input.context,
        stepIndex: input.stepIndex,
        output,
        artifact: objectFreeze({
          attemptId,
          artifactSetDigest: evidence.artifactSetDigest
        })
      })
    })
  } else {
    await commitCommandStepState({
      run: input.run,
      runStore: input.runStore,
      context: input.context,
      stepIndex: input.stepIndex,
      output
    })
  }
  return objectFreeze({ kind: "completed" as const })
}

async function commitCommandStepState(input: {
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly context: CompiledRuntimeContext
  readonly stepIndex: number
  readonly output?: PendingCommandOutput
  readonly artifact?: ArtifactVisibilityEvidence
}): Promise<void> {
  const step = input.run.steps[input.stepIndex]
  const previousStepStatus = step.status
  const previousCompletedAt = step.completedAt
  const previousError = step.error
  const previousUpdatedAt = input.run.updatedAt

  const outputId = input.output?.id
  const hadOutput = outputId !== undefined && objectHasOwn(input.context.outputs, outputId)
  const previousOutput = outputId === undefined ? undefined : input.context.outputs[outputId]
  const hadCommittedOutputs = objectHasOwn(input.run.state, COMMITTED_OUTPUTS_KEY)
  const previousCommittedOutputs = input.run.state[COMMITTED_OUTPUTS_KEY]

  const artifactKey = input.artifact === undefined
    ? undefined
    : `workflow.contractV2.artifactSet.${step.id}`
  const hadArtifact = artifactKey !== undefined && objectHasOwn(input.run.state, artifactKey)
  const previousArtifact = artifactKey === undefined ? undefined : input.run.state[artifactKey]

  try {
    if (input.output !== undefined) input.context.outputs[input.output.id] = input.output.value
    persistCompiledOutputs(input.run, input.context.outputs)
    if (artifactKey !== undefined && input.artifact !== undefined) {
      input.run.state[artifactKey] = canonicalJsonText(input.artifact)
    }
    markCompiledStepCompleted(input.run, input.stepIndex)
    await input.runStore.saveRun(input.run)
  } catch (error) {
    if (outputId !== undefined) {
      if (hadOutput) input.context.outputs[outputId] = previousOutput as JsonValue
      else delete input.context.outputs[outputId]
    }
    if (hadCommittedOutputs) input.run.state[COMMITTED_OUTPUTS_KEY] = previousCommittedOutputs
    else delete input.run.state[COMMITTED_OUTPUTS_KEY]
    if (artifactKey !== undefined) {
      if (hadArtifact) input.run.state[artifactKey] = previousArtifact as string
      else delete input.run.state[artifactKey]
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
  const validated = validateLocalJsonSchemaViewValue({
    compiled: findCompiledSchema(input.privateState, input.step.output.schema),
    value: text,
    diagnosticCode: "WF2_PROVIDER_OUTPUT_INVALID",
    location: objectFreeze({ path: "workflow.yaml", pointer: `/steps/${input.stepIndex}/output` })
  })
  if (!validated.ok || canonicalJsonBytes(validated.ok ? validated.value : null).byteLength > input.step.output.maxBytes) {
    await failCompiledStep(input.runStore, input.run, input.stepIndex, "Compiled workflow agent output is invalid.")
    return objectFreeze({ kind: "failed" as const })
  }
  input.context.outputs[input.step.output.id] = validated.value
  persistCompiledOutputs(input.run, input.context.outputs)
  markCompiledStepCompleted(input.run, input.stepIndex)
  await input.runStore.saveRun(input.run)
  return objectFreeze({ kind: "completed" as const })
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
  input.run.state[RESULT_KEY] = canonicalJsonText(value)
  markCompiledStepCompleted(input.run, input.stepIndex)
  await input.runStore.saveRun(input.run)
  return objectFreeze({ kind: "completed" as const })
}

async function failCompiledStep(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  stepIndex: number,
  message: string
): Promise<void> {
  const step = run.steps[stepIndex]
  step.status = "failed"
  step.error = message
  step.completedAt = now()
  run.status = "failed"
  run.error = message
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
