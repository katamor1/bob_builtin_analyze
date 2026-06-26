import * as vscode from "vscode"

const BOB_EXTENSION_ID = "IBM.bob-code"

export async function inspectBobWorkflowApi(): Promise<void> {
  const ext = vscode.extensions.getExtension<unknown>(BOB_EXTENSION_ID)
  let exportsValue: unknown
  let activationError = "none"

  if (ext) {
    try {
      exportsValue = ext.isActive ? ext.exports : await ext.activate()
    } catch (error) {
      activationError = error instanceof Error ? error.message : String(error)
    }
  }

  const keys = typeof exportsValue === "object" && exportsValue !== null
    ? Object.keys(exportsValue as Record<string, unknown>).sort()
    : []

  const report = [
    "# Bob Workflow API Probe",
    "",
    `- Extension id: \`${BOB_EXTENSION_ID}\``,
    `- Extension found: ${Boolean(ext)}`,
    `- Active after probe: ${Boolean(ext?.isActive)}`,
    `- Activation error: ${activationError}`,
    `- Export keys: ${keys.length > 0 ? keys.map((key) => `\`${key}\``).join(", ") : "none"}`
  ].join("\n")

  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export async function registerExperimentalWorkflowCard(): Promise<void> {
  await vscode.window.showWarningMessage("Experimental workflow registration is temporarily disabled in this compiling probe build.")
}
