import type { ValidateFunction } from "ajv"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"

export const RULE_PROPOSAL_SCHEMA_VERSION = "bob-bazaar-review/rule-proposal/v1" as const

export type RuleProposalOperationKind = "add" | "update" | "retire"
export type RuleProposalConfidence = "high" | "medium" | "low"
export type RuleProposalSeverity = "error" | "warning" | "info"

export interface RuleProposalSourceRefV1 {
  source_id: string
  chunk_id: string
}

export interface RuleProposalRuleV1 {
  category: string
  title: string
  description: string
  severity_on_fail: RuleProposalSeverity
  applies_when: string[]
  evidence_required: boolean
  review_hint: string
}

export interface RuleProposalOperationV1 {
  candidate_id: string
  operation: RuleProposalOperationKind
  target_rule_id: string | null
  rule: RuleProposalRuleV1 | null
  source_refs: RuleProposalSourceRefV1[]
  confidence: RuleProposalConfidence
  rationale: string
  conflict_ids: string[]
}

export interface ProposedMarkdownOperationV1 {
  candidate_id: string
  operation: RuleProposalOperationKind
  target_section_id: string | null
  heading: string | null
  markdown: string | null
  source_refs: RuleProposalSourceRefV1[]
  confidence: RuleProposalConfidence
  rationale: string
  conflict_ids: string[]
}

export interface RuleProposalConflictAlternativeV1 {
  alternative_id: string
  description: string
  source_refs: RuleProposalSourceRefV1[]
}

export interface RuleProposalConflictV1 {
  conflict_id: string
  summary: string
  blocking: boolean
  source_refs: RuleProposalSourceRefV1[]
  affected_candidate_ids: string[]
  alternatives: RuleProposalConflictAlternativeV1[]
}

export interface RuleProposalV1 {
  schema_version: typeof RULE_PROPOSAL_SCHEMA_VERSION
  run_id: string
  base: {
    checklist_sha256: string
    project_context_sha256: string
    prompt_addendum_sha256: string
  }
  operations: RuleProposalOperationV1[]
  conflicts: RuleProposalConflictV1[]
  project_context_operations: ProposedMarkdownOperationV1[]
  prompt_addendum_operations: ProposedMarkdownOperationV1[]
}

export interface RuleProposalSchemaError {
  instancePath: string
  keyword: string
}

export type RuleProposalSchemaResult =
  | { valid: true; proposal: RuleProposalV1 }
  | { valid: false; errors: readonly RuleProposalSchemaError[] }

const IDENTIFIER_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
const SOURCE_ID_PATTERN = "^src-[a-f0-9]{12,64}$"
const CHUNK_ID_PATTERN = "^chunk-[a-f0-9]{64}$"
const SHA256_PATTERN = "^[a-f0-9]{64}$"
const RUN_ID_PATTERN = "^[^\\u0000-\\u001f\\u007f]{1,255}$"
export const EXISTING_RULE_ID_PATTERN =
  "^(?![\\s\\S]*[\\u0000-\\u001f\\u007f-\\u009f])(?:PRJ-(?!0000$)[0-9]{4}|(?!\\s*(?:PRJ|CTX|PRM)-)[\\s\\S]{1,128})$"
const MAX_AFFECTED_CANDIDATES =
  DEFAULT_RULE_AUTHORING_LIMITS.maxRuleOperations +
  DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextOperations +
  DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumOperations

export const RULE_PROPOSAL_SCHEMA_LIMITS = Object.freeze({
  maxRuleOperations: DEFAULT_RULE_AUTHORING_LIMITS.maxRuleOperations,
  maxProjectContextOperations: DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextOperations,
  maxPromptAddendumOperations: DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumOperations,
  maxConflicts: 200,
  maxSourceRefs: 64,
  maxConflictRefs: 64,
  maxAlternatives: 20,
  maxAffectedCandidates: MAX_AFFECTED_CANDIDATES,
  maxAppliesWhen: 32
})

const sourceRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source_id", "chunk_id"],
  properties: {
    source_id: { type: "string", pattern: SOURCE_ID_PATTERN },
    chunk_id: { type: "string", pattern: CHUNK_ID_PATTERN }
  }
} as const

const commonOperationProperties = {
  candidate_id: { type: "string", pattern: IDENTIFIER_PATTERN },
  operation: { enum: ["add", "update", "retire"] },
  source_refs: {
    type: "array",
    minItems: 1,
    maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxSourceRefs,
    items: { $ref: "#/$defs/sourceRef" }
  },
  confidence: { enum: ["high", "medium", "low"] },
  rationale: { type: "string", minLength: 1, maxLength: 8_192 },
  conflict_ids: {
    type: "array",
    maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxConflictRefs,
    items: { type: "string", pattern: IDENTIFIER_PATTERN }
  }
} as const

export const RULE_PROPOSAL_V1_JSON_SCHEMA = deepFreeze({
  $id: "bob-bazaar-review/rule-proposal/v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "run_id",
    "base",
    "operations",
    "conflicts",
    "project_context_operations",
    "prompt_addendum_operations"
  ],
  properties: {
    schema_version: { const: RULE_PROPOSAL_SCHEMA_VERSION },
    run_id: { type: "string", pattern: RUN_ID_PATTERN },
    base: {
      type: "object",
      additionalProperties: false,
      required: ["checklist_sha256", "project_context_sha256", "prompt_addendum_sha256"],
      properties: {
        checklist_sha256: { type: "string", pattern: SHA256_PATTERN },
        project_context_sha256: { type: "string", pattern: SHA256_PATTERN },
        prompt_addendum_sha256: { type: "string", pattern: SHA256_PATTERN }
      }
    },
    operations: {
      type: "array",
      maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxRuleOperations,
      items: { $ref: "#/$defs/ruleOperation" }
    },
    conflicts: {
      type: "array",
      maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxConflicts,
      items: { $ref: "#/$defs/conflict" }
    },
    project_context_operations: {
      type: "array",
      maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxProjectContextOperations,
      items: { $ref: "#/$defs/markdownOperation" }
    },
    prompt_addendum_operations: {
      type: "array",
      maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxPromptAddendumOperations,
      items: { $ref: "#/$defs/markdownOperation" }
    }
  },
  $defs: {
    sourceRef: sourceRefSchema,
    rule: {
      type: "object",
      additionalProperties: false,
      required: [
        "category",
        "title",
        "description",
        "severity_on_fail",
        "applies_when",
        "evidence_required",
        "review_hint"
      ],
      properties: {
        category: { type: "string", minLength: 1, maxLength: 256 },
        title: { type: "string", minLength: 1, maxLength: 512 },
        description: { type: "string", minLength: 1, maxLength: 8_192 },
        severity_on_fail: { enum: ["error", "warning", "info"] },
        applies_when: {
          type: "array",
          maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxAppliesWhen,
          items: { type: "string", maxLength: 1_024 }
        },
        evidence_required: { type: "boolean" },
        review_hint: { type: "string", maxLength: 4_096 }
      }
    },
    ruleOperation: {
      type: "object",
      additionalProperties: false,
      required: [
        "candidate_id",
        "operation",
        "target_rule_id",
        "rule",
        "source_refs",
        "confidence",
        "rationale",
        "conflict_ids"
      ],
      properties: {
        ...commonOperationProperties,
        target_rule_id: {
          anyOf: [
            {
              type: "string",
              minLength: 1,
              maxLength: 128,
              pattern: EXISTING_RULE_ID_PATTERN
            },
            { type: "null" }
          ]
        },
        rule: {
          anyOf: [
            { $ref: "#/$defs/rule" },
            { type: "null" }
          ]
        }
      }
    },
    markdownOperation: {
      type: "object",
      additionalProperties: false,
      required: [
        "candidate_id",
        "operation",
        "target_section_id",
        "heading",
        "markdown",
        "source_refs",
        "confidence",
        "rationale",
        "conflict_ids"
      ],
      properties: {
        ...commonOperationProperties,
        target_section_id: {
          anyOf: [
            { type: "string", pattern: "^(?:CTX|PRM)-(?!0000$)[0-9]{4}$" },
            { type: "null" }
          ]
        },
        heading: {
          anyOf: [
            { type: "string", minLength: 1, maxLength: 512 },
            { type: "null" }
          ]
        },
        markdown: {
          anyOf: [
            { type: "string", maxLength: 262_144 },
            { type: "null" }
          ]
        }
      }
    },
    conflictAlternative: {
      type: "object",
      additionalProperties: false,
      required: ["alternative_id", "description", "source_refs"],
      properties: {
        alternative_id: { type: "string", pattern: IDENTIFIER_PATTERN },
        description: { type: "string", minLength: 1, maxLength: 8_192 },
        source_refs: {
          type: "array",
          maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxSourceRefs,
          items: { $ref: "#/$defs/sourceRef" }
        }
      }
    },
    conflict: {
      type: "object",
      additionalProperties: false,
      required: [
        "conflict_id",
        "summary",
        "blocking",
        "source_refs",
        "affected_candidate_ids",
        "alternatives"
      ],
      properties: {
        conflict_id: { type: "string", pattern: IDENTIFIER_PATTERN },
        summary: { type: "string", minLength: 1, maxLength: 8_192 },
        blocking: { type: "boolean" },
        source_refs: {
          type: "array",
          maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxSourceRefs,
          items: { $ref: "#/$defs/sourceRef" }
        },
        affected_candidate_ids: {
          type: "array",
          minItems: 1,
          maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxAffectedCandidates,
          items: { type: "string", pattern: IDENTIFIER_PATTERN }
        },
        alternatives: {
          type: "array",
          maxItems: RULE_PROPOSAL_SCHEMA_LIMITS.maxAlternatives,
          items: { $ref: "#/$defs/conflictAlternative" }
        }
      }
    }
  }
} as const)

let compiledValidator: ValidateFunction<RuleProposalV1> | undefined

export function validateRuleProposalSchema(value: unknown): RuleProposalSchemaResult {
  const validator = getRuleProposalValidator()
  if (validator(value)) return { valid: true, proposal: value }
  return {
    valid: false,
    errors: (validator.errors ?? []).slice(0, 100).map((error) => ({
      instancePath: error.instancePath.slice(0, 256),
      keyword: error.keyword.slice(0, 64)
    }))
  }
}

function getRuleProposalValidator(): ValidateFunction<RuleProposalV1> {
  if (compiledValidator) return compiledValidator

  // Ajv is intentionally required only when proposal validation is first used.
  const Ajv = require("ajv").default as typeof import("ajv").default
  const ajv = new Ajv({
    strict: true,
    allErrors: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false
  })
  compiledValidator = ajv.compile<RuleProposalV1>(RULE_PROPOSAL_V1_JSON_SCHEMA)
  return compiledValidator
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
