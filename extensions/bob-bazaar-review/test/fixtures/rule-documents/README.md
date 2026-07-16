# Generated rule-document fixtures

The Task 3 extraction tests generate their minimal DOCX and XLSX ZIP32 archives at runtime with
`test/helpers/ruleDocumentFixtures.js`. No binary Office fixture is committed. The generated archives
use stored ZIP entries with valid CRC-32 values and contain only the OOXML parts needed by the tests.

PDF adapter tests inject the bounded process-runner contract, so they do not require a committed PDF
or a local Poppler installation.
