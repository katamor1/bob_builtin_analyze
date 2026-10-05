import type { ActionRegistry } from "./core/actionRegistry"
import {
  createAuditedWorkflowCompilerEnvironment,
  type CompiledWorkflowPlanHandle,
  type WorkflowPlanLease
} from "./core/contractV2"
import { snapshotBobContractProfile } from "./core/contractV2/bobProfile"
import {
  loadCurrentWorkflowPackage,
  loadWorkflowPackageGeneration
} from "./core/contractV2/packageLoader"
import type { RawWorkflowPackage } from "./core/contractV2/packageLoaderContract"
import { createNodeWorkflowPackageFileSystem } from "./core/contractV2/packageFileSystemNode"
import { createWorkflowPackageRoot } from "./core/contractV2/packageRoot"
import {
  createWorkflowContractV2Entrypoint,
  type WorkflowContractV2Entrypoint,
  type WorkflowContractV2Slot
} from "./workflowContractV2Entrypoint"

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
}

const packageFileSystem = createNodeWorkflowPackageFileSystem()

export function createWorkflowContractV2ProductEntrypoint(
  input: CreateWorkflowContractV2ProductEntrypointInput
): WorkflowContractV2Entrypoint {
  const environment = createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: input.actionRegistry.snapshotWorkflowProviderCatalog(),
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })

  return createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: (slot) => loadCurrentWorkflowPackage(packageInput(slot)),
    loadGeneration: (slot) => loadWorkflowPackageGeneration({
      ...packageInput(slot), generation: slot.generation,
      ...(slot.expectedPackageDigest === undefined ? {} : { expectedPackageDigest: slot.expectedPackageDigest })
    }),
    getOrCompile: (request) => input.planStore.getOrCompile(request),
    acquire: async () => { throw new TypeError("Contract v2 is shadow.") },
    invalidate: (collectionId, workflowId) => input.planStore.invalidate(collectionId, workflowId)
  })
}


function packageInput(slot: WorkflowContractV2Slot) {
  return {
    fileSystem: packageFileSystem,
    collectionRoot: createWorkflowPackageRoot(packageFileSystem, slot.collectionRoot),
    workflowId: slot.workflowId
  }
}
