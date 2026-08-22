const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  generationInput,
  subject
} = require("./workflowContractV2LockTestSupport")

const EMPTY_BOB = {
  profile: "bob/2.0.1",
  requiredCapabilities: [],
  taskCapabilities: []
}

function inputFor(files) {
  return generationInput({ files, providers: [], bob: EMPTY_BOB })
}

function core(overrides = {}) {
  return {
    "workflow.yaml": Buffer.from("x"),
    "workflow.lock.json": Buffer.from("{}"),
    ...overrides
  }
}

test("lock generation accepts exact per-file byte maxima", () => {
  const lockModule = subject()
  const files = core({
    "workflow.yaml": Buffer.alloc(1_048_576, 0x77),
    "workflow.lock.json": Buffer.alloc(1_048_576, 0x7b),
    "prompts/max.md": Buffer.alloc(4_194_304, 0x70),
    "schemas/max.json": Buffer.alloc(4_194_304, 0x73)
  })
  const lock = lockModule.generateWorkflowPackageLock(inputFor(files))

  assert.equal(lock.workflow.bytes, 1_048_576)
  assert.equal(lock.prompts[0].bytes, 4_194_304)
  assert.equal(lock.schemas[0].bytes, 4_194_304)
})

test("lock generation rejects each per-file maximum plus one", () => {
  const lockModule = subject()
  for (const [path, bytes] of [
    ["workflow.yaml", 1_048_577],
    ["workflow.lock.json", 1_048_577],
    ["prompts/max.md", 4_194_305],
    ["schemas/max.json", 4_194_305]
  ]) {
    assert.throws(
      () => lockModule.generateWorkflowPackageLock(inputFor(core({ [path]: Buffer.alloc(bytes, 0x61) }))),
      /raw evidence|inconsistent|length|limit/i
    )
  }
})

test("lock generation accepts exactly 33,554,432 total bytes and rejects one more", () => {
  const lockModule = subject()
  const files = core()
  for (let index = 0; index < 7; index += 1) {
    files[`prompts/max-${index}.md`] = Buffer.alloc(4_194_304, 0x61 + index)
  }
  files["prompts/remainder.md"] = Buffer.alloc(4_194_301, 0x7a)
  const lock = lockModule.generateWorkflowPackageLock(inputFor(files))
  assert.equal(lock.prompts.length, 8)

  const over = { ...files, "prompts/remainder.md": Buffer.alloc(4_194_302, 0x7a) }
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(inputFor(over)),
    /raw evidence|inconsistent|total|limit/i
  )
})

test("lock generation accepts 512 files and rejects 513 before entry cloning", () => {
  const lockModule = subject()
  const files = core()
  for (let index = 0; index < 510; index += 1) {
    files[`prompts/p-${String(index).padStart(3, "0")}.md`] = Buffer.from("x")
  }
  const lock = lockModule.generateWorkflowPackageLock(inputFor(files))
  assert.equal(lock.prompts.length, 510)

  files["prompts/p-510.md"] = Buffer.from("x")
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(inputFor(files)),
    /length|limit|512/i
  )
})
