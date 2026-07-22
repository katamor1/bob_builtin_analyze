import * as path from "node:path"
import {
  PROVIDER_REGISTRY_API_VERSION,
  type ProviderRegistryV1Api
} from "./api/providerRegistryApi"
import { createBuiltInActionProviders } from "./core/actionRegistry"
import type { ContributionRegistration, PreflightCheckHandler } from "./core/contributionRegistry"
import type { ContributionOwner, WorkflowContributionManifest } from "./core/contributionManifest"
import {
  createBuiltInResultSinkHandlers,
  type BuiltInResultSinkHandlerOptions,
  type ResultSinkFileTransactionBinding
} from "./core/resultSinkRegistry"
import type { WorkspaceTrustCheck } from "./core/workspaceTrust"

const contributionManifest = require("../contracts/workflow-contributions.json") as WorkflowContributionManifest

export interface WorkflowRegisterBuiltInContributionOptions {
  api: ProviderRegistryV1Api
  installedOwner: ContributionOwner
  fileTransactions: ResultSinkFileTransactionBinding
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown> | unknown
  isWorkspaceTrusted?: WorkspaceTrustCheck
  pathExists: (file: string) => Promise<boolean> | boolean
  bazaarRepositoryAvailable: (workflowRoot: string) => Promise<boolean> | boolean
  allowedCommandSinks?: string[]
  writeFilesAtomically?: BuiltInResultSinkHandlerOptions["writeFilesAtomically"]
}

/** Publish all built-ins only after registry negotiation and bind their transaction capability to the same generation. */
export function registerWorkflowRegisterBuiltInContributions(
  options: WorkflowRegisterBuiltInContributionOptions
): ContributionRegistration {
  const negotiatedVersion = options.api.negotiateProviderRegistry(contributionManifest.registry_api)
  if (negotiatedVersion !== PROVIDER_REGISTRY_API_VERSION) {
    throw new Error("Provider registry negotiation returned an unexpected version.")
  }

  const actionProviders = createBuiltInActionProviders({
    executeCommand: options.executeCommand,
    isWorkspaceTrusted: options.isWorkspaceTrusted
  })
  const preflightChecks = createBuiltInPreflightChecks(options)
  const resultHandlers = createBuiltInResultSinkHandlers({
    executeCommand: options.executeCommand,
    isWorkspaceTrusted: options.isWorkspaceTrusted,
    allowedCommandSinks: options.allowedCommandSinks,
    writeFilesAtomically: options.writeFilesAtomically
  })
  const registration = options.api.registerContributionSet(
    contributionManifest,
    {
      expectedOwner: options.installedOwner,
      ownerDirectory: "extensions/workflow-register"
    },
    {
      actionProviders,
      preflightChecks,
      resultSinks: resultHandlers.resultSinks
    }
  )

  const fileSinkHandler = resultHandlers.resultSinks.get("file")
  if (!fileSinkHandler) {
    registration.dispose()
    throw new Error("Workflow Register built-in file sink is missing.")
  }

  let transactionBinding: { dispose(): void }
  try {
    transactionBinding = options.fileTransactions.bind(fileSinkHandler, resultHandlers.fileTransaction)
  } catch (error) {
    registration.dispose()
    throw error
  }

  let disposed = false
  return Object.freeze({
    dispose(): void {
      if (disposed) return
      disposed = true
      const errors: unknown[] = []
      try {
        transactionBinding.dispose()
      } catch (error) {
        errors.push(error)
      }
      try {
        registration.dispose()
      } catch (error) {
        errors.push(error)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1) {
        throw new AggregateError(errors, "Workflow Register built-in contribution cleanup failed.")
      }
    }
  })
}

function createBuiltInPreflightChecks(
  options: WorkflowRegisterBuiltInContributionOptions
): Map<string, PreflightCheckHandler> {
  return new Map([
    ["workspaceOpen", ({ workflow }) => Boolean(workflowRoot(workflow))],
    ["bobWorkspaceInitialized", ({ workflow }) => {
      const root = workflowRoot(workflow)
      return root ? options.pathExists(path.join(root, ".bob")) : false
    }],
    ["bazaarRepository", ({ workflow }) => {
      const root = workflowRoot(workflow)
      return root ? options.bazaarRepositoryAvailable(root) : false
    }]
  ])
}

function workflowRoot(workflow: { workflowRoot?: string }): string | undefined {
  return typeof workflow.workflowRoot === "string" && workflow.workflowRoot.trim()
    ? workflow.workflowRoot
    : undefined
}
