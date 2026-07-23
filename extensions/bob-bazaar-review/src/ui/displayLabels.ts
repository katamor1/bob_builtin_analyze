const REVIEW_RUN_PHASE_LABELS: Readonly<Record<string, string>> = {
  target: "レビュー対象",
  packet: "レビュー資料",
  result: "レビュー結果取り込み",
  triage: "指摘確認・振り分け",
  record: "実績記録",
  summary: "集計レポート"
}


const RULE_AUTHORING_PHASE_LABELS: Readonly<Record<string, string>> = {
  sources: "資料の選択",
  extraction: "資料の抽出",
  evidence_selection: "対象範囲の選択",
  proposal: "規約案の作成",
  human_review: "人による確認",
  apply: "反映",
  completed: "完了"
}

const PROPOSAL_ASSET_LABELS: Readonly<Record<string, string>> = {
  rule: "チェックリスト規約",
  project_context: "プロジェクト情報",
  prompt_addendum: "レビュープロンプトの補足"
}

const REVIEW_RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  not_started: "未開始",
  in_progress: "実行中",
  completed: "完了",
  failed: "失敗",
  blocked: "続行不可"
}

const REVIEW_DECISION_LABELS: Readonly<Record<string, string>> = {
  accepted: "採用",
  rejected: "却下",
  needs_investigation: "要調査",
  deferred: "保留",
  pending: "未判定",
  accept: "採用",
  reject: "却下",
  edit: "編集済み"
}

const TARGET_MODE_LABELS: Readonly<Record<string, string>> = {
  singleRevision: "1リビジョン",
  revisionRange: "リビジョン範囲",
  workingTreeSinceRevision: "未コミット差分"
}

const NEXT_REVIEW_ACTION_LABELS: Readonly<Record<string, string>> = {
  review: "レビューを実行",
  resultCapture: "レビュー結果取り込み",
  humanTriage: "指摘確認・振り分け",
  finalize: "完了処理",
  none: "なし"
}

const EXTRACTION_STATUS_LABELS: Readonly<Record<string, string>> = {
  success: "抽出済み",
  partial: "一部のみ抽出",
  blocked: "抽出不可",
  failed: "抽出失敗",
  requires_conversion: "ファイル変換が必要",
  requires_ocr: "OCR が必要",
  duplicate: "重複",
  selected: "未抽出"
}

const PROPOSAL_OPERATION_LABELS: Readonly<Record<string, string>> = {
  add: "追加",
  update: "更新",
  retire: "廃止"
}

const CONFIDENCE_LABELS: Readonly<Record<string, string>> = {
  high: "高",
  medium: "中",
  low: "低"
}

const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  critical: "緊急",
  high: "高",
  medium: "中",
  low: "低",
  error: "エラー",
  warning: "警告",
  info: "情報"
}

function labelOrUnknown(value: string, labels: Readonly<Record<string, string>>): string {
  return labels[value] ?? `不明（${value}）`
}

export function reviewRunPhaseLabel(value: string): string {
  return labelOrUnknown(value, REVIEW_RUN_PHASE_LABELS)
}

export function reviewRunStatusLabel(value: string): string {
  return labelOrUnknown(value, REVIEW_RUN_STATUS_LABELS)
}

export function reviewDecisionLabel(value: string): string {
  return labelOrUnknown(value, REVIEW_DECISION_LABELS)
}

export function targetModeLabel(value: string): string {
  return labelOrUnknown(value, TARGET_MODE_LABELS)
}

export function nextReviewActionLabel(value: string): string {
  return labelOrUnknown(value, NEXT_REVIEW_ACTION_LABELS)
}

export function extractionStatusLabel(value: string): string {
  return labelOrUnknown(value, EXTRACTION_STATUS_LABELS)
}

export function proposalOperationLabel(value: string): string {
  return labelOrUnknown(value, PROPOSAL_OPERATION_LABELS)
}

export function confidenceLabel(value: string): string {
  return labelOrUnknown(value, CONFIDENCE_LABELS)
}

export function severityLabel(value: string): string {
  return labelOrUnknown(value, SEVERITY_LABELS)
}

export function ruleAuthoringPhaseLabel(value: string): string {
  return labelOrUnknown(value, RULE_AUTHORING_PHASE_LABELS)
}

export function proposalAssetLabel(value: string): string {
  return labelOrUnknown(value, PROPOSAL_ASSET_LABELS)
}
