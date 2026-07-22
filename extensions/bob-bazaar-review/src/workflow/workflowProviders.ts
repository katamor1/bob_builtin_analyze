import * as vscode from "vscode"
import { captureReviewResult } from "../projectRules/resultCapture"
import { openBazaarReviewGui } from "../ui/reviewGui"
import { openRuleAuthoringGui } from "../ui/ruleAuthoringGui"
import { openRuleProposalTriageGui } from "../ui/ruleProposalTriageGui"
import { getRuleAuthoringHostConfiguration } from "../workspace/workspaceCommands"
import {
  startRetryRegistrationController,
  type RegistrationAttemptResult
} from "./retryRegistrationController"
import { collectReviewContext, loadReviewRules } from "./workflowActions"
import {
  createRuleAuthoringWorkflowActions,
  resolveRuleAuthoringWorkflowTarget
} from "./ruleAuthoringWorkflowActions"
import {
  captureOptionsFromCommandArgs,
  firstStringArg,
  getWorkflowRegisterApi,
  initialTargetFromWorkflowInputs,
  loadWorkflowContributionManifest,
  registerNegotiatedContributionSet,
  stringInput,
  WORKFLOW_REGISTER_EXTENSION_ID,
  type WorkflowActionProvider,
  type WorkflowRegisterApi
} from "./workflowRegisterBridge"
import { completeCurrentWorkflowStepAfterGuiAction } from "./workflowStepCompletion"

const WORKFLOW_PROVIDER_RETRY_DELAYS_MS = [1000, 3000, 10000]
const BAZAAR_PROVIDER_SOURCE_ID = "local.bob-bazaar-review"

/**
 * workflow-register が利用できる場合に Bazaar レビュー用 action provider を登録する。
 *
 * provider ID は WORKFLOW.md から参照される互換性契約であり、API世代が変わった場合だけ再登録する。
 */
export function registerWorkflowProvidersWithRetry(context: vscode.ExtensionContext): void {
  startRetryRegistrationController<WorkflowRegisterApi>({
    retryDelaysMs: WORKFLOW_PROVIDER_RETRY_DELAYS_MS,
    register: () => registerWorkflowProviders(context),
    currentApi: () => {
      const extension = vscode.extensions.getExtension<WorkflowRegisterApi>(WORKFLOW_REGISTER_EXTENSION_ID)
      return extension?.isActive ? extension.exports : undefined
    },
    subscribeChanges: (listener) => vscode.extensions.onDidChange(listener),
    own: (...registrations) => context.subscriptions.push(...registrations),
    reportError: (error) => console.warn("Bob Bazaar ワークフロー provider の登録に失敗しました", error)
  })
}

/** workflow-register APIへBazaarレビュー用providerを一括登録する。 */
async function registerWorkflowProviders(
  context: vscode.ExtensionContext
): Promise<RegistrationAttemptResult<WorkflowRegisterApi>> {
  const api = await getWorkflowRegisterApi()
  if (!api) return { registered: false, registrations: [] }

  const manifest = await loadWorkflowContributionManifest(context)

  const actionProviders = new Map<string, WorkflowActionProvider>()
  actionProviders.set("bobBazaar.openReviewGui", {
      id: "bobBazaar.openReviewGui",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => {
        openBazaarReviewGui(context, initialTargetFromWorkflowInputs(input.inputs, input))
        return null
      }
  })
  actionProviders.set("bobBazaar.collectReviewContext", {
      id: "bobBazaar.collectReviewContext",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => collectReviewContext(input)
  })
  actionProviders.set("bobBazaar.loadReviewRules", {
      id: "bobBazaar.loadReviewRules",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => loadReviewRules(input)
  })
  actionProviders.set("bobBazaar.captureReviewResult", {
      id: "bobBazaar.captureReviewResult",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => captureReviewResult(firstStringArg(input.args), captureOptionsFromCommandArgs([input]))
  })
  actionProviders.set("bobBazaar.openRuleAuthoringGui", {
      id: "bobBazaar.openRuleAuthoringGui",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: async (input) => {
        const configuration = getRuleAuthoringHostConfiguration()
        const result = await openRuleAuthoringGui(context, {
          workspaceRoot: stringInput(input.workflowRoot),
          runId: stringInput(input.runId),
          stepId: stringInput(input.stepId),
          limits: configuration.limits,
          pdfToTextPath: configuration.pdfToTextPath
        })
        if (result.status !== "confirmed") {
          throw new Error(`Rule authoring source selection did not complete: ${result.status}`)
        }
        return result.authoringSession
      }
  })
  actionProviders.set("bobBazaar.loadRuleSourceIndex", {
      id: "bobBazaar.loadRuleSourceIndex",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => configuredRuleAuthoringActions().loadRuleSourceIndex(input)
  })
  actionProviders.set("bobBazaar.captureRuleEvidenceSelection", {
      id: "bobBazaar.captureRuleEvidenceSelection",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => configuredRuleAuthoringActions().captureRuleEvidenceSelection(input)
  })
  actionProviders.set("bobBazaar.loadSelectedRuleEvidence", {
      id: "bobBazaar.loadSelectedRuleEvidence",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => configuredRuleAuthoringActions().loadSelectedRuleEvidence(input)
  })
  actionProviders.set("bobBazaar.captureRuleProposal", {
      id: "bobBazaar.captureRuleProposal",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => configuredRuleAuthoringActions().captureRuleProposal(input)
  })
  actionProviders.set("bobBazaar.openRuleProposalTriageGui", {
      id: "bobBazaar.openRuleProposalTriageGui",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: async (input) => {
        const target = await resolveRuleAuthoringWorkflowTarget(input)
        const result = await openRuleProposalTriageGui(context, {
          workspaceRoot: target.workspaceRoot,
          runId: target.runId
        })
        if (result.status !== "applied") {
          throw new Error("Rule authoring proposal triage closed before apply")
        }
        const completed = await completeCurrentWorkflowStepAfterGuiAction({
          executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
          showWarningMessage: (message) => vscode.window.showWarningMessage(message)
        }, {
          runId: target.workflowRunId,
          stepId: stringInput(input.stepId)
        })
        if (!completed) {
          throw new Error("Applied rule authoring proposal could not complete its workflow step")
        }
        return result
      }
  })
  actionProviders.set("bobBazaar.verifyRuleAuthoringApply", {
      id: "bobBazaar.verifyRuleAuthoringApply",
      sourceId: BAZAAR_PROVIDER_SOURCE_ID,
      execute: (input) => configuredRuleAuthoringActions().verifyRuleAuthoringApply(input)
  })

  const extensionVersion = context.extension.packageJSON.version
  const provenance = {
    expectedOwner: {
      id: context.extension.id,
      version: typeof extensionVersion === "string" ? extensionVersion : ""
    },
    ownerDirectory: "extensions/bob-bazaar-review"
  }
  const registration = registerNegotiatedContributionSet(api, manifest, provenance, {
    actionProviders,
    preflightChecks: new Map(),
    resultSinks: new Map()
  })
  return { registered: true, registrations: [registration], api }
}

function configuredRuleAuthoringActions() {
  const configured = getRuleAuthoringHostConfiguration()
  return createRuleAuthoringWorkflowActions({
    maxSelectedEvidenceBytes: configured.limits.maxSelectedEvidenceBytes
  })
}
