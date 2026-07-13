const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function transactionModules() {
  return require("../out/core/runtime/runCleanupTransaction")
}

function eventModules() {
  return require("../out/core/runtime/runEventLog")
}

function inventoryModules() {
  return require("../out/core/runtime/runRetentionInventory")
}

function retentionModules() {
  return require("../out/core/retention/runRetention")
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function withTimeout(promise, label, timeoutMs = 10_000) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs)
    })
  ]).finally(() => clearTimeout(timer))
}

async function cleanupPlan(root, policy = { now: "2026-07-13T03:00:00.000Z", completedDays: 1 }) {
  const snapshot = await inventoryModules().inspectWorkflowRunRetentionInventory(root)
  return retentionModules().planWorkflowRunCleanup(snapshot.inventory, policy)
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-tx-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const runsRoot = path.join(root, ".bob", "workflows", "runs")
  await fs.mkdir(runsRoot, { recursive: true })
  return { root, runsRoot }
}

async function createRun(runsRoot, runId, extra = {}) {
  const directory = path.join(runsRoot, runId)
  await fs.mkdir(directory)
  const bytes = Buffer.from(JSON.stringify({
    schemaVersion: "workflow-register/run-state/v1",
    runId,
    workflowId: "cleanup.test",
    workflowName: "Cleanup Test",
    status: "completed",
    inputs: {},
    state: {},
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }, null, 2) + "\n")
  await fs.writeFile(path.join(directory, "run.json"), bytes)
  for (const [name, content] of Object.entries(extra)) await fs.writeFile(path.join(directory, name), content)
  return { directory, revision: eventModules().hashWorkflowRunBytes(bytes) }
}

test("cleanup transaction quarantines every candidate before deleting the transaction directory", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "run-a")
  const b = await createRun(runsRoot, "run-b")
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  const result = await applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [
      { runId: "run-b", revision: b.revision },
      { runId: "run-a", revision: a.revision }
    ],
    transactionId: "tx-success"
  })

  assert.deepEqual(result.removedRunIds, ["run-a", "run-b"])
  await assert.rejects(fs.stat(a.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(b.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(result.quarantinePath), { code: "ENOENT" })
})

test("cleanup transaction rolls prior moves back when a later rename fails", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "run-a")
  const b = await createRun(runsRoot, "run-b")
  let sourceMoveCount = 0
  const fsOps = {
    mkdir: fs.mkdir,
    lstat: fs.lstat,
    realpath: fs.realpath,
    rm: fs.rm,
    readdir: fs.readdir,
    rename: async (source, target) => {
      const sourceMove = path.dirname(source) === runsRoot && /^run-/.test(path.basename(source))
      if (sourceMove && ++sourceMoveCount === 2) throw new Error("injected second rename failure")
      return fs.rename(source, target)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [
      { runId: "run-a", revision: a.revision },
      { runId: "run-b", revision: b.revision }
    ],
    transactionId: "tx-rollback",
    fsOps
  }), /injected second rename failure/)

  assert.equal((await fs.stat(a.directory)).isDirectory(), true)
  assert.equal((await fs.stat(b.directory)).isDirectory(), true)
})

test("cleanup transaction refuses locks, journals, stale revisions, unsafe IDs and linked directories", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const locked = await createRun(runsRoot, "locked", { "run.lock.json": "{}" })
  const journaled = await createRun(runsRoot, "journaled", { "run-state.journal.json": "{}" })
  const changed = await createRun(runsRoot, "changed")
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "locked", revision: locked.revision }], transactionId: "tx-lock" }), /execution lock/i)
  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "journaled", revision: journaled.revision }], transactionId: "tx-journal" }), /pending journal/i)
  await fs.appendFile(path.join(changed.directory, "run.json"), " ")
  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "changed", revision: changed.revision }], transactionId: "tx-revision" }), /changed after cleanup preview/i)
  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "../escape", revision: "sha256:x" }], transactionId: "tx-unsafe" }), /unsupported|unsafe/i)

  if (process.platform !== "win32") {
    const external = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-external-"))
    t.after(() => fs.rm(external, { recursive: true, force: true }))
    await fs.symlink(external, path.join(runsRoot, "linked"), "dir")
    await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "linked", revision: "sha256:x" }], transactionId: "tx-linked" }), /direct directory|symlink|junction/i)
  }
})

test("cleanup transaction revalidates the complete physical tree after all leases and before any rename", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const run = await createRun(runsRoot, "late-linked")
  const plan = await cleanupPlan(root)
  assert.deepEqual(plan.candidateRunIds, ["late-linked"])
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-late-link-"))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  const enteredLockedOperation = deferred()
  const releaseLockedOperation = deferred()
  let rootResolved = false
  let sourceRenames = 0
  const fsOps = {
    realpath: async (target) => {
      const resolved = await fs.realpath(target)
      if (!rootResolved && path.resolve(target) === path.resolve(root)) {
        rootResolved = true
        enteredLockedOperation.resolve()
        await releaseLockedOperation.promise
      }
      return resolved
    },
    rename: async (source, target) => {
      if (path.dirname(source) === runsRoot) sourceRenames += 1
      return fs.rename(source, target)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()
  const applying = applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [{ runId: "late-linked", revision: run.revision }],
    expectedPlan: plan,
    transactionId: "tx-late-linked",
    fsOps
  })

  await withTimeout(enteredLockedOperation.promise, "cleanup locked operation")
  try {
    await fs.symlink(outside, path.join(run.directory, "late-alias"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    releaseLockedOperation.resolve()
    await applying.catch(() => undefined)
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`directory alias unavailable: ${error.code}`)
      return
    }
    throw error
  }
  releaseLockedOperation.resolve()

  await assert.rejects(applying, /physical tree|measurement|cleanup plan|changed after cleanup preview/i)
  assert.equal(sourceRenames, 0)
  assert.equal((await fs.stat(run.directory)).isDirectory(), true)
})

for (const scenario of [
  {
    name: "run revision",
    mutate: async ({ run }) => fs.appendFile(path.join(run.directory, "run.json"), " ")
  },
  {
    name: "retention revision",
    mutate: async ({ run }) => fs.writeFile(path.join(run.directory, "retention.json"), `${JSON.stringify({
      schemaVersion: "workflow-register/run-retention/v1",
      pinned: false,
      updatedAt: "2026-07-13T03:00:00.000Z"
    }, null, 2)}\n`)
  },
  {
    name: "reference graph",
    mutate: async ({ runsRoot }) => {
      const referrer = await createRun(runsRoot, "late-referrer")
      const referrerFile = path.join(referrer.directory, "run.json")
      const value = JSON.parse(await fs.readFile(referrerFile, "utf8"))
      value.state["workflow.artifactReuse"] = JSON.stringify({
        schemaVersion: "workflow-register/artifact-reuse/v1",
        sourceRunId: "late-evidence",
        sourceWorkflowId: "cleanup.test",
        startStepId: "collect",
        reusedStepIds: ["collect"],
        hydratedKeys: [],
        createdAt: "2026-07-13T03:00:00.000Z"
      })
      await fs.writeFile(referrerFile, `${JSON.stringify(value, null, 2)}\n`)
    }
  },
  {
    name: "execution lock",
    mutate: async ({ run }) => fs.writeFile(path.join(run.directory, "run.lock.json"), "{}\n")
  },
  {
    name: "pending journal",
    mutate: async ({ run }) => fs.writeFile(path.join(run.directory, "run-state.journal.json"), "{}\n")
  }
]) {
  test(`cleanup transaction rejects ${scenario.name} changes made after cleanup leases are held`, async (t) => {
    const { root, runsRoot } = await workspace(t)
    const run = await createRun(runsRoot, "late-evidence")
    const plan = await cleanupPlan(root)
    const enteredLockedOperation = deferred()
    const releaseLockedOperation = deferred()
    let rootResolved = false
    let sourceRenames = 0
    const fsOps = {
      realpath: async (target) => {
        const resolved = await fs.realpath(target)
        if (!rootResolved && path.resolve(target) === path.resolve(root)) {
          rootResolved = true
          enteredLockedOperation.resolve()
          await releaseLockedOperation.promise
        }
        return resolved
      },
      rename: async (source, target) => {
        if (path.dirname(source) === runsRoot) sourceRenames += 1
        return fs.rename(source, target)
      }
    }
    const transaction = transactionModules()
    const applying = transaction.applyWorkflowRunCleanupTransaction({
      workspaceRoot: root,
      expectedPlan: plan,
      transactionId: `tx-${scenario.name.replace(/ /g, "-")}`,
      fsOps
    })

    await withTimeout(enteredLockedOperation.promise, `${scenario.name} locked operation`)
    try {
      await scenario.mutate({ root, runsRoot, run })
    } finally {
      releaseLockedOperation.resolve()
    }

    await assert.rejects(applying, /inventory changed after preview|cleanup plan changed|changed after cleanup preview|physical tree|retention evidence|referenced by|execution lock|pending journal/i)
    assert.equal(sourceRenames, 0)
    assert.equal((await fs.stat(run.directory)).isDirectory(), true)
  })
}

test("cleanup transaction keeps a concurrently-created quarantine sibling without a pre-read", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const run = await createRun(runsRoot, "sibling-run")
  const quarantineBase = path.join(root, ".bob", "workflows", "run-cleanup-quarantine")
  const sibling = path.join(quarantineBase, "concurrent-sibling")
  let baseRmdirCalls = 0
  let baseReaddirCalls = 0
  const fsOps = {
    readdir: async (directory, ...args) => {
      if (path.resolve(directory) === path.resolve(quarantineBase)) baseReaddirCalls += 1
      return fs.readdir(directory, ...args)
    },
    rmdir: async (directory, ...args) => {
      if (path.resolve(directory) === path.resolve(quarantineBase)) {
        baseRmdirCalls += 1
        await fs.mkdir(sibling)
      }
      return fs.rmdir(directory, ...args)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  const result = await applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [{ runId: "sibling-run", revision: run.revision }],
    transactionId: "tx-concurrent-sibling",
    fsOps
  })

  assert.deepEqual(result.removedRunIds, ["sibling-run"])
  assert.equal(baseRmdirCalls, 1)
  assert.equal(baseReaddirCalls, 0)
  assert.equal((await fs.stat(sibling)).isDirectory(), true)
})

test("cleanup transaction rejects a run directory identity swap at the rename boundary", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const run = await createRun(runsRoot, "identity-swap")
  const runBytes = await fs.readFile(path.join(run.directory, "run.json"))
  const plan = await cleanupPlan(root)
  const parkedOriginal = path.join(root, "parked-identity-swap")
  let swapped = false
  let cleanupRenames = 0
  const fsOps = {
    lstat: async (target, ...args) => {
      if (!swapped && path.resolve(target) === path.resolve(run.directory)) {
        swapped = true
        await fs.rename(run.directory, parkedOriginal)
        await fs.mkdir(run.directory)
        await fs.writeFile(path.join(run.directory, "run.json"), runBytes)
      }
      return fs.lstat(target, ...args)
    },
    rename: async (source, target) => {
      if (path.resolve(source) === path.resolve(run.directory)) cleanupRenames += 1
      return fs.rename(source, target)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId: "tx-identity-swap",
    fsOps
  }), /directory identity|physical tree|evidence changed|changed before quarantine/i)

  assert.equal(swapped, true)
  assert.equal(cleanupRenames, 0)
  assert.equal((await fs.stat(parkedOriginal)).isDirectory(), true)
  assert.equal((await fs.stat(run.directory)).isDirectory(), true)
})

test("cleanup transaction exposes committed runs and retained quarantine when purge fails", async (t) => {
  const { root, runsRoot } = await workspace(t)
  await createRun(runsRoot, "purge-a")
  await createRun(runsRoot, "purge-b")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-purge-failure"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const fsOps = {
    rm: async (target, options) => {
      if (path.resolve(target) === path.resolve(quarantinePath) && options?.recursive && options.force === false) {
        const error = new Error("injected quarantine purge failure")
        error.code = "EIO"
        throw error
      }
      return fs.rm(target, options)
    }
  }
  const transaction = transactionModules()

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    assert.equal(typeof transaction.WorkflowRunCleanupIncompleteError, "function")
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "purge")
    assert.deepEqual(error.committedRunIds, ["purge-a", "purge-b"])
    assert.deepEqual(error.residualRunIds, ["purge-a", "purge-b"])
    assert.equal(error.retainedQuarantinePath, quarantinePath)
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /injected quarantine purge failure/)
    return true
  })

  await assert.rejects(fs.stat(path.join(runsRoot, "purge-a")), { code: "ENOENT" })
  await assert.rejects(fs.stat(path.join(runsRoot, "purge-b")), { code: "ENOENT" })
  assert.equal((await fs.stat(path.join(quarantinePath, "purge-a"))).isDirectory(), true)
  assert.equal((await fs.stat(path.join(quarantinePath, "purge-b"))).isDirectory(), true)
})

test("cleanup transaction exposes residual committed runs when rollback fails", async (t) => {
  const { root, runsRoot } = await workspace(t)
  await createRun(runsRoot, "rollback-a")
  await createRun(runsRoot, "rollback-b")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-rollback-failure"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const quarantinedA = path.join(quarantinePath, "rollback-a")
  const sourceA = path.join(runsRoot, "rollback-a")
  const sourceB = path.join(runsRoot, "rollback-b")
  const fsOps = {
    rename: async (source, target) => {
      if (path.resolve(source) === path.resolve(sourceB)) throw new Error("injected second candidate failure")
      if (path.resolve(source) === path.resolve(quarantinedA) && path.resolve(target) === path.resolve(sourceA)) {
        throw new Error("injected rollback failure")
      }
      return fs.rename(source, target)
    }
  }
  const transaction = transactionModules()

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "rollback")
    assert.deepEqual(error.committedRunIds, ["rollback-a"])
    assert.deepEqual(error.residualRunIds, ["rollback-a"])
    assert.equal(error.retainedQuarantinePath, quarantinePath)
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /injected second candidate failure/)
    assert.match(error.message, /injected rollback failure/)
    return true
  })

  await assert.rejects(fs.stat(sourceA), { code: "ENOENT" })
  assert.equal((await fs.stat(sourceB)).isDirectory(), true)
  assert.equal((await fs.stat(quarantinedA)).isDirectory(), true)
})

test("cleanup transaction validates quarantined identity before a rollback rename", async (t) => {
  const { root, runsRoot } = await workspace(t)
  await createRun(runsRoot, "rollback-identity-a")
  await createRun(runsRoot, "rollback-identity-b")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-rollback-identity"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const quarantinedA = path.join(quarantinePath, "rollback-identity-a")
  const parkedA = path.join(quarantinePath, "rollback-identity-a.parked")
  const sourceA = path.join(runsRoot, "rollback-identity-a")
  const sourceB = path.join(runsRoot, "rollback-identity-b")
  let replaced = false
  const fsOps = {
    rename: async (source, target) => {
      if (path.resolve(source) === path.resolve(sourceB)) {
        replaced = true
        await fs.rename(quarantinedA, parkedA)
        await fs.mkdir(quarantinedA)
        await fs.writeFile(path.join(quarantinedA, "replacement.txt"), "must not be restored")
        throw new Error("injected failure after quarantine replacement")
      }
      return fs.rename(source, target)
    }
  }
  const transaction = transactionModules()

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "rollback")
    assert.deepEqual(error.committedRunIds, ["rollback-identity-a"])
    assert.deepEqual(error.residualRunIds, ["rollback-identity-a"])
    assert.equal(error.retainedQuarantinePath, quarantinePath)
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /directory identity|changed before quarantine/i)
    return true
  })

  assert.equal(replaced, true)
  await assert.rejects(fs.stat(sourceA), { code: "ENOENT" })
  assert.equal((await fs.stat(sourceB)).isDirectory(), true)
  assert.equal((await fs.stat(quarantinedA)).isDirectory(), true)
  assert.equal((await fs.stat(parkedA)).isDirectory(), true)
})

test("cleanup transaction rolls earlier moves back in reverse when a later candidate tree changes", async (t) => {
  const { root, runsRoot } = await workspace(t)
  await createRun(runsRoot, "late-a")
  await createRun(runsRoot, "late-b")
  await createRun(runsRoot, "late-c")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-late-candidate-change"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const renameOrder = []
  let mutated = false
  const fsOps = {
    rename: async (source, target) => {
      const sourceParent = path.dirname(source)
      const runId = path.basename(source)
      if (path.resolve(sourceParent) === path.resolve(runsRoot)) renameOrder.push(`forward:${runId}`)
      if (path.resolve(sourceParent) === path.resolve(quarantinePath)) renameOrder.push(`rollback:${runId}`)
      const result = await fs.rename(source, target)
      if (!mutated && path.resolve(source) === path.resolve(path.join(runsRoot, "late-b"))) {
        mutated = true
        await fs.writeFile(path.join(runsRoot, "late-c", "late.bin"), "changed after earlier moves")
      }
      return result
    }
  }
  const transaction = transactionModules()

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), /physical tree|evidence changed|changed before quarantine/i)

  assert.equal(mutated, true)
  assert.deepEqual(renameOrder, ["forward:late-a", "forward:late-b", "rollback:late-b", "rollback:late-a"])
  assert.equal((await fs.stat(path.join(runsRoot, "late-a"))).isDirectory(), true)
  assert.equal((await fs.stat(path.join(runsRoot, "late-b"))).isDirectory(), true)
  assert.equal((await fs.stat(path.join(runsRoot, "late-c"))).isDirectory(), true)
  await assert.rejects(fs.stat(quarantinePath), { code: "ENOENT" })
})
