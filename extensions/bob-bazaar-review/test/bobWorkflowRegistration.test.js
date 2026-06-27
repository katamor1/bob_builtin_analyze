const assert = require("node:assert/strict")
const test = require("node:test")

const {
  BAZAAR_WORKFLOW_ID,
  createBazaarWorkflowRegistrar,
  registerBazaarWorkflowWithBob
} = require("../out/bobWorkflowRegistration")

test("registers Bazaar workflow through the source registerWorkflow method", async () => {
  const calls = []
  let registeredWorkflow
  const api = {
    registerSource(id, name) {
      calls.push(["registerSource", id, name])
      return {
        registerWorkflow(workflow) {
          registeredWorkflow = workflow
          calls.push(["registerWorkflow", workflow.getId()])
          return true
        },
        log(message) {
          calls.push(["log", message])
        }
      }
    }
  }
  const context = {
    executeCommand: async (...args) => calls.push(["executeCommand", ...args])
  }

  const result = await registerBazaarWorkflowWithBob(api, context)

  assert.equal(result.ok, true)
  assert.equal(result.workflowId, BAZAAR_WORKFLOW_ID)
  assert.deepEqual(calls.slice(0, 2), [
    ["registerSource", "bob-bazaar-review", "Bob Bazaar Review"],
    ["registerWorkflow", BAZAAR_WORKFLOW_ID]
  ])
  assert.ok(registeredWorkflow)
  assert.equal(registeredWorkflow.getId(), BAZAAR_WORKFLOW_ID)
  assert.equal(registeredWorkflow.getLabel(), "Bazaar Project Rule Review")
  assert.equal(registeredWorkflow.getMenuLabel(), "Bazaar Project Rule Review")
  assert.match(registeredWorkflow.getDescription(), /Bazaar revision or range/)
  assert.equal(await registeredWorkflow.isEnabled({ workspace: process.cwd() }), true)
  assert.deepEqual(registeredWorkflow.getApprovalConfig(), {
    allowed_permissions: ["read", "mcp", "skill"],
    autoApprovalEnabled: true
  })

  const steps = registeredWorkflow.getSteps()
  assert.equal(steps.length, 1)
  assert.equal(steps[0].id, "openBazaarReviewGui")
  assert.equal(steps[0].title, "Open Bazaar Review GUI")

  const taskCalls = []
  const task = {
    sendMessage: async (...args) => taskCalls.push(["sendMessage", ...args]),
    setStepComplete: () => taskCalls.push(["setStepComplete"])
  }
  const stepResult = await steps[0].execution(task)

  assert.equal(stepResult, true)
  assert.deepEqual(calls.at(-1), ["executeCommand", "bobBazaar.openReviewGui"])
  assert.equal(taskCalls.at(-1)[0], "setStepComplete")
})

test("does not register duplicate Bob source or workflow when called repeatedly", async () => {
  const calls = []
  const api = {
    registerSource(id, name) {
      calls.push(["registerSource", id, name])
      return {
        registerWorkflow(workflow) {
          calls.push(["registerWorkflow", workflow.getId()])
          return true
        }
      }
    }
  }
  const context = {
    executeCommand: async (...args) => calls.push(["executeCommand", ...args])
  }
  const registrar = createBazaarWorkflowRegistrar()

  const first = await registrar.register(api, context)
  const second = await registrar.register(api, context)

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(calls.filter((call) => call[0] === "registerSource").length, 1)
  assert.equal(calls.filter((call) => call[0] === "registerWorkflow").length, 1)
  assert.ok(second.attempts.some((attempt) => attempt.label === "workflow already registered" && attempt.ok))
})

test("can force workflow registration again after the first successful registration", async () => {
  const calls = []
  const api = {
    registerSource(id, name) {
      calls.push(["registerSource", id, name])
      return {
        registerWorkflow(workflow) {
          calls.push(["registerWorkflow", workflow.getId()])
          return true
        }
      }
    }
  }
  const context = {
    executeCommand: async (...args) => calls.push(["executeCommand", ...args])
  }
  const registrar = createBazaarWorkflowRegistrar()

  await registrar.register(api, context)
  const forced = await registrar.register(api, context, { force: true })

  assert.equal(forced.ok, true)
  assert.equal(calls.filter((call) => call[0] === "registerSource").length, 2)
  assert.equal(calls.filter((call) => call[0] === "registerWorkflow").length, 2)
  assert.ok(forced.attempts.some((attempt) => attempt.label === "forced workflow reconciliation" && attempt.ok))
})
