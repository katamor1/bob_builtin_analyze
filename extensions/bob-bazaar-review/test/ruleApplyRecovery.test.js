const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { RULE_APPLY_PLAN_SCHEMA_VERSION } = require("../out/ruleAuthoring/ruleApplyPlan")
const {
  executeRuleApplyTransaction,
  findIncompleteRuleApplyTransactions,
  recoverRuleApplyTransaction
} = require("../out/ruleAuthoring/ruleApplyTransaction")

const TARGETS = Object.freeze([
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
])
const CREATED_AT = "2026-07-15T03:04:05.000Z"
const RECOVERED_AT = "2026-07-15T04:05:06.000Z"

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-recovery-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

async function seedCommittedTransaction(root, transactionId) {
  await fs.mkdir(path.join(root, ".bob", "review"), { recursive: true })
  const originals = new Map()
  const replacements = new Map()
  const targets = []
  for (const [asset, relativePath] of TARGETS) {
    const before = Buffer.from(`recovery-before:${asset}\n`, "utf8")
    const after = Buffer.from(`recovery-after:${asset}\n`, "utf8")
    originals.set(asset, before)
    replacements.set(asset, after)
    await fs.writeFile(path.join(root, ...relativePath.split("/")), before)
    targets.push({
      asset,
      path: relativePath,
      expected_pre_image: { state: "present", sha256: sha256(before) },
      post_image_sha256: sha256(after),
      bytes: after
    })
  }
  const plan = {
    schema_version: RULE_APPLY_PLAN_SCHEMA_VERSION,
    run_id: "run-recovery-tests",
    targets,
    decisions: [],
    retirements: []
  }
  await executeRuleApplyTransaction(plan, {
    workspaceRoot: root,
    transactionId,
    now: CREATED_AT
  })
  return { originals, replacements }
}

function transactionDirectory(root, transactionId) {
  return path.join(root, ".bob", "review", "rule-authoring", "transactions", transactionId)
}

function journalPath(root, transactionId) {
  return path.join(transactionDirectory(root, transactionId), "transaction-journal.json")
}

async function readJournal(root, transactionId) {
  return JSON.parse(await fs.readFile(journalPath(root, transactionId), "utf8"))
}

async function writeJournal(root, transactionId, journal) {
  await fs.writeFile(journalPath(root, transactionId), `${JSON.stringify(journal, null, 2)}\n`, "utf8")
}

async function makeIncomplete(root, transactionId, replacedCount) {
  const journal = await readJournal(root, transactionId)
  journal.status = "applying"
  journal.updated_at = CREATED_AT
  delete journal.error_code
  delete journal.rollback_error_code
  for (const [index, target] of journal.targets.entries()) {
    target.state = index < replacedCount ? "replaced" : "prepared"
  }
  await writeJournal(root, transactionId, journal)
  await fs.rm(path.join(transactionDirectory(root, transactionId), "apply-manifest.json"), { force: true })
  return journal
}

async function setTarget(root, asset, bytes) {
  const relativePath = TARGETS.find(([candidate]) => candidate === asset)[1]
  await fs.writeFile(path.join(root, ...relativePath.split("/")), bytes)
}

async function assertAllTargets(root, expected) {
  for (const [asset, relativePath] of TARGETS) {
    assert.deepEqual(
      await fs.readFile(path.join(root, ...relativePath.split("/"))),
      expected.get(asset),
      asset
    )
  }
}

test("finds incomplete transactions by validated ID and restart rollback is idempotent", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-restart-rollback"
  const { originals } = await seedCommittedTransaction(root, transactionId)
  await makeIncomplete(root, transactionId, 2)
  for (const [asset] of TARGETS.slice(2)) await setTarget(root, asset, originals.get(asset))

  const incomplete = await findIncompleteRuleApplyTransactions(root)
  assert.deepEqual(incomplete, [{
    transaction_id: transactionId,
    run_id: "run-recovery-tests",
    status: "applying"
  }])
  assert.doesNotMatch(JSON.stringify(incomplete), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

  const recovered = await recoverRuleApplyTransaction(root, transactionId, {
    action: "rollback",
    now: RECOVERED_AT
  })
  assert.equal(recovered.status, "rolled_back")
  assert.equal(recovered.updated_at, RECOVERED_AT)
  assert.deepEqual(recovered.targets.map(({ state }) => state), [
    "restored",
    "restored",
    "prepared",
    "prepared",
    "prepared"
  ])
  await assertAllTargets(root, originals)
  assert.deepEqual(await findIncompleteRuleApplyTransactions(root), [])

  const journalBytes = await fs.readFile(journalPath(root, transactionId))
  const repeated = await recoverRuleApplyTransaction(root, transactionId, {
    action: "rollback",
    now: "2026-07-15T05:06:07.000Z"
  })
  assert.equal(repeated.status, "rolled_back")
  assert.deepEqual(await fs.readFile(journalPath(root, transactionId)), journalBytes)
  await assertAllTargets(root, originals)
})

test("restart resume verifies replaced targets and commits a missing manifest idempotently", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-restart-resume"
  const { replacements } = await seedCommittedTransaction(root, transactionId)
  await makeIncomplete(root, transactionId, TARGETS.length)

  const manifest = await recoverRuleApplyTransaction(root, transactionId, {
    action: "resume",
    now: RECOVERED_AT
  })
  assert.equal(manifest.status, "committed")
  assert.equal(manifest.committed_at, RECOVERED_AT)
  assert.equal((await readJournal(root, transactionId)).status, "committed")
  await assertAllTargets(root, replacements)

  const manifestBytes = await fs.readFile(
    path.join(transactionDirectory(root, transactionId), "apply-manifest.json")
  )
  const repeated = await recoverRuleApplyTransaction(root, transactionId, {
    action: "resume",
    now: "2026-07-15T06:07:08.000Z"
  })
  assert.deepEqual(repeated, manifest)
  assert.deepEqual(
    await fs.readFile(path.join(transactionDirectory(root, transactionId), "apply-manifest.json")),
    manifestBytes
  )
})

test("restart rollback detects a replace that completed before its journal transition", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-restart-rename-window"
  const { originals } = await seedCommittedTransaction(root, transactionId)
  await makeIncomplete(root, transactionId, 0)
  for (const [asset] of TARGETS.slice(1)) await setTarget(root, asset, originals.get(asset))

  const recovered = await recoverRuleApplyTransaction(root, transactionId, {
    action: "rollback",
    now: RECOVERED_AT
  })

  assert.equal(recovered.status, "rolled_back")
  assert.equal(recovered.targets[0].state, "restored")
  assert.deepEqual(recovered.targets.slice(1).map(({ state }) => state), Array(4).fill("prepared"))
  await assertAllTargets(root, originals)
})

test("restart rollback fails closed when a prepared target matches neither image", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-restart-divergent-target"
  const { originals } = await seedCommittedTransaction(root, transactionId)
  await makeIncomplete(root, transactionId, 0)
  await setTarget(root, TARGETS[0][0], Buffer.from("unexpected third-party bytes\n", "utf8"))
  for (const [asset] of TARGETS.slice(1)) await setTarget(root, asset, originals.get(asset))

  await assert.rejects(
    recoverRuleApplyTransaction(root, transactionId, {
      action: "rollback",
      now: RECOVERED_AT
    }),
    (error) => error.code === "rollback_failed"
  )

  const journal = await readJournal(root, transactionId)
  assert.equal(journal.status, "rollback_failed")
  assert.equal(journal.targets[0].state, "prepared")
})

test("restart resume preserves a manifest written before the committed journal transition", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-restart-manifest-window"
  await seedCommittedTransaction(root, transactionId)
  const originalManifestBytes = await fs.readFile(
    path.join(transactionDirectory(root, transactionId), "apply-manifest.json")
  )
  const journal = await readJournal(root, transactionId)
  journal.status = "applying"
  journal.updated_at = CREATED_AT
  await writeJournal(root, transactionId, journal)

  const manifest = await recoverRuleApplyTransaction(root, transactionId, {
    action: "resume",
    now: RECOVERED_AT
  })

  assert.equal(manifest.committed_at, CREATED_AT)
  assert.deepEqual(
    await fs.readFile(path.join(transactionDirectory(root, transactionId), "apply-manifest.json")),
    originalManifestBytes
  )
  assert.equal((await readJournal(root, transactionId)).status, "committed")
})

test("restart rollback removes a manifest written before the committed journal transition", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-restart-manifest-rollback"
  const { originals } = await seedCommittedTransaction(root, transactionId)
  const journal = await readJournal(root, transactionId)
  journal.status = "applying"
  journal.updated_at = CREATED_AT
  await writeJournal(root, transactionId, journal)
  const manifest = path.join(transactionDirectory(root, transactionId), "apply-manifest.json")

  const recovered = await recoverRuleApplyTransaction(root, transactionId, {
    action: "rollback",
    now: RECOVERED_AT
  })

  assert.equal(recovered.status, "rolled_back")
  await assert.rejects(fs.access(manifest), (error) => error.code === "ENOENT")
  await assertAllTargets(root, originals)
})

test("recovery refuses an arbitrary transaction path before reading outside the fixed directory", async (t) => {
  const root = await workspace(t)
  const outside = path.join(root, "outside-marker")
  await fs.writeFile(outside, "do not read or change\n", "utf8")

  await assert.rejects(
    recoverRuleApplyTransaction(root, "../../outside-marker", {
      action: "rollback",
      now: RECOVERED_AT
    }),
    (error) => error.code === "invalid_transaction_id"
  )
  assert.equal(await fs.readFile(outside, "utf8"), "do not read or change\n")
})

test("transaction discovery skips symlinked children instead of following them", async (t) => {
  const root = await workspace(t)
  const probeId = "txn-probe"
  await seedCommittedTransaction(root, probeId)
  const transactions = path.dirname(transactionDirectory(root, probeId))
  const external = path.join(root, "external-transaction")
  await fs.mkdir(external)
  await fs.writeFile(path.join(external, "transaction-journal.json"), JSON.stringify({
    status: "applying",
    secret: "must-not-be-read"
  }))
  await fs.symlink(external, path.join(transactions, "txn-symlink-child"), "dir")

  assert.deepEqual(await findIncompleteRuleApplyTransactions(root), [])
})

test("validated recovery rejects a journal that tries to redirect a target path", async (t) => {
  const root = await workspace(t)
  const transactionId = "txn-tampered-journal"
  await seedCommittedTransaction(root, transactionId)
  const journal = await makeIncomplete(root, transactionId, 1)
  const external = path.join(root, "external-target")
  await fs.writeFile(external, "external content\n", "utf8")
  journal.targets[0].path = "external-target"
  await writeJournal(root, transactionId, journal)

  await assert.rejects(
    recoverRuleApplyTransaction(root, transactionId, {
      action: "rollback",
      now: RECOVERED_AT
    }),
    (error) => error.code === "unsafe_journal"
  )
  assert.equal(await fs.readFile(external, "utf8"), "external content\n")
})
