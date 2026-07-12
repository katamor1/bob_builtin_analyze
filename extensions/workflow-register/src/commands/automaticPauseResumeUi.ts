import * as vscode from "vscode"
import { FileRunControlStore } from "../core/runControlStore"
import type { WorkflowRunState } from "../core/model"
import { assertOperationHubRunRevision } from "../operationHubMutationTarget"
import {
  automaticPauseOverrideChoices,
  parseAutomaticPauseState
} from "./automaticPauseResume"

export async function prepareAutomaticPauseResume(input: {
  workspaceRoot: string
  run: WorkflowRunState
  expectedRevision?: string
}): Promise<boolean> {
  const automaticPause = parseAutomaticPauseState(input.run.state["workflow.pause"])
  if (!automaticPause) return true

  const picked = await vscode.window.showQuickPick(
    automaticPauseOverrideChoices.map((minutes) => ({
      label: `${minutes} minutes`,
      description: "Temporarily allow workflow execution",
      detail: `Automatic pause: ${automaticPause.kind}`,
      minutes
    })),
    { title: "Select Automatic Pause Override Duration" }
  )
  if (!picked) return false

  const reason = await vscode.window.showInputBox({
    title: "Resume Automatically Paused Workflow",
    prompt: `Reason for continuing for ${picked.minutes} minutes`,
    placeHolder: "Describe why this run may continue temporarily.",
    validateInput: (value) => value.trim() ? undefined : "Override reason is required."
  })
  if (!reason?.trim()) return false

  if (input.expectedRevision) {
    await assertOperationHubRunRevision(input.workspaceRoot, input.run.runId, input.expectedRevision)
  }
  await new FileRunControlStore({ workspaceRoot: input.workspaceRoot }).setAutomaticPauseOverride({
    runId: input.run.runId,
    durationMinutes: picked.minutes,
    requestedBy: "user",
    reason
  })
  return true
}
