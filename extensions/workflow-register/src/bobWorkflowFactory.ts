import { assertWorkflowContractV2DefinitionShadow } from "./workflowContractV2ExecutionGuard"
import {
  BOB_2_0_1_PROFILE_DIGEST,
  BOB_REQUIRED_TASK_CAPABILITIES,
  probeBobTaskCapabilities
} from "./core/contractV2/bobProfile"
import type {
  BobWorkflow,
  BobWorkflowStep,
  BobWorkflowTask,
  BobWorkflowTaskBinding,
  WorkflowDefinition,
  WorkflowTodoItem
} from "./bobWorkflowTypes"

const DEFAULT_BOB_TASK_BINDING: BobWorkflowTaskBinding = Object.freeze({
  profileDigest: BOB_2_0_1_PROFILE_DIGEST,
  taskCapabilities: BOB_REQUIRED_TASK_CAPABILITIES
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
  assertWorkflowContractV2DefinitionShadow(definition)
  const bobTaskBinding = definition.bobTaskBinding ?? DEFAULT_BOB_TASK_BINDING
  const steps = buildWorkflowSteps(definition, runner, bobTaskBinding)
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

function buildWorkflowSteps(
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
