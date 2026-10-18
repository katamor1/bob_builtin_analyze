import { ActionExecutionInput, ActionExecutionResult } from "./model"
import { requireWorkspaceTrust, type WorkspaceTrustCheck } from "./workspaceTrust"
import { createMechanicalChecksActionProvider } from "./mechanicalChecks/actionProvider"
import type { ActionProvider, ActionProviderRegistration } from "./actionTypes"
import type { AgentProvider } from "./model"
import type { InstalledContributionOwner } from "./contributionManifest"
import { prepareContributionSet, type ContributionRegistration, type SinkHandler } from "./contributionRegistration"
import {
  WorkflowProviderRegistry,
  type WorkflowProviderCatalog,
  type WorkflowProviderRegistration,
  type WorkflowProviderRegistrationInput,
  type WorkflowProviderRegistryOptions, type ContributionRegistrySnapshot, type ContributionRuntimeResolver
} from "./contractV2/providerRegistry"

export type { ActionProvider, ActionProviderRegistration } from "./actionTypes"
export type { WorkflowProviderRegistration, WorkflowProviderRegistrationInput } from "./contractV2/providerRegistry"

const registerWorkflowProviderCaptured = Function.prototype.call.bind(WorkflowProviderRegistry.prototype.register) as (
  registry: WorkflowProviderRegistry, input: WorkflowProviderRegistrationInput
) => WorkflowProviderRegistration
const snapshotWorkflowProviderCaptured = Function.prototype.call.bind(WorkflowProviderRegistry.prototype.snapshot) as (
  registry: WorkflowProviderRegistry
) => WorkflowProviderCatalog

const WORKFLOW_REGISTER_PROVIDER_SOURCE_ID = "local.workflow-register"

export class ActionRegistry {
  private readonly workflowProviders: WorkflowProviderRegistry

  constructor(options: WorkflowProviderRegistryOptions = {}) {
    this.workflowProviders = new WorkflowProviderRegistry(options)
  }

  registerContributionSet(manifest: unknown, installed: InstalledContributionOwner, handlers: unknown): ContributionRegistration {
    return this.workflowProviders.registerContributionSet(prepareContributionSet(manifest, installed, handlers))
  }
  snapshotContributions(): ContributionRegistrySnapshot { return this.workflowProviders.snapshotContributions() }
  contributionRuntimeResolver(): ContributionRuntimeResolver { return this.workflowProviders.contributionRuntimeResolver() }
  setLegacyAgent(provider: AgentProvider): void { this.workflowProviders.setLegacyAgent(provider) }
  getLegacyAgent(): AgentProvider | undefined { return this.workflowProviders.getLegacyAgent() }
  registerLegacyResultSink(type: string, handler: SinkHandler): void { this.workflowProviders.registerLegacyResultSink(type, handler) }
  getLegacyResultSink(type: string): SinkHandler | undefined { return this.workflowProviders.getLegacyResultSink(type) }
  disposeLegacyCompatibility(): void { this.workflowProviders.disposeLegacyCompatibility() }

  registerWorkflowProviderContract(
    input: WorkflowProviderRegistrationInput
  ): WorkflowProviderRegistration {
    return registerWorkflowProviderCaptured(this.workflowProviders, input)
  }

  snapshotWorkflowProviderCatalog(): WorkflowProviderCatalog {
    return snapshotWorkflowProviderCaptured(this.workflowProviders)
  }

  register(provider: ActionProvider): ActionProviderRegistration {
    return this.workflowProviders.registerLegacyAction(provider)
  }

  list(): string[] {
    return this.workflowProviders.contributionRuntimeResolver().listActionProviderIds()
  }

  async execute(providerId: string, input: ActionExecutionInput): Promise<ActionExecutionResult> {
    const provider = this.workflowProviders.contributionRuntimeResolver().getActionProvider(providerId)
    if (!provider) return { ok: false, error: `Unsupported action provider: ${providerId}` }
    try {
      const value = await Promise.resolve(provider.execute(input))
      return { ok: true, value }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export interface DefaultActionRegistryOptions {
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown> | unknown
  isWorkspaceTrusted?: WorkspaceTrustCheck
}

export function createDefaultActionRegistry(options?: DefaultActionRegistryOptions): ActionRegistry {
  const registry = new ActionRegistry()
  registry.register({
    ...createMechanicalChecksActionProvider({
      isWorkspaceTrusted: options?.isWorkspaceTrusted
    }),
    sourceId: WORKFLOW_REGISTER_PROVIDER_SOURCE_ID
  })
  if (options) {
    registry.register({
      id: "vscode.executeCommand",
      sourceId: WORKFLOW_REGISTER_PROVIDER_SOURCE_ID,
      execute: (input) => {
        requireWorkspaceTrust(options.isWorkspaceTrusted, "VS Code コマンドを実行")
        const args = argumentList(input.args)
        const command = args.shift()
        if (typeof command !== "string" || !command.trim()) {
          throw new Error("vscode.executeCommand requires the command id as the first argument.")
        }
        injectWorkflowRoot(command, args, input.workflowRoot)
        return options.executeCommand(command, ...args)
      }
    })
  }
  return registry
}

function argumentList(value: unknown): unknown[] {
  if (value === undefined) return []
  return Array.isArray(value) ? [...value] : [value]
}

function injectWorkflowRoot(command: string, args: unknown[], workflowRoot: string | undefined): void {
  if (!workflowRoot || !requiresWorkspaceRoot(command)) return
  const first = args[0]
  if (isRecord(first)) {
    if (typeof first.workspaceRoot !== "string" || !first.workspaceRoot.trim()) {
      args[0] = { ...first, workspaceRoot: workflowRoot }
    }
  } else if (first === undefined) {
    args[0] = { workspaceRoot: workflowRoot }
  }
}

function requiresWorkspaceRoot(command: string): boolean {
  return command.startsWith("bobProcess.") ||
    command.startsWith("bobTemplate.") ||
    command.startsWith("bobCodeConsistency.")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
