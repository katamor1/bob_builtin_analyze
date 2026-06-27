import { ActionRegistry } from "./actionRegistry"
import {
  CoreWorkflowDefinition,
  EngineStep,
  ResultSourceDefinition,
  WorkflowRunState
} from "./model"
import { ResultSinkRegistry } from "./resultSinkRegistry"
import { RunStateStore } from "./runStateStore"

export interface WorkflowEngineOptions {
  actions: ActionRegistry
  resultSinks: ResultSinkRegistry
  runStore: RunStateStore
}

export interface ResumeRunOptions {
  workflow: CoreWorkflowDefinition
  completeHeldStep?: boolean
}

export class WorkflowEngine {
  private readonly actions: ActionRegistry
  private readonly resultSinks: ResultSinkRegistry
  private readonly runStore: RunStateStore

  constructor(options: WorkflowEngineOptions) {
    this.actions = options.actions
    this.resultSinks = options.resultSinks
    this.runStore = options.runStore
  }

  async runWorkflow(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    const missingInputs = requiredInputs(workflow, inputs)
    const run = await this.runStore.createRun(workflow, inputs)
    if (missingInputs.length > 0) {
      run.status = "failed"
      run.error = `Missing required workflow input(s): ${missingInputs.join(", ")}`
      await this.runStore.saveRun(run)
      return run
    }
    await this.runStore.saveRun(run)
    return this.continueRun(workflow, run, 0)
  }

  async resumeRun(runId: string, options: ResumeRunOptions): Promise<WorkflowRunState> {
    const run = await this.runStore.loadRun(runId)
    if (!run) throw new Error(`Workflow run not found: ${runId}`)
    let startIndex = options.workflow.engineSteps.findIndex((step) => step.id === run.currentStep)
    if (startIndex < 0) startIndex = nextPendingIndex(run)
    if (run.status === "held" && options.completeHeldStep && startIndex >= 0) {
      const held = run.steps[startIndex]
      held.status = "completed"
      held.completedAt = new Date().toISOString()
      run.status = "running"
      startIndex += 1
    }
    await this.runStore.saveRun(run)
    return this.continueRun(options.workflow, run, Math.max(0, startIndex))
  }

  async retryCurrentStep(runId: string, workflow: CoreWorkflowDefinition): Promise<WorkflowRunState> {
    const run = await this.runStore.loadRun(runId)
    if (!run) throw new Error(`Workflow run not found: ${runId}`)
    const index = workflow.engineSteps.findIndex((step) => step.id === run.currentStep)
    if (index < 0) throw new Error(`Current step is not part of workflow ${workflow.id}: ${run.currentStep ?? "none"}`)
    run.status = "running"
    run.error = undefined
    run.steps[index].status = "pending"
    run.steps[index].error = undefined
    await this.runStore.saveRun(run)
    return this.continueRun(workflow, run, index)
  }

  private async continueRun(workflow: CoreWorkflowDefinition, run: WorkflowRunState, startIndex: number): Promise<WorkflowRunState> {
    for (let index = startIndex; index < workflow.engineSteps.length; index += 1) {
      const step = workflow.engineSteps[index]
      const stepState = run.steps[index]
      run.currentStep = step.id
      run.status = "running"
      stepState.status = "running"
      stepState.startedAt = stepState.startedAt ?? new Date().toISOString()
      await this.runStore.saveRun(run)

      const stepResult = await this.executeStep(workflow, run, step)
      if (!stepResult.ok) {
        stepState.status = stepResult.held ? "held" : "failed"
        stepState.error = stepResult.error
        run.status = stepResult.held ? "held" : "failed"
        run.error = stepResult.error
        run.currentStep = step.id
        await this.runStore.saveRun(run)
        return run
      }

      stepState.status = "completed"
      stepState.completedAt = new Date().toISOString()
      stepState.error = undefined
      await this.runStore.saveRun(run)
    }

    run.status = "completed"
    run.currentStep = undefined
    run.error = undefined
    await this.runStore.saveRun(run)
    return run
  }

  private async executeStep(workflow: CoreWorkflowDefinition, run: WorkflowRunState, step: EngineStep): Promise<{ ok: true } | { ok: false; held?: boolean; error: string }> {
    if (step.type === "manual") return { ok: false, held: true, error: "Manual workflow step is waiting for completion." }
    if (step.type === "agent") return { ok: false, error: "Bob task adapter is required for agent workflow steps." }
    if (step.type === "command") {
      const args = renderValue(step.action.args, { inputs: run.inputs, state: run.state, run, workflow, step })
      const result = await this.actions.execute(step.action.provider, {
        args,
        inputs: run.inputs,
        state: run.state,
        workflowId: workflow.id,
        runId: run.runId,
        stepId: step.id
      })
      if (!result.ok) return { ok: false, error: result.error ?? `Action provider failed: ${step.action.provider}` }
      if (step.resultKey) run.state[step.resultKey] = formatStateValue(result.value)
      return { ok: true }
    }
    return this.writeResultSinks(workflow, run, step.id, step.result)
  }

  private async writeResultSinks(workflow: CoreWorkflowDefinition, run: WorkflowRunState, stepId: string, result: ResultSourceDefinition): Promise<{ ok: true } | { ok: false; error: string }> {
    const text = resultText(run, result)
    for (const sink of result.sinks) {
      const write = await this.resultSinks.write(sink, {
        workflowId: workflow.id,
        runId: run.runId,
        stepId,
        text
      })
      if (!write.ok) return { ok: false, error: write.error ?? `Result sink failed: ${sink.type}` }
    }
    return { ok: true }
  }
}

function resultText(run: WorkflowRunState, result: ResultSourceDefinition): string {
  if (result.source === "literal") return result.text
  if (result.source === "agent") throw new Error("Agent result source is not available outside Bob task execution.")
  const value = run.state[result.stateKey]
  if (value === undefined) throw new Error(`Workflow state is missing: ${result.stateKey}`)
  return value
}

function formatStateValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

function requiredInputs(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): string[] {
  return Object.entries(workflow.inputs)
    .filter(([, definition]) => definition.required)
    .map(([key]) => key)
    .filter((key) => inputs[key] === undefined || inputs[key] === "")
}

function nextPendingIndex(run: WorkflowRunState): number {
  return run.steps.findIndex((step) => step.status === "pending" || step.status === "held" || step.status === "failed")
}

function renderValue(value: unknown, context: { inputs: Record<string, unknown>; state: Record<string, string>; run: WorkflowRunState; workflow: CoreWorkflowDefinition; step: EngineStep }): unknown {
  if (typeof value === "string") return renderTemplate(value, context)
  if (Array.isArray(value)) return value.map((item) => renderValue(item, context))
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) output[key] = renderValue(item, context)
    return output
  }
  return value
}

function renderTemplate(value: string, context: { inputs: Record<string, unknown>; state: Record<string, string>; run: WorkflowRunState; workflow: CoreWorkflowDefinition; step: EngineStep }): string {
  return value
    .replace(/\{\{\s*inputs\.([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key) => String(context.inputs[key] ?? ""))
    .replace(/\{\{\s*state\.([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key) => String(context.state[key] ?? ""))
    .replace(/\{\{\s*run\.id\s*\}\}/g, context.run.runId)
    .replace(/\{\{\s*workflow\.id\s*\}\}/g, context.workflow.id)
    .replace(/\{\{\s*step\.id\s*\}\}/g, context.step.id)
}
