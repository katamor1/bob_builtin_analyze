import { TextDecoder as NodeTextDecoder } from "node:util"

import {
  validateLocalJsonSchemaViewValue,
  type CompiledLocalJsonSchemaView
} from "./jsonSchemaCatalog"
import type { JsonValue } from "./jsonValue"
import { parseStrictJson } from "./packageLoaderInput"
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"

export interface ValidateWorkflowArtifactContentInput {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly schema: CompiledLocalJsonSchemaView
  readonly path: string
  readonly maximumBytes: number
}

const TextDecoderConstructor = NodeTextDecoder
const textDecoderDecode = NodeTextDecoder.prototype.decode
const bufferFrom = Buffer.from
const bufferToString = Buffer.prototype.toString
const BufferConstructor = Buffer
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply
const stringEndsWith = String.prototype.endsWith
const stringStartsWith = String.prototype.startsWith

export function validateWorkflowArtifactContent(
  input: ValidateWorkflowArtifactContentInput
): JsonValue {
  let value: unknown
  if (isJsonMediaType(input.mediaType)) {
    try {
      value = parseStrictJson(input.bytes, "Workflow artifact JSON")
    } catch {
      throw new Error("Workflow artifact is not valid strict JSON.")
    }
  } else if (isTextMediaType(input.mediaType)) {
    value = decodeStrictUtf8(input.bytes)
  } else {
    value = encodeCanonicalBase64(input.bytes)
  }

  const bounded = snapshotBoundedWorkflowProviderEnvelope(value, input.maximumBytes)
  if (bounded === undefined) {
    throw new Error("Workflow artifact value exceeds its structural budget.")
  }
  const validated = validateLocalJsonSchemaViewValue({
    compiled: input.schema,
    value: bounded,
    diagnosticCode: "WF2_ARTIFACT_SCHEMA_INVALID",
    location: objectFreeze({ path: input.path, pointer: "" })
  })
  if (!validated.ok) throw new Error("Workflow artifact failed its compiled schema validation.")
  return validated.value
}

function decodeStrictUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("Workflow text artifact must not contain a UTF-8 byte-order mark.")
  }
  try {
    const decoder = new TextDecoderConstructor("utf-8", { fatal: true, ignoreBOM: true })
    return reflectApply(textDecoderDecode, decoder, [bytes]) as string
  } catch {
    throw new Error("Workflow text artifact must be valid UTF-8.")
  }
}

function encodeCanonicalBase64(bytes: Uint8Array): string {
  const buffer = reflectApply(bufferFrom, BufferConstructor, [bytes]) as Buffer
  return reflectApply(bufferToString, buffer, ["base64"]) as string
}

function isJsonMediaType(value: string): boolean {
  return value === "application/json" || reflectApply(stringEndsWith, value, ["+json"]) as boolean
}

function isTextMediaType(value: string): boolean {
  return reflectApply(stringStartsWith, value, ["text/"]) as boolean
}
