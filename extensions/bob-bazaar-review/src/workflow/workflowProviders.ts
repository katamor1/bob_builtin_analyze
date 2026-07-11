import * as vscode from "vscode"
import { captureReviewResult } from "../projectRules/resultCapture"
import { openBazaarReviewGui } from "../ui/reviewGui"
import { collectReviewContext, loadReviewRules } from "./workflowActions"
import {
  captureOptionsFromCommandArgs,
  firstStringArg,
  getWorkflowRegisterApi,
  initialTargetFromWorkflowInputs,
  WORKFLOW_REGISTER_EXTENSION_ID,
  type WorkflowActionProvider,
  type WorkflowRegisterApi
} from "./workflowRegisterBridge"

const WORKFLOW_PROVIDER_RETRY_DELAYS_MS = [1000, 3000, 10000]
const BAZAAR_PROVIDER_SOURCE_ID = "local.bob-bazaar-review"

interface WorkflowProviderRegistrationResult {
  registered: boolean
  registrations: vscode.Disposable[]
}

/**
 * workflow-register が利用できる場合に Bazaar レビュー用 action provider を登録する。
 *
 * provider ID は WORKFLOW.md から参照される互換性契約であり、再試行しても同じ ID だけを登録する。
 *
 * @param context GUI と review command handler に渡す VS Code extension context。
 * @returns なし。
 */
export function registerWorkflowProvidersWithRetry(context: vscode.ExtensionContext): void {
  let disposed = false
  let providersRegistered = false
  let registrationAttempt: Promise<boolean> | undefined
  let activeRegistrations: vscode.Disposable[] = []
  let retryIndex = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const clearRetryTimers = (): void => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }

  const resetRegistration = (): void => {
    disposeRegistrations(activeRegistrations)
    activeRegistrations = []
    providersRegistered = false
  }

  const scheduleRetry = (): void => {
    if (disposed || providersRegistered || retryIndex >= WORKFLOW_PROVIDER_RETRY_DELAYS_MS.length) return
    const timer = setTimeout(() => attempt(), WORKFLOW_PROVIDER_RETRY_DELAYS_MS[retryIndex])
    retryIndex += 1
    timers.add(timer)
  }

  const performAttempt = async (): Promise<boolean> => {
    const result = await registerWorkflowProviders(context)
    if (disposed) {
      disposeRegistrations(result.registrations)
      return false
    }
    if (!result.registered) {
      scheduleRetry()
      return false
    }

    activeRegistrations = result.registrations
    context.subscriptions.push(...result.registrations)
    providersRegistered = true
    return true
  }

  const attempt = async (): Promise<boolean> => {
    if (disposed || providersRegistered) return providersRegistered
    if (registrationAttempt) return registrationAttempt

    registrationAttempt = performAttempt()
    try {
      return await registrationAttempt
    } catch (error) {
      console.warn("Bob Bazaar ワークフロー provider の登録に失敗しました", error)
      scheduleRetry()
      return false
    } finally {
      registrationAttempt = undefined
    }
  }

  const extensionListener = vscode.extensions.onDidChange(() => {
    const workflowExtension = vscode.extensions.getExtension(WORKFLOW_REGISTER_EXTENSION_ID)
    if (providersRegistered && workflowExtension?.isActive) return
    resetRegistration()
    retryIndex = 0
    clearRetryTimers()
    void attempt()
  })

  context.subscriptions.push(
    extensionListener,
    {
      dispose: () => {
        disposed = true
        clearRetryTimers()
        resetRegistration()
      }
    }
  )
  void attempt()
}

/**
 * workflow-register API へ Bazaar レビュー用 action provider を実際に登録する。
 *
 * workflow-register が未起動または未導入の場合は false を返し、呼び出し元の retry に任せる。
 *
 * @param context GUI と review command handler に渡す VS Code extension context。
 * @returns provider 登録結果と、登録解除に使う disposable 群。
 */
async function registerWorkflowProviders(
  context: vscode.ExtensionContext
): Promise<WorkflowProviderRegistrationResult> {
  const api = await getWorkflowRegisterApi()
  if (!api) return { registered: false, registrations: [] }

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
    return { registered: true, registrations }
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
