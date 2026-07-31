import { types as utilTypes } from "node:util"

import type { AuditedBobTaskBinding } from "./core/contractV2/bobTaskMethodBinding"
import {
  continueCompiledWorkflowRun,
  executeCompiledWorkflowRun,
  type CompiledWorkflowRunStore
} from "./core/contractV2/compiledRunExecutor"
import type { CompiledWorkflowPlanHandle } from "./core/contractV2/compiledPlan"
import { findCompiledStepIndex } from "./core/contractV2/compiledRunValues"
import type { WorkflowPlanLease } from "./core/contractV2/planLease"
import {
  adoptWorkflowContractV2RunPlanLease,
  runWithWorkflowContractV2PlanLease
} from "./core/contractV2/runPlanProvenance"
import type { AgentProvider, WorkflowRunState } from "./core/model"
import type { BobWorkflowTask } from "./bobWorkflowTypes"

export interface WorkflowContractV2BobStepInput {
  readonly handle: CompiledWorkflowPlanHandle
  readonly stepId: string
  readonly stepIndex: number
  readonly task: BobWorkflowTask
  readonly auditedTask: AuditedBobTaskBinding
  readonly workspaceRoot: string
  readonly allowOutOfOrder: boolean
}

export interface WorkflowContractV2BobExecutorOptions {
  readonly acquireLease: (
    handle: CompiledWorkflowPlanHandle
  ) => Promise<WorkflowPlanLease> | WorkflowPlanLease
  readonly resolveInputs: (
    task: AuditedBobTaskBinding
  ) => Promise<Readonly<Record<string, unknown>> | undefined>
    | Readonly<Record<string, unknown>>
    | undefined
  readonly createRunStore: (workspaceRoot: string) => CompiledWorkflowRunStore
  readonly createAgentProvider: (task: AuditedBobTaskBinding) => AgentProvider | undefined
  readonly runFresh?: typeof executeCompiledWorkflowRun
  readonly runContinuation?: typeof continueCompiledWorkflowRun
  readonly runWithLease?: typeof runWithWorkflowContractV2PlanLease
}

interface BobCompiledSession {
  readonly handle: CompiledWorkflowPlanHandle
  readonly lease: WorkflowPlanLease
  readonly runStore: CompiledWorkflowRunStore
  readonly workspaceRoot: string
  readonly runId: string
}

const isProxy = utilTypes.isProxy
const numberIsSafeInteger = Number.isSafeInteger
const objectFreeze = Object.freeze
const PromiseConstructor = Promise
const promiseResolve = Function.prototype.call.bind(Promise.resolve, Promise) as <T>(
  value: T | PromiseLike<T>
) => Promise<Awaited<T>>
const sessionGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, BobCompiledSession>, key: object
) => BobCompiledSession | undefined
const sessionSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, BobCompiledSession>, key: object, value: BobCompiledSession
) => WeakMap<object, BobCompiledSession>
const operationGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, Promise<void>>, key: object
) => Promise<void> | undefined
const operationSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, Promise<void>>, key: object, value: Promise<void>
) => WeakMap<object, Promise<void>>
const operationDelete = Function.prototype.call.bind(WeakMap.prototype.delete) as (
  map: WeakMap<object, Promise<void>>, key: object
) => boolean
const WeakMapConstructor = WeakMap
const RESOLVED_OPERATION = promiseResolve(undefined)
const MAX_BOB_ROUTE_DISPATCHES = 4_096

export class WorkflowContractV2BobExecutor {
  private readonly sessions = new WeakMapConstructor<object, BobCompiledSession>()
  private readonly taskOperations = new WeakMapConstructor<object, Promise<void>>()
  private readonly runFresh: typeof executeCompiledWorkflowRun
  private readonly runContinuation: typeof continueCompiledWorkflowRun
  private readonly runWithLease: typeof runWithWorkflowContractV2PlanLease

  constructor(private readonly options: WorkflowContractV2BobExecutorOptions) {
    if (
      options === null
      || typeof options !== "object"
      || isProxy(options)
      || typeof options.acquireLease !== "function"
      || typeof options.resolveInputs !== "function"
      || typeof options.createRunStore !== "function"
      || typeof options.createAgentProvider !== "function"
    ) throw new TypeError("Compiled Bob executor options are invalid.")
    this.runFresh = options.runFresh ?? executeCompiledWorkflowRun
    this.runContinuation = options.runContinuation ?? continueCompiledWorkflowRun
    this.runWithLease = options.runWithLease ?? runWithWorkflowContractV2PlanLease
  }

  runStep(input: WorkflowContractV2BobStepInput): Promise<boolean> {
    const task = requireTask(input.task)
    return coordinateBobTaskOperation(this.taskOperations, task, () => this.runStepOwned(input, task))
  }

  private async runStepOwned(
    input: WorkflowContractV2BobStepInput,
    task: object
  ): Promise<boolean> {
    const stepIndex = requireStepIndex(input.stepIndex)
    const step = input.handle.plan.workflow.steps[stepIndex]
    if (step === undefined || step.id !== input.stepId) {
      throw new TypeError("Compiled Bob step does not match its plan handle.")
    }
    if (typeof input.workspaceRoot !== "string" || input.workspaceRoot.length === 0) {
      throw new TypeError("Compiled Bob workflow workspace root is invalid.")
    }

    const existing = sessionGet(this.sessions, task)
    if (existing !== undefined) {
      if (existing.handle !== input.handle || existing.workspaceRoot !== input.workspaceRoot) {
        throw new TypeError("Bob task session belongs to a different compiled plan.")
      }
      return this.driveRecordedBobRoute(existing, input, stepIndex)
    }

    if (stepIndex !== 0) {
      throw new TypeError("A later compiled Bob step requires its live Bob task session; R6 recovery is required.")
    }

    const lease = await promiseResolve(this.options.acquireLease(input.handle))
    if (lease.handle !== input.handle) {
      lease.release()
      throw new TypeError("Compiled Bob lease does not contain the registered plan handle.")
    }
    let session: BobCompiledSession | undefined
    try {
      const inputs = await promiseResolve(this.options.resolveInputs(input.auditedTask))
      if (inputs === undefined) {
        lease.release()
        return false
      }
      const runStore = this.options.createRunStore(input.workspaceRoot)
      const agentProvider = this.options.createAgentProvider(input.auditedTask)
      const bindSession = (run: WorkflowRunState): void => {
        if (run.planProvenance !== undefined) {
          adoptWorkflowContractV2RunPlanLease(input.workspaceRoot, run, lease)
        }
        if (session !== undefined) {
          if (session.runId !== run.runId) {
            throw new TypeError("Compiled Bob execution attempted to replace its live durable run.")
          }
          return
        }
        session = objectFreeze({
          handle: input.handle,
          lease,
          runStore,
          workspaceRoot: input.workspaceRoot,
          runId: run.runId
        })
        sessionSet(this.sessions, task, session)
      }
      const run = await this.runWithLease(lease, () => this.runFresh({
        lease,
        inputs,
        options: {
          executionMode: "singleStep",
          stepId: input.stepId,
          allowOutOfOrder: input.allowOutOfOrder
        },
        workspaceRoot: input.workspaceRoot,
        runStore,
        signal: new AbortController().signal,
        agentProvider,
        onRunCreated: bindSession
      }))
      bindSession(run)
      const activeSession = session
      if (activeSession === undefined) {
        throw new TypeError("Compiled Bob execution did not bind its durable run session.")
      }
      return this.driveRecordedBobRoute(activeSession, input, stepIndex)
    } catch (error) {
      if (session === undefined && !lease.released) lease.release()
      throw error
    }
  }

  private async driveRecordedBobRoute(
    session: BobCompiledSession,
    input: WorkflowContractV2BobStepInput,
    requestedIndex: number
  ): Promise<boolean> {
    const requested = session.handle.plan.workflow.steps[requestedIndex]
    if (requested === undefined || requested.id !== input.stepId) {
      throw new TypeError("Bob task requested step does not match its compiled plan.")
    }

    for (let dispatches = 0; dispatches < MAX_BOB_ROUTE_DISPATCHES; dispatches += 1) {
      const durable = await session.runStore.loadRun(session.runId)
      if (durable === undefined) {
        throw new TypeError("Live Bob task session lost its durable run; R6 recovery is required.")
      }
      if (durable.status === "completed" || durable.status === "failed") {
        return stepSucceeded(durable, requestedIndex, requested.required)
      }
      if (durable.status === "held" || durable.status === "reviewing" || durable.status === "checkpoint") {
        return stepSucceeded(durable, requestedIndex, requested.required)
      }
      if (durable.status !== "paused" || session.lease.released) {
        throw new TypeError(
          "Live Bob task continuation requires a paused run and its retained lease; R6 reconciliation is required."
        )
      }
      if (durable.currentStep === undefined) {
        throw new TypeError("Paused Bob task session has no recorded compiled route target.")
      }
      const targetIndex = findCompiledStepIndex(session.handle.plan.workflow.steps, durable.currentStep)
      if (targetIndex < 0) {
        throw new TypeError("Recorded Bob task route target is unavailable in the compiled plan.")
      }
      if (targetIndex > requestedIndex) {
        return true
      }
      const targetStep = session.handle.plan.workflow.steps[targetIndex]
      const run = await this.runContinuation({
        lease: session.lease,
        runId: session.runId,
        options: {
          executionMode: "singleStep",
          stepId: targetStep.id,
          allowOutOfOrder: true
        },
        workspaceRoot: session.workspaceRoot,
        runStore: session.runStore,
        signal: new AbortController().signal,
        agentProvider: this.options.createAgentProvider(input.auditedTask)
      })
      if (run.status === "completed" || run.status === "failed") {
        return stepSucceeded(run, requestedIndex, requested.required)
      }
      if (run.status !== "paused") {
        return stepSucceeded(run, requestedIndex, requested.required)
      }
    }
    throw new TypeError("Compiled Bob route exceeded its in-process dispatch limit.")
  }
}

async function coordinateBobTaskOperation<T>(
  operations: WeakMap<object, Promise<void>>,
  task: object,
  operation: () => Promise<T>
): Promise<T> {
  const previous = operationGet(operations, task) ?? RESOLVED_OPERATION
  let release!: () => void
  const current = new PromiseConstructor<void>((resolve) => { release = resolve })
  operationSet(operations, task, current)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (operationGet(operations, task) === current) operationDelete(operations, task)
  }
}

function requireTask(value: unknown): object {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError("Compiled Bob execution requires an ordinary task object.")
  }
  return value
}

function requireStepIndex(value: unknown): number {
  if (typeof value !== "number" || !numberIsSafeInteger(value) || value < 0 || value > 511) {
    throw new TypeError("Compiled Bob step index is invalid.")
  }
  return value
}

function stepSucceeded(run: WorkflowRunState, index: number, required: boolean): boolean {
  const step = run.steps[index]
  if (step === undefined) return false
  if (step.status === "completed") return true
  return step.status === "failed" && required === false
}
