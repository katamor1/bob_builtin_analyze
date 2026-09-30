"use strict"

const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { after, test } = require("node:test")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-head-"))
after(() => fs.rmSync(root, { recursive: true, force: true }))
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
git("init", "--quiet")
git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "commit", "--allow-empty", "-m", "fixture")
const head = git("rev-parse", "HEAD")
const other = "0".repeat(40)
const nonce = "1234567890abcdef1234567890abcdef"
const script = path.join(__dirname, "verify-ci-head.js")

function invoke(overrides = {}) {
  const output = path.join(root, `environment-${fs.readdirSync(root).length}.txt`)
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_SHA: other,
      EXPECTED_HEAD_SHA: head,
      DISPATCH_HEAD_SHA: "",
      DISPATCH_NONCE: "",
      GITHUB_ENV: output,
      ...overrides
    }
  })
  return { ...result, published: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : null }
}

test("PR verification uses the actual head rather than the synthetic merge SHA", () => {
  const result = invoke()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).actualHeadSha, head)
  assert.equal(result.published, `CI_VERIFIED_HEAD_SHA=${head}\n`)
})

test("push verification binds the event SHA to checkout", () => {
  const result = invoke({ GITHUB_EVENT_NAME: "push", GITHUB_SHA: head })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).expectedHeadSha, head)
})

test("manual verification binds checkout, trigger revision, input and correlation nonce", () => {
  const result = invoke({ GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: head, DISPATCH_HEAD_SHA: head, DISPATCH_NONCE: nonce })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).dispatchNonce, nonce)
  assert.equal(result.published, `CI_VERIFIED_HEAD_SHA=${head}\n`)
})

for (const [name, overrides, diagnostic] of [
  ["wrong checkout", { EXPECTED_HEAD_SHA: other }, /checkout does not match/],
  ["missing expected SHA", { EXPECTED_HEAD_SHA: "" }, /expected head must be/],
  ["branch name", { EXPECTED_HEAD_SHA: "main" }, /expected head must be/],
  ["uppercase SHA", { EXPECTED_HEAD_SHA: "A".repeat(40) }, /expected head must be/],
  ["newline injection", { EXPECTED_HEAD_SHA: `${head}\nINJECTED=yes` }, /expected head must be/],
  ["unsupported event", { GITHUB_EVENT_NAME: "pull_request_target" }, /unsupported CI event/],
  ["push trigger drift", { GITHUB_EVENT_NAME: "push", GITHUB_SHA: other }, /trigger does not match/],
  ["missing manual input", { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: head, DISPATCH_NONCE: nonce }, /dispatch head must be/],
  ["manual input drift", { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: head, DISPATCH_HEAD_SHA: other, DISPATCH_NONCE: nonce }, /dispatch input does not match/],
  ["manual trigger drift", { GITHUB_EVENT_NAME: "workflow_dispatch", DISPATCH_HEAD_SHA: head, DISPATCH_NONCE: nonce }, /trigger does not match/],
  ["missing nonce", { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: head, DISPATCH_HEAD_SHA: head }, /dispatch nonce must be/],
  ["invalid nonce", { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: head, DISPATCH_HEAD_SHA: head, DISPATCH_NONCE: "wrong" }, /dispatch nonce must be/]
]) {
  test(`rejects ${name} without publishing a verified identity`, () => {
    const result = invoke(overrides)
    assert.equal(result.status, 1)
    assert.match(result.stderr, diagnostic)
    assert.equal(result.stdout, "")
    assert.equal(result.published, null)
  })
}
