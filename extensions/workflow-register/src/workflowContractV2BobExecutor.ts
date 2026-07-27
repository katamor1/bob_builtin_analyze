import { types as utilTypes } from "node:util"

import {
  continueCompiledWorkflowRun,
  executeCompiledWorkflowRun,
  type CompiledWorkflowRunStore
} from "./core/contractV2/compiledRunExecutor"
import type { CompiledWorkflowPlanHandle } from "./core/contractV2/compiledPlan"
import type { WorkflowPlanLease } from "./core/contractV2/planLease"
import { runWithWorkflowContractV2PlanLease } from "./core/contractV2/runPlanProvenance"
import type { AgentProvider, WorkflowRunState } from "./core/model"
import type { BobWorkflowTask } from "./bobWorkflowTypes"

export interface WorkflowContractV2BobStepInput {
  readonly handle: CompiledWorkflowPlanHandle
  readonly stepId: string
  readonly stepIndex: number
  readonly task: BobWorkflowTask
  readonly workspaceRoot: string
  readonly allowOutOfOrder: boolean
}

export interface WorkflowContractV2BobExecutorOptions {
  readonly acquireLease: (
    handle: CompiledWorkflowPlanHandle
  ) => Promise<WorkflowPlanLease> | WorkflowPlanLease
  readonly resolveInputs: (
    task: BobWorkflowTask
  ) => Promise<Readonly<Record<string, unknown>> | undefined>
    | Readonly<Record<string, unknown>>
    | undefined
  readonly createRunStore: (workspaceRoot: string) => CompiledWorkflowRunStore
  readonly createAgentProvider: (task: BobWorkflowTask) => AgentProvider | undefined
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
const promiseResolve = Function.prototype.call.bind(Promise.resolve, Promise) as <T>(
  value: T | PromiseLike<T>
) => Promise<Awaited<T>>
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, BobCompiledSession>, key: object
) => BobCompiledSession | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, BobCompiledSession>, key: object, value: BobCompiledSession
) => WeakMap<object, BobCompiledSession>
const WeakMapConstructor = WeakMap

export class WorkflowContractV2BobExecutor {
  private readonly sessions = new WeakMapConstructor<object, BobCompiledSession>()
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

  async runStep(input: WorkflowContractV2BobStepInput): Promise<boolean> {
    const task = requireTask(input.task)
    const stepIndex = requireStepIndex(input.stepIndex)
    const step = input.handle.plan.workflow.steps[stepIndex]
    if (step === undefined || step.id !== input.stepId) {
      throw new TypeError("Compiled Bob step does not match its plan handle.")
    }
    if (typeof input.workspaceRoot !== "string" || input.workspaceRoot.length === 0) {
      throw new TypeError("Compiled Bob workflow workspace root is invalid.")
    }

    const existing = weakMapGet(this.sessions, task)
    if (existing !== undefined) {
      if (existing.handle !== input.handle || existing.workspaceRoot !== input.workspaceRoot) {
        throw new TypeError("Bob task session belongs to a different compiled plan.")
      }
      const durable = await existing.runStore.loadRun(existing.runId)
      if (durable === undefined) {
        throw new TypeError("Live Bob task session lost its durable run; R6 recovery is required.")
      }
      const recorded = durable.steps[stepIndex]
      if (recorded === undefined || recorded.id !== input.stepId) {
        throw new TypeError("Bob task session step evidence does not match the compiled plan.")
      }
      if (recorded.status === "completed" || (recorded.status === "failed" && step.required === false)) {
        return true
      }
      if (durable.status === "completed" || durable.status === "failed") return false
      if (durable.status !== "paused" || existing.lease.released) {
        throw new TypeError(
          "Live Bob task continuation requires a paused run and its retained lease; R6 reconciliation is required."
        )
      }
      if (durable.currentStep !== input.stepId) {
        throw new TypeError("Bob task session is not positioned at the requested compiled step.")
      }
      const run = await this.runContinuation({
        lease: existing.lease,
        runId: existing.runId,
        options: {
          executionMode: "singleStep",
          stepId: input.stepId,
          allowOutOfOrder: input.allowOutOfOrder
        },
        workspaceRoot: existing.workspaceRoot,
        runStore: existing.runStore,
        signal: new AbortController().signal,
        agentProvider: this.options.createAgentProvider(input.task)
      })
      return stepSucceeded(run, stepIndex, step.required)
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
      const inputs = await promiseResolve(this.options.resolveInputs(input.task))
      if (inputs === undefined) {
        lease.release()
        return false
      }
      const runStore = this.options.createRunStore(input.workspaceRoot)
      const agentProvider = this.options.createAgentProvider(input.task)
      const bindSession = (run: WorkflowRunState): void => {
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
        weakMapSet(this.sessions, task, session)
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
      return stepSucceeded(run, stepIndex, step.required)
    } catch (error) {
      if (session === undefined && !lease.released) lease.release()
      throw error
    }
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
