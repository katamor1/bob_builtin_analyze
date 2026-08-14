import { splitDocumentChunk } from "../documentChunk"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoringLimits"
import type { DocumentChunkV1, RuleSourceExtractionStatus } from "../ruleAuthoringTypes"

type CheerioAPI = import("cheerio").CheerioAPI
type CheerioModule = typeof import("cheerio")
type MammothModule = typeof import("mammoth")

export interface DocxExtractionContext {
  sourceId: string
  maxChunkBytes: number
}

export interface DocxExtractionResult {
  chunks: DocumentChunkV1[]
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
}

const DOCX_EXTRACTOR = Object.freeze({ id: "docx-mammoth-html", version: "1" })

let cheerioModulePromise: Promise<CheerioModule> | undefined
let mammothModulePromise: Promise<MammothModule> | undefined

export async function extractDocx(
  documentBuffer: Buffer,
  context: DocxExtractionContext
): Promise<DocxExtractionResult> {
  const maxChunkBytes = boundedPositiveLimit(
    context.maxChunkBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes,
    "DOCX chunk byte limit"
  )
  const [mammoth, cheerio] = await Promise.all([loadMammoth(), loadCheerio()])
  const conversion = await mammoth.convertToHtml(
    { buffer: documentBuffer },
    {
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(async () => ({ src: "" }))
    }
  )
  const $ = cheerio.load(conversion.value)
  const warnings = new Set<string>()
  if (conversion.messages.length > 0) warnings.add("mammoth_warning")
  if ($("img").length > 0) warnings.add("image_omitted")

  const chunks: DocumentChunkV1[] = []
  const headingPath: string[] = []
  let tableIndex = 0

  $("body").children().each((blockIndex, element) => {
    const tag = (element as { tagName?: string }).tagName?.toLowerCase()
    const selection = $(element)
    if (tag && /^h[1-6]$/.test(tag)) {
      const text = normalizedText(selection.text())
      if (!text) return
      const level = Number(tag.slice(1))
      headingPath.splice(level - 1)
      headingPath[level - 1] = text
      chunks.push(...splitDocumentChunk({
        sourceId: context.sourceId,
        mediaType: "docx",
        kind: "heading",
        locator: { heading_path: compactHeadingPath(headingPath), block_index: blockIndex },
        title: text,
        text
      }, maxChunkBytes))
      return
    }

    if (tag === "table") {
      const currentTableIndex = tableIndex
      tableIndex += 1
      const text = tableText($, element)
      if (!text) return
      chunks.push(...splitDocumentChunk({
        sourceId: context.sourceId,
        mediaType: "docx",
        kind: "table",
        locator: {
          heading_path: compactHeadingPath(headingPath),
          block_index: blockIndex,
          table_index: currentTableIndex
        },
        title: headingPath.at(-1),
        text
      }, maxChunkBytes))
      return
    }

    if (tag === "ul" || tag === "ol") {
      const marker = tag === "ol" ? (index: number): string => `${index + 1}. ` : (): string => "- "
      const items = selection.children("li").toArray().map((item, index) => {
        const text = normalizedText($(item).text())
        return text ? `${marker(index)}${text}` : ""
      }).filter(Boolean)
      if (items.length === 0) return
      chunks.push(...splitDocumentChunk({
        sourceId: context.sourceId,
        mediaType: "docx",
        kind: "list",
        locator: { heading_path: compactHeadingPath(headingPath), block_index: blockIndex },
        title: headingPath.at(-1),
        text: items.join("\n")
      }, maxChunkBytes))
      return
    }

    if (tag === "p") {
      const textOnly = selection.clone()
      textOnly.find("img").remove()
      const text = normalizedText(textOnly.text())
      if (!text) return
      chunks.push(...splitDocumentChunk({
        sourceId: context.sourceId,
        mediaType: "docx",
        kind: "paragraph",
        locator: { heading_path: compactHeadingPath(headingPath), block_index: blockIndex },
        title: headingPath.at(-1),
        text
      }, maxChunkBytes))
    }
  })

  const warningCodes = [...warnings].sort()
  return {
    chunks,
    status: warningCodes.length === 0 ? "success" : "partial",
    warnings: warningCodes,
    extractor: { ...DOCX_EXTRACTOR }
  }
}

function boundedPositiveLimit(value: number, ceiling: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`)
  return Math.min(value, ceiling)
}

function tableText($: CheerioAPI, table: unknown): string {
  const rows: string[] = []
  $(table as never).find("tr").each((_, row) => {
    const cells: string[] = []
    $(row).children("th,td").each((__, cell) => {
      cells.push(normalizedText($(cell).text()))
    })
    if (cells.some(Boolean)) rows.push(cells.join("\t"))
  })
  return rows.join("\n")
}

function compactHeadingPath(headingPath: readonly string[]): string[] {
  return headingPath.filter((item) => Boolean(item))
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function loadCheerio(): Promise<CheerioModule> {
  cheerioModulePromise ??= import("cheerio")
  return cheerioModulePromise
}

function loadMammoth(): Promise<MammothModule> {
  mammothModulePromise ??= import("mammoth")
  return mammothModulePromise
}
