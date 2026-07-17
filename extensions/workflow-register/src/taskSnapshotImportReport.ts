import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import type {
  TaskSnapshotArtifactImportPreview,
  TaskSnapshotImportPreviewCandidate
} from "./core/artifacts/taskSnapshotImportPreview"

export interface TaskSnapshotImportSelectionItem {
  artifactId: string
  label: string
  description: string
  detail: string
  picked: boolean
  requiresOverwrite: boolean
}

export interface TaskSnapshotImportSelection {
  selectedArtifactIds: string[]
  overwriteExisting: boolean
}

export interface TaskSnapshotImportPromptAdapter {
  showPreview: (lines: string[]) => Promise<void> | void
  pickArtifacts: (items: TaskSnapshotImportSelectionItem[]) => Promise<string[] | undefined> | string[] | undefined
  confirmOverwrite: (count: number) => Promise<boolean> | boolean
}

export function formatTaskSnapshotImportPreviewReport(input: {
  preview: TaskSnapshotArtifactImportPreview
  run: Pick<WorkflowRunState, "runId" | "workflowId" | "status">
  workflow: Pick<CoreWorkflowDefinition, "id" | "label">
}): string[] {
  const lines = [
    `- 実行 ID（runId）: ${input.run.runId}`,
    `- 実行状態: ${runStatusLabel(input.run.status)}`,
    `- ワークフロー: ${input.workflow.label} (${input.workflow.id})`,
    `- プレビュー識別子: ${input.preview.previewDigest}`,
    `- 候補: ${input.preview.candidates.length}件`,
    "",
    "プレビューは読み取り専用です。成果物ファイル、マニフェスト、実行状態は、選択と確認が完了した後にだけ変更されます。"
  ]

  for (const candidate of input.preview.candidates) lines.push(...formatCandidate(candidate))
  if (input.preview.issues.length > 0) {
    lines.push("", "## プレビューの確認事項")
    for (const issue of input.preview.issues) {
      const scope = issue.artifactId ? `${issue.artifactId}: ` : ""
      lines.push(`- ${issue.severity}: ${scope}${issue.message}`)
    }
  }
  return lines
}

export function taskSnapshotImportSelectionItems(
  preview: TaskSnapshotArtifactImportPreview
): TaskSnapshotImportSelectionItem[] {
  return preview.candidates.map((candidate) => ({
    artifactId: candidate.artifactId,
    label: `${candidate.artifactId} — ${candidate.stepTitle}`,
    description: candidate.defaultSelected ? "既定で選択" : "確認が必要",
    detail: [
      `ステップ=${candidate.stepId}`,
      `抽出元=${candidate.extractionSource}`,
      `保存先=${candidate.path}`,
      `${candidate.bytes}バイト`,
      candidate.existing.changed ? "変更済みファイルを上書き" : candidate.existing.exists ? "既存ファイルと同一" : "新規ファイル",
      candidate.truncated ? "一部省略あり" : undefined,
      candidate.redactionPossible ? "伏字の可能性あり" : undefined
    ].filter((value): value is string => Boolean(value)).join("; "),
    picked: candidate.defaultSelected,
    requiresOverwrite: candidate.existing.changed
  }))
}

export async function chooseTaskSnapshotImportSelection(input: {
  preview: TaskSnapshotArtifactImportPreview
  run: Pick<WorkflowRunState, "runId" | "workflowId" | "status">
  workflow: Pick<CoreWorkflowDefinition, "id" | "label">
  prompts: TaskSnapshotImportPromptAdapter
}): Promise<TaskSnapshotImportSelection | undefined> {
  await Promise.resolve(input.prompts.showPreview(formatTaskSnapshotImportPreviewReport(input)))
  const items = taskSnapshotImportSelectionItems(input.preview)
  const picked = await Promise.resolve(input.prompts.pickArtifacts(items))
  if (picked === undefined) return undefined
  const selectedSet = new Set(picked)
  const selectedArtifactIds = input.preview.candidates
    .filter((candidate) => selectedSet.has(candidate.artifactId))
    .map((candidate) => candidate.artifactId)
  const overwriteCount = input.preview.candidates.filter((candidate) => (
    selectedSet.has(candidate.artifactId) && candidate.existing.changed
  )).length
  if (overwriteCount > 0 && !await Promise.resolve(input.prompts.confirmOverwrite(overwriteCount))) return undefined
  return { selectedArtifactIds, overwriteExisting: overwriteCount > 0 }
}

function formatCandidate(candidate: TaskSnapshotImportPreviewCandidate): string[] {
  const existing = candidate.existing.exists
    ? candidate.existing.changed ? "変更済みの既存ファイル" : "既存ファイルと一致"
    : "新規ファイル"
  const lines = [
    "",
    `## ${candidate.artifactId}`,
    `- ステップ: ${candidate.stepTitle} (${candidate.stepId})`,
    `- 状態キー: ${candidate.stateKey}`,
    `- 保存済みタスク: ${candidate.snapshotCreatedAt}; 理由=${candidate.snapshotReason}`,
    `- 抽出元: ${candidate.extractionSource}`,
    `- 保存先: ${candidate.path}`,
    `- スキーマ: ${candidate.schema ?? "未指定"}`,
    `- サイズ: ${candidate.bytes}バイト`,
    `- チェックサム: ${candidate.sha256}`,
    `- 省略あり: ${candidate.truncated ? "はい" : "いいえ"}`,
    `- 省略したメッセージ数: ${candidate.omittedMessageCount ?? 0}`,
    `- 伏字の可能性: ${candidate.redactionPossible ? "あり" : "なし"}`,
    `- 保存先の状態: ${existing}`,
    `- 既定で選択: ${candidate.defaultSelected ? "はい" : "いいえ"}`
  ]
  if (candidate.existing.sha256) lines.push(`- 既存ファイルのチェックサム: ${candidate.existing.sha256}`)
  for (const issue of candidate.issues) lines.push(`- ${issue.severity}: ${issue.message}`)
  if (candidate.diff) {
    const fence = markdownFenceFor(candidate.diff)
    lines.push("", `${fence}diff`, candidate.diff.trimEnd(), fence)
  }
  return lines
}

function runStatusLabel(value: string): string {
  return {
    running: "実行中",
    paused: "一時停止",
    checkpoint: "分岐確認待ち",
    reviewing: "人による確認待ち",
    held: "手動操作待ち",
    completed: "完了",
    failed: "失敗"
  }[value] ?? `不明（${value}）`
}

function markdownFenceFor(value: string): string {
  const longest = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length))
  return "`".repeat(Math.max(3, longest + 1))
}
