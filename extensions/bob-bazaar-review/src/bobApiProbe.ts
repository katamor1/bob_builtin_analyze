import * as vscode from "vscode"

const BOB_EXTENSION_ID = "IBM.bob-code"
const SOURCE_ID = "bob-bazaar-review"
const WORKFLOW_ID = "bob-bazaar-review.bazaar-project-rule-review"

interface BobWorkflowApi {
  registerSource?: (...args: unknown[]) => unknown
  registerWorkflow?: (...args: unknown[]) => unknown
  startWorkflow?: (...args: unknown[]) => unknown
}

interface RegistrationAttempt {
  label: string
  ok: boolean
  message: string
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
    "- `registerSource` is the likely public entry point for adding tools / workflows / findings from a companion extension.",
    "- `startWorkflow` is likely an execution entry point, not a discovery/registration entry point.",
    "- This experiment first tries to add a source object containing `workflows`, then checks Bob's Start Workflow UI manually."
  ].join("\n")

  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export async function registerExperimentalWorkflowCard(): Promise<void> {
  const state = await loadBobExports()
  const api = state.exportsValue as BobWorkflowApi | undefined
  const attempts: RegistrationAttempt[] = []

  if (!api) {
    await vscode.window.showWarningMessage("IBM Bob exports were not available. Run 'Bob Bazaar: Inspect Bob Workflow API' for details.")
    return
  }

  const workflow = buildWorkflowCard()
  const source = buildWorkflowSource(workflow)
  const candidates = buildRegistrationCandidates(api, source, workflow)

  if (candidates.length === 0) {
    await vscode.window.showWarningMessage("IBM Bob did not expose registerSource/registerWorkflow on its extension exports. Run 'Bob Bazaar: Inspect Bob Workflow API' for details.")
    return
  }

  for (const candidate of candidates) {
    attempts.push(await runRegistrationAttempt(candidate.label, candidate.run))
    if (attempts[attempts.length - 1].ok) {
      await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", true)
      await showRegistrationReport("Experimental workflow registration returned successfully.", attempts)
      return
    }
  }

  await showRegistrationReport("Experimental workflow registration did not succeed.", attempts)
}

function buildWorkflowCard(): Record<string, unknown> {
  return {
    id: WORKFLOW_ID,
    sourceId: SOURCE_ID,
    source: SOURCE_ID,
    slug: "bazaar-project-rule-review",
    name: "Bazaar Project Rule Review",
    title: "Bazaar Project Rule Review",
    label: "Bazaar Project Rule Review",
    displayName: "Bazaar Project Rule Review",
    description: "Review a Bazaar revision or range against project-specific rules, then output normalized review JSON and a Markdown checklist.",
    details: "Uses Bob Bazaar Review MCP tools, .bob/review/checklist.json, and .bob/review/review-result.schema.json.",
    command: "bobBazaar.openReviewGui",
    vscodeCommand: "bobBazaar.openReviewGui",
    startCommand: "bobBazaar.openReviewGui",
    prompt: "Open the Bazaar Review GUI and run a project-rule review.",
    mode: "ask"
  }
}

function buildWorkflowSource(workflow: Record<string, unknown>): Record<string, unknown> {
  return {
    id: SOURCE_ID,
    sourceId: SOURCE_ID,
    name: "Bob Bazaar Review",
    displayName: "Bob Bazaar Review",
    description: "Bazaar revision/range review workflows and project-rule review helpers.",
    workflows: [workflow]
  }
}

function buildRegistrationCandidates(
  api: BobWorkflowApi,
  source: Record<string, unknown>,
  workflow: Record<string, unknown>
): Array<{ label: string; run: () => unknown }> {
  const candidates: Array<{ label: string; run: () => unknown }> = []

  if (api.registerSource) {
    candidates.push(
      { label: "registerSource(source)", run: () => api.registerSource?.(source) },
      { label: "registerSource(sourceId, source)", run: () => api.registerSource?.(SOURCE_ID, source) },
      { label: "registerSource({ id, workflows })", run: () => api.registerSource?.({ id: SOURCE_ID, workflows: [workflow] }) }
    )
  }

  if (api.registerWorkflow) {
    candidates.push(
      { label: "registerWorkflow(sourceId, workflow)", run: () => api.registerWorkflow?.(SOURCE_ID, workflow) },
      { label: "registerWorkflow(workflow)", run: () => api.registerWorkflow?.(workflow) }
    )
  }

  return candidates
}

async function runRegistrationAttempt(label: string, run: () => unknown): Promise<RegistrationAttempt> {
  try {
    const result = await Promise.resolve(run())
    return { label, ok: result !== false, message: describeReturn(result) }
  } catch (error) {
    return { label, ok: false, message: error instanceof Error ? error.message : String(error) }
  }
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

function describeReturn(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "object") return `object(${Object.keys(value as Record<string, unknown>).slice(0, 20).join(",")})`
  return String(value)
}
