const REVIEW_FOCUS_LABELS: Readonly<Record<string, string>> = {
  "requirement-code-consistency": "要求とコードの整合",
  "design-code-consistency": "設計とコードの整合",
  "test-gap": "テスト不足",
  "document-update-gap": "文書更新漏れ",
  "unintended-change": "意図しない変更",
  "interface-impact": "インターフェース影響",
  "rt-ts-rule": "RT・TS 規約",
  "shared-memory-impact": "共有メモリー影響"
}

const CHANGE_TYPE_LABELS: Readonly<Record<string, string>> = {
  bugfix: "不具合修正",
  feature: "機能追加",
  spec_change: "仕様変更",
  refactor: "リファクタリング",
  performance: "性能改善",
  maintenance: "保守変更"
}

const ARTIFACT_KIND_LABELS: Readonly<Record<string, string>> = {
  requirements: "要求仕様",
  basic_design: "基本設計",
  detailed_design: "詳細設計",
  test_spec: "テスト仕様",
  ledgers: "管理台帳",
  tickets: "チケット"
}

const TRACEABILITY_STATUS_LABELS: Readonly<Record<string, string>> = {
  proposed: "未承認",
  accepted: "採用",
  rejected: "却下",
  deprecated: "廃止"
}

const HUMAN_DECISION_LABELS: Readonly<Record<string, string>> = {
  accepted: "採用",
  rejected: "却下",
  needs_investigation: "要調査",
  deferred: "保留",
  question: "確認依頼"
}

const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  critical: "緊急",
  high: "高",
  medium: "中",
  low: "低",
  info: "情報"
}

const CONFIDENCE_LABELS: Readonly<Record<string, string>> = {
  high: "高",
  medium: "中",
  low: "低"
}

const SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  finding: "指摘",
  question: "確認事項"
}

function labelOrUnknown(value: string, labels: Readonly<Record<string, string>>): string {
  return labels[value] ?? `不明（${value}）`
}

export function reviewFocusLabel(value: string): string {
  return labelOrUnknown(value, REVIEW_FOCUS_LABELS)
}

export function changeTypeLabel(value: string): string {
  return labelOrUnknown(value, CHANGE_TYPE_LABELS)
}

export function artifactKindLabel(value: string): string {
  return labelOrUnknown(value, ARTIFACT_KIND_LABELS)
}

export function traceabilityStatusLabel(value: string): string {
  return labelOrUnknown(value, TRACEABILITY_STATUS_LABELS)
}

export function humanDecisionLabel(value: string): string {
  return labelOrUnknown(value, HUMAN_DECISION_LABELS)
}

export function severityLabel(value: string): string {
  return labelOrUnknown(value, SEVERITY_LABELS)
}

export function confidenceLabel(value: string): string {
  return labelOrUnknown(value, CONFIDENCE_LABELS)
}

export function sourceTypeLabel(value: string): string {
  return labelOrUnknown(value, SOURCE_TYPE_LABELS)
}
