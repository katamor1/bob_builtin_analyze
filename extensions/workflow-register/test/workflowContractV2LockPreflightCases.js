const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  generationInput,
  subject
} = require("./workflowContractV2LockTestSupport")

function hostileOverLimitArray(length) {
  let getterCalls = 0
  const values = []
  values.length = length
  Object.defineProperty(values, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1
      throw new Error("must not inspect an entry before the length boundary")
    }
  })
  return { values, getterCalls: () => getterCalls }
}

test("provider capability limits precede deep entry cloning", () => {
  const lockModule = subject()
  const hostile = hostileOverLimitArray(129)
  const input = generationInput()
  input.providers[0].requiredCapabilities = hostile.values

  assert.throws(
    () => lockModule.generateWorkflowPackageLock(input),
    /length|limit|128/i
  )
  assert.equal(hostile.getterCalls(), 0)
})

test("Bob capability limits precede deep entry cloning", () => {
  const lockModule = subject()
  const required = hostileOverLimitArray(10)
  const requiredInput = generationInput()
  requiredInput.bob.requiredCapabilities = required.values
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(requiredInput),
    /length|limit|9/i
  )
  assert.equal(required.getterCalls(), 0)

  const tasks = hostileOverLimitArray(7)
  const taskInput = generationInput()
  taskInput.bob.taskCapabilities = tasks.values
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(taskInput),
    /length|limit|6/i
  )
  assert.equal(tasks.getterCalls(), 0)
})
