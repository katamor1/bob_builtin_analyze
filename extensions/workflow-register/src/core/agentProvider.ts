import { AgentExecutionInput, AgentProvider } from "./model"

export function createLiveAgentProvider(resolve: () => AgentProvider | undefined): AgentProvider {
  return {
    async run(input: AgentExecutionInput): Promise<string> {
      const provider = resolve()
      if (!provider) throw new Error("Agent provider is required for agent workflow steps.")
      return Promise.resolve(provider.run(input))
    }
  }
}
