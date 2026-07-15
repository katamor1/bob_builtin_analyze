const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

function read(relativePath) {
  return fs.readFileSync(path.join(extensionRoot, relativePath), "utf8")
}

test("operator documentation defines formats, AI consent, ownership, recovery, and old-workspace compatibility", () => {
  const readme = read("README.md")
  const guide = read("docs/project-rule-authoring.md")

  assert.match(readme, /bobBazaar\.authorProjectRulesFromDocuments/)
  assert.match(readme, /docs\/project-rule-authoring\.md/)
  assert.match(readme, /docs\/project-rule-authoring-windows-uat\.md/)

  for (const phrase of [
    ".docx",
    ".xlsx",
    ".pdf",
    ".doc",
    ".xls",
    "requires_conversion",
    "requires_ocr",
    "bobBazaar.ruleAuthoring.pdfToTextPath",
    "pdftotext -layout -enc UTF-8",
    "bazaar-project-rule-authoring",
    "project_rules_get_context",
    "project_rules_get_provenance",
    ".bob/review/checklist.json",
    ".bob/review/project-context.md",
    ".bob/review/review-prompt-addendum.md",
    ".bob/review/rule-sources.json",
    ".bob/review/rule-provenance.json",
    ".bob/review/rule-authoring/**"
  ]) {
    assert.ok(guide.includes(phrase), `operator guide must document ${phrase}`)
  }

  assert.match(guide, /AI.{0,20}(?:送信|共有).{0,80}(?:明示承認|同意)/s)
  assert.match(guide, /source logical name.{0,80}(?:chunk|byte)/si)
  assert.match(guide, /Human Triage[\s\S]*(?:accept|採用)[\s\S]*(?:reject|却下)[\s\S]*(?:edit|編集)/i)
  assert.match(guide, /apply preview|適用 preview/i)
  assert.match(guide, /VS Code.{0,40}(?:再起動|restart)[\s\S]*(?:再開|resume)/i)
  assert.match(guide, /incomplete transaction[\s\S]*(?:rollback|recovery)/i)
  assert.match(guide, /project-owned[\s\S]*ignored/i)
  assert.match(guide, /旧ワークスペース|old workspace/i)
  assert.match(guide, /companion asset.{0,80}(?:なくても|missing).{0,80}(?:レビュー|review)/i)
  assert.match(guide, /Bob UI[\s\S]*bazaar-project-rule-authoring/i)
  assert.match(guide, /Palette command[\s\S]*(?:直接|自動).{0,40}(?:task|workflow).{0,40}(?:起動|開始).{0,20}(?:しない|できない)/i)
  assert.doesNotMatch(guide, /one[- ]click Bob task launch|ワンクリックで Bob task を起動できます/i)
  assert.match(guide, /原本.{0,40}(?:コピーしない|保存しない)/)
  assert.match(guide, /absolute path.{0,80}(?:共有しない|含めない)/i)
  assert.match(guide, /raw (?:document text|AI response).{0,80}(?:commit|共有|remote)/i)
})

test("Windows UAT runbook records release evidence and destructive recovery scenarios without private artifacts", () => {
  const runbook = read("docs/project-rule-authoring-windows-uat.md")

  for (const phrase of [
    "Windows 11",
    "PowerShell",
    "extension version",
    "OS build",
    "IBM Bob version",
    "workflow-register version",
    "Poppler version",
    "fixture SHA-256",
    "selected evidence bytes",
    "rule decisions",
    "transaction ID",
    "final asset SHA-256",
    "approved-rule review evidence",
    ".docx",
    ".xlsx",
    "text PDF",
    ".doc",
    ".xls",
    "image-only PDF",
    "conflicting sources",
    "induced write failure",
    "rollback",
    "VS Code restart",
    "resume"
  ]) {
    assert.ok(runbook.includes(phrase), `Windows UAT runbook must document ${phrase}`)
  }

  assert.match(runbook, /Get-FileHash[\s\S]*-Algorithm SHA256/i)
  assert.match(runbook, /pdftotext(?:\.exe)?[\s\S]*-v/i)
  assert.match(runbook, /npm ci[\s\S]*npm test[\s\S]*npm run package[\s\S]*npm run package:policy/i)
  assert.match(runbook, /Bob UI[\s\S]*bazaar-project-rule-authoring/i)
  assert.match(runbook, /approved rule[\s\S]*Bazaar revision review/i)
  assert.match(runbook, /never commit|コミットしない/i)
  for (const privateArtifact of [
    "original documents",
    "extracted text",
    "absolute paths",
    "raw model output",
    "backups",
    "run-local state"
  ]) {
    assert.ok(runbook.includes(privateArtifact), `runbook must forbid committing ${privateArtifact}`)
  }
})
