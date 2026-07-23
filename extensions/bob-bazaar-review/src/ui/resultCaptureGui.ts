import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import { captureReviewResult } from "../projectRules/resultCapture"
import type { CaptureReviewResultResult } from "../projectRules/resultCapture"
import { recordReviewResult } from "../reviewRuns/reviewRunCoordinator"
import type { ReviewRunContext } from "../reviewRuns/reviewRunTypes"
import { renderResultCaptureHtml } from "./resultCaptureGuiHtml"
import type { BazaarReviewStageHost, BazaarReviewStageService } from "./reviewGuiStages"

type ResultCaptureAction = "captureCandidates" | "captureManual" | "validateActive" | "openTriage"

interface ResultCaptureMessage {
  type: "bazaarResultCapture.action"
  action: ResultCaptureAction
  text?: string
}

export function createBazaarResultCaptureStage(host: BazaarReviewStageHost): BazaarReviewStageService {
  return new BazaarResultCaptureStage(host)
}

class BazaarResultCaptureStage implements BazaarReviewStageService {
  constructor(private readonly host: BazaarReviewStageHost) {}

  async initialize(): Promise<void> {
    const reviewRun = this.host.getActiveReviewRun()
    this.host.render(renderResultCaptureHtml({
      cspSource: this.host.cspSource,
      nonce: randomBytes(16).toString("base64"),
      renderToken: this.host.nextRenderToken(),
      reviewRun: reviewRun ? {
        workspaceRoot: reviewRun.workspaceRoot,
        campaignId: reviewRun.campaignId,
        reviewId: reviewRun.reviewId
      } : undefined
    }))
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseResultCaptureMessage(rawMessage)
    if (!message) {
      await this.host.post({ error: true, message: "不正な画面操作を拒否しました。" })
      return
    }
    try {
      if (message.action === "captureCandidates") {
        await this.capture()
      } else if (message.action === "captureManual") {
        if (!message.text?.trim()) throw new Error("Bob 出力 JSON を貼り付けてください。")
        await this.capture(message.text)
      } else if (message.action === "validateActive") {
        await vscode.commands.executeCommand("bobBazaar.validateReviewResultJson")
        await this.host.post({ ok: true, message: "開いているレビュー結果を検証しました。" })
      } else if (message.action === "openTriage") {
        await this.host.showStage("triage")
      }
    } catch (error) {
      await this.host.post({ error: true, message: error instanceof Error ? error.message : String(error) })
    }
  }

  private async capture(inputText?: string): Promise<void> {
    const reviewRun = this.host.getActiveReviewRun()
    const result = await captureReviewResult(inputText, {
      workspaceRoot: reviewRun?.workspaceRoot,
      expectedReviewId: reviewRun?.reviewId
    })
    await this.postResult(result, reviewRun)
  }

  private async postResult(result: CaptureReviewResultResult, reviewRun?: ReviewRunContext): Promise<void> {
    if (result.status !== "ok") {
      await this.host.post({
        error: true,
        message: [
          "レビュー結果を保存できませんでした。入力内容を修正し、もう一度取り込みを実行してください。",
          ...(result.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`)
        ].join("\n")
      })
      return
    }

    if (reviewRun) {
      const nextReviewRun = await recordReviewResult(reviewRun, result)
      if (!this.host.commitActiveReviewRun(reviewRun, nextReviewRun)) return
    }
    const activeReviewRun = this.host.getActiveReviewRun()
    const posted = await this.host.post({
      ok: true,
      message: [
        `保存しました: ${result.reviewId}`,
        result.jsonPath ? `JSON: ${result.jsonPath}` : undefined,
        result.markdownPath ? `Markdown: ${result.markdownPath}` : undefined,
        activeReviewRun ? `レビュー工程: ${activeReviewRun.phase}` : undefined
      ].filter(Boolean).join("\n")
    })
    if (posted && activeReviewRun) await this.host.showStage("triage")
  }
}

function parseResultCaptureMessage(message: unknown): ResultCaptureMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Partial<Record<keyof ResultCaptureMessage, unknown>>
  if (candidate.type !== "bazaarResultCapture.action") return undefined
  if (!isResultCaptureAction(candidate.action)) return undefined
  return {
    type: "bazaarResultCapture.action",
    action: candidate.action,
    text: typeof candidate.text === "string" ? candidate.text : undefined
  }
}

function isResultCaptureAction(value: unknown): value is ResultCaptureAction {
  return value === "captureCandidates" || value === "captureManual" || value === "validateActive" || value === "openTriage"
}
