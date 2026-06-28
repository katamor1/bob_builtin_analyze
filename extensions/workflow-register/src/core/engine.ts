import { ActionRegistry } from "./actionRegistry"
import {
  AgentProvider,
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
  agentProvider?: AgentProvider
}

export interface ResumeRunOptions {
  workflow: CoreWorkflowDefinition
  completeHeldStep?: boolean
}

export class WorkflowEngine {
  private readonly actions: ActionRegistry
  private readonly resultSinks: ResultSinkRegistry
  private readonly runStore: RunStateStore
  private readonly agentProvider?: AgentProvider

  constructor(options: WorkflowEngineOptions) {
    this.actions = options.actions
    this.resultSinks = options.resultSinks
    this.runStore = options.runStore
    this.agentProvider = options.agentProvider
  }

  async runWorkflow(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    const inputErrors = validateInputs(workflow, inputs)
    const run = await this.runStore.createRun(workflow, inputs)
    if (inputErrors.length > 0) {
      run.status = "failed"
      run.error = `Invalid workflow input(s): ${inputErrors.join("; ")}`
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
    if (step.type === "agent") {
      if (!this.agentProvider) return { ok: false, error: "Agent provider is required for agent workflow steps." }
      try {
        const prompt = renderTemplate(step.prompt ?? "", { inputs: run.inputs, state: run.state, run, workflow, step })
        const agentText = await Promise.resolve(this.agentProvider.run({
          workflowId: workflow.id,
          runId: run.runId,
          stepId: step.id,
          prompt,
          inputs: run.inputs,
          state: run.state
        }))
        if (step.resultKey) run.state[step.resultKey] = agentText
        if (step.result) return this.writeResultSinks(workflow, run, step.id, step.result, agentText)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
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

  private async writeResultSinks(workflow: CoreWorkflowDefinition, run: WorkflowRunState, stepId: string, result: ResultSourceDefinition, agentText?: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const text = resultText(run, result, agentText)
      for (const sink of result.sinks) {
        const write = await this.resultSinks.write(sink, {
          workflowId: workflow.id,
          runId: run.runId,
          stepId,
          text
        })
        if (!write.ok) return { ok: false, error: write.error ?? `Result sink failed: ${sink.type}` }
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    return { ok: true }
  }
}

function resultText(run: WorkflowRunState, result: ResultSourceDefinition, agentText?: string): string {
  if (result.source === "literal") return result.text
  if (result.source === "agent") {
    if (agentText === undefined) throw new Error("Agent result source is not available for this step.")
    return agentText
  }
  const value = run.state[result.stateKey]
  if (value === undefined) throw new Error(`Workflow state is missing: ${result.stateKey}`)
  return value
}

function formatStateValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

function validateInputs(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): string[] {
  const errors: string[] = []
  for (const [key, definition] of Object.entries(workflow.inputs)) {
    const value = inputs[key]
    if (definition.required && (value === undefined || value === "")) {
      errors.push(`${key} is required`)
      continue
    }
    if (value === undefined || value === "") continue
    if (definition.type === "number" && !isFiniteNumberInput(value)) {
      errors.push(`${key} must be a finite number`)
    } else if (definition.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} must be a boolean`)
    } else if (definition.type === "select" && definition.options && !definition.options.includes(String(value))) {
      errors.push(`${key} must be one of: ${definition.options.join(", ")}`)
    }
  }
  return errors
}

function isFiniteNumberInput(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "string" || !value.trim()) return false
  return Number.isFinite(Number(value))
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
