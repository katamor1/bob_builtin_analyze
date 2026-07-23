import { randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { authoringFileExpectationIsCurrent, captureAuthoringFileExpectation, commitAuthoringFileAtomically, withAuthoringFileTransactionLock } from "../core/authoring/workflowAuthoringFileTransaction"
import { applySkipResumeReadiness, buildSkipResumeReadinessPreview, SkipResumeReadinessPreview } from "../core/authoring/workflowSkipResumeReadinessPreview"
import { createAuthoringModelFromTemplate } from "../core/workflowAuthoringDefaults"
import { loadAuthoringModelFromMarkdown } from "../core/workflowAuthoringLoader"
import { WorkflowAuthoringModel, WorkflowAuthoringStep } from "../core/workflowAuthoringModel"
import { serializeAuthoringModelToMarkdown } from "../core/workflowAuthoringSerializer"
import { validateStepDraft } from "../core/workflowAuthoringStepDraftValidation"
import { validateWorkflowDocumentPath } from "../core/workflowDocumentPath"
import { WorkflowTemplateKind, workflowTemplates } from "../core/workflowScaffold"
import { formatWorkflowDiagnostics, validateWorkflowText } from "../core/workflowValidator"
import {
  calculateReadinessFromStudioModel,
  commitReadinessReportsFromStudioModel,
  createDefaultStudioModel,
  listTemplateLibrary,
  previewWorkflowFromStudioModel,
  validateCustomizationFromStudioModel,
  validateProfileFromStudioModel,
  type TemplateCustomizationStudioModel,
  type TemplateLibraryEntry
} from "../template/templateStudioModel"
import { renderWorkflowBuilderHtml } from "./workflowBuilderHtml"
import { renderWorkflowBuilderStandardTemplateHtml } from "./workflowBuilderStandardTemplateHtml"

export type WorkflowBuilderMode = "empty" | "standard-template" | "edit"

export interface WorkflowBuilderPanelOptions {
  extensionUri: vscode.Uri
  workflowRoot: string
  sourceId: string
  mode: WorkflowBuilderMode
  initialModel?: WorkflowAuthoringModel
  editingFilePath?: string
  originalText?: string
  focusStepId?: string
}

type WorkflowBuilderSession = {
  readonly token: symbol
  readonly options: Readonly<WorkflowBuilderPanelOptions>
  renderToken: string
  generation: number
  model: WorkflowAuthoringModel
  baselineModel: string
  baselineTemplateModel?: string
  clientDirtySources: Set<"authoring" | "stepDraft" | "template">
  focusStepId?: string
  originalText?: string
  templateModel?: TemplateCustomizationStudioModel
  standardTemplatePhase: "customize" | "authoring"
  templates: TemplateLibraryEntry[]
  lastReadinessMarkdownPath?: string
  requestRenderTokens: Map<number, string>
}

type WorkflowBuilderSaveContext = {
  readonly session: WorkflowBuilderSession
  readonly generation: number
  readonly model: WorkflowAuthoringModel
  readonly rendered: ReturnType<typeof serializeAuthoringModelToMarkdown>
  readonly targetUri: vscode.Uri
  readonly targetPath: string
}

export class WorkflowBuilderPanel {
  private static currentPanel: WorkflowBuilderPanel | undefined
  private readonly panel: vscode.WebviewPanel
  private readonly saveQueues = new Map<string, Promise<void>>()
  private disposables: vscode.Disposable[] = []
  private options: WorkflowBuilderPanelOptions
  private activeSession: WorkflowBuilderSession
  private disposed = false

  private constructor(options: WorkflowBuilderPanelOptions, initialModel: WorkflowAuthoringModel) {
    this.options = { ...options }
    this.activeSession = createSession(options, initialModel)
    this.panel = vscode.window.createWebviewPanel("workflowRegisterBuilder", "ワークフロー作成・編集", vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true })
    this.renderActiveSession()
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables)
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => this.onMessage(message).catch((error) => this.reportMessageError(error)),
      undefined,
      this.disposables
    )
  }

  static createOrShow(options: WorkflowBuilderPanelOptions): WorkflowBuilderPanel {
    const hasFreshState = options.initialModel !== undefined || options.originalText !== undefined
    const initialModel = options.initialModel ?? defaultAuthoringModel()
    if (WorkflowBuilderPanel.currentPanel) {
      const current = WorkflowBuilderPanel.currentPanel
      if (current.sameSessionRequest(options)) {
        current.reopenSameSession(options, initialModel, hasFreshState)
        return current
      }
      current.startSession(options, initialModel)
      if (options.mode === "standard-template") current.observeBackground(current.initializeStandardTemplateMode(current.activeSession))
      return current
    }
    const panel = new WorkflowBuilderPanel(options, initialModel)
    WorkflowBuilderPanel.currentPanel = panel
    if (options.mode === "standard-template") panel.observeBackground(panel.initializeStandardTemplateMode(panel.activeSession))
    return panel
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.activeSession.generation += 1
    this.observeCleanup(this.cleanupSessionPreviews(this.activeSession))
    if (WorkflowBuilderPanel.currentPanel === this) WorkflowBuilderPanel.currentPanel = undefined
    while (this.disposables.length) this.disposables.pop()?.dispose()
  }

  private async onMessage(value: unknown): Promise<void> {
    const message = requireMessage(value, this.activeSession.renderToken)
    if (message.type === "draftChanged") {
      const source = requireDraftSource(message.source)
      const dirty = requireOptionalBoolean(message.dirty)
      const request = this.beginRequest()
      if (dirty === false) request.session.clientDirtySources.delete(source)
      else request.session.clientDirtySources.add(source)
      return
    }
    if (message.type === "templateDraftChanged") {
      const model = requireStudioModel(message.model)
      const request = this.beginRequest()
      request.session.templateModel = model
      if (templateModelSnapshot(model) === request.session.baselineTemplateModel) request.session.clientDirtySources.delete("template")
      else request.session.clientDirtySources.add("template")
      return
    }
    if (message.type === "selectMode") return this.selectMode(requireMode(message.mode))
    if (message.type === "listTemplates") return this.listTemplates()
    if (message.type === "loadTemplate") return this.loadTemplate(requireOptionalString(message.templatePath))
    if (message.type === "validateProfile") return this.validateProfile(requireStudioModel(message.model))
    if (message.type === "validateCustomization") return this.validateCustomization(requireStudioModel(message.model))
    if (message.type === "previewWorkflow") return this.previewStandardTemplate(requireStudioModel(message.model))
    if (message.type === "applyStandardTemplate") return this.applyStandardTemplate(requireStudioModel(message.model))
    if (message.type === "checkReadiness") return this.checkReadiness(requireStudioModel(message.model))
    if (message.type === "openReadinessReport") return this.openReadinessReport()
    if (message.type === "showWorkflowDiff") return this.showStandardTemplateDiff(requireStudioModel(message.model))
    if (message.type === "resetTemplate") return this.resetTemplate(message)
    if (!["preview", "diff", "save", "previewSkipResumeReadiness", "applySkipResumeReadiness", "validateStepDraft"].includes(message.type)) {
      throw new Error(`unsupported Builder action: ${message.type}`)
    }

    const model = requireAuthoringModel(message.model)
    if (message.type === "previewSkipResumeReadiness") {
      const selectedStepIds = requireOptionalStringArray(message.selectedStepIds)
      const requestId = requireString(message.requestId)
      const request = this.beginRequest(model)
      return this.previewSkipResumeReadiness(request.session, request.generation, model, selectedStepIds, requestId)
    }
    if (message.type === "applySkipResumeReadiness") {
      const selectedStepIds = requireStringArray(message.selectedStepIds)
      const requestId = requireString(message.requestId)
      const request = this.beginRequest(model)
      return this.applySkipResumeReadiness(request.session, request.generation, model, selectedStepIds, requestId)
    }
    if (message.type === "validateStepDraft") {
      const stepIndex = requireIndex(message.stepIndex, model.steps.length)
      const draftStep = requireStep(message.draftStep, model, stepIndex)
      const request = this.beginRequest(model)
      return this.validateStepDraftMessage(request.session, request.generation, model, draftStep, stepIndex)
    }
    const request = this.beginRequest(model)
    if (message.type === "preview") return this.preview(request.session, request.generation, model)
    if (message.type === "diff") return this.showDiff(request.session, request.generation, model)
    if (message.type === "save") return this.enqueueSave(request.session, request.generation, model)
  }

  private beginRequest(model?: WorkflowAuthoringModel): { session: WorkflowBuilderSession; generation: number } {
    const session = this.activeSession
    const generation = this.advanceGeneration(session)
    if (model) canonicalizeModel(model, session.options.sourceId)
    return { session, generation }
  }

  private advanceGeneration(session: WorkflowBuilderSession): number {
    const generation = ++session.generation
    session.requestRenderTokens.set(generation, session.renderToken)
    while (session.requestRenderTokens.size > 256) {
      const oldest = session.requestRenderTokens.keys().next().value as number | undefined
      if (oldest === undefined) break
      session.requestRenderTokens.delete(oldest)
    }
    return generation
  }

  private isCurrent(session: WorkflowBuilderSession, generation?: number): boolean {
    return !this.disposed && this.activeSession.token === session.token && (generation === undefined || session.generation === generation)
  }

  private commitModel(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel, acknowledgeAuthoringDraft = false): boolean {
    if (!this.isCurrent(session, generation)) return false
    session.model = model
    if (acknowledgeAuthoringDraft) session.clientDirtySources.delete("authoring")
    return true
  }

  private sameSessionRequest(options: WorkflowBuilderPanelOptions): boolean {
    const current = this.activeSession.options
    return current.mode === options.mode
      && path.resolve(current.workflowRoot) === path.resolve(options.workflowRoot)
      && current.sourceId === options.sourceId
      && (current.editingFilePath ?? "") === (options.editingFilePath ?? "")
  }

  private reopenSameSession(options: WorkflowBuilderPanelOptions, initialModel: WorkflowAuthoringModel, hasFreshState: boolean): void {
    this.panel.reveal(vscode.ViewColumn.One)
    const session = this.activeSession
    if (this.isSessionDirty(session)) {
      const generation = this.advanceGeneration(session)
      session.focusStepId = options.focusStepId
      this.options = { ...this.options, focusStepId: options.focusStepId }
      if (options.focusStepId) this.observeBackground(this.post(session, { type: "focusStep", focusStepId: options.focusStepId }, generation))
      if (hasFreshState) {
        void Promise.resolve(vscode.window.showWarningMessage("未保存の編集内容があるため、外部から開かれた新しい内容は反映していません。保存、破棄、または再読み込みを選んでから開き直してください。"))
          .catch((error) => this.reportMessageError(error))
      }
      return
    }
    this.startSession(options, initialModel)
    if (options.mode === "standard-template") this.observeBackground(this.initializeStandardTemplateMode(this.activeSession))
  }

  private isSessionDirty(session: WorkflowBuilderSession): boolean {
    if (session.clientDirtySources.size > 0 || modelSnapshot(session.model) !== session.baselineModel) return true
    return session.standardTemplatePhase === "customize" && session.templateModel !== undefined
      && templateModelSnapshot(session.templateModel) !== session.baselineTemplateModel
  }

  private startSession(options: WorkflowBuilderPanelOptions, initialModel: WorkflowAuthoringModel): void {
    const previous = this.activeSession
    previous.generation += 1
    this.observeCleanup(this.cleanupSessionPreviews(previous))
    this.options = { ...options }
    this.activeSession = createSession(options, initialModel)
    this.panel.title = "ワークフロー作成・編集"
    this.panel.reveal(vscode.ViewColumn.One)
    this.renderActiveSession()
  }

  private async selectMode(mode: WorkflowBuilderMode): Promise<void> {
    if (mode === this.activeSession.options.mode) return
    if (mode === "edit") {
      await vscode.commands.executeCommand("workflowRegister.editWorkflowInBuilder")
      return
    }
    if (mode === "empty") {
      this.startSession({ ...this.options, mode: "empty", initialModel: undefined, editingFilePath: undefined, originalText: undefined, focusStepId: undefined }, defaultAuthoringModel())
      return
    }
    const current = this.activeSession
    const request = this.beginRequest()
    const library = await listTemplateLibrary(current.options.workflowRoot)
    if (!this.isCurrent(request.session, request.generation)) return
    if (library.templates.length === 0) {
      await vscode.window.showErrorMessage(`テンプレート一覧が空です。テンプレート定義を追加してください。${library.diagnostics.length ? ` 詳細: ${library.diagnostics.join("; ")}` : ""}`)
      return
    }
    const options: WorkflowBuilderPanelOptions = { ...current.options, mode: "standard-template", initialModel: undefined, editingFilePath: undefined, originalText: undefined, focusStepId: undefined }
    this.startSession(options, current.model)
    const session = this.activeSession
    session.templates = library.templates
    session.templateModel = createDefaultStudioModel(library.templates[0])
    session.baselineTemplateModel = templateModelSnapshot(session.templateModel)
    this.renderActiveSession(library.diagnostics)
  }

  private async initializeStandardTemplateMode(session: WorkflowBuilderSession): Promise<void> {
    const generation = ++session.generation
    const library = await listTemplateLibrary(session.options.workflowRoot)
    if (!this.isCurrent(session, generation)) return
    if (!library.templates.length) {
      await vscode.window.showErrorMessage("テンプレート一覧が空です。テンプレート定義を追加してください。")
      return
    }
    session.templates = library.templates
    session.templateModel = createDefaultStudioModel(library.templates[0])
    session.baselineTemplateModel = templateModelSnapshot(session.templateModel)
    this.renderActiveSession(library.diagnostics)
  }

  private async listTemplates(): Promise<void> {
    const request = this.beginRequest()
    const library = await listTemplateLibrary(request.session.options.workflowRoot)
    if (!this.isCurrent(request.session, request.generation)) return
    request.session.templates = library.templates
    await this.post(request.session, { type: "templateList", templates: library.templates, diagnostics: library.diagnostics }, request.generation)
  }

  private async loadTemplate(templatePath?: string): Promise<void> {
    const session = this.activeSession
    const template = session.templates.find((candidate) => candidate.templatePath === templatePath) ?? session.templates[0]
    if (!template) throw new Error("template library is empty")
    session.generation += 1
    session.templateModel = createDefaultStudioModel(template)
    session.baselineTemplateModel = templateModelSnapshot(session.templateModel)
    session.clientDirtySources.clear()
    this.renderActiveSession()
  }

  private async validateProfile(model: TemplateCustomizationStudioModel): Promise<void> {
    const request = this.beginRequest()
    const result = validateProfileFromStudioModel(model)
    if (!this.isCurrent(request.session, request.generation)) return
    request.session.templateModel = model
    await this.post(request.session, { type: "diagnostics", scope: "profile", result }, request.generation)
  }

  private async validateCustomization(model: TemplateCustomizationStudioModel): Promise<void> {
    const request = this.beginRequest()
    const result = validateCustomizationFromStudioModel(model)
    if (!this.isCurrent(request.session, request.generation)) return
    request.session.templateModel = model
    await this.post(request.session, { type: "diagnostics", scope: "customization", result }, request.generation)
  }

  private async previewStandardTemplate(model: TemplateCustomizationStudioModel): Promise<void> {
    const request = this.beginRequest()
    const result = await previewWorkflowFromStudioModel(request.session.options.workflowRoot, model)
    if (!this.isCurrent(request.session, request.generation)) return
    request.session.templateModel = model
    await this.post(request.session, { type: "previewResult", status: result.status, markdown: result.workflowMarkdown ?? "", diagnostics: result.diagnostics, filePath: result.relativePath ?? "" }, request.generation)
  }

  private async applyStandardTemplate(model: TemplateCustomizationStudioModel): Promise<void> {
    const request = this.beginRequest()
    const generated = await this.authoringModelFromStandardTemplate(request.session, request.generation, model)
    if (!generated || !this.isCurrent(request.session, request.generation)) return
    request.session.templateModel = model
    request.session.model = generated
    request.session.clientDirtySources.clear()
    request.session.standardTemplatePhase = "authoring"
    request.session.generation += 1
    this.renderActiveSession()
  }

  private async authoringModelFromStandardTemplate(session: WorkflowBuilderSession, generation: number, model: TemplateCustomizationStudioModel): Promise<WorkflowAuthoringModel | undefined> {
    const result = await previewWorkflowFromStudioModel(session.options.workflowRoot, model)
    if (result.status !== "ok") {
      if (this.isCurrent(session, generation)) {
        await this.post(session, { type: "previewResult", status: result.status, markdown: result.workflowMarkdown ?? "", diagnostics: result.diagnostics, filePath: result.relativePath ?? "" }, generation)
        await vscode.window.showErrorMessage(`標準テンプレートを Builder に反映できませんでした。詳細: ${result.diagnostics.join("; ")}`)
      }
      return undefined
    }
    const loaded = loadAuthoringModelFromMarkdown({ sourceId: session.options.sourceId, filePath: result.relativePath, text: result.workflowMarkdown })
    canonicalizeModel(loaded.model, session.options.sourceId)
    return loaded.model
  }

  private async showStandardTemplateDiff(model: TemplateCustomizationStudioModel): Promise<void> {
    const request = this.beginRequest()
    const generated = await this.authoringModelFromStandardTemplate(request.session, request.generation, model)
    if (!generated || !this.isCurrent(request.session, request.generation)) return
    request.session.templateModel = model
    await this.showDiff(request.session, request.generation, generated)
  }

  private async checkReadiness(model: TemplateCustomizationStudioModel): Promise<void> {
    const request = this.beginRequest()
    const calculated = await calculateReadinessFromStudioModel(request.session.options.workflowRoot, model)
    if (calculated.status !== "ok" || !this.isCurrent(request.session, request.generation)) {
      if (this.isCurrent(request.session, request.generation)) await this.post(request.session, { type: "readinessResult", ...calculated }, request.generation)
      return
    }
    const committed = await commitReadinessReportsFromStudioModel(request.session.options.workflowRoot, calculated, {
      canCommit: () => this.isCurrent(request.session, request.generation)
    })
    if (committed.status !== "ok" || !this.isCurrent(request.session, request.generation)) {
      if (committed.status === "error" && this.isCurrent(request.session, request.generation)) {
        await this.post(request.session, { type: "readinessResult", ...calculated, status: "error", diagnostics: committed.diagnostics }, request.generation)
      }
      return
    }
    request.session.templateModel = model
    request.session.lastReadinessMarkdownPath = calculated.readinessMarkdownPath
    await this.post(request.session, { type: "readinessResult", ...calculated }, request.generation)
  }

  private async openReadinessReport(): Promise<void> {
    const session = this.activeSession
    const relativePath = session.lastReadinessMarkdownPath
    if (!relativePath) {
      await vscode.window.showInformationMessage("適用準備レポートはまだありません。先に適用準備状況を確認してください。")
      return
    }
    const reportUri = vscode.Uri.joinPath(vscode.Uri.file(session.options.workflowRoot), ...relativePath.split("/"))
    if (!(await exists(reportUri))) {
      await vscode.window.showErrorMessage(`適用準備レポートが見つかりません: ${relativePath}`)
      return
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(reportUri), { preview: false })
  }

  private async resetTemplate(message: Record<string, unknown>): Promise<void> {
    const name = requireString(message.name)
    const title = requireOptionalString(message.title)
    const description = requireString(message.description)
    const template = requireTemplateKind(message.template)
    const model = createAuthoringModelFromTemplate({ name, title, description, template })
    const request = this.beginRequest(model)
    if (!this.commitModel(request.session, request.generation, model, true)) return
    await this.post(request.session, { type: "model", model, editMode: request.session.options.mode === "edit", filePath: request.session.options.editingFilePath ?? "", focusStepId: request.session.focusStepId ?? "" }, request.generation)
  }

  private enqueueSave(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel): Promise<void> {
    const rendered = serializeAuthoringModelToMarkdown(model)
    const targetUri = this.targetUri(rendered.filePath, session.options)
    const targetPath = this.displayPathForUri(targetUri, rendered.filePath, session.options)
    const context: WorkflowBuilderSaveContext = { session, generation, model, rendered, targetUri, targetPath }
    const queueKey = normalizedPathKey(targetUri.fsPath)
    const previous = this.saveQueues.get(queueKey) ?? Promise.resolve()
    const save = previous.catch(() => undefined).then(() => withAuthoringFileTransactionLock(
      session.options.workflowRoot,
      targetPath,
      () => this.save(context)
    ))
    let tail: Promise<void>
    const clear = (): void => { if (this.saveQueues.get(queueKey) === tail) this.saveQueues.delete(queueKey) }
    tail = save.then(clear, clear)
    this.saveQueues.set(queueKey, tail)
    return save
  }

  private async preview(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel): Promise<void> {
    const rendered = serializeAuthoringModelToMarkdown(model)
    const targetUri = this.targetUri(rendered.filePath, session.options)
    const filePath = this.displayPathForUri(targetUri, rendered.filePath, session.options)
    const validation = validateWorkflowText({ sourceId: session.options.sourceId, filePath, text: rendered.markdown })
    if (!this.isCurrent(session, generation)) return
    await this.post(session, { type: "previewResult", markdown: rendered.markdown, ok: validation.ok, diagnostics: formatWorkflowDiagnostics(validation), filePath }, generation)
    this.commitModel(session, generation, model, true)
  }

  private async previewSkipResumeReadiness(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel, selectedStepIds: string[] | undefined, requestId: string): Promise<void> {
    const result = buildSkipResumeReadinessPreview(model, selectedStepIds, { sourceId: session.options.sourceId })
    if (!this.isCurrent(session, generation)) return
    await this.post(session, { type: "skipResumeReadinessPreviewResult", requestId, ...this.skipResumeReadinessPreviewPayload(result) }, generation)
    this.commitModel(session, generation, model)
  }

  private async applySkipResumeReadiness(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel, selectedStepIds: string[], requestId: string): Promise<void> {
    const result = applySkipResumeReadiness(model, selectedStepIds, { sourceId: session.options.sourceId })
    if (!result.ok || !result.model) {
      if (this.commitModel(session, generation, model)) await this.post(session, { type: "skipResumeReadinessPreviewResult", requestId, ...this.skipResumeReadinessPreviewPayload(result) }, generation)
      return
    }
    canonicalizeModel(result.model, session.options.sourceId)
    if (!this.commitModel(session, generation, result.model)) return
    await this.post(session, { type: "skipResumeReadinessApplied", requestId, model: result.model, preview: this.skipResumeReadinessPreviewPayload(result) }, generation)
  }

  private skipResumeReadinessPreviewPayload(preview: SkipResumeReadinessPreview): Record<string, unknown> {
    return { ok: preview.ok, candidates: preview.candidates, blockingIssues: preview.blockingIssues, changes: preview.changes, selectedStepIds: preview.selectedStepIds, beforeMarkdown: preview.beforeMarkdown, afterMarkdown: preview.afterMarkdown, diagnostics: formatWorkflowDiagnostics({ ok: preview.ok, diagnostics: preview.diagnostics }), filePath: preview.filePath }
  }

  private async validateStepDraftMessage(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel, draftStep: WorkflowAuthoringStep, stepIndex: number): Promise<void> {
    const originalStep = model.steps[stepIndex]
    if (!originalStep) throw new Error("stepIndex is outside model.steps")
    const stepValidation = validateStepDraft({ model, originalStep, draftStep, stepIndex })
    const draftModel = { ...model, steps: model.steps.map((step, index) => index === stepIndex ? draftStep : step) }
    const rendered = serializeAuthoringModelToMarkdown(draftModel)
    const targetUri = this.targetUri(rendered.filePath, session.options)
    const filePath = this.displayPathForUri(targetUri, rendered.filePath, session.options)
    const workflowValidation = validateWorkflowText({ sourceId: session.options.sourceId, filePath, text: rendered.markdown })
    if (!this.isCurrent(session, generation)) return
    await this.post(session, { type: "stepDraftValidationResult", stepIndex, stepValidation, workflowValidation: { ok: workflowValidation.ok, diagnostics: formatWorkflowDiagnostics(workflowValidation), filePath, markdown: rendered.markdown } }, generation)
    this.commitModel(session, generation, model)
  }

  private async showDiff(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel): Promise<void> {
    const rendered = serializeAuthoringModelToMarkdown(model)
    const targetUri = this.targetUri(rendered.filePath, session.options)
    const savePathValidation = validateWorkflowDocumentPath({ workspaceRoot: session.options.workflowRoot, filePath: targetUri.fsPath })
    if (!savePathValidation.ok) throw new Error(savePathValidation.reason)
    await assertPhysicalPathInside(session.options.workflowRoot, targetUri.fsPath)
    if (!(await exists(targetUri))) {
      if (this.commitModel(session, generation, model, true)) await vscode.window.showInformationMessage("既存の WORKFLOW.md がないため差分は表示できません。")
      return
    }
    const targetExpectation = await captureAuthoringFileExpectation(
      session.options.workflowRoot,
      this.displayPathForUri(targetUri, rendered.filePath, session.options),
      await fs.readFile(targetUri.fsPath)
    )
    const previewDocument = await vscode.workspace.openTextDocument({ language: "markdown", content: rendered.markdown })
    if (!this.isCurrent(session, generation)) return
    if (!(await authoringFileExpectationIsCurrent(session.options.workflowRoot, targetExpectation))) return
    if (!this.isCurrent(session, generation)) return
    await vscode.commands.executeCommand("vscode.diff", targetUri, previewDocument.uri, `ワークフロー編集プレビュー: ${this.displayPathForUri(targetUri, rendered.filePath, session.options)}`)
    this.commitModel(session, generation, model, true)
  }

  private async cleanupSessionPreviews(_session: WorkflowBuilderSession): Promise<void> {
    // Diff previews are untitled in-memory documents and never create owned files.
  }

  private async save(context: WorkflowBuilderSaveContext): Promise<void> {
    const { rendered, session, targetPath, targetUri, model } = context
    const options = session.options
    if (!this.isCurrent(session)) return
    const savePathValidation = validateWorkflowDocumentPath({ workspaceRoot: options.workflowRoot, filePath: targetUri.fsPath })
    if (!savePathValidation.ok) {
      await vscode.window.showErrorMessage(`ワークスペース内の .bob/workflows/*/WORKFLOW.md にのみ保存できます: ${savePathValidation.reason}`)
      return
    }
    try {
      await assertPhysicalPathInside(options.workflowRoot, targetUri.fsPath)
    } catch (error) {
      await vscode.window.showErrorMessage(`保存先がワークスペースの外部を参照しています: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    const validation = validateWorkflowText({ sourceId: options.sourceId, filePath: targetPath, text: rendered.markdown })
    if (!validation.ok) {
      await this.post(session, { type: "previewResult", markdown: rendered.markdown, ok: false, diagnostics: formatWorkflowDiagnostics(validation), filePath: targetPath }, context.generation)
      if (this.isCurrent(session, context.generation)) await vscode.window.showErrorMessage("ワークフローの検証に失敗しました。")
      return
    }
    if (!this.isCurrent(session, context.generation)) return
    if (options.mode === "edit" && targetPath !== rendered.filePath) {
      const proceed = await vscode.window.showWarningMessage(`保存先 '${targetPath}' を更新します。続行しますか？`, { modal: true }, "続行")
      if (!this.isCurrent(session, context.generation) || proceed !== "続行") { this.commitModel(session, context.generation, model); return }
    }
    if (!this.isCurrent(session, context.generation)) return
    const dir = vscode.Uri.file(path.dirname(targetUri.fsPath))
    await vscode.workspace.fs.createDirectory(dir)
    try {
      await assertPhysicalPathInside(options.workflowRoot, targetUri.fsPath)
    } catch (error) {
      await vscode.window.showErrorMessage(`保存先ディレクトリがワークスペースの外部を参照しています: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (!this.isCurrent(session, context.generation)) return
    const targetExists = await exists(targetUri)
    if (!this.isCurrent(session, context.generation)) return
    let commitExpectedBytes: Uint8Array | undefined
    if (targetExists) {
      const existingBytes = await vscode.workspace.fs.readFile(targetUri)
      if (!this.isCurrent(session, context.generation)) return
      if (sameBytes(existingBytes, new TextEncoder().encode(rendered.markdown))) {
        this.recordSavedBaseline(session, context.generation, model, rendered.markdown)
        this.commitModel(session, context.generation, model, true)
        return
      }
      if (options.mode === "edit" && session.originalText !== undefined && new TextDecoder().decode(existingBytes) !== session.originalText) {
        await vscode.window.showWarningMessage(`${targetPath} は画面外で変更されました。開き直すか再読み込みしてから保存してください。`)
        return
      }
      const label = options.mode === "edit" ? "変更を反映" : "上書き"
      const overwrite = await vscode.window.showWarningMessage(`${targetPath} は既に存在します。バックアップを作成してから「${label}」を実行しますか？`, { modal: true }, label)
      if (!this.isCurrent(session, context.generation) || overwrite !== label) { this.commitModel(session, context.generation, model); return }
      commitExpectedBytes = existingBytes
    } else if (options.mode === "edit") {
      const create = await vscode.window.showWarningMessage(`${targetPath} は存在しません。新しく作成しますか？`, { modal: true }, "作成")
      if (!this.isCurrent(session, context.generation) || create !== "作成") { this.commitModel(session, context.generation, model); return }
      if (await exists(targetUri)) {
        if (this.isCurrent(session, context.generation)) await vscode.window.showWarningMessage(`${targetPath} は作成確認中に画面外で作成されました。再読み込みしてから保存してください。`)
        return
      }
    }
    if (!this.isCurrent(session, context.generation)) return
    let expectation
    try {
      expectation = await captureAuthoringFileExpectation(options.workflowRoot, targetPath, commitExpectedBytes)
    } catch {
      if (this.isCurrent(session, context.generation)) await vscode.window.showWarningMessage(`${targetPath} は保存直前に変更されました。再読み込みしてから保存してください。`)
      return
    }
    let committed: "committed" | "changed" | "stale"
    committed = await commitAuthoringFileAtomically(options.workflowRoot, expectation, new TextEncoder().encode(rendered.markdown), {
      canCommit: () => this.isCurrent(session, context.generation),
      createPersistentBackup: commitExpectedBytes !== undefined
    })
    if (committed !== "committed") {
      if (committed !== "stale" && this.isCurrent(session, context.generation)) await vscode.window.showWarningMessage(`${targetPath} は保存直前に変更されました。再読み込みしてから保存してください。`)
      return
    }
    this.recordSavedBaseline(session, context.generation, model, rendered.markdown)
    this.commitModel(session, context.generation, model, true)
    await vscode.commands.executeCommand("workflowRegister.reload")
    if (!this.isCurrent(session, context.generation)) return
    this.options.originalText = rendered.markdown
    const document = await vscode.workspace.openTextDocument(targetUri)
    if (!this.isCurrent(session, context.generation)) return
    await vscode.window.showTextDocument(document, { preview: false })
    if (!this.isCurrent(session, context.generation)) return
    await this.post(session, { type: "saved", filePath: targetPath }, context.generation)
    if (this.isCurrent(session, context.generation)) await vscode.window.showInformationMessage(`${targetPath} を保存しました。`)
  }

  private targetUri(renderedFilePath: string, options: Readonly<WorkflowBuilderPanelOptions>): vscode.Uri {
    if (options.mode === "edit" && options.editingFilePath) return vscode.Uri.file(options.editingFilePath)
    return vscode.Uri.joinPath(vscode.Uri.file(options.workflowRoot), ...renderedFilePath.split("/"))
  }

  private displayPathForUri(uri: vscode.Uri, fallback: string, options: Readonly<WorkflowBuilderPanelOptions>): string {
    const relative = path.relative(options.workflowRoot, uri.fsPath).replace(/\\/g, "/")
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : fallback
  }

  private renderActiveSession(diagnostics: string[] = []): void {
    const session = this.activeSession
    session.renderToken = randomUUID()
    if (session.options.mode === "standard-template" && session.standardTemplatePhase === "customize" && (!session.templateModel || !session.templates.length)) {
      this.panel.webview.html = renderStandardTemplateLoadingHtml(this.panel.webview.cspSource)
      return
    }
    if (session.options.mode === "standard-template" && session.standardTemplatePhase === "customize" && session.templateModel && session.templates.length) {
      this.panel.webview.html = renderWorkflowBuilderStandardTemplateHtml({ cspSource: this.panel.webview.cspSource, nonce: getNonce(), templates: session.templates, model: session.templateModel, diagnostics, sessionToken: session.renderToken })
      return
    }
    const isEditMode = session.options.mode === "edit"
    this.panel.webview.html = renderWorkflowBuilderHtml({
      cspSource: this.panel.webview.cspSource,
      initialModel: session.model,
      isEditMode,
      focusStepId: session.focusStepId,
      mode: session.options.mode,
      sessionToken: session.renderToken,
      modeNote: isEditMode ? "既存の WORKFLOW.md を編集します。" : session.options.mode === "standard-template" ? "標準テンプレートから生成した内容を保存前に編集できます。" : "空のワークフローから作成します。",
      nonce: getNonce(),
      templateOptions: workflowTemplates.map((template) => ({ id: template.id, label: template.label, description: template.description }))
    })
  }

  private recordSavedBaseline(session: WorkflowBuilderSession, generation: number, model: WorkflowAuthoringModel, markdown: string): void {
    session.originalText = markdown
    session.baselineModel = modelSnapshot(model)
    if (this.isCurrent(session, generation)) session.clientDirtySources.delete("authoring")
  }

  private async post(session: WorkflowBuilderSession, message: Record<string, unknown>, generation: number): Promise<void> {
    if (!this.isCurrent(session)) return
    const renderToken = session.requestRenderTokens.get(generation)
    if (!renderToken) return
    session.requestRenderTokens.delete(generation)
    await this.panel.webview.postMessage({ ...message, sessionToken: renderToken, generation })
  }

  private async reportMessageError(error: unknown): Promise<void> {
    if (this.disposed) return
    try {
      await vscode.window.showErrorMessage(`ワークフロー作成・編集の操作を処理できませんでした: ${error instanceof Error ? error.message : String(error)}`)
    } catch (reportError) {
      console.error("Workflow Builder error notification failed", reportError)
    }
  }

  private observeBackground(task: Promise<unknown>): void {
    void task.catch((error) => this.reportMessageError(error))
  }

  private observeCleanup(task: Promise<unknown>): void {
    void task.catch((error) => {
      const detail = error instanceof Error ? error.message : String(error)
      void Promise.resolve(vscode.window.showErrorMessage(`ワークフロー作成・編集のプレビュー一時ファイルを削除できませんでした: ${detail}`))
        .catch((reportError) => console.error("Workflow Builder preview cleanup error", reportError))
    })
  }
}

function defaultAuthoringModel(): WorkflowAuthoringModel {
  return createAuthoringModelFromTemplate({ name: "new-workflow", title: "New Workflow", description: "Run New Workflow.", template: "simple-agent" })
}

function renderStandardTemplateLoadingHtml(cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ワークフロー作成・編集</title>
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 24px; }
button { padding: 6px 10px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
button:disabled { opacity: 0.65; }
.loading { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<h1>ワークフロー作成・編集</h1>
<nav aria-label="作成モード">
  <button disabled>空のワークフロー</button>
  <button class="active" disabled aria-current="page">標準テンプレートから作成</button>
  <button disabled>既存ワークフローを編集</button>
</nav>
<p class="loading" role="status">標準テンプレートを読み込んでいます…</p>
</body>
</html>`
}

function createSession(options: WorkflowBuilderPanelOptions, model: WorkflowAuthoringModel): WorkflowBuilderSession {
  const snapshot = Object.freeze({ ...options })
  return { token: Symbol("workflowBuilderSession"), options: snapshot, renderToken: randomUUID(), generation: 0, model, baselineModel: modelSnapshot(model), clientDirtySources: new Set(), focusStepId: snapshot.focusStepId, originalText: snapshot.originalText, standardTemplatePhase: "customize", templates: [], requestRenderTokens: new Map() }
}

function modelSnapshot(model: WorkflowAuthoringModel): string {
  return serializeAuthoringModelToMarkdown(model).markdown
}

function templateModelSnapshot(model: TemplateCustomizationStudioModel): string {
  return JSON.stringify(model)
}

function canonicalizeModel(model: WorkflowAuthoringModel, sourceId = "workflow-register"): void {
  const rendered = serializeAuthoringModelToMarkdown(model)
  const validation = validateWorkflowText({ sourceId, filePath: rendered.filePath, text: rendered.markdown })
  if (!validation.ok) throw new Error(formatWorkflowDiagnostics(validation).join("; "))
}

function requireMessage(value: unknown, expectedToken: string): Record<string, unknown> & { type: string } {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("malformed Builder message")
  if (value.sessionToken !== expectedToken) throw new Error("stale Builder page")
  if (!WORKFLOW_BUILDER_ACTIONS.has(value.type)) throw new Error(`unsupported Builder action: ${value.type}`)
  return value as Record<string, unknown> & { type: string }
}

const WORKFLOW_BUILDER_ACTIONS = new Set([
  "selectMode", "listTemplates", "loadTemplate", "validateProfile", "validateCustomization",
  "previewWorkflow", "applyStandardTemplate", "checkReadiness", "openReadinessReport",
  "showWorkflowDiff", "resetTemplate", "preview", "diff", "save",
  "previewSkipResumeReadiness", "applySkipResumeReadiness", "validateStepDraft",
  "draftChanged", "templateDraftChanged"
])

function requireAuthoringModel(value: unknown): WorkflowAuthoringModel {
  if (!isRecord(value) || !isRecord(value.metadata) || !Array.isArray(value.steps) || !Array.isArray(value.inputs) || !Array.isArray(value.artifacts)) throw new Error("malformed authoring model")
  const model = value as unknown as WorkflowAuthoringModel
  canonicalizeModel(model)
  return model
}

function requireStudioModel(value: unknown): TemplateCustomizationStudioModel {
  if (!isRecord(value) || !isRecord(value.inputDefaults)) throw new Error("malformed standard-template model")
  for (const key of ["templatePath", "templateId", "templateVersion", "baseTemplateHash", "projectId", "displayName", "targetLanguage", "vcsType", "vcsRoot", "checklistPath", "artifactOutputRoot", "uatEvidencePath", "workflowName", "title", "description", "promptSupplement", "stepReviewPauseAfter"]) {
    if (typeof value[key] !== "string") throw new Error(`malformed standard-template model: ${key}`)
  }
  return value as unknown as TemplateCustomizationStudioModel
}

function requireMode(value: unknown): WorkflowBuilderMode {
  if (value === "empty" || value === "standard-template" || value === "edit") return value
  throw new Error("unknown Builder mode")
}

function requireString(value: unknown): string { if (typeof value !== "string") throw new Error("expected string"); return value }
function requireOptionalString(value: unknown): string | undefined { if (value === undefined) return undefined; return requireString(value) }
function requireOptionalBoolean(value: unknown): boolean | undefined { if (value === undefined || typeof value === "boolean") return value; throw new Error("expected boolean") }
function requireDraftSource(value: unknown): "authoring" | "stepDraft" { if (value === undefined || value === "authoring") return "authoring"; if (value === "stepDraft") return "stepDraft"; throw new Error("unknown Builder draft source") }
function requireStringArray(value: unknown): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error("expected string array"); return value }
function requireOptionalStringArray(value: unknown): string[] | undefined { return value === undefined ? undefined : requireStringArray(value) }
function requireIndex(value: unknown, upperBound: number): number { if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= upperBound) throw new Error("step index is outside model.steps"); return value as number }
function requireStep(value: unknown, model: WorkflowAuthoringModel, stepIndex: number): WorkflowAuthoringStep {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") throw new Error("malformed step draft")
  const step = value as unknown as WorkflowAuthoringStep
  try {
    serializeAuthoringModelToMarkdown({ ...model, steps: model.steps.map((candidate, index) => index === stepIndex ? step : candidate) })
  } catch {
    throw new Error("malformed step draft")
  }
  return step
}
function requireTemplateKind(value: unknown): WorkflowTemplateKind { if (workflowTemplates.some((item) => item.id === value)) return value as WorkflowTemplateKind; throw new Error("不明なワークフローテンプレートです") }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }

async function exists(uri: vscode.Uri): Promise<boolean> { try { await vscode.workspace.fs.stat(uri); return true } catch { return false } }

async function assertPhysicalPathInside(workspaceRoot: string, targetPath: string): Promise<void> {
  const [rootPhysical, targetPhysical] = await Promise.all([fs.realpath(workspaceRoot), realpathNearestExisting(targetPath)])
  const relative = path.relative(rootPhysical, targetPhysical)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("symlink escape outside workspace")
}

async function realpathNearestExisting(targetPath: string): Promise<string> {
  let current = path.resolve(targetPath)
  while (true) {
    try { await fs.lstat(current); return fs.realpath(current) } catch {
      const parent = path.dirname(current)
      if (parent === current) throw new Error(`no existing parent for ${targetPath}`)
      current = parent
    }
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean { if (left.byteLength !== right.byteLength) return false; for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false; return true }
function normalizedPathKey(filePath: string): string { const normalized = path.normalize(filePath); return process.platform === "win32" ? normalized.toLowerCase() : normalized }
function getNonce(): string { const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let text = ""; for (let index = 0; index < 32; index += 1) text += chars.charAt(Math.floor(Math.random() * chars.length)); return text }
