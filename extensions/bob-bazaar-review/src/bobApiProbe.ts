import * as vscode from "vscode"
import {
  BAZAAR_SOURCE_ID,
  BAZAAR_WORKFLOW_ID,
  BobWorkflowApi,
  RegistrationAttempt,
  WorkflowRegistrationResult,
  registerBazaarWorkflowWithBob
} from "./bobWorkflowRegistration"

const BOB_EXTENSION_ID = "IBM.bob-code"

export interface ExperimentalWorkflowRegistrationOptions {
  force?: boolean
  showReport?: boolean
  showUnavailableWarning?: boolean
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
    "Interpretation:",
    "",
    "- `registerSource(sourceId, sourceName)` is the public entry point exposed by IBM Bob 2.0.0.",
    "- The returned source object exposes `registerWorkflow(workflow)`.",
    "- A workflow object must provide Bob's method shape: `getId`, `getLabel`, `getDescription`, `isEnabled`, and `getSteps`.",
    "",
    "Expected experiment:",
    "",
    `- Source id: \`${BAZAAR_SOURCE_ID}\``,
    `- Workflow id: \`${BAZAAR_WORKFLOW_ID}\``
  ].join("\n")

  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export async function registerExperimentalWorkflowCard(): Promise<void> {
  await ensureExperimentalWorkflowCardRegistered({
    force: true,
    showReport: true,
    showUnavailableWarning: true
  })
}

export async function ensureExperimentalWorkflowCardRegistered(
  options: ExperimentalWorkflowRegistrationOptions = {}
): Promise<WorkflowRegistrationResult | undefined> {
  const state = await loadBobExports()
  const api = state.exportsValue as BobWorkflowApi | undefined

  if (!api) {
    if (options.showUnavailableWarning) {
      await vscode.window.showWarningMessage("IBM Bob exports were not available. Run 'Bob Bazaar: Inspect Bob Workflow API' for details.")
    }
    return undefined
  }

  const registration = await registerBazaarWorkflowWithBob(api, {
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args)
  }, { force: options.force })
  if (options.showReport) {
    await showRegistrationReport(registration.summary, registration.attempts)
  }
  return registration
}

async function showRegistrationReport(summary: string, attempts: RegistrationAttempt[]): Promise<void> {
  const report = [
    `# ${summary}`,
    "",
    ...attempts.map((attempt) => `- ${attempt.ok ? "ok" : "fail"}: ${attempt.label} -> ${attempt.message}`),
    "",
    "Next check: open Bob's Start Workflow UI and look for `Bazaar Project Rule Review`. If it is not visible, reload the window and run `Bob Bazaar: Inspect Bob Workflow API` again."
  ].join("\n")

  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
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
