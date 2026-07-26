import * as fs from "node:fs/promises"
import * as path from "node:path"
import { ProcessingCoveragePartialError } from "./processingCoverageError"
import { buildReviewPackage } from "./reviewPackageBuilder"
import { coverageIssuesFromWarnings } from "./processingBudgetCoverage"

const MANAGED_PACKAGE_OUTPUTS = Object.freeze([
  "prompts",
  "code-slices",
  "tables",
  "input-normalized.json",
  "changed-files.json",
  "changed-symbols.json",
  "document-index.json",
  "evidence-index.json",
  "traceability-map.json",
  "context-budget-report.json",
  "manifest.yaml",
  "change-summary.md",
  "diff-context.md",
  "document-excerpts.md",
  "traceability-map.md",
  "deterministic-checks.md",
  "bob-input.md"
])

type BuildReviewPackageInput = Parameters<typeof buildReviewPackage>[0]

export async function buildCompleteReviewPackage(input: BuildReviewPackageInput): Promise<string[]> {
  const warnings = await buildReviewPackage(input)
  const issues = coverageIssuesFromWarnings({
    ledger: input.budgetLedger,
    packageWarnings: warnings
  })
  if (issues.length === 0) return warnings
  await cleanManagedReviewPackageOutputs(input.outDir)
  throw new ProcessingCoveragePartialError(issues)
}

export async function cleanManagedReviewPackageOutputs(outDir: string): Promise<void> {
  for (const relativePath of MANAGED_PACKAGE_OUTPUTS) {
    const absolutePath = path.join(outDir, ...relativePath.split("/"))
    let stat
    try {
      stat = await fs.lstat(absolutePath)
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }
    if (stat.isSymbolicLink() || stat.isFile()) {
      await fs.unlink(absolutePath)
    } else if (stat.isDirectory()) {
      await fs.rm(absolutePath, { recursive: true, force: false })
    } else {
      throw new Error(`managed review package output has unsupported file type: ${relativePath}`)
    }
  }
}
