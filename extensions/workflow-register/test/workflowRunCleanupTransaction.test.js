const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { createPhysicalPathMatcher } = require("./helpers/physicalPathMatcher")

const matchesPhysicalPath = createPhysicalPathMatcher(fs)

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

test("cleanup transaction rejects a non-empty candidate-only destructive request", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const run = await createRun(runsRoot, "candidate-only")
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [{ runId: "candidate-only", revision: run.revision }],
    transactionId: "tx-candidate-only"
  }), /verified expected cleanup plan is required/i)

  assert.equal((await fs.stat(run.directory)).isDirectory(), true)
})

test("cleanup transaction quarantines every candidate before deleting the transaction directory", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "run-a")
  const b = await createRun(runsRoot, "run-b")
  const plan = await cleanupPlan(root)
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  const result = await applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId: "tx-success"
  })

  assert.deepEqual(result.removedRunIds, ["run-a", "run-b"])
  await assert.rejects(fs.stat(a.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(b.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(result.quarantinePath), { code: "ENOENT" })
})

test("cleanup transaction performs one workspace inventory and bounded candidate-only rescans", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const runIds = ["scan-a", "scan-b", "scan-c"]
  for (const runId of runIds) await createRun(runsRoot, runId)
  const plan = await cleanupPlan(root)
  const originalOpendir = fs.opendir
  const scanCounts = new Map()
  const scanPaths = [runsRoot, ...runIds.map((runId) => path.join(runsRoot, runId))]
  let applying
  try {
    fs.opendir = async (directory, ...args) => {
      let logicalPath = String(directory)
      for (const scanPath of scanPaths) {
        if (await matchesPhysicalPath(directory, scanPath)) {
          logicalPath = scanPath
          break
        }
      }
      scanCounts.set(logicalPath, (scanCounts.get(logicalPath) ?? 0) + 1)
      return originalOpendir(directory, ...args)
    }
    const { applyWorkflowRunCleanupTransaction } = transactionModules()
    applying = applyWorkflowRunCleanupTransaction({
      workspaceRoot: root,
      expectedPlan: plan,
      transactionId: "tx-bounded-scans"
    })
    await applying
  } finally {
    await applying?.catch(() => undefined)
    fs.opendir = originalOpendir
  }

  assert.equal(scanCounts.get(runsRoot), 1)
  for (const runId of runIds) {
    assert.equal(scanCounts.get(path.join(runsRoot, runId)), 3)
  }
})

test("cleanup transaction rolls prior moves back when a later rename fails", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "run-a")
  const b = await createRun(runsRoot, "run-b")
  const plan = await cleanupPlan(root)
  let sourceMoveCount = 0
  const fsOps = {
    mkdir: fs.mkdir,
    lstat: fs.lstat,
    realpath: fs.realpath,
    rm: fs.rm,
    readdir: fs.readdir,
    rename: async (source, target) => {
      const sourceMove = await matchesPhysicalPath(path.dirname(source), runsRoot)
        && /^run-/.test(path.basename(source))
      if (sourceMove && ++sourceMoveCount === 2) throw new Error("injected second rename failure")
      return fs.rename(source, target)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId: "tx-rollback",
    fsOps
  }), /injected second rename failure/)

  assert.equal((await fs.stat(a.directory)).isDirectory(), true)
  assert.equal((await fs.stat(b.directory)).isDirectory(), true)
})

test("cleanup transaction refuses a stale run revision from a verified plan", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const changed = await createRun(runsRoot, "changed")
  const plan = await cleanupPlan(root)
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await fs.appendFile(path.join(changed.directory, "run.json"), " ")
  await assert.rejects(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId: "tx-revision"
  }), /inventory changed after preview|cleanup plan changed/i)
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
      if (!rootResolved && await matchesPhysicalPath(target, root)) {
        rootResolved = true
        enteredLockedOperation.resolve()
        await releaseLockedOperation.promise
      }
      return resolved
    },
    rename: async (source, target) => {
      if (await matchesPhysicalPath(path.dirname(source), runsRoot)) sourceRenames += 1
      return fs.rename(source, target)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()
  const applying = applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
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
        if (!rootResolved && await matchesPhysicalPath(target, root)) {
          rootResolved = true
          enteredLockedOperation.resolve()
          await releaseLockedOperation.promise
        }
        return resolved
      },
      rename: async (source, target) => {
        if (await matchesPhysicalPath(path.dirname(source), runsRoot)) sourceRenames += 1
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
  const plan = await cleanupPlan(root)
  const quarantineBase = path.join(root, ".bob", "workflows", "run-cleanup-quarantine")
  const sibling = path.join(quarantineBase, "concurrent-sibling")
  let baseRmdirCalls = 0
  let baseReaddirCalls = 0
  const fsOps = {
    readdir: async (directory, ...args) => {
      if (await matchesPhysicalPath(directory, quarantineBase)) baseReaddirCalls += 1
      return fs.readdir(directory, ...args)
    },
    rmdir: async (directory, ...args) => {
      if (await matchesPhysicalPath(directory, quarantineBase)) {
        baseRmdirCalls += 1
        await fs.mkdir(sibling)
      }
      return fs.rmdir(directory, ...args)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  const result = await applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
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
      if (!swapped && await matchesPhysicalPath(target, run.directory)) {
        swapped = true
        await fs.rename(run.directory, parkedOriginal)
        await fs.mkdir(run.directory)
        await fs.writeFile(path.join(run.directory, "run.json"), runBytes)
      }
      return fs.lstat(target, ...args)
    },
    rename: async (source, target) => {
      if (await matchesPhysicalPath(source, run.directory)) cleanupRenames += 1
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

test("cleanup transaction does not commit or purge a replacement moved by a rename-time source swap", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const run = await createRun(runsRoot, "rename-time-swap")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-rename-time-swap"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const quarantined = path.join(quarantinePath, "rename-time-swap")
  const parkedOriginal = path.join(root, "parked-rename-time-swap")
  let swapped = false
  const fsOps = {
    rename: async (source, target) => {
      if (!swapped && await matchesPhysicalPath(source, run.directory)) {
        swapped = true
        await fs.rename(source, parkedOriginal)
        await fs.mkdir(source)
        await fs.writeFile(path.join(source, "replacement.txt"), "must remain quarantined")
      }
      return fs.rename(source, target)
    }
  }
  const transaction = transactionModules()
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "rollback")
    assert.deepEqual(error.committedRunIds, [])
    assert.deepEqual(error.residualRunIds, ["rename-time-swap"])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /directory identity|changed before quarantine/i)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantinePath), true)

  assert.equal(swapped, true)
  assert.equal((await fs.stat(parkedOriginal)).isDirectory(), true)
  assert.equal(await fs.readFile(path.join(quarantined, "replacement.txt"), "utf8"), "must remain quarantined")
  await assert.rejects(fs.stat(run.directory), { code: "ENOENT" })
})

test("cleanup transaction preserves every target when an earlier quarantine tree changes while a later candidate moves", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "purge-race-a")
  const b = await createRun(runsRoot, "purge-race-b")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-purge-race"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const quarantinedA = path.join(quarantinePath, "purge-race-a")
  const quarantinedB = path.join(quarantinePath, "purge-race-b")
  const unverifiedFile = path.join(quarantinedA, "unverified-replacement.txt")
  let changedAfterFirstVerification = false
  const fsOps = {
    rename: async (source, target) => {
      const result = await fs.rename(source, target)
      if (await matchesPhysicalPath(source, b.directory)) {
        await fs.writeFile(unverifiedFile, "must not be purged")
        changedAfterFirstVerification = true
      }
      return result
    }
  }
  const transaction = transactionModules()
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "purge")
    assert.deepEqual(error.committedRunIds, ["purge-race-a", "purge-race-b"])
    assert.deepEqual(error.residualRunIds, ["purge-race-a", "purge-race-b"])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /physical tree|evidence changed/i)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantinePath), true)

  assert.equal(changedAfterFirstVerification, true)
  assert.equal(await fs.readFile(unverifiedFile, "utf8"), "must not be purged")
  assert.equal((await fs.stat(quarantinedB)).isDirectory(), true)
  await assert.rejects(fs.stat(a.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(b.directory), { code: "ENOENT" })
})

test("cleanup transaction reports exact residual targets when a later candidate purge fails", async (t) => {
  const { root, runsRoot } = await workspace(t)
  await createRun(runsRoot, "purge-a")
  await createRun(runsRoot, "purge-b")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-purge-failure"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const quarantinedA = path.join(quarantinePath, "purge-a")
  const quarantinedB = path.join(quarantinePath, "purge-b")
  const fsOps = {
    rm: async (target, options) => {
      if (await matchesPhysicalPath(target, quarantinedB) && options?.recursive && options.force === false) {
        const error = new Error("injected quarantine purge failure")
        error.code = "EIO"
        throw error
      }
      return fs.rm(target, options)
    }
  }
  const transaction = transactionModules()
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.equal(typeof transaction.WorkflowRunCleanupIncompleteError, "function")
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "purge")
    assert.deepEqual(error.committedRunIds, ["purge-a", "purge-b"])
    assert.deepEqual(error.residualRunIds, ["purge-b"])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /injected quarantine purge failure/)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantinePath), true)

  await assert.rejects(fs.stat(path.join(runsRoot, "purge-a")), { code: "ENOENT" })
  await assert.rejects(fs.stat(path.join(runsRoot, "purge-b")), { code: "ENOENT" })
  await assert.rejects(fs.stat(quarantinedA), { code: "ENOENT" })
  assert.equal((await fs.stat(quarantinedB)).isDirectory(), true)
})

test("cleanup transaction preserves an unexpected quarantine sibling and reports an incomplete purge", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const run = await createRun(runsRoot, "unexpected-sibling")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-unexpected-sibling"
  const quarantinePath = path.join(root, ".bob", "workflows", "run-cleanup-quarantine", transactionId)
  const sibling = path.join(quarantinePath, "unverified-sibling.txt")
  const fsOps = {
    rename: async (source, target) => {
      const result = await fs.rename(source, target)
      if (await matchesPhysicalPath(source, run.directory)) {
        await fs.writeFile(sibling, "must not be recursively purged")
      }
      return result
    }
  }
  const transaction = transactionModules()
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "purge")
    assert.deepEqual(error.committedRunIds, ["unexpected-sibling"])
    assert.deepEqual(error.residualRunIds, [])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /directory|not empty|ENOTEMPTY/i)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantinePath), true)

  assert.equal(await fs.readFile(sibling, "utf8"), "must not be recursively purged")
  await assert.rejects(fs.stat(run.directory), { code: "ENOENT" })
})

test("cleanup transaction reports the retained quarantine parent when parent cleanup fails after purge", async (t) => {
  const { root, runsRoot } = await workspace(t)
  await createRun(runsRoot, "parent-cleanup")
  const plan = await cleanupPlan(root)
  const transactionId = "tx-parent-cleanup-failure"
  const quarantineBase = path.join(root, ".bob", "workflows", "run-cleanup-quarantine")
  const quarantinePath = path.join(quarantineBase, transactionId)
  const fsOps = {
    rmdir: async (directory, ...args) => {
      if (await matchesPhysicalPath(directory, quarantineBase)) {
        const error = new Error("injected quarantine parent cleanup failure")
        error.code = "EACCES"
        throw error
      }
      return fs.rmdir(directory, ...args)
    }
  }
  const transaction = transactionModules()
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "parent-cleanup")
    assert.deepEqual(error.committedRunIds, ["parent-cleanup"])
    assert.deepEqual(error.residualRunIds, [])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /injected quarantine parent cleanup failure/)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantineBase), true)

  await assert.rejects(fs.stat(path.join(runsRoot, "parent-cleanup")), { code: "ENOENT" })
  await assert.rejects(fs.stat(quarantinePath), { code: "ENOENT" })
  assert.equal((await fs.stat(quarantineBase)).isDirectory(), true)
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
      if (await matchesPhysicalPath(source, sourceB)) throw new Error("injected second candidate failure")
      if (await matchesPhysicalPath(source, quarantinedA) && await matchesPhysicalPath(target, sourceA)) {
        throw new Error("injected rollback failure")
      }
      return fs.rename(source, target)
    }
  }
  const transaction = transactionModules()
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "rollback")
    assert.deepEqual(error.committedRunIds, ["rollback-a"])
    assert.deepEqual(error.residualRunIds, ["rollback-a"])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /injected second candidate failure/)
    assert.match(error.message, /injected rollback failure/)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantinePath), true)

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
      if (await matchesPhysicalPath(source, sourceB)) {
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
  let cleanupError

  await assert.rejects(transaction.applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    expectedPlan: plan,
    transactionId,
    fsOps
  }), (error) => {
    cleanupError = error
    assert.ok(error instanceof transaction.WorkflowRunCleanupIncompleteError)
    assert.equal(error.phase, "rollback")
    assert.deepEqual(error.committedRunIds, ["rollback-identity-a"])
    assert.deepEqual(error.residualRunIds, ["rollback-identity-a"])
    assert.equal(error.reclaimedBytes, 0)
    assert.match(error.message, /directory identity|changed before quarantine/i)
    return true
  })
  assert.equal(await matchesPhysicalPath(cleanupError.retainedQuarantinePath, quarantinePath), true)

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
      if (await matchesPhysicalPath(sourceParent, runsRoot)) renameOrder.push(`forward:${runId}`)
      if (await matchesPhysicalPath(sourceParent, quarantinePath)) renameOrder.push(`rollback:${runId}`)
      const result = await fs.rename(source, target)
      if (!mutated && await matchesPhysicalPath(source, path.join(runsRoot, "late-b"))) {
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
