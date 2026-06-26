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

  const exportKeys = describeKeys(exportsValue)
  const report = [
    "# Bob Workflow API Probe",
    "",
    `- Extension id: \`${BOB_EXTENSION_ID}\``,
    `- Extension found: ${Boolean(ext)}`,
    `- Active after probe: ${Boolean(ext?.isActive)}`,
    `- Activation error: ${activationError}`,
    `- Export keys: ${exportKeys.length > 0 ? exportKeys.map((key) => `\`${key}\``).join(", ") : "none"}`,
    "",
    "If no workflow registration-related export appears here, the Start Workflow registry is not exposed through the public VSCode extension API."
  ].join("\n")

  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}

function describeKeys(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return []
  return Object.keys(value as Record<string, unknown>).sort().slice(0, 80)
}
