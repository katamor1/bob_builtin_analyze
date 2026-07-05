import * as fs from "fs/promises"
import * as path from "path"
import { load } from "js-yaml"
import { workspacePath } from "../process/processPaths"
import {
  CUSTOMIZATION_SCHEMA_VERSION,
  PROJECT_PROFILE_SCHEMA_VERSION,
  type ProjectProfile,
  type WorkflowCustomization,
  type WorkflowTemplate,
  validateWorkflowTemplate
} from "./templateValidation"
import { hashTemplateWorkflow } from "./templateGenerator"

const TEMPLATE_LIBRARY_ROOT = ".bob/template-library"
const STANDARD_TEMPLATE_ID = "process-code-precheck"
const DEFAULT_CHECKLIST_PATH = ".bob/process/checklists/code-precheck.yaml"
const DEFAULT_ARTIFACT_ROOT = ".bob-process-runs/{{run.id}}/code-precheck"

export interface TemplateLibraryEntry {
  templatePath: string
  baseWorkflowPath: string
  templateId: string
  templateVersion: string
  displayName: string
  description: string
  supportedLanguages: string[]
  supportedVcs: string[]
  checklistPathInput?: string
  customizableInputDefaults: string[]
  inputDefaults: Record<string, string | number | boolean | null>
  baseTemplateHash: string
}

export interface TemplateLibraryListResult {
  status: "ok" | "error"
  diagnostics: string[]
  templates: TemplateLibraryEntry[]
}

export interface TemplateCustomizationStudioModel {
  templatePath: string
  templateId: string
  templateVersion: string
  baseTemplateHash: string
  projectId: string
  displayName: string
  targetLanguage: string
  vcsType: string
  vcsRoot: string
  checklistPath: string
  artifactOutputRoot: string
  uatEvidencePath: string
  workflowName: string
  title: string
  description: string
  inputDefaults: Record<string, string | number | boolean | null>
  promptSupplement: string
  requireHumanGate: true
  stepReviewPauseAfter: string
}

export async function listTemplateLibrary(workspaceRoot: string): Promise<TemplateLibraryListResult> {
  const diagnostics: string[] = []
  const entries: TemplateLibraryEntry[] = []
  const metadataPaths = await findMetadataFiles(workspaceRoot, TEMPLATE_LIBRARY_ROOT, diagnostics)
  for (const metadataPath of metadataPaths) {
    const entry = await loadTemplateEntry(workspaceRoot, metadataPath, diagnostics)
    if (entry) entries.push(entry)
  }
  entries.sort((left, right) => {
    if (left.templateId === STANDARD_TEMPLATE_ID) return -1
    if (right.templateId === STANDARD_TEMPLATE_ID) return 1
    return left.templateId.localeCompare(right.templateId)
  })
  return { status: diagnostics.length === 0 ? "ok" : "error", diagnostics, templates: entries }
}

export function createDefaultStudioModel(template: TemplateLibraryEntry): TemplateCustomizationStudioModel {
  return {
    templatePath: template.templatePath,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    baseTemplateHash: template.baseTemplateHash,
    projectId: "sample-project",
    displayName: "Sample Project",
    targetLanguage: template.supportedLanguages[0] ?? "c_cpp",
    vcsType: template.supportedVcs.includes("git") ? "git" : template.supportedVcs[0] ?? "none",
    vcsRoot: ".",
    checklistPath: defaultChecklistPath(template),
    artifactOutputRoot: DEFAULT_ARTIFACT_ROOT,
    uatEvidencePath: "docs/uat/evidence/sample-project.md",
    workflowName: template.templateId,
    title: template.displayName,
    description: template.description,
    inputDefaults: { ...template.inputDefaults },
    promptSupplement: "Bazaar 操作では bzr --no-aliases を使う。",
    requireHumanGate: true,
    stepReviewPauseAfter: "agentAndCommand"
  }
}

export function buildProjectProfileFromStudioModel(model: TemplateCustomizationStudioModel): ProjectProfile {
  const vcs: ProjectProfile["vcs"] = {
    type: model.vcsType,
    root: model.vcsRoot
  }
  if (model.vcsType === "bazaar" || model.vcsType === "bzr") {
    vcs.noAliases = true
  }
  return {
    schemaVersion: PROJECT_PROFILE_SCHEMA_VERSION,
    projectId: model.projectId,
    displayName: model.displayName,
    targetLanguage: model.targetLanguage,
    vcs,
    paths: {
      checklistPath: model.checklistPath,
      artifactOutputRoot: model.artifactOutputRoot,
      uatEvidencePath: model.uatEvidencePath
    },
    workflowPreferences: {
      requireHumanGate: true,
      stepReviewPauseAfter: model.stepReviewPauseAfter
    }
  }
}

export function buildCustomizationFromStudioModel(model: TemplateCustomizationStudioModel): WorkflowCustomization {
  return {
    schemaVersion: CUSTOMIZATION_SCHEMA_VERSION,
    customizationId: model.workflowName,
    templateId: model.templateId,
    templateVersion: model.templateVersion,
    baseTemplateHash: model.baseTemplateHash,
    projectId: model.projectId,
    workflowName: model.workflowName,
    customize: {
      title: model.title,
      description: model.description,
      inputs: { defaults: { ...model.inputDefaults } },
      checklist: { path: model.checklistPath },
      prompts: { supplement: model.promptSupplement },
      artifactOutputRoot: model.artifactOutputRoot,
      humanGate: {
        required: true,
        stepReviewPauseAfter: model.stepReviewPauseAfter
      }
    }
  }
}

export function profilePathForStudioModel(model: TemplateCustomizationStudioModel): string {
  return `.bob/template-profiles/${model.projectId}.yaml`
}

export function customizationPathForStudioModel(model: TemplateCustomizationStudioModel): string {
  return `.bob/template-customizations/${model.workflowName}.yaml`
}

async function findMetadataFiles(workspaceRoot: string, relativeRoot: string, diagnostics: string[]): Promise<string[]> {
  const root = workspacePath(workspaceRoot, relativeRoot)
  const files: string[] = []
  try {
    await walk(root, async (absolutePath) => {
      if (path.basename(absolutePath) !== "metadata.yaml") return
      files.push(relativePath(workspaceRoot, absolutePath))
    })
  } catch (error) {
    diagnostics.push(`template library cannot be read: ${errorMessage(error)}`)
  }
  return files
}

async function walk(directory: string, visit: (absolutePath: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const child = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(child, visit)
    } else if (entry.isFile()) {
      await visit(child)
    }
  }
}

async function loadTemplateEntry(
  workspaceRoot: string,
  templatePath: string,
  diagnostics: string[]
): Promise<TemplateLibraryEntry | undefined> {
  try {
    const metadataText = await fs.readFile(workspacePath(workspaceRoot, templatePath), "utf8")
    const metadata = load(metadataText)
    const validation = validateWorkflowTemplate(metadata)
    if (!validation.ok) {
      diagnostics.push(...validation.diagnostics.map((diagnostic) => `${templatePath}: ${diagnostic}`))
      return undefined
    }
    const template = validation.template
    const baseWorkflowText = await fs.readFile(workspacePath(workspaceRoot, template.baseWorkflowPath), "utf8")
    return toTemplateLibraryEntry(templatePath, template, baseWorkflowText)
  } catch (error) {
    diagnostics.push(`${templatePath}: ${errorMessage(error)}`)
    return undefined
  }
}

function toTemplateLibraryEntry(
  templatePath: string,
  template: WorkflowTemplate,
  baseWorkflowText: string
): TemplateLibraryEntry {
  const customizableInputDefaults = template.customizable.inputDefaults ?? []
  return {
    templatePath,
    baseWorkflowPath: template.baseWorkflowPath,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    displayName: template.displayName,
    description: template.description,
    supportedLanguages: [...template.supportedLanguages],
    supportedVcs: [...template.supportedVcs],
    checklistPathInput: template.customizable.checklistPathInput,
    customizableInputDefaults,
    inputDefaults: extractInputDefaults(baseWorkflowText, customizableInputDefaults),
    baseTemplateHash: hashTemplateWorkflow(baseWorkflowText)
  }
}

function extractInputDefaults(
  baseWorkflowText: string,
  inputIds: string[]
): Record<string, string | number | boolean | null> {
  const match = baseWorkflowText.match(/^---\r?\n([\s\S]*?)\r?\n---/u)
  if (!match) return {}
  const fields = load(match[1])
  if (!isRecord(fields) || !isRecord(fields.inputs)) return {}
  const defaults: Record<string, string | number | boolean | null> = {}
  for (const inputId of inputIds) {
    const input = fields.inputs[inputId]
    if (!isRecord(input) || input.default === undefined) continue
    if (["string", "number", "boolean"].includes(typeof input.default) || input.default === null) {
      defaults[inputId] = input.default as string | number | boolean | null
    }
  }
  return defaults
}

function defaultChecklistPath(template: TemplateLibraryEntry): string {
  if (template.checklistPathInput && template.inputDefaults[template.checklistPathInput] !== undefined) {
    return String(template.inputDefaults[template.checklistPathInput])
  }
  return DEFAULT_CHECKLIST_PATH
}

function relativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
