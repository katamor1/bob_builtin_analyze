"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const docxModule = require("../out/ruleAuthoring/extraction/docxExtractor")
const legacyPreflightModule = require("../out/ruleAuthoring/extraction/ooxmlPreflight")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { createDocxFixture } = require("./helpers/ruleDocumentFixtures")

test("OOXML extraction does not read the path through the legacy preflight before the bounded snapshot", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-no-legacy-ooxml-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "rules.docx")
  const bytes = createDocxFixture()
  await fs.writeFile(filePath, bytes)

  let legacyCalls = 0
  const originalPreflight = legacyPreflightModule.preflightOoxmlArchive
  const originalDocx = docxModule.extractDocx
  legacyPreflightModule.preflightOoxmlArchive = async () => {
    legacyCalls += 1
    throw new Error("legacy path preflight must not run")
  }
  docxModule.extractDocx = async () => ({
    chunks: [],
    status: "success",
    warnings: [],
    extractor: { id: "fixture-docx", version: "1" }
  })
  t.after(() => {
    legacyPreflightModule.preflightOoxmlArchive = originalPreflight
    docxModule.extractDocx = originalDocx
  })

  delete require.cache[require.resolve("../out/ruleAuthoring/extraction/documentExtractor")]
  const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")
  await extractRuleDocuments([{ filePath }], undefined, {
    ...DEFAULT_RULE_AUTHORING_LIMITS,
    maxSourceBytes: bytes.length + 1,
    maxAggregateSourceBytes: bytes.length + 1
  })

  assert.equal(legacyCalls, 0)
})
