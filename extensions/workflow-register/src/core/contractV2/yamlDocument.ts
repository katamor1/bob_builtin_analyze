import { CORE_SCHEMA, loadAll as loadAllYaml } from "js-yaml"
import { TextDecoder as NodeTextDecoder, types as utilTypes } from "node:util"

import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic
} from "./diagnostics"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

export const WORKFLOW_CONTRACT_V2_YAML_POLICY = "workflow-contract-yaml/v2" as const

export type ParseWorkflowContractV2YamlResult =
  | {
      readonly ok: true
      readonly document: JsonValue
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

const cloneJsonValue = cloneAndFreezeJsonValue
const createDiagnostic = createWorkflowContractV2Diagnostic
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const reflectOwnKeys = Reflect.ownKeys
const bufferFrom = Buffer.from.bind(Buffer) as (value: Uint8Array) => Buffer
const bufferIsBuffer = Buffer.isBuffer
const isProxy = utilTypes.isProxy
const TextDecoderConstructor = NodeTextDecoder
const yamlLoadAll = loadAllYaml
const yamlCoreSchema = CORE_SCHEMA
const ordinaryObjectPrototype = Object.prototype

const SUCCESS_DIAGNOSTICS = objectFreeze([]) as readonly []
const INPUT_KEYS = objectFreeze(["bytes", "path"] as const)
const TIMESTAMP_PATTERN = /(?:^\s*|[:\[,]\s*|^\s*-\s+)\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[ \t]*(?:Z|[+-]\d{2}(?::?\d{2})?))?)?(?=\s*(?:$|[,}\]]))/u
const TIMESTAMP_KEY_PATTERN = /(?:^\s*|[{,]\s*)\d{4}-\d{2}-\d{2}(?:[Tt ][^:]*)?\s*:/u
const NON_FINITE_PATTERN = /(?:^\s*|[:\[,]\s*|^\s*-\s+)[+-]?\.(?:inf|nan)(?=\s*(?:$|[,}\]]))/iu
const NON_FINITE_KEY_PATTERN = /(?:^\s*|[{,]\s*)[+-]?\.(?:inf|nan)\s*:/iu
const NEGATIVE_ZERO_PATTERN = /(?:^|:\s*|-\s+|[\[,{]\s*)-0(?:(?:\.0+)?(?:e[+-]?0+)?|[box]0+)(?=\s*(?:$|[,}\]]))/iu
const NON_STRING_KEY_PATTERN = /(?:^|[{,]\s*|^\s*-?\s*)(?:~|null|true|false|[-+]?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[-+]?\d+)?)\s*:/iu
const COMPLEX_KEY_PATTERN = /(?:^|[{,])\s*(?:\[[^\]\n]*\]|\{[^}\n]*\})\s*:/u
const TOKEN_PATTERN = /(?:^|[\s[{,])(?:[&*][^\s,\[\]{}]+|![^\s,\[\]{}]*)/u
const MERGE_KEY_PATTERN = /(?:^|[{,]\s*|^\s*)<<\s*:/u

export function parseWorkflowContractV2Yaml(input: {
  readonly bytes: Buffer
  readonly path: string
}): ParseWorkflowContractV2YamlResult {
  let path = "workflow.yaml"
  try {
    const snapshot = snapshotInput(input)
    path = snapshot.path
    const bytes = snapshot.bytes
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return failure(path, "Workflow YAML must not contain a UTF-8 byte-order mark.")
    }
    if (bytes.includes(0x0d)) {
      return failure(path, "Workflow YAML must use LF line endings.")
    }

    let text: string
    try {
      text = new TextDecoderConstructor("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      return failure(path, "Workflow YAML must be valid UTF-8.")
    }

    const lexicalFailure = scanForbiddenYaml(text)
    if (lexicalFailure !== undefined) return failure(path, lexicalFailure)

    const documents: unknown[] = []
    try {
      yamlLoadAll(text, (document) => documents.push(document), {
        json: false,
        schema: yamlCoreSchema
      })
    } catch {
      return failure(path, "Workflow YAML could not be composed as one strict document.")
    }
    if (documents.length !== 1 || documents[0] === undefined) {
      return failure(path, "Workflow YAML must contain exactly one document.")
    }

    let document: JsonValue
    try {
      document = cloneJsonValue(documents[0])
    } catch {
      return failure(path, "Workflow YAML must construct strict JSON data.")
    }
    return objectFreeze({ ok: true, document, diagnostics: SUCCESS_DIAGNOSTICS })
  } catch {
    return failure(path, "Workflow YAML input is invalid.")
  }
}

function snapshotInput(input: unknown): { readonly bytes: Buffer; readonly path: string } {
  if (input === null || typeof input !== "object" || isProxy(input)) throw new TypeError("invalid input")
  const prototype = objectGetPrototypeOf(input)
  if (prototype !== ordinaryObjectPrototype && prototype !== null) throw new TypeError("invalid input")
  const descriptors = objectGetOwnPropertyDescriptors(input)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== INPUT_KEYS.length || keys.some((key) => typeof key !== "string" || !INPUT_KEYS.includes(key as never))) {
    throw new TypeError("invalid input")
  }
  const bytes = dataValue(descriptors, "bytes")
  const path = dataValue(descriptors, "path")
  if (!bufferIsBuffer(bytes) || typeof path !== "string") throw new TypeError("invalid input")
  return objectFreeze({ bytes: bufferFrom(bytes), path })
}

function dataValue(descriptors: PropertyDescriptorMap, key: string): unknown {
  const descriptor = descriptors[key]
  if (descriptor === undefined || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) {
    throw new TypeError("invalid input")
  }
  return descriptor.value
}

function scanForbiddenYaml(text: string): string | undefined {
  const lines = text.split("\n")
  let blockIndent: number | undefined
  const quoteState = { single: false, double: false, escaped: false }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const indent = leadingSpaces(line)
    if (blockIndent !== undefined) {
      if (line.trim().length === 0 || indent > blockIndent) continue
      blockIndent = undefined
    }

    const visible = maskQuotedAndComment(line, quoteState)
    if (/^\s*\?/u.test(visible)) return "Workflow YAML must use string mapping keys."
    if (COMPLEX_KEY_PATTERN.test(visible)) return "Workflow YAML must use string mapping keys."
    if (NON_STRING_KEY_PATTERN.test(visible)) return "Workflow YAML must use string mapping keys."
    if (MERGE_KEY_PATTERN.test(visible)) return "Workflow YAML merge keys are forbidden."
    if (TOKEN_PATTERN.test(visible)) return "Workflow YAML anchors, aliases, and tags are forbidden."
    if (TIMESTAMP_PATTERN.test(visible) || TIMESTAMP_KEY_PATTERN.test(visible)) {
      return "Workflow YAML timestamp scalars are forbidden."
    }
    if (NON_FINITE_PATTERN.test(visible) || NON_FINITE_KEY_PATTERN.test(visible)) {
      return "Workflow YAML non-finite numbers are forbidden."
    }
    if (NEGATIVE_ZERO_PATTERN.test(visible)) return "Workflow YAML negative-zero numbers are forbidden."

    if (/[:\-]\s*[>|][+-]?\d?\s*$/u.test(visible)) blockIndent = indent
  }
  return undefined
}

function maskQuotedAndComment(
  line: string,
  state: { single: boolean; double: boolean; escaped: boolean }
): string {
  let output = ""
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (state.double) {
      output += " "
      if (state.escaped) state.escaped = false
      else if (character === "\\") state.escaped = true
      else if (character === "\"") state.double = false
      continue
    }
    if (state.single) {
      output += " "
      if (character === "'" && line[index + 1] === "'") {
        output += " "
        index += 1
      } else if (character === "'") {
        state.single = false
      }
      continue
    }
    if (character === "#" && (index === 0 || /\s/u.test(line[index - 1]))) break
    if (character === "\"") {
      state.double = true
      output += " "
    } else if (character === "'") {
      state.single = true
      output += " "
    } else {
      output += character
    }
  }
  if (state.double) state.escaped = false
  return output
}

function leadingSpaces(line: string): number {
  let index = 0
  while (index < line.length && line[index] === " ") index += 1
  return index
}

function failure(path: string, message: string): ParseWorkflowContractV2YamlResult {
  let diagnostic: WorkflowContractV2Diagnostic
  try {
    diagnostic = createDiagnostic({
      code: "WF2_PACKAGE_LAYOUT_INVALID",
      severity: "error",
      message,
      location: { path, pointer: "" }
    })
  } catch {
    diagnostic = createDiagnostic({
      code: "WF2_PACKAGE_LAYOUT_INVALID",
      severity: "error",
      message: "Workflow YAML input is invalid.",
      location: { path: "workflow.yaml", pointer: "" }
    })
  }
  return objectFreeze({ ok: false, diagnostics: objectFreeze([diagnostic]) })
}
