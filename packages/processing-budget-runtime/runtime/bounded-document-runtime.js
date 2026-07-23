"use strict"

const file = require("./bounded-file")
const archive = require("./bounded-zip")
const {
  ledgerFrom,
  ownDataRecord,
  positiveSafeInteger,
  processingError
} = require("./errors")

const ABSOLUTE_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024

function preflightOoxmlArchive(input) {
  const values = ownDataRecord(
    input,
    [
      "archiveBytes",
      "target",
      "ledger",
      "expectedKind",
      "maximumArchiveBytes",
      "maximumEntries",
      "maximumEntryBytes",
      "maximumExpandedBytes"
    ],
    ["expectedKind", "maximumArchiveBytes", "maximumEntries", "maximumEntryBytes", "maximumExpandedBytes"],
    "OOXML archive input"
  )
  if (!(values.archiveBytes instanceof Uint8Array)) {
    throw processingError("bounded_document_input_invalid", "archiveBytes must be a Uint8Array")
  }
  ledgerFrom(values.ledger)
  const maximumArchiveBytes = values.maximumArchiveBytes === undefined
    ? ABSOLUTE_MAX_ARCHIVE_BYTES
    : positiveSafeInteger(values.maximumArchiveBytes, "maximumArchiveBytes", ABSOLUTE_MAX_ARCHIVE_BYTES)
  if (values.archiveBytes.byteLength > maximumArchiveBytes) {
    throw processingError(
      "processing_budget_exceeded",
      `compressed archive bytes exceed the ${maximumArchiveBytes}-byte hard limit`,
      {
        constrainedCategory: "single_document_bytes",
        limit: maximumArchiveBytes,
        observed: values.archiveBytes.byteLength
      }
    )
  }
  return archive.preflightOoxmlArchive({
    archiveBytes: values.archiveBytes,
    target: values.target,
    ledger: values.ledger,
    expectedKind: values.expectedKind,
    maximumEntries: values.maximumEntries,
    maximumEntryBytes: values.maximumEntryBytes,
    maximumExpandedBytes: values.maximumExpandedBytes
  })
}

module.exports = Object.freeze({
  ABSOLUTE_MAX_ARCHIVE_BYTES,
  ABSOLUTE_MAX_ARCHIVE_ENTRIES: archive.ABSOLUTE_MAX_ARCHIVE_ENTRIES,
  DEFAULT_MAX_ARCHIVE_ENTRIES: archive.DEFAULT_MAX_ARCHIVE_ENTRIES,
  MAX_CENTRAL_DIRECTORY_BYTES: archive.MAX_CENTRAL_DIRECTORY_BYTES,
  MAX_ENTRY_NAME_BYTES: archive.MAX_ENTRY_NAME_BYTES,
  preflightOoxmlArchive,
  readBoundedDocumentFile: file.readBoundedDocumentFile,
  __test: archive.__test
})
