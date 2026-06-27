import { ActionExecutionInput, ActionExecutionResult } from "./model"

export interface ActionProvider {
  id: string
  execute: (input: ActionExecutionInput) => Promise<unknown> | unknown
}

export class ActionRegistry {
  private readonly providers = new Map<string, ActionProvider>()

  register(provider: ActionProvider): void {
    if (!provider.id.trim()) throw new Error("Action provider id is required.")
    this.providers.set(provider.id, provider)
  }

  list(): string[] {
    return Array.from(this.providers.keys()).sort()
  }

  async execute(providerId: string, input: ActionExecutionInput): Promise<ActionExecutionResult> {
    const provider = this.providers.get(providerId)
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
}

export function createDefaultActionRegistry(options: DefaultActionRegistryOptions): ActionRegistry {
  const registry = new ActionRegistry()
  for (const command of [
    "bobBazaar.openReviewGui",
    "bobBazaar.collectReviewContext",
    "bobBazaar.loadReviewRules"
  ]) {
    registry.register({
      id: command,
      execute: ({ args }) => {
        const commandArgs = Array.isArray(args) ? args : args === undefined ? [] : [args]
        return options.executeCommand(command, ...commandArgs)
      }
    })
  }
  return registry
}
