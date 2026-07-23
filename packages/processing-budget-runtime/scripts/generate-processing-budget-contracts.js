#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { TextDecoder } = require("node:util")

const packageRoot = path.resolve(__dirname, "..")
const definitionPath = path.join(packageRoot, "contracts", "processing-budget-definition.v1.json")
const generatedSourcePath = path.join(packageRoot, "src", "generatedProcessingBudgetDefinition.ts")
const schemaPath = path.join(packageRoot, "schema", "processing-budget-profile.v1.schema.json")
const checkOnly = process.argv.slice(2).includes("--check")

function fail(message) {
  throw new Error(`processing budget contract generation failed: ${message}`)
}

function ownRecord(value, allowedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`)
  const output = Object.create(null)
  const allowed = new Set(allowedKeys)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) fail(`${label} contains unknown property ${String(key)}`)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) fail(`${label}.${key} must be enumerable own data`)
    output[key] = descriptor.value
  }
  return output
}

function nonEmptyString(value, label, pattern) {
  if (typeof value !== "string" || value.length === 0 || (pattern && !pattern.test(value))) fail(`${label} is invalid`)
  return value
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`)
  return value
}

function readDefinition() {
  const bytes = fs.readFileSync(definitionPath)
  let parsed
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (error) {
    fail(`definition is not canonical UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const record = ownRecord(parsed, [
    "schema_version",
    "profile_schema_version",
    "ledger_report_schema_version",
    "mebibyte_bytes",
    "categories"
  ], "definition")
  if (record.schema_version !== "processing-budget-definition/v1") fail("definition schema_version is invalid")
  const profileSchemaVersion = nonEmptyString(record.profile_schema_version, "profile_schema_version", /^processing-budget-profile\/v[1-9][0-9]*$/u)
  const ledgerReportSchemaVersion = nonEmptyString(record.ledger_report_schema_version, "ledger_report_schema_version", /^processing-budget-ledger-report\/v[1-9][0-9]*$/u)
  const mebibyteBytes = safeInteger(record.mebibyte_bytes, "mebibyte_bytes")
  if (mebibyteBytes !== 1_048_576) fail("mebibyte_bytes must be exactly 1,048,576")
  if (!Array.isArray(record.categories) || record.categories.length === 0 || record.categories.length > 64) fail("categories must contain 1..64 entries")

  const ids = new Set()
  const categories = record.categories.map((candidate, index) => {
    const category = ownRecord(candidate, ["id", "title", "unit", "default", "absolute_maximum", "aggregate_into"], `categories[${index}]`)
    const id = nonEmptyString(category.id, `categories[${index}].id`, /^[a-z][a-z0-9_]*$/u)
    if (ids.has(id)) fail(`duplicate category ${id}`)
    ids.add(id)
    const title = nonEmptyString(category.title, `categories[${index}].title`)
    if (category.unit !== "bytes" && category.unit !== "count") fail(`categories[${index}].unit is invalid`)
    const defaultLimit = safeInteger(category.default, `categories[${index}].default`)
    const absoluteMaximum = safeInteger(category.absolute_maximum, `categories[${index}].absolute_maximum`)
    if (defaultLimit > absoluteMaximum) fail(`categories[${index}] default exceeds absolute maximum`)
    const aggregateInto = category.aggregate_into === null
      ? null
      : nonEmptyString(category.aggregate_into, `categories[${index}].aggregate_into`, /^[a-z][a-z0-9_]*$/u)
    return Object.freeze({ id, title, unit: category.unit, defaultLimit, absoluteMaximum, aggregateInto })
  })

  const byId = new Map(categories.map((category) => [category.id, category]))
  for (const category of categories) {
    if (category.aggregateInto === null) continue
    const parent = byId.get(category.aggregateInto)
    if (!parent) fail(`${category.id} aggregates into unknown category ${category.aggregateInto}`)
    if (parent.unit !== category.unit) fail(`${category.id} aggregate unit does not match ${parent.id}`)
    if (category.defaultLimit > parent.defaultLimit) fail(`${category.id} default exceeds aggregate ${parent.id}`)
    if (category.absoluteMaximum > parent.absoluteMaximum) fail(`${category.id} maximum exceeds aggregate ${parent.id}`)
  }
  for (const category of categories) {
    const visited = new Set([category.id])
    let current = category
    while (current.aggregateInto !== null) {
      if (visited.has(current.aggregateInto)) fail(`aggregate cycle includes ${current.aggregateInto}`)
      visited.add(current.aggregateInto)
      current = byId.get(current.aggregateInto)
    }
  }

  return Object.freeze({ profileSchemaVersion, ledgerReportSchemaVersion, mebibyteBytes, categories: Object.freeze(categories) })
}

function tsString(value) {
  return JSON.stringify(value)
}

function renderSource(definition) {
  const categoryRows = definition.categories.map((category) => [
    "  {",
    `    id: ${tsString(category.id)},`,
    `    title: ${tsString(category.title)},`,
    `    unit: ${tsString(category.unit)},`,
    `    defaultLimit: ${category.defaultLimit},`,
    `    absoluteMaximum: ${category.absoluteMaximum},`,
    `    aggregateInto: ${category.aggregateInto === null ? "null" : tsString(category.aggregateInto)}`,
    "  }"
  ].join("\n")).join(",\n")
  const defaultRows = definition.categories.map((category) => `  ${category.id}: ${category.defaultLimit}`).join(",\n")
  const maximumRows = definition.categories.map((category) => `  ${category.id}: ${category.absoluteMaximum}`).join(",\n")
  return `// Generated by scripts/generate-processing-budget-contracts.js. Do not edit.\n\nexport const PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION = ${tsString(definition.profileSchemaVersion)} as const\nexport const PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION = ${tsString(definition.ledgerReportSchemaVersion)} as const\nexport const MEBIBYTE_BYTES = ${definition.mebibyteBytes} as const\n\nconst RAW_PROCESSING_BUDGET_DEFINITION = [\n${categoryRows}\n] as const\n\nexport type ProcessingBudgetCategory = typeof RAW_PROCESSING_BUDGET_DEFINITION[number]["id"]\nexport type ProcessingBudgetUnit = typeof RAW_PROCESSING_BUDGET_DEFINITION[number]["unit"]\n\nexport interface ProcessingBudgetCategoryDefinition {\n  readonly id: ProcessingBudgetCategory\n  readonly title: string\n  readonly unit: ProcessingBudgetUnit\n  readonly defaultLimit: number\n  readonly absoluteMaximum: number\n  readonly aggregateInto: ProcessingBudgetCategory | null\n}\n\nexport const PROCESSING_BUDGET_DEFINITION: readonly ProcessingBudgetCategoryDefinition[] = Object.freeze(\n  RAW_PROCESSING_BUDGET_DEFINITION.map((entry) => Object.freeze({ ...entry }))\n)\n\nexport const PROCESSING_BUDGET_CATEGORY_IDS: readonly ProcessingBudgetCategory[] = Object.freeze(\n  RAW_PROCESSING_BUDGET_DEFINITION.map((entry) => entry.id)\n)\n\nexport const PROCESSING_BUDGET_DEFINITION_BY_ID: Readonly<Record<ProcessingBudgetCategory, ProcessingBudgetCategoryDefinition>> = Object.freeze(\n  Object.fromEntries(PROCESSING_BUDGET_DEFINITION.map((entry) => [entry.id, entry])) as Record<ProcessingBudgetCategory, ProcessingBudgetCategoryDefinition>\n)\n\nexport const PROCESSING_BUDGET_DEFAULT_LIMITS: Readonly<Record<ProcessingBudgetCategory, number>> = Object.freeze({\n${defaultRows}\n})\n\nexport const PROCESSING_BUDGET_ABSOLUTE_MAXIMA: Readonly<Record<ProcessingBudgetCategory, number>> = Object.freeze({\n${maximumRows}\n})\n\n// VS Code manifests and JSON schemas must project maxima from this generated object.\nexport const PROCESSING_BUDGET_MANIFEST_MAXIMA = PROCESSING_BUDGET_ABSOLUTE_MAXIMA\n`
}

function renderSchema(definition) {
  const properties = Object.create(null)
  for (const category of definition.categories) {
    properties[category.id] = {
      type: "integer",
      minimum: 0,
      maximum: category.absoluteMaximum
    }
  }
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://local.schemas/processing-budget-profile.v1.schema.json",
    title: "Processing budget profile v1",
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "limits"],
    properties: {
      schema_version: { const: definition.profileSchemaVersion },
      limits: {
        type: "object",
        additionalProperties: false,
        required: definition.categories.map((category) => category.id),
        properties
      }
    }
  }
  return `${JSON.stringify(schema, null, 2)}\n`
}

function updateOrCheck(filePath, expected) {
  if (checkOnly) {
    let actual
    try {
      actual = fs.readFileSync(filePath, "utf8")
    } catch (error) {
      fail(`${path.relative(packageRoot, filePath)} is missing`)
    }
    if (actual !== expected) fail(`${path.relative(packageRoot, filePath)} is stale; run npm run contracts:generate`)
    return
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, expected, "utf8")
}

try {
  const definition = readDefinition()
  updateOrCheck(generatedSourcePath, renderSource(definition))
  updateOrCheck(schemaPath, renderSchema(definition))
  if (!checkOnly) process.stdout.write("generated processing budget TypeScript constants and profile schema\n")
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
