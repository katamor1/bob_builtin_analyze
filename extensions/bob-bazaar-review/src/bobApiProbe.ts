import * as vscode from "vscode"

const BOB_EXTENSION_ID = "IBM.bob-code"
const SOURCE_ID = "bob-bazaar-review"
const GROUP_ID = "bob-bazaar-review.group"
const WORKSPACE_ID = "bob-bazaar-review.workspace"
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

interface RegisteredSourceLike {
  register?: unknown
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
    "- `registerSource` is the likely public entry point for creating a Bob source from a companion extension.",
    "- The returned source object exposes a `register` registry object.",
    "- This experiment registers workspace, group, and workflow parts and reports internal source shapes."
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

  const workflow = buildWorkflowPart()
  const group = buildWorkflowGroupPart()
  const workspace = buildWorkspacePart()
  const sourceDescriptor = buildWorkflowSource()

  if (api.registerSource) {
    const sourceAttempt = await runRegistrationAttempt("registerSource(source)", () => api.registerSource?.(sourceDescriptor))
    attempts.push(sourceAttempt)
    const registeredSource = sourceAttempt.value as RegisteredSourceLike | undefined
    attempts.push(describeRegisteredSourceAttempt(registeredSource))
    attempts.push(describeSourceInternalsAttempt(registeredSource, "after source registration"))

    const sourceRegister = asRecord(registeredSource)?.register
    const registerObject = asRecord(sourceRegister)
    const workspaceRegister = registerObject?.workspace
    const groupRegister = registerObject?.group
    const workflowRegister = registerObject?.workflow

    if (registeredSource && registerObject && typeof workspaceRegister === "function") {
      attempts.push(await runRegistrationAttempt("source.register.workspace(workspace)", () => workspaceRegister.call(registerObject, workspace)))
      attempts.push(describeSourceInternalsAttempt(registeredSource, "after workspace registration"))
    }

    if (registeredSource && registerObject && typeof groupRegister === "function") {
      attempts.push(await runRegistrationAttempt("source.register.group(group)", () => groupRegister.call(registerObject, group)))
      attempts.push(describeSourceInternalsAttempt(registeredSource, "after group registration"))
    }

    if (registeredSource && registerObject && typeof workflowRegister === "function") {
      const confirmedRegister = workflowRegister as (...args: unknown[]) => unknown
      const sourcePartAttempts = buildWorkflowRegisterCandidates(
        registeredSource,
        registerObject,
        confirmedRegister,
        workflow
      )
      for (const candidate of sourcePartAttempts) {
        attempts.push(await runRegistrationAttempt(candidate.label, candidate.run))
        attempts.push(describeSourceInternalsAttempt(registeredSource, `after ${candidate.label}`))
        if (attempts[attempts.length - 2].ok) {
          await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", true)
          await showRegistrationReport("Experimental workflow part registration returned successfully.", attempts)
          return
        }
      }
    } else if (sourceAttempt.ok) {
      await showRegistrationReport("Bob accepted the experimental source, but returned source.register.workflow is not callable.", attempts)
      return
    }

    if (sourceAttempt.ok) {
      await showRegistrationReport("Bob accepted the experimental source, but no workflow part registration succeeded.", attempts)
      return
    }
  }

  if (api.registerWorkflow) {
    for (const candidate of buildDirectWorkflowCandidates(api, workflow)) {
      attempts.push(await runRegistrationAttempt(candidate.label, candidate.run))
      if (attempts[attempts.length - 1].ok) {
        await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", true)
        await showRegistrationReport("Experimental direct workflow registration returned successfully.", attempts)
        return
      }
    }
  }

  await showRegistrationReport("Experimental workflow registration did not succeed.", attempts)
}

function buildWorkspacePart(): Record<string, unknown> {
  const title = "Bob Bazaar Workspace"
  const description = "Workspace scope for Bazaar review workflows."

  return {
    id: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    type: "workspace",
    kind: "workspace",
    name: title,
    title,
    label: title,
    displayName: title,
    description,
    getId: () => WORKSPACE_ID,
    getName: () => title,
    getTitle: () => title,
    getLabel: () => title,
    getDisplayName: () => title,
    getDescription: () => description,
    getSourceId: () => SOURCE_ID,
    getType: () => "workspace",
    getKind: () => "workspace",
    isEnabled: () => true,
    isEntitled: () => true
  }
}

function buildWorkflowGroupPart(): Record<string, unknown> {
  const title = "Bob Bazaar Review"
  const description = "Bazaar review workflows."

  return {
    id: GROUP_ID,
    sourceId: SOURCE_ID,
    workspaceId: WORKSPACE_ID,
    workspace: WORKSPACE_ID,
    type: "group",
    kind: "group",
    name: title,
    title,
    label: title,
    displayName: title,
    description,
    getId: () => GROUP_ID,
    getName: () => title,
    getTitle: () => title,
    getLabel: () => title,
    getDisplayName: () => title,
    getDescription: () => description,
    getSourceId: () => SOURCE_ID,
    getWorkspaceId: () => WORKSPACE_ID,
    getWorkspace: () => WORKSPACE_ID,
    getType: () => "group",
    getKind: () => "group",
    isEnabled: () => true,
    isEntitled: () => true
  }
}

function buildWorkflowPart(): Record<string, unknown> {
  const title = "Bazaar Project Rule Review"
  const description = "Review a Bazaar revision or range against project-specific rules."
  const prompt = "Open the Bazaar Review GUI and run a project-rule review."

  return {
    id: WORKFLOW_ID,
    sourceId: SOURCE_ID,
    source: SOURCE_ID,
    workspaceId: WORKSPACE_ID,
    workspace: WORKSPACE_ID,
    groupId: GROUP_ID,
    group: GROUP_ID,
    groups: [GROUP_ID],
    slug: "bazaar-project-rule-review",
    type: "workflow",
    kind: "workflow",
    category: "Bob Bazaar",
    name: title,
    title,
    label: title,
    displayName: title,
    description,
    command: "bobBazaar.openReviewGui",
    vscodeCommand: "bobBazaar.openReviewGui",
    startCommand: "bobBazaar.openReviewGui",
    prompt,
    mode: "ask",
    getId: () => WORKFLOW_ID,
    getName: () => title,
    getTitle: () => title,
    getLabel: () => title,
    getDisplayName: () => title,
    getDescription: () => description,
    getSourceId: () => SOURCE_ID,
    getSource: () => SOURCE_ID,
    getWorkspaceId: () => WORKSPACE_ID,
    getWorkspace: () => WORKSPACE_ID,
    getGroupId: () => GROUP_ID,
    getGroup: () => GROUP_ID,
    getGroups: () => [GROUP_ID],
    getType: () => "workflow",
    getKind: () => "workflow",
    getCategory: () => "Bob Bazaar",
    getCommand: () => "bobBazaar.openReviewGui",
    getPrompt: () => prompt,
    isEnabled: () => true,
    isEntitled: () => true
  }
}

function buildWorkflowCard(): Record<string, unknown> {
  return {
    id: WORKFLOW_ID,
    sourceId: SOURCE_ID,
    source: SOURCE_ID,
    slug: "bazaar-project-rule-review",
    type: "workflow",
    kind: "workflow",
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

function buildWorkflowSource(): Record<string, unknown> {
  return {
    id: SOURCE_ID,
    sourceId: SOURCE_ID,
    name: "Bob Bazaar Review",
    displayName: "Bob Bazaar Review",
    humanReadableName: "Bob Bazaar Review",
    description: "Bazaar revision/range review workflows and project-rule review helpers."
  }
}

function buildWorkflowRegisterCandidates(
  registeredSource: RegisteredSourceLike,
  registerObject: Record<string, unknown>,
  workflowRegister: (...args: unknown[]) => unknown,
  workflow: Record<string, unknown>
): Array<{ label: string; run: () => unknown }> {
  return [
    {
      label: "source.register.workflow(workflow)",
      run: () => workflowRegister.call(registerObject, workflow)
    },
    {
      label: "source.register.workflow(sourceId, workflow)",
      run: () => workflowRegister.call(registerObject, SOURCE_ID, workflow)
    },
    {
      label: "source.register.workflow.call(source, workflow)",
      run: () => workflowRegister.call(registeredSource, workflow)
    },
    {
      label: "source.register.workflow({ workflow })",
      run: () => workflowRegister.call(registerObject, { workflow })
    },
    {
      label: "source.register.workflow({ workflows: [workflow] })",
      run: () => workflowRegister.call(registerObject, { workflows: [workflow] })
    }
  ]
}

function buildDirectWorkflowCandidates(api: BobWorkflowApi, workflow: Record<string, unknown>): Array<{ label: string; run: () => unknown }> {
  return [
    { label: "registerWorkflow(sourceId, workflow)", run: () => api.registerWorkflow?.(SOURCE_ID, workflow) },
    { label: "registerWorkflow(workflow)", run: () => api.registerWorkflow?.(workflow) }
  ]
}

async function runRegistrationAttempt(label: string, run: () => unknown): Promise<RegistrationAttempt & { value?: unknown }> {
  try {
    const result = await Promise.resolve(run())
    return { label, ok: result !== false, message: describeReturn(result), value: result }
  } catch (error) {
    return { label, ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function describeRegisteredSourceAttempt(source: RegisteredSourceLike | undefined): RegistrationAttempt {
  const record = asRecord(source)
  if (!record) {
    return { label: "returned source diagnostics", ok: false, message: "no object returned" }
  }

  const registerValue = record.register
  const registerRecord = asRecord(registerValue)
  const workspaceValue = registerRecord?.workspace
  const groupValue = registerRecord?.group
  const workflowValue = registerRecord?.workflow
  return {
    label: "returned source diagnostics",
    ok: typeof workflowValue === "function",
    message: `keys=${Object.keys(record).join(",")}; typeof register=${typeof registerValue}; register keys=${Object.keys(registerRecord ?? {}).join(",") || "none"}; typeof register.workspace=${typeof workspaceValue}; typeof register.group=${typeof groupValue}; typeof register.workflow=${typeof workflowValue}`
  }
}

function describeSourceInternalsAttempt(source: RegisteredSourceLike | undefined, label: string): RegistrationAttempt {
  const sourceRecord = asRecord(source)
  return {
    label: `source internals (${label})`,
    ok: true,
    message: sourceRecord ? `source=${describeInspectableValue(sourceRecord)}; _parts=${describeInspectableValue(sourceRecord._parts)}; _events=${describeInspectableValue(sourceRecord._events)}; _enabled=${describeInspectableValue(sourceRecord._enabled)}` : "source not inspectable"
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

function describeInspectableValue(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value !== "object") return `${typeof value}:${String(value)}`

  const record = value as Record<string | symbol, unknown>
  const constructorName = value.constructor?.name ?? "unknown"
  const objectKeys = Object.keys(value as Record<string, unknown>).slice(0, 20).join(",")
  const ownKeys = Reflect.ownKeys(record).map(String).slice(0, 20).join(",")
  const mapInfo = value instanceof Map ? `; mapSize=${value.size}; mapKeys=${Array.from(value.keys()).map(String).slice(0, 20).join(",")}` : ""
  const setInfo = value instanceof Set ? `; setSize=${value.size}; setValues=${Array.from(value.values()).map(String).slice(0, 20).join(",")}` : ""

  return `ctor=${constructorName}; objectKeys=${objectKeys}; ownKeys=${ownKeys}${mapInfo}${setInfo}`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined
}
