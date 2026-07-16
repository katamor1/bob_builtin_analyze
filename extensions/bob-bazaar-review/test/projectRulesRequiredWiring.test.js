const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readExtensionFile, readSrc } = require("./helpers/sourceReader")

test("project rules review entrypoints share the required approved bundle loader and renderer", () => {
  const sources = [
    ["bazaar/bazaarReviewCommands.ts", readSrc("bazaar", "bazaarReviewCommands.ts")],
    ["ui/reviewGui.ts", readSrc("ui", "reviewGui.ts")],
    ["workflow/workflowActions.ts", readSrc("workflow", "workflowActions.ts")]
  ]

  for (const [fileName, source] of sources) {
    assert.match(source, /\bloadProjectRuleBundle\b/, `${fileName} should import the approved bundle loader`)
    assert.match(source, /\bloadProjectRuleBundle\s*\(/, `${fileName} should call the approved bundle loader`)
    assert.match(source, /\bbuildProjectRulesSectionFromBundle\b/, `${fileName} should share the bundle renderer`)
    assert.match(source, /\bbuildProjectRulesSectionFromBundle\s*\(/, `${fileName} should call the bundle renderer`)
    assert.doesNotMatch(source, /\bloadProjectChecklist\s*\(/, `${fileName} should not call the fallback checklist loader`)
    assert.doesNotMatch(source, /\bloadReviewResultSchema\s*\(/, `${fileName} should not call the fallback schema loader`)
  }
})

test("stable Skill and prompt use optional approved context only and forbid ignored authoring artifacts", () => {
  const skill = readExtensionFile("templates", ".bob", "skills", "project-review-checklist", "SKILL.md")
  const prompt = readExtensionFile("templates", ".bob", "review", "review-prompt-template.md")
  for (const [label, text] of [["Skill", skill], ["prompt", prompt]]) {
    assert.match(text, /project_rules_get_context/, `${label} should use the bounded context tool`)
    assert.match(text, /project_rules_get_provenance/, `${label} should use the bounded provenance tool`)
    assert.match(text, /存在する場合|when present/i, `${label} should keep companion files optional`)
    assert.match(text, /rule-authoring[\s\S]*(?:読まない|禁止|never read)/i, `${label} should forbid ignored run artifacts`)
    assert.doesNotMatch(text, /(?:read|読む|取得).{0,40}\.bob\/review\/rule-authoring\/(?!.*(?:禁止|never))/i)
  }
})
