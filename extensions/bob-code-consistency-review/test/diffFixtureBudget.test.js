"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { collectGitDiff } = require("../out/core/gitDiffCollector")

function reviewInput() {
  return { review: { vcs: "git", base: "main", head: "feature" } }
}

async function temporaryWorkspace(t) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "diff-fixture-budget-"))
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))
  return workspaceRoot
}

test("oversized diff fixtures are rejected before JSON parsing", async (t) => {
  const workspaceRoot = await temporaryWorkspace(t)
  const fixturePath = path.join(workspaceRoot, "oversized.json")
  await fs.writeFile(fixturePath, Buffer.alloc(257, 0x7b))

  await assert.rejects(
    () => collectGitDiff(reviewInput(), {
      workspaceRoot,
      diffFixturePath: fixturePath,
      limits: { maxRawDiffBytes: 64 },
      processingBudgetLimits: {
        raw_diff_bytes: 64,
        total_operation_input_bytes: 128
      }
    }),
    (error) => /diff fixture exceeded maxBytes \(257 > 128\)/u.test(error?.message ?? "")
      && !/JSON is invalid/u.test(error?.message ?? "")
  )
})

test("fixture collection performs a stable bounded read before parsing", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "gitDiffCollector.ts"),
    "utf8"
  )
  const resolve = source.indexOf("const fixturePath = resolveWorkspacePathStrict(")
  const boundedRead = source.indexOf("const fixtureText = await readBoundedDiffFixture(", resolve)
  const parse = source.indexOf("parseDiffFixtureText(fixtureText)", boundedRead)

  assert.ok(resolve >= 0)
  assert.ok(boundedRead > resolve)
  assert.ok(parse > boundedRead)
  assert.doesNotMatch(source, /parseDiffFixtureText\(await readTextFile\(/u)
  assert.match(source, /await fs\.open\(filePath, "r"\)/u)
  assert.match(source, /await handle\.stat\(\{ bigint: true \}\)/u)
})
