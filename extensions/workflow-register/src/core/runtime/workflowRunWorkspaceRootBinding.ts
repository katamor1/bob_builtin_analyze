import { AsyncLocalStorage } from "async_hooks"
import * as fs from "fs"
import * as fsPromises from "fs/promises"
import * as path from "path"

export interface WorkflowRunWorkspaceRootScopeToken {
  isActive(): boolean
}

export interface WorkflowRunWorkspaceRootScope {
  token: WorkflowRunWorkspaceRootScopeToken
  revoke(): void
}

interface RootBinding {
  physicalRoot: string
  scope: WorkflowRunWorkspaceRootScopeToken
}

type RootBindings = ReadonlyMap<string, readonly RootBinding[]>

const bindings = new AsyncLocalStorage<RootBindings>()

export function workflowRunWorkspaceRootBinding(workspaceRoot: string): string | undefined {
  return activeBinding(normalizeRequestedRoot(workspaceRoot))?.physicalRoot
}

export async function resolveWorkflowRunWorkspaceRoot(
  workspaceRoot: string,
  realpath: (target: string) => Promise<string> = fsPromises.realpath
): Promise<string> {
  const requested = requestedRoot(workspaceRoot)
  return activeBinding(normalizeRequestedRoot(requested))?.physicalRoot ?? realpath(requested)
}

export function resolveWorkflowRunWorkspaceRootSync(
  workspaceRoot: string,
  realpath: (target: string) => string = fs.realpathSync.native
): string {
  const requested = requestedRoot(workspaceRoot)
  return activeBinding(normalizeRequestedRoot(requested))?.physicalRoot ?? realpath(requested)
}

export function createWorkflowRunWorkspaceRootScope(): WorkflowRunWorkspaceRootScope {
  let active = true
  return {
    token: { isActive: () => active },
    revoke: () => { active = false }
  }
}

export function withWorkflowRunWorkspaceRootBinding<T>(
  requestedWorkspaceRoot: string,
  acquiredPhysicalRoot: string,
  scope: WorkflowRunWorkspaceRootScopeToken,
  operation: () => Promise<T>
): Promise<T> {
  if (!scope.isActive()) {
    throw new Error("Workflow workspace root binding scope is no longer active.")
  }
  const key = normalizeRequestedRoot(requestedWorkspaceRoot)
  const physicalRoot = path.resolve(acquiredPhysicalRoot)
  const current = bindings.getStore()
  const existing = activeBinding(key)
  if (existing) {
    if (!sameRoot(existing.physicalRoot, physicalRoot)) {
      throw new Error("Workflow workspace root binding changed inside one async operation.")
    }
    if (existing.scope === scope) return operation()
  }
  const next = new Map<string, readonly RootBinding[]>()
  for (const [boundKey, stack] of current ?? []) {
    const active = stack.filter((binding) => binding.scope.isActive())
    if (active.length > 0) next.set(boundKey, active)
  }
  next.set(key, [...(next.get(key) ?? []), { physicalRoot, scope }])
  return bindings.run(next, operation)
}

function activeBinding(key: string): RootBinding | undefined {
  const stack = bindings.getStore()?.get(key)
  for (let index = (stack?.length ?? 0) - 1; index >= 0; index -= 1) {
    const binding = stack?.[index]
    if (binding?.scope.isActive()) return binding
  }
  return undefined
}

function requestedRoot(workspaceRoot: string): string {
  if (!workspaceRoot.trim()) throw new Error("Workflow workspace root is empty.")
  return path.resolve(workspaceRoot)
}

function normalizeRequestedRoot(workspaceRoot: string): string {
  const requested = requestedRoot(workspaceRoot)
  return process.platform === "win32" ? requested.toLowerCase() : requested
}

function sameRoot(left: string, right: string): boolean {
  return process.platform === "win32"
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right)
}
