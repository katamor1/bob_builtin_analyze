const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const workflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "three-extension-ui-contracts.yml"),
  "utf8"
)

test("dedicated UI contract workflow checks out and verifies the exact triggering head", () => {
  assert.match(
    workflow,
    /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}/
  )
  assert.match(
    workflow,
    /EXPECTED_HEAD_SHA:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}/
  )
  assert.match(workflow, /actual_head="\$\(git rev-parse HEAD\)"/)
  assert.match(workflow, /test "\$actual_head" = "\$EXPECTED_HEAD_SHA"/)
  assert.match(
    workflow,
    /HEAD_SHA:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}/
  )
  assert.match(workflow, /git diff --check "\$BASE_SHA\.\.\.\$HEAD_SHA"/)
})
