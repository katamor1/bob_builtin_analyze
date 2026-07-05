const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const fsSync = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const yaml = require("js-yaml")
const { readSourceSet } = require("./helpers/sourceReader")

const outRoot = path.resolve(__dirname, "..", "out")
const repoRoot = path.resolve(__dirname, "..", "..", "..")
const { parseWorkflowMarkdown } = require(path.join(outRoot, "core", "parser"))
const {
  buildProjectProfileFromStudioModel,
  createDefaultStudioModel,
  generateWorkflowFromStudioModel,
  listTemplateLibrary,
  previewWorkflowFromStudioModel,
  writeWorkflowDiffPreviewFromStudioModel
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

test("template customization studio previews and generates a valid workflow with template metadata", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "alpha-product"
  model.displayName = "Alpha Product"
  model.workflowName = "alpha-code-precheck"
  model.title = "Alpha コード事前チェック"
  model.description = "Alpha Product 向けコード事前チェック。"
  model.checklistPath = ".bob/process/checklists/alpha-code-precheck.yaml"
  model.artifactOutputRoot = ".bob-process-runs/{{run.id}}/alpha-code-precheck"
  model.uatEvidencePath = "docs/uat/evidence/alpha-product.md"
  model.inputDefaults.phase2ReviewInputPath = "review-input-alpha.yaml"

  const preview = await previewWorkflowFromStudioModel(root, model)
  assert.equal(preview.status, "ok", preview.diagnostics.join("\n"))
  assert.match(preview.workflowMarkdown, /x-bob-template:/)
  assert.match(preview.workflowMarkdown, /templateId: process-code-precheck/)
  assert.match(preview.workflowMarkdown, /projectId: alpha-product/)
  const parsed = parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: preview.relativePath,
    text: preview.workflowMarkdown
  })
  assert.equal(parsed.ok, true, parsed.diagnostics.join("\n"))

  const diffPreview = await writeWorkflowDiffPreviewFromStudioModel(root, model)
  assert.equal(diffPreview.status, "ok", diffPreview.diagnostics.join("\n"))
  assert.ok(fsSync.existsSync(path.join(root, diffPreview.previewPath)))

  const generated = await generateWorkflowFromStudioModel(root, model)
  assert.equal(generated.status, "ok", generated.diagnostics.join("\n"))
  assert.equal(generated.projectProfilePath, ".bob/template-profiles/alpha-product.yaml")
  assert.equal(generated.customizationPath, ".bob/template-customizations/alpha-code-precheck.yaml")
  assert.equal(generated.workflowPath, ".bob/workflows/alpha-code-precheck/WORKFLOW.md")
  assert.ok(fsSync.existsSync(path.join(root, generated.projectProfilePath)))
  assert.ok(fsSync.existsSync(path.join(root, generated.customizationPath)))
  assert.ok(fsSync.existsSync(path.join(root, generated.workflowPath)))

  const savedCustomization = yaml.load(await fs.readFile(path.join(root, generated.customizationPath), "utf8"))
  assert.equal(savedCustomization.baseTemplateHash, library.templates[0].baseTemplateHash)
  assert.equal(savedCustomization.customize.inputs.defaults.phase2ReviewInputPath, "review-input-alpha.yaml")
})

test("template customization studio rejects invalid profile choices and unsafe paths before writing", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.targetLanguage = "ruby"

  const unsupportedLanguage = await previewWorkflowFromStudioModel(root, model)
  assert.equal(unsupportedLanguage.status, "error")
  assert.match(unsupportedLanguage.diagnostics.join("\n"), /targetLanguage is not supported: ruby/)

  model.targetLanguage = "c_cpp"
  model.vcsType = "svn"
  const unsupportedVcs = await previewWorkflowFromStudioModel(root, model)
  assert.equal(unsupportedVcs.status, "error")
  assert.match(unsupportedVcs.diagnostics.join("\n"), /vcs.type is not supported: svn/)

  model.vcsType = "git"
  model.artifactOutputRoot = "../outside"
  const unsafePath = await generateWorkflowFromStudioModel(root, model)
  assert.equal(unsafePath.status, "error")
  assert.match(unsafePath.diagnostics.join("\n"), /unsafe workspace path/)
  assert.equal(fsSync.existsSync(path.join(root, ".bob", "workflows", model.workflowName, "WORKFLOW.md")), false)
})

test("template customization studio panel wires preview generation and diff host messages", () => {
  const source = readSourceSet([
    "webview/templateCustomizationStudioPanel.ts",
    "webview/templateCustomizationStudioClientScript.ts"
  ])

  for (const messageType of ["previewWorkflow", "generateWorkflow", "showWorkflowDiff"]) {
    assert.match(source, new RegExp(messageType))
  }
  assert.match(source, /previewWorkflowFromStudioModel/)
  assert.match(source, /generateWorkflowFromStudioModel/)
  assert.match(source, /writeWorkflowDiffPreviewFromStudioModel/)
  assert.match(source, /vscode\.diff/)
})
