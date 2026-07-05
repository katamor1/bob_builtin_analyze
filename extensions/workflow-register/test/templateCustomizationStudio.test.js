const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const outRoot = path.resolve(__dirname, "..", "out")
const repoRoot = path.resolve(__dirname, "..", "..", "..")
const {
  buildProjectProfileFromStudioModel,
  createDefaultStudioModel,
  listTemplateLibrary
} = require(path.join(outRoot, "template", "templateStudioModel"))
const {
  renderTemplateCustomizationStudioHtml
} = require(path.join(outRoot, "webview", "templateCustomizationStudioHtml"))

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "template-studio-"))
}

async function copyFileInto(root, relativePath) {
  const source = path.join(repoRoot, relativePath)
  const target = path.join(root, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(source, target)
}

async function studioWorkspace() {
  const root = await tempRoot()
  await copyFileInto(root, ".bob/template-library/standard/process-code-precheck/metadata.yaml")
  await copyFileInto(root, ".bob/template-library/standard/process-code-precheck/WORKFLOW.md")
  return root
}

test("template customization studio lists the tracked standard template and builds Bazaar-safe defaults", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)

  assert.equal(library.status, "ok", library.diagnostics.join("\n"))
  assert.equal(library.templates.length, 1)
  assert.equal(library.templates[0].templateId, "process-code-precheck")
  assert.equal(library.templates[0].templatePath, ".bob/template-library/standard/process-code-precheck/metadata.yaml")
  assert.ok(library.templates[0].baseTemplateHash.startsWith("sha256:"))

  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "alpha-product"
  model.displayName = "Alpha Product"
  model.vcsType = "bazaar"
  const profile = buildProjectProfileFromStudioModel(model)
  assert.equal(profile.projectId, "alpha-product")
  assert.equal(profile.vcs.noAliases, true)
  assert.equal(profile.paths.checklistPath, ".bob/process/checklists/code-precheck.yaml")
})

test("template customization studio html exposes only allowed customization fields", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  const html = renderTemplateCustomizationStudioHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    templates: library.templates,
    model
  })

  assert.match(html, /Template Library/)
  assert.match(html, /Customize/)
  assert.match(html, /Readiness/)
  assert.match(html, /title/)
  assert.match(html, /description/)
  assert.match(html, /checklist path/)
  assert.match(html, /prompt supplement/)
  assert.match(html, /artifact output root/)
  assert.match(html, /human gate/)
  assert.match(html, /stepReview/)
  assert.match(html, /bzr --no-aliases/)
  assert.doesNotMatch(html, /guardrails/)
  assert.doesNotMatch(html, /command provider/)
  assert.doesNotMatch(html, /result sink type/)
  assert.doesNotMatch(html, /allowedCommands/)
})
