const { createStoredZip } = require("./storedZipFixture")
const zlib = require("node:zlib")

function createDocxFixture(options = {}) {
  const longParagraph = options.longParagraph ?? ""
  const documentBody = [
    paragraph("Engineering Rules", '<w:pStyle w:val="Heading1"/>'),
    paragraph("Review every change."),
    paragraph("Run the bounded checks.", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    [
      "<w:tbl>",
      "<w:tr>",
      tableCell("Rule"),
      tableCell("Required"),
      "</w:tr>",
      "<w:tr>",
      tableCell("Review"),
      tableCell("Yes"),
      "</w:tr>",
      "</w:tbl>"
    ].join(""),
    paragraph("Details", '<w:pStyle w:val="Heading2"/>'),
    paragraph("Unrecognised style content.", '<w:pStyle w:val="MissingStyle"/>'),
    [
      "<w:p><w:r><w:pict>",
      '<v:shape id="image1"><v:imagedata r:id="rIdImage"/></v:shape>',
      "</w:pict></w:r></w:p>"
    ].join(""),
    longParagraph ? paragraph(longParagraph) : ""
  ].join("")

  return zipEntries({
    "[Content_Types].xml": [
      xmlDeclaration(),
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Default Extension="png" ContentType="image/png"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
      "</Types>"
    ].join(""),
    "_rels/.rels": relationships([
      relationship("rId1", "officeDocument", "word/document.xml")
    ]),
    "word/document.xml": [
      xmlDeclaration(),
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ',
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
      'xmlns:v="urn:schemas-microsoft-com:vml"><w:body>',
      documentBody,
      "<w:sectPr/></w:body></w:document>"
    ].join(""),
    "word/styles.xml": [
      xmlDeclaration(),
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>',
      "</w:styles>"
    ].join(""),
    "word/numbering.xml": [
      xmlDeclaration(),
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>',
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
      "</w:numbering>"
    ].join(""),
    "word/_rels/document.xml.rels": relationships([
      relationship("rIdStyles", "styles", "styles.xml"),
      relationship("rIdNumbering", "numbering", "numbering.xml"),
      relationship("rIdImage", "image", "media/pixel.png")
    ]),
    "word/media/pixel.png": Buffer.from("89504e470d0a1a0a", "hex")
  }, options.additionalEntries, {
    deflate: options.deflate === true,
    dataDescriptor: options.dataDescriptor === true,
    dataDescriptorSignature: options.dataDescriptorSignature !== false
  })
}

function createXlsxFixture(options = {}) {
  const longCell = options.longCell ?? ""
  const omitStyles = options.omitStyles === true
  const includeSharedStrings = options.includeSharedStrings === true
  const secondSheetRows = [
    '<row r="1"><c r="B1" t="inlineStr"><is><t>beta</t></is></c><c r="D1" t="inlineStr"><is><t>delta</t></is></c></row>',
    '<row r="2"></row>',
    '<row r="3"><c r="A3" t="inlineStr"><is><t>cached</t></is></c><c r="C3" t="n"><f>1+1</f><v>2</v></c></row>',
    longCell ? `<row r="5"><c r="A5" t="inlineStr"><is><t>${escapeXml(longCell)}</t></is></c></row>` : ""
  ].join("")
  const firstSheetRows = '<row r="2"><c r="A2" t="inlineStr"><is><t>tail</t></is></c></row>'

  return zipEntries({
    "[Content_Types].xml": [
      xmlDeclaration(),
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      omitStyles ? "" : '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      includeSharedStrings ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : "",
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      "</Types>"
    ].join(""),
    "_rels/.rels": relationships([
      relationship("rId1", "officeDocument", "xl/workbook.xml")
    ]),
    "xl/workbook.xml": [
      xmlDeclaration(),
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheets><sheet name="Second" sheetId="1" r:id="rId1"/>',
      '<sheet name="First" sheetId="2" r:id="rId2"/></sheets></workbook>'
    ].join(""),
    "xl/_rels/workbook.xml.rels": relationships([
      relationship("rId1", "worksheet", "worksheets/sheet1.xml"),
      relationship("rId2", "worksheet", "worksheets/sheet2.xml"),
      ...(omitStyles ? [] : [relationship("rIdStyles", "styles", "styles.xml")]),
      ...(includeSharedStrings ? [relationship("rIdSharedStrings", "sharedStrings", "sharedStrings.xml")] : [])
    ]),
    ...(omitStyles ? {} : {
      "xl/styles.xml": [
        xmlDeclaration(),
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>',
        '<cellXfs count="1"><xf numFmtId="0" xfId="0"/></cellXfs>',
        "</styleSheet>"
      ].join("")
    }),
    ...(includeSharedStrings ? {
      "xl/sharedStrings.xml": [
        xmlDeclaration(),
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"></sst>'
      ].join("")
    } : {}),
    "xl/worksheets/sheet1.xml": worksheet(secondSheetRows),
    "xl/worksheets/sheet2.xml": worksheet(firstSheetRows)
  }, options.additionalEntries, {
    deflate: options.deflate === true,
    dataDescriptor: options.dataDescriptor === true,
    dataDescriptorSignature: options.dataDescriptorSignature !== false
  })
}

function paragraph(text, properties = "") {
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function tableCell(text) {
  return `<w:tc>${paragraph(text)}</w:tc>`
}

function worksheet(rows) {
  return `${xmlDeclaration()}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`
}

function relationships(items) {
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`
}

function relationship(id, type, target) {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`
}

function xmlDeclaration() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
}

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function zipEntries(entries, additionalEntries = [], options = {}) {
  return createStoredZip([...Object.entries(entries).map(([name, data]) => {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")
    const payload = options.deflate ? zlib.deflateRawSync(bytes) : bytes
    return {
      name,
      data: payload,
      crc32: crc32(bytes),
      flags: options.dataDescriptor ? 0x0008 : 0,
      compressionMethod: options.deflate ? 8 : 0,
      compressedSize: payload.length,
      uncompressedSize: bytes.length,
      localCrc32: options.dataDescriptor ? 0 : undefined,
      localCompressedSize: options.dataDescriptor ? 0 : undefined,
      localUncompressedSize: options.dataDescriptor ? 0 : undefined,
      dataDescriptor: options.dataDescriptor,
      dataDescriptorSignature: options.dataDescriptorSignature
    }
  }), ...additionalEntries])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

module.exports = { createDocxFixture, createXlsxFixture }
