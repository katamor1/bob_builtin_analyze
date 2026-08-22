import {
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  loadAll as loadAllYaml,
  type State as YamlState
} from "js-yaml"
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
const objectDefineProperty = Object.defineProperty
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const bufferFrom = Buffer.from.bind(Buffer) as (value: Uint8Array) => Buffer
const bufferIsBuffer = Buffer.isBuffer
const isProxy = utilTypes.isProxy
const TextDecoderConstructor = NodeTextDecoder
const textDecoderDecode = NodeTextDecoder.prototype.decode
const yamlLoadAll = loadAllYaml
const yamlCoreSchema = CORE_SCHEMA
const yamlTimestampResolver = captureTimestampResolver(DEFAULT_SCHEMA)
const ordinaryObjectPrototype = Object.prototype

const SUCCESS_DIAGNOSTICS = objectFreeze([]) as readonly []
const INPUT_KEYS = objectFreeze(["bytes", "path"] as const)

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
    if (containsByte(bytes, 0x0d)) {
      return failure(path, "Workflow YAML must use LF line endings.")
    }

    let text: string
    try {
      const decoder = new TextDecoderConstructor("utf-8", { fatal: true, ignoreBOM: true })
      text = reflectApply(textDecoderDecode, decoder, [bytes]) as string
    } catch {
      return failure(path, "Workflow YAML must be valid UTF-8.")
    }

    const documents: unknown[] = []
    const observations: YamlNodeObservation[] = []
    try {
      yamlLoadAll(text, (document) => defineArrayItem(documents, documents.length, document), {
        json: false,
        listener: createYamlBoundaryListener(text, observations),
        schema: yamlCoreSchema
      })
    } catch (error) {
      if (error instanceof YamlBoundaryFailure) return failure(path, error.message)
      return failure(path, "Workflow YAML could not be composed as one strict document.")
    }
    if (documents.length !== 1 || documents[0] === undefined) {
      return failure(path, "Workflow YAML must contain exactly one document.")
    }
    const observationFailure = validateYamlObservations(observations)
    if (observationFailure !== undefined) return failure(path, observationFailure)

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
  if (keys.length !== INPUT_KEYS.length) throw new TypeError("invalid input")
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !containsInputKey(key)) throw new TypeError("invalid input")
  }
  const bytes = dataValue(descriptors, "bytes")
  const path = dataValue(descriptors, "path")
  if (isProxy(bytes) || !bufferIsBuffer(bytes) || typeof path !== "string") {
    throw new TypeError("invalid input")
  }
  return objectFreeze({ bytes: bufferFrom(bytes), path })
}

function dataValue(descriptors: PropertyDescriptorMap, key: string): unknown {
  const descriptor = descriptors[key]
  if (descriptor === undefined || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) {
    throw new TypeError("invalid input")
  }
  return descriptor.value
}

interface RuntimeYamlState extends YamlState {
  readonly anchor?: string | null
  readonly tag?: string | null
}

interface RuntimeYamlType {
  readonly tag: string
  readonly resolve: (value: unknown) => boolean
}

interface RuntimeYamlSchema {
  readonly compiledImplicit: readonly RuntimeYamlType[]
}

interface CapturedYamlResolver {
  readonly receiver: RuntimeYamlType
  readonly resolve: (value: unknown) => boolean
}

interface YamlNodeObservation {
  readonly children: YamlNodeObservation[]
  readonly start: number
  kind: string | null
  tag: string | null
  result: unknown
}

class YamlBoundaryFailure extends Error {}

function captureTimestampResolver(schema: unknown): CapturedYamlResolver {
  const types = (schema as RuntimeYamlSchema).compiledImplicit
  for (let index = 0; index < types.length; index += 1) {
    const type = types[index]
    if (type.tag === "tag:yaml.org,2002:timestamp") {
      return objectFreeze({ receiver: type, resolve: type.resolve })
    }
  }
  throw new TypeError("js-yaml timestamp resolver is unavailable")
}

function createYamlBoundaryListener(
  text: string,
  roots: YamlNodeObservation[]
): (event: "open" | "close", state: YamlState) => void {
  const stack: YamlNodeObservation[] = []
  return (event, rawState) => {
    const state = rawState as RuntimeYamlState
    if (event === "open") {
      const start = nextNodeTokenIndex(text, state.position)
      const token = start === undefined ? undefined : text[start]
      if (token === "&" || token === "*" || token === "!") {
        throw new YamlBoundaryFailure("Workflow YAML anchors, aliases, and tags are forbidden.")
      }
      const observation: YamlNodeObservation = {
        children: [],
        kind: null,
        result: undefined,
        start: start ?? state.position,
        tag: null
      }
      if (stack.length === 0) defineArrayItem(roots, roots.length, observation)
      else defineArrayItem(stack[stack.length - 1].children, stack[stack.length - 1].children.length, observation)
      defineArrayItem(stack, stack.length, observation)
      return
    }

    const observation = stack[stack.length - 1]
    stack.length -= 1
    observation.kind = state.kind ?? null
    observation.tag = state.tag ?? null
    observation.result = state.result
    if (state.anchor !== undefined && state.anchor !== null) {
      throw new YamlBoundaryFailure("Workflow YAML anchors, aliases, and tags are forbidden.")
    }
    if (
      observation.kind === "scalar" && observation.tag === "?" &&
      typeof observation.result === "string" && resolvesAsTimestamp(observation.result)
    ) {
      throw new YamlBoundaryFailure("Workflow YAML timestamp scalars are forbidden.")
    }
    if (
      observation.kind === "scalar" &&
      (observation.tag === "tag:yaml.org,2002:int" || observation.tag === "tag:yaml.org,2002:float") &&
      observation.result === 0 && text[observation.start] === "-"
    ) {
      throw new YamlBoundaryFailure("Workflow YAML negative-zero numbers are forbidden.")
    }
  }
}

function nextNodeTokenIndex(text: string, start: number): number | undefined {
  let index = start
  while (index < text.length) {
    const character = text[index]
    if (character === " " || character === "\t" || character === "\n") {
      index += 1
      continue
    }
    if (character === "#") {
      while (index < text.length && text[index] !== "\n") index += 1
      continue
    }
    return index
  }
  return undefined
}

function resolvesAsTimestamp(value: string): boolean {
  return reflectApply(
    yamlTimestampResolver.resolve,
    yamlTimestampResolver.receiver,
    [value]
  ) as boolean
}

function validateYamlObservations(roots: readonly YamlNodeObservation[]): string | undefined {
  const stack: YamlNodeObservation[] = []
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    defineArrayItem(stack, stack.length, roots[index])
  }
  while (stack.length > 0) {
    const observation = stack[stack.length - 1]
    stack.length -= 1
    if (observation.kind === "mapping") {
      for (let index = 0; index < observation.children.length; index += 2) {
        const key = observation.children[index]
        if (key === undefined || key.kind !== "scalar" || typeof key.result !== "string") {
          return "Workflow YAML must use string mapping keys."
        }
        if (key.tag === "?" && key.result === "<<") return "Workflow YAML merge keys are forbidden."
      }
    }
    for (let index = observation.children.length - 1; index >= 0; index -= 1) {
      defineArrayItem(stack, stack.length, observation.children[index])
    }
  }
  return undefined
}

function containsByte(bytes: Buffer, target: number): boolean {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === target) return true
  }
  return false
}

function containsInputKey(value: string): boolean {
  for (let index = 0; index < INPUT_KEYS.length; index += 1) {
    if (INPUT_KEYS[index] === value) return true
  }
  return false
}

function defineArrayItem<T>(array: T[], index: number, value: T): void {
  objectDefineProperty(array, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
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
