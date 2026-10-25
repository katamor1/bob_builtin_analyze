const path = require("node:path")
const { withRuleOoxmlParserInput } = require("../../out/ruleAuthoring/extraction/ooxmlArchive")
// Test-only access preserves the original metadata assertions after moving the product owner.
const { preflightOoxmlArchive } = require("../../out/shared-processing-budget-runtime/ooxmlPreflight")
async function prepareOoxmlParserInput(filePath, expectedFingerprint, kind, limits) {
  return withRuleOoxmlParserInput(filePath, expectedFingerprint, kind, limits, async input => input, { rootPath: path.dirname(filePath), target: "test-document" })
}
module.exports = { prepareOoxmlParserInput, preflightOoxmlArchive }
