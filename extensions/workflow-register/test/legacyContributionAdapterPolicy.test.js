"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  extensionRoot,
  readExtensionFile,
  readSrc,
} = require("./helpers/sourceReader")

function assertLegacyAdapterDocumentation(text, label) {
  for (const token of [
    "registerLegacyContributionSet",
    "owner",
    "version",
    "provenance",
    "provider-registry/v1",
    "Disposable",
    "0.2.0",
  ]) {
    assert.ok(text.includes(token), `${label} must mention ${token}`)
  }

  assert.match(
    text,
    /(?:complete|full|完全|一式)[\s\S]{0,80}contribution set|contribution set[\s\S]{0,80}(?:complete|full|完全|一式)/i,
    `${label} must require the complete contribution set`,
  )
  assert.match(
    text,
    /atomic|アトミック/i,
    `${label} must state that registration is atomic`,
  )
  assert.match(
    text,
    /(?:real|actual|実体|実際)[\s\S]{0,50}Disposable|Disposable[\s\S]{0,50}(?:real|actual|実体|実際)/i,
    `${label} must promise a real Disposable`,
  )
  assert.match(
    text,
    /(?:bounded|上限|最大|制限)[\s\S]{0,80}(?:diagnostic|diagnostics|診断)|(?:diagnostic|diagnostics|診断)[\s\S]{0,80}(?:bounded|上限|最大|制限)/i,
    `${label} must bound the migration diagnostic`,
  )
  assert.match(
    text,
    /once per activation|activation[\s\S]{0,50}(?:1回|一度|once)|(?:1回|一度)[\s\S]{0,50}activation/i,
    `${label} must limit the diagnostic to once per activation`,
  )
  assert.match(
    text,
    /(?:remove|removal|removed|削除|撤去)[\s\S]{0,50}0\.2\.0|0\.2\.0[\s\S]{0,50}(?:remove|removal|removed|削除|撤去)/i,
    `${label} must state removal at 0.2.0`,
  )
}

test("legacy contribution adapter exposes one frozen machine-readable removal policy", () => {
  const compiledAdapter = path.join(
    extensionRoot,
    "out",
    "api",
    "legacyContributionAdapter.js",
  )

  assert.ok(
    fs.existsSync(compiledAdapter),
    "compile must publish out/api/legacyContributionAdapter.js",
  )

  const {
    LEGACY_CONTRIBUTION_ADAPTER_POLICY: policy,
  } = require(compiledAdapter)

  assert.ok(policy && typeof policy === "object", "policy must be exported")
  assert.equal(Object.isFrozen(policy), true, "policy must be frozen")
  assert.deepEqual(
    {
      deprecatedIn: policy.deprecatedIn,
      removeIn: policy.removeIn,
      replacement: policy.replacement,
    },
    {
      deprecatedIn: "0.1.0",
      removeIn: "0.2.0",
      replacement: "provider-registry/v1",
    },
  )
})

test("public API exports one atomic legacy entrypoint and no unsafe per-kind registration methods", () => {
  const extensionSource = readSrc("extension.ts")

  assert.match(extensionSource, /\bregisterLegacyContributionSet\s*:/)
  for (const unsafeMethod of [
    "registerActionProvider",
    "registerAgentProvider",
    "registerResultSink",
  ]) {
    assert.doesNotMatch(
      extensionSource,
      new RegExp(`\\b${unsafeMethod}\\b`),
      `public API must not expose ${unsafeMethod}`,
    )
  }
})

for (const [label, relativePath] of [
  ["README", "README.md"],
  ["workflow action contracts", "docs/workflow-action-contracts-ja.md"],
]) {
  test(`${label} documents the complete legacy adapter migration contract`, () => {
    assertLegacyAdapterDocumentation(
      readExtensionFile(relativePath),
      label,
    )
  })
}
