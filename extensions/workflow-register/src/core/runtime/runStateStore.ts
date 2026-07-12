import { randomUUID } from "crypto"
import { CoreWorkflowDefinition, WorkflowRunState } from "../model"
import {
  CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION,
  decodeWorkflowRunState,
  isCurrentWorkflowRunState,
  prepareWorkflowRunStateForWrite,
  RunStateLoadDiagnostic
} from "./runStateCodec"
import { ensureContainedRunStateMigrationBackup } from "./runStateMigrationBackup"
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
  private readonly loadDiagnostics = new Map<string, RunStateLoadDiagnostic>()

  constructor(options: FileRunStateStoreOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.now = options.now ?? (() => new Date().toISOString())
    this.engineVersion = options.engineVersion
  }

  async createRun(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    const createdAt = this.now()
    const runId = await this.nextRunId(workflow.name, createdAt)
    return {
      schemaVersion: CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION,
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
    const prepared = prepareWorkflowRunStateForWrite(run)
    const updatedAt = this.now()
    const persisted = { ...prepared, updatedAt }
    await writeContainedRunFile(this.workspaceRoot, run.runId, serializeRun(persisted))
    run.schemaVersion = CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION
    run.updatedAt = updatedAt
  }

  async loadRun(runId: string): Promise<WorkflowRunState | undefined> {
    try {
      const snapshot = await readContainedRunFile(this.workspaceRoot, runId)
      const text = snapshot.bytes.toString("utf8")
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch (error) {
        throw new Error(`Workflow run '${runId}' contains invalid JSON: ${formatError(error)}`)
      }

      const decoded = decodeWorkflowRunState(value, runId)
      if (decoded.migrated) {
        await ensureContainedRunStateMigrationBackup(this.workspaceRoot, runId, text)
        await writeContainedRunFile(this.workspaceRoot, runId, serializeRun(decoded.run))
        this.setLoadDiagnostic({
          runId,
          severity: "info",
          code: "migrated",
          message: decoded.diagnostics[0]
        })
      } else if (decoded.readOnly) {
        this.setLoadDiagnostic({
          runId,
          severity: "warning",
          code: "read-only",
          message: decoded.diagnostics[0]
        })
      } else {
        this.clearTransientLoadDiagnostic(runId)
      }
      return decoded.run
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT") return undefined
      this.setLoadDiagnostic({
        runId,
        severity: "error",
        code: "invalid",
        message: formatError(error)
      })
      throw error
    }
  }

  async listRuns(): Promise<WorkflowRunState[]> {
    const entries = await listContainedRunIds(this.workspaceRoot)
    const runs = await Promise.all(entries.map(async (entry) => {
      try {
        return await this.loadRun(entry)
      } catch {
        return undefined
      }
    }))
    return runs
      .filter((run): run is WorkflowRunState => Boolean(run))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getLoadDiagnostics(): RunStateLoadDiagnostic[] {
    const severityOrder: Record<RunStateLoadDiagnostic["severity"], number> = {
      error: 0,
      warning: 1,
      info: 2
    }
    return [...this.loadDiagnostics.values()]
      .map((diagnostic) => ({ ...diagnostic }))
      .sort((left, right) =>
        compareText(left.runId, right.runId)
        || severityOrder[left.severity] - severityOrder[right.severity]
        || compareText(left.code, right.code)
        || compareText(left.message, right.message)
      )
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

  private setLoadDiagnostic(diagnostic: RunStateLoadDiagnostic): void {
    this.loadDiagnostics.set(diagnostic.runId, diagnostic)
  }

  private clearTransientLoadDiagnostic(runId: string): void {
    const existing = this.loadDiagnostics.get(runId)
    if (existing && existing.code !== "migrated") this.loadDiagnostics.delete(runId)
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
  if (!isCurrentWorkflowRunState(run)) return false
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

function serializeRun(run: WorkflowRunState): string {
  return `${JSON.stringify(run, null, 2)}\n`
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
