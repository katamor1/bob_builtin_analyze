"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

test("maxDocumentBytes describes fail-closed source handling", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
  const description = packageJson.contributes.configuration.properties["bobCodeConsistency.maxDocumentBytes"].description

  assert.doesNotMatch(description, /Markdown は上限まで読み/)
  assert.match(description, /Markdown／DOCX／XLSX/)
  assert.match(description, /上限を超える場合に抽出を開始せず拒否/)
  assert.match(description, /抜粋.*別の抜粋上限/)
})
