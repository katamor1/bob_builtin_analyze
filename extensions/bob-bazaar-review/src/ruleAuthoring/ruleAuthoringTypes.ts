export const RULE_AUTHORING_SCHEMA_VERSION = "bob-bazaar-review/rule-authoring-run/v1" as const

export type RuleAuthoringPhase =
  | "sources"
  | "extraction"
  | "evidence_selection"
  | "proposal"
  | "human_review"
  | "apply"
  | "completed"

export type RuleAuthoringPhaseStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "failed"
  | "skipped"

export type RuleSourceMediaType = "docx" | "xlsx" | "pdf"

export type RuleSourceExtractionStatus =
  | "success"
  | "partial"
  | "blocked"
  | "requires_conversion"
  | "requires_ocr"

export interface RuleSourceManifestEntryV1 {
  source_id: string
  logical_name: string
  media_type: RuleSourceMediaType
  sha256: string
  byte_size: number
  extraction_status: RuleSourceExtractionStatus
  extractor: { id: string; version: string }
  warnings: string[]
}

export interface RuleSourceManifestV1 {
  schema_version: "bob-bazaar-review/rule-sources/v1"
  generated_at: string
  sources: RuleSourceManifestEntryV1[]
}

export type DocumentChunkKind = "heading" | "paragraph" | "list" | "table" | "row" | "page"

export interface DocumentChunkLocatorV1 {
  heading_path?: string[]
  block_index?: number
  table_index?: number
  sheet?: string
  row?: number
  cell_range?: string
  page?: number
  part_index?: number
}

export interface DocumentChunkV1 {
  schema_version: "bob-bazaar-review/document-chunk/v1"
  chunk_id: string
  source_id: string
  kind: DocumentChunkKind
  locator: DocumentChunkLocatorV1
  title?: string
  text: string
  text_sha256: string
  flags: string[]
}
