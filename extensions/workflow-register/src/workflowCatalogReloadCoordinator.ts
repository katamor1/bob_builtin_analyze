import { types as utilTypes } from "node:util"

const isProxy = utilTypes.isProxy
const PromiseConstructor = Promise
const promiseReject = Promise.reject.bind(Promise) as <T = never>(reason?: unknown) => Promise<T>
const promiseResolve = Promise.resolve.bind(Promise) as <T>(value: T | PromiseLike<T>) => Promise<Awaited<T>>
const promiseThen = Function.prototype.call.bind(Promise.prototype.then) as <T, R1 = T, R2 = never>(
  promise: Promise<T>,
  fulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
  rejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
) => Promise<R1 | R2>

export class WorkflowCatalogReloadCoordinator {
  private tail: Promise<void> = promiseResolve(undefined)
  private disposed = false

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    if (this.disposed) {
      return promiseReject(new Error("Workflow catalog reload coordinator is disposed."))
    }
    if (typeof operation !== "function" || isProxy(operation)) {
      return promiseReject(new TypeError("Workflow catalog reload operation must be a non-proxy function."))
    }

    const result = promiseThen(this.tail, () => operation()) as Promise<T>
    this.tail = promiseThen(
      result,
      () => undefined,
      () => undefined
    ) as Promise<void>
    return result
  }

  dispose(): void {
    this.disposed = true
  }
}

void PromiseConstructor
