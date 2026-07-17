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
      label: `${minutes}分`,
      description: "一時的にワークフローの実行を許可",
      detail: `自動一時停止: ${automaticPause.kind}`,
      minutes
    })),
    { title: "自動一時停止を一時解除する時間を選択" }
  )
  if (!picked) return false

  const reason = await vscode.window.showInputBox({
    title: "自動一時停止したワークフローを再開",
    prompt: `${picked.minutes}分間、実行を続ける理由`,
    placeHolder: "この実行を一時的に続けてよい理由を入力してください。",
    validateInput: (value) => value.trim() ? undefined : "一時解除の理由を入力してください。"
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
