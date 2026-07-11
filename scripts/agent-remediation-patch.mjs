import fs from "node:fs"

function replaceIdempotent(filePath, before, after) {
  const source = fs.readFileSync(filePath, "utf8")
  if (source.includes(after)) return
  if (!source.includes(before)) {
    throw new Error(`Expected remediation pattern was not found in ${filePath}`)
  }
  fs.writeFileSync(filePath, source.replace(before, after), "utf8")
}

function writeIfDifferent(filePath, content) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`
  if (fs.readFileSync(filePath, "utf8") === normalized) return
  fs.writeFileSync(filePath, normalized, "utf8")
}

replaceIdempotent(
  "extensions/bob-code-consistency-review/src/webview/traceabilityPrepWebviewAssets.ts",
  '  return JSON.stringify(model).replace(/</g, "\\u003c")',
  '  return JSON.stringify(model).replace(/</g, "\\\\u003c")'
)

replaceIdempotent(
  "extensions/workflow-register/src/workflowRegisterService.ts",
  'import { ActionProvider, createDefaultActionRegistry } from "./core/actionRegistry"',
  'import { createDefaultActionRegistry } from "./core/actionRegistry"\nimport type { ActionProvider, ActionProviderRegistration } from "./core/actionRegistry"'
)
replaceIdempotent(
  "extensions/workflow-register/src/workflowRegisterService.ts",
  '  private readonly customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }> = []',
  '  private readonly customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }> = []\n  private readonly actionProviderRegistrations: ActionProviderRegistration[] = []'
)
replaceIdempotent(
  "extensions/workflow-register/src/workflowRegisterService.ts",
  '  dispose(): void {\n    this.watcher.dispose()\n    const source = this.registeredSource',
  '  dispose(): void {\n    this.watcher.dispose()\n    for (const registration of this.actionProviderRegistrations.splice(0).reverse()) registration.dispose()\n    const source = this.registeredSource'
)
replaceIdempotent(
  "extensions/workflow-register/src/workflowRegisterService.ts",
  '  registerActionProvider(provider: ActionProvider): void {\n    this.actionRegistry.register(provider)\n  }',
  '  registerActionProvider(provider: ActionProvider): ActionProviderRegistration {\n    const registration = this.actionRegistry.register(provider)\n    this.actionProviderRegistrations.push(registration)\n    return registration\n  }'
)

replaceIdempotent(
  "extensions/workflow-register/src/extension.ts",
  'import type { ActionProvider } from "./core/actionRegistry"',
  'import type { ActionProvider, ActionProviderRegistration } from "./core/actionRegistry"'
)
replaceIdempotent(
  "extensions/workflow-register/src/extension.ts",
  '   * @returns なし。\n   */\n  registerActionProvider: (provider: ActionProvider) => void',
  '   * @returns provider 登録を解除する disposable。\n   */\n  registerActionProvider: (provider: ActionProvider) => ActionProviderRegistration'
)

replaceIdempotent(
  "extensions/bob-code-consistency-review/src/extension.ts",
  '    workflowProviderRegistrationAttempt = tryRegisterWorkflowProviders(handlers)',
  '    workflowProviderRegistrationAttempt = tryRegisterWorkflowProviders(context, handlers)'
)
replaceIdempotent(
  "extensions/bob-code-consistency-review/src/extension.ts",
  `async function tryRegisterWorkflowProviders(handlers: CodeConsistencyWorkflowHandlers): Promise<boolean> {
  const extension = vscode.extensions.getExtension<WorkflowRegisterApiLike>(WORKFLOW_REGISTER_EXTENSION_ID)
  if (!extension) return false

  const api = extension.isActive ? extension.exports : await extension.activate()
  if (!api?.registerActionProvider) return false

  await registerWorkflowProviders(handlers)
  workflowProvidersRegistered = true
  return true
}`,
  `async function tryRegisterWorkflowProviders(
  context: vscode.ExtensionContext,
  handlers: CodeConsistencyWorkflowHandlers
): Promise<boolean> {
  const extension = vscode.extensions.getExtension<WorkflowRegisterApiLike>(WORKFLOW_REGISTER_EXTENSION_ID)
  if (!extension) return false

  const api = extension.isActive ? extension.exports : await extension.activate()
  if (!api?.registerActionProvider) return false

  const { registered, registrations } = await registerWorkflowProviders(handlers)
  if (!registered) return false
  context.subscriptions.push(...registrations)
  context.subscriptions.push({ dispose: () => { workflowProvidersRegistered = false } })
  workflowProvidersRegistered = true
  return true
}`
)

replaceIdempotent(
  "extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts",
  'export interface WorkflowActionProvider {\n  id: string\n  execute:',
  'export interface WorkflowActionProvider {\n  id: string\n  sourceId?: string\n  execute:'
)
replaceIdempotent(
  "extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts",
  '  registerActionProvider: (provider: WorkflowActionProvider) => void',
  '  registerActionProvider: (provider: WorkflowActionProvider) => vscode.Disposable | void'
)

writeIfDifferent("extensions/bob-bazaar-review/src/workflow/workflowProviders.ts", `import * as vscode from "vscode"
import { captureReviewResult } from "../projectRules/resultCapture"
import { openBazaarReviewGui } from "../ui/reviewGui"
import { collectReviewContext, loadReviewRules } from "./workflowActions"
import {
  captureOptionsFromCommandArgs,
  firstStringArg,
  getWorkflowRegisterApi,
  initialTargetFromWorkflowInputs,
  type WorkflowActionProvider,
  type WorkflowRegisterApi
} from "./workflowRegisterBridge"

const WORKFLOW_PROVIDER_RETRY_DELAYS_MS = [1000, 3000, 10000]
const BAZAAR_PROVIDER_SOURCE_ID = "local.bob-bazaar-review"
let workflowProvidersRegistered = false
let workflowProviderRegistrationAttempt: Promise<boolean> | undefined

/**
 * workflow-register が利用できる場合に Bazaar レビュー用 action provider を登録する。
 *
 * provider ID は WORKFLOW.md から参照される互換性契約であり、再試行しても同じ ID だけを登録する。
 *
 * @param context GUI と review command handler に渡す VS Code extension context。
 * @returns なし。
 */
export function registerWorkflowProvidersWithRetry(context: vscode.ExtensionContext): void {
  let retryIndex = 0
  const attempt = (): void => {
    if (workflowProvidersRegistered || workflowProviderRegistrationAttempt) return
    workflowProviderRegistrationAttempt = registerWorkflowProviders(context)
    workflowProviderRegistrationAttempt
      .then((registered) => {
        if (registered || retryIndex >= WORKFLOW_PROVIDER_RETRY_DELAYS_MS.length) return
        const timer = setTimeout(() => attempt(), WORKFLOW_PROVIDER_RETRY_DELAYS_MS[retryIndex])
        retryIndex += 1
        context.subscriptions.push({ dispose: () => clearTimeout(timer) })
      })
      .catch((error) => console.warn("Bob Bazaar ワークフロー provider の登録に失敗しました", error))
      .finally(() => { workflowProviderRegistrationAttempt = undefined })
  }
  context.subscriptions.push(vscode.extensions.onDidChange(() => attempt()))
  attempt()
}

/**
 * workflow-register API へ Bazaar レビュー用 action provider を実際に登録する。
 *
 * workflow-register が未起動または未導入の場合は false を返し、呼び出し元の retry に任せる。
 *
 * @param context GUI と review command handler に渡す VS Code extension context。
 * @returns provider が既存または新規に登録済みなら true、workflow-register が使えない場合は false。
 */
async function registerWorkflowProviders(context: vscode.ExtensionContext): Promise<boolean> {
  if (workflowProvidersRegistered) return true
  const api = await getWorkflowRegisterApi()
  if (!api) return false
  const registrations: vscode.Disposable[] = []
  try {
    registerOwnedProvider(api, registrations, {
      id: "bobBazaar.openReviewGui",
      execute: (input) => openBazaarReviewGui(context, initialTargetFromWorkflowInputs(input.inputs, input))
    })
    registerOwnedProvider(api, registrations, {
      id: "bobBazaar.collectReviewContext",
      execute: (input) => collectReviewContext(input)
    })
    registerOwnedProvider(api, registrations, {
      id: "bobBazaar.loadReviewRules",
      execute: (input) => loadReviewRules(input)
    })
    registerOwnedProvider(api, registrations, {
      id: "bobBazaar.captureReviewResult",
      execute: (input) => captureReviewResult(firstStringArg(input.args), captureOptionsFromCommandArgs([input]))
    })
    context.subscriptions.push(...registrations)
    context.subscriptions.push({ dispose: () => { workflowProvidersRegistered = false } })
    workflowProvidersRegistered = true
    return true
  } catch (error) {
    disposeRegistrations(registrations)
    throw error
  }
}

function registerOwnedProvider(
  api: WorkflowRegisterApi,
  registrations: vscode.Disposable[],
  provider: WorkflowActionProvider
): void {
  const registration = api.registerActionProvider({ ...provider, sourceId: BAZAAR_PROVIDER_SOURCE_ID })
  if (registration && typeof registration.dispose === "function") registrations.push(registration)
}

function disposeRegistrations(registrations: vscode.Disposable[]): void {
  for (const registration of [...registrations].reverse()) registration.dispose()
  registrations.length = 0
}
`)
