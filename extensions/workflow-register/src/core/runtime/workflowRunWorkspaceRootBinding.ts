import { AsyncLocalStorage } from "async_hooks"
import * as fs from "fs"
import * as fsPromises from "fs/promises"
import * as path from "path"

type RootBindings = ReadonlyMap<string, string>

const bindings = new AsyncLocalStorage<RootBindings>()

export function workflowRunWorkspaceRootBinding(workspaceRoot: string): string | undefined {
  return bindings.getStore()?.get(normalizeRequestedRoot(workspaceRoot))
}

export async function resolveWorkflowRunWorkspaceRoot(
  workspaceRoot: string,
  realpath: (target: string) => Promise<string> = fsPromises.realpath
): Promise<string> {
  const requested = requestedRoot(workspaceRoot)
  return bindings.getStore()?.get(normalizeRequestedRoot(requested)) ?? realpath(requested)
}

export function resolveWorkflowRunWorkspaceRootSync(
  workspaceRoot: string,
  realpath: (target: string) => string = fs.realpathSync.native
): string {
  const requested = requestedRoot(workspaceRoot)
  return bindings.getStore()?.get(normalizeRequestedRoot(requested)) ?? realpath(requested)
}

export function withWorkflowRunWorkspaceRootBinding<T>(
  requestedWorkspaceRoot: string,
  acquiredPhysicalRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = normalizeRequestedRoot(requestedWorkspaceRoot)
  const physicalRoot = path.resolve(acquiredPhysicalRoot)
  const current = bindings.getStore()
  const existing = current?.get(key)
  if (existing) {
    if (!sameRoot(existing, physicalRoot)) {
      throw new Error("Workflow workspace root binding changed inside one async operation.")
    }
    return operation()
  }
  const next = new Map(current)
  next.set(key, physicalRoot)
  return bindings.run(next, operation)
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
