"use strict"

const MAX_ERROR_ECHO_UTF8_BYTES = 256

function processingError(code, message, details = {}) {
  const error = new Error(message)
  error.name = "BoundedDocumentError"
  error.code = code
  error.details = Object.freeze({ ...details })
  return error
}

function safeEcho(value, maximumBytes = MAX_ERROR_ECHO_UTF8_BYTES) {
  if (typeof value !== "string") return String(value)
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value
  let output = ""
  let bytes = 0
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8")
    if (bytes + size > maximumBytes - 3) break
    output += character
    bytes += size
  }
  return `${output}...`
}

function ownDataRecord(value, allowedKeys, optionalKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw processingError("bounded_document_input_invalid", `${label} must be an object`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.some((key) => typeof key !== "string")) {
    throw processingError("bounded_document_input_invalid", `${label} must not contain symbol fields`)
  }
  const allowed = new Set(allowedKeys)
  const optional = new Set(optionalKeys)
  for (const key of keys) {
    if (!allowed.has(key)) throw processingError("bounded_document_input_invalid", `${label}.${key} is not allowed`)
    const descriptor = descriptors[key]
    if (!descriptor || !("value" in descriptor)) {
      throw processingError("bounded_document_input_invalid", `${label}.${key} must be own data`)
    }
  }
  for (const key of allowedKeys) {
    if (!optional.has(key) && !Object.hasOwn(descriptors, key)) {
      throw processingError("bounded_document_input_invalid", `${label}.${key} is required`)
    }
  }
  const output = Object.create(null)
  for (const key of keys) output[key] = descriptors[key].value
  return output
}

function boundedString(value, label, maximumBytes) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw processingError("bounded_document_input_invalid", `${label} is invalid`)
  }
  return value
}

function positiveSafeInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw processingError("bounded_document_input_invalid", `${label} must be a positive safe integer no greater than ${maximum}`)
  }
  return value
}

function ledgerFrom(value) {
  if (value === null || typeof value !== "object" || typeof value.reserveForTarget !== "function") {
    throw processingError("bounded_document_input_invalid", "ledger must expose reserveForTarget(category, target, amount)")
  }
  return value
}

function preserveTypedError(error, fallbackCode, fallbackMessage) {
  if (error && typeof error === "object" && typeof error.code === "string") {
    if (error.name === "BoundedDocumentError" || error.code.startsWith("processing_budget_")) throw error
  }
  throw processingError(fallbackCode, error instanceof Error ? safeEcho(error.message) : fallbackMessage)
}

function safeAdd(left, right) {
  return right <= Number.MAX_SAFE_INTEGER - left ? left + right : undefined
}

module.exports = Object.freeze({
  boundedString,
  ledgerFrom,
  ownDataRecord,
  positiveSafeInteger,
  preserveTypedError,
  processingError,
  safeAdd,
  safeEcho
})
