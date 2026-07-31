import {
  BOB_2_0_1_PROFILE_DIGEST,
  BOB_2_0_1_TASK_CAPABILITIES,
  probeBobTaskCapabilities
} from "./core/contractV2/bobProfile"
import {
  captureAuditedBobTaskBinding,
  type AuditedBobTaskBinding
} from "./core/contractV2/bobTaskMethodBinding"
import type {
  BobWorkflow,
  BobWorkflowStep,
  BobWorkflowTask,
  BobWorkflowTaskBinding,
  WorkflowDefinition,
  WorkflowTodoItem
} from "./bobWorkflowTypes"
import { executeWorkflowContractV2BobStep } from "./workflowContractV2BobProductExecutor"
import { workflowContractV2Binding } from "./workflowContractV2View"

const DEFAULT_BOB_TASK_BINDING: BobWorkflowTaskBinding = Object.freeze({
  profileDigest: BOB_2_0_1_PROFILE_DIGEST,
  taskCapabilities: BOB_2_0_1_TASK_CAPABILITIES
})

export interface BobWorkflowStepRunner {
  runSingleWorkflowStep: (task: BobWorkflowTask) => Promise<boolean>
  runTodoStep: (todo: WorkflowTodoItem, index: number, task: BobWorkflowTask) => Promise<boolean>
  runEngineStep: (stepId: string, index: number, task: BobWorkflowTask) => Promise<boolean>
}

export function createBobWorkflow(
  definition: WorkflowDefinition,
  runner: BobWorkflowStepRunner
): BobWorkflow {
  const bobTaskBinding = definition.bobTaskBinding ?? DEFAULT_BOB_TASK_BINDING
  const compiled = workflowContractV2Binding(definition)
  const steps = compiled === undefined
    ? buildLegacyWorkflowSteps(definition, runner, bobTaskBinding)
    : buildCompiledWorkflowSteps(definition, compiled.handle, bobTaskBinding)
  return {
    hidden: definition.hidden,
    getId: () => definition.id,
    getLabel: () => definition.label,
    getMenuLabel: () => definition.menuLabel,
    getDescription: () => definition.description,
    getMode: () => definition.mode,
    isEnabled: async (env) => !definition.workspaceRequired || Boolean(env?.workspace),
    getSteps: () => steps,
    getApprovalConfig: () => ({
      allowed_permissions: definition.permissions,
      autoApprovalEnabled: definition.autoApprovalEnabled
    })
  }
}

function buildCompiledWorkflowSteps(
  definition: WorkflowDefinition,
  handle: NonNullable<ReturnType<typeof workflowContractV2Binding>>["handle"],
  bobTaskBinding: BobWorkflowTaskBinding
): BobWorkflowStep[] {
  return handle.plan.workflow.steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    execution: async (task) => {
      const auditedTask = probeCompiledTask(task, bobTaskBinding)
      return executeWorkflowContractV2BobStep({
        definition,
        handle,
        stepId: step.id,
        stepIndex: index,
        task,
        auditedTask
      })
    }
  }))
}

function buildLegacyWorkflowSteps(
  definition: WorkflowDefinition,
  runner: BobWorkflowStepRunner,
  bobTaskBinding: BobWorkflowTaskBinding
): BobWorkflowStep[] {
  if (definition.stepExecution.showInBob !== false && definition.stepExecution.mode === "engineSteps") {
    return definition.core.engineSteps.map((step, index) => ({
      id: step.id,
      title: step.title,
      execution: async (task) => runner.runEngineStep(step.id, index, probeTask(task, bobTaskBinding))
    }))
  }
  if (definition.stepExecution.showInBob !== false && definition.stepExecution.mode === "todo" && definition.todoEnabled && definition.todoAsSteps && definition.todos.length > 0) {
    return definition.todos.map((todo, index) => ({
      id: todo.id,
      title: todo.text,
      execution: async (task) => runner.runTodoStep(todo, index, probeTask(task, bobTaskBinding))
    }))
  }
  return [{
    id: "runWorkflow",
    title: definition.label,
    execution: async (task) => runner.runSingleWorkflowStep(probeTask(task, bobTaskBinding))
  }]
}

function probeCompiledTask(
  task: BobWorkflowTask,
  bobTaskBinding: BobWorkflowTaskBinding
): AuditedBobTaskBinding {
  const probed = probeBobTaskCapabilities({
    expectedProfileDigest: bobTaskBinding.profileDigest,
    requiredCapabilities: bobTaskBinding.taskCapabilities,
    task
  })
  return captureAuditedBobTaskBinding(task, probed.taskCapabilities)
}

function probeTask(
  task: BobWorkflowTask,
  bobTaskBinding: BobWorkflowTaskBinding
): BobWorkflowTask {
  probeBobTaskCapabilities({
    expectedProfileDigest: bobTaskBinding.profileDigest,
    requiredCapabilities: bobTaskBinding.taskCapabilities,
    task
  })
  return task
}
