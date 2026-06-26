import * as vscode from "vscode"

const BOB_EXTENSION_ID = "IBM.bob-code"
const SOURCE_ID = "bob-bazaar-review"

interface BobWorkflowApi {
  registerWorkflow?: (sourceId: string, workflow: Record<string, unknown>) => unknown
}

export async function inspectBobWorkflowApi(): Promise<void> {
  const state = await loadBobExports()
  const exportKeys = describeKeys(state.exportsValue)
  const report = [
    "# Bob Workflow API Probe",
    "",
    `- Extension id: \`${BOB_EXTENSION_ID}\``,
    `- Extension found: ${state.found}`,
    `- Active after probe: ${state.active}`,
    `- Activation error: ${state.activationError}`,
    `- Export keys: ${exportKeys.length > 0 ? exportKeys.map((key) => `\`${key}\``).join(", ") : "none"}`,
    "",
    "If no workflow registration-related export appears here, the Start Workflow registry is not exposed through the public VSCode extension API."
  ].join("\n")

  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export async function registerExperimentalWorkflowCard(): Promise<void> {
  const state = await loadBobExports()
  const api = state.exportsValue as BobWorkflowApi | undefined
  if (!api?.registerWorkflow) {
    await vscode.window.showWarningMessage("IBM Bob did not expose registerWorkflow on its extension exports. Run 'Bob Bazaar: Inspect Bob Workflow API' for details.")
    return
  }

  const workflow = {
    id: "bob-bazaar-review.bazaar-project-rule-review",
    sourceId: SOURCE_ID,
    slug: "bazaar-project-rule-review",
    name: "Bazaar Project Rule Review",
    title: "Bazaar Project Rule Review",
    label: "Bazaar Project Rule Review",
    description: "Review a Bazaar revision or range against project-specific rules.",
    command: "bobBazaar.openReviewGui",
    vscodeCommand: "bobBazaar.openReviewGui",
    prompt: "Open the Bazaar Review GUI and run a project-rule review."
  }

  try {
    api.registerWorkflow(SOURCE_ID, workflow)
    await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", true)
    await vscode.window.showInformationMessage("Experimental workflow registration returned successfully. Open Bob: Start Workflow to verify the card.")
  } catch (error) {
    await vscode.window.showWarningMessage(`Experimental workflow registration failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function loadBobExports(): Promise<{ found: boolean; active: boolean; activationError: string; exportsValue: unknown }> {
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

  return {
    found: Boolean(ext),
    active: Boolean(ext?.isActive),
    activationError,
    exportsValue
  }
}

function describeKeys(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return []
  return Object.keys(value as Record<string, unknown>).sort().slice(0, 80)
}
