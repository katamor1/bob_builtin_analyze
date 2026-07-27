import { types as utilTypes } from "node:util"
import * as vscode from "vscode"

import { extractSubagentResult } from "./agentStep"
import { bindAuditedBobTaskMethod } from "./core/contractV2/bobTaskMethodBinding"
import { acquireWorkflowPlanHandle } from "./core/contractV2/planStore"
import type { CompiledWorkflowPlanHandle } from "./core/contractV2/compiledPlan"
import type { BobTaskCapabilityName } from "./core/contractV2/bobProfile"
import type { AgentExecutionInput, AgentProvider } from "./core/model"
import { ContractV2GuardedRunStateStore } from "./workflowContractV2RunStateStore"
import { WorkflowContractV2BobExecutor } from "./workflowContractV2BobExecutor"
import type { BobWorkflowTask, WorkflowDefinition } from "./bobWorkflowTypes"
import { collectBobWorkflowInputs } from "./workflowInputPrompt"
import { workflowContractV2Binding } from "./workflowContractV2View"
import { workspaceRootFromFile } from "./core/workspaceRoots"

export interface ExecuteWorkflowContractV2BobStepInput {
  readonly definition: WorkflowDefinition
  readonly handle: CompiledWorkflowPlanHandle
  readonly stepId: string
  readonly stepIndex: number
  readonly task: BobWorkflowTask
}

interface ExecutorRecord {
  readonly definition: WorkflowDefinition
  readonly executor: WorkflowContractV2BobExecutor
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const reflectApply = Reflect.apply
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<CompiledWorkflowPlanHandle, ExecutorRecord>,
  key: CompiledWorkflowPlanHandle
) => ExecutorRecord | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<CompiledWorkflowPlanHandle, ExecutorRecord>,
  key: CompiledWorkflowPlanHandle,
  value: ExecutorRecord
) => WeakMap<CompiledWorkflowPlanHandle, ExecutorRecord>
const WeakMapConstructor = WeakMap
const MAX_METADATA_FIELDS = 512
const MAX_TASK_MESSAGES = 1_024
const executors = new WeakMapConstructor<CompiledWorkflowPlanHandle, ExecutorRecord>()

export async function executeWorkflowContractV2BobStep(
  input: ExecuteWorkflowContractV2BobStepInput
): Promise<boolean> {
  try {
    const binding = workflowContractV2Binding(input.definition)
    if (binding === undefined || binding.handle !== input.handle) {
      throw new TypeError("Compiled Bob workflow binding does not match its registered plan handle.")
    }
    const workspaceRoot = input.definition.core.workflowRoot
      ?? workspaceRootFromFile(input.definition.file, ".bob")
    if (workspaceRoot === undefined) {
      throw new TypeError("Compiled Bob workflow requires a workspace root.")
    }
    let record = weakMapGet(executors, input.handle)
    if (record === undefined) {
      const definition = input.definition
      const executor = new WorkflowContractV2BobExecutor({
        acquireLease: acquireWorkflowPlanHandle,
        resolveInputs: (task) => resolveCompiledBobInputs(definition, input.handle, task),
        createRunStore: (root) => new ContractV2GuardedRunStateStore({
          workspaceRoot: root,
          engineVersion: "workflow-register-contract-v2-bob"
        }),
        createAgentProvider: (task) => createCompiledBobAgentProvider(input.handle, task)
      })
      record = objectFreeze({ definition, executor })
      weakMapSet(executors, input.handle, record)
    } else if (record.definition !== input.definition) {
      throw new TypeError("Compiled Bob executor handle is registered to a different workflow definition.")
    }
    return record.executor.runStep({
      handle: input.handle,
      stepId: input.stepId,
      stepIndex: input.stepIndex,
      task: input.task,
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
  definition: WorkflowDefinition,
  handle: CompiledWorkflowPlanHandle,
  task: BobWorkflowTask
): Promise<Record<string, unknown> | undefined> {
  const provided = objectCreate(null) as Record<string, unknown>
  const capabilities = handle.plan.bobProfileBinding.taskCapabilities
  if (hasCapability(capabilities, "task.getAllMetadata")) {
    const method = bindAuditedBobTaskMethod(task, "task.getAllMetadata")
    mergeInputSources(handle, provided, method())
  }
  if (hasCapability(capabilities, "task.getMessages")) {
    const method = bindAuditedBobTaskMethod(task, "task.getMessages")
    const messages = safeArray(method(), MAX_TASK_MESSAGES)
    for (let index = 0; index < messages.length; index += 1) {
      const message = safeRecord(messages[index])
      const meta = safeRecord(message._meta)
      const workflow = safeRecord(meta.workflow)
      mergeKnownInputs(handle, provided, safeRecord(workflow.meta))
      mergeKnownInputs(handle, provided, safeRecord(workflow.inputs))
    }
  }
  return collectBobWorkflowInputs(definition, provided)
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
    if (objectHasOwn(source, id) && source[id] !== undefined) target[id] = source[id]
  }
}

function createCompiledBobAgentProvider(
  handle: CompiledWorkflowPlanHandle,
  task: BobWorkflowTask
): AgentProvider | undefined {
  if (!hasCapability(handle.plan.bobProfileBinding.taskCapabilities, "task.startSubagent")) {
    return undefined
  }
  const startSubagent = bindAuditedBobTaskMethod(task, "task.startSubagent")
  return objectFreeze({
    run: async (input: AgentExecutionInput): Promise<string> => {
      const result = extractSubagentResult(await startSubagent(input.prompt))
      if (result === undefined) throw new Error("Bob subagent returned no usable result text.")
      return result
    }
  })
}

function hasCapability(
  values: readonly string[],
  expected: BobTaskCapabilityName
): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === expected) return true
  return false
}

function safeRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || (objectGetPrototypeOf(value) !== objectPrototype && objectGetPrototypeOf(value) !== null)
  ) return objectFreeze(objectCreate(null) as Record<string, unknown>)
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
