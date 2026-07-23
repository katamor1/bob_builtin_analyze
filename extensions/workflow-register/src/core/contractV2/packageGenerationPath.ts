import type { Sha256Digest } from "./providerContract"

const CANONICAL_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const regexpTest = RegExp.prototype.test
const reflectApply = Reflect.apply
const stringSlice = String.prototype.slice

export const WORKFLOW_PACKAGE_GENERATION_DIRECTORY_PREFIX = "sha256-" as const

/**
 * Maps canonical digest evidence to the platform-safe immutable-generation
 * directory segment. The canonical `sha256:<hex>` value remains unchanged in
 * pointers, locks, manifests, plans, and runtime provenance.
 */
export function workflowPackageGenerationDirectoryName(digest: Sha256Digest): string {
  if (!(reflectApply(regexpTest, CANONICAL_DIGEST_PATTERN, [digest]) as boolean)) {
    throw new TypeError("Workflow package generation digest is not canonical.")
  }
  const hex = reflectApply(stringSlice, digest, ["sha256:".length]) as string
  return `${WORKFLOW_PACKAGE_GENERATION_DIRECTORY_PREFIX}${hex}`
}
