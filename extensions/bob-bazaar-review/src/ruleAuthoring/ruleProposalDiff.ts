import { ProjectChecklist, ProjectRule } from "../projectRules/types"
import { RuleProposalV1 } from "./ruleProposalSchema"

export type RuleProposalOperationKind = RuleProposalV1["operations"][number]["operation"]
export type ProposedRuleValue = NonNullable<RuleProposalV1["operations"][number]["rule"]>

const PROJECT_RULE_FIELDS = new Set([
  "id",
  "category",
  "title",
  "description",
  "severity_on_fail",
  "applies_when",
  "evidence_required",
  "review_hint"
])

export interface CurrentManagedMarkdownSection {
  id: string
  heading: string
  markdown: string
}

export interface ProposedManagedMarkdownValue {
  heading: string
  markdown: string
}

export interface RuleProposalCurrentBundle {
  checklist: ProjectChecklist
  projectContextSections: readonly CurrentManagedMarkdownSection[]
  promptAddendumSections: readonly CurrentManagedMarkdownSection[]
}

export interface RuleProposalRuleDiff {
  candidateId: string
  operation: RuleProposalOperationKind
  targetId: string | null
  before: ProjectRule | null
  after: ProposedRuleValue | null
  noOp: boolean
}

export interface RuleProposalManagedMarkdownDiff {
  candidateId: string
  operation: RuleProposalOperationKind
  targetId: string | null
  before: CurrentManagedMarkdownSection | null
  after: ProposedManagedMarkdownValue | null
  noOp: boolean
}

export interface RuleProposalDiff {
  rules: RuleProposalRuleDiff[]
  projectContext: RuleProposalManagedMarkdownDiff[]
  promptAddendum: RuleProposalManagedMarkdownDiff[]
}

export function diffRuleProposal(
  proposal: RuleProposalV1,
  currentBundle: RuleProposalCurrentBundle
): RuleProposalDiff {
  const currentRules = indexCurrentValues(currentBundle.checklist.rules)
  const currentContext = indexCurrentValues(currentBundle.projectContextSections)
  const currentPrompt = indexCurrentValues(currentBundle.promptAddendumSections)

  return {
    rules: proposal.operations.map((operation) => {
      const before = resolveBefore(
        operation.operation,
        operation.target_rule_id,
        currentRules,
        "rule"
      )
      const after = operation.operation === "retire"
        ? null
        : cloneProposedRule(requireValue(operation.rule, "rule"))

      return {
        candidateId: operation.candidate_id,
        operation: operation.operation,
        targetId: operation.target_rule_id,
        before: before === null ? null : cloneProjectRule(before),
        after,
        noOp: operation.operation === "update" && before !== null && after !== null
          ? ruleValuesEqual(before, after)
          : false
      }
    }),
    projectContext: diffManagedMarkdownOperations(
      proposal.project_context_operations,
      currentContext,
      "project context section"
    ),
    promptAddendum: diffManagedMarkdownOperations(
      proposal.prompt_addendum_operations,
      currentPrompt,
      "prompt addendum section"
    )
  }
}

function diffManagedMarkdownOperations(
  operations: RuleProposalV1["project_context_operations"],
  current: CurrentValueIndex<CurrentManagedMarkdownSection>,
  targetLabel: string
): RuleProposalManagedMarkdownDiff[] {
  return operations.map((operation) => {
    const before = resolveBefore(
      operation.operation,
      operation.target_section_id,
      current,
      targetLabel
    )
    const after = operation.operation === "retire"
      ? null
      : {
          heading: requireValue(operation.heading, "managed Markdown heading"),
          markdown: requireValue(operation.markdown, "managed Markdown body")
        }

    return {
      candidateId: operation.candidate_id,
      operation: operation.operation,
      targetId: operation.target_section_id,
      before: before === null ? null : cloneManagedSection(before),
      after,
      noOp: operation.operation === "update" && before !== null && after !== null
        ? before.heading === after.heading && before.markdown === after.markdown
        : false
    }
  })
}

interface IdentifiedValue {
  id: string
}

interface CurrentValueIndex<T extends IdentifiedValue> {
  byId: Map<string, T>
  duplicateIds: Set<string>
}

function indexCurrentValues<T extends IdentifiedValue>(values: readonly T[]): CurrentValueIndex<T> {
  const byId = new Map<string, T>()
  const duplicateIds = new Set<string>()
  for (const value of values) {
    if (byId.has(value.id)) duplicateIds.add(value.id)
    else byId.set(value.id, value)
  }
  return { byId, duplicateIds }
}

function resolveBefore<T extends IdentifiedValue>(
  operation: RuleProposalOperationKind,
  targetId: string | null,
  current: CurrentValueIndex<T>,
  targetLabel: string
): T | null {
  if (operation === "add") {
    if (targetId !== null) throw new Error(`Add ${targetLabel} target must be absent`)
    return null
  }
  if (targetId === null) throw new Error(`Current ${targetLabel} target is unavailable`)
  if (current.duplicateIds.has(targetId)) {
    throw new Error(`Current ${targetLabel} target is ambiguous`)
  }
  const value = current.byId.get(targetId)
  if (!value) throw new Error(`Current ${targetLabel} target is unavailable`)
  return value
}

function requireValue<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`Proposal ${label} is unavailable`)
  return value
}

function cloneProjectRule(value: ProjectRule): ProjectRule {
  return cloneJsonValue(value)
}

function cloneProposedRule(value: ProposedRuleValue): ProposedRuleValue {
  return {
    category: value.category,
    title: value.title,
    description: value.description,
    severity_on_fail: value.severity_on_fail,
    applies_when: [...value.applies_when],
    evidence_required: value.evidence_required,
    review_hint: value.review_hint
  }
}

function cloneManagedSection(value: CurrentManagedMarkdownSection): CurrentManagedMarkdownSection {
  return {
    id: value.id,
    heading: value.heading,
    markdown: value.markdown
  }
}

function ruleValuesEqual(current: ProjectRule, proposed: ProposedRuleValue): boolean {
  return Object.keys(current).every((field) => PROJECT_RULE_FIELDS.has(field)) &&
    current.category === proposed.category &&
    current.title === proposed.title &&
    current.description === proposed.description &&
    current.severity_on_fail === proposed.severity_on_fail &&
    (current.evidence_required ?? false) === proposed.evidence_required &&
    (current.review_hint ?? "") === proposed.review_hint &&
    stringArraysEqual(current.applies_when ?? [], proposed.applies_when)
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function cloneJsonValue<T>(value: T): T {
  return structuredClone(value)
}
