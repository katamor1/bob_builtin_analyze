const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  running: "実行中",
  paused: "一時停止",
  checkpoint: "分岐確認待ち",
  reviewing: "人による確認待ち",
  held: "手動操作待ち",
  completed: "完了",
  failed: "失敗"
}

const STEP_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "未開始",
  running: "実行中",
  reviewing: "人による確認待ち",
  held: "手動操作待ち",
  completed: "完了",
  failed: "失敗",
  skipped: "省略"
}

function labelOrUnknown(value: string, labels: Readonly<Record<string, string>>): string {
  return labels[value] ?? `不明（${value}）`
}

export function workflowRunStatusLabel(value: string): string {
  return labelOrUnknown(value, RUN_STATUS_LABELS)
}

export function workflowStepStatusLabel(value: string): string {
  return labelOrUnknown(value, STEP_STATUS_LABELS)
}

export function workflowStepCompletionLabel(completion: string, runStatus: string): string {
  return completion === "reused" ? "再利用" : workflowStepStatusLabel(runStatus)
}
