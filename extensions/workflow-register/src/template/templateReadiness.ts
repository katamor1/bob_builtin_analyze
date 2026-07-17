import * as fs from "fs/promises"
import { load } from "js-yaml"
import { parseWorkflowMarkdown } from "../core/parser"
import { validateWorkspaceRelativePath, workspacePath } from "../process/processPaths"
import {
  generateCustomizedWorkflow
} from "./templateGenerator"
import {
  type ProjectProfile,
  type WorkflowCustomization,
  type WorkflowTemplate,
  validateProjectProfile,
  validateWorkflowCustomization,
  validateWorkflowTemplate
} from "./templateValidation"

export type ReadinessStatus = "pass" | "warning" | "fail"

export interface TemplateReadinessCheck {
  id: string
  title: string
  status: ReadinessStatus
  diagnostics: string[]
}

export interface TemplateReadiness {
  status: ReadinessStatus
  score: number
  checks: TemplateReadinessCheck[]
  nextActions: string[]
}

export interface TemplateReadinessOptions {
  workspaceRoot: string
  template: unknown
  projectProfile: unknown
  customization: unknown
  baseWorkflowText: string
  customizationPath: string
}

export async function checkTemplateReadiness(options: TemplateReadinessOptions): Promise<TemplateReadiness> {
  const checks: TemplateReadinessCheck[] = []
  const templateValidation = validateWorkflowTemplate(options.template)
  const profileValidation = validateProjectProfile(options.projectProfile)
  const customizationValidation = validateWorkflowCustomization(options.customization)
  checks.push(checkFromDiagnostics(
    "schemas",
    "テンプレート・プロジェクト情報・調整内容の形式",
    [
      ...templateValidation.diagnostics,
      ...profileValidation.diagnostics,
      ...customizationValidation.diagnostics
    ]
  ))

  const template = templateValidation.ok ? templateValidation.template : undefined
  const projectProfile = profileValidation.ok ? profileValidation.profile : undefined
  const customization = customizationValidation.ok ? customizationValidation.customization : undefined
  if (!template || !projectProfile || !customization) {
    return summarizeReadiness(checks)
  }

  const generated = generateCustomizedWorkflow({
    template,
    projectProfile,
    customization,
    baseWorkflowText: options.baseWorkflowText,
    customizationPath: options.customizationPath
  })
  checks.push(checkFromDiagnostics("generation", "生成したワークフローの契約", generated.diagnostics))
  if (!generated.ok) {
    return summarizeReadiness(checks)
  }

  const parsed = parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: generated.relativePath,
    text: generated.workflowMarkdown
  })
  checks.push(checkFromDiagnostics(
    "workflow-schema",
    "生成したワークフローが workflow-register/v1 に適合",
    parsed.ok ? [] : parsed.diagnostics
  ))

  const baseFields = splitFrontMatter(options.baseWorkflowText)
  const generatedFields = splitFrontMatter(generated.workflowMarkdown)
  if (!baseFields || !generatedFields) {
    checks.push({
      id: "front-matter",
      title: "ワークフローのフロントマターを確認可能",
      status: "fail",
      diagnostics: ["基準または生成済みワークフローのフロントマターを読み取れません"]
    })
    return summarizeReadiness(checks)
  }

  checks.push(checkNaming(generatedFields, customization))
  checks.push(await checkRequiredFiles(options.workspaceRoot, generatedFields, projectProfile))
  checks.push(checkGuardrails(baseFields, generatedFields))
  checks.push(checkArtifactPaths(generatedFields))
  checks.push(checkHumanGate(generatedFields))
  checks.push(checkTemplateMetadata(generatedFields, template, projectProfile, customization, generated.baseTemplateHash, options.customizationPath))
  checks.push(await checkUatEvidence(options.workspaceRoot, projectProfile))

  return summarizeReadiness(checks)
}

export function renderReadinessMarkdown(readiness: TemplateReadiness): string {
  const lines = [
    `# テンプレートの適用準備状況: ${readinessStatusLabel(readiness.status)}`,
    "",
    `スコア: ${readiness.score}`,
    "",
    "## 確認項目"
  ]
  for (const check of readiness.checks) {
    lines.push(`- ${readinessStatusLabel(check.status)}: ${check.id} - ${check.title}`)
    for (const diagnostic of check.diagnostics) {
      lines.push(`  - ${diagnostic}`)
    }
  }
  lines.push("", "## 次の対応")
  if (readiness.nextActions.length === 0) {
    lines.push("- 次の対応はありません。")
  } else {
    for (const action of readiness.nextActions) lines.push(`- ${action}`)
  }
  return `${lines.join("\n")}\n`
}

function checkNaming(fields: Record<string, unknown>, customization: WorkflowCustomization): TemplateReadinessCheck {
  const diagnostics: string[] = []
  if (fields.name !== customization.workflowName) {
    diagnostics.push(`生成したワークフロー名は ${customization.workflowName} である必要があります`)
  }
  return checkFromDiagnostics("naming", "ワークフロー名と保存先", diagnostics)
}

async function checkRequiredFiles(
  workspaceRoot: string,
  fields: Record<string, unknown>,
  projectProfile: ProjectProfile
): Promise<TemplateReadinessCheck> {
  const diagnostics: string[] = []
  const requires = isRecord(fields.requires) ? fields.requires : {}
  const files = Array.isArray(requires.files) ? requires.files.filter((item): item is string => typeof item === "string") : []
  if (!files.includes(projectProfile.paths.checklistPath)) files.push(projectProfile.paths.checklistPath)
  for (const file of unique(files)) {
    const pathResult = validateWorkspaceRelativePath(file)
    if (!pathResult.ok) {
      diagnostics.push(`必要なファイルがワークスペース外を指す危険なパスです: ${file}（${pathResult.reason}）`)
      continue
    }
    try {
      await fs.stat(workspacePath(workspaceRoot, pathResult.path))
    } catch {
      diagnostics.push(`必要なファイルがありません: ${pathResult.path}`)
    }
  }
  return checkFromDiagnostics("required-files", "必要なテンプレート・チェックリストファイルの有無", diagnostics)
}

function checkGuardrails(baseFields: Record<string, unknown>, generatedFields: Record<string, unknown>): TemplateReadinessCheck {
  const diagnostics: string[] = []
  if (JSON.stringify(baseFields.guardrails ?? {}) !== JSON.stringify(generatedFields.guardrails ?? {})) {
    diagnostics.push("調整中に安全制限が変更されました")
  }
  return checkFromDiagnostics("guardrails", "安全制限が固定されていること", diagnostics)
}

function checkArtifactPaths(fields: Record<string, unknown>): TemplateReadinessCheck {
  const diagnostics: string[] = []
  for (const pathValue of collectArtifactPaths(fields)) {
    const pathResult = validateWorkspaceRelativePath(pathValue)
    if (!pathResult.ok) {
      diagnostics.push(`成果物のパスがワークスペース外を指しています: ${pathValue}（${pathResult.reason}）`)
    }
  }
  return checkFromDiagnostics("artifact-paths", "成果物のパスがワークスペース相対であること", diagnostics)
}

function checkHumanGate(fields: Record<string, unknown>): TemplateReadinessCheck {
  const diagnostics: string[] = []
  const stepReview = isRecord(fields.stepReview) ? fields.stepReview : {}
  if (stepReview.enabled !== true) diagnostics.push("stepReview.enabled は true である必要があります")
  if (stepReview.requireAcceptBeforeNext !== true) diagnostics.push("stepReview.requireAcceptBeforeNext は true である必要があります")
  const steps = Array.isArray(fields.steps) ? fields.steps : []
  const hasHumanGate = steps.some((step) => isRecord(step) && step.type === "manual" && isRecord(step.approval))
  if (!hasHumanGate) diagnostics.push("手動承認ステップがありません")
  return checkFromDiagnostics("human-gate", "人による確認とステップレビューの有効化", diagnostics)
}

function checkTemplateMetadata(
  fields: Record<string, unknown>,
  template: WorkflowTemplate,
  projectProfile: ProjectProfile,
  customization: WorkflowCustomization,
  baseTemplateHash: string,
  customizationPath: string
): TemplateReadinessCheck {
  const diagnostics: string[] = []
  const metadata = isRecord(fields["x-bob-template"]) ? fields["x-bob-template"] : {}
  const expected: Record<string, string> = {
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    baseTemplateHash,
    projectId: projectProfile.projectId,
    customizationPath
  }
  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key] !== value) diagnostics.push(`x-bob-template.${key} は ${value} である必要があります`)
  }
  if (customization.baseTemplateHash !== baseTemplateHash) {
    diagnostics.push(`customization.baseTemplateHash は ${baseTemplateHash} である必要があります`)
  }
  return checkFromDiagnostics("template-metadata", "テンプレートのバージョン・ハッシュ情報の有無", diagnostics)
}

async function checkUatEvidence(workspaceRoot: string, projectProfile: ProjectProfile): Promise<TemplateReadinessCheck> {
  const evidencePath = projectProfile.paths.uatEvidencePath
  if (!evidencePath) {
    return { id: "uat-evidence", title: "UAT 証跡の有無", status: "warning", diagnostics: ["UAT 証跡のパスが設定されていません"] }
  }
  const pathResult = validateWorkspaceRelativePath(evidencePath)
  if (!pathResult.ok) {
    return { id: "uat-evidence", title: "UAT 証跡の有無", status: "fail", diagnostics: [`UAT 証跡のパスがワークスペース外を指しています: ${evidencePath}（${pathResult.reason}）`] }
  }
  try {
    await fs.stat(workspacePath(workspaceRoot, pathResult.path))
    return { id: "uat-evidence", title: "UAT 証跡の有無", status: "pass", diagnostics: [] }
  } catch {
    return { id: "uat-evidence", title: "UAT 証跡の有無", status: "warning", diagnostics: [`UAT 証跡がありません: ${pathResult.path}`] }
  }
}

function collectArtifactPaths(fields: Record<string, unknown>): string[] {
  const paths: string[] = []
  if (Array.isArray(fields.artifacts)) {
    for (const artifact of fields.artifacts) {
      if (isRecord(artifact) && typeof artifact.path === "string") paths.push(artifact.path)
    }
  }
  if (Array.isArray(fields.steps)) {
    for (const step of fields.steps) {
      if (!isRecord(step) || !isRecord(step.result) || !Array.isArray(step.result.sinks)) continue
      for (const sink of step.result.sinks) {
        if (isRecord(sink) && sink.type === "file" && typeof sink.path === "string") paths.push(sink.path)
      }
    }
  }
  return unique(paths)
}

function splitFrontMatter(markdown: string): Record<string, unknown> | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?[\s\S]*$/)
  if (!match) return undefined
  const fields = load(match[1])
  return isRecord(fields) ? fields : undefined
}

function checkFromDiagnostics(id: string, title: string, diagnostics: string[]): TemplateReadinessCheck {
  return { id, title, status: diagnostics.length > 0 ? "fail" : "pass", diagnostics }
}

function summarizeReadiness(checks: TemplateReadinessCheck[]): TemplateReadiness {
  const status: ReadinessStatus = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "pass"
  const score = checks.length === 0
    ? 0
    : Math.round((checks.reduce((sum, check) => sum + scoreForStatus(check.status), 0) / checks.length) * 100)
  const nextActions = checks.flatMap((check) => check.status === "pass"
    ? []
    : check.diagnostics.map((diagnostic) => `${check.id}: ${diagnostic}`))
  return { status, score, checks, nextActions }
}

function readinessStatusLabel(status: ReadinessStatus): string {
  if (status === "pass") return "合格"
  if (status === "warning") return "注意"
  return "要対応"
}

function scoreForStatus(status: ReadinessStatus): number {
  if (status === "pass") return 1
  if (status === "warning") return 0.5
  return 0
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
