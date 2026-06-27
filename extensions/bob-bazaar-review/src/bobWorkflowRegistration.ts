export const BAZAAR_SOURCE_ID = "bob-bazaar-review"
export const BAZAAR_SOURCE_NAME = "Bob Bazaar Review"
export const BAZAAR_WORKFLOW_ID = "bob-bazaar-review.bazaar-project-rule-review"
export const BAZAAR_WORKFLOW_LABEL = "Bazaar Project Rule Review"

export interface BobWorkflowApi {
  registerSource?: (id: string, name?: string) => unknown
}

export interface BobRegistrationCommandContext {
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown> | Thenable<unknown> | unknown
}

export interface BobWorkflowTask {
  sendMessage?: (...args: unknown[]) => Promise<unknown> | Thenable<unknown> | unknown
  setStepComplete?: () => unknown
}

export interface BobWorkflowStep {
  id: string
  title: string
  execution: (task: BobWorkflowTask) => Promise<boolean>
}

export interface BobWorkflow {
  hidden?: boolean
  getId: () => string
  getLabel: () => string
  getMenuLabel: () => string
  getDescription: () => string
  isEnabled: (env?: { workspace?: string }) => Promise<boolean>
  getSteps: () => BobWorkflowStep[]
  getApprovalConfig: () => { allowed_permissions: string[]; autoApprovalEnabled: boolean }
}

export interface BobSourceLike {
  registerWorkflow?: (workflow: BobWorkflow) => unknown
  log?: (message: string) => unknown
}

export interface RegistrationAttempt {
  label: string
  ok: boolean
  message: string
}

export interface WorkflowRegistrationResult {
  ok: boolean
  summary: string
  workflowId: string
  attempts: RegistrationAttempt[]
}

export interface WorkflowRegistrationOptions {
  force?: boolean
}

export interface BazaarWorkflowRegistrar {
  register: (
    api: BobWorkflowApi | undefined,
    context: BobRegistrationCommandContext,
    options?: WorkflowRegistrationOptions
  ) => Promise<WorkflowRegistrationResult>
}

const defaultRegistrar = createBazaarWorkflowRegistrar()

export async function registerBazaarWorkflowWithBob(
  api: BobWorkflowApi | undefined,
  context: BobRegistrationCommandContext,
  options?: WorkflowRegistrationOptions
): Promise<WorkflowRegistrationResult> {
  return defaultRegistrar.register(api, context, options)
}

export function createBazaarWorkflowRegistrar(): BazaarWorkflowRegistrar {
  let registered = false
  let registeredSource: BobSourceLike | undefined

  return {
    async register(api, context, options = {}) {
      const attempts: RegistrationAttempt[] = []

      if (registered && !options.force) {
        attempts.push({ label: "workflow already registered", ok: true, message: BAZAAR_WORKFLOW_ID })
        await setHasWorkflowsContext(context, attempts)
        return result(true, "Experimental Bob workflow was already registered.", attempts)
      }

      if (registered && options.force) {
        attempts.push({ label: "forced workflow reconciliation", ok: true, message: BAZAAR_WORKFLOW_ID })
      }

      if (typeof api?.registerSource !== "function") {
        attempts.push({ label: "registerSource availability", ok: false, message: "IBM Bob export registerSource is not callable" })
        return result(false, "IBM Bob workflow registration API is not available.", attempts)
      }

      const workflow = buildBazaarProjectRuleReviewWorkflow(context)
      const sourceAttempt = await runAttempt("registerSource(sourceId, sourceName)", () => api.registerSource?.(BAZAAR_SOURCE_ID, BAZAAR_SOURCE_NAME))
      attempts.push(sourceAttempt)

      const source = asSource(sourceAttempt.value)
      attempts.push(describeSource(source))

      if (!source || typeof source.registerWorkflow !== "function") {
        return result(false, "IBM Bob accepted the source request, but the returned source cannot register workflows.", attempts)
      }

      const workflowAttempt = await runAttempt("source.registerWorkflow(workflow)", () => source.registerWorkflow?.(workflow))
      attempts.push(workflowAttempt)
      if (!workflowAttempt.ok) {
        return result(false, "IBM Bob returned a source, but workflow registration failed.", attempts)
      }

      registered = true
      registeredSource = source
      await setHasWorkflowsContext(context, attempts)
      registeredSource.log?.(`${BAZAAR_WORKFLOW_LABEL} workflow registered`)

      return result(true, "Experimental Bob workflow registration returned successfully.", attempts)
    }
  }
}

export function buildBazaarProjectRuleReviewWorkflow(context: BobRegistrationCommandContext): BobWorkflow {
  const steps: BobWorkflowStep[] = [
    {
      id: "openBazaarReviewGui",
      title: "Open Bazaar Review GUI",
      execution: async (task) => {
        await task.sendMessage?.("Opening Bob Bazaar Review GUI.", "assistant")
        await context.executeCommand("bobBazaar.openReviewGui")
        task.setStepComplete?.()
        return true
      }
    }
  ]

  return {
    getId: () => BAZAAR_WORKFLOW_ID,
    getLabel: () => BAZAAR_WORKFLOW_LABEL,
    getMenuLabel: () => BAZAAR_WORKFLOW_LABEL,
    getDescription: () => "Review a Bazaar revision or range against project-specific rules, then add the generated review packet to Bob context.",
    isEnabled: async (env) => Boolean(env?.workspace),
    getSteps: () => steps,
    getApprovalConfig: () => ({
      allowed_permissions: ["read", "mcp", "skill"],
      autoApprovalEnabled: true
    })
  }
}

function result(ok: boolean, summary: string, attempts: RegistrationAttempt[]): WorkflowRegistrationResult {
  return {
    ok,
    summary,
    workflowId: BAZAAR_WORKFLOW_ID,
    attempts
  }
}

async function runAttempt(label: string, run: () => unknown): Promise<RegistrationAttempt & { value?: unknown }> {
  try {
    const value = await Promise.resolve(run())
    return { label, ok: value !== false, message: describeReturn(value), value }
  } catch (error) {
    return { label, ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

async function setHasWorkflowsContext(context: BobRegistrationCommandContext, attempts: RegistrationAttempt[]): Promise<void> {
  attempts.push(await runAttempt("setContext(bob-code.hasWorkflows)", () => context.executeCommand("setContext", "bob-code.hasWorkflows", true)))
}

function describeSource(source: BobSourceLike | undefined): RegistrationAttempt {
  if (!source) {
    return { label: "returned source diagnostics", ok: false, message: "no object returned" }
  }

  const record = source as Record<string, unknown>
  return {
    label: "returned source diagnostics",
    ok: typeof source.registerWorkflow === "function",
    message: `keys=${Object.keys(record).join(",") || "none"}; typeof registerWorkflow=${typeof source.registerWorkflow}`
  }
}

function asSource(value: unknown): BobSourceLike | undefined {
  return typeof value === "object" && value !== null ? value as BobSourceLike : undefined
}

function describeReturn(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "object") return `object(${Object.keys(value as Record<string, unknown>).slice(0, 20).join(",")})`
  return String(value)
}
