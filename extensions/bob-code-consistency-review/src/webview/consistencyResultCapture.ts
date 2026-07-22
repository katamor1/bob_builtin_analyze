import { runCaptureBobOutput, runValidateOutput } from "../reviewExecutionCommands"
import { renderConsistencyResultCaptureHtml } from "./consistencyResultCaptureHtml"
import type {
  ConsistencyReviewStageHost,
  ConsistencyReviewStageService
} from "./consistencyReviewWizardStages"

type ResultCaptureAction = "captureManual" | "captureClipboard" | "validateOutput" | "openHumanTriage"

interface ResultCaptureMessage {
  type: "consistencyResultCapture.action"
  action: ResultCaptureAction
  text?: string
}

export function createConsistencyResultCaptureStage(
  host: ConsistencyReviewStageHost
): ConsistencyReviewStageService {
  return new ConsistencyResultCaptureStage(host)
}

class ConsistencyResultCaptureStage implements ConsistencyReviewStageService {
  private messageTail = Promise.resolve()
  private workspaceRoot = ""

  constructor(private readonly host: ConsistencyReviewStageHost) {}

  async initialize() {
    if (!this.host.isActive()) return { status: "error" as const, errors: ["stage is no longer active"] }
    const workspaceRoot = this.host.getWorkspaceRoot()
    if (!workspaceRoot) return { status: "error" as const, errors: ["先にワークスペースフォルダーを開いてください。"] }
    this.workspaceRoot = workspaceRoot
    const renderToken = this.host.nextRenderToken()
    if (!renderToken) return { status: "error" as const, errors: ["stage is no longer active"] }
    if (!this.host.render(renderConsistencyResultCaptureHtml({
      cspSource: this.host.cspSource,
      nonce: nonce(),
      renderToken
    }))) return { status: "error" as const, errors: ["result capture stage could not be rendered"] }
    return { status: "ok" as const }
  }

  handleMessage(rawMessage: unknown): Promise<void> {
    const handled = this.messageTail.then(() => this.handleMessageSerial(rawMessage))
    this.messageTail = handled.then(() => undefined, () => undefined)
    return handled
  }

  private async handleMessageSerial(rawMessage: unknown): Promise<void> {
    if (!this.host.isActive()) return
    const message = parseResultCaptureMessage(rawMessage)
    if (!message) {
      await this.host.post({ error: true, message: "不正な画面操作を拒否しました。" })
      return
    }
    try {
      if (message.action === "captureManual") {
        if (!message.text?.trim()) throw new Error("Bob 出力（YAML）を貼り付けてください。")
        const result = await runCaptureBobOutput({ text: message.text, workspaceRoot: this.workspaceRoot })
        if (this.host.isActive()) await this.host.post({ ok: true, message: describeResult(result) })
      } else if (message.action === "captureClipboard") {
        const result = await runCaptureBobOutput({ workspaceRoot: this.workspaceRoot })
        if (this.host.isActive()) await this.host.post({ ok: true, message: describeResult(result) })
      } else if (message.action === "validateOutput") {
        const result = await runValidateOutput({ workspaceRoot: this.workspaceRoot })
        if (this.host.isActive()) {
          await this.host.post({ ok: resultStatus(result) !== "error", message: describeResult(result) })
        }
      } else if (message.action === "openHumanTriage") {
        await this.host.showStage("triage")
      }
    } catch (error) {
      if (this.host.isActive()) {
        await this.host.post({ error: true, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
}

function parseResultCaptureMessage(message: unknown): ResultCaptureMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Partial<Record<keyof ResultCaptureMessage, unknown>>
  if (candidate.type !== "consistencyResultCapture.action") return undefined
  if (!isResultCaptureAction(candidate.action)) return undefined
  return {
    type: "consistencyResultCapture.action",
    action: candidate.action,
    text: typeof candidate.text === "string" ? candidate.text : undefined
  }
}

function isResultCaptureAction(value: unknown): value is ResultCaptureAction {
  return value === "captureManual" || value === "captureClipboard" || value === "validateOutput" || value === "openHumanTriage"
}

function describeResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "")
  const record = result as Record<string, unknown>
  if (typeof record.message === "string") return record.message
  const status = typeof record.status === "string" ? record.status : "ok"
  const errors = Array.isArray(record.errors) ? record.errors.length : 0
  const warnings = Array.isArray(record.warnings) ? record.warnings.length : 0
  return `状態: ${status}; エラー: ${errors}件; 警告: ${warnings}件`
}

function resultStatus(result: unknown): string {
  return result && typeof result === "object" && typeof (result as Record<string, unknown>).status === "string"
    ? String((result as Record<string, unknown>).status)
    : "ok"
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let value = ""
  for (let index = 0; index < 32; index += 1) value += chars.charAt(Math.floor(Math.random() * chars.length))
  return value
}
