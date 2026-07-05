import * as vscode from "vscode"

export interface TemplateCustomizationStudioPanelOptions {
  extensionUri: vscode.Uri
  workspaceRoot: string
}

export class TemplateCustomizationStudioPanel {
  private static currentPanel: TemplateCustomizationStudioPanel | undefined

  private constructor(private readonly panel: vscode.WebviewPanel) {}

  static createOrShow(options: TemplateCustomizationStudioPanelOptions): void {
    if (TemplateCustomizationStudioPanel.currentPanel) {
      TemplateCustomizationStudioPanel.currentPanel.panel.reveal(vscode.ViewColumn.One)
      return
    }
    const panel = vscode.window.createWebviewPanel(
      "bobTemplateCustomizationStudio",
      "Bob Workflow: テンプレートカスタマイズ Studio",
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [options.extensionUri] }
    )
    panel.webview.html = "<!doctype html><html><body><h1>Template Customization Studio</h1></body></html>"
    TemplateCustomizationStudioPanel.currentPanel = new TemplateCustomizationStudioPanel(panel)
    panel.onDidDispose(() => {
      TemplateCustomizationStudioPanel.currentPanel = undefined
    })
  }
}
