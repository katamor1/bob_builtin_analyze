const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

test("workflow action contract docs define Bazaar provider ids and sidecar metadata", () => {
  const actionContract = fs.readFileSync(path.join(extensionRoot, "docs", "workflow-action-contracts-ja.md"), "utf8")
  const metadataContract = fs.readFileSync(path.join(extensionRoot, "docs", "artifact-metadata-contract-ja.md"), "utf8")

  for (const providerId of [
    "bobBazaar.openReviewGui",
    "bobBazaar.collectReviewContext",
    "bobBazaar.loadReviewRules",
    "bobBazaar.captureReviewResult"
  ]) {
    assert.ok(actionContract.includes(providerId), `workflow contract must document ${providerId}`)
  }

  assert.ok(metadataContract.includes(".bob/review/results/<review_id>.artifact-metadata.json"))
  assert.ok(metadataContract.includes("bob-bazaar-review"))
})

test("bob-bazaar-review README reflects current source layout and metadata sidecar", () => {
  const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8")

  for (const pathFragment of [
    "src/workflow/workflowRegisterBridge.ts",
    "src/bazaar/bazaarReviewCommands.ts",
    "src/projectRules/reviewResultValidationCommand.ts",
    "src/ui/",
    "src/workflow/",
    "src/workspace/"
  ]) {
    assert.ok(readme.includes(pathFragment), `README must mention current path ${pathFragment}`)
  }

  assert.ok(readme.includes(".bob/review/results/<review_id>.artifact-metadata.json"))
})

test("bob-bazaar-review docs reflect current module layout and MCP safety gates", () => {
  const docs = [
    "docs/README-ja.md",
    "docs/basic-design-ja.md",
    "docs/detailed-design-ja.md",
    "docs/unit-test-spec-ja.md",
    "docs/real-machine-test-spec-ja.md"
  ].map((relativePath) => fs.readFileSync(path.join(extensionRoot, relativePath), "utf8")).join("\n")

  for (const stalePath of [
    "src/workflowRegisterBridge.ts",
    "src/bazaarReviewCommands.ts",
    "src/reviewResultValidationCommand.ts",
    "src/bobCodeExtension.ts",
    "src/bazaar.ts",
    "src/textEncoding.ts",
    "src/reviewGui.ts",
    "src/workspaceResolver.ts"
  ]) {
    assert.ok(!docs.includes(stalePath), `docs must not reference stale flat source path ${stalePath}`)
  }

  for (const phrase of [
    "src/workflow/workflowRegisterBridge.ts",
    "src/bazaar/bazaarReviewCommands.ts",
    "src/projectRules/reviewResultValidationCommand.ts",
    "src/records/*",
    "BOB_BAZAAR_ENABLE_WRITE_TOOLS=1",
    "BOB_BAZAAR_ALLOWED_ROOTS",
    "BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD=1",
    "test/reviewRecordsCore.test.js",
    "producer_version"
  ]) {
    assert.ok(docs.includes(phrase), `docs must document current contract: ${phrase}`)
  }

  const detailedDesign = fs.readFileSync(path.join(extensionRoot, "docs", "detailed-design-ja.md"), "utf8")
  assert.ok(detailedDesign.includes("## 13. security / privacy"))
  assert.ok(detailedDesign.includes("## 14. test / acceptance gate"))
  assert.ok(!detailedDesign.includes("## 22. テスト設計"))
})

test("bob-bazaar-review metadata version uses the package version source", () => {
  const metadata = fs.readFileSync(path.join(extensionRoot, "src", "shared", "extensionMetadata.ts"), "utf8")
  const mcpServer = fs.readFileSync(path.join(extensionRoot, "src", "mcp", "server.ts"), "utf8")
  const resultCaptureArtifacts = fs.readFileSync(path.join(extensionRoot, "src", "projectRules", "resultCaptureArtifacts.ts"), "utf8")

  assert.match(metadata, /export const EXTENSION_VERSION = readPackageVersion\(\)/)
  assert.match(mcpServer, /version: EXTENSION_VERSION/)
  assert.match(resultCaptureArtifacts, /producer_version: EXTENSION_VERSION/)
  assert.doesNotMatch(mcpServer, /0\.3\.0/)
  assert.doesNotMatch(resultCaptureArtifacts, /producer_version: "0\.3\.0"/)
})

test("project rule authoring docs describe the implemented module and provider boundaries", () => {
  const guide = fs.readFileSync(path.join(extensionRoot, "docs", "project-rule-authoring.md"), "utf8")

  for (const modulePath of [
    "src/ruleAuthoring/ruleBundle.ts",
    "src/ruleAuthoring/ruleApplyTransaction.ts",
    "src/ui/ruleAuthoringGui.ts",
    "src/ui/ruleProposalTriageGui.ts",
    "src/workflow/ruleAuthoringWorkflowActions.ts"
  ]) {
    assert.ok(guide.includes(modulePath), `authoring guide must document ${modulePath}`)
  }
  for (const providerId of [
    "bobBazaar.openRuleAuthoringGui",
    "bobBazaar.loadRuleSourceIndex",
    "bobBazaar.captureRuleEvidenceSelection",
    "bobBazaar.loadSelectedRuleEvidence",
    "bobBazaar.captureRuleProposal",
    "bobBazaar.openRuleProposalTriageGui",
    "bobBazaar.verifyRuleAuthoringApply"
  ]) {
    assert.ok(guide.includes(providerId), `authoring guide must document ${providerId}`)
  }
})

test("current rule authoring docs define the validated OOXML snapshot boundary", () => {
  const contracts = {
    "README.md": [
      /fingerprintに結び付いたsnapshot Buffer/,
      /通常のDOCX\/XLSX.*元のsnapshot Buffer/s,
      /styles\.xml.*sharedStrings\.xml.*両方.*欠けるXLSX.*メモリ内/s,
      /原本とworkspaceへ書き込ま/
    ],
    "docs/project-rule-authoring.md": [
      /parserへ渡す前.*snapshot Buffer/s,
      /通常のDOCX\/XLSX.*元のsnapshot Buffer/s,
      /styles\.xml.*sharedStrings\.xml.*両方.*欠けるXLSX.*再構築/s,
      /原本とworkspaceへ書き込ま/
    ],
    "docs/basic-design-ja.md": [
      /snapshot Buffer.*ZIP32.*全entry payload.*parser/s,
      /通常のDOCX\/XLSX.*missing-both/s,
      /公開Command ID.*persisted schema.*extension version/s
    ],
    "docs/detailed-design-ja.md": [
      /src\/ruleAuthoring\/extraction\/ooxmlArchive\.ts/,
      /1つの`FileHandle`/,
      /`BigInt` stat/,
      /元のsnapshot Bufferと同一object/,
      /直接dynamic import.*parser由来の推移依存/s,
      /dependency宣言とlockfile/
    ],
    "docs/unit-test-spec-ja.md": [
      /source byte上限/,
      /same-size \/ same-mtime replacement/,
      /全entry payload.*parser loadより先/s,
      /通常のDOCX\/XLSX.*snapshot Buffer/s,
      /missing-both.*fflate/s
    ]
  }

  for (const [relativePath, patterns] of Object.entries(contracts)) {
    const document = fs.readFileSync(path.join(extensionRoot, relativePath), "utf8")
    for (const pattern of patterns) {
      assert.match(document, pattern, `${relativePath} must document OOXML contract: ${pattern}`)
    }
  }

  const guide = fs.readFileSync(path.join(extensionRoot, "docs", "project-rule-authoring.md"), "utf8")
  assert.match(guide, /project-rule-authoring-windows-uat\.md/)

  const windowsUat = fs.readFileSync(
    path.join(extensionRoot, "docs", "project-rule-authoring-windows-uat.md"),
    "utf8"
  )
  assert.match(windowsUat, /^Status: \*\*PENDING/m)
  assert.match(windowsUat, /^### PRA-WIN-001 /m)
})
