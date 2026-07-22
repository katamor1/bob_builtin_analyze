import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as vscode from "vscode"
import {
  createReviewRecord,
  createReviewTriage,
  generateReviewCampaignSummary,
  initReviewRecordCampaign,
  validateReviewTriageCommand
} from "../records/reviewRecordCommands"
import type { ReviewRecordCommandInput } from "../records/reviewRecordCommands"
import { resolveWorkspaceRelativePath } from "../records/reviewRecordPaths"
import { readTriage, writeTriage } from "../records/reviewRecordStore"
import { summarizeTriageItems, validateTriage } from "../records/reviewTriage"
import type { ReviewTriage, TriageDecision, TriageItem } from "../records/reviewRecordTypes"
import {
  correctActiveReviewRunMetrics,
  finalizeReviewRun,
  recordTriageCompleted,
  recordTriageDraft
} from "../reviewRuns/reviewRunCoordinator"
import { secondsToMinutes, type ReviewRunMetricCorrection } from "../reviewRuns/reviewRunMetrics"
import type { ReviewRunCommandInput, ReviewRunContext } from "../reviewRuns/reviewRunTypes"
import { renderHumanTriageHtml, type HumanTriageGuiModel } from "./humanTriageGuiHtml"
import type { BazaarReviewStageHost, BazaarReviewStageService } from "./reviewGuiStages"

type HumanTriageAction =
  | "initCampaign"
  | "createTriage"
  | "validateTriage"
  | "createRecord"
  | "generateSummary"
  | "saveDecisions"
  | "saveMetrics"
  | "finalizeReviewRun"

interface HumanTriageMessage {
  type: "bazaarHumanTriage.action"
  action: HumanTriageAction
  campaignId?: string
  reviewId?: string
  reviewResultJsonPath?: string
  baselineReviewMinutes?: number
  bobReviewMinutes?: number
  humanTriageMinutes?: number
  items?: unknown[]
}

export function createBazaarHumanTriageStage(
  context: vscode.ExtensionContext,
  host: BazaarReviewStageHost
): BazaarReviewStageService {
  return new BazaarHumanTriageStage(context, host)
}

class BazaarHumanTriageStage implements BazaarReviewStageService {
  private model: HumanTriageGuiModel

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly host: BazaarReviewStageHost
  ) {
    this.model = defaultModel(commandInputForRun(host.getActiveReviewRun()))
  }

  async initialize(): Promise<void> {
    try {
      const reviewRun = await this.resolveReviewRun()
      if (reviewRun) {
        await this.renderReviewRun(reviewRun)
      } else {
        this.render()
      }
    } catch (error) {
      this.render({
        ...this.model,
        issues: [error instanceof Error ? error.message : String(error)]
      })
    }
  }

  render(model: HumanTriageGuiModel = this.model): void {
    this.model = model
    this.host.render(renderHumanTriageHtml({
      cspSource: this.host.cspSource,
      nonce: randomBytes(16).toString("base64"),
      renderToken: this.host.nextRenderToken(),
      model
    }))
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseHumanTriageMessage(rawMessage)
    if (!message) {
      await this.host.post({ error: true, message: "不正な画面操作を拒否しました。" })
      return
    }
    try {
      const input = await this.commandInput(message)
      if (message.action === "initCampaign") {
        const result = await initReviewRecordCampaign(this.context, input)
        await this.host.post({ ok: true, message: `レビューキャンペーンを初期化しました: ${result.targetRoot}` })
      } else if (message.action === "createTriage") {
        const result = await createReviewTriage(input)
        const activeReviewRun = this.host.getActiveReviewRun()
        if (activeReviewRun) {
          const nextReviewRun = await recordTriageDraft(activeReviewRun, result.path)
          if (!this.host.commitActiveReviewRun(activeReviewRun, nextReviewRun)) return
        }
        await this.reloadTriage(input, result.path, result.issues)
      } else if (message.action === "validateTriage") {
        const result = await validateReviewTriageCommand(input)
        await this.host.post({ ok: result.status === "ok", message: result.issues.join("\n") || "判定内容は検証に合格しました。" })
      } else if (message.action === "createRecord") {
        const result = await createReviewRecord(input)
        await this.host.post({ ok: result.issues.length === 0, message: [`実績記録を作成しました: ${result.path}`, ...result.issues].join("\n") })
      } else if (message.action === "generateSummary") {
        const result = await generateReviewCampaignSummary(input)
        await this.host.post({ ok: true, message: `集計レポートを作成しました:\n${result.markdownPath}` })
      } else if (message.action === "saveDecisions") {
        const saved = await this.saveDecisions(input, message.items ?? [])
        if (saved) await this.host.post({ ok: true, message: "判定内容を保存し、レビュー実行の指摘確認・振り分け工程を完了しました。" })
      } else if (message.action === "saveMetrics") {
        await this.saveMetrics(message)
        await this.host.post({ ok: true, message: "レビュー時間を保存しました。" })
      } else if (message.action === "finalizeReviewRun") {
        const saved = await this.saveDecisions(input, message.items ?? [], false)
        if (!saved) return
        await this.applyMetrics(message)
        const reviewRun = requiredReviewRun(this.host.getActiveReviewRun())
        const result = await finalizeReviewRun(reviewRun)
        if (!this.host.commitActiveReviewRun(reviewRun, result.context)) return
        await this.renderReviewRun(result.context, [], this.model.items)
        await this.host.post({
          ok: true,
          message: [
            "レビュー実行を完了しました。",
            `実績記録: ${result.recordPath}`,
            `集計レポート: ${result.summaryMarkdownPath}`
          ].join("\n")
        })
      }
    } catch (error) {
      await this.host.post({ error: true, message: error instanceof Error ? error.message : String(error) })
    }
  }

  private async commandInput(message: HumanTriageMessage): Promise<ReviewRecordCommandInput> {
    const reviewRun = this.resolveReviewRun()
    const workspaceRoot = reviewRun?.workspaceRoot ?? await resolveWorkspaceRoot()
    const campaignId = reviewRun?.campaignId ?? textOrDefault(message.campaignId, this.model.campaignId)
    const reviewId = reviewRun?.reviewId ?? textOrDefault(message.reviewId, this.model.reviewId)
    const reviewResultJsonPath = textOrDefault(
      message.reviewResultJsonPath,
      reviewRun?.artifacts.reviewResultJsonPath ?? `.bob/review/results/${reviewId}.json`
    )
    return { workspaceRoot, campaignId, reviewId, reviewResultJsonPath }
  }

  private resolveReviewRun(): ReviewRunContext | undefined {
    return this.host.getActiveReviewRun()
  }

  private async reloadTriage(input: ReviewRecordCommandInput, triagePath: string, issues: string[]): Promise<void> {
    const workspaceRoot = required(input.workspaceRoot, "workspaceRoot")
    const campaignId = required(input.campaignId, "campaignId")
    const reviewId = required(input.reviewId, "reviewId")
    const triage = await readTriage(workspaceRoot, campaignId, reviewId)
    const activeReviewRun = this.host.getActiveReviewRun()
    if (activeReviewRun) {
      await this.renderReviewRun(activeReviewRun, issues, triage.items, triagePath)
      return
    }
    this.render({
      campaignId,
      reviewId,
      reviewResultJsonPath: input.reviewResultJsonPath ?? `.bob/review/results/${reviewId}.json`,
      triagePath,
      reviewRunBound: false,
      issues,
      items: triage.items
    })
  }

  private async saveDecisions(
    input: ReviewRecordCommandInput,
    rawItems: unknown[],
    renderResult = true
  ): Promise<boolean> {
    const workspaceRoot = required(input.workspaceRoot, "workspaceRoot")
    const campaignId = required(input.campaignId, "campaignId")
    const reviewId = required(input.reviewId, "reviewId")
    const current = await readTriage(workspaceRoot, campaignId, reviewId)
    const reviewResultPath = input.reviewResultJsonPath ?? `.bob/review/results/${reviewId}.json`
    const reviewResult = JSON.parse(
      await fs.readFile(resolveWorkspaceRelativePath(workspaceRoot, reviewResultPath), "utf8")
    )
    const items = rawItems.map(normalizePostedItem)
    const next: ReviewTriage = {
      ...current,
      items,
      summary: summarizeTriageItems(items)
    }
    const issues = validateTriage(next, reviewResult)
    const triagePath = path.join(workspaceRoot, ".bob-review-records", "campaigns", campaignId, "records", reviewId, "triage.yaml")
    if (issues.length > 0) {
      const activeReviewRun = this.host.getActiveReviewRun()
      if (activeReviewRun) {
        await this.renderReviewRun(activeReviewRun, issues, items, triagePath)
      } else {
        this.render({
          campaignId,
          reviewId,
          reviewResultJsonPath: reviewResultPath,
          triagePath,
          reviewRunBound: false,
          issues,
          items
        })
      }
      return false
    }

    const writtenPath = await writeTriage(workspaceRoot, campaignId, reviewId, next)
    const activeReviewRun = this.host.getActiveReviewRun()
    if (activeReviewRun) {
      const nextReviewRun = await recordTriageCompleted(activeReviewRun, writtenPath)
      if (!this.host.commitActiveReviewRun(activeReviewRun, nextReviewRun)) return false
      if (renderResult) await this.renderReviewRun(nextReviewRun, [], next.items, writtenPath)
    } else if (renderResult) {
      this.render({
        campaignId,
        reviewId,
        reviewResultJsonPath: reviewResultPath,
        triagePath: writtenPath,
        reviewRunBound: false,
        issues: [],
        items: next.items
      })
    }
    return true
  }

  private async saveMetrics(message: HumanTriageMessage): Promise<void> {
    await this.applyMetrics(message)
    await this.renderReviewRun(requiredReviewRun(this.host.getActiveReviewRun()), [], this.model.items)
  }

  private async applyMetrics(message: HumanTriageMessage): Promise<void> {
    const reviewRun = requiredReviewRun(this.resolveReviewRun())
    const correction: ReviewRunMetricCorrection = {}
    if (message.baselineReviewMinutes !== undefined) correction.baselineReviewMinutes = message.baselineReviewMinutes
    if (message.bobReviewMinutes !== undefined) correction.bobReviewMinutes = message.bobReviewMinutes
    if (message.humanTriageMinutes !== undefined) correction.humanTriageMinutes = message.humanTriageMinutes
    const nextReviewRun = await correctActiveReviewRunMetrics(reviewRun, correction)
    if (!this.host.commitActiveReviewRun(reviewRun, nextReviewRun)) {
      throw new Error("レビュー実行が別の操作で更新されたため、時間の保存結果を画面へ反映しませんでした。")
    }
  }

  private async renderReviewRun(
    reviewRun: ReviewRunContext,
    issues: string[] = [],
    items?: TriageItem[],
    triagePath?: string
  ): Promise<void> {
    let triageItems = items
    if (!triageItems && reviewRun.artifacts.triageYamlPath) {
      try {
        triageItems = (await readTriage(reviewRun.workspaceRoot, reviewRun.campaignId, reviewRun.reviewId)).items
      } catch {
        triageItems = []
      }
    }
    this.render({
      campaignId: reviewRun.campaignId,
      reviewId: reviewRun.reviewId,
      reviewResultJsonPath: reviewRun.artifacts.reviewResultJsonPath ?? `.bob/review/results/${reviewRun.reviewId}.json`,
      triagePath: triagePath ?? reviewRun.artifacts.triageYamlPath,
      reviewRunBound: true,
      reviewRunStatus: reviewRun.status,
      phaseStatuses: Object.fromEntries(
        Object.entries(reviewRun.phases).map(([phase, progress]) => [phase, progress.status])
      ),
      baselineReviewMinutes: reviewRun.metrics.baselineReviewMinutes,
      bobReviewMinutes: secondsToMinutes(reviewRun.metrics.bobReviewSeconds),
      humanTriageMinutes: secondsToMinutes(reviewRun.metrics.humanTriageSeconds),
      recordPath: reviewRun.artifacts.recordYamlPath,
      summaryMarkdownPath: reviewRun.artifacts.summaryMarkdownPath,
      canFinalize: reviewRun.phases.triage.status === "completed" && reviewRun.status !== "completed",
      issues: [...issues, ...reviewRun.issues.map((issue) => `${issue.phase}: ${issue.message}`)],
      items: triageItems ?? []
    })
  }

}

function commandInputForRun(reviewRun: ReviewRunContext | undefined): ReviewRunCommandInput | undefined {
  if (!reviewRun) return undefined
  return {
    workspaceRoot: reviewRun.workspaceRoot,
    campaignId: reviewRun.campaignId,
    reviewId: reviewRun.reviewId
  }
}

function defaultModel(reviewRunInput?: ReviewRunCommandInput): HumanTriageGuiModel {
  const reviewId = reviewRunInput?.reviewId ?? ""
  return {
    campaignId: reviewRunInput?.campaignId ?? "phase1-bazaar-review-uat-001",
    reviewId,
    reviewResultJsonPath: reviewId ? `.bob/review/results/${reviewId}.json` : ".bob/review/results/<review_id>.json",
    reviewRunBound: Boolean(reviewRunInput),
    issues: [],
    items: []
  }
}

function parseHumanTriageMessage(message: unknown): HumanTriageMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Partial<Record<keyof HumanTriageMessage, unknown>>
  if (candidate.type !== "bazaarHumanTriage.action") return undefined
  if (!isHumanTriageAction(candidate.action)) return undefined
  return {
    type: "bazaarHumanTriage.action",
    action: candidate.action,
    campaignId: typeof candidate.campaignId === "string" ? candidate.campaignId : undefined,
    reviewId: typeof candidate.reviewId === "string" ? candidate.reviewId : undefined,
    reviewResultJsonPath: typeof candidate.reviewResultJsonPath === "string" ? candidate.reviewResultJsonPath : undefined,
    baselineReviewMinutes: optionalNumber(candidate.baselineReviewMinutes),
    bobReviewMinutes: optionalNumber(candidate.bobReviewMinutes),
    humanTriageMinutes: optionalNumber(candidate.humanTriageMinutes),
    items: Array.isArray(candidate.items) ? candidate.items : undefined
  }
}

function normalizePostedItem(value: unknown): TriageItem {
  if (!value || typeof value !== "object") throw new Error("triage item が不正です。")
  const item = value as Record<string, unknown>
  const findingId = requiredString(item.finding_id, "finding_id")
  const decision = requiredDecision(item.decision)
  return {
    finding_id: findingId,
    rule_id: typeof item.rule_id === "string" && item.rule_id.trim() ? item.rule_id.trim() : undefined,
    decision,
    action: stringOrUndefined(item.action),
    owner: stringOrUndefined(item.owner),
    reason: stringOrUndefined(item.reason)
  }
}

function isHumanTriageAction(value: unknown): value is HumanTriageAction {
  return value === "initCampaign" ||
    value === "createTriage" ||
    value === "validateTriage" ||
    value === "createRecord" ||
    value === "generateSummary" ||
    value === "saveDecisions" ||
    value === "saveMetrics" ||
    value === "finalizeReviewRun"
}

async function resolveWorkspaceRoot(): Promise<string> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 1) return folders[0].uri.fsPath
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: "Bazaar human triage の workspace を選択" })
  if (!picked) throw new Error("workspaceRoot is required")
  return picked.uri.fsPath
}

function textOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function required(value: string | undefined, fieldName: string): string {
  if (!value?.trim()) throw new Error(`${fieldName} is required`)
  return value
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${fieldName} is required`)
  return value.trim()
}

function requiredDecision(value: unknown): TriageDecision {
  if (value === "accepted" || value === "rejected" || value === "needs_investigation" || value === "deferred") return value
  throw new Error(`invalid triage decision: ${String(value)}`)
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}

function requiredReviewRun(value: ReviewRunContext | undefined): ReviewRunContext {
  if (!value) throw new Error("Active Review Run is required")
  return value
}
