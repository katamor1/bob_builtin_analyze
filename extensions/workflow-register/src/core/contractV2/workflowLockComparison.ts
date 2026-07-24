const arrayIsArray = Array.isArray
const arraySort = Array.prototype.sort
const mathMin = Math.min
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectIs = Object.is
const reflectApply = Reflect.apply
const stringReplace = String.prototype.replace

export function firstWorkflowLockDifference(
  actual: unknown,
  expected: unknown
): string | undefined {
  return compareValue(actual, expected, "")
}

export function workflowLockBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function compareValue(actual: unknown, expected: unknown, pointer: string): string | undefined {
  if (objectIs(actual, expected)) return undefined

  const actualArray = arrayIsArray(actual)
  const expectedArray = arrayIsArray(expected)
  if (actualArray || expectedArray) {
    if (!actualArray || !expectedArray) return pointer
    const actualValues = actual as unknown[]
    const expectedValues = expected as readonly unknown[]
    const common = mathMin(actualValues.length, expectedValues.length)
    for (let index = 0; index < common; index += 1) {
      const difference = compareValue(
        actualValues[index],
        expectedValues[index],
        `${pointer}/${index}`
      )
      if (difference !== undefined) return difference
    }
    return actualValues.length === expectedValues.length
      ? undefined
      : `${pointer}/${common}`
  }

  const actualObject = actual !== null && typeof actual === "object"
  const expectedObject = expected !== null && typeof expected === "object"
  if (actualObject || expectedObject) {
    if (!actualObject || !expectedObject) return pointer
    const actualRecord = actual as Record<string, unknown>
    const expectedRecord = expected as Record<string, unknown>
    const keys = objectKeys(actualRecord)
    const expectedKeys = objectKeys(expectedRecord)
    for (let index = 0; index < expectedKeys.length; index += 1) {
      if (!includes(keys, expectedKeys[index])) keys[keys.length] = expectedKeys[index]
    }
    sort(keys, compareText)
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      const actualHas = objectHasOwn(actualRecord, key)
      const expectedHas = objectHasOwn(expectedRecord, key)
      const keyPointer = `${pointer}/${escapePointerToken(key)}`
      if (!actualHas || !expectedHas) return keyPointer
      const difference = compareValue(actualRecord[key], expectedRecord[key], keyPointer)
      if (difference !== undefined) return difference
    }
    return undefined
  }

  return pointer
}

function escapePointerToken(value: string): string {
  const tilde = reflectApply(stringReplace, value, [/~/gu, "~0"]) as string
  return reflectApply(stringReplace, tilde, [/\//gu, "~1"]) as string
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

function sort<T>(values: T[], compare: (left: T, right: T) => number): void {
  reflectApply(arraySort, values, [compare])
}
