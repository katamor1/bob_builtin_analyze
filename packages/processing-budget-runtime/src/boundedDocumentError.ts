export type BoundedDocumentErrorCode =
  | "bounded_document_input_invalid"
  | "bounded_document_source_invalid"
  | "bounded_document_source_changed"
  | "bounded_document_read_failed"
  | "bounded_document_archive_invalid"
  | "bounded_document_kind_mismatch"
  | "bounded_document_cancelled"
  | "bounded_document_cleanup_failed"

export interface BoundedDocumentErrorDetails {
  readonly phase?: "input" | "open" | "read" | "zip" | "parse" | "verify" | "close"
  readonly limit?: number
  readonly observed?: number
}

export class BoundedDocumentError extends Error {
  readonly code: BoundedDocumentErrorCode
  readonly details: Readonly<BoundedDocumentErrorDetails>

  constructor(code: BoundedDocumentErrorCode, details: BoundedDocumentErrorDetails = {}) {
    super(code.replace(/_/g, " "))
    this.name = "BoundedDocumentError"
    this.code = code
    this.details = Object.freeze({ ...details })
    Object.freeze(this)
  }
}
