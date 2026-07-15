import { ProjectChecklist } from "./types"
import { fencedCodeBlock } from "../bazaar/markdownFence"
import type {
  ProjectRuleBundle,
  ProjectRuleBundleLimits
} from "../ruleAuthoring/ruleBundle"
import { PROJECT_RULE_BUNDLE_LIMITS } from "../ruleAuthoring/ruleBundle"

export interface ProjectRulesPacketOptions {
  checklist: ProjectChecklist
  schema: unknown
}

export function buildProjectRulesSection(options: ProjectRulesPacketOptions): string {
  return [
    "## Project-specific review rules",
    "",
    "Use the following checklist as mandatory review criteria.",
    "Do not mark a rule as pass without evidence.",
    "Use unknown when required source files, design docs, tables, or other evidence are missing.",
    "Every fail must produce at least one finding with the same rule_id.",
    "The primary output must be JSON matching the review result schema. After that, provide a Markdown summary.",
    "",
    "### Focused context allowance",
    "",
    "You may use focused additional context when the diff alone is insufficient.",
    "Allowed context methods: targeted text search, Tree-sitter, symbol search, outline, and Bazaar file content reads.",
    "Limit this to changed files, added files, symbols shown in the diff, public definitions added by the revision, and direct references relevant to checklist rules.",
    "Do not read broad unrelated areas of the repository. If required evidence would be too large, use unknown and explain what is missing.",
    "",
    "### checklist.json",
    "",
    fencedCodeBlock("json", JSON.stringify(options.checklist, null, 2)),
    "",
    "### review-result.schema.json",
    "",
    fencedCodeBlock("json", JSON.stringify(options.schema, null, 2)),
    "",
    "### Output contract",
    "",
    "Return results in this order:",
    "",
    "1. A fenced JSON block named `review_result_json` containing the normalized result.",
    "2. A human-readable Markdown checklist summary using these marks:",
    "   - `[x]` pass",
    "   - `[ ]` fail",
    "   - `[?]` unknown",
    "   - `[-]` not_applicable",
    "   - `[!]` blocked",
    "",
    "Status rules:",
    "",
    "- `pass`: evidence exists and no issue is found.",
    "- `fail`: project rule violation or high risk is found.",
    "- `unknown`: the diff suggests the rule may apply, but evidence is insufficient.",
    "- `not_applicable`: the rule clearly does not apply to this change.",
    "- `blocked`: a required tool, file, revision, or checklist cannot be loaded."
  ].join("\n")
}

/** Render every approved stable rule asset through the same bounded packet contract. */
export function buildProjectRulesSectionFromBundle(
  bundle: ProjectRuleBundle,
  limits: ProjectRuleBundleLimits
): string {
  assertTextWithinLimit(
    serializeJsonForPacket(bundle.checklist, "Project checklist"),
    effectiveLimit(limits.maxChecklistBytes, PROJECT_RULE_BUNDLE_LIMITS.maxChecklistBytes, "checklist"),
    "Project checklist"
  )
  assertTextWithinLimit(
    serializeJsonForPacket(bundle.reviewResultSchema, "Review result schema"),
    effectiveLimit(limits.maxReviewResultSchemaBytes, PROJECT_RULE_BUNDLE_LIMITS.maxReviewResultSchemaBytes, "review result schema"),
    "Review result schema"
  )

  const additions: string[] = []
  if (bundle.projectContext.length > 0) {
    assertTextWithinLimit(
      bundle.projectContext,
      effectiveLimit(limits.maxOptionalMarkdownBytes, PROJECT_RULE_BUNDLE_LIMITS.maxOptionalMarkdownBytes, "optional Markdown"),
      "Project context"
    )
    additions.push([
      "### project-context.md",
      "",
      "Use this approved project context when it is relevant to a checklist decision.",
      "",
      fencedCodeBlock("markdown", bundle.projectContext)
    ].join("\n"))
  }
  if (bundle.reviewPromptAddendum.length > 0) {
    assertTextWithinLimit(
      bundle.reviewPromptAddendum,
      effectiveLimit(limits.maxOptionalMarkdownBytes, PROJECT_RULE_BUNDLE_LIMITS.maxOptionalMarkdownBytes, "optional Markdown"),
      "Review prompt addendum"
    )
    additions.push([
      "### review-prompt-addendum.md",
      "",
      "Apply these approved additional review instructions together with the checklist.",
      "",
      fencedCodeBlock("markdown", bundle.reviewPromptAddendum)
    ].join("\n"))
  }
  if (bundle.provenanceSummary !== undefined) {
    const serialized = JSON.stringify(bundle.provenanceSummary, null, 2)
    assertTextWithinLimit(
      serialized,
      effectiveLimit(limits.maxProvenanceSummaryBytes, PROJECT_RULE_BUNDLE_LIMITS.maxProvenanceSummaryBytes, "provenance summary"),
      "Approved rule provenance summary"
    )
    additions.push([
      "### rule provenance summary",
      "",
      "This summary contains source metadata only; it is not a substitute for review evidence.",
      "",
      fencedCodeBlock("json", serialized)
    ].join("\n"))
  }

  const legacySection = buildProjectRulesSection({
    checklist: bundle.checklist,
    schema: bundle.reviewResultSchema
  })
  return additions.length > 0
    ? `${legacySection}\n\n${additions.join("\n\n")}`
    : legacySection
}

function effectiveLimit(configured: number, hardLimit: number, label: string): number {
  if (!Number.isSafeInteger(configured) || configured < 0) {
    throw new Error(`${label} byte limit must be a non-negative safe integer`)
  }
  return Math.min(configured, hardLimit)
}

function assertTextWithinLimit(value: string, limit: number, label: string): void {
  if (Buffer.byteLength(value, "utf8") > limit) {
    throw new Error(`${label} exceeds its byte limit`)
  }
}

function serializeJsonForPacket(value: unknown, label: string): string {
  const serialized = JSON.stringify(value, null, 2)
  if (serialized === undefined) throw new Error(`${label} is not JSON serializable`)
  return serialized
}
