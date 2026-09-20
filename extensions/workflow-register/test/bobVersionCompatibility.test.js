const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  BOB_2_0_1_PROFILE_DIGEST,
  bindBobCapabilities,
  probeBobTaskCapabilities
} = require("../out/core/contractV2/bobProfile.js")

function bindingInput(extensionVersion) {
  return {
    extensionId: "IBM.bob-code",
    extensionVersion,
    expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST,
    liveExport: { registerSource() { throw new Error("Binding must not register a source.") } }
  }
}

const taskMethods = ["getAllMetadata", "getMessages", "sendMessage", "setStepComplete", "startSubagent"]
const taskCapabilities = taskMethods.map((name) => `task.${name}`)
function task() {
  return Object.fromEntries(taskMethods.map((name) => [name, () => { throw new Error("Probes must not call task methods.") }]))
}

test("binding accepts canonical stable Bob 2.x and retains the actual version", () => {
  for (const version of ["2.0.0", "2.0.1", "2.1.0", "2.99.123", "2.1.0+build.42"]) {
    const bound = bindBobCapabilities(bindingInput(version))
    assert.equal(bound.extensionVersion, version)
    assert.equal(bound.profile, "bob/2.0.1")
    assert.equal(bound.profileDigest, BOB_2_0_1_PROFILE_DIGEST)
    assert.deepEqual(bound.taskCapabilities, taskCapabilities)
    assert.deepEqual(bound.requiredCapabilities, ["source.deactivate", "source.log", "source.registerWorkflow", ...taskCapabilities])
  }
})

test("binding rejects other majors, prereleases and noncanonical versions", () => {
  for (const version of ["1.99.0", "3.0.0", "3.0.0-beta.1", "2.1.0-beta.1", "2.1.0-rc.1+build", "2", "2.1", "2.x.y", "02.1.0", "2.01.0", "2.1.00", "v2.1.0", "=2.1.0", " 2.1.0", "2.1.0 ", "2.1.0\n", "", undefined, null, 2, {}]) {
    assert.throws(() => bindBobCapabilities(bindingInput(version)), /Bob.*version/i, String(version))
  }
})

test("standard task probe accepts Bob's five-method workflow wrapper", () => {
  const result = probeBobTaskCapabilities({ expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST, task: task() })
  assert.deepEqual(result.taskCapabilities, taskCapabilities)
  for (const name of taskMethods) {
    const incomplete = task()
    delete incomplete[name]
    assert.throws(() => probeBobTaskCapabilities({ expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST, task: incomplete }), new RegExp(name))
  }
})

test("an explicitly required toSerializable capability remains mandatory", () => {
  const input = { expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST, task: task(), requiredCapabilities: ["task.toSerializable"] }
  assert.throws(() => probeBobTaskCapabilities(input), /toSerializable/)
  input.task.toSerializable = () => ({})
  assert.deepEqual(probeBobTaskCapabilities(input).taskCapabilities, ["task.toSerializable"])
})

test("a five-method Bob task can be probed, snapshotted, saved and reopened without toSerializable", async (t) => {
  const fs = require("node:fs")
  const os = require("node:os")
  const path = require("node:path")
  const { createBobTaskSnapshotProvider, FileTaskSnapshotStore } = require("../out/core/taskSnapshots.js")
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob21-snapshot-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const value = task()
  value.getMessages = () => [{ role: "assistant", content: "Bob 2.1 result" }]
  value.getAllMetadata = () => ({ revision: "42" })
  probeBobTaskCapabilities({ expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST, task: value })
  const exported = await createBobTaskSnapshotProvider(value).exportTask({
    reason: "step-start", workflow: { id: "workflow-register.sample" },
    run: { runId: "run-1", status: "running", currentStep: "analyze" }
  })
  assert.equal(exported.taskExport, undefined)
  const store = new FileTaskSnapshotStore({ workspaceRoot, includeMessages: true })
  await store.saveSnapshot(exported)
  const reopened = await store.loadLatest("run-1")
  assert.equal(reopened.lastAssistantText, "Bob 2.1 result")
  assert.deepEqual(reopened.taskMetadata, { revision: "42" })
  assert.deepEqual(reopened.messages, value.getMessages())
})
