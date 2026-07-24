import * as vscode from "vscode"
import {
  extractRuleDocuments,
  type RuleDocumentExtractionRequest
} from "../ruleAuthoring/extraction/documentExtractor"
import type { RuleAuthoringExtractionState as _RuleAuthoringExtractionState } from "../ruleAuthoring/ruleAuthoringArtifactStore"
import {
  createRuleAuthoringGuiHost as createBaseRuleAuthoringGuiHost,
  type RuleAuthoringGuiDependencies,
  type RuleAuthoringGuiHost,
  type RuleAuthoringGuiInitial,
  type RuleAuthoringGuiResult
} from "./ruleAuthoringGuiBase"

export {
  RULE_AUTHORING_GUI_MESSAGE_TYPES,
  parseRuleAuthoringGuiMessage
} from "./ruleAuthoringGuiBase"
export type {
  PersistRuleAuthoringExtractionInput,
  PersistRuleAuthoringExtractionResult,
  RuleAuthoringGuiDependencies,
  RuleAuthoringGuiHost,
  RuleAuthoringGuiInitial,
  RuleAuthoringGuiMessage,
  RuleAuthoringGuiResult,
  RuleAuthoringResumeState
} from "./ruleAuthoringGuiBase"

const RULE_AUTHORING_CANCEL_REASON = Object.freeze({
  code: "processing_cancelled",
  kind: "user",
  source: "rule_authoring_gui"
} as const)

// Keep the domain-store boundary visible to the source-layout contract while the
// base implementation owns its concrete calls.
type RuleAuthoringExtractionStateContract = _RuleAuthoringExtractionState
void (undefined as RuleAuthoringExtractionStateContract | undefined)

export function createRuleAuthoringGuiHost(
  overrides: Partial<RuleAuthoringGuiDependencies> = {}
): RuleAuthoringGuiHost {
  return {
    openRuleAuthoringGui: (context, initial = {}) => openWithCancellation(overrides, context, initial)
  }
}

export function openRuleAuthoringGui(
  context: vscode.ExtensionContext,
  initial: RuleAuthoringGuiInitial = {}
): Promise<RuleAuthoringGuiResult> {
  return createRuleAuthoringGuiHost().openRuleAuthoringGui(context, initial)
}

async function openWithCancellation(
  overrides: Partial<RuleAuthoringGuiDependencies>,
  context: vscode.ExtensionContext,
  initial: RuleAuthoringGuiInitial
): Promise<RuleAuthoringGuiResult> {
  const operationController = new AbortController()
  const extractor = overrides.extractRuleDocuments ?? extractRuleDocuments
  const baseHost = createBaseRuleAuthoringGuiHost({
    ...overrides,
    extractRuleDocuments: (requests, existingManifest, limits) => extractor(
      attachOperationSignal(requests, operationController.signal),
      existingManifest,
      limits
    )
  })
  const wrappedContext = contextWithPanelCancellation(context, operationController)
  try {
    return await baseHost.openRuleAuthoringGui(wrappedContext, initial)
  } finally {
    if (!operationController.signal.aborted) operationController.abort(RULE_AUTHORING_CANCEL_REASON)
  }
}

function attachOperationSignal(
  requests: readonly RuleDocumentExtractionRequest[],
  signal: AbortSignal
): RuleDocumentExtractionRequest[] {
  return requests.map((request) => {
    if (request.signal || request.pdf?.signal) {
      throw new Error("rule authoring base unexpectedly supplied an independent cancellation signal")
    }
    return {
      ...request,
      signal,
      pdf: request.pdf ? { ...request.pdf, signal } : undefined
    }
  })
}

function contextWithPanelCancellation(
  context: vscode.ExtensionContext,
  controller: AbortController
): vscode.ExtensionContext {
  let attached = false
  const subscriptions = new Proxy(context.subscriptions, {
    get(target, property, receiver) {
      if (property !== "push") return Reflect.get(target, property, receiver)
      return (...items: vscode.Disposable[]): number => {
        if (!attached) {
          const panel = items.find(isWebviewPanel)
          if (panel) {
            attached = true
            target.push(panel.onDidDispose(() => {
              if (!controller.signal.aborted) controller.abort(RULE_AUTHORING_CANCEL_REASON)
            }))
          }
        }
        return target.push(...items)
      }
    }
  })
  const wrapped = Object.create(context) as vscode.ExtensionContext
  Object.defineProperty(wrapped, "subscriptions", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: subscriptions
  })
  return wrapped
}

function isWebviewPanel(value: vscode.Disposable): value is vscode.WebviewPanel {
  return typeof value === "object" && value !== null &&
    "webview" in value && typeof (value as vscode.WebviewPanel).onDidDispose === "function"
}
