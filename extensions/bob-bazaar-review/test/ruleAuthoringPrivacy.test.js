const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { buildRuleSourceIndex } = require("../out/ruleAuthoring/sourceIndex")
const { parseEvidenceSelection } = require("../out/ruleAuthoring/evidenceSelection")
const { createRuleAuthoringRun, writeRuleAuthoringRun } = require("../out/ruleAuthoring/ruleAuthoringRunStore")

const ONE_MIB = 1024 * 1024

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function privacyFixture() {
  const sourceHash = "b".repeat(64)
  const source = {
    source_id: `src-${sourceHash.slice(0, 12)}`,
    logical_name: "private-rules.pdf",
    media_type: "pdf",
    sha256: sourceHash,
    byte_size: 4096,
    extraction_status: "success",
    extractor: { id: "fixture", version: "1.0" },
    warnings: []
  }
  const absolutePath = "/home/alice/secret/customer/rules.pdf"
  const secret = "sk-private-value-that-must-not-leak"
  const text = `Open ${absolutePath}; api_key=${secret}; ${"private body ".repeat(50)}`
  const chunk = {
    schema_version: "bob-bazaar-review/document-chunk/v1",
    chunk_id: `chunk-${sha256("privacy")}`,
    source_id: source.source_id,
    kind: "page",
    locator: { page: 1 },
    title: "Private rules",
    text,
    text_sha256: sha256(text),
    flags: []
  }
  const manifest = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T12:34:56.000Z",
    sources: [source]
  }
  return { absolutePath, chunk, manifest, secret, source, text }
}

test("shareable source indexes contain no raw source body, absolute path, or secret", () => {
  const { absolutePath, chunk, manifest, secret, text } = privacyFixture()
  const serialized = JSON.stringify(buildRuleSourceIndex(manifest, [chunk], ONE_MIB))

  assert.doesNotMatch(serialized, new RegExp(absolutePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(serialized, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(serialized, /"text":/)
})

test("index and evidence validation diagnostics never echo untrusted text or paths", () => {
  const { absolutePath, chunk, manifest, secret } = privacyFixture()
  const index = buildRuleSourceIndex(manifest, [chunk], ONE_MIB)
  const invalidChunk = {
    ...chunk,
    source_id: absolutePath,
    text: secret,
    text_sha256: "0".repeat(64)
  }

  assert.throws(
    () => buildRuleSourceIndex(manifest, [invalidChunk], ONE_MIB),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(absolutePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      assert.doesNotMatch(error.message, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      return true
    }
  )

  const raw = JSON.stringify({
    schema_version: "bob-bazaar-review/rule-evidence-selection/v1",
    selected_chunks: [{
      source_id: absolutePath,
      chunk_id: secret,
      text_sha256: "f".repeat(64)
    }]
  })
  assert.throws(
    () => parseEvidenceSelection(raw, index),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(absolutePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      assert.doesNotMatch(error.message, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      return true
    }
  )
})

test("run metadata rejects shareable-looking absolute artifacts and free-form issues", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-run-privacy-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-privacy" })

  await assert.rejects(
    writeRuleAuthoringRun({
      ...run,
      artifacts: { sourceManifest: path.join(root, "secret.json") },
      updatedAt: "2026-07-14T05:00:00.000Z"
    }, run.updatedAt),
    /workspace-relative artifact name/
  )
  await assert.rejects(
    writeRuleAuthoringRun({
      ...run,
      issues: [{
        phase: "sources",
        code: "/home/alice/private rules failed",
        retryable: false,
        recordedAt: "2026-07-14T05:00:00.000Z"
      }],
      updatedAt: "2026-07-14T05:00:00.000Z"
    }, run.updatedAt),
    /bounded safe code/
  )

  for (const driveQualified of ["C:escape.json", "C:/escape.json", "z:relative/escape.json"]) {
    await assert.rejects(
      writeRuleAuthoringRun({
        ...run,
        artifacts: { sourceManifest: driveQualified },
        updatedAt: new Date(Date.parse(run.updatedAt) + 1_000).toISOString()
      }, run.updatedAt),
      /workspace-relative artifact name/
    )
  }

  for (const nonPortableArtifact of [
    "NUL",
    "NUL.json",
    "CON",
    "COM1",
    "COM¹",
    "LPT².txt",
    "a".repeat(256),
    "é".repeat(128),
    "safe/NUL.json",
    "safe.json:stream",
    "bad?.json",
    "safe/bad*.json",
    "trailing.",
    "trailing ",
    " leading.json"
  ]) {
    await assert.rejects(
      writeRuleAuthoringRun({
        ...run,
        artifacts: { sourceManifest: nonPortableArtifact },
        updatedAt: new Date(Date.parse(run.updatedAt) + 1_000).toISOString()
      }, run.updatedAt),
      /workspace-relative artifact name/,
      `accepted non-portable artifact ${JSON.stringify(nonPortableArtifact)}`
    )
  }
})

test("source index rejects a non-canonical generated timestamp without echoing it", () => {
  const { chunk, manifest } = privacyFixture()
  const injected = "/home/alice/private/generated-at"
  assert.throws(
    () => buildRuleSourceIndex({ ...manifest, generated_at: injected }, [chunk], ONE_MIB),
    (error) => {
      assert.match(error.message, /generated timestamp/i)
      assert.doesNotMatch(error.message, /home\/alice/)
      return true
    }
  )
})
