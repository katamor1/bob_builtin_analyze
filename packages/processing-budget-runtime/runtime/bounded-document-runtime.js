"use strict"

const file = require("./bounded-file")
const archive = require("./bounded-zip")

module.exports = Object.freeze({
  ABSOLUTE_MAX_ARCHIVE_ENTRIES: archive.ABSOLUTE_MAX_ARCHIVE_ENTRIES,
  DEFAULT_MAX_ARCHIVE_ENTRIES: archive.DEFAULT_MAX_ARCHIVE_ENTRIES,
  MAX_CENTRAL_DIRECTORY_BYTES: archive.MAX_CENTRAL_DIRECTORY_BYTES,
  MAX_ENTRY_NAME_BYTES: archive.MAX_ENTRY_NAME_BYTES,
  preflightOoxmlArchive: archive.preflightOoxmlArchive,
  readBoundedDocumentFile: file.readBoundedDocumentFile,
  __test: archive.__test
})
