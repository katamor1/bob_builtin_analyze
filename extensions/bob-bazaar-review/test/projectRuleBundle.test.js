const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const OPTIONAL_MARKDOWN_LIMIT = 256 * 1024

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-project-rule-bundle-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const review = path.join(root, ".bob", "review")
  await fs.mkdir(review, { recursive: true })
  const checklist = {
    version: "1.0.0",
    project: "bundle-test",
    rules: [{
      id: "RT-001",
      category: "realtime",
      title: "No blocking I/O",
      description: "Do not block the real-time loop.",
      severity_on_fail: "error"
    }]
  }
  const schema = { type: "object", required: ["review_id"] }
  const checklistBytes = Buffer.from(`${JSON.stringify(checklist, null, 2)}\n`)
  const schemaBytes = Buffer.from(`${JSON.stringify(schema, null, 2)}\n`)
  await fs.writeFile(path.join(review, "checklist.json"), checklistBytes)
  await fs.writeFile(path.join(review, "review-result.schema.json"), schemaBytes)
  return { root, review, checklist, schema, checklistBytes, schemaBytes }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function sourceManifest() {
  const hash = "a".repeat(64)
  return {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-15T00:00:00.000Z",
    sources: [{
      source_id: `src-${hash.slice(0, 12)}`,
      logical_name: "engineering-rules.docx",
      media_type: "docx",
      sha256: hash,
      byte_size: 1234,
      extraction_status: "success",
      extractor: { id: "mammoth", version: "1.8.0" },
      warnings: []
    }]
  }
}

function provenance() {
  return {
    schema_version: "bob-bazaar-review/rule-provenance/v1",
    updated_at: "2026-07-15T00:00:01.000Z",
    rules: [{
      rule_id: "RT-001",
      lifecycle: "active",
      source_refs: [{
        source_id: `src-${"a".repeat(12)}`,
        chunk_id: `chunk-${"b".repeat(64)}`,
        locator: { heading_path: ["Safety"], block_index: 2 },
        text_sha256: "c".repeat(64)
      }],
      first_applied_at: "2026-07-15T00:00:00.000Z",
      last_applied_at: "2026-07-15T00:00:01.000Z",
      last_run_id: "authoring-run-1"
    }],
    markdown_sections: []
  }
}

test("loads an old checklist/schema-only workspace with deterministic empty companion hashes", async (t) => {
  const fixture = await workspace(t)
  const { loadProjectRuleBundle } = require("../out/ruleAuthoring/ruleBundle")

  const first = await loadProjectRuleBundle(fixture.root)
  const second = await loadProjectRuleBundle(fixture.root)
  assert.deepEqual(first, second)
  assert.deepEqual(first.checklist, fixture.checklist)
  assert.deepEqual(first.reviewResultSchema, fixture.schema)
  assert.equal(first.projectContext, "")
  assert.equal(first.reviewPromptAddendum, "")
  assert.equal(first.provenanceSummary, undefined)
  assert.deepEqual(first.baseHashes, {
    checklistSha256: sha256(fixture.checklistBytes),
    reviewResultSchemaSha256: sha256(fixture.schemaBytes),
    projectContextSha256: sha256(Buffer.alloc(0)),
    reviewPromptAddendumSha256: sha256(Buffer.alloc(0)),
    ruleSourcesSha256: sha256(Buffer.alloc(0)),
    ruleProvenanceSha256: sha256(Buffer.alloc(0))
  })

  await fs.writeFile(path.join(fixture.review, "project-context.md"), "")
  await fs.writeFile(path.join(fixture.review, "review-prompt-addendum.md"), "")
  assert.deepEqual(await loadProjectRuleBundle(fixture.root), first)
})

test("accepts exact 256 KiB context/addendum files and rejects one byte more", async (t) => {
  const fixture = await workspace(t)
  const { loadProjectRuleBundle } = require("../out/ruleAuthoring/ruleBundle")
  const exact = "x".repeat(OPTIONAL_MARKDOWN_LIMIT)
  await fs.writeFile(path.join(fixture.review, "project-context.md"), exact)
  await fs.writeFile(path.join(fixture.review, "review-prompt-addendum.md"), exact)

  const bundle = await loadProjectRuleBundle(fixture.root)
  assert.equal(Buffer.byteLength(bundle.projectContext), OPTIONAL_MARKDOWN_LIMIT)
  assert.equal(Buffer.byteLength(bundle.reviewPromptAddendum), OPTIONAL_MARKDOWN_LIMIT)

  await fs.writeFile(path.join(fixture.review, "project-context.md"), `${exact}x`)
  await assert.rejects(loadProjectRuleBundle(fixture.root), /project context.*byte limit/i)
  await fs.writeFile(path.join(fixture.review, "project-context.md"), exact)
  await fs.writeFile(path.join(fixture.review, "review-prompt-addendum.md"), `${exact}x`)
  await assert.rejects(loadProjectRuleBundle(fixture.root), /prompt addendum.*byte limit/i)
})

test("rejects an approved companion file that is a symbolic link", async (t) => {
  if (process.platform === "win32") {
    t.skip("Creating symlinks requires an optional Windows privilege")
    return
  }
  const fixture = await workspace(t)
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bob-project-rule-outside-"))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  const outsideContext = path.join(outside, "project-context.md")
  await fs.writeFile(outsideContext, "OUTSIDE_WORKSPACE_TEXT")
  await fs.symlink(outsideContext, path.join(fixture.review, "project-context.md"))
  const { loadProjectRuleBundle } = require("../out/ruleAuthoring/ruleBundle")

  await assert.rejects(loadProjectRuleBundle(fixture.root), /project context.*regular file/i)
})

test("validates optional JSON and returns bounded provenance metadata without ignored document text", async (t) => {
  const fixture = await workspace(t)
  const { loadProjectRuleBundle } = require("../out/ruleAuthoring/ruleBundle")
  await fs.writeFile(path.join(fixture.review, "project-context.md"), "Architecture context\n")
  await fs.writeFile(path.join(fixture.review, "review-prompt-addendum.md"), "Check rollback paths.\n")
  await fs.writeFile(path.join(fixture.review, "rule-sources.json"), `${JSON.stringify(sourceManifest(), null, 2)}\n`)
  await fs.writeFile(path.join(fixture.review, "rule-provenance.json"), `${JSON.stringify(provenance(), null, 2)}\n`)
  const ignored = path.join(fixture.review, "rule-authoring", "runs", "run-1", "generations", "gen-test")
  await fs.mkdir(ignored, { recursive: true })
  await fs.writeFile(path.join(ignored, "document-chunks.jsonl"), "PRIVATE_DOCUMENT_TEXT_MUST_NOT_LEAK")

  const bundle = await loadProjectRuleBundle(fixture.root)
  assert.deepEqual(bundle.provenanceSummary.sources, [{
    source_id: `src-${"a".repeat(12)}`,
    logical_name: "engineering-rules.docx",
    media_type: "docx",
    sha256: "a".repeat(64),
    extraction_status: "success"
  }])
  assert.deepEqual(bundle.provenanceSummary.rules, [{
    rule_id: "RT-001",
    lifecycle: "active",
    source_ids: [`src-${"a".repeat(12)}`],
    first_applied_at: "2026-07-15T00:00:00.000Z",
    last_applied_at: "2026-07-15T00:00:01.000Z",
    last_run_id: "authoring-run-1"
  }])
  const serialized = JSON.stringify(bundle.provenanceSummary)
  assert.doesNotMatch(serialized, /PRIVATE_DOCUMENT_TEXT_MUST_NOT_LEAK|chunk-|locator|text_sha256/)

  await fs.writeFile(path.join(fixture.review, "rule-provenance.json"), "not JSON")
  await assert.rejects(loadProjectRuleBundle(fixture.root), /provenance.*JSON|provenance.*malformed/i)
  await fs.writeFile(path.join(fixture.review, "rule-provenance.json"), `${JSON.stringify(provenance())}\n`)
  await fs.writeFile(path.join(fixture.review, "rule-sources.json"), "[]")
  await assert.rejects(loadProjectRuleBundle(fixture.root), /source manifest.*malformed/i)
})

test("renders optional approved bundle sections through one bounded shared renderer", async (t) => {
  const fixture = await workspace(t)
  const {
    loadProjectRuleBundle,
    PROJECT_RULE_BUNDLE_LIMITS
  } = require("../out/ruleAuthoring/ruleBundle")
  const {
    buildProjectRulesSection,
    buildProjectRulesSectionFromBundle
  } = require("../out/projectRules/packet")
  await fs.writeFile(path.join(fixture.review, "project-context.md"), "Architecture context\n")
  await fs.writeFile(path.join(fixture.review, "review-prompt-addendum.md"), "Check rollback paths.\n")
  const bundle = await loadProjectRuleBundle(fixture.root)
  const section = buildProjectRulesSectionFromBundle(bundle, PROJECT_RULE_BUNDLE_LIMITS)

  assert.match(section, /### project-context\.md[\s\S]*Architecture context/)
  assert.match(section, /### review-prompt-addendum\.md[\s\S]*Check rollback paths/)
  const legacy = buildProjectRulesSection({ checklist: fixture.checklist, schema: fixture.schema })
  assert.match(section, new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})
