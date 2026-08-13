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
  calculateReadinessFromStudioModel,
  checkReadinessFromStudioModel,
  commitReadinessReportsFromStudioModel,
  createDefaultStudioModel,
  generateWorkflowFromStudioModel,
  listTemplateLibrary,
  previewWorkflowFromStudioModel,
  validateCustomizationFromStudioModel,
  validateProfileFromStudioModel,
  writeWorkflowDiffPreviewFromStudioModel
} = require(path.join(outRoot, "template", "templateStudioModel"))
const {
  renderWorkflowBuilderStandardTemplateHtml
} = require(path.join(outRoot, "webview", "workflowBuilderStandardTemplateHtml"))
const {
  writeWorkspaceFilesAtomically
} = require(path.join(outRoot, "core", "runtime", "workspaceFileTransaction"))

function renderTemplateCustomizationStudioHtml(options) {
  return renderWorkflowBuilderStandardTemplateHtml({ ...options, sessionToken: "test-session" })
}

async function alternateWindowsWorkspacePath(value, context) {
  if (process.platform !== "win32") return value
  const alias = `${value}-alias`
  await fs.symlink(value, alias, "junction")
  context.after(() => fs.unlink(alias))
  return alias.toUpperCase()
}

async function physicalTargetPath(value) {
  const resolved = path.resolve(String(value))
  return path.join(await fs.realpath(path.dirname(resolved)), path.basename(resolved))
}

async function isSamePhysicalTarget(left, right) {
  return path.relative(await physicalTargetPath(left), await physicalTargetPath(right)) === ""
}

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

async function addReadinessFiles(root, model, options = {}) {
  await fs.mkdir(path.join(root, ".bob", "process", "checklists"), { recursive: true })
  await fs.writeFile(path.join(root, ".bob", "process", "process-catalog.yaml"), "schemaVersion: bob-process-catalog/v1\n", "utf8")
  if (options.checklist !== false) {
    await fs.writeFile(path.join(root, model.checklistPath), "checks: []\n", "utf8")
  }
  if (options.uatEvidence !== false) {
    await fs.mkdir(path.dirname(path.join(root, model.uatEvidencePath)), { recursive: true })
    await fs.writeFile(path.join(root, model.uatEvidencePath), "# UAT evidence\n", "utf8")
  }
}

test("template customization studio lists the tracked standard template and builds VCS-aware defaults", async () => {
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
  assert.equal(model.vcsType, "git")
  assert.equal(model.promptSupplement, "")

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

  assert.match(html, /ワークフロー作成・編集/)
  assert.match(html, /標準テンプレートから作成/)
  assert.match(html, /テンプレート一覧/)
  assert.match(html, /プロジェクト設定/)
  assert.match(html, /適用準備状況/)
  assert.match(html, /表示名/)
  assert.match(html, /説明/)
  assert.match(html, /チェックリストのパス/)
  assert.match(html, /Bob への補足指示/)
  assert.match(html, /工程成果物の出力先/)
  assert.match(html, /人による確認/)
  assert.match(html, /ステップ後の一時停止/)
  assert.doesNotMatch(html, />Template Library<|>Customize<|>Readiness</)
  assert.match(html, /<textarea id="promptSupplement"><\/textarea>/)
  assert.doesNotMatch(html, /<select id="targetLanguage">(?:(?!<\/select>)[\s\S])*<option value="sql"/)
  assert.doesNotMatch(html, /<select id="vcsType">(?:(?!<\/select>)[\s\S])*<option value="none"/)
  assert.doesNotMatch(html, /guardrails/)
  assert.doesNotMatch(html, /command provider/)
  assert.doesNotMatch(html, /result sink type/)
  assert.doesNotMatch(html, /allowedCommands/)
})

test("template customization studio html preserves editable input default types", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.inputDefaults = {
    reviewPackagePath: ".bob-review/review-package",
    maxRawDiffBytes: 4096,
    includeDocs: true,
    optionalFlag: null
  }

  const html = renderTemplateCustomizationStudioHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    templates: library.templates,
    model
  })

  assert.match(html, /data-input-default="reviewPackagePath" data-input-default-type="string"/)
  assert.match(html, /data-input-default="maxRawDiffBytes" data-input-default-type="number"/)
  assert.match(html, /data-input-default="includeDocs" data-input-default-type="boolean"/)
  assert.match(html, /data-input-default="optionalFlag" data-input-default-type="null"/)

  const source = readSourceSet(["webview/workflowBuilderStandardTemplateClientScript.ts"])
  assert.match(source, /readInputDefaultValue/)
  assert.match(source, /Number\.isFinite/)
})

test("template customization studio html escapes initial JSON inside script tags", () => {
  const html = renderTemplateCustomizationStudioHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    templates: [{
      templateId: "danger-template",
      templateVersion: "1.0.0",
      displayName: "</script><script>throw new Error('x')</script>",
      templatePath: ".bob/template-library/standard/process-code-precheck/metadata.yaml",
      baseWorkflowPath: ".bob/template-library/standard/process-code-precheck/WORKFLOW.md",
      baseTemplateHash: "sha256:test",
      supportedLanguages: ["c_cpp"],
      supportedVcs: ["bazaar"]
    }],
    model: {
      templatePath: ".bob/template-library/standard/process-code-precheck/metadata.yaml",
      templateId: "danger-template",
      templateVersion: "1.0.0",
      baseTemplateHash: "sha256:test",
      projectId: "alpha-product",
      displayName: "Alpha Product",
      targetLanguage: "c_cpp",
      vcsType: "bazaar",
      vcsRoot: ".",
      checklistPath: ".bob/process/checklists/code-precheck.yaml",
      artifactOutputRoot: ".bob-process-runs/{{run.id}}/code-precheck",
      uatEvidencePath: "docs/uat/evidence/alpha-product.md",
      workflowName: "alpha-code-precheck",
      title: "Line\u2028</script><script>alert(1)</script>",
      description: "Description",
      inputDefaults: {},
      promptSupplement: "",
      stepReviewPauseAfter: "agentAndCommand"
    }
  })

  assert.doesNotMatch(html, /<\/script><script>/)
  assert.match(html, /\\u003C\/script\\u003E/)
})

test("tracked standard template required files exist in the repository", async () => {
  const metadata = yaml.load(await fs.readFile(path.join(repoRoot, ".bob", "template-library", "standard", "process-code-precheck", "metadata.yaml"), "utf8"))

  for (const requiredFile of metadata.requiredFiles) {
    assert.equal(fsSync.existsSync(path.join(repoRoot, requiredFile)), true, `${requiredFile} exists`)
  }
})

test("template customization studio refreshes template library from listTemplates responses", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  const html = renderTemplateCustomizationStudioHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    templates: library.templates,
    model
  })
  const source = readSourceSet(["webview/workflowBuilderStandardTemplateClientScript.ts"])

  assert.match(html, /id="templateList"/)
  assert.match(source, /message\.type === 'templateList'/)
  assert.match(source, /renderTemplateList/)
  assert.match(source, /message\.templates/)
})

test("template customization studio readiness html exposes status score checks and next actions", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  const html = renderTemplateCustomizationStudioHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    templates: library.templates,
    model
  })

  assert.match(html, /id="readinessStatus"/)
  assert.match(html, /id="readinessScore"/)
  assert.match(html, /id="readinessChecks"/)
  assert.match(html, /id="readinessNextActions"/)
  assert.match(html, /nextActions/)
  assert.match(html, /status\.pass/)
  assert.match(html, /status\.warning/)
  assert.match(html, /status\.fail/)
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

test("template customization studio applies Bazaar prompt supplement only for Bazaar profiles", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "alpha-product"
  model.workflowName = "alpha-code-precheck"
  model.promptSupplement = ""

  const gitPreview = await previewWorkflowFromStudioModel(root, model)
  assert.equal(gitPreview.status, "ok", gitPreview.diagnostics.join("\n"))
  assert.doesNotMatch(gitPreview.workflowMarkdown, /プロジェクト固有補足[\s\S]*bzr --no-aliases/)

  model.vcsType = "bazaar"
  const bazaarPreview = await previewWorkflowFromStudioModel(root, model)
  assert.equal(bazaarPreview.status, "ok", bazaarPreview.diagnostics.join("\n"))
  assert.match(bazaarPreview.workflowMarkdown, /プロジェクト固有補足[\s\S]*bzr --no-aliases/)
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

test("template customization studio backs up existing generated files before overwriting", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "alpha-product"
  model.workflowName = "alpha-code-precheck"

  await fs.mkdir(path.join(root, ".bob", "template-profiles"), { recursive: true })
  await fs.mkdir(path.join(root, ".bob", "template-customizations"), { recursive: true })
  await fs.mkdir(path.join(root, ".bob", "workflows", "alpha-code-precheck"), { recursive: true })
  await fs.writeFile(path.join(root, ".bob", "template-profiles", "alpha-product.yaml"), "old profile\n", "utf8")
  await fs.writeFile(path.join(root, ".bob", "template-customizations", "alpha-code-precheck.yaml"), "old customization\n", "utf8")
  await fs.writeFile(path.join(root, ".bob", "workflows", "alpha-code-precheck", "WORKFLOW.md"), "old workflow\n", "utf8")

  const generated = await generateWorkflowFromStudioModel(root, model)

  assert.equal(generated.status, "ok", generated.diagnostics.join("\n"))
  assert.match(generated.backupPaths.projectProfilePath, /\.backup-/)
  assert.match(generated.backupPaths.customizationPath, /\.backup-/)
  assert.match(generated.backupPaths.workflowPath, /WORKFLOW\.backup-/)
  assert.equal(await fs.readFile(path.join(root, generated.backupPaths.projectProfilePath), "utf8"), "old profile\n")
  assert.equal(await fs.readFile(path.join(root, generated.backupPaths.customizationPath), "utf8"), "old customization\n")
  assert.equal(await fs.readFile(path.join(root, generated.backupPaths.workflowPath), "utf8"), "old workflow\n")
})

test("template customization studio rejects generated writes through symlink escapes", async (t) => {
  const root = await studioWorkspace()
  const outside = await tempRoot()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "escape-project"
  model.workflowName = "escape-workflow"

  await fs.mkdir(path.join(root, ".bob"), { recursive: true })
  try {
    await fs.symlink(outside, path.join(root, ".bob", "template-profiles"), "junction")
  } catch {
    t.skip("symlink creation is not available in this environment")
    return
  }

  const generated = await generateWorkflowFromStudioModel(root, model)

  assert.equal(generated.status, "error")
  assert.match(generated.diagnostics.join("\n"), /symlink escape/i)
  assert.equal(fsSync.existsSync(path.join(outside, "escape-project.yaml")), false)
})

test("Builder standard-template mode wires preview application and diff host messages", () => {
  const source = readSourceSet([
    "webview/workflowBuilderPanel.ts",
    "webview/workflowBuilderStandardTemplateClientScript.ts"
  ])

  for (const messageType of ["previewWorkflow", "applyStandardTemplate", "showWorkflowDiff"]) {
    assert.match(source, new RegExp(messageType))
  }
  assert.match(source, /previewWorkflowFromStudioModel/)
  assert.match(source, /loadAuthoringModelFromMarkdown/)
  assert.match(source, /vscode\.diff/)
})

test("template customization studio validates profile and customization and writes readiness reports", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "alpha-product"
  model.workflowName = "alpha-code-precheck"
  model.checklistPath = ".bob/process/checklists/alpha-code-precheck.yaml"
  model.uatEvidencePath = "docs/uat/evidence/alpha-product.md"
  await addReadinessFiles(root, model)

  const profile = validateProfileFromStudioModel(model)
  assert.equal(profile.status, "ok", profile.diagnostics.join("\n"))
  const customization = validateCustomizationFromStudioModel(model)
  assert.equal(customization.status, "ok", customization.diagnostics.join("\n"))

  const readiness = await checkReadinessFromStudioModel(root, model)
  assert.equal(readiness.status, "ok", readiness.diagnostics.join("\n"))
  assert.equal(readiness.readiness.status, "pass", readiness.readiness.nextActions.join("\n"))
  assert.equal(readiness.readinessJsonPath, ".bob/template-readiness/alpha-product/alpha-code-precheck-readiness.json")
  assert.equal(readiness.readinessMarkdownPath, ".bob/template-readiness/alpha-product/alpha-code-precheck-readiness.md")
  assert.ok(fsSync.existsSync(path.join(root, readiness.readinessJsonPath)))
  assert.ok(fsSync.existsSync(path.join(root, readiness.readinessMarkdownPath)))

  const report = yaml.load(await fs.readFile(path.join(root, readiness.readinessJsonPath), "utf8"))
  assert.equal(report.readiness.status, "pass")
  assert.equal(Array.isArray(report.readiness.checks), true)
})

test("template customization studio readiness warns when UAT evidence is absent", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "alpha-product"
  model.workflowName = "alpha-code-precheck"
  model.checklistPath = ".bob/process/checklists/alpha-code-precheck.yaml"
  model.uatEvidencePath = "docs/uat/evidence/alpha-product.md"
  await addReadinessFiles(root, model, { uatEvidence: false })

  const readiness = await checkReadinessFromStudioModel(root, model)
  assert.equal(readiness.status, "ok", readiness.diagnostics.join("\n"))
  assert.equal(readiness.readiness.status, "warning")
  assert.match(readiness.readiness.nextActions.join("\n"), /UAT 証跡がありません/)
})

test("readiness calculation is no-write until its latest-request commit", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "no-write-project"
  model.workflowName = "no-write-workflow"
  await addReadinessFiles(root, model)

  const calculated = await calculateReadinessFromStudioModel(root, model)
  assert.equal(calculated.status, "ok", calculated.diagnostics.join("\n"))
  assert.equal(fsSync.existsSync(path.join(root, calculated.readinessJsonPath)), false)
  assert.equal(fsSync.existsSync(path.join(root, calculated.readinessMarkdownPath)), false)

  const stale = await commitReadinessReportsFromStudioModel(root, calculated, { canCommit: () => false })
  assert.equal(stale.status, "stale")
  assert.equal(fsSync.existsSync(path.join(root, calculated.readinessJsonPath)), false)
  assert.equal(fsSync.existsSync(path.join(root, calculated.readinessMarkdownPath)), false)
})

test("readiness report pair rolls back together and rechecks generation at commit", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "transaction-project"
  model.workflowName = "transaction-workflow"
  await addReadinessFiles(root, model)
  const calculated = await calculateReadinessFromStudioModel(root, model)
  const jsonPath = path.join(root, calculated.readinessJsonPath)
  const markdownPath = path.join(root, calculated.readinessMarkdownPath)
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, "old json\n", "utf8")
  await fs.writeFile(markdownPath, "old markdown\n", "utf8")

  let commitChecks = 0
  const failed = await commitReadinessReportsFromStudioModel(root, calculated, {
    canCommit: () => { commitChecks += 1; return true },
    beforeReplace: (_targetPath, index) => {
      if (index === 1) throw new Error("simulated second-report failure")
    }
  })

  assert.equal(failed.status, "error")
  assert.ok(commitChecks >= 2)
  assert.equal(await fs.readFile(jsonPath, "utf8"), "old json\n")
  assert.equal(await fs.readFile(markdownPath, "utf8"), "old markdown\n")
})

test("a readiness request that becomes stale while waiting for the root lock never publishes a target", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "queued-stale-project"
  model.workflowName = "queued-stale-workflow"
  await addReadinessFiles(root, model)
  const calculated = await calculateReadinessFromStudioModel(root, model)
  const reportTargets = new Set([
    path.resolve(root, calculated.readinessJsonPath),
    path.resolve(root, calculated.readinessMarkdownPath)
  ])
  let enterBlocker
  const blockerEntered = new Promise((resolve) => { enterBlocker = resolve })
  let releaseBlocker
  const blockerReleased = new Promise((resolve) => { releaseBlocker = resolve })
  const blocker = writeWorkspaceFilesAtomically(root, [{
    relativePath: ".bob/root-lock-blocker.txt",
    text: "blocker\n"
  }], async () => {
    enterBlocker()
    await blockerReleased
  })
  await blockerEntered

  const originalRename = fs.rename
  const publications = []
  fs.rename = async (source, target, ...args) => {
    if (reportTargets.has(path.resolve(String(target))) && String(source).includes(".workflow-txn-")) {
      publications.push(path.resolve(String(target)))
    }
    return originalRename(source, target, ...args)
  }
  let fresh = true
  let committed
  try {
    const waiting = commitReadinessReportsFromStudioModel(root, calculated, { canCommit: () => fresh })
    fresh = false
    releaseBlocker()
    ;[committed] = await Promise.all([waiting, blocker])
  } finally {
    fs.rename = originalRename
    releaseBlocker()
    await blocker.catch(() => undefined)
  }

  assert.equal(committed.status, "stale")
  assert.deepEqual(publications, [])
  assert.equal(fsSync.existsSync(path.join(root, calculated.readinessJsonPath)), false)
  assert.equal(fsSync.existsSync(path.join(root, calculated.readinessMarkdownPath)), false)
})

for (const [failedIndex, label] of [[0, "first"], [1, "second"]]) {
  test(`a partially written ${label} readiness replacement restores both originals`, async (context) => {
    const root = await alternateWindowsWorkspacePath(await studioWorkspace(), context)
    const library = await listTemplateLibrary(root)
    const model = createDefaultStudioModel(library.templates[0])
    model.projectId = `partial-${label}-project`
    model.workflowName = `partial-${label}-workflow`
    await addReadinessFiles(root, model)
    const calculated = await calculateReadinessFromStudioModel(root, model)
    const targets = [
      path.join(root, calculated.readinessJsonPath),
      path.join(root, calculated.readinessMarkdownPath)
    ]
    await fs.mkdir(path.dirname(targets[0]), { recursive: true })
    await fs.writeFile(targets[0], "old json\n", "utf8")
    await fs.writeFile(targets[1], "old markdown\n", "utf8")
    const originalRename = fs.rename
    let injected = false
    fs.rename = async (source, target) => {
      if (!injected && String(source).includes(".workflow-txn-") && await isSamePhysicalTarget(target, targets[failedIndex])) {
        await originalRename(source, target)
        injected = true
        throw new Error(`simulated partial ${label} replacement`)
      }
      return originalRename(source, target)
    }

    let committed
    try {
      committed = await commitReadinessReportsFromStudioModel(root, calculated)
    } finally {
      fs.rename = originalRename
    }

    assert.equal(injected, true)
    assert.equal(committed.status, "error")
    assert.match(committed.diagnostics.join("\n"), new RegExp(`simulated partial ${label} replacement`))
    assert.equal(await fs.readFile(targets[0], "utf8"), "old json\n")
    assert.equal(await fs.readFile(targets[1], "utf8"), "old markdown\n")
  })
}

test("readiness report transaction rejects a destination parent swap without writing outside", async () => {
  const root = await studioWorkspace()
  const outside = await tempRoot()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "parent-swap-project"
  model.workflowName = "parent-swap-workflow"
  await addReadinessFiles(root, model)
  const calculated = await calculateReadinessFromStudioModel(root, model)
  const reportParent = path.dirname(path.join(root, calculated.readinessJsonPath))
  const parkedParent = `${reportParent}-parked`
  let swapped = false
  let outsideWriteObserved = false
  const reportNames = new Set([path.basename(calculated.readinessJsonPath), path.basename(calculated.readinessMarkdownPath)])
  const originalCopyFile = fs.copyFile
  fs.copyFile = async (source, target, ...args) => {
    const result = await originalCopyFile(source, target, ...args)
    if (reportNames.has(path.basename(String(target))) && fsSync.existsSync(path.join(outside, path.basename(String(target))))) outsideWriteObserved = true
    return result
  }

  let committed
  try {
    committed = await commitReadinessReportsFromStudioModel(root, calculated, {
      beforeReplace: async (_targetPath, index) => {
        if (swapped || index !== 0) return
        await fs.rename(reportParent, parkedParent)
        await fs.symlink(outside, reportParent, process.platform === "win32" ? "junction" : "dir")
        for (const name of await fs.readdir(parkedParent)) {
          if (name.includes(".tmp-")) await fs.copyFile(path.join(parkedParent, name), path.join(outside, name))
        }
        swapped = true
      }
    })
  } finally {
    fs.copyFile = originalCopyFile
  }

  assert.equal(swapped, true)
  assert.equal(committed.status, "error")
  assert.equal(outsideWriteObserved, false)
  assert.equal((await fs.readdir(outside)).some((name) => reportNames.has(name)), false)
})

test("overlapping readiness transactions serialize freshness and cannot tear the latest report pair", async () => {
  const root = await studioWorkspace()
  const library = await listTemplateLibrary(root)
  const model = createDefaultStudioModel(library.templates[0])
  model.projectId = "overlap-project"
  model.workflowName = "overlap-workflow"
  await addReadinessFiles(root, model)
  const firstCalculation = await calculateReadinessFromStudioModel(root, model)
  const latestCalculation = {
    ...firstCalculation,
    readiness: { ...firstCalculation.readiness, status: "warning", score: 17, nextActions: ["latest transaction"] }
  }
  let enterFirst
  const firstEntered = new Promise((resolve) => { enterFirst = resolve })
  let releaseFirst
  const firstReleased = new Promise((resolve) => { releaseFirst = resolve })
  let firstFresh = true
  const first = commitReadinessReportsFromStudioModel(root, firstCalculation, {
    canCommit: () => firstFresh,
    beforeReplace: async (_targetPath, index) => {
      if (index !== 1) return
      enterFirst()
      await firstReleased
    }
  })
  await firstEntered

  const latest = commitReadinessReportsFromStudioModel(root, latestCalculation)
  await Promise.race([latest, new Promise((resolve) => setTimeout(resolve, 25))])
  firstFresh = false
  releaseFirst()
  const [firstResult, latestResult] = await Promise.all([first, latest])

  assert.equal(firstResult.status, "stale")
  assert.equal(latestResult.status, "ok")
  const json = JSON.parse(await fs.readFile(path.join(root, latestCalculation.readinessJsonPath), "utf8"))
  const markdown = await fs.readFile(path.join(root, latestCalculation.readinessMarkdownPath), "utf8")
  assert.equal(json.readiness.score, 17)
  assert.match(markdown, /latest transaction/)
})

test("Builder standard-template mode wires validation readiness and report actions", () => {
  const source = readSourceSet([
    "webview/workflowBuilderPanel.ts",
    "webview/workflowBuilderStandardTemplateClientScript.ts"
  ])

  for (const messageType of ["validateProfile", "validateCustomization", "checkReadiness", "openReadinessReport"]) {
    assert.match(source, new RegExp(messageType))
  }
  assert.match(source, /validateProfileFromStudioModel/)
  assert.match(source, /validateCustomizationFromStudioModel/)
  assert.match(source, /calculateReadinessFromStudioModel/)
  assert.match(source, /commitReadinessReportsFromStudioModel/)
  assert.match(source, /readinessMarkdownPath/)
  assert.match(source, /showTextDocument/)
})
