const Module = require("node:module")
const path = require("node:path")

// The legacy lifecycle suite predates F7 and its fixtures model only the task
// methods exercised by each scenario. Adapt those fixtures to a complete audited
// Bob task surface without mutating them, run the production F7 probe, then unwrap
// the task before the existing runner sees it so identity-sensitive lifecycle
// assertions retain their original meaning.
const runnerModulePath = require.resolve("../out/bobWorkflowRunner.js")
const legacySuitePath = path.join(__dirname, "bobGateLifecycleLegacyCases.js")
const originalLoad = Module._load

Module._load = function auditedLifecycleLoad(request, parent, isMain) {
  let resolved
  try {
    resolved = Module._resolveFilename(request, parent, isMain)
  } catch {
    return originalLoad.call(this, request, parent, isMain)
  }
  if (resolved !== runnerModulePath) return originalLoad.call(this, request, parent, isMain)

  const realModule = originalLoad.call(this, request, parent, isMain)
  return {
    ...realModule,
    createBobWorkflow(definition, runner) {
      const originalTasks = new WeakMap()
      const wrappedRunner = {
        runSingleWorkflowStep(task) {
          return runner.runSingleWorkflowStep(originalTasks.get(task) ?? task)
        },
        runTodoStep(todo, index, task) {
          return runner.runTodoStep(todo, index, originalTasks.get(task) ?? task)
        },
        runEngineStep(stepId, index, task) {
          return runner.runEngineStep(stepId, index, originalTasks.get(task) ?? task)
        }
      }
      const workflow = realModule.createBobWorkflow(definition, wrappedRunner)
      const steps = workflow.getSteps().map((step) => ({
        ...step,
        execution(task) {
          const auditedTask = legacyAuditedTask(task)
          originalTasks.set(auditedTask, task)
          return step.execution(auditedTask)
        }
      }))
      return { ...workflow, getSteps: () => steps }
    }
  }
}

try {
  require(legacySuitePath)
} finally {
  Module._load = originalLoad
}

function legacyAuditedTask(task) {
  if (typeof task !== "object" || task === null) return task
  const facade = Object.create(null)
  defineTaskMethod(facade, task, "getAllMetadata", () => ({}))
  defineTaskMethod(facade, task, "getMessages", () => [])
  defineTaskMethod(facade, task, "sendMessage", () => undefined)
  defineTaskMethod(facade, task, "setStepComplete", () => undefined)
  defineTaskMethod(facade, task, "startSubagent", async () => undefined)
  defineTaskMethod(facade, task, "toSerializable", () => ({}))
  return Object.freeze(facade)
}

function defineTaskMethod(facade, task, name, fallback) {
  const method = findDataFunction(task, name)
  Object.defineProperty(facade, name, {
    configurable: false,
    enumerable: true,
    value: method === undefined
      ? fallback
      : (...args) => Reflect.apply(method, task, args),
    writable: false
  })
}

function findDataFunction(task, name) {
  let current = task
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name)
    if (descriptor !== undefined) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new TypeError(`Legacy Bob task ${name} must be a data function when present.`)
      }
      return descriptor.value
    }
    current = Object.getPrototypeOf(current)
  }
  return undefined
}
