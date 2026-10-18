import { types as utilTypes } from "node:util"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

const isProxy = utilTypes.isProxy
const isArray = Array.isArray
const descriptorsOf = Object.getOwnPropertyDescriptors
const prototypeOf = Object.getPrototypeOf
const ownKeys = Reflect.ownKeys
const hasOwn = Object.hasOwn
const stringify = JSON.stringify
const byteLength = Buffer.byteLength.bind(Buffer)
const clone = cloneAndFreezeJsonValue
const ordinaryObject = Object.prototype
const ordinaryArray = Array.prototype
const safeInteger = Number.isSafeInteger

/** Bound the traversal and canonical text before the sole F1 JSON snapshot. */
export function snapshotBoundedWorkflowProviderEnvelope(value: unknown, maximumTextBytes: number): JsonValue | undefined {
  if (!safeInteger(maximumTextBytes) || maximumTextBytes < 1 || maximumTextBytes > 16_777_216) return undefined
  let nodes = 0, textBytes = 0
  const ancestors = new WeakSet<object>()
  const add = (bytes: number): void => {
    textBytes += bytes
    if (textBytes > maximumTextBytes) throw new TypeError()
  }
  const text = (value: string | number | boolean | null): void => {
    if (typeof value === "string" && (value.length > maximumTextBytes || byteLength(value, "utf8") > maximumTextBytes)) throw new TypeError()
    add(byteLength(stringify(value), "utf8"))
  }
  const visit = (current: unknown, depth: number): void => {
    if (++nodes > 65_536 || depth > 64 || isProxy(current)) throw new TypeError()
    if (current === null || typeof current === "string" || typeof current === "number" || typeof current === "boolean") { text(current); return }
    if (typeof current !== "object" || ancestors.has(current)) throw new TypeError()
    const array = isArray(current), prototype = prototypeOf(current)
    if (array ? prototype !== ordinaryArray : prototype !== ordinaryObject && prototype !== null) throw new TypeError()
    const descriptors = descriptorsOf(current), keys = ownKeys(descriptors)
    ancestors.add(current)
    try {
      if (array) {
        const length = descriptors.length
        if (!length || !hasOwn(length, "value") || !safeInteger(length.value) || length.value < 0 || length.value > 65_536 || keys.length !== length.value + 1) throw new TypeError()
        add(2 + Math.max(0, length.value - 1))
        for (let i = 0; i < length.value; i++) {
          const property = descriptors[String(i)]
          if (!property || !hasOwn(property, "value") || property.enumerable !== true) throw new TypeError()
          visit(property.value, depth + 1)
        }
      } else {
        if (keys.length > 1_024) throw new TypeError()
        add(2 + Math.max(0, keys.length - 1))
        for (const key of keys) {
          if (typeof key !== "string") throw new TypeError()
          const property = descriptors[key]
          if (!hasOwn(property, "value") || property.enumerable !== true) throw new TypeError()
          text(key); add(1); visit(property.value, depth + 1)
        }
      }
    } finally { ancestors.delete(current) }
  }
  try { visit(value, 0); return clone(value) } catch { return undefined }
}
