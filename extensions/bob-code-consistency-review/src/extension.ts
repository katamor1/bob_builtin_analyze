import * as vscode from "vscode"
import {
  runApplyAiReviewInputDraft,
  runCreateReviewInput,
  runExplainReviewInputDiagnostics,
  runPrepareAiReviewInputDraft,
  runRepairReviewInput
} from "./commands/reviewInputCommands"
import { runInitializeWorkspace } from "./commands/workspaceCommands"
import {
  runCaptureBobOutput,
  runPreprocess,
  runTriage,
  runValidateOutput
} from "./reviewExecutionCommands"
import {
  runApplyAiTraceabilityDraft,
  runCaptureAiTraceabilityDraft,
  runCreateReviewInputFromTraceability,
  runOpenTraceabilityPrep,
  runPrepareAiTraceabilityDraft,
  runValidateTraceabilityCatalog
} from "./traceabilityCommands"
import { openConsistencyHumanTriageGui } from "./webview/consistencyHumanTriage"
import { openConsistencyResultCaptureGui } from "./webview/consistencyResultCapture"
import { openConsistencyReviewWizard } from "./webview/consistencyReviewWizard"
import {
  disposeRegistrations,
  registerWorkflowProviders,
  type CodeConsistencyWorkflowHandlers
} from "./workflowProviderRegistration"

const WORKFLOW_REGISTER_EXTENSION_ID = "local.workflow-register"
const WORKFLOW_PROVIDER_RETRY_DELAYS_MS = [1000, 3000, 10000] as const

/**
 * Bob コード整合プレレビュー拡張を有効化し、command と workflow entry point を登録する。
 *
 * command ID は workflow template から参照される互換性契約なので、処理本体を移しても ID は維持する。
 *
 * @param context command 登録と workspace 初期化 template 解決に使う VS Code extension context。
 * @returns なし。
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "bobCodeConsistency.openReviewWizard",
      () => openConsistencyReviewWizard(context)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.openResultCaptureGui",
      () => openConsistencyResultCaptureGui(context)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.openHumanTriageGui",
      () => openConsistencyHumanTriageGui(context)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.initializeWorkspace",
      (options?: unknown) => runInitializeWorkspace(context, options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.createReviewInput",
      (options?: unknown) => runCreateReviewInput(options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.prepareAiReviewInputDraft",
      (options?: unknown) => runPrepareAiReviewInputDraft(options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.applyAiReviewInputDraft",
      (textOrOptions?: unknown) => runApplyAiReviewInputDraft(textOrOptions)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.prepareAiTraceabilityDraft",
      (options?: unknown) => runPrepareAiTraceabilityDraft(options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.applyAiTraceabilityDraft",
      (textOrOptions?: unknown) => runApplyAiTraceabilityDraft(textOrOptions)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.captureAiTraceabilityDraft",
      (textOrOptions?: unknown) => runCaptureAiTraceabilityDraft(textOrOptions)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.openTraceabilityPrep",
      (options?: unknown) => runOpenTraceabilityPrep(context, options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.validateTraceabilityCatalog",
      (options?: unknown) => runValidateTraceabilityCatalog(options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.createReviewInputFromTraceability",
      (options?: unknown) => runCreateReviewInputFromTraceability(options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.repairReviewInput",
      (options?: unknown) => runRepairReviewInput(options)
    ),
    vscode.commands.registerCommand(
      "bobCodeConsistency.explainReviewInputDiagnostics",
      (options?: unknown) => runExplainReviewInputDiagnostics(options)
    ),
    vscode.commands.registerCommand("bobCodeConsistency.preprocess", (options?: unknown) => runPreprocess(options)),
    vscode.commands.registerCommand(
      "bobCodeConsistency.captureBobOutput",
      (textOrOptions?: unknown) => runCaptureBobOutput(textOrOptions)
    ),
    vscode.commands.registerCommand("bobCodeConsistency.validateOutput", (options?: unknown) => runValidateOutput(options)),
    vscode.commands.registerCommand("bobCodeConsistency.triage", (options?: unknown) => runTriage(options))
  )

  registerWorkflowProvidersWithRetry(context, {
    initializeWorkspace: (options) => runInitializeWorkspace(context, options),
    createReviewInput: runCreateReviewInput,
    prepareAiReviewInputDraft: runPrepareAiReviewInputDraft,
    applyAiReviewInputDraft: runApplyAiReviewInputDraft,
    prepareAiTraceabilityDraft: runPrepareAiTraceabilityDraft,
    captureAiTraceabilityDraft: runCaptureAiTraceabilityDraft,
    applyAiTraceabilityDraft: runApplyAiTraceabilityDraft,
    openTraceabilityPrep: (options) => runOpenTraceabilityPrep(context, options),
    validateTraceabilityCatalog: runValidateTraceabilityCatalog,
    createReviewInputFromTraceability: runCreateReviewInputFromTraceability,
    repairReviewInput: runRepairReviewInput,
    explainReviewInputDiagnostics: runExplainReviewInputDiagnostics,
    preprocess: runPreprocess,
    captureBobOutput: runCaptureBobOutput,
    validateOutput: runValidateOutput,
    triage: runTriage
  })
}

/**
 * workflow-register が未導入または遅延起動した場合に備えて provider 登録を再試行する。
 *
 * @param context retry timer と extension change listener の所有者。
 * @param handlers workflow action provider が呼ぶ command handler 群。
 * @returns なし。
 */
export function registerWorkflowProvidersWithRetry(
  context: vscode.ExtensionContext,
  handlers: CodeConsistencyWorkflowHandlers
): void {
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
    const delayMs = WORKFLOW_PROVIDER_RETRY_DELAYS_MS[retryIndex]
    retryIndex += 1
    const timer = setTimeout(() => attempt(), delayMs)
    timers.add(timer)
  }

  const performAttempt = async (): Promise<boolean> => {
    const result = await registerWorkflowProviders(handlers)
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
      console.warn("Bob コード整合ワークフロー provider の登録に失敗しました", error)
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
 * Bob コード整合プレレビュー拡張を無効化する。
 *
 * @returns なし。
 */
export function deactivate(): void {
  // retry timer、provider 登録、listener は extension context subscriptions が破棄する。
}
