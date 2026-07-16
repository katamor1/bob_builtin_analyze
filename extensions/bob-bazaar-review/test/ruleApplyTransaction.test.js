const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  RULE_APPLY_PLAN_SCHEMA_VERSION
} = require("../out/ruleAuthoring/ruleApplyPlan")
const {
  executeRuleApplyTransaction,
  recoverRuleApplyTransaction,
  validateRuleApplyMetadata,
  withRuleApplyWorkspaceLock
} = require("../out/ruleAuthoring/ruleApplyTransaction")

const TARGETS = Object.freeze([
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
])
const NOW = "2026-07-15T02:03:04.000Z"

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-apply-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

async function createPlan(root, options = {}) {
  const missing = new Set(options.missing ?? [])
  await fs.mkdir(path.join(root, ".bob", "review"), { recursive: true })
  const targets = []
  const originals = new Map()
  const replacements = new Map()
  for (const [index, [asset, relativePath]] of TARGETS.entries()) {
    const before = Buffer.from(`before:${asset}\n`, "utf8")
    const after = Buffer.from(`after:${asset}\n`, "utf8")
    originals.set(asset, before)
    replacements.set(asset, after)
    if (!missing.has(asset)) {
      await fs.writeFile(path.join(root, ...relativePath.split("/")), before)
    }
    targets.push({
      asset,
      path: relativePath,
      expected_pre_image: missing.has(asset)
        ? { state: "missing" }
        : { state: "present", sha256: sha256(before) },
      post_image_sha256: sha256(after),
      bytes: after,
      ordinal: index
    })
  }
  return {
    plan: {
      schema_version: RULE_APPLY_PLAN_SCHEMA_VERSION,
      run_id: "run-transaction-tests",
      targets: targets.map(({ ordinal: _ordinal, ...target }) => target),
      decisions: [],
      retirements: []
    },
    originals,
    replacements
  }
}

function transactionDirectory(root, transactionId) {
  return path.join(root, ".bob", "review", "rule-authoring", "transactions", transactionId)
}

function backupDirectory(root, transactionId) {
  return path.join(root, ".bob", "review", "rule-authoring", "backups", transactionId)
}

async function readJournal(root, transactionId) {
  return JSON.parse(await fs.readFile(
    path.join(transactionDirectory(root, transactionId), "transaction-journal.json"),
    "utf8"
  ))
}

async function assertTargetBytes(root, expectedByAsset) {
  for (const [asset, relativePath] of TARGETS) {
    const expected = expectedByAsset.get(asset)
    const targetPath = path.join(root, ...relativePath.split("/"))
    if (expected === undefined) {
      await assert.rejects(fs.lstat(targetPath), { code: "ENOENT" })
    } else {
      assert.deepEqual(await fs.readFile(targetPath), expected, asset)
    }
  }
}

function options(root, transactionId, faultInjector) {
  return {
    workspaceRoot: root,
    transactionId,
    now: NOW,
    faultInjector
  }
}

test("journals, backs up, atomically replaces, verifies, and commits all five targets", async (t) => {
  const root = await workspace(t)
  const { plan, replacements } = await createPlan(root)
  const observed = []
  const transactionId = "txn-success"

  const manifest = await executeRuleApplyTransaction(plan, options(
    root,
    transactionId,
    (event) => observed.push({ ...event })
  ))

  await assertTargetBytes(root, replacements)
  assert.equal(manifest.schema_version, "bob-bazaar-review/apply-manifest/v1")
  assert.equal(manifest.transaction_id, transactionId)
  assert.equal(manifest.status, "committed")
  assert.equal(manifest.committed_at, NOW)
  assert.equal(manifest.backup_directory, `.bob/review/rule-authoring/backups/${transactionId}`)
  assert.deepEqual(manifest.targets.map(({ asset, path, state }) => ({ asset, path, state })),
    TARGETS.map(([asset, targetPath]) => ({ asset, path: targetPath, state: "replaced" })))

  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "committed")
  assert.deepEqual(journal.targets.map(({ state }) => state), Array(5).fill("replaced"))
  assert.ok(observed.some(({ operation, status }) => operation === "journal_persisted" && status === "prepared"))
  assert.ok(observed.some(({ operation, status }) => operation === "journal_persisted" && status === "applying"))
  assert.ok(observed.some(({ operation, status }) => operation === "journal_persisted" && status === "committed"))

  const backupEntries = await fs.readdir(backupDirectory(root, transactionId))
  assert.equal(backupEntries.length, 5, "successful apply keeps every pre-image backup")
  const persistedManifest = await fs.readFile(
    path.join(transactionDirectory(root, transactionId), "apply-manifest.json"),
    "utf8"
  )
  assert.deepEqual(JSON.parse(persistedManifest), manifest)
  for (const shareable of [JSON.stringify(manifest), persistedManifest]) {
    assert.doesNotMatch(shareable, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    assert.doesNotMatch(shareable, /before:|after:/)
  }
})

test("fsyncs each newly created transaction-directory entry before creating the next", async (t) => {
  const root = await workspace(t)
  const { plan } = await createPlan(root)
  const originalMkdir = fs.mkdir
  const originalOpen = fs.open
  const events = []
  fs.mkdir = async (directory, ...args) => {
    const result = await originalMkdir(directory, ...args)
    if (path.resolve(String(directory)).startsWith(`${root}${path.sep}`)) {
      events.push({ operation: "mkdir", path: path.resolve(String(directory)) })
    }
    return result
  }
  fs.open = async (target, ...args) => {
    const handle = await originalOpen(target, ...args)
    if ((await handle.stat()).isDirectory()) {
      const originalSync = handle.sync.bind(handle)
      handle.sync = async () => {
        events.push({ operation: "sync", path: path.resolve(String(target)) })
        return originalSync()
      }
    }
    return handle
  }
  t.after(() => {
    fs.mkdir = originalMkdir
    fs.open = originalOpen
  })

  await executeRuleApplyTransaction(plan, options(root, "txn-directory-fsync"))

  const creations = events.filter(({ operation }) => operation === "mkdir")
  assert.ok(creations.length >= 5)
  for (const creation of creations) {
    const index = events.indexOf(creation)
    assert.deepEqual(events[index + 1], {
      operation: "sync",
      path: path.dirname(creation.path)
    }, creation.path)
  }
})

test("a failure before the first replace rolls back without changing any target", async (t) => {
  const root = await workspace(t)
  const { plan, originals } = await createPlan(root)
  const transactionId = "txn-before-first"

  await assert.rejects(
    executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
      if (event.operation === "replace_target") {
        throw new Error(`raw source and absolute path must not leak: ${root}/secret.docx`)
      }
    })),
    (error) => {
      assert.equal(error.code, "filesystem_failure")
      assert.doesNotMatch(error.message, /secret\.docx|raw source/)
      assert.doesNotMatch(error.message, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      return true
    }
  )

  await assertTargetBytes(root, originals)
  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rolled_back")
  assert.deepEqual(journal.targets.map(({ state }) => state), Array(5).fill("prepared"))
  assert.equal(journal.error_code, "filesystem_failure")
  assert.doesNotMatch(JSON.stringify(journal), /secret\.docx|raw source/)
  assert.equal((await fs.readdir(backupDirectory(root, transactionId))).length, 5)
})

test("a failure after the first durable journal is sanitized and recoverable", async (t) => {
  const root = await workspace(t)
  const { plan, originals } = await createPlan(root)
  const transactionId = "txn-after-first-journal"
  let injected = false

  await assert.rejects(
    executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
      if (!injected && event.operation === "journal_persisted" && event.status === "prepared") {
        injected = true
        throw new Error(`raw private source at ${root}/secret.docx`)
      }
    })),
    (error) => {
      assert.equal(error.code, "filesystem_failure")
      assert.doesNotMatch(error.message, /secret\.docx|raw private source/)
      assert.doesNotMatch(error.message, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      return true
    }
  )

  await assertTargetBytes(root, originals)
  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rolled_back")
  assert.equal(journal.error_code, "filesystem_failure")
  assert.doesNotMatch(JSON.stringify(journal), /secret\.docx|raw private source/)
})

test("a mid-transaction failure restores replaced targets in reverse order", async (t) => {
  const root = await workspace(t)
  const { plan, originals } = await createPlan(root)
  const transactionId = "txn-midway"
  const restores = []

  await assert.rejects(executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
    if (event.operation === "replace_target" && event.index === 2) throw new Error("injected")
    if (event.operation === "restore_target") restores.push(event.asset)
  })))

  await assertTargetBytes(root, originals)
  assert.deepEqual(restores, ["project_context", "checklist"])
  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rolled_back")
  assert.deepEqual(journal.targets.map(({ state }) => state), [
    "restored",
    "restored",
    "prepared",
    "prepared",
    "prepared"
  ])
})

test("a rollback failure is retained in the journal while other targets continue restoring", async (t) => {
  const root = await workspace(t)
  const { plan, originals, replacements } = await createPlan(root)
  const transactionId = "txn-rollback-failed"

  await assert.rejects(executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
    if (event.operation === "replace_target" && event.index === 2) throw new Error("forward")
    if (event.operation === "restore_target" && event.asset === "project_context") {
      throw new Error(`backup bytes at ${root} must stay private`)
    }
  })), (error) => {
    assert.equal(error.status, "rollback_failed")
    assert.doesNotMatch(error.message, /backup bytes/)
    return true
  })

  const expected = new Map(originals)
  expected.set("project_context", replacements.get("project_context"))
  await assertTargetBytes(root, expected)
  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rollback_failed")
  assert.deepEqual(journal.targets.map(({ state }) => state), [
    "restored",
    "replaced",
    "prepared",
    "prepared",
    "prepared"
  ])
  assert.equal(journal.rollback_error_code, "filesystem_failure")
  assert.doesNotMatch(JSON.stringify(journal), /backup bytes/)
})

test("an incomplete rollback-failed transaction blocks every new transaction ID", async (t) => {
  const root = await workspace(t)
  const first = await createPlan(root)

  await assert.rejects(executeRuleApplyTransaction(first.plan, options(
    root,
    "txn-incomplete-seed",
    (event) => {
      if (event.operation === "replace_target" && event.index === 2) throw new Error("forward")
      if (event.operation === "restore_target" && event.asset === "project_context") {
        throw new Error("retain one replaced target")
      }
    }
  )), (error) => error.code === "rollback_failed")

  const second = await createPlan(root)
  await assert.rejects(
    executeRuleApplyTransaction(second.plan, options(root, "txn-must-not-start")),
    (error) => error.code === "recovery_incomplete"
  )
  await assertTargetBytes(root, second.originals)
  await assert.rejects(
    fs.access(transactionDirectory(root, "txn-must-not-start")),
    (error) => error.code === "ENOENT"
  )
})

test("terminal transaction journals do not block a later transaction ID", async (t) => {
  const root = await workspace(t)
  const first = await createPlan(root)
  await executeRuleApplyTransaction(first.plan, options(root, "txn-terminal-first"))

  const second = await createPlan(root)
  const manifest = await executeRuleApplyTransaction(second.plan, options(root, "txn-terminal-second"))
  assert.equal(manifest.status, "committed")
  await assertTargetBytes(root, second.replacements)
})

test("a failure after all replaces but before commit restores every target", async (t) => {
  const root = await workspace(t)
  const { plan, originals } = await createPlan(root)
  const transactionId = "txn-before-commit"
  const restores = []

  await assert.rejects(executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
    if (event.operation === "commit_manifest") throw new Error("injected")
    if (event.operation === "restore_target") restores.push(event.asset)
  })))

  await assertTargetBytes(root, originals)
  assert.deepEqual(restores, [...TARGETS].reverse().map(([asset]) => asset))
  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rolled_back")
  assert.deepEqual(journal.targets.map(({ state }) => state), Array(5).fill("restored"))
})

test("an error reported after the committed journal is durable never rolls back committed targets", async (t) => {
  const root = await workspace(t)
  const { plan, replacements } = await createPlan(root)
  const transactionId = "txn-durable-commit-error"

  const manifest = await executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
    if (event.operation === "journal_persisted" && event.status === "committed") {
      throw new Error("failure after durable commit")
    }
  }))

  assert.equal(manifest.status, "committed")
  await assertTargetBytes(root, replacements)
  assert.equal((await readJournal(root, transactionId)).status, "committed")
  assert.deepEqual(
    JSON.parse(await fs.readFile(
      path.join(transactionDirectory(root, transactionId), "apply-manifest.json"),
      "utf8"
    )),
    manifest
  )
})

test("a fault after the manifest is durable never rolls back and restart recovery heals the journal", async (t) => {
  const root = await workspace(t)
  const { plan, replacements } = await createPlan(root)
  const transactionId = "txn-durable-manifest-error"

  await assert.rejects(
    executeRuleApplyTransaction(plan, options(root, transactionId, (event) => {
      if (event.operation === "manifest_persisted") throw new Error("simulated process stop")
    })),
    (error) => error.code === "filesystem_failure" && error.status === "committed"
  )
  await assertTargetBytes(root, replacements)
  assert.equal((await readJournal(root, transactionId)).status, "applying")

  const recovered = await recoverRuleApplyTransaction(root, transactionId, {
    action: "rollback",
    now: "2026-07-15T02:03:05.000Z"
  })
  assert.equal(recovered.status, "committed")
  assert.equal((await readJournal(root, transactionId)).status, "committed")
  await assertTargetBytes(root, replacements)
})

test("metadata identifier and hash regexes never coerce numeric scalars", () => {
  const sourceRef = {
    source_id: `src-${"a".repeat(12)}`,
    chunk_id: `chunk-${"b".repeat(64)}`
  }
  const decision = {
    candidate_id: "7",
    target_asset: "rule",
    operation: "update",
    decision: "accept",
    target_id: "PRJ-0001",
    reviewed_at: NOW,
    source_refs: [sourceRef],
    conflict_resolutions: {}
  }
  assert.doesNotThrow(() => validateRuleApplyMetadata([decision], []))

  for (const mutate of [
    (value) => { value.candidate_id = 7 },
    (value) => { value.source_refs[0].source_id = Number(`1${"0".repeat(11)}`) },
    (value) => { value.source_refs[0].chunk_id = Number(`1${"0".repeat(63)}`) }
  ]) {
    const malformed = structuredClone(decision)
    mutate(malformed)
    assert.throws(
      () => validateRuleApplyMetadata([malformed], []),
      /metadata.*malformed/i
    )
  }
})

test("re-hashes each live pre-image immediately before replace and rejects stale bytes", async (t) => {
  const root = await workspace(t)
  const { plan, originals } = await createPlan(root)
  const transactionId = "txn-stale-preimage"
  const stalePath = path.join(root, ...TARGETS[2][1].split("/"))

  await assert.rejects(executeRuleApplyTransaction(plan, options(root, transactionId, async (event) => {
    if (event.operation === "replace_target" && event.index === 1) {
      await fs.writeFile(stalePath, "concurrent edit\n", "utf8")
    }
  })), (error) => {
    assert.equal(error.code, "stale_pre_image")
    return true
  })

  const expected = new Map(originals)
  expected.set("prompt_addendum", Buffer.from("concurrent edit\n", "utf8"))
  await assertTargetBytes(root, expected)
  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rolled_back")
  assert.deepEqual(journal.targets.slice(0, 2).map(({ state }) => state), ["restored", "restored"])
})

test("holds a workspace-wide mutex across transaction IDs", async (t) => {
  const root = await workspace(t)
  const first = await createPlan(root)
  const started = deferred()
  const release = deferred()
  const firstExecution = executeRuleApplyTransaction(first.plan, options(root, "txn-lock-first", async (event) => {
    if (event.operation === "replace_target" && event.index === 0) {
      started.resolve()
      await release.promise
    }
  }))
  await started.promise

  const second = await createPlan(root)
  await assert.rejects(
    executeRuleApplyTransaction(second.plan, options(root, "txn-lock-second")),
    (error) => error.code === "workspace_busy"
  )

  release.resolve()
  await firstExecution
})

test("an outer workspace lock token spans final validation and transaction execution", async (t) => {
  const root = await workspace(t)
  const first = await createPlan(root)
  const locked = deferred()
  const release = deferred()
  let capturedToken

  const outer = withRuleApplyWorkspaceLock(root, "run-final-apply", async (workspaceLockToken) => {
    capturedToken = workspaceLockToken
    locked.resolve()
    await release.promise
    return executeRuleApplyTransaction(first.plan, {
      ...options(root, "txn-outer-lock"),
      workspaceLockToken
    })
  })
  await locked.promise

  const competing = await createPlan(root)
  await assert.rejects(
    executeRuleApplyTransaction(competing.plan, options(root, "txn-competing-lock")),
    (error) => error.code === "workspace_busy"
  )
  release.resolve()
  const manifest = await outer
  assert.equal(manifest.status, "committed")

  const next = await createPlan(root)
  await assert.rejects(
    executeRuleApplyTransaction(next.plan, {
      ...options(root, "txn-expired-token"),
      workspaceLockToken: capturedToken
    }),
    (error) => error.code === "workspace_busy"
  )
})

test("an outer workspace lock drains an unawaited token participant before release", async (t) => {
  const root = await workspace(t)
  const { plan } = await createPlan(root)
  const started = deferred()
  const release = deferred()
  let execution
  let outerSettled = false

  const outer = withRuleApplyWorkspaceLock(root, "run-drain-apply", (workspaceLockToken) => {
    execution = executeRuleApplyTransaction(plan, {
      ...options(root, "txn-drained-lock", async (event) => {
        if (event.operation === "replace_target" && event.index === 0) {
          started.resolve()
          await release.promise
        }
      }),
      workspaceLockToken
    })
  }).finally(() => { outerSettled = true })

  await started.promise
  assert.equal(outerSettled, false)
  release.resolve()
  await execution
  await outer
  assert.equal(outerSettled, true)
})

test("workspace lock tokens are opaque, workspace-bound, and preserve callback errors", async (t) => {
  const firstRoot = await workspace(t)
  const secondRoot = await workspace(t)
  const second = await createPlan(secondRoot)
  const sentinel = new Error("preserve-final-apply-cas-error")

  await assert.rejects(
    withRuleApplyWorkspaceLock(firstRoot, "run-callback-error", async () => { throw sentinel }),
    (error) => error === sentinel
  )
  await assert.rejects(
    executeRuleApplyTransaction(second.plan, {
      ...options(secondRoot, "txn-forged-token"),
      workspaceLockToken: { testLock: true }
    }),
    (error) => error.code === "workspace_busy"
  )
  await withRuleApplyWorkspaceLock(firstRoot, "run-wrong-workspace", async (workspaceLockToken) => {
    await assert.rejects(
      executeRuleApplyTransaction(second.plan, {
        ...options(secondRoot, "txn-wrong-workspace"),
        workspaceLockToken
      }),
      (error) => error.code === "workspace_busy"
    )
  })
})

test("a foreign-scope live apply generation blocks without modifying targets", async (t) => {
  const root = await workspace(t)
  const { plan, originals } = await createPlan(root)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".apply-lock")
  await fs.mkdir(lockDirectory, { recursive: true })
  await fs.writeFile(
    path.join(lockDirectory, ".authoring-run.lock.000000000001"),
    `${JSON.stringify({
      schema_version: "bob-bazaar-review/run-lock/v1",
      pid: process.pid,
      token: "a".repeat(32),
      scope_id: "f".repeat(64),
      created_at: NOW
    })}\n`,
    "utf8"
  )

  await assert.rejects(
    executeRuleApplyTransaction(plan, options(root, "txn-foreign-apply-lock")),
    (error) => {
      assert.equal(error.code, "workspace_busy")
      assert.doesNotMatch(error.message, /process scope|\.authoring-run/)
      return true
    }
  )
  await assertTargetBytes(root, originals)
})

test("rejects a symlinked approved target without modifying its referent", async (t) => {
  const root = await workspace(t)
  const { plan } = await createPlan(root)
  const external = path.join(root, "external-checklist")
  const targetPath = path.join(root, ...TARGETS[0][1].split("/"))
  await fs.writeFile(external, "external bytes\n", "utf8")
  await fs.unlink(targetPath)
  await fs.symlink(external, targetPath)

  await assert.rejects(
    executeRuleApplyTransaction(plan, options(root, "txn-symlink")),
    (error) => error.code === "unsafe_path"
  )
  assert.equal(await fs.readFile(external, "utf8"), "external bytes\n")
  assert.equal((await fs.lstat(targetPath)).isSymbolicLink(), true)
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
