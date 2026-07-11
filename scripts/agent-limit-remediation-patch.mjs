import fs from "node:fs"

const limitsPath = "extensions/bob-code-consistency-review/src/core/limits.ts"
const limitsContent = `export type ReviewProcessingLimits = {
  maxDocumentBytes: number
  maxWorkbookSheets: number
  maxRowsPerSheet: number
  maxExcerptBytesPerDocument: number
  maxRawDiffBytes: number
  maxBobInputBytes: number
}

export const DEFAULT_REVIEW_PROCESSING_LIMITS: ReviewProcessingLimits = {
  maxDocumentBytes: 5 * 1024 * 1024,
  maxWorkbookSheets: 20,
  maxRowsPerSheet: 500,
  maxExcerptBytesPerDocument: 64 * 1024,
  maxRawDiffBytes: 1024 * 1024,
  maxBobInputBytes: 2 * 1024 * 1024
}

export const MIN_REVIEW_PROCESSING_LIMITS: ReviewProcessingLimits = {
  maxDocumentBytes: 1,
  maxWorkbookSheets: 1,
  maxRowsPerSheet: 1,
  maxExcerptBytesPerDocument: 1,
  maxRawDiffBytes: 1,
  maxBobInputBytes: 1
}

export const MAX_REVIEW_PROCESSING_LIMITS: ReviewProcessingLimits = {
  maxDocumentBytes: 50 * 1024 * 1024,
  maxWorkbookSheets: 100,
  maxRowsPerSheet: 5_000,
  maxExcerptBytesPerDocument: 1024 * 1024,
  maxRawDiffBytes: 10 * 1024 * 1024,
  maxBobInputBytes: 8 * 1024 * 1024
}

export function normalizeReviewProcessingLimits(input: Partial<ReviewProcessingLimits> | undefined): ReviewProcessingLimits {
  return {
    maxDocumentBytes: boundedLimit(input?.maxDocumentBytes, "maxDocumentBytes"),
    maxWorkbookSheets: boundedLimit(input?.maxWorkbookSheets, "maxWorkbookSheets"),
    maxRowsPerSheet: boundedLimit(input?.maxRowsPerSheet, "maxRowsPerSheet"),
    maxExcerptBytesPerDocument: boundedLimit(input?.maxExcerptBytesPerDocument, "maxExcerptBytesPerDocument"),
    maxRawDiffBytes: boundedLimit(input?.maxRawDiffBytes, "maxRawDiffBytes"),
    maxBobInputBytes: boundedLimit(input?.maxBobInputBytes, "maxBobInputBytes")
  }
}

export function truncateUtf8Text(text: string, maxBytes: number, suffix: string): { text: string; truncated: boolean; originalBytes: number } {
  const safeMaxBytes = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0
  const originalBytes = Buffer.byteLength(text, "utf8")
  if (originalBytes <= safeMaxBytes) return { text, truncated: false, originalBytes }

  const safeSuffix = utf8Prefix(suffix, safeMaxBytes)
  const suffixBytes = Buffer.byteLength(safeSuffix, "utf8")
  const allowedBytes = Math.max(0, safeMaxBytes - suffixBytes)
  return {
    text: `${utf8Prefix(text, allowedBytes)}${safeSuffix}`,
    truncated: true,
    originalBytes
  }
}

function boundedLimit(value: number | undefined, key: keyof ReviewProcessingLimits): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_REVIEW_PROCESSING_LIMITS[key]
  }
  const integer = Math.floor(value)
  return Math.max(MIN_REVIEW_PROCESSING_LIMITS[key], Math.min(MAX_REVIEW_PROCESSING_LIMITS[key], integer))
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ""
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value
  let low = 0
  let high = value.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(value.slice(0, mid), "utf8") <= maxBytes) low = mid
    else high = mid - 1
  }
  return value.slice(0, low)
}
`
fs.writeFileSync(limitsPath, limitsContent, "utf8")

const packagePath = "extensions/bob-code-consistency-review/package.json"
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"))
if (Array.isArray(packageJson.extensionDependencies) && packageJson.extensionDependencies.length === 0) {
  delete packageJson.extensionDependencies
}
const properties = packageJson.contributes.configuration.properties
const ranges = {
  maxDocumentBytes: [1, 50 * 1024 * 1024],
  maxWorkbookSheets: [1, 100],
  maxRowsPerSheet: [1, 5_000],
  maxExcerptBytesPerDocument: [1, 1024 * 1024],
  maxRawDiffBytes: [1, 10 * 1024 * 1024],
  maxBobInputBytes: [1, 8 * 1024 * 1024]
}
for (const [suffix, [minimum, maximum]] of Object.entries(ranges)) {
  const definition = properties[`bobCodeConsistency.${suffix}`]
  if (!definition) throw new Error(`Missing package configuration for ${suffix}`)
  definition.minimum = minimum
  definition.maximum = maximum
}
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8")

const wiringPath = "extensions/bob-code-consistency-review/test/traceabilityCommandWiring.test.js"
const wiring = fs.readFileSync(wiringPath, "utf8")
const before = '  assert.match(source, /preprocessReview\\(\\{ workspaceRoot, inputPath, outDir, diffFixturePath, bzrPath, textEncoding, limits, workflowRunId \\}\\)/)'
const after = '  assert.match(source, /preprocessReview\\(\\{[\\s\\S]*textEncoding,[\\s\\S]*limits,[\\s\\S]*workflowRunId,[\\s\\S]*commandTimeoutMs,[\\s\\S]*abortSignal: controller\\.signal[\\s\\S]*\\}\\)/)'
if (!wiring.includes(after)) {
  if (!wiring.includes(before)) throw new Error("Expected traceability command wiring assertion was not found")
  fs.writeFileSync(wiringPath, wiring.replace(before, after), "utf8")
}
