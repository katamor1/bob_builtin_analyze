import * as vscode from "vscode"
import {
  createDefaultStudioModel,
  listTemplateLibrary,
  type TemplateCustomizationStudioModel,
  type TemplateLibraryEntry
} from "../template/templateStudioModel"
import { renderTemplateCustomizationStudioHtml } from "./templateCustomizationStudioHtml"

export interface TemplateCustomizationStudioPanelOptions {
  extensionUri: vscode.Uri
  workspaceRoot: string
}

type TemplateCustomizationStudioMessage =
  | { type: "listTemplates" }
  | { type: "loadTemplate"; templatePath?: string }
  | { type: string; [key: string]: unknown }

export class TemplateCustomizationStudioPanel {
  private static currentPanel: TemplateCustomizationStudioPanel | undefined
  private readonly panel: vscode.WebviewPanel
  private disposables: vscode.Disposable[] = []
  private templates: TemplateLibraryEntry[]
  private model: TemplateCustomizationStudioModel

  private constructor(private options: TemplateCustomizationStudioPanelOptions, templates: TemplateLibraryEntry[], model: TemplateCustomizationStudioModel, diagnostics: string[]) {
    this.templates = templates
    this.model = model
    this.panel = vscode.window.createWebviewPanel(
      "bobTemplateCustomizationStudio",
      "Bob Workflow: テンプレートカスタマイズ Studio",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )
    this.panel.webview.html = this.renderHtml(diagnostics)
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables)
    this.panel.webview.onDidReceiveMessage((message: TemplateCustomizationStudioMessage) => this.onMessage(message), undefined, this.disposables)
  }

  static async createOrShow(options: TemplateCustomizationStudioPanelOptions): Promise<TemplateCustomizationStudioPanel | undefined> {
    const library = await listTemplateLibrary(options.workspaceRoot)
    if (library.templates.length === 0) {
      await vscode.window.showErrorMessage(`Template library is empty. ${library.diagnostics.join("; ")}`)
      return undefined
    }
    const model = createDefaultStudioModel(library.templates[0])
    if (TemplateCustomizationStudioPanel.currentPanel) {
      TemplateCustomizationStudioPanel.currentPanel.options = options
      TemplateCustomizationStudioPanel.currentPanel.templates = library.templates
      TemplateCustomizationStudioPanel.currentPanel.model = model
      TemplateCustomizationStudioPanel.currentPanel.panel.reveal(vscode.ViewColumn.One)
      TemplateCustomizationStudioPanel.currentPanel.panel.webview.html = TemplateCustomizationStudioPanel.currentPanel.renderHtml(library.diagnostics)
      return TemplateCustomizationStudioPanel.currentPanel
    }
    const panel = new TemplateCustomizationStudioPanel(options, library.templates, model, library.diagnostics)
    TemplateCustomizationStudioPanel.currentPanel = panel
    return panel
  }

  dispose(): void {
    TemplateCustomizationStudioPanel.currentPanel = undefined
    while (this.disposables.length) this.disposables.pop()?.dispose()
  }

  private async onMessage(message: TemplateCustomizationStudioMessage): Promise<void> {
    if (message.type === "listTemplates") {
      const library = await listTemplateLibrary(this.options.workspaceRoot)
      this.templates = library.templates
      await this.panel.webview.postMessage({ type: "templateList", templates: this.templates, diagnostics: library.diagnostics })
      return
    }
    if (message.type === "loadTemplate") {
      const template = this.templates.find((candidate) => candidate.templatePath === message.templatePath) ?? this.templates[0]
      this.model = createDefaultStudioModel(template)
      this.panel.webview.html = this.renderHtml([])
    }
  }

  private renderHtml(diagnostics: string[]): string {
    return renderTemplateCustomizationStudioHtml({
      cspSource: this.panel.webview.cspSource,
      nonce: getNonce(),
      templates: this.templates,
      model: this.model,
      diagnostics
    })
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""
  for (let index = 0; index < 32; index += 1) text += chars.charAt(Math.floor(Math.random() * chars.length))
  return text
}
