import * as nodePath from "node:path"

import { inspectWorkflowArtifactTransactionRecovery } from "./core/contractV2/artifactTransactionRecovery"
import {
  classifyWorkflowContractV2AttemptRecovery,
  type WorkflowContractV2AttemptRecoveryClassification
} from "./core/contractV2/runAttemptRecovery"
import { recoverWorkflowContractV2RunPlanLease } from "./core/contractV2/runPlanRecovery"
import type { WorkflowPlanLease } from "./core/contractV2/planLease"
import type { WorkflowProviderEffectIntentV1 } from "./core/contractV2/providerEffectIntent"
import { releaseWorkflowContractV2RunPlanLease } from "./core/contractV2/runPlanProvenance"
import {
  classifyWorkflowContractV2Restart,
  expectedWorkflowContractV2RestartEffectIntent,
  type WorkflowContractV2RestartDecision
} from "./core/contractV2/runRestartRecovery"
import { classifyWorkflowContractV2RunRecovery } from "./core/engine/recoveryState"
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

export interface RecoverWorkflowContractV2ProductRunForRetryResult {
  readonly lease: WorkflowPlanLease
  readonly restart: Extract<WorkflowContractV2RestartDecision, { readonly kind: "restart" }>
}

const objectFreeze = Object.freeze

export async function recoverWorkflowContractV2ProductRunPlan(
  input: RecoverWorkflowContractV2ProductRunInput
): Promise<WorkflowPlanLease> {
  const classification = classifyWorkflowContractV2RunRecovery(input.run)
  if (classification.kind !== "resume") {
    throw new WorkflowContractV2BoundaryError(
      "Contract v2 run cannot resume automatically from its recorded durable state."
    )
  }

  let lease: WorkflowPlanLease | undefined
  try {
    lease = await acquireRecordedGeneration(input)
    const attemptRecovery = await classifyAttemptRecovery(input, lease)
    if (attemptRecovery.kind === "invalid") {
      throw new WorkflowContractV2BoundaryError(
        "Contract v2 run cannot resume because its persisted attempt or artifact evidence is invalid."
      )
    }
    if (attemptRecovery.kind === "in-doubt") {
      throw new WorkflowContractV2BoundaryError(
        "Contract v2 run cannot resume automatically because its latest attempt outcome is in doubt."
      )
    }
    return lease
  } catch (error) {
    releaseRecoveredLease(input, lease)
    throw error
  }
}

export async function recoverWorkflowContractV2ProductRunForRetry(
  input: RecoverWorkflowContractV2ProductRunInput
): Promise<RecoverWorkflowContractV2ProductRunForRetryResult> {
  let lease: WorkflowPlanLease | undefined
  try {
    lease = await acquireRecordedGeneration(input)
    const initialAttemptRecovery = await classifyAttemptRecovery(input, lease)
    if (initialAttemptRecovery.kind === "invalid") {
      throw new WorkflowContractV2BoundaryError(
        "Contract v2 run cannot retry because its persisted attempt or artifact evidence is invalid."
      )
    }
    const effectIntent = expectedWorkflowContractV2RestartEffectIntent(lease, input.run)
    const attemptRecovery = await reinspectWorkflowContractV2RestartAttempt(
      input,
      initialAttemptRecovery,
      effectIntent
    )
    const restart = classifyWorkflowContractV2Restart({
      plan: lease.handle.plan,
      run: input.run,
      attemptRecovery,
      effectIntent
    })
    if (restart.kind === "blocked") {
      throw new WorkflowContractV2BoundaryError(restart.reason)
    }
    return objectFreeze({ lease, restart })
  } catch (error) {
    releaseRecoveredLease(input, lease)
    throw error
  }
}

async function acquireRecordedGeneration(
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

function classifyAttemptRecovery(
  input: RecoverWorkflowContractV2ProductRunInput,
  lease: WorkflowPlanLease
) {
  return classifyWorkflowContractV2AttemptRecovery({
    plan: lease.handle.plan,
    run: input.run,
    runRoot: runRoot(input)
  })
}

async function reinspectWorkflowContractV2RestartAttempt(
  input: RecoverWorkflowContractV2ProductRunInput,
  initial: WorkflowContractV2AttemptRecoveryClassification,
  effectIntent: WorkflowProviderEffectIntentV1
): Promise<WorkflowContractV2AttemptRecoveryClassification> {
  if (effectIntent.sideEffect !== "workspace-write" || initial.kind !== "clean") {
    return initial
  }
  const inspection = await inspectWorkflowArtifactTransactionRecovery({
    runRoot: runRoot(input),
    attemptId: effectIntent.attemptId
  })
  if (inspection.status === "committed") {
    return objectFreeze({
      kind: "invalid" as const,
      reason: "Prepared workflow retry unexpectedly observed committed visibility."
    })
  }
  if (inspection.status === "orphaned") {
    return objectFreeze({
      kind: "in-doubt" as const,
      stepId: effectIntent.stepId,
      attemptId: effectIntent.attemptId,
      artifactStatus: "orphaned" as const,
      artifactSetDigest: inspection.artifactSetDigest,
      committed: initial.committed
    })
  }
  return objectFreeze({
    kind: "in-doubt" as const,
    stepId: effectIntent.stepId,
    attemptId: effectIntent.attemptId,
    artifactStatus: inspection.status,
    committed: initial.committed
  })
}

function runRoot(input: RecoverWorkflowContractV2ProductRunInput): string {
  return nodePath.join(
    input.workspaceRoot,
    ".bob",
    "workflows",
    "runs",
    input.run.runId
  )
}

function releaseRecoveredLease(
  input: RecoverWorkflowContractV2ProductRunInput,
  lease: WorkflowPlanLease | undefined
): void {
  releaseWorkflowContractV2RunPlanLease(input.workspaceRoot, input.run.runId)
  if (lease !== undefined && !lease.released) lease.release()
}
