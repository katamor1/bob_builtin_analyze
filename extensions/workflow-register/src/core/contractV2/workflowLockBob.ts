import {
  BOB_2_0_1_CAPABILITIES,
  BOB_2_0_1_PROFILE_DIGEST,
  BOB_2_0_1_TASK_CAPABILITIES,
  type BobCapabilityName,
  type BobTaskCapabilityName
} from "./bobProfile"
import type { JsonValue } from "./jsonValue"
import type { LockedBobBinding } from "./workflowLockContract"
import { array, record } from "./workflowLockValidation"

export function bob(value: JsonValue): LockedBobBinding {
  const label = "Workflow package lock.bob"
  const item = record(value, [
    "profile", "extensionId", "extensionVersion", "profileDigest", "capabilities",
    "requiredCapabilities", "taskCapabilities"
  ], label)
  if (item.profile !== "bob/2.0.1") throw new TypeError(`${label}.profile is invalid.`)
  if (item.extensionId !== "IBM.bob-code") throw new TypeError(`${label}.extensionId is invalid.`)
  if (item.extensionVersion !== "2.0.1") throw new TypeError(`${label}.extensionVersion is invalid.`)
  if (item.profileDigest !== BOB_2_0_1_PROFILE_DIGEST) throw new TypeError(`${label}.profileDigest is invalid.`)

  const capabilities = exactTuple(item.capabilities, BOB_2_0_1_CAPABILITIES, `${label}.capabilities`)
  const requiredCapabilities = subset(
    item.requiredCapabilities,
    BOB_2_0_1_CAPABILITIES,
    `${label}.requiredCapabilities`
  ) as readonly BobCapabilityName[]
  const taskCapabilities = subset(
    item.taskCapabilities,
    BOB_2_0_1_TASK_CAPABILITIES,
    `${label}.taskCapabilities`
  ) as readonly BobTaskCapabilityName[]
  const expected = requiredCapabilities.filter((capability): capability is BobTaskCapabilityName => (
    BOB_2_0_1_TASK_CAPABILITIES.includes(capability as BobTaskCapabilityName)
  ))
  if (expected.length !== taskCapabilities.length || expected.some((value, index) => value !== taskCapabilities[index])) {
    throw new TypeError(`${label}.taskCapabilities does not match the required task capability subset.`)
  }
  return Object.freeze({
    profile: "bob/2.0.1" as const,
    extensionId: "IBM.bob-code" as const,
    extensionVersion: "2.0.1" as const,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    capabilities,
    requiredCapabilities,
    taskCapabilities
  })
}

function exactTuple<const Values extends readonly string[]>(
  value: JsonValue,
  expected: Values,
  label: string
): Values {
  const values = array(value, expected.length, label)
  if (values.length !== expected.length) throw new TypeError(`${label} must contain the exact audited capability tuple.`)
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== expected[index]) throw new TypeError(`${label}[${index}] is invalid.`)
  }
  return expected
}

function subset<const Values extends readonly string[]>(
  value: JsonValue,
  allowed: Values,
  label: string
): readonly Values[number][] {
  const values = array(value, allowed.length, label)
  const result: Values[number][] = []
  for (let index = 0; index < values.length; index += 1) {
    const capability = values[index]
    if (typeof capability !== "string" || !allowed.includes(capability)) {
      throw new TypeError(`${label}[${index}] is not an audited capability.`)
    }
    if (index > 0 && (result[index - 1] as string) >= capability) {
      throw new TypeError(`${label} must be sorted and duplicate-free.`)
    }
    result.push(capability as Values[number])
  }
  return Object.freeze(result)
}
