import * as fs from "node:fs"
import * as path from "node:path"
import { createDefaultActionProviders, type DefaultActionRegistryOptions } from "./core/actionRegistry"
import { createDefaultResultSinkHandlers, readResultSinkRuntimeContext } from "./core/runtime/resultSinkRegistry"
import { exists } from "./core/engine/preflight"
import { findMarkerRoots, rootHasMarker, type WorkspaceFolderLike } from "./core/workspaceRoots"
import type { InstalledContributionOwner, WorkflowContributionManifest } from "./core/contributionManifest"
import type { ContributionRegistration, SinkHandler, PreflightCheckHandler } from "./core/contributionRegistration"
import type { ProviderRegistryHost } from "./api/providerRegistryApi"

export interface BuiltInContributionsOptions extends DefaultActionRegistryOptions {
  readonly installed: InstalledContributionOwner
  readonly workspaceFolders?: () => readonly WorkspaceFolderLike[]
}

export const writeBuiltInCommandSink: SinkHandler = (sink, input) => createDefaultResultSinkHandlers(readResultSinkRuntimeContext(input)).command(sink, input)
export const writeBuiltInFileSink: SinkHandler = (sink, input) => createDefaultResultSinkHandlers(readResultSinkRuntimeContext(input)).file(sink, input)

export function registerWorkflowRegisterBuiltInContributions(host: ProviderRegistryHost, options: BuiltInContributionsOptions): ContributionRegistration {
  const bytes = fs.readFileSync(path.join(options.installed.extensionRoot, "contracts/workflow-contributions.json"))
  if (bytes.length > 4_194_304) throw new Error("Built-in contribution manifest is too large.")
  const manifest = JSON.parse(bytes.toString("utf8")) as WorkflowContributionManifest
  return host.api.registerContributionSet(manifest, options.installed, {
    actionProviders: new Map(createDefaultActionProviders(options).map(provider => [provider.id, provider])),
    preflightChecks: new Map<string, PreflightCheckHandler>([
      ["workspaceOpen", input => Boolean(input.workspaceRoot)],
      ["bobWorkspaceInitialized", input => input.workspaceRoot ? exists(path.join(input.workspaceRoot, ".bob")) : false],
      ["bazaarRepository", async input => {
        if (input.workspaceRoot && await rootHasMarker(input.workspaceRoot, ".bzr")) return true
        return (await findMarkerRoots(options.workspaceFolders?.() ?? [], ".bzr")).length > 0
      }]
    ]),
    resultSinks: new Map([["command", writeBuiltInCommandSink], ["file", writeBuiltInFileSink]])
  })
}
