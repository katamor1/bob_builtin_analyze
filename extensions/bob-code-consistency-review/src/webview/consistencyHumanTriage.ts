import * as vscode from "vscode"
import { runTriage } from "../reviewExecutionCommands"
import {
  loadHumanTriageWorkspace,
  saveHumanTriageDecisions
} from "../triage/humanTriageWorkspace"
import {
  renderConsistencyHumanTriageHtml,
  type ConsistencyHumanTriageModel
} from "./consistencyHumanTriageHtml"
import {
  parseHumanTriageMessage,
  type HumanTriageMessage
} from "./consistencyHumanTriageMessage"
import type {
  ConsistencyReviewStageHost,
  ConsistencyReviewStageService
} from "./consistencyReviewWizardStages"

export function createConsistencyHumanTriageStage(
  host: ConsistencyReviewStageHost
): ConsistencyReviewStageService {
  return new ConsistencyHumanTriageStage(host)
}

class ConsistencyHumanTriageStage implements ConsistencyReviewStageService {
  private workspaceRoot = ""
  private model?: ConsistencyHumanTriageModel
  private messageTail = Promise.resolve()

  constructor(private readonly host: ConsistencyReviewStageHost) {}

  async initialize() {
    const workspaceRoot = this.host.getWorkspaceRoot()
    if (!workspaceRoot || !this.host.isActive()) {
      return { status: "error" as const, errors: ["先にワークスペースフォルダーを開いてください。"] }
    }
    this.workspaceRoot = workspaceRoot
    const model = await this.loadModel([])
    if (!this.host.isActive()) return { status: "error" as const, errors: ["stage is no longer active"] }
    this.model = model
    if (!this.render()) return { status: "error" as const, errors: ["triage stage could not be rendered"] }
    return { status: "ok" as const }
  }

  handleMessage(rawMessage: unknown): Promise<void> {
    const handled = this.messageTail.then(() => this.handleMessageSerial(rawMessage))
    this.messageTail = handled.then(() => undefined, () => undefined)
    return handled
  }

  private async handleMessageSerial(rawMessage: unknown): Promise<void> {
    if (!this.host.isActive()) return
    const message = parseHumanTriageMessage(rawMessage)
    if (!message) {
      await this.host.post({ error: true, message: "不正な画面操作を拒否しました。" })
      return
    }
    try {
      if (message.action === "generateTriage") {
        const result = await runTriage({ workspaceRoot: this.workspaceRoot })
        if (!this.host.isActive()) return
        const model = await this.loadModel([describeResult(result)])
        if (!this.host.isActive()) return
        this.model = model
        this.render()
      } else if (message.action === "saveDecisions") {
        await this.saveDecisions(message)
      } else if (message.action === "openResultCapture") {
        await this.host.showStage("review-result-capture")
      }
    } catch (error) {
      if (this.host.isActive()) {
        await this.host.post({ error: true, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  private render(): boolean {
    if (!this.host.isActive() || !this.model) return false
    const renderToken = this.host.nextRenderToken()
    if (!renderToken) return false
    return this.host.render(renderConsistencyHumanTriageHtml({
      cspSource: this.host.cspSource,
      nonce: nonce(),
      renderToken,
      model: this.model
    }))
  }

  private async loadModel(issues: string[]): Promise<ConsistencyHumanTriageModel> {
    const config = vscode.workspace.getConfiguration("bobCodeConsistency")
    const outDirValue = config.get<string>("triagePath", ".bob-review/human-triage")
    const bobOutputPath = config.get<string>("bobOutputPath", ".bob-review/bob-output/bob-output.yaml")
    const workspace = await loadHumanTriageWorkspace({ workspaceRoot: this.workspaceRoot, outDir: outDirValue })
    return {
      outDir: outDirValue,
      bobOutputPath,
      sourceSha256: workspace.sourceSha256,
      decisionRevision: workspace.decisionRevision,
      items: workspace.items,
      issues: [...workspace.issues, ...issues]
    }
  }

  private async saveDecisions(message: HumanTriageMessage): Promise<void> {
    if (!message.sourceSha256 || !Number.isInteger(message.decisionRevision) || !message.items) {
      throw new Error("判定内容を保存するための確認情報が不足しています。画面を再読み込みしてから、もう一度保存してください。")
    }
    await saveHumanTriageDecisions({
      workspaceRoot: this.workspaceRoot,
      outDir: vscode.workspace.getConfiguration("bobCodeConsistency").get<string>("triagePath", ".bob-review/human-triage"),
      expectedSourceSha256: message.sourceSha256,
      expectedDecisionRevision: message.decisionRevision as number,
      items: message.items
    })
    if (!this.host.isActive()) return
    const model = await this.loadModel(["判定内容と生成成果物を保存しました。"])
    if (!this.host.isActive()) return
    this.model = model
    this.render()
  }
}

function describeResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "")
  const record = result as Record<string, unknown>
  if (typeof record.message === "string") return record.message
  if (typeof record.status === "string" && typeof record.outDir === "string") return `${record.status}: ${record.outDir}`
  return JSON.stringify(record)
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let value = ""
  for (let index = 0; index < 32; index += 1) value += chars.charAt(Math.floor(Math.random() * chars.length))
  return value
}
