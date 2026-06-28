import * as path from "path"
import { createHash } from "crypto"
import Ajv from "ajv"
import {
  CoreWorkflowDefinition,
  EngineStep,
  ParseWorkflowRequest,
  ParseWorkflowResult,
  WorkflowInputDefinition,
  WorkflowStepCompletionMode,
  WorkflowStepMessageMode,
  WorkflowTodoDefinition
} from "./model"

const yaml = require("js-yaml") as { load(text: string): unknown }

const ajv = new Ajv({ allErrors: true, strict: false })
const DEFAULT_MAX_RESULT_BYTES = 20_000

const failurePolicySchema = { enum: ["stop", "continue", "warn"] }

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
    menuLabel: { type: "string" },
    mode: { type: "string" },
    category: { type: "string" },
    todo: { type: "boolean" },
    todoRequired: { type: "boolean" },
    todoAsSteps: { type: "boolean" },
    stepCompletion: { enum: ["auto", "manual"] },
    stepMessage: { enum: ["full", "current", "silent", "step"] },
    autoApproval: { type: "boolean" },
    workspaceRequired: { type: "boolean" },
    hidden: { type: "boolean" },
    prompt: { type: "string" },
    command: { type: "string" },
    commandArgs: { type: "array" },
    todos: {
      type: "array",
      items: {
        anyOf: [
          { type: "string" },
          {
            type: "object",
            minProperties: 1,
            maxProperties: 1,
            additionalProperties: { type: "string" }
          }
        ]
      }
    },
    permissions: { type: "array", items: { type: "string" } },
    requires: {
      type: "object",
      properties: {
        workspace: { type: "boolean" },
        bob: {
          type: "object",
          properties: {
            minVersion: { type: "string" }
          },
          additionalProperties: false
        },
        files: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    },
    inputs: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["type"],
        properties: {
          type: { enum: ["string", "number", "boolean", "select"] },
          title: { type: "string" },
          required: { type: "boolean" },
          requiredWhen: { type: "string" },
          default: {},
          options: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      }
    },
    preflight: {
      type: "array",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string" },
          required: { type: "boolean" },
          checks: { type: "array", items: { type: "string" } },
          files: { type: "array", items: { type: "string" } },
          failurePolicy: failurePolicySchema
        },
        additionalProperties: false
      }
    },
    tools: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          purpose: { type: "string" },
          required: { type: "boolean" },
          outputKey: { type: "string" },
          inputSource: { type: "string" },
          failurePolicy: failurePolicySchema
        },
        additionalProperties: false
      }
    },
    guardrails: {
      type: "object",
      properties: {
        allowedCommands: { type: "array", items: { type: "string" } },
        deniedCommands: { type: "array", items: { type: "string" } },
        requireApproval: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              when: { type: "string" },
              message: { type: "string" }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "path"],
        properties: {
          id: { type: "string", minLength: 1 },
          producedBy: { type: "string" },
          path: { type: "string", minLength: 1 },
          schema: { type: "string" }
        },
        additionalProperties: false
      }
    },
    completion: {
      type: "object",
      properties: {
        summary: { type: "string" },
        includeArtifacts: { type: "boolean" },
        validateResult: { type: "boolean" },
        visualization: {
          type: "object",
          properties: {
            type: { type: "string" },
            enabled: { type: "boolean" }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
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
          sendResult: { type: "boolean" },
          completeOnSuccess: { type: "boolean" },
          includeState: { type: "array", items: { type: "string" } },
          maxResultBytes: { type: "number" },
          stateRequired: { type: "boolean" },
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

const knownV1TopLevelFields = new Set([
  "schemaVersion",
  "id",
  "name",
  "description",
  "title",
  "label",
  "menuLabel",
  "mode",
  "category",
  "permissions",
  "requires",
  "inputs",
  "preflight",
  "tools",
  "guardrails",
  "artifacts",
  "completion",
  "steps",
  "todo",
  "todoSource",
  "todoRequired",
  "todoAsSteps",
  "stepCompletion",
  "stepMessage",
  "todos",
  "autoApproval",
  "workspaceRequired",
  "hidden",
  "command",
  "commandArgs",
  "prompt"
])

export function parseWorkflowMarkdown(request: ParseWorkflowRequest): ParseWorkflowResult {
  const split = splitMarkdownFrontMatter(request.text)
  if (!split) return { ok: false, diagnostics: [`- fail: ${request.filePath}: missing YAML front matter.`] }

  let fields: Record<string, unknown>
  try {
    fields = asRecord(yaml.load(split.frontMatter))
  } catch (error) {
    return { ok: false, diagnostics: [`- fail: ${request.filePath}: invalid YAML: ${formatError(error)}`] }
  }

  if (fields.schemaVersion === "workflow-register/v1") return parseV1Workflow(request, fields, split.body, request.text)
  return parseLegacyWorkflow(request, fields, split.body)
}

function parseV1Workflow(request: ParseWorkflowRequest, fields: Record<string, unknown>, body: string, fullText: string): ParseWorkflowResult {
  const valid = validateV1(fields)
  const diagnostics = valid ? [] : formatValidationErrors(request.filePath)
  const warnings = unknownTopLevelWarnings(request.filePath, fields)
  const hasTypedSteps = Object.prototype.hasOwnProperty.call(fields, "steps")
  const steps = Array.isArray(fields.steps) ? fields.steps : []
  for (let index = 0; index < steps.length; index += 1) {
    const step = asRecord(steps[index])
    if (step.type === "command" && !step.action) {
      diagnostics.push(`- fail: ${request.filePath}: steps/${index}/action is required for command steps.`)
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics }

  const name = requiredString(fields, "name")
  const engineSteps = hasTypedSteps
    ? steps.map((step) => normalizeEngineStep(asRecord(step)))
    : legacyEngineStepsFromWorkflow(fields, body)
  const todos = workflowTodos(fields, body, engineSteps, hasTypedSteps)
  const todoEnabled = optionalBoolean(fields, "todo") ?? todos.length > 0
  const permissions = listField(fields, "permissions", todoEnabled ? ["read", "mcp", "skill", "todo"] : ["read", "mcp", "skill"])
  if (todoEnabled && !permissions.includes("todo")) permissions.push("todo")
  const prompt = optionalString(fields, "prompt") ?? body.trim()
  const workflow: CoreWorkflowDefinition = {
    id: optionalString(fields, "id") ?? `${request.sourceId}.${name}`,
    name,
    label: optionalString(fields, "label") ?? optionalString(fields, "title") ?? name,
    menuLabel: optionalString(fields, "menuLabel") ?? optionalString(fields, "label") ?? optionalString(fields, "title") ?? name,
    description: requiredString(fields, "description"),
    schemaVersion: "workflow-register/v1",
    definitionHash: `sha256:${createHash("sha256").update(fullText).digest("hex")}`,
    filePath: request.filePath,
    prompt,
    promptWithoutTodo: removeMarkdownStepSections(removeMarkdownSection(prompt, "Todo")).trim(),
    command: optionalString(fields, "command"),
    commandArgs: arrayField(fields, "commandArgs"),
    mode: optionalString(fields, "mode") ?? "agent",
    category: optionalString(fields, "category"),
    permissions,
    autoApprovalEnabled: optionalBoolean(fields, "autoApproval") ?? true,
    workspaceRequired: optionalBoolean(fields, "workspaceRequired") ?? true,
    hidden: optionalBoolean(fields, "hidden") ?? false,
    todoEnabled,
    todoRequired: optionalBoolean(fields, "todoRequired") ?? false,
    todoAsSteps: optionalBoolean(fields, "todoAsSteps") ?? (todoEnabled && todos.length > 0),
    stepCompletion: stepCompletion(fields, todoEnabled && todos.length > 0 ? "manual" : "auto"),
    stepMessage: stepMessage(fields, "current"),
    todos,
    inputs: normalizeInputs(asRecord(fields.inputs)),
    requires: normalizeRequires(asRecord(fields.requires)),
    preflight: normalizePreflight(fields.preflight),
    tools: normalizeTools(asRecord(fields.tools)),
    guardrails: normalizeGuardrails(asRecord(fields.guardrails)),
    artifacts: normalizeArtifacts(fields.artifacts),
    completion: normalizeCompletion(asRecord(fields.completion)),
    engineSteps
  }
  return { ok: true, workflow, diagnostics: [...warnings, `- ok: ${request.filePath}: ${workflow.id}; schemaVersion=workflow-register/v1; steps=${workflow.engineSteps.length}`] }
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
    menuLabel: optionalString(fields, "menuLabel") ?? optionalString(fields, "label") ?? optionalString(fields, "title") ?? name,
    description: description ?? "",
    schemaVersion: "legacy",
    filePath: request.filePath,
    prompt: optionalString(fields, "prompt") ?? body.trim(),
    promptWithoutTodo: removeMarkdownStepSections(removeMarkdownSection(optionalString(fields, "prompt") ?? body.trim(), "Todo")).trim(),
    command: optionalString(fields, "command"),
    commandArgs: arrayField(fields, "commandArgs"),
    mode: optionalString(fields, "mode") ?? "agent",
    category: optionalString(fields, "category"),
    permissions: listField(fields, "permissions", ["read", "mcp", "skill"]),
    autoApprovalEnabled: optionalBoolean(fields, "autoApproval") ?? true,
    workspaceRequired: optionalBoolean(fields, "workspaceRequired") ?? true,
    hidden: optionalBoolean(fields, "hidden") ?? false,
    todoEnabled: legacyStepsFromMarkdown(body).length > 0,
    todoRequired: optionalBoolean(fields, "todoRequired") ?? false,
    todoAsSteps: true,
    stepCompletion: stepCompletion(fields, "manual"),
    stepMessage: stepMessage(fields, "current"),
    todos: legacyTodosFromMarkdown(body),
    inputs: {},
    requires: {},
    preflight: [],
    tools: {},
    guardrails: {},
    artifacts: [],
    completion: {},
    engineSteps: legacyStepsFromMarkdown(body)
  }
  return { ok: true, workflow, diagnostics: [`- ok: ${request.filePath}: ${workflow.id}; schemaVersion=legacy; steps=${workflow.engineSteps.length}`] }
}

function unknownTopLevelWarnings(filePath: string, fields: Record<string, unknown>): string[] {
  return Object.keys(fields)
    .filter((key) => !knownV1TopLevelFields.has(key))
    .map((key) => `- warn: ${filePath}: unknown top-level field '${key}'.`)
}

function workflowTodos(fields: Record<string, unknown>, body: string, steps: EngineStep[], hasTypedSteps: boolean): WorkflowTodoDefinition[] {
  const yamlTodos = legacyTodosFromYamlList(fields.todos).map((todo) => ({ id: todo.id, title: todo.title, raw: `${todo.id}: ${todo.title}` }))
  if (yamlTodos.length > 0) return yamlTodos
  if (hasTypedSteps) return steps.map((step) => ({ id: step.id, title: step.title, raw: `${step.id}: ${step.title}` }))
  return legacyTodosFromMarkdown(body)
}

function legacyTodosFromMarkdown(body: string): WorkflowTodoDefinition[] {
  return extractLegacyTodos(body).map((todo) => ({ id: todo.id, title: todo.title, raw: `${todo.id}: ${todo.title}` }))
}

function stepCompletion(fields: Record<string, unknown>, fallback: WorkflowStepCompletionMode): WorkflowStepCompletionMode {
  const value = optionalString(fields, "stepCompletion")
  return value === "auto" || value === "manual" ? value : fallback
}

function stepMessage(fields: Record<string, unknown>, fallback: WorkflowStepMessageMode): WorkflowStepMessageMode {
  const value = optionalString(fields, "stepMessage")
  return value === "full" || value === "current" || value === "silent" || value === "step" ? value : fallback
}

function normalizeInputs(inputs: Record<string, unknown>): Record<string, WorkflowInputDefinition> {
  const output: Record<string, WorkflowInputDefinition> = {}
  for (const [key, value] of Object.entries(inputs)) {
    const record = asRecord(value)
    output[key] = {
      type: requiredString(record, "type") as WorkflowInputDefinition["type"],
      title: optionalString(record, "title"),
      required: optionalBoolean(record, "required"),
      requiredWhen: optionalString(record, "requiredWhen"),
      default: record.default,
      options: listField(record, "options")
    }
  }
  return output
}

function normalizeRequires(record: Record<string, unknown>) {
  const bob = asRecord(record.bob)
  return {
    workspace: optionalBoolean(record, "workspace"),
    bob: Object.keys(bob).length > 0 ? { minVersion: optionalString(bob, "minVersion") } : undefined,
    files: listField(record, "files")
  }
}

function normalizePreflight(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const record = asRecord(entry)
    return {
      id: requiredString(record, "id"),
      title: optionalString(record, "title"),
      required: optionalBoolean(record, "required"),
      checks: listField(record, "checks"),
      files: listField(record, "files"),
      failurePolicy: optionalString(record, "failurePolicy") as "stop" | "continue" | "warn" | undefined
    }
  })
}

function normalizeTools(tools: Record<string, unknown>) {
  const output: Record<string, { purpose?: string; required?: boolean; outputKey?: string; inputSource?: string; failurePolicy?: "stop" | "continue" | "warn" }> = {}
  for (const [key, value] of Object.entries(tools)) {
    const record = asRecord(value)
    output[key] = {
      purpose: optionalString(record, "purpose"),
      required: optionalBoolean(record, "required"),
      outputKey: optionalString(record, "outputKey"),
      inputSource: optionalString(record, "inputSource"),
      failurePolicy: optionalString(record, "failurePolicy") as "stop" | "continue" | "warn" | undefined
    }
  }
  return output
}

function normalizeGuardrails(record: Record<string, unknown>) {
  const approvals = Array.isArray(record.requireApproval) ? record.requireApproval : []
  return {
    allowedCommands: listField(record, "allowedCommands"),
    deniedCommands: listField(record, "deniedCommands"),
    requireApproval: approvals.map((approval) => {
      const approvalRecord = asRecord(approval)
      return {
        id: optionalString(approvalRecord, "id"),
        when: optionalString(approvalRecord, "when"),
        message: optionalString(approvalRecord, "message")
      }
    })
  }
}

function normalizeArtifacts(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const record = asRecord(entry)
    return {
      id: requiredString(record, "id"),
      producedBy: optionalString(record, "producedBy"),
      path: requiredString(record, "path"),
      schema: optionalString(record, "schema")
    }
  })
}

function normalizeCompletion(record: Record<string, unknown>) {
  const visualization = asRecord(record.visualization)
  return {
    summary: optionalString(record, "summary"),
    includeArtifacts: optionalBoolean(record, "includeArtifacts"),
    validateResult: optionalBoolean(record, "validateResult"),
    visualization: Object.keys(visualization).length > 0 ? {
      type: optionalString(visualization, "type"),
      enabled: optionalBoolean(visualization, "enabled")
    } : undefined
  }
}

function normalizeEngineStep(step: Record<string, unknown>): EngineStep {
  const base = {
    id: requiredString(step, "id"),
    title: requiredString(step, "title"),
    required: optionalBoolean(step, "required"),
    prompt: optionalString(step, "prompt"),
    sendResult: optionalBoolean(step, "sendResult"),
    completeOnSuccess: optionalBoolean(step, "completeOnSuccess"),
    includeState: listField(step, "includeState"),
    maxResultBytes: optionalNumber(step, "maxResultBytes"),
    stateRequired: optionalBoolean(step, "stateRequired")
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
  return legacyEngineStepsFromTodos(extractLegacyTodos(body), body)
}

function legacyEngineStepsFromWorkflow(fields: Record<string, unknown>, body: string): EngineStep[] {
  const todoSource = optionalString(fields, "todoSource") ?? "markdown"
  const yamlTodos = legacyTodosFromYamlList(fields.todos)
  const markdownTodos = todoSource === "markdown" ? extractLegacyTodos(body) : []
  const todos = markdownTodos.length > 0 ? markdownTodos : yamlTodos
  return legacyEngineStepsFromTodos(todos, body)
}

function legacyEngineStepsFromTodos(todos: Array<{ id: string; title: string }>, body: string): EngineStep[] {
  const stepConfigs = extractLegacyStepConfigs(body)
  return todos.map((todo) => {
    const legacyStep = stepConfigs[todo.id] ?? { config: {}, prompt: "" }
    const config = legacyStep.config
    const base = {
      id: todo.id,
      title: todo.title,
      prompt: legacyStep.prompt.trim() || undefined,
      required: optionalBoolean(config, "required"),
      sendResult: optionalBoolean(config, "sendResult"),
      completeOnSuccess: optionalBoolean(config, "completeOnSuccess"),
      includeState: listField(config, "includeState"),
      maxResultBytes: optionalNumber(config, "maxResultBytes"),
      stateRequired: optionalBoolean(config, "stateRequired")
    }
    const command = optionalString(config, "command")
    if (command) {
      return {
        ...base,
        type: "command" as const,
        action: {
          provider: command,
          args: config.commandArgs
        },
        resultKey: optionalString(config, "resultKey")
      }
    }
    if (config.runAgent === true) {
      const resultCommand = optionalString(config, "resultCommand")
      return {
        ...base,
        type: "agent" as const,
        resultKey: optionalString(config, "resultKey"),
        result: config.captureResult === true && resultCommand
          ? { source: "agent" as const, sinks: [{ type: "command" as const, command: resultCommand, args: listField(config, "resultCommandArgs") }] }
          : undefined
      }
    }
    return { ...base, type: "manual" as const }
  })
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

function legacyTodosFromYamlList(value: unknown): Array<{ id: string; title: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (typeof item === "string") return [parseLegacyTodoText(item, index + 1)]
    const record = asRecord(item)
    const entries = Object.entries(record)
    if (entries.length !== 1) return []
    const [id, title] = entries[0]
    return [{ id, title: String(title).trim() }]
  })
}

function parseLegacyTodoText(text: string, index: number): { id: string; title: string } {
  const trimmed = text.trim().replace(/^[-*]\s+\[[ xX]\]\s+/, "")
  const idMatch = trimmed.match(/^([A-Za-z0-9_.-]+):\s+(.+)$/)
  return idMatch ? { id: idMatch[1], title: idMatch[2].trim() } : { id: `todo-${index}`, title: trimmed }
}

function extractLegacyStepConfigs(body: string): Record<string, { config: Record<string, unknown>; prompt: string }> {
  const lines = body.split(/\r?\n/)
  const out: Record<string, { config: Record<string, unknown>; prompt: string }> = {}
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    const id = heading ? parseStepHeading(heading[2]) : undefined
    if (!heading || !id) continue
    const level = heading[1].length
    const section: string[] = []
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextHeading = lines[cursor].match(/^(#{1,6})\s+/)
      if (nextHeading && nextHeading[1].length <= level) break
      section.push(lines[cursor])
    }
    out[id] = extractWorkflowStepConfig(section.join("\n"))
  }
  return out
}

function parseStepHeading(text: string): string | undefined {
  return text.trim().match(/^Step(?::|\s+)\s*([A-Za-z0-9_.-]+)\s*$/i)?.[1]
}

function extractWorkflowStepConfig(markdown: string): { config: Record<string, unknown>; prompt: string } {
  const match = markdown.match(/(^|\r?\n)```workflow-step\s*\r?\n([\s\S]*?)\r?\n```\s*(?:\r?\n)?/i)
  if (!match) return { config: {}, prompt: markdown }
  const prompt = `${markdown.slice(0, match.index)}${markdown.slice((match.index ?? 0) + match[0].length)}`.trim()
  return { config: asRecord(yaml.load(match[2])), prompt }
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

function removeMarkdownSection(markdown: string, headingName: string): string {
  const lines = markdown.split(/\r?\n/)
  let start = -1
  let level = 0
  let end = lines.length
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (heading && heading[2].trim().toLowerCase() === headingName.toLowerCase()) {
      start = index
      level = heading[1].length
      break
    }
  }
  if (start < 0) return markdown
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+/)
    if (heading && heading[1].length <= level) {
      end = index
      break
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n")
}

function removeMarkdownStepSections(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const kept: string[] = []
  for (let index = 0; index < lines.length;) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!heading || !parseStepHeading(heading[2])) {
      kept.push(lines[index])
      index += 1
      continue
    }
    const level = heading[1].length
    index += 1
    while (index < lines.length) {
      const nextHeading = lines[index].match(/^(#{1,6})\s+/)
      if (nextHeading && nextHeading[1].length <= level) break
      index += 1
    }
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n")
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

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key]
  return Array.isArray(value) ? value : []
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
