import type { WorkflowContractV2RunPlanProvenance } from "./runPlanProvenance"

declare module "../modelRuntime" {
  interface WorkflowRunState {
    planProvenance?: WorkflowContractV2RunPlanProvenance
  }
}

export {}
