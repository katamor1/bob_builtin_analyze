import { types as utilTypes } from "node:util"
import * as vscode from "vscode"

import {
  auditedBobTaskIdentity,
  auditedBobTaskMethod,
  type AuditedBobTaskBinding
} from "./core/contractV2/bobTaskMethodBinding"
import { requireCompiledWorkflowPlanState, type CompiledWorkflowPlanHandle } from "./core/contractV2/compiledPlan"
import {
  missingRequiredCompiledWorkflowInputIds,
  prepareCompiledWorkflowInputs
} from "./core/contractV2/compiledRunInputs"
import { acquireWorkflowPlanHandle } from "./core/contractV2/planStore"
import type { BobTaskCapabilityName } from "./core/contractV2/bobProfile"
import { snapshotBoundedWorkflowProviderEnvelope } from "./core/contractV2/providerEnvelopeSnapshot"
import type { AgentExecutionInput, AgentProvider } from "./core/model"
import { ContractV2GuardedRunStateStore } from "./workflowContractV2RunStateStore"
import { WorkflowContractV2BobExecutor } from "./workflowContractV2BobExecutor"
import type { BobWorkflowTask, WorkflowDefinition } from "./bobWorkflowTypes"
import { workflowContractV2Binding } from "./workflowContractV2View"
import { workspaceRootFromFile } from "./core/workspaceRoots"

export interface ExecuteWorkflowContractV2BobStepInput {
  readonly definition: WorkflowDefinition
  readonly handle: CompiledWorkflowPlanHandle
  readonly stepId: string
  readonly stepIndex: number
  readonly task: BobWorkflowTask
  readonly auditedTask: AuditedBobTaskBinding
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const jsonParse = JSON.parse
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const reflectApply = Reflect.apply
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<CompiledWorkflowPlanHandle, WorkflowContractV2BobExecutor>,
  key: CompiledWorkflowPlanHandle
) => WorkflowContractV2BobExecutor | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<CompiledWorkflowPlanHandle, WorkflowContractV2BobExecutor>,
  key: CompiledWorkflowPlanHandle,
  value: WorkflowContractV2BobExecutor
) => WeakMap<CompiledWorkflowPlanHandle, WorkflowContractV2BobExecutor>
const WeakMapConstructor = WeakMap
const MAX_METADATA_FIELDS = 512
const MAX_TASK_MESSAGES = 1_024
const MAX_BOB_INPUT_VALUE_BYTES = 16_777_216
const executors = new WeakMapConstructor<CompiledWorkflowPlanHandle, WorkflowContractV2BobExecutor>()

export async function executeWorkflowContractV2BobStep(
  input: ExecuteWorkflowContractV2BobStepInput
): Promise<boolean> {
  try {
    if (auditedBobTaskIdentity(input.auditedTask) !== input.task) {
      throw new TypeError("Audited Bob task binding does not match the executing task identity.")
    }
    const binding = workflowContractV2Binding(input.definition)
    if (binding === undefined || binding.handle !== input.handle) {
      throw new TypeError("Compiled Bob workflow binding does not match its registered plan handle.")
    }
    const workspaceRoot = input.definition.core.workflowRoot
      ?? workspaceRootFromFile(input.definition.file, ".bob")
    if (workspaceRoot === undefined) {
      throw new TypeError("Compiled Bob workflow requires a workspace root.")
    }
    let executor = weakMapGet(executors, input.handle)
    if (executor === undefined) {
      executor = new WorkflowContractV2BobExecutor({
        acquireLease: acquireWorkflowPlanHandle,
        resolveInputs: (auditedTask) => resolveCompiledBobInputs(input.handle, auditedTask),
        createRunStore: (root) => new ContractV2GuardedRunStateStore({
          workspaceRoot: root,
          engineVersion: "workflow-register-contract-v2-bob"
        }),
        createAgentProvider: (auditedTask) => createCompiledBobAgentProvider(input.handle, auditedTask)
      })
      weakMapSet(executors, input.handle, executor)
    }
    return executor.runStep({
      handle: input.handle,
      stepId: input.stepId,
      stepIndex: input.stepIndex,
      task: input.task,
      auditedTask: input.auditedTask,
      workspaceRoot,
      allowOutOfOrder: input.definition.stepExecution.allowOutOfOrder
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await vscode.window.showErrorMessage(`Contract v2 Bob ワークフローの実行に失敗しました: ${message}`)
    return false
  }
}

async function resolveCompiledBobInputs(
  handle: CompiledWorkflowPlanHandle,
  task: AuditedBobTaskBinding
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const provided = objectCreate(null) as Record<string, unknown>
  const capabilities = handle.plan.bobProfileBinding.taskCapabilities
  if (hasCapability(capabilities, "task.getAllMetadata")) {
    const method = auditedBobTaskMethod(task, "task.getAllMetadata")
    mergeInputSources(handle, provided, method())
  }
  if (hasCapability(capabilities, "task.getMessages")) {
    const method = auditedBobTaskMethod(task, "task.getMessages")
    const messages = safeArray(method(), MAX_TASK_MESSAGES)
    for (let index = 0; index < messages.length; index += 1) {
      const message = safeRecord(messages[index])
      const meta = safeRecord(message._meta)
      const workflow = safeRecord(meta.workflow)
      mergeKnownInputs(handle, provided, safeRecord(workflow.meta))
      mergeKnownInputs(handle, provided, safeRecord(workflow.inputs))
    }
  }

  const privateState = requireCompiledWorkflowPlanState(handle)
  for (;;) {
    const accepted = prepareCompiledWorkflowInputs(handle.plan, privateState, provided)
    const missing = missingRequiredCompiledWorkflowInputIds(handle.plan, accepted)
    if (missing.length === 0) return accepted
    const id = missing[0]
    const definition = findCompiledInput(handle, id)
    const value = await promptCompiledBobInput(definition)
    if (value === undefined) return undefined
    provided[id] = value
  }
}

function mergeInputSources(
  handle: CompiledWorkflowPlanHandle,
  target: Record<string, unknown>,
  value: unknown
): void {
  const metadata = safeRecord(value)
  mergeKnownInputs(handle, target, metadata)
  mergeKnownInputs(handle, target, safeRecord(metadata.inputs))
  mergeKnownInputs(handle, target, safeRecord(metadata.workflowInputs))
  mergeKnownInputs(handle, target, safeRecord(metadata.meta))
  mergeKnownInputs(handle, target, safeRecord(safeRecord(metadata.workflow).meta))
}

function mergeKnownInputs(
  handle: CompiledWorkflowPlanHandle,
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>
): void {
  for (let index = 0; index < handle.plan.workflow.inputs.length; index += 1) {
    const id = handle.plan.workflow.inputs[index].id
    if (!objectHasOwn(source, id) || source[id] === undefined) continue
    const bounded = snapshotBoundedWorkflowProviderEnvelope(source[id], MAX_BOB_INPUT_VALUE_BYTES)
    if (bounded === undefined) {
      throw new TypeError("Bob task input metadata exceeds its structural or byte limit.")
    }
    target[id] = bounded
  }
}

async function promptCompiledBobInput(
  definition: CompiledWorkflowPlanHandle["plan"]["workflow"]["inputs"][number]
): Promise<unknown> {
  const raw = await vscode.window.showInputBox({
    title: definition.title,
    prompt: definition.description ?? `${definition.id} をJSON値または文字列として入力してください。`,
    ignoreFocusOut: true
  })
  if (raw === undefined) return undefined
  try {
    return reflectApply(jsonParse, JSON, [raw]) as unknown
  } catch {
    return raw
  }
}

function findCompiledInput(
  handle: CompiledWorkflowPlanHandle,
  id: string
): CompiledWorkflowPlanHandle["plan"]["workflow"]["inputs"][number] {
  for (let index = 0; index < handle.plan.workflow.inputs.length; index += 1) {
    if (handle.plan.workflow.inputs[index].id === id) return handle.plan.workflow.inputs[index]
  }
  throw new TypeError("Compiled Bob input definition is unavailable.")
}

function createCompiledBobAgentProvider(
  handle: CompiledWorkflowPlanHandle,
  task: AuditedBobTaskBinding
): AgentProvider | undefined {
  if (!hasCapability(handle.plan.bobProfileBinding.taskCapabilities, "task.startSubagent")) {
    return undefined
  }
  const startSubagent = auditedBobTaskMethod(task, "task.startSubagent")
  return objectFreeze({
    run: async (input: AgentExecutionInput): Promise<string> => {
      const result = exactSubagentResult(await startSubagent(input.prompt))
      if (result === undefined) throw new Error("Bob subagent returned no exact result text.")
      return result
    }
  })
}

function exactSubagentResult(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value === null || typeof value !== "object" || isProxy(value)) return undefined
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) return undefined
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const descriptor = descriptors.result
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || typeof descriptor.value !== "string"
  ) return undefined
  return descriptor.value
}

function hasCapability(
  values: readonly string[],
  expected: BobTaskCapabilityName
): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === expected) return true
  return false
}

function safeRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    return objectFreeze(objectCreate(null) as Record<string, unknown>)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    return objectFreeze(objectCreate(null) as Record<string, unknown>)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length > MAX_METADATA_FIELDS) throw new TypeError("Bob task metadata exceeds its field limit.")
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") continue
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) continue
    result[key] = descriptor.value
  }
  return objectFreeze(result)
}

function safeArray(value: unknown, maximum: number): readonly unknown[] {
  if (
    !arrayIsArray(value)
    || isProxy(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
    || value.length > maximum
  ) return objectFreeze([])
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== value.length + 1) return objectFreeze([])
  const result: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) return objectFreeze([])
    reflectApply(arrayPush, result, [descriptor.value])
  }
  return objectFreeze(result)
}
