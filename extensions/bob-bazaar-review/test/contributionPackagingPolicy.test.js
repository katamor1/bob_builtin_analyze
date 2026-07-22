const assert = require("node:assert/strict")
const { test } = require("node:test")

const { extensionRoot, readJson } = require("./helpers/sourceReader")
const { requiredContributionAssetEntries } = require("../scripts/check-vsix-policy")

test("VSIX policy derives every contribution asset from the Bazaar manifest", () => {
  const manifest = readJson("contracts", "workflow-contributions.json")
  const expected = [
    "extension/contracts/workflow-contributions.json",
    ...manifest.schemas.map(({ path }) => `extension/${path.replace("extensions/bob-bazaar-review/", "")}`),
    ...manifest.workflow_templates.map(({ source }) => `extension/${source.replace("extensions/bob-bazaar-review/", "")}`)
  ].sort()

  assert.deepEqual(requiredContributionAssetEntries(extensionRoot), expected)
})
