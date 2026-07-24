import type { ActionRegistry } from "./core/actionRegistry"
import {
  createAuditedWorkflowCompilerEnvironment,
  type CompiledWorkflowPlanHandle,
  type WorkflowPlanLease
} from "./core/contractV2"
import {
  BOB_2_0_1_PROFILE_DIGEST,
  snapshotBobContractProfile
} from "./core/contractV2/bobProfile"
import {
  loadCurrentWorkflowPackage,
  loadWorkflowPackageGeneration
} from "./core/contractV2/packageLoader"
import type { RawWorkflowPackage } from "./core/contractV2/packageLoaderContract"
import { createNodeWorkflowPackageFileSystem } from "./core/contractV2/packageFileSystemNode"
import { createWorkflowPackageRoot } from "./core/contractV2/packageRoot"
import type { Sha256Digest } from "./core/contractV2/providerContract"
import {
  createWorkflowContractV2Entrypoint,
  type WorkflowContractV2Entrypoint,
  type WorkflowContractV2Slot
} from "./workflowContractV2Entrypoint"

export const WORKFLOW_CONTRACT_V2_BOB_PROFILE_DIGEST = BOB_2_0_1_PROFILE_DIGEST

export interface WorkflowContractV2PlanStoreFacade {
  getOrCompile(input: {
    readonly collectionId: string
    readonly workflowId: string
    readonly rawPackage: RawWorkflowPackage
    readonly environment: ReturnType<typeof createAuditedWorkflowCompilerEnvironment>
  }): Promise<CompiledWorkflowPlanHandle>
  acquire(input: {
    readonly collectionId: string
    readonly workflowId: string
    readonly rawPackage: RawWorkflowPackage
    readonly environment: ReturnType<typeof createAuditedWorkflowCompilerEnvironment>
  }): Promise<WorkflowPlanLease>
  invalidate(collectionId: string, workflowId: string): void
}

export interface CreateWorkflowContractV2ProductEntrypointInput {
  readonly actionRegistry: ActionRegistry
  readonly planStore: WorkflowContractV2PlanStoreFacade
  readonly purpose?: "runtime" | "authoring-validation" | "evidence"
}

const packageFileSystem = createNodeWorkflowPackageFileSystem()
const objectFreeze = Object.freeze

export function createWorkflowContractV2ProductEntrypoint(
  input: CreateWorkflowContractV2ProductEntrypointInput
): WorkflowContractV2Entrypoint {
  const purpose = input.purpose ?? "runtime"
  const environment = createAuditedWorkflowCompilerEnvironment({
    purpose,
    providerCatalog: input.actionRegistry.snapshotWorkflowProviderCatalog(),
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })

  return createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: (slot) => loadCurrent(slot),
    loadGeneration: (slot) => loadGeneration(slot),
    getOrCompile: (request) => input.planStore.getOrCompile(request),
    acquire: (request) => input.planStore.acquire(request),
    invalidate: (collectionId, workflowId) => input.planStore.invalidate(collectionId, workflowId)
  })
}

async function loadCurrent(slot: WorkflowContractV2Slot): Promise<RawWorkflowPackage> {
  return loadCurrentWorkflowPackage({
    fileSystem: packageFileSystem,
    collectionRoot: createWorkflowPackageRoot(packageFileSystem, slot.collectionRoot),
    workflowId: slot.workflowId
  })
}

async function loadGeneration(
  slot: WorkflowContractV2Slot & {
    readonly generation: Sha256Digest
    readonly expectedPackageDigest?: Sha256Digest
  }
): Promise<RawWorkflowPackage> {
  return loadWorkflowPackageGeneration(objectFreeze({
    fileSystem: packageFileSystem,
    collectionRoot: createWorkflowPackageRoot(packageFileSystem, slot.collectionRoot),
    workflowId: slot.workflowId,
    generation: slot.generation,
    ...(slot.expectedPackageDigest === undefined
      ? {}
      : { expectedPackageDigest: slot.expectedPackageDigest })
  }))
}
