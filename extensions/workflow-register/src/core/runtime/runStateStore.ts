import { randomUUID } from "crypto"
import { CoreWorkflowDefinition, WorkflowRunState } from "../model"
import {
  listContainedRunIds,
  readContainedRunFile,
  writeContainedRunFile
} from "./runStatePath"

const RECOVERABLE_RUN_STATUSES = new Set(["running", "paused", "checkpoint", "reviewing", "held"])

export interface RecoverableRunLookupOptions {
  executionMode?: "full" | "singleStep"
  stepId?: string
  allowOutOfOrder?: boolean
}

export interface RunStateStore {
  readonly workspaceRoot?: string
  createRun: (workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>) => Promise<WorkflowRunState>
  saveRun: (run: WorkflowRunState) => Promise<void>
  loadRun: (runId: string) => Promise<WorkflowRunState | undefined>
  listRuns: () => Promise<WorkflowRunState[]>
  findRecoverableRun?: (workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>, options?: RecoverableRunLookupOptions) => Promise<WorkflowRunState | undefined>
}

export interface FileRunStateStoreOptions {
  workspaceRoot: string
  now?: () => string
  engineVersion?: string
}

export class FileRunStateStore implements RunStateStore {
  readonly workspaceRoot: string
  private readonly now: () => string
  private readonly engineVersion?: string

  constructor(options: FileRunStateStoreOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.now = options.now ?? (() => new Date().toISOString())
    this.engineVersion = options.engineVersion
  }

  async createRun(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    const createdAt = this.now()
    const runId = await this.nextRunId(workflow.name, createdAt)
    return {
      runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowSchemaVersion: workflow.schemaVersion,
      workflowDefinitionHash: workflow.definitionHash,
      workflowFile: workflow.filePath,
      engineVersion: this.engineVersion,
      status: "running",
      currentStep: workflow.engineSteps[0]?.id,
      inputs,
      state: {},
      steps: workflow.engineSteps.map((step) => ({
        id: step.id,
        title: step.title,
        type: step.type,
        status: "pending"
      })),
      createdAt,
      updatedAt: createdAt
    }
  }

  async saveRun(run: WorkflowRunState): Promise<void> {
    const updatedAt = this.now()
    await writeContainedRunFile(this.workspaceRoot, run.runId, `${JSON.stringify({ ...run, updatedAt }, null, 2)}\n`)
    run.updatedAt = updatedAt
  }

  async loadRun(runId: string): Promise<WorkflowRunState | undefined> {
    try {
      const snapshot = await readContainedRunFile(this.workspaceRoot, runId)
      const run = JSON.parse(snapshot.bytes.toString("utf8")) as WorkflowRunState
      if (run.runId !== runId) throw new Error(`Workflow run id mismatch: expected '${runId}', got '${run.runId}'.`)
      return run
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT") return undefined
      throw error
    }
  }

  async listRuns(): Promise<WorkflowRunState[]> {
    const entries = await listContainedRunIds(this.workspaceRoot)
    const runs = await Promise.all(entries.map((entry) => this.loadRun(entry)))
    return runs
      .filter((run): run is WorkflowRunState => Boolean(run))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async findRecoverableRun(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>, options: RecoverableRunLookupOptions = {}): Promise<WorkflowRunState | undefined> {
    const expectedInputs = stableJson(inputs)
    const runs = await this.listRuns()
    return runs.find((run) => isRecoverableRun(run, workflow, expectedInputs, options))
  }

  private async nextRunId(workflowName: string, createdAt: string): Promise<string> {
    const stamp = createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace(/[^\dTZ]/g, "")
    const base = `${stamp}-${sanitize(workflowName)}`
    for (let index = 0; index < 10; index += 1) {
      const candidate = `${base}-${randomUUID().replace(/-/g, "").slice(0, 12)}`
      if (!await runFileExists(this.workspaceRoot, candidate)) return candidate
    }
    throw new Error(`Could not allocate unique workflow run id for '${workflowName}'.`)
  }

}

async function runFileExists(workspaceRoot: string, runId: string): Promise<boolean> {
  try {
    await readContainedRunFile(workspaceRoot, runId)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

function workflowDefinitionMatches(run: WorkflowRunState, workflow: CoreWorkflowDefinition): boolean {
  if (run.workflowDefinitionHash && workflow.definitionHash && run.workflowDefinitionHash !== workflow.definitionHash) return false
  if (run.workflowFile && workflow.filePath && run.workflowFile !== workflow.filePath) return false
  return true
}

function isRecoverableRun(run: WorkflowRunState, workflow: CoreWorkflowDefinition, expectedInputs: string, options: RecoverableRunLookupOptions): boolean {
  if (run.workflowId !== workflow.id) return false
  if (!workflowDefinitionMatches(run, workflow)) return false
  if (stableJson(run.inputs) !== expectedInputs) return false
  if (RECOVERABLE_RUN_STATUSES.has(run.status)) return true
  if (run.status !== "failed" || options.executionMode !== "singleStep" || !options.stepId) return false
  if (run.currentStep !== options.stepId) return false
  const stepIndex = workflow.engineSteps.findIndex((step) => step.id === options.stepId)
  if (stepIndex < 0) return false
  if (run.steps[stepIndex]?.status !== "failed") return false
  const reviewOrHeldGateIndex = run.steps.slice(0, stepIndex).findIndex((step) => step.status === "reviewing" || step.status === "held")
  if (reviewOrHeldGateIndex >= 0) {
    return run.steps.slice(0, reviewOrHeldGateIndex).every((step) => step.status === "completed")
  }
  return run.steps.slice(0, stepIndex).every((step) => step.status === "completed")
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalJson(value))
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, canonicalJson((value as Record<string, unknown>)[key])])
  )
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workflow"
}
