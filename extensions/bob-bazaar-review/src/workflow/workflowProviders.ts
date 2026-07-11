import * as vscode from "vscode"
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
