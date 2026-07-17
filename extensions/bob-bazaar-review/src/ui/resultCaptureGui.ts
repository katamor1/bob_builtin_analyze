import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import { captureReviewResult } from "../projectRules/resultCapture"
import type { CaptureReviewResultResult } from "../projectRules/resultCapture"
import {
  loadReviewRun,
  recordReviewResult,
  reviewRunCommandInput,
  validateReviewRunCommandInput
} from "../reviewRuns/reviewRunCoordinator"
import type { ReviewRunCommandInput, ReviewRunContext } from "../reviewRuns/reviewRunTypes"
import { renderResultCaptureHtml } from "./resultCaptureGuiHtml"

type ResultCaptureAction = "captureCandidates" | "captureManual" | "validateActive" | "openTriage"

interface ResultCaptureMessage {
  type: "bazaarResultCapture.action"
  action: ResultCaptureAction
  text?: string
}

export function openBazaarResultCaptureGui(
  context: vscode.ExtensionContext,
  reviewRunInput?: ReviewRunCommandInput
): void {
  const panel = vscode.window.createWebviewPanel("bobBazaarResultCapture", "Bazaar レビュー結果の取り込み", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const controller = new BazaarResultCaptureGuiController(panel, reviewRunInput)
  context.subscriptions.push(panel.webview.onDidReceiveMessage((message) => controller.handleMessage(message)))
  panel.webview.html = renderResultCaptureHtml({
    cspSource: panel.webview.cspSource,
    nonce: randomBytes(16).toString("base64"),
    reviewRun: reviewRunInput
  })
}

class BazaarResultCaptureGuiController {
  private activeReviewRun?: ReviewRunContext

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly reviewRunInput?: ReviewRunCommandInput
  ) {}

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseResultCaptureMessage(rawMessage)
    if (!message) {
      this.post({ error: true, message: "不正な画面操作を拒否しました。" })
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
        this.post({ ok: true, message: "開いているレビュー結果を検証しました。" })
      } else if (message.action === "openTriage") {
        await this.openTriage()
        this.post({ ok: true, message: "人による判定を開きました。" })
      }
    } catch (error) {
      this.post({ error: true, message: error instanceof Error ? error.message : String(error) })
    }
  }

  private async capture(inputText?: string): Promise<void> {
    const reviewRun = await this.resolveReviewRun()
    const result = await captureReviewResult(inputText, {
      workspaceRoot: reviewRun?.workspaceRoot,
      expectedReviewId: reviewRun?.reviewId
    })
    await this.postResult(result, reviewRun)
  }

  private async postResult(result: CaptureReviewResultResult, reviewRun?: ReviewRunContext): Promise<void> {
    if (result.status !== "ok") {
      this.post({
        error: true,
        message: [
          "レビュー結果を保存できませんでした。入力内容を修正し、もう一度取り込みを実行してください。",
          ...(result.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`)
        ].join("\n")
      })
      return
    }

    if (reviewRun) {
      this.activeReviewRun = await recordReviewResult(reviewRun, result)
    }
    this.post({
      ok: true,
      message: [
        `保存しました: ${result.reviewId}`,
        result.jsonPath ? `JSON: ${result.jsonPath}` : undefined,
        result.markdownPath ? `Markdown: ${result.markdownPath}` : undefined,
        this.activeReviewRun ? `レビュー工程: ${this.activeReviewRun.phase}` : undefined
      ].filter(Boolean).join("\n")
    })
    if (this.activeReviewRun) await this.openTriage()
  }

  private async openTriage(): Promise<void> {
    const reviewRun = await this.resolveReviewRun()
    if (reviewRun) {
      await vscode.commands.executeCommand("bobBazaar.openHumanTriageGui", reviewRunCommandInput(reviewRun))
      return
    }
    await vscode.commands.executeCommand("bobBazaar.openHumanTriageGui")
  }

  private async resolveReviewRun(): Promise<ReviewRunContext | undefined> {
    if (this.activeReviewRun) return this.activeReviewRun
    if (!this.reviewRunInput) return undefined
    const validatedInput = await validateReviewRunCommandInput(
      this.reviewRunInput,
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
    )
    this.activeReviewRun = await loadReviewRun(validatedInput)
    return this.activeReviewRun
  }

  private post(message: Record<string, unknown>): void {
    void this.panel.webview.postMessage(message)
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
