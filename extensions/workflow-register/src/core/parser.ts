import * as path from "path"
import Ajv from "ajv"
import {
  CoreWorkflowDefinition,
  EngineStep,
  ParseWorkflowRequest,
  ParseWorkflowResult,
  WorkflowInputDefinition
} from "./model"

const yaml = require("js-yaml") as { load(text: string): unknown }

const ajv = new Ajv({ allErrors: true, strict: false })

const v1Schema = {
  type: "object",
  required: ["name", "description"],
  properties: {
    schemaVersion: { const: "workflow-register/v1" },
    id: { type: "string" },
    name: { type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    description: { type: "string", minLength: 1 },
    title: { type: "string" },
    label: { type: "string" },
    permissions: { type: "array", items: { type: "string" } },
    inputs: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["type"],
        properties: {
          type: { enum: ["string", "number", "boolean", "select"] },
          title: { type: "string" },
          required: { type: "boolean" },
          default: {},
          options: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      }
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "type"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          type: { enum: ["command", "agent", "manual", "result"] },
          required: { type: "boolean" },
          action: {
            type: "object",
            required: ["provider"],
            properties: {
              provider: { type: "string", minLength: 1 },
              args: {}
            },
            additionalProperties: false
          },
          prompt: { type: "string" },
          resultKey: { type: "string" },
          result: {
            type: "object",
            required: ["source", "sinks"],
            properties: {
              source: { enum: ["state", "literal", "agent"] },
              stateKey: { type: "string" },
              text: { type: "string" },
              sinks: {
                type: "array",
                items: {
                  type: "object",
                  required: ["type"],
                  properties: {
                    type: { enum: ["command", "file"] },
                    command: { type: "string" },
                    args: { type: "array" },
                    path: { type: "string" },
                    encoding: { type: "string" }
                  },
                  additionalProperties: false
                }
              }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false,
        allOf: [
          {
            if: { properties: { type: { const: "command" } }, required: ["type"] },
            then: { required: ["action"] }
          },
          {
            if: { properties: { type: { const: "result" } }, required: ["type"] },
            then: { required: ["result"] }
          }
        ]
      }
    }
  },
  additionalProperties: true
}

const validateV1 = ajv.compile(v1Schema)

export function parseWorkflowMarkdown(request: ParseWorkflowRequest): ParseWorkflowResult {
  const split = splitMarkdownFrontMatter(request.text)
  if (!split) return { ok: false, diagnostics: [`- fail: ${request.filePath}: missing YAML front matter.`] }

  let fields: Record<string, unknown>
  try {
    fields = asRecord(yaml.load(split.frontMatter))
  } catch (error) {
    return { ok: false, diagnostics: [`- fail: ${request.filePath}: invalid YAML: ${formatError(error)}`] }
  }

  if (fields.schemaVersion === "workflow-register/v1") return parseV1Workflow(request, fields)
  return parseLegacyWorkflow(request, fields, split.body)
}

function parseV1Workflow(request: ParseWorkflowRequest, fields: Record<string, unknown>): ParseWorkflowResult {
  const valid = validateV1(fields)
  const diagnostics = valid ? [] : formatValidationErrors(request.filePath)
  const steps = Array.isArray(fields.steps) ? fields.steps : []
  for (let index = 0; index < steps.length; index += 1) {
    const step = asRecord(steps[index])
    if (step.type === "command" && !step.action) {
      diagnostics.push(`- fail: ${request.filePath}: steps/${index}/action is required for command steps.`)
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics }

  const name = requiredString(fields, "name")
  const workflow: CoreWorkflowDefinition = {
    id: optionalString(fields, "id") ?? `${request.sourceId}.${name}`,
    name,
    label: optionalString(fields, "label") ?? optionalString(fields, "title") ?? name,
    description: requiredString(fields, "description"),
    schemaVersion: "workflow-register/v1",
    permissions: listField(fields, "permissions", ["read", "mcp", "skill"]),
    inputs: normalizeInputs(asRecord(fields.inputs)),
    engineSteps: steps.map((step) => normalizeEngineStep(asRecord(step)))
  }
  return { ok: true, workflow, diagnostics: [`- ok: ${request.filePath}: ${workflow.id}; schemaVersion=workflow-register/v1; steps=${workflow.engineSteps.length}`] }
}

function parseLegacyWorkflow(request: ParseWorkflowRequest, fields: Record<string, unknown>, body: string): ParseWorkflowResult {
  const name = optionalString(fields, "name") ?? path.basename(path.dirname(request.filePath))
  const description = optionalString(fields, "description")
  const diagnostics: string[] = []
  if (!description) diagnostics.push(`- fail: ${request.filePath}: missing required field 'description'.`)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) diagnostics.push(`- fail: ${request.filePath}: field 'name' must contain only letters, numbers, dot, underscore, or hyphen and must not start with punctuation.`)
  if (diagnostics.length > 0) return { ok: false, diagnostics }

  const workflow: CoreWorkflowDefinition = {
    id: optionalString(fields, "id") ?? `${request.sourceId}.${name}`,
    name,
    label: optionalString(fields, "label") ?? optionalString(fields, "title") ?? name,
    description: description ?? "",
    schemaVersion: "legacy",
    permissions: listField(fields, "permissions", ["read", "mcp", "skill"]),
    inputs: {},
    engineSteps: legacyStepsFromMarkdown(body)
  }
  return { ok: true, workflow, diagnostics: [`- ok: ${request.filePath}: ${workflow.id}; schemaVersion=legacy; steps=${workflow.engineSteps.length}`] }
}

function normalizeInputs(inputs: Record<string, unknown>): Record<string, WorkflowInputDefinition> {
  const output: Record<string, WorkflowInputDefinition> = {}
  for (const [key, value] of Object.entries(inputs)) {
    const record = asRecord(value)
    output[key] = {
      type: requiredString(record, "type") as WorkflowInputDefinition["type"],
      title: optionalString(record, "title"),
      required: optionalBoolean(record, "required"),
      default: record.default,
      options: listField(record, "options")
    }
  }
  return output
}

function normalizeEngineStep(step: Record<string, unknown>): EngineStep {
  const base = {
    id: requiredString(step, "id"),
    title: requiredString(step, "title"),
    required: optionalBoolean(step, "required")
  }
  if (step.type === "command") {
    const action = asRecord(step.action)
    return { ...base, type: "command", action: { provider: requiredString(action, "provider"), args: action.args }, resultKey: optionalString(step, "resultKey") }
  }
  if (step.type === "agent") {
    return { ...base, type: "agent", prompt: optionalString(step, "prompt"), resultKey: optionalString(step, "resultKey"), result: step.result ? normalizeResult(step.result) : undefined }
  }
  if (step.type === "result") return { ...base, type: "result", result: normalizeResult(step.result) }
  return { ...base, type: "manual" }
}

function normalizeResult(value: unknown) {
  const record = asRecord(value)
  const sinks = Array.isArray(record.sinks) ? record.sinks.map((sink) => normalizeSink(asRecord(sink))) : []
  if (record.source === "state") return { source: "state" as const, stateKey: requiredString(record, "stateKey"), sinks }
  if (record.source === "literal") return { source: "literal" as const, text: requiredString(record, "text"), sinks }
  return { source: "agent" as const, sinks }
}

function normalizeSink(record: Record<string, unknown>) {
  if (record.type === "command") return { type: "command" as const, command: requiredString(record, "command"), args: listField(record, "args") }
  return { type: "file" as const, path: requiredString(record, "path"), encoding: optionalString(record, "encoding") as BufferEncoding | undefined }
}

function legacyStepsFromMarkdown(body: string): EngineStep[] {
  const todos = extractLegacyTodos(body)
  return todos.map((todo) => ({ id: todo.id, title: todo.title, type: "manual" as const }))
}

function extractLegacyTodos(body: string): Array<{ id: string; title: string }> {
  const section = extractMarkdownSection(body, "Todo")
  if (!section) return []
  return section.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)$/)
    if (!match) return []
    const text = match[1].trim()
    const idMatch = text.match(/^([A-Za-z0-9_.-]+):\s+(.+)$/)
    return idMatch ? [{ id: idMatch[1], title: idMatch[2].trim() }] : [{ id: `todo-${index + 1}`, title: text }]
  })
}

function extractMarkdownSection(markdown: string, headingName: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  let start = -1
  let level = 0
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (heading && heading[2].trim().toLowerCase() === headingName.toLowerCase()) {
      start = index + 1
      level = heading[1].length
      break
    }
  }
  if (start < 0) return undefined
  const body: string[] = []
  for (let index = start; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+/)
    if (heading && heading[1].length <= level) break
    body.push(lines[index])
  }
  return body.join("\n").trim()
}

function formatValidationErrors(filePath: string): string[] {
  return (validateV1.errors ?? []).map((error) => {
    const location = error.instancePath || "/"
    return `- fail: ${filePath}: ${location} ${error.message ?? "is invalid"}.`
  })
}

function splitMarkdownFrontMatter(text: string): { frontMatter: string; body: string } | undefined {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  return match ? { frontMatter: match[1], body: match[2] } : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record, key)
  if (!value) throw new Error(`Missing required string: ${key}`)
  return value
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] as boolean : undefined
}

function listField(record: Record<string, unknown>, key: string, fallback: string[] = []): string[] {
  const value = record[key]
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === "string" && value.trim()) return [value.trim()]
  return fallback
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
