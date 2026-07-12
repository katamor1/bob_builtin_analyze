const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  REQUIRED_TRIAGE_UAT_ARTIFACTS,
  buildTriageUatEvidenceManifest,
  writeTriageUatEvidenceManifest
} = require("../scripts/triage-uat-evidence")

const TEST_SHA = "1".repeat(40)
const OTHER_SHA = "2".repeat(40)
const GENERATED_AT = "2026-07-12T16:00:00.000Z"

test("buildTriageUatEvidenceManifest hashes required artifacts deterministically without leaking the absolute workspace path", () => {
  const workspaceRoot = makeWorkspace("complete")
  for (const [index, relativePath] of REQUIRED_TRIAGE_UAT_ARTIFACTS.entries()) {
    writeWorkspaceFile(workspaceRoot, relativePath, `artifact-${index}\n`)
  }
  writeWorkspaceFile(
    workspaceRoot,
    ".bob-review/human-triage/triage-result.yaml.bak-2026-07-12T16-00-00-000Z-abcd1234",
    "legacy backup\n"
  )

  const manifest = buildTriageUatEvidenceManifest({
    workspaceRoot,
    testedCommitSha: TEST_SHA,
    vsixBuildCommitSha: TEST_SHA,
    generatedAt: GENERATED_AT
  })

  assert.equal(manifest.schema_version, "triage-uat-evidence-manifest/v1")
  assert.equal(manifest.generated_at, GENERATED_AT)
  assert.equal(manifest.tested_commit_sha, TEST_SHA)
  assert.equal(manifest.vsix_build_commit_sha, TEST_SHA)
  assert.equal(manifest.commit_match, true)
  assert.equal(manifest.status, "complete")
  assert.deepEqual(manifest.missing_required, [])
  assert.equal(manifest.workspace_name, path.basename(workspaceRoot))
  assert.equal(JSON.stringify(manifest).includes(workspaceRoot), false)

  const paths = manifest.artifacts.map((artifact) => artifact.path)
  assert.deepEqual(paths, [...paths].sort())
  for (const relativePath of REQUIRED_TRIAGE_UAT_ARTIFACTS) {
    assert.ok(paths.includes(relativePath), `missing artifact row: ${relativePath}`)
  }
  assert.ok(paths.some((relativePath) => relativePath.includes(".bak-")))

  const first = manifest.artifacts.find((artifact) => artifact.path === REQUIRED_TRIAGE_UAT_ARTIFACTS[0])
  const firstBytes = fs.readFileSync(path.join(workspaceRoot, REQUIRED_TRIAGE_UAT_ARTIFACTS[0]))
  assert.equal(first.bytes, firstBytes.length)
  assert.equal(first.sha256, crypto.createHash("sha256").update(firstBytes).digest("hex"))
})

test("buildTriageUatEvidenceManifest marks missing artifacts and commit mismatches as incomplete", () => {
  const workspaceRoot = makeWorkspace("incomplete")
  writeWorkspaceFile(workspaceRoot, REQUIRED_TRIAGE_UAT_ARTIFACTS[0], "only one artifact\n")

  const manifest = buildTriageUatEvidenceManifest({
    workspaceRoot,
    testedCommitSha: TEST_SHA,
    vsixBuildCommitSha: OTHER_SHA,
    generatedAt: GENERATED_AT
  })

  assert.equal(manifest.commit_match, false)
  assert.equal(manifest.status, "incomplete")
  assert.deepEqual(
    manifest.missing_required,
    REQUIRED_TRIAGE_UAT_ARTIFACTS.slice(1)
  )
})

test("writeTriageUatEvidenceManifest writes stable UTF-8 JSON and rejects malformed commit SHAs", () => {
  const workspaceRoot = makeWorkspace("write")
  for (const relativePath of REQUIRED_TRIAGE_UAT_ARTIFACTS) {
    writeWorkspaceFile(workspaceRoot, relativePath, `${relativePath}\n`)
  }
  const outputPath = path.join(workspaceRoot, "evidence", "triage-uat-artifact-manifest.json")

  const result = writeTriageUatEvidenceManifest({
    workspaceRoot,
    testedCommitSha: TEST_SHA,
    vsixBuildCommitSha: TEST_SHA,
    generatedAt: GENERATED_AT,
    outputPath
  })

  assert.equal(result.status, "complete")
  assert.equal(fs.existsSync(outputPath), true)
  const text = fs.readFileSync(outputPath, "utf8")
  assert.equal(text.endsWith("\n"), true)
  assert.deepEqual(JSON.parse(text), result)

  assert.throws(
    () => buildTriageUatEvidenceManifest({
      workspaceRoot,
      testedCommitSha: "not-a-sha",
      vsixBuildCommitSha: TEST_SHA,
      generatedAt: GENERATED_AT
    }),
    /testedCommitSha must be a 40-character hexadecimal commit SHA/
  )
})

function makeWorkspace(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bob-triage-uat-${label}-`))
}

function writeWorkspaceFile(workspaceRoot, relativePath, content) {
  const filePath = path.join(workspaceRoot, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, "utf8")
}
