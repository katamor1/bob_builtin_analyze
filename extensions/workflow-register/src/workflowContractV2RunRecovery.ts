import * as nodePath from "node:path"

import { recoverWorkflowContractV2RunPlanLease } from "./core/contractV2/runPlanRecovery"
import type { WorkflowPlanLease } from "./core/contractV2/planLease"
import type { WorkflowRunState } from "./core/model"
import { relativePathFromRoot } from "./core/workspaceRoots"
import type {
  CompileWorkflowContractV2GenerationInput,
  WorkflowContractV2AcquireResult
} from "./workflowContractV2Entrypoint"
import { WorkflowContractV2BoundaryError } from "./workflowContractV2ExecutionGuard"

export interface RecoverWorkflowContractV2ProductRunInput {
  readonly workspaceRoot: string
  readonly run: WorkflowRunState
  readonly acquireGeneration: (
    input: CompileWorkflowContractV2GenerationInput
  ) => Promise<WorkflowContractV2AcquireResult>
}

const objectFreeze = Object.freeze

export async function recoverWorkflowContractV2ProductRunPlan(
  input: RecoverWorkflowContractV2ProductRunInput
): Promise<WorkflowPlanLease> {
  const collectionRoot = nodePath.join(input.workspaceRoot, ".bob", "workflows")
  return recoverWorkflowContractV2RunPlanLease({
    workspaceScope: input.workspaceRoot,
    run: input.run,
    acquireGeneration: async (recorded) => {
      const result = await input.acquireGeneration(objectFreeze({
        slot: objectFreeze({
          collectionId: relativePathFromRoot(input.workspaceRoot, collectionRoot),
          collectionRoot,
          workflowId: recorded.workflowId
        }),
        consumer: "resume" as const,
        generation: recorded.generation,
        expectedPackageDigest: recorded.expectedPackageDigest
      }))
      if (!result.ok) {
        throw new WorkflowContractV2BoundaryError(
          "Contract v2 run cannot resume because its recorded immutable generation or exact bindings are unavailable.",
          result.diagnostics
        )
      }
      return result.lease
    }
  })
}
