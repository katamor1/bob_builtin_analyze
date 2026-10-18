import { types } from "node:util"
import type { ActionProvider } from "./actionTypes"
import type { WorkflowPreflightChecks } from "./engine/preflight"
import type { AgentProvider, ResultSinkDefinition, ResultSinkWriteInput, ResultSinkWriteResult } from "./model"
import {
  readContributionRecord, readInstalledContributionOwner, rejectContribution, validateContributionManifest,
  type InstalledContributionOwner, type WorkflowContributionManifest
} from "./contributionManifest"

export type PreflightCheckHandler = WorkflowPreflightChecks[string]
export type SinkHandler = (sink: ResultSinkDefinition, input: ResultSinkWriteInput) => Promise<ResultSinkWriteResult>
export interface ContributionHandlerSet {
  readonly actionProviders: Map<string, ActionProvider>
  readonly preflightChecks: Map<string, PreflightCheckHandler>
  readonly resultSinks: Map<string, SinkHandler>
  readonly agentProvider?: AgentProvider
}
export interface ContributionRegistration { dispose(): void }
export interface PreparedContributionData {
  readonly manifest: Readonly<WorkflowContributionManifest>
  readonly installed: InstalledContributionOwner
  readonly actionProviders: readonly Readonly<ActionProvider>[]
  readonly preflightChecks: readonly (readonly [string, PreflightCheckHandler])[]
  readonly resultSinks: readonly (readonly [string, SinkHandler])[]
  readonly agentProvider?: Readonly<AgentProvider>
}
declare const preparedBrand: unique symbol
export interface PreparedContributionSet { readonly [preparedBrand]: true }
const preparedStates = new WeakMap<object, PreparedContributionData>()
const isProxy = types.isProxy, getPrototype = Object.getPrototypeOf, ownKeys = Reflect.ownKeys
const freeze = Object.freeze, mapPrototype = Map.prototype
const forEach = Function.prototype.call.bind(Map.prototype.forEach) as (value: Map<unknown, unknown>, callback: (value: unknown, key: unknown) => void) => void
const ERROR = "contribution.handlers.invalid" as const
function callable(value: unknown): value is (...args: never[]) => unknown { return typeof value === "function" && !isProxy(value) }
function snapshotMap(value: unknown): Map<string, unknown> {
  if (typeof value !== "object" || value === null || isProxy(value) || getPrototype(value) !== mapPrototype || ownKeys(value).length !== 0) rejectContribution(ERROR)
  const result = new Map<string, unknown>()
  let count = 0
  try {
    forEach(value as Map<unknown, unknown>, (item, key) => {
      if (++count > 20_000 || typeof key !== "string") rejectContribution(ERROR)
      result.set(key, item)
    })
  } catch { rejectContribution(ERROR) }
  return result
}

export function prepareContributionSet(manifestValue: unknown, installedValue: InstalledContributionOwner, handlerValue: unknown): PreparedContributionSet {
  const installed = readInstalledContributionOwner(installedValue)
  const manifest = validateContributionManifest(manifestValue, installed)
  const handlers = readContributionRecord(handlerValue, ["actionProviders", "preflightChecks", "resultSinks"], ["agentProvider"], ERROR)
  const actions = snapshotMap(handlers.actionProviders), preflight = snapshotMap(handlers.preflightChecks), sinks = snapshotMap(handlers.resultSinks)
  if (actions.size !== manifest.action_providers.length || preflight.size !== manifest.preflight_checks.length || sinks.size !== manifest.result_sinks.length
    || Object.hasOwn(handlers, "agentProvider") !== (manifest.agent_provider !== undefined)) rejectContribution(ERROR)
  const actionProviders: Readonly<ActionProvider>[] = []
  for (const item of manifest.action_providers) {
    const record = readContributionRecord(actions.get(item.id), ["id", "execute"], ["sourceId"], ERROR)
    if (record.id !== item.id || !callable(record.execute) || (record.sourceId !== undefined && record.sourceId !== installed.id)) rejectContribution(ERROR)
    actionProviders.push(freeze({ id: item.id, sourceId: installed.id, execute: record.execute as ActionProvider["execute"] }))
  }
  const preflightChecks: (readonly [string, PreflightCheckHandler])[] = []
  for (const item of manifest.preflight_checks) {
    const fn = preflight.get(item.id)
    if (!callable(fn)) rejectContribution(ERROR)
    preflightChecks.push(freeze([item.id, fn as PreflightCheckHandler] as const))
  }
  const resultSinks: (readonly [string, SinkHandler])[] = []
  for (const item of manifest.result_sinks) {
    const fn = sinks.get(item.type)
    if (!callable(fn)) rejectContribution(ERROR)
    resultSinks.push(freeze([item.type, fn as SinkHandler] as const))
  }
  let agentProvider: Readonly<AgentProvider> | undefined
  if (manifest.agent_provider !== undefined) {
    const record = readContributionRecord(handlers.agentProvider, ["run"], [], ERROR)
    if (!callable(record.run)) rejectContribution(ERROR)
    agentProvider = freeze({ run: record.run as AgentProvider["run"] })
  }
  const data = freeze({ manifest, installed, actionProviders: freeze(actionProviders), preflightChecks: freeze(preflightChecks), resultSinks: freeze(resultSinks), ...(agentProvider ? { agentProvider } : {}) })
  const prepared = freeze({}) as PreparedContributionSet
  preparedStates.set(prepared, data)
  return prepared
}

/** Internal consumer bridge; prepared payloads never constitute registered state. */
export function readPreparedContributionSet(value: PreparedContributionSet): PreparedContributionData {
  if (typeof value !== "object" || value === null || isProxy(value)) rejectContribution(ERROR)
  const result = preparedStates.get(value)
  if (!result) rejectContribution(ERROR)
  return result
}
