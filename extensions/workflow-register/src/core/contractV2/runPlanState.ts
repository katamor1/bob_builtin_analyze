import { types as utilTypes } from "node:util"
import type { CoreWorkflowDefinition, WorkflowRunState } from "../model"
import { workflowContractV2CoreBinding } from "../../workflowContractV2View"
import { requireActiveWorkflowPlanLease, type WorkflowPlanLease } from "./planLease"
import { bindWorkflowContractV2RunPlanLease, createWorkflowContractV2RunPlanProvenance } from "./runPlanLeaseContext"

export interface CreateWorkflowContractV2RunStateInput {
  readonly shell: WorkflowRunState
  readonly workflow: CoreWorkflowDefinition
  readonly lease: WorkflowPlanLease
}
export function createWorkflowContractV2RunState(input: CreateWorkflowContractV2RunStateInput): WorkflowRunState {
  const lease = requireActiveWorkflowPlanLease(input.lease)
  if (utilTypes.isProxy(input.workflow) || utilTypes.isProxy(input.shell)) throw new TypeError("Workflow leased state is unauthenticated.")
  const binding = workflowContractV2CoreBinding(input.workflow)
  if (!binding || binding.handle !== lease.handle || input.shell.workflowId !== lease.handle.plan.workflowId) {
    throw new TypeError("Workflow leased state requires the exact authentic core view.")
  }
  const shell = input.shell, plan = lease.handle.plan
  shell.workflowSchemaVersion = "workflow-register/v2"
  shell.workflowDefinitionHash = lease.planDigest
  shell.planProvenance = createWorkflowContractV2RunPlanProvenance(lease)
  shell.currentStep = plan.workflow.steps[0]?.id
  shell.steps = plan.workflow.steps.map(step => ({ id: step.id, title: step.title, type: step.type, status: "pending" }))
  bindWorkflowContractV2RunPlanLease(shell, lease)
  return shell
}
