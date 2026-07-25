import type { CompiledWorkflowPlanHandle, WorkflowPlanLease } from "./core/contractV2"
import type { WorkflowContractV2Diagnostic } from "./core/contractV2/diagnostics"
import type { CoreWorkflowDefinition } from "./core/model"
import type {
  CompileCurrentWorkflowContractV2Input,
  WorkflowContractV2AcquireResult,
  WorkflowContractV2CompileResult
} from "./workflowContractV2Entrypoint"
import { workflowContractV2CoreMetadata } from "./workflowContractV2View"

const objectFreeze = Object.freeze
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly WorkflowContractV2Diagnostic[]

export class WorkflowContractV2BoundaryError extends Error {
  readonly diagnostics: readonly WorkflowContractV2Diagnostic[]

  constructor(message: string, diagnostics: readonly WorkflowContractV2Diagnostic[] = EMPTY_DIAGNOSTICS) {
    super(message)
    this.name = "WorkflowContractV2BoundaryError"
    this.diagnostics = diagnostics
    objectFreeze(this)
  }
}

export async function acquireWorkflowContractV2RunLease(input: {
  readonly workflow: CoreWorkflowDefinition
  readonly acquireCurrent: (
    input: CompileCurrentWorkflowContractV2Input
  ) => Promise<WorkflowContractV2AcquireResult>
}): Promise<WorkflowPlanLease | undefined> {
  const metadata = workflowContractV2CoreMetadata(input.workflow)
  if (metadata === undefined) return undefined

  const result = await input.acquireCurrent({
    slot: slotFromMetadata(metadata),
    consumer: "run-creation"
  })
  if (!result.ok) {
    throw new WorkflowContractV2BoundaryError(
      "Contract v2 workflow cannot start because its current package is invalid or unavailable.",
      result.diagnostics
    )
  }

  const lease = result.lease
  try {
    const handle = lease.handle
    if (
      handle.planDigest !== metadata.planDigest
      || handle.plan.workflowId !== metadata.workflowId
      || handle.plan.packageDigest !== metadata.packageDigest
      || result.rawPackage.packageDigest !== metadata.packageDigest
    ) {
      throw new WorkflowContractV2BoundaryError(
        "Contract v2 workflow changed after registration; reload the workflow catalog before running it."
      )
    }
    return lease
  } catch (error) {
    lease.release()
    throw error
  }
}

export async function verifyWorkflowContractV2CurrentPlan(input: {
  readonly workflow: CoreWorkflowDefinition
  readonly compileCurrent: (
    input: CompileCurrentWorkflowContractV2Input
  ) => Promise<WorkflowContractV2CompileResult>
}): Promise<CompiledWorkflowPlanHandle | undefined> {
  const metadata = workflowContractV2CoreMetadata(input.workflow)
  if (metadata === undefined) return undefined

  const result = await input.compileCurrent({
    slot: slotFromMetadata(metadata),
    consumer: "operation-hub"
  })
  if (!result.ok) {
    throw new WorkflowContractV2BoundaryError(
      "Contract v2 workflow cannot run because its current package is invalid or unavailable.",
      result.diagnostics
    )
  }
  if (
    result.handle.planDigest !== metadata.planDigest
    || result.handle.plan.workflowId !== metadata.workflowId
    || result.handle.plan.packageDigest !== metadata.packageDigest
    || result.rawPackage.packageDigest !== metadata.packageDigest
  ) {
    throw new WorkflowContractV2BoundaryError(
      "Contract v2 workflow changed after this view was rendered; refresh before running it."
    )
  }
  return result.handle
}

function slotFromMetadata(metadata: {
  readonly collectionId: string
  readonly collectionRoot: string
  readonly workflowId: string
}): CompileCurrentWorkflowContractV2Input["slot"] {
  return objectFreeze({
    collectionId: metadata.collectionId,
    collectionRoot: metadata.collectionRoot,
    workflowId: metadata.workflowId
  })
}
