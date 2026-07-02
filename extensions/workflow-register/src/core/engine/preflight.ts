import * as fs from "fs/promises"
import * as path from "path"
import { CoreWorkflowDefinition, WorkflowRunState } from "../model"

export interface WorkflowPreflightCheckInput {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  checkId: string
}

export type WorkflowPreflightCheckResult = boolean | string | { ok: boolean; error?: string }

export type WorkflowPreflightChecks = Record<string, (input: WorkflowPreflightCheckInput) => Promise<WorkflowPreflightCheckResult> | WorkflowPreflightCheckResult>

export function createDefaultPreflightChecks(workspaceRoot: string | undefined): WorkflowPreflightChecks {
  if (!workspaceRoot) return {}
  return {
    workspaceOpen: () => true,
    bobWorkspaceInitialized: () => exists(path.join(workspaceRoot, ".bob")),
    bazaarRepository: () => exists(path.join(workspaceRoot, ".bzr"))
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export function formatPreflightCheckFailure(result: WorkflowPreflightCheckResult): string | undefined {
  if (result === true) return undefined
  if (result === false) return "check returned false"
  if (typeof result === "string") return result
  return result.ok ? undefined : result.error ?? "check failed"
}
