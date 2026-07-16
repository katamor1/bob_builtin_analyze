import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { validateRetirementMap } from "../retirementPolicy.mjs"

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test("production retirement map is valid, unique, and never targets main", () => {
  const map = JSON.parse(readFileSync(join(root, "branch-retirement-map.json"), "utf8"))
  assert.deepEqual(validateRetirementMap(map), [])
  assert.equal(map.entries.length, 14)
  assert.equal(new Set(map.entries.map((entry) => entry.branch)).size, map.entries.length)
  assert.equal(map.entries.some((entry) => entry.branch === "main"), false)
  assert.ok(map.entries.every((entry) => entry.replacementPullRequests.length > 0))
})
