import type { WorkflowRunControlLimitsDefinition } from "../model"
import { assertWorkflowRunStateWritable } from "./runStateCodec"
import { FileRunStateStore } from "./runStateStore"
import { readContainedRunFile, writeContainedRunFile } from "./runStatePath"
import { syncRunMaterializedFile } from "./runDurabilityPath"

export type RunPauseMode = "afterCurrentStep" | "beforeNextAiCall"

export interface WorkflowAutomaticPauseOverride {
  schemaVersion: "workflow-register/automatic-pause-override/v1"
  createdAt: string
  expiresAt: string
  requestedBy: string
  reason: string
}

export interface RunControlState {
  schemaVersion: "workflow-register/run-control/v1"
  runId: string
  pauseRequestedAt?: string
  pauseReason?: string
  requestedBy?: string
  mode?: RunPauseMode
  clearedAt?: string
  resumeNote?: string
  automaticPauseOverride?: WorkflowAutomaticPauseOverride
}

export interface PauseRequestInput {
  runId: string
  reason?: string
  requestedBy?: string
  mode?: RunPauseMode
}

export interface AutomaticPauseOverrideInput {
  runId: string
  durationMinutes: number
  reason: string
  requestedBy?: string
}

export interface RunControlStore {
  requestPause: (input: PauseRequestInput) => Promise<RunControlState>
  clearPause: (runId: string) => Promise<RunControlState>
  loadControl: (runId: string) => Promise<RunControlState | undefined>
  isPauseRequested: (runId: string) => Promise<boolean>
  recordResumeNote?: (runId: string, note: string) => Promise<RunControlState>
  setAutomaticPauseOverride?: (input: AutomaticPauseOverrideInput) => Promise<RunControlState>
  clearAutomaticPauseOverride?: (runId: string) => Promise<RunControlState>
  currentDate?: () => Date
  workspaceAutomaticPauseLimits?: WorkflowRunControlLimitsDefinition
}

export interface FileRunControlStoreOptions {
  workspaceRoot: string
  now?: () => string
  workspaceAutomaticPauseLimits?: WorkflowRunControlLimitsDefinition
}

export class FileRunControlStore implements RunControlStore {
  private readonly workspaceRoot: string
  private readonly now: () => string
  readonly workspaceAutomaticPauseLimits?: WorkflowRunControlLimitsDefinition

  constructor(options: FileRunControlStoreOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.now = options.now ?? (() => new Date().toISOString())
    this.workspaceAutomaticPauseLimits = options.workspaceAutomaticPauseLimits
  }

  currentDate(): Date {
    return new Date(this.now())
  }

  async requestPause(input: PauseRequestInput): Promise<RunControlState> {
    await this.requireWritableRun(input.runId)
    const existing = await this.loadControl(input.runId)
    const next: RunControlState = {
      ...(existing ?? { schemaVersion: "workflow-register/run-control/v1", runId: input.runId }),
      schemaVersion: "workflow-register/run-control/v1",
      runId: input.runId,
      pauseRequestedAt: this.now(),
      pauseReason: input.reason ?? existing?.pauseReason ?? "manual",
      requestedBy: input.requestedBy ?? existing?.requestedBy ?? "user",
      mode: input.mode ?? existing?.mode ?? "afterCurrentStep",
      clearedAt: undefined
    }
    await this.saveControl(next)
    return next
  }

  async clearPause(runId: string): Promise<RunControlState> {
    await this.requireWritableRun(runId)
    const existing = await this.loadControl(runId)
    const next: RunControlState = {
      ...(existing ?? { schemaVersion: "workflow-register/run-control/v1", runId }),
      schemaVersion: "workflow-register/run-control/v1",
      runId,
      pauseRequestedAt: undefined,
      pauseReason: undefined,
      requestedBy: undefined,
      mode: undefined,
      clearedAt: this.now()
    }
    await this.saveControl(next)
    return next
  }

  async setAutomaticPauseOverride(input: AutomaticPauseOverrideInput): Promise<RunControlState> {
    await this.requireWritableRun(input.runId)
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) {
      throw new Error("Automatic pause override durationMinutes must be an integer between 1 and 1440.")
    }
    const reason = input.reason.trim()
    if (!reason) throw new Error("Automatic pause override reason is required.")
    const createdAt = this.now()
    const createdAtMs = Date.parse(createdAt)
    if (!Number.isFinite(createdAtMs)) throw new Error("Automatic pause override clock returned an invalid timestamp.")
    const existing = await this.loadControl(input.runId)
    const next: RunControlState = {
      ...(existing ?? { schemaVersion: "workflow-register/run-control/v1", runId: input.runId }),
      schemaVersion: "workflow-register/run-control/v1",
      runId: input.runId,
      automaticPauseOverride: {
        schemaVersion: "workflow-register/automatic-pause-override/v1",
        createdAt,
        expiresAt: new Date(createdAtMs + input.durationMinutes * 60_000).toISOString(),
        requestedBy: input.requestedBy ?? "user",
        reason
      }
    }
    await this.saveControl(next)
    return next
  }

  async clearAutomaticPauseOverride(runId: string): Promise<RunControlState> {
    await this.requireWritableRun(runId)
    const existing = await this.loadControl(runId)
    const next: RunControlState = {
      ...(existing ?? { schemaVersion: "workflow-register/run-control/v1", runId }),
      schemaVersion: "workflow-register/run-control/v1",
      runId,
      automaticPauseOverride: undefined
    }
    await this.saveControl(next)
    return next
  }

  async loadControl(runId: string): Promise<RunControlState | undefined> {
    try {
      const snapshot = await readContainedRunFile(this.workspaceRoot, runId, "control.json")
      const parsed = JSON.parse(snapshot.bytes.toString("utf8")) as RunControlState
      if (parsed?.schemaVersion !== "workflow-register/run-control/v1") return undefined
      if (parsed.runId !== runId) {
        throw new Error(`Workflow run control id mismatch: expected '${runId}', got '${parsed.runId}'.`)
      }
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }

  async isPauseRequested(runId: string): Promise<boolean> {
    const control = await this.loadControl(runId)
    return Boolean(control?.pauseRequestedAt && !control.clearedAt)
  }

  async recordResumeNote(runId: string, note: string): Promise<RunControlState> {
    await this.requireWritableRun(runId)
    const existing = await this.loadControl(runId)
    const next: RunControlState = {
      ...(existing ?? { schemaVersion: "workflow-register/run-control/v1", runId }),
      schemaVersion: "workflow-register/run-control/v1",
      runId,
      resumeNote: note
    }
    await this.saveControl(next)
    return next
  }

  private async requireWritableRun(runId: string): Promise<void> {
    const run = await new FileRunStateStore({ workspaceRoot: this.workspaceRoot }).loadRun(runId)
    if (!run) throw new Error(`Workflow run not found: ${runId}`)
    assertWorkflowRunStateWritable(run)
  }

  private async saveControl(control: RunControlState): Promise<void> {
    await writeContainedRunFile(
      this.workspaceRoot,
      control.runId,
      `${JSON.stringify(control, null, 2)}\n`,
      "control.json"
    )
    await syncRunMaterializedFile(this.workspaceRoot, control.runId, "control.json")
  }
}
