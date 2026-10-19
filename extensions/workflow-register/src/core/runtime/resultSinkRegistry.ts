import * as fs from "fs/promises"
import * as path from "path"
import { ResultSinkDefinition, ResultSinkWriteInput, ResultSinkWriteResult } from "../model"
import { requireWorkspaceTrust, type WorkspaceTrustCheck } from "../workspaceTrust"
import { writeWorkspaceFilesAtomically } from "./workspaceFileTransaction"
import type { ContributionRuntimeResolver, ContributionSinkBinding } from "../contractV2/providerRegistry"
import { readContributionRecord } from "../contributionManifest"
import type { ContributionRegistration, SinkHandler } from "../contributionRegistration"
export type { SinkHandler } from "../contributionRegistration"
type FileTransactionCommit = () => Promise<void> | void
export interface ResultSinkFileTransactionWrite {
  sink: Extract<ResultSinkDefinition, { type: "file" }>
  input: ResultSinkWriteInput
}
export type FileTransactionHandler = (
  writes: ResultSinkFileTransactionWrite[],
  commitState: FileTransactionCommit
) => Promise<ResultSinkWriteResult>

export interface ContributionSinkRequest { readonly type: string; readonly contractVersion: string; readonly payload: unknown }
export interface ResultSinkRunScope { readonly workspaceRoot: string; readonly runId: string }
interface TransactionBinding { readonly token: object; readonly ownerToken: object; readonly handler: SinkHandler; readonly transaction: FileTransactionHandler }
const scopeKey = (scope: ResultSinkRunScope): string => JSON.stringify([scope.workspaceRoot, scope.runId])

export class ResultSinkFileTransactionBinding {
  private readonly bindings = new Map<string, TransactionBinding>()
  bind(scope: ResultSinkRunScope, ownerToken: object, handler: SinkHandler, transaction: FileTransactionHandler): ContributionRegistration {
    if (!scope.workspaceRoot || !scope.runId) throw new Error("File transaction scope is required.")
    const key = scopeKey(scope)
    if (this.bindings.has(key)) throw new Error("File transaction scope is already bound.")
    const token = Object.freeze({})
    this.bindings.set(key, { token, ownerToken, handler, transaction })
    return Object.freeze({ dispose: () => { if (this.bindings.get(key)?.token === token) this.bindings.delete(key) } })
  }
  hasScope(scope: ResultSinkRunScope): boolean { return this.bindings.has(scopeKey(scope)) }
  getFileTransaction(scope: ResultSinkRunScope, ownerToken: object, handler: SinkHandler): FileTransactionHandler | undefined {
    const binding = this.bindings.get(scopeKey(scope))
    return binding?.ownerToken === ownerToken && binding.handler === handler ? binding.transaction : undefined
  }
}

export interface ResultSinkRegistryOptions {
  readonly workspaceRoot?: string
  readonly contributions?: ContributionRuntimeResolver
  readonly legacyHandler?: (type: string) => SinkHandler | undefined
  readonly listTypes?: () => readonly string[]
  readonly runtimeContext?: DefaultResultSinkRegistryOptions
  readonly requireOwnedSinks?: boolean
  readonly fallbackHandlers?: Readonly<{ command: SinkHandler; file: SinkHandler; fileTransaction: FileTransactionHandler }>
  readonly fileTransactionFactory?: (scope: ResultSinkRunScope, binding: ContributionSinkBinding) => FileTransactionHandler | undefined
}
interface RuntimeWriteContext extends DefaultResultSinkRegistryOptions { readonly runId: string }
// Transient input brands contain execution scope, never provider registration state.
const runtimeWriteContexts = new WeakMap<object, RuntimeWriteContext>()
export function readResultSinkRuntimeContext(input: ResultSinkWriteInput): RuntimeWriteContext {
  const context = runtimeWriteContexts.get(input)
  if (!context) throw new Error("Result sink runtime scope is unavailable.")
  return context
}
const COMMAND_CONTRACT = "workflow-register.command-result-sink/v1"
const FILE_CONTRACT = "workflow-register.file-result-sink/v1"

export class ResultSinkRegistry {
  private readonly handlers = new Map<string, SinkHandler>()
  private fileTransactionHandler?: FileTransactionHandler
  private readonly fileBindings = new ResultSinkFileTransactionBinding()

  constructor(private readonly options: ResultSinkRegistryOptions = {}) { this.fileTransactionHandler = options.fallbackHandlers?.fileTransaction }

  register(type: string, handler: SinkHandler): void {
    if (!type.trim()) throw new Error("Result sink type is required.")
    this.handlers.set(type, handler)
  }

  list(): string[] {
    return Array.from(new Set([...this.handlers.keys(), ...(this.options.fallbackHandlers ? ["command", "file"] : []), ...(this.options.listTypes?.() ?? [])])).sort()
  }

  registerFileTransaction(handler: FileTransactionHandler): void {
    this.fileTransactionHandler = handler
  }

  async writeFileTransaction(
    writes: ResultSinkFileTransactionWrite[],
    commitState: FileTransactionCommit = () => undefined
  ): Promise<ResultSinkWriteResult> {
    if (writes.length === 0) return { ok: true }
    try {
      if (this.options.contributions) {
        const scope = { workspaceRoot: this.options.workspaceRoot ?? "", runId: writes[0].input.runId }
        if (!scope.workspaceRoot || !scope.runId || writes.some(write => write.input.runId !== scope.runId || write.sink.type !== "file")) return { ok: false, error: "File transaction scope mismatch." }
        const binding = this.options.contributions.getResultSinkBinding("file")
        if (!binding || binding.contractVersion !== FILE_CONTRACT) {
          if (this.options.requireOwnedSinks || this.fileBindings.hasScope(scope)) return { ok: false, error: "File transaction contribution is unavailable." }
        } else {
          if (!this.fileBindings.hasScope(scope)) {
            const transaction = this.options.fileTransactionFactory?.(scope, binding)
            if (!transaction) return { ok: false, error: "File transaction contribution is unsupported." }
            this.fileBindings.bind(scope, binding.ownerToken, binding.handler, transaction)
          }
          const transaction = this.fileBindings.getFileTransaction(scope, binding.ownerToken, binding.handler)
          if (!transaction) return { ok: false, error: "File transaction owner generation mismatch." }
          return await this.invokeFileTransaction(transaction, writes, () => {
            const current = this.options.contributions?.getResultSinkBinding("file")
            if (!current || current.ownerToken !== binding.ownerToken || current.handler !== binding.handler || current.contractVersion !== FILE_CONTRACT) throw new Error("File transaction owner generation mismatch.")
            return commitState()
          })
        }
      }
      if (!this.fileTransactionHandler) {
        // Compatibility for registries that predate the transaction capability.
        // Earlier successful external writes cannot be rolled back by a legacy handler.
        for (const write of writes) {
          const result = await this.write(write.sink, write.input)
          if (!result.ok) return result
        }
        await Promise.resolve(commitState())
        return { ok: true }
      }
      return await this.invokeFileTransaction(this.fileTransactionHandler, writes, commitState)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async invokeFileTransaction(transaction: FileTransactionHandler, writes: ResultSinkFileTransactionWrite[], commitState: FileTransactionCommit): Promise<ResultSinkWriteResult> {
    let committed = false
    const result = await transaction(writes, async () => { await Promise.resolve(commitState()); committed = true })
    return result.ok && !committed ? { ok: false, error: "Transactional file result sink did not commit run state." } : result
  }

  async writeContribution(request: ContributionSinkRequest, input: ResultSinkWriteInput): Promise<ResultSinkWriteResult> {
    try {
      const r = readContributionRecord(request, ["type", "contractVersion", "payload"], [], "contribution.handlers.invalid")
      if (typeof r.type !== "string" || typeof r.contractVersion !== "string") return { ok: false, error: "Result sink contribution contract mismatch." }
      const binding = this.options.contributions?.getResultSinkBinding(r.type)
      if (!binding || binding.contractVersion !== r.contractVersion) return { ok: false, error: "Result sink contribution contract mismatch." }
      const scopedInput = Object.freeze({ ...input })
      runtimeWriteContexts.set(scopedInput, Object.freeze({ ...(this.options.runtimeContext ?? { workspaceRoot: this.options.workspaceRoot ?? "", executeCommand: () => undefined }), runId: input.runId }))
      return await binding.handler(r.payload as ResultSinkDefinition, scopedInput)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async write(sink: ResultSinkDefinition, input: ResultSinkWriteInput): Promise<ResultSinkWriteResult> {
    let handler = this.options.legacyHandler?.(sink.type) ?? this.handlers.get(sink.type)
    if (!handler && this.options.contributions) {
      const contractVersion = sink.type === "command" ? COMMAND_CONTRACT : sink.type === "file" ? FILE_CONTRACT : undefined
      if (contractVersion && (this.options.requireOwnedSinks || this.options.contributions.getResultSinkBinding(sink.type))) return this.writeContribution({ type: sink.type, contractVersion, payload: sink }, input)
    }
    if (!handler) handler = sink.type === "command" ? this.options.fallbackHandlers?.command : sink.type === "file" ? this.options.fallbackHandlers?.file : undefined
    if (!handler) return { ok: false, error: `Unsupported result sink: ${sink.type}` }
    try {
      return await handler(sink, input)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export interface DefaultResultSinkRegistryOptions {
  workspaceRoot: string
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown> | unknown
  allowedCommandSinks?: string[]
  isWorkspaceTrusted?: WorkspaceTrustCheck
}

export function createDefaultResultSinkRegistry(options: DefaultResultSinkRegistryOptions): ResultSinkRegistry {
  const handlers = createDefaultResultSinkHandlers(options), registry = new ResultSinkRegistry()
  registry.register("command", handlers.command)
  registry.register("file", handlers.file)
  registry.registerFileTransaction(handlers.fileTransaction)
  return registry
}

/** Stateless scoped handlers also used by the owned built-in contribution set. */
export function createDefaultResultSinkHandlers(options: DefaultResultSinkRegistryOptions): Readonly<{ command: SinkHandler; file: SinkHandler; fileTransaction: FileTransactionHandler }> {
  const allowedCommandSinks = new Set(options.allowedCommandSinks ?? ["bobBazaar.captureReviewResult"])

  const command: SinkHandler = async (sink, input) => {
    if (sink.type !== "command") return { ok: false, error: `Invalid command sink: ${sink.type}` }
    requireWorkspaceTrust(options.isWorkspaceTrusted, "コマンド結果を書き込む")
    if (!allowedCommandSinks.has(sink.command)) return { ok: false, error: `Unsupported result command: ${sink.command}` }
    const value = await Promise.resolve(options.executeCommand(sink.command, input.text, ...(sink.args ?? []), commandContext(input, options.workspaceRoot)))
    const reportedError = commandReportedError(value)
    if (reportedError) return { ok: false, value, error: reportedError }
    return { ok: true, value }
  }

  const file: SinkHandler = async (sink, input) => {
    if (sink.type !== "file") return { ok: false, error: `Invalid file sink: ${sink.type}` }
    requireWorkspaceTrust(options.isWorkspaceTrusted, "ファイルへ結果を書き込む")
    const target = resolveWorkspacePath(options.workspaceRoot, renderTemplate(sink.path, input))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, input.text, { encoding: sink.encoding ?? "utf8" })
    return { ok: true, path: target }
  }

  const fileTransaction: FileTransactionHandler = async (writes, commitState) => {
    for (const write of writes) {
      requireWorkspaceTrust(options.isWorkspaceTrusted, "ファイルへ結果を書き込む")
      if (write.sink.type !== "file") return { ok: false, error: `Invalid file transaction sink: ${write.sink.type}` }
    }
    await writeWorkspaceFilesAtomically(options.workspaceRoot, writes.map((write) => ({
      relativePath: renderTemplate(write.sink.path, write.input),
      text: write.input.text,
      encoding: write.sink.encoding
    })), commitState)
    return { ok: true }
  }

  return Object.freeze({ command, file, fileTransaction })
}

function resolveWorkspacePath(workspaceRoot: string, sinkPath: string): string {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(root, sinkPath)
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Result file path escapes the workspace: ${sinkPath}`)
  }
  return target
}

function renderTemplate(value: string, input: ResultSinkWriteInput): string {
  return value
    .replace(/\{\{\s*run\.id\s*\}\}/g, input.runId)
    .replace(/\{\{\s*runId\s*\}\}/g, input.runId)
    .replace(/\{\{\s*step\.id\s*\}\}/g, input.stepId)
    .replace(/\{\{\s*stepId\s*\}\}/g, input.stepId)
    .replace(/\{\{\s*workflow\.id\s*\}\}/g, input.workflowId)
}

function commandContext(input: ResultSinkWriteInput, workspaceRoot: string): Record<string, unknown> {
  return compactObject({
    workflowId: input.workflowId,
    logicalWorkflowId: input.logicalWorkflowId,
    workflowRoot: input.workflowRoot ?? workspaceRoot,
    workflowFile: input.workflowFile,
    workflowFolderName: input.workflowFolderName,
    runId: input.runId,
    stepId: input.stepId,
    inputs: input.inputs,
    state: input.state,
    latestAssistantText: input.text,
    resultText: input.text,
    artifactText: input.text
  })
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function commandReportedError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (record.status !== "error" && record.valid !== false) return undefined
  const issues = Array.isArray(record.issues)
    ? record.issues.map(formatIssue).filter(Boolean).join("; ")
    : undefined
  return issues ? `result command reported an error: ${issues}` : "result command reported an error."
}

function formatIssue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const issue = value as Record<string, unknown>
  const issuePath = typeof issue.path === "string" ? issue.path : "$"
  const message = typeof issue.message === "string" ? issue.message : "validation failed"
  return `${issuePath}: ${message}`
}
