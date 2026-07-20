#!/usr/bin/env node
"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const contentPath = path.join(__dirname, "fixture-content.json")
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"))
const UTF8 = "utf8"
const GENERATOR_ID = "bob-review-input-document-fixtures"
const GENERATOR_VERSION = 1

const PROFILE_FILES = Object.freeze({
  "bazaar-core": Object.freeze({
    docx: "project-review-rules.docx",
    xlsx: "review-traceability-ledger.xlsx",
    pdf: "system-review-guidelines.pdf",
    expected: "EXPECTED_DOCUMENT_INPUTS.md",
    referenced: Object.freeze({ docx: false, xlsx: false, pdf: false })
  }),
  "consistency-ai-matrix": Object.freeze({
    docx: "requirements-and-design.docx",
    xlsx: "verification-matrix.xlsx",
    pdf: "supplemental-reference.pdf",
    expected: "EXPECTED_DOCUMENT_EXTRACTION.md",
    referenced: Object.freeze({ docx: true, xlsx: true, pdf: false })
  })
})

function main(argv) {
  const args = parseArgs(argv)
  validateContent()
  const files = buildProfileFiles(args.profile)

  if (args.validateOnly) {
    if (args.output || args.reviewInput) {
      throw new Error("--validate-only cannot be combined with --output or --review-input")
    }
    validateBuiltFiles(args.profile, files)
    process.stdout.write(`Document fixture profile valid: ${args.profile}\n`)
    return
  }

  if (!args.output) throw new Error("--output is required unless --validate-only is used")
  const outputRoot = prepareNewOutputDirectory(args.output)
  try {
    writeProfileFiles(outputRoot, files)
    if (args.reviewInput) {
      if (args.profile !== "consistency-ai-matrix") {
        throw new Error("--review-input is supported only for consistency-ai-matrix")
      }
      patchReviewInputAtomic(args.reviewInput)
    }
    process.stdout.write(`Document fixtures generated: ${args.profile} -> ${outputRoot}\n`)
  } catch (error) {
    fs.rmSync(outputRoot, { recursive: true, force: true })
    throw error
  }
}

function parseArgs(argv) {
  const result = { profile: "", output: "", reviewInput: "", validateOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--validate-only") {
      result.validateOnly = true
      continue
    }
    if (token === "--profile" || token === "--output" || token === "--review-input") {
      const value = argv[index + 1]
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`)
      index += 1
      if (token === "--profile") result.profile = value
      if (token === "--output") result.output = value
      if (token === "--review-input") result.reviewInput = value
      continue
    }
    throw new Error(`Unsupported argument: ${token}`)
  }
  if (!Object.hasOwn(PROFILE_FILES, result.profile)) {
    throw new Error(`Unsupported document fixture profile: ${result.profile || "(empty)"}`)
  }
  return result
}

function validateContent() {
  if (content.schemaVersion !== 1) throw new Error("Unsupported fixture content schemaVersion")
  const actualProfiles = Object.keys(content.profiles).sort()
  const expectedProfiles = Object.keys(PROFILE_FILES).sort()
  if (JSON.stringify(actualProfiles) !== JSON.stringify(expectedProfiles)) {
    throw new Error("fixture-content.json profiles must match the fixed profile allowlist")
  }
  for (const profile of expectedProfiles) {
    const definition = content.profiles[profile]
    if (!definition?.docx?.title || !Array.isArray(definition.docx.sections)) {
      throw new Error(`${profile}.docx is invalid`)
    }
    if (!Array.isArray(definition.xlsx?.sheets) || definition.xlsx.sheets.length === 0) {
      throw new Error(`${profile}.xlsx is invalid`)
    }
    if (!Array.isArray(definition.pdf?.pages) || definition.pdf.pages.length === 0) {
      throw new Error(`${profile}.pdf is invalid`)
    }
  }
}

function buildProfileFiles(profile) {
  if (!Object.hasOwn(PROFILE_FILES, profile)) {
    throw new Error(`Unsupported document fixture profile: ${profile || "(empty)"}`)
  }
  validateContent()
  const names = PROFILE_FILES[profile]
  const definition = content.profiles[profile]
  const binaryFiles = [
    {
      logicalName: names.docx,
      mediaType: "docx",
      bytes: buildDocx(definition.docx),
      referencedByReviewInput: names.referenced.docx,
      expectedSelectors: collectDocxSelectors(profile),
      expectedLocators: []
    },
    {
      logicalName: names.xlsx,
      mediaType: "xlsx",
      bytes: buildXlsx(definition.xlsx),
      referencedByReviewInput: names.referenced.xlsx,
      expectedSelectors: collectXlsxSelectors(profile),
      expectedLocators: definition.xlsx.sheets.map((sheet) => sheet.name)
    },
    {
      logicalName: names.pdf,
      mediaType: "pdf",
      bytes: buildPdf(definition.pdf.pages),
      referencedByReviewInput: names.referenced.pdf,
      expectedSelectors: collectPdfSelectors(profile),
      expectedLocators: definition.pdf.pages.map((_, index) => `page:${index + 1}`)
    }
  ]
  const manifest = {
    schemaVersion: 1,
    generator: { id: GENERATOR_ID, version: GENERATOR_VERSION, profile },
    files: binaryFiles.map((file) => ({
      logicalName: file.logicalName,
      mediaType: file.mediaType,
      sha256: sha256(file.bytes),
      byteSize: file.bytes.length,
      referencedByReviewInput: file.referencedByReviewInput,
      expectedSelectors: file.expectedSelectors,
      expectedLocators: file.expectedLocators
    }))
  }
  const expectedText = profile === "bazaar-core"
    ? renderBazaarExpected(manifest)
    : renderConsistencyExpected(manifest)
  const files = [
    ...binaryFiles.map(({ logicalName, bytes }) => ({ logicalName, bytes })),
    {
      logicalName: "document-fixture-manifest.json",
      bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, UTF8)
    },
    {
      logicalName: names.expected,
      bytes: Buffer.from(expectedText, UTF8)
    }
  ]
  validateBuiltFiles(profile, files)
  return files
}

function collectDocxSelectors(profile) {
  return profile === "bazaar-core"
    ? ["RULE-DOC-001", "RULE-DOC-002", "RULE-DOC-003", "RULE-DOC-004"]
    : ["REQ-DOC-001", "REQ-DOC-002", "BD-DOC-001"]
}

function collectXlsxSelectors(profile) {
  return profile === "bazaar-core"
    ? ["RULE-DOC-001", "RULE-DOC-002", "RULE-DOC-003", "RULE-DOC-004"]
    : ["TC-DOC-001", "TC-DOC-002"]
}

function collectPdfSelectors(profile) {
  return profile === "bazaar-core"
    ? ["PDF-RULE-001", "PDF-RULE-002", "PDF-RULE-003"]
    : ["PDF-CONSISTENCY-UNREFERENCED"]
}

function validateBuiltFiles(profile, files) {
  const names = PROFILE_FILES[profile]
  const expectedNames = [
    names.docx,
    names.xlsx,
    names.pdf,
    "document-fixture-manifest.json",
    names.expected
  ]
  assertUnique(expectedNames, `${profile} output names`)
  assertUnique(files.map((file) => file.logicalName), `${profile} built file names`)
  if (JSON.stringify(files.map((file) => file.logicalName)) !== JSON.stringify(expectedNames)) {
    throw new Error(`${profile} output order does not match the fixed allowlist`)
  }
  for (const file of files) {
    assertSafeLogicalName(file.logicalName)
    if (!Buffer.isBuffer(file.bytes) || file.bytes.length === 0) {
      throw new Error(`Generated file is empty: ${file.logicalName}`)
    }
  }
  const manifest = JSON.parse(
    files.find((file) => file.logicalName === "document-fixture-manifest.json").bytes.toString(UTF8)
  )
  for (const record of manifest.files) {
    const file = files.find((item) => item.logicalName === record.logicalName)
    if (!file) throw new Error(`Manifest file is missing: ${record.logicalName}`)
    if (record.sha256 !== sha256(file.bytes) || record.byteSize !== file.bytes.length) {
      throw new Error(`Manifest hash or byteSize mismatch: ${record.logicalName}`)
    }
  }
}

function prepareNewOutputDirectory(outputPath) {
  const outputRoot = path.resolve(outputPath)
  if (fs.existsSync(outputRoot)) throw new Error(`Output directory already exists: ${outputRoot}`)
  const parent = path.dirname(outputRoot)
  if (!fs.existsSync(parent)) throw new Error(`Output directory parent does not exist: ${parent}`)
  assertNoSymbolicLinkTraversal(parent)
  fs.mkdirSync(outputRoot, { recursive: false })
  if (fs.lstatSync(outputRoot).isSymbolicLink()) {
    throw new Error(`Output directory must not be a symbolic link or junction: ${outputRoot}`)
  }
  return outputRoot
}

function assertNoSymbolicLinkTraversal(candidate) {
  let current = path.parse(path.resolve(candidate)).root
  const relative = path.relative(current, path.resolve(candidate))
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) break
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Path must not traverse a symbolic link or junction: ${current}`)
    }
  }
}

function writeProfileFiles(outputRoot, files) {
  for (const file of files) {
    const target = path.resolve(outputRoot, file.logicalName)
    if (path.dirname(target) !== outputRoot) {
      throw new Error(`Generated file escapes output root: ${file.logicalName}`)
    }
    fs.writeFileSync(target, file.bytes, { flag: "wx" })
  }
}

function buildDocx(definition) {
  const body = [
    wordParagraph(definition.title, "Heading1"),
    ...definition.sections.flatMap((section) => [
      wordParagraph(section.heading, "Heading2"),
      ...section.paragraphs.map((text) => wordParagraph(text)),
      ...section.list.map((text) => wordParagraph(`• ${text}`))
    ]),
    wordTable(definition.table),
    "<w:sectPr/>"
  ].join("")
  return createStoredZip([
    ["[Content_Types].xml", xml([
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
      "</Types>"
    ])],
    ["_rels/.rels", relationships([
      relationship("rId1", "officeDocument", "word/document.xml")
    ])],
    ["word/document.xml", xml([
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      `<w:body>${body}</w:body></w:document>`
    ])],
    ["word/_rels/document.xml.rels", relationships([
      relationship("rIdStyles", "styles", "styles.xml")
    ])],
    ["word/styles.xml", xml([
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>',
      "</w:styles>"
    ])]
  ])
}

function wordParagraph(text, style = "") {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function wordTable(rows) {
  return `<w:tbl>${rows.map((row) =>
    `<w:tr>${row.map((cell) => `<w:tc>${wordParagraph(cell)}</w:tc>`).join("")}</w:tr>`
  ).join("")}</w:tbl>`
}

function buildXlsx(definition) {
  const sheetEntries = []
  const relationshipsList = []
  const sheetDeclarations = []
  const contentOverrides = []
  definition.sheets.forEach((sheet, index) => {
    const sheetNumber = index + 1
    sheetDeclarations.push(
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheetNumber}" r:id="rId${sheetNumber}"/>`
    )
    relationshipsList.push(
      relationship(`rId${sheetNumber}`, "worksheet", `worksheets/sheet${sheetNumber}.xml`)
    )
    contentOverrides.push(
      `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    sheetEntries.push([
      `xl/worksheets/sheet${sheetNumber}.xml`,
      worksheetXml(sheet.rows)
    ])
  })
  return createStoredZip([
    ["[Content_Types].xml", xml([
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      ...contentOverrides,
      "</Types>"
    ])],
    ["_rels/.rels", relationships([
      relationship("rId1", "officeDocument", "xl/workbook.xml")
    ])],
    ["xl/workbook.xml", xml([
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      `<sheets>${sheetDeclarations.join("")}</sheets></workbook>`
    ])],
    ["xl/_rels/workbook.xml.rels", relationships(relationshipsList)],
    ...sheetEntries
  ])
}

function worksheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`
    }).join("")
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join("")
  return xml([
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData>${body}</sheetData></worksheet>`
  ])
}

function columnName(index) {
  let value = index
  let result = ""
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function buildPdf(pages) {
  const pageObjectIds = pages.map((_, index) => 3 + index)
  const fontObjectId = 3 + pages.length
  const contentObjectIds = pages.map((_, index) => fontObjectId + 1 + index)
  const objects = []
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`
  pages.forEach((lines, index) => {
    const pageId = pageObjectIds[index]
    const contentId = contentObjectIds[index]
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`
    const stream = renderPdfPage(lines)
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  })
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

  let output = "%PDF-1.4\n"
  const offsets = [0]
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "ascii")
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(output, "ascii")
  output += `xref\n0 ${objects.length}\n`
  output += "0000000000 65535 f \n"
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(output, "ascii")
}

function renderPdfPage(lines) {
  if (lines.length === 0) return ""
  const commands = ["BT", "/F1 12 Tf", "72 720 Td"]
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -18 Td")
    commands.push(`(${escapePdfString(line)}) Tj`)
  })
  commands.push("ET")
  return commands.join("\n")
}

function createStoredZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const [name, value] of entries) {
    assertSafeArchiveEntry(name)
    const nameBytes = Buffer.from(name, UTF8)
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, UTF8)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, nameBytes, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, ...centralParts, end])
}

function parseZipEntries(buffer) {
  const names = []
  let offset = 0
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString(UTF8))
    offset = nameStart + nameLength + extraLength + compressedSize
  }
  return names
}

function renderBazaarExpected(manifest) {
  return [
    "# Expected document inputs",
    "",
    "- DOCX: heading, paragraph, list, and rule table for RULE-DOC-001 through RULE-DOC-004.",
    "- XLSX: Rules and Verification sheets with matching rule rows.",
    "- PDF: page 1 text, empty page 2, and page 3 text with PDF-RULE-003.",
    "- Original files must not be pre-copied into bob-managed, bazaar-source, or .bob/review/rule-authoring.",
    "- If pdftotext is unavailable, record PRA-WIN-001 as blocked with note `Poppler unavailable`.",
    "",
    "## SHA-256",
    ...manifest.files.map((file) => `- \`${file.logicalName}\`: \`${file.sha256}\``),
    ""
  ].join("\n")
}

function renderConsistencyExpected(manifest) {
  return [
    "# Expected document extraction",
    "",
    "- review-input.yaml references requirements-and-design.docx and verification-matrix.xlsx.",
    "- supplemental-reference.pdf exists but is not referenced.",
    "- Expected markers: REQ-DOC-001, REQ-DOC-002, BD-DOC-001, TC-DOC-001, TC-DOC-002.",
    "- Confirm document-index.json, document-excerpts.md, and XLSX-derived table evidence.",
    "- Confirm the PDF path is absent from review-input.yaml and extraction outputs.",
    "",
    "## SHA-256",
    ...manifest.files.map((file) => `- \`${file.logicalName}\`: \`${file.sha256}\``),
    ""
  ].join("\n")
}

function xml(parts) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${parts.join("")}`
}

function relationships(items) {
  return xml([
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    items.join(""),
    "</Relationships>"
  ])
}

function relationship(id, type, target) {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapePdfString(value) {
  if (!/^[\x20-\x7E]*$/.test(value)) throw new Error("PDF fixture text must remain printable ASCII")
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function assertSafeArchiveEntry(name) {
  if (!name || path.posix.isAbsolute(name) || name.split("/").includes("..") || name.includes("\\")) {
    throw new Error(`Unsafe archive entry: ${name}`)
  }
}

function assertSafeLogicalName(name) {
  if (!name || path.basename(name) !== name || name.includes("/") || name.includes("\\")) {
    throw new Error(`Unsafe logical file name: ${name}`)
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function patchReviewInputAtomic(reviewInputPath) {
  const absolutePath = path.resolve(reviewInputPath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`review-input.yaml not found: ${absolutePath}`)
  }
  assertNoSymbolicLinkTraversal(path.dirname(absolutePath))
  if (fs.lstatSync(absolutePath).isSymbolicLink()) {
    throw new Error(`review-input.yaml must not be a symbolic link: ${absolutePath}`)
  }

  const originalBytes = fs.readFileSync(absolutePath)
  const original = originalBytes.toString(UTF8)
  if (!original.includes("id: REVIEW-AI-MATRIX-001")) {
    throw new Error("review-input.yaml is not the approved ai-verification-matrix fixture")
  }
  if (!original.includes("base: main") || !original.includes("head: feature/ai-verification-matrix")) {
    throw new Error("review-input.yaml base/head do not match the approved fixture")
  }
  for (const forbidden of [
    "docs/input-documents/requirements-and-design.docx",
    "docs/input-documents/verification-matrix.xlsx"
  ]) {
    if (original.includes(forbidden)) throw new Error(`Document fixture path already exists: ${forbidden}`)
  }
  if (original.includes("supplemental-reference.pdf")) {
    throw new Error("review-input.yaml must not reference supplemental-reference.pdf")
  }

  const newline = original.includes("\r\n") ? "\r\n" : "\n"
  let normalized = original.replace(/\r\n/g, "\n")
  const basicDesignAnchor = "  basic_design:\n"
  const ledgersAnchor = "  ledgers:\n"
  assertSingleAnchor(normalized, basicDesignAnchor, "artifacts.basic_design")
  assertSingleAnchor(normalized, ledgersAnchor, "artifacts.ledgers")

  const requirementEntry = [
    "    - path: docs/input-documents/requirements-and-design.docx",
    "      version: \"1.0\"",
    "      sections:",
    "        - REQ-DOC-001",
    "        - REQ-DOC-002",
    "        - BD-DOC-001",
    ""
  ].join("\n")
  const testEntry = [
    "    - path: docs/input-documents/verification-matrix.xlsx",
    "      version: \"1.0\"",
    "      sheets:",
    "        - Verification",
    "      rows:",
    "        - TC-DOC-001",
    "        - TC-DOC-002",
    ""
  ].join("\n")

  normalized = normalized.replace(basicDesignAnchor, `${requirementEntry}${basicDesignAnchor}`)
  normalized = normalized.replace(ledgersAnchor, `${testEntry}${ledgersAnchor}`)
  const patched = newline === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized
  validatePatchedReviewInput(original, patched)

  const temporaryPath = `${absolutePath}.document-fixture.tmp`
  if (fs.existsSync(temporaryPath)) {
    throw new Error(`Temporary review input already exists: ${temporaryPath}`)
  }
  try {
    fs.writeFileSync(temporaryPath, patched, { encoding: UTF8, flag: "wx" })
    const reread = fs.readFileSync(temporaryPath, UTF8)
    validatePatchedReviewInput(original, reread)
    fs.renameSync(temporaryPath, absolutePath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

function assertSingleAnchor(source, anchor, label) {
  const count = source.split(anchor).length - 1
  if (count !== 1) throw new Error(`${label} anchor must occur exactly once; found ${count}`)
}

function validatePatchedReviewInput(original, patched) {
  const required = [
    "docs/input-documents/requirements-and-design.docx",
    "REQ-DOC-001",
    "REQ-DOC-002",
    "BD-DOC-001",
    "docs/input-documents/verification-matrix.xlsx",
    "TC-DOC-001",
    "TC-DOC-002"
  ]
  for (const marker of required) {
    if (patched.split(marker).length - 1 !== 1) {
      throw new Error(`Patched review input must contain exactly one ${marker}`)
    }
  }
  if (patched.includes("supplemental-reference.pdf")) {
    throw new Error("Patched review input must not reference supplemental-reference.pdf")
  }
  for (const invariant of [
    "id: REVIEW-AI-MATRIX-001",
    "base: main",
    "head: feature/ai-verification-matrix",
    "review_focus:",
    "docs/requirements-ai-matrix.md",
    "docs/test-spec-ai-matrix.md"
  ]) {
    if (!original.includes(invariant) || !patched.includes(invariant)) {
      throw new Error(`Review input invariant changed or disappeared: ${invariant}`)
    }
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  buildProfileFiles,
  createStoredZip,
  parseZipEntries,
  patchReviewInputAtomic,
  sha256
}
