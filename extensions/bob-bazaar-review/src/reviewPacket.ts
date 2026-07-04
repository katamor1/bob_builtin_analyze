import { BazaarCommandResult } from "./bazaar"
import { fencedCodeBlock } from "./markdownFence"
import { clampMaxDiffBytes, truncateUtf8 } from "./reviewLimits"

export interface ReviewPacketOptions {
  repositoryRoot: string
  mode: "singleRevision" | "revisionRange" | "workingTreeSinceRevision"
  revision?: string
  baseRevision?: string
  targetRevision?: string
  log?: BazaarCommandResult
  diff: BazaarCommandResult
  maxDiffBytes: number
  extraSections?: string[]
}

export function buildReviewPacket(options: ReviewPacketOptions): string {
  const revisionLabel = buildRevisionLabel(options)
  const diffText = truncateUtf8(options.diff.stdout, clampMaxDiffBytes(options.maxDiffBytes), "diff")
  const logText = options.log ? truncateUtf8(options.log.stdout, 128 * 1024, "log") : ""

  return [
    "# Bazaar Revision Review Request",
    "",
    `VCS: Bazaar`,
    `Repository root: ${options.repositoryRoot}`,
    `Review mode: ${options.mode}`,
    `Revision target: ${revisionLabel}`,
    "",
    "## Bazaar commands used",
    "",
    fencedCodeBlock("text", [
      `${options.diff.command} ${options.diff.args.join(" ")}`,
      options.log ? `${options.log.command} ${options.log.args.join(" ")}` : ""
    ].filter(Boolean).join("\n")),
    "",
    "## Review instruction for Bob",
    "",
    "このBazaarリビジョンまたはリビジョン範囲で導入された変更をレビューしてください。",
    "",
    "重点観点:",
    "- 不具合混入リスク",
    "- C/C++の境界条件、NULL、範囲外、初期化漏れ",
    "- グローバル変数、外部I/F構造体、共有メモリ、PLC/モーション/センサIFへの影響",
    "- 既存仕様、基本設計、詳細設計、単体テスト仕様との不整合",
    "- エラー処理、ログ、リトライ、タイムアウト、排他制御",
    "- テスト不足、デグレードしやすい条件",
    "",
    "出力形式:",
    "- Finding単位で出力",
    "- severity: error / warning / info",
    "- file path と line range",
    "- evidence",
    "- suggested fix または追加確認項目",
    "",
    ...(options.extraSections ?? []).flatMap((section) => [section, ""]),
    logText ? "## Bazaar log" : "",
    logText ? "" : "",
    logText ? fencedCodeBlock("text", logText) : "",
    logText ? "" : "",
    "## Bazaar diff",
    "",
    fencedCodeBlock("diff", diffText)
  ].filter((line) => line !== undefined).join("\n")
}

function buildRevisionLabel(options: ReviewPacketOptions): string {
  if (options.mode === "singleRevision") {
    return options.revision ?? "unknown"
  }
  if (options.mode === "revisionRange") {
    return `${options.baseRevision ?? "?"}..${options.targetRevision ?? "?"}`
  }
  return `working tree since ${options.baseRevision ?? "current basis"}`
}
