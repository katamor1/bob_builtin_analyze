import { types as utilTypes } from "node:util"
import type { CompiledWorkflowPlanHandle, WorkflowPlanLease } from "./core/contractV2"
import type { WorkflowContractV2Diagnostic } from "./core/contractV2/diagnostics"
import type { CoreWorkflowDefinition } from "./core/model"
import type { WorkflowDefinition } from "./bobWorkflowTypes"
import type { CompileCurrentWorkflowContractV2Input, WorkflowContractV2AcquireResult, WorkflowContractV2CompileResult } from "./workflowContractV2Entrypoint"
import { workflowContractV2Binding, workflowContractV2CoreBinding, type WorkflowContractV2DefinitionBinding } from "./workflowContractV2View"

const freeze = Object.freeze
const descriptor = Object.getOwnPropertyDescriptor
const isProxy = utilTypes.isProxy
export class WorkflowContractV2BoundaryError extends Error {
  readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
  constructor(message: string, diagnostics: readonly WorkflowContractV2Diagnostic[] = []) {
    super(message)
    this.name = "WorkflowContractV2BoundaryError"
    this.diagnostics = freeze([...diagnostics])
    freeze(this)
  }
}
function binding(workflow: CoreWorkflowDefinition): WorkflowContractV2DefinitionBinding | undefined {
  try {
    if (isProxy(workflow)) throw new TypeError("Proxy workflow.")
    const current = workflowContractV2CoreBinding(workflow)
    if (!current && /(?:^|[\\/])current\.json$/.test(descriptor(workflow, "workflowFile")?.value ?? "")) throw new TypeError("Unbound current pointer view.")
    return current
  } catch {
    throw new WorkflowContractV2BoundaryError("Unauthenticated Contract v2 view.")
  }
}
export function assertWorkflowContractV2Shadow(workflow: CoreWorkflowDefinition): void {
  if (binding(workflow)) throw new WorkflowContractV2BoundaryError("Contract v2は検証のみ・実行不可です。")
}
export function assertWorkflowContractV2DefinitionShadow(workflow: WorkflowDefinition): void {
  try { workflowContractV2Binding(workflow) } catch { throw new WorkflowContractV2BoundaryError("Unauthenticated Contract v2 view.") }
  assertWorkflowContractV2Shadow(workflow.core)
}
function matches(current: WorkflowContractV2DefinitionBinding, handle: CompiledWorkflowPlanHandle, raw: import("./core/contractV2/packageLoaderContract").RawWorkflowPackage): boolean {
  return handle === current.handle && raw.publication === "published"
    && raw.generation === current.rawPackage.generation
    && raw.packageDigest === current.rawPackage.packageDigest
    && raw.workflowId === current.slot.workflowId
    && handle.plan.workflowId === current.slot.workflowId
    && handle.plan.packageDigest === raw.packageDigest
}
export async function verifyWorkflowContractV2CurrentPlan(input: {
  readonly workflow: CoreWorkflowDefinition
  readonly compileCurrent: (input: CompileCurrentWorkflowContractV2Input) => Promise<WorkflowContractV2CompileResult>
}): Promise<CompiledWorkflowPlanHandle | undefined> {
  const current = binding(input.workflow)
  if (!current) return undefined
  const result = await input.compileCurrent({ slot: current.slot, consumer: "operation-hub" })
  if (!result.ok) throw new WorkflowContractV2BoundaryError("Contract v2 current package is invalid or unavailable.", result.diagnostics)
  if (!matches(current, result.handle, result.rawPackage)) throw new WorkflowContractV2BoundaryError("Contract v2 view changed; refresh the catalog.")
  return result.handle
}
// Internal fixture helper only. Product entrypoints always deny acquisition.
export async function acquireWorkflowContractV2RunLease(input: {
  readonly workflow: CoreWorkflowDefinition
  readonly acquireCurrent: (input: CompileCurrentWorkflowContractV2Input) => Promise<WorkflowContractV2AcquireResult>
}): Promise<WorkflowPlanLease | undefined> {
  const current = binding(input.workflow)
  if (!current) return undefined
  const result = await input.acquireCurrent({ slot: current.slot, consumer: "run-creation" })
  if (!result.ok) throw new WorkflowContractV2BoundaryError("Contract v2 current package is invalid or unavailable.", result.diagnostics)
  const lease = result.lease
  try {
    if (!matches(current, lease.handle, result.rawPackage)) throw new WorkflowContractV2BoundaryError("Contract v2 view changed; refresh the catalog.")
    return lease
  } catch (error) { lease.release(); throw error }
}
