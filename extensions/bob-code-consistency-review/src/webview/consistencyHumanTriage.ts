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
import {
  parseHumanTriageMessage,
  type HumanTriageMessage
} from "./consistencyHumanTriageMessage"

export async function openConsistencyHumanTriageGui(context: vscode.ExtensionContext): Promise<void> {
  const panel = vscode.window.createWebviewPanel("bobCodeConsistencyHumanTriage", "Code Consistency Human Triage", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const controller = new ConsistencyHumanTriageController(panel)
  context.subscriptions.push(
    panel.onDidDispose(() => controller.dispose()),
    panel.webview.onDidReceiveMessage((message) => {
      void controller.handleMessage(message).catch(reportHumanTriageControllerError)
    })
  )
  await controller.initialize()
}

class ConsistencyHumanTriageController {
  private disposed = false
  private workspaceRoot = ""
  private model?: ConsistencyHumanTriageModel

  constructor(private readonly panel: vscode.WebviewPanel) {}

  dispose(): void {
    this.disposed = true
  }

  async initialize(): Promise<void> {
    const workspaceRoot = await requireWorkspaceRoot()
    if (this.disposed) return
    this.workspaceRoot = workspaceRoot
    const model = await this.loadModel([])
    if (this.disposed) return
    this.model = model
    this.render()
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    if (this.disposed) return
    const message = parseHumanTriageMessage(rawMessage)
    if (!message) {
      await this.post({ error: true, message: "不正な画面操作を拒否しました。" })
      return
    }
    try {
      if (message.action === "generateTriage") {
        const result = await runTriage({ workspaceRoot: this.workspaceRoot })
        if (this.disposed) return
        const model = await this.loadModel([describeResult(result)])
        if (this.disposed) return
        this.model = model
        this.render()
      } else if (message.action === "saveDecisions") {
        await this.saveDecisions(message)
      } else if (message.action === "openResultCapture") {
        await vscode.commands.executeCommand("bobCodeConsistency.openResultCaptureGui")
        await this.post({ ok: true, message: "Result Capture を開きました。" })
      }
    } catch (error) {
      if (this.disposed) throw error
      await this.post({ error: true, message: error instanceof Error ? error.message : String(error) })
    }
  }

  private render(): void {
    if (this.disposed || !this.model) return
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
    if (this.disposed) return
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
    if (this.disposed) return
    const model = await this.loadModel(["triage decision と生成成果物を保存しました。"])
    if (this.disposed) return
    this.model = model
    this.render()
  }

  private async post(message: Record<string, unknown>): Promise<void> {
    if (this.disposed) return
    try {
      await this.panel.webview.postMessage(message)
    } catch (error) {
      if (this.disposed && isDisposedWebviewError(error)) return
      throw error
    }
  }
}

function isDisposedWebviewError(error: unknown): boolean {
  return error instanceof Error && error.message === "Webview is disposed"
}

function reportHumanTriageControllerError(error: unknown): void {
  console.error("Human Triage Webview task failed:", error)
}

async function requireWorkspaceRoot(): Promise<string> {
  const root = await resolveBobWorkspaceRoot({ allowPick: true, title: "Bob コード整合 triage workspace を選択" })
  if (!root) throw new Error("先にワークスペースフォルダーを開いてください。")
  return root
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
