const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { buildReviewInputFromDraft } = require("../out/core/reviewInputBuilder")

const extensionRoot = path.resolve(__dirname, "..")
const repositoryRoot = path.resolve(extensionRoot, "..", "..")

test("runtime and documentation schemas share a max_call_depth default of one", () => {
  const runtimeSchema = readJson(path.join(extensionRoot, "resources", "schemas", "review-input.schema.json"))
  const docsSchema = readJson(path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "schemas", "review-input.schema.json"))

  assert.deepEqual(docsSchema, runtimeSchema)
  assert.equal(runtimeSchema.properties.analysis_options.properties.max_call_depth.default, 1)
  assert.equal(docsSchema.properties.analysis_options.properties.max_call_depth.default, 1)
})

test("generated review-input defaults use max_call_depth one", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-review-defaults-"))
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true })
  fs.writeFileSync(path.join(workspace, "docs", "requirements.md"), "# REQ-1\n", "utf8")

  const result = await buildReviewInputFromDraft({
    review: { id: "default-depth", title: "Default depth" },
    artifact_candidates: [{
      kind: "requirements",
      path: "docs/requirements.md",
      sections: ["REQ-1"]
    }]
  }, { workspaceRoot: workspace, strictPaths: true })

  assert.equal(result.status, "ok")
  assert.equal(result.reviewInput.analysis_options.max_call_depth, 1)
  assert.match(result.yaml, /^\s*max_call_depth:\s*1\s*$/m)

  const initializerSource = fs.readFileSync(path.join(extensionRoot, "src", "workspaceInitializer.ts"), "utf8")
  assert.match(initializerSource, /^\s*max_call_depth:\s*1\s*$/m)
  assert.doesNotMatch(initializerSource, /^\s*max_call_depth:\s*2\s*$/m)
})

test("active review-input documentation shows the default dependency depth", () => {
  const activeDocumentation = [
    path.join(extensionRoot, "README.md"),
    path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "review-input-schema.md"),
    path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "mvp-architecture.md"),
    path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "examples", "simple-timeout-bugfix", "review-input.yaml"),
    path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "examples", "multi-language-git-review", "fixtures", "workspace-common", "review-input.yaml"),
    path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "examples", "ai-verification-matrix", "fixtures", "workspace-common", "review-input.yaml"),
    path.join(repositoryRoot, "docs", "workflows", "code-consistency-review", "examples", "live-traceability-sidecar", "fixtures", "workspace-common", "review-input.yaml")
  ]

  for (const filePath of activeDocumentation) {
    const documentation = fs.readFileSync(filePath, "utf8")
    assert.match(documentation, /^\s*max_call_depth:\s*1\s*$/m, filePath)
    assert.doesNotMatch(documentation, /^\s*max_call_depth:\s*2\s*$/m, filePath)
  }
})

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}
