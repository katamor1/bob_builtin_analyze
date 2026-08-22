import { types as utilTypes } from "node:util"
import type { WorkflowPackageFileSystem } from "./packageFileSystem"

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectFreeze = Object.freeze
const weakMapGet = WeakMap.prototype.get
const weakMapSet = WeakMap.prototype.set

const workflowPackageRootBrand: unique symbol = Symbol("WorkflowPackageRoot")

export interface WorkflowPackageRoot {
  readonly [workflowPackageRootBrand]: true
}

interface WorkflowPackageRootState {
  readonly fileSystem: WorkflowPackageFileSystem<unknown>
  readonly hostRoot: unknown
}

const rootState = new WeakMap<object, WorkflowPackageRootState>()

export function createWorkflowPackageRoot<HostRoot>(
  fileSystem: WorkflowPackageFileSystem<HostRoot>,
  hostRoot: HostRoot
): WorkflowPackageRoot {
  if ((typeof fileSystem !== "object" && typeof fileSystem !== "function") || fileSystem === null || isProxy(fileSystem)) {
    throw new TypeError("Workflow package file system must be a non-proxy object.")
  }
  const root = objectFreeze(objectCreate(null)) as WorkflowPackageRoot
  weakMapSet.call(rootState, root, objectFreeze({
    fileSystem: fileSystem as WorkflowPackageFileSystem<unknown>,
    hostRoot
  }))
  return root
}

export function requireWorkflowPackageRootState(
  value: unknown,
  fileSystem: WorkflowPackageFileSystem<unknown>
): WorkflowPackageRootState {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError("Workflow package root is invalid.")
  }
  const state = weakMapGet.call(rootState, value) as WorkflowPackageRootState | undefined
  if (state === undefined || state.fileSystem !== fileSystem) {
    throw new TypeError("Workflow package root does not belong to the supplied file system.")
  }
  return state
}
