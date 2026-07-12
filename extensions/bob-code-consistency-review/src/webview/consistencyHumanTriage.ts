import * as vscode from "vscode"
import { runTriage } from "../reviewExecutionCommands"
import {
  loadHumanTriageWorkspace,
  saveHumanTriageDecisions
} from "../triage/humanTriageWorkspace"
import { resolveBobWorkspaceRoot } from "../workspaceResolver"
import {
  renderConsistencyHumanTriageHtml,
  type ConsistencyHumanTriageModel
} from "./consistencyHumanTriageHtml"

type HumanTriageAction = "generateTriage" | "saveDecisions" | "openResultCapture"

export interface HumanTriageMessage {
  type: "consistencyHumanTriage.action"
  action: HumanTriageAction
  sourceSha256?: string
  decisionRevision?: number
  items?: unknown[]
}

export function openConsistencyHumanTriageGui(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel("bobCodeConsistencyHumanTriage", "Code Consistency Human Triage", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const controller = new ConsistencyHumanTriageController(panel)
  context.subscriptions.push(panel.webview.onDidReceiveMessage((message) => controller.handleMessage(message)))
  void controller.initialize()
}

class ConsistencyHumanTriageController {
  private workspaceRoot = ""
  private model?: ConsistencyHumanTriageModel

  constructor(private readonly panel: vscode.WebviewPanel) {}

  async initialize(): Promise<void> {
    this.workspaceRoot = await requireWorkspaceRoot()
    this.model = await this.loadModel([])
    this.render()
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseHumanTriageMessage(rawMessage)
    if (!message) {
      this.post({ error: true, message: "不正な画面操作を拒否しました。" })
      return
    }
    try {
      if (message.action === "generateTriage") {
        const result = await runTriage({ workspaceRoot: this.workspaceRoot })
        this.model = await this.loadModel([describeResult(result)])
        this.render()
      } else if (message.action === "saveDecisions") {
        await this.saveDecisions(message)
      } else if (message.action === "openResultCapture") {
        await vscode.commands.executeCommand("bobCodeConsistency.openResultCaptureGui")
        this.post({ ok: true, message: "Result Capture を開きました。" })
      }
    } catch (error) {
      this.post({ error: true, message: error instanceof Error ? error.message : String(error) })
    }
  }

  private render(): void {
    if (!this.model) return
    this.panel.webview.html = renderConsistencyHumanTriageHtml({
      cspSource: this.panel.webview.cspSource,
      nonce: nonce(),
      model: this.model
    })
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
      throw new Error("triage save token が不足しています。画面を再読込してください。")
    }
    await saveHumanTriageDecisions({
      workspaceRoot: this.workspaceRoot,
      outDir: vscode.workspace.getConfiguration("bobCodeConsistency").get<string>("triagePath", ".bob-review/human-triage"),
      expectedSourceSha256: message.sourceSha256,
      expectedDecisionRevision: message.decisionRevision as number,
      items: message.items
    })
    this.model = await this.loadModel(["triage decision と生成成果物を保存しました。"])
    this.render()
  }

  private post(message: Record<string, unknown>): void {
    void this.panel.webview.postMessage(message)
  }
}

export function parseHumanTriageMessage(message: unknown): HumanTriageMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Record<string, unknown>
  if (candidate.type !== "consistencyHumanTriage.action") return undefined
  if (!isHumanTriageAction(candidate.action)) return undefined
  const parsed: HumanTriageMessage = {
    type: "consistencyHumanTriage.action",
    action: candidate.action
  }
  if (candidate.action !== "saveDecisions") return parsed
  if (typeof candidate.sourceSha256 !== "string" || !candidate.sourceSha256.trim()) return undefined
  if (!Number.isInteger(candidate.decisionRevision) || Number(candidate.decisionRevision) < 0) return undefined
  if (!Array.isArray(candidate.items) || !hasUniquePostedSourceIds(candidate.items)) return undefined
  parsed.sourceSha256 = candidate.sourceSha256
  parsed.decisionRevision = Number(candidate.decisionRevision)
  parsed.items = candidate.items
  return parsed
}

async function requireWorkspaceRoot(): Promise<string> {
  const root = await resolveBobWorkspaceRoot({ allowPick: true, title: "Bob コード整合 triage workspace を選択" })
  if (!root) throw new Error("先にワークスペースフォルダーを開いてください。")
  return root
}

function hasUniquePostedSourceIds(items: unknown[]): boolean {
  const seen = new Set<string>()
  for (const value of items) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const sourceId = (value as Record<string, unknown>).source_id
    if (typeof sourceId !== "string" || !sourceId.trim() || seen.has(sourceId)) return false
    seen.add(sourceId)
  }
  return true
}

function isHumanTriageAction(value: unknown): value is HumanTriageAction {
  return value === "generateTriage" || value === "saveDecisions" || value === "openResultCapture"
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
