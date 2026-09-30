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
    /ref:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.expectedHeadSha \|\| github\.event\.pull_request\.head\.sha \|\| github\.sha\s*\}\}/
  )
  assert.match(
    workflow,
    /EXPECTED_HEAD_SHA:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.expectedHeadSha \|\| github\.event\.pull_request\.head\.sha \|\| github\.sha\s*\}\}/
  )
  assert.match(workflow, /actual_head="\$\(git rev-parse HEAD\)"/)
  assert.match(workflow, /run: node scripts\/verify-ci-head\.js/)
  assert.match(
    workflow,
    /HEAD_SHA:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.expectedHeadSha \|\| github\.event\.pull_request\.head\.sha \|\| github\.sha\s*\}\}/
  )
  const whitespaceStepStart = workflow.indexOf("      - name: Verify changed-file whitespace")
  assert.notEqual(whitespaceStepStart, -1)
  const whitespaceStep = workflow.slice(whitespaceStepStart)
  const requiredInOrder = [
    "          set -euo pipefail",
    '          actual_head="$(git rev-parse HEAD)"',
    '          test "$actual_head" = "$HEAD_SHA"',
    '          actual_historical_patch_blob="$(git rev-parse "$HEAD_SHA:$HISTORICAL_PATCH")"',
    '          test "$actual_historical_patch_blob" = "$EXPECTED_HISTORICAL_PATCH_BLOB"',
    '          if [[ "$EVENT_NAME" == "pull_request" ]]; then',
    '            git diff --check "$BASE_SHA...$HEAD_SHA" -- . ":(exclude)$HISTORICAL_PATCH"',
    "          else",
    '            git diff --check "$HEAD_SHA^" "$HEAD_SHA" -- . ":(exclude)$HISTORICAL_PATCH"',
    "          fi"
  ]
  let previous = -1
  for (const required of requiredInOrder) {
    const current = whitespaceStep.indexOf(required)
    assert.ok(current > previous, `missing or out-of-order fail-closed workflow contract: ${required}`)
    previous = current
  }
  const whitespaceStepLines = whitespaceStep.split(/\r?\n/)
  const exactEnvironmentLines = [
    '          EVENT_NAME: ${{ github.event_name }}',
    '          BASE_SHA: ${{ github.event.pull_request.base.sha }}',
    "          HEAD_SHA: ${{ github.event_name == 'workflow_dispatch' && inputs.expectedHeadSha || github.event.pull_request.head.sha || github.sha }}",
    "          HISTORICAL_PATCH: docs/release-evidence/workflow-contract-v2-foundation-doc-sync.patch",
    "          EXPECTED_HISTORICAL_PATCH_BLOB: e0946c6a29f7aa17538b1bc89e8160892845fb44"
  ]
  for (const expectedLine of exactEnvironmentLines) {
    assert.equal(
      whitespaceStepLines.filter((line) => line === expectedLine).length,
      1,
      `workflow environment must contain exactly: ${expectedLine}`
    )
  }
  const normalizedWhitespaceStep = whitespaceStep.replace(/\r\n/g, "\n")
  const exactConditional =
    /^          if \[\[ "\$EVENT_NAME" == "pull_request" \]\]; then\n            git diff --check "\$BASE_SHA\.\.\.\$HEAD_SHA" -- \. ":\(exclude\)\$HISTORICAL_PATCH"\n          else\n            git diff --check "\$HEAD_SHA\^" "\$HEAD_SHA" -- \. ":\(exclude\)\$HISTORICAL_PATCH"\n          fi$/gm
  assert.equal(
    (normalizedWhitespaceStep.match(exactConditional) ?? []).length,
    1,
    "pull requests must check the merge-base range and non-PR events must check the exact pushed commit"
  )
  const diffCommands = whitespaceStep
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("git diff --check "))
  assert.deepEqual(diffCommands, [
    'git diff --check "$BASE_SHA...$HEAD_SHA" -- . ":(exclude)$HISTORICAL_PATCH"',
    'git diff --check "$HEAD_SHA^" "$HEAD_SHA" -- . ":(exclude)$HISTORICAL_PATCH"'
  ])
  assert.equal((whitespaceStep.match(/:\(exclude\)\$HISTORICAL_PATCH/g) ?? []).length, 2)
  assert.doesNotMatch(whitespaceStep, /^\s*git diff --check "\$BASE_SHA\.\.\.\$HEAD_SHA"\s*$/m)
  assert.doesNotMatch(whitespaceStep, /^\s*git diff --check "\$HEAD_SHA\^" "\$HEAD_SHA"\s*$/m)
  assert.doesNotMatch(whitespaceStep, /\|\|\s*true/)
})
