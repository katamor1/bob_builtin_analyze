export type ManagedMarkdownKind = "CTX" | "PRM"

const PARSED_MANAGED_MARKDOWN = Symbol("parsed-managed-markdown")
const PARSED_MANAGED_MARKDOWN_IDENTITIES = new WeakSet<object>()

export interface ManagedMarkdownSection {
  readonly id: string
  readonly kind: ManagedMarkdownKind
  readonly heading: string
  readonly markdown: string
  /** The exact managed span, including a close-marker line ending when present. */
  readonly raw: string
  /** The line ending used by the opening marker. */
  readonly newline: "\n" | "\r\n"
  /** The exact line ending following the closing marker, or empty at EOF. */
  readonly trailingNewline: "" | "\n" | "\r\n"
}

export interface ManualMarkdownSegment {
  readonly type: "manual"
  readonly text: string
}

export interface ManagedMarkdownSegment {
  readonly type: "managed"
  readonly section: ManagedMarkdownSection
}

export type ManagedMarkdownSegmentValue = ManualMarkdownSegment | ManagedMarkdownSegment

export interface ParsedManagedMarkdown {
  readonly [PARSED_MANAGED_MARKDOWN]: true
  readonly kind: ManagedMarkdownKind
  readonly newline: "\n" | "\r\n"
  readonly hasFinalNewline: boolean
  readonly sections: readonly ManagedMarkdownSection[]
  readonly segments: readonly ManagedMarkdownSegmentValue[]
}

export interface AddManagedMarkdownDecision {
  readonly operation: "add"
  /** Allocated by the host. Proposal candidate IDs are never accepted here. */
  readonly assignedSectionId: string
  readonly heading: string
  readonly markdown: string
}

export interface UpdateManagedMarkdownDecision {
  readonly operation: "update"
  readonly targetSectionId: string
  readonly heading: string
  readonly markdown: string
}

export interface RetireManagedMarkdownDecision {
  readonly operation: "retire"
  readonly targetSectionId: string
}

export type ManagedMarkdownDecision =
  | AddManagedMarkdownDecision
  | UpdateManagedMarkdownDecision
  | RetireManagedMarkdownDecision

interface TextLine {
  readonly start: number
  readonly end: number
  readonly content: string
  readonly newline: "" | "\n" | "\r\n"
}

interface ParsedMarker {
  readonly closing: boolean
  readonly prefix: string
  readonly id: string
}

interface OpenSection {
  readonly id: string
  readonly start: number
  readonly contentStart: number
  readonly newline: "\n" | "\r\n"
}

interface LocatedSection {
  readonly start: number
  readonly end: number
  readonly section: ManagedMarkdownSection
}

const MARKER_TOKEN = "bob-managed-section"
const EXACT_MARKER = /^<!-- (\/?)bob-managed-section:([A-Za-z]{3})-([0-9]{4}) -->$/
const MARKER_LIKE_COMMENT = /<!--[^\r\n]*bob-managed-section/i
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

export function parseManagedMarkdown(text: string, kind: ManagedMarkdownKind): ParsedManagedMarkdown {
  assertKind(kind)
  if (typeof text !== "string") throw new Error("Managed Markdown text must be a string")

  const locatedSections: LocatedSection[] = []
  const seenIds = new Set<string>()
  let open: OpenSection | undefined

  for (const line of splitLines(text)) {
    const marker = parseMarker(line.content)
    if (!marker) {
      if (open && line.content.toLowerCase().includes(MARKER_TOKEN)) {
        throw new Error("Managed section marker text is not allowed inside managed content")
      }
      if (MARKER_LIKE_COMMENT.test(line.content)) {
        throw new Error("Managed section marker line is malformed")
      }
      continue
    }

    if (marker.prefix !== kind) {
      throw new Error("Managed section marker uses the wrong prefix")
    }
    assertMarkerId(marker.id, kind)

    if (!marker.closing) {
      if (open) throw new Error("Managed section marker cannot be nested")
      if (seenIds.has(marker.id)) throw new Error("Duplicate managed section ID")
      if (line.newline === "") throw new Error("Managed section marker is missing its closing marker")
      open = {
        id: marker.id,
        start: line.start,
        contentStart: line.end,
        newline: line.newline
      }
      seenIds.add(marker.id)
      continue
    }

    if (!open) throw new Error("Managed section marker has an orphan closing marker")
    if (marker.id !== open.id) throw new Error("Managed section marker IDs do not match")

    const content = text.slice(open.contentStart, line.start)
    const parsedContent = parseManagedContent(content)
    assertManagedContent(parsedContent.heading, parsedContent.markdown)
    const raw = text.slice(open.start, line.end)
    locatedSections.push({
      start: open.start,
      end: line.end,
      section: {
        id: open.id,
        kind,
        heading: parsedContent.heading,
        markdown: parsedContent.markdown,
        raw,
        newline: open.newline,
        trailingNewline: line.newline
      }
    })
    open = undefined
  }

  if (open) throw new Error("Managed section marker is missing its closing marker")

  const sections = locatedSections.map((located) => located.section)
  const segments: ManagedMarkdownSegmentValue[] = []
  let cursor = 0
  for (const located of locatedSections) {
    if (located.start > cursor) {
      segments.push({ type: "manual", text: text.slice(cursor, located.start) })
    }
    segments.push({ type: "managed", section: located.section })
    cursor = located.end
  }
  if (cursor < text.length) segments.push({ type: "manual", text: text.slice(cursor) })

  const firstNewline = text.match(/\r\n|\n/)
  const parsed = freezeParsedManagedMarkdown({
    [PARSED_MANAGED_MARKDOWN]: true,
    kind,
    newline: firstNewline?.[0] === "\r\n" ? "\r\n" : "\n",
    hasFinalNewline: /(?:\r\n|\n)$/.test(text),
    sections,
    segments
  })
  PARSED_MANAGED_MARKDOWN_IDENTITIES.add(parsed)
  return parsed
}

export function applyManagedMarkdownOperations(
  parsed: ParsedManagedMarkdown,
  decisions: readonly ManagedMarkdownDecision[]
): string {
  if (!isParsedManagedMarkdown(parsed)) {
    throw new Error("A parsed managed Markdown document is required")
  }
  assertKind(parsed.kind)
  if (!Array.isArray(decisions)) throw new Error("Managed Markdown decisions must be an array")

  const existing = new Map(parsed.sections.map((section) => [section.id, section]))
  const reservedIds = new Set(existing.keys())
  const mutatedTargets = new Set<string>()
  const replacements = new Map<string, UpdateManagedMarkdownDecision | RetireManagedMarkdownDecision>()
  const additions: AddManagedMarkdownDecision[] = []

  for (const decision of decisions) {
    if (!decision || typeof decision !== "object") {
      throw new Error("Managed Markdown decision is invalid")
    }
    switch (decision.operation) {
      case "add": {
        assertSectionId(decision.assignedSectionId, parsed.kind)
        assertManagedContent(decision.heading, decision.markdown)
        if (reservedIds.has(decision.assignedSectionId)) {
          throw new Error("Managed section ID already exists")
        }
        reservedIds.add(decision.assignedSectionId)
        additions.push(decision)
        break
      }
      case "update": {
        assertExistingTarget(decision.targetSectionId, parsed.kind, existing)
        assertManagedContent(decision.heading, decision.markdown)
        assertSingleTargetMutation(decision.targetSectionId, mutatedTargets)
        replacements.set(decision.targetSectionId, decision)
        break
      }
      case "retire": {
        assertExistingTarget(decision.targetSectionId, parsed.kind, existing)
        assertSingleTargetMutation(decision.targetSectionId, mutatedTargets)
        replacements.set(decision.targetSectionId, decision)
        break
      }
      default:
        throw new Error("Managed Markdown decision operation is invalid")
    }
  }

  let output = parsed.segments.map((segment) => {
    if (segment.type === "manual") return segment.text
    const replacement = replacements.get(segment.section.id)
    if (!replacement) return segment.section.raw
    if (replacement.operation === "retire") return ""
    return renderManagedSection(
      replacement.targetSectionId,
      replacement.heading,
      replacement.markdown,
      segment.section.newline,
      segment.section.trailingNewline
    )
  }).join("")

  if (additions.length === 0) return output
  if (output.length > 0 && !/(?:\r\n|\n)$/.test(output)) output += parsed.newline

  for (let index = 0; index < additions.length; index += 1) {
    const addition = additions[index]
    const trailingNewline = index < additions.length - 1 || parsed.hasFinalNewline
      ? parsed.newline
      : ""
    output += renderManagedSection(
      addition.assignedSectionId,
      addition.heading,
      addition.markdown,
      parsed.newline,
      trailingNewline
    )
  }
  return output
}

function splitLines(text: string): TextLine[] {
  const lines: TextLine[] = []
  let start = 0
  while (start < text.length) {
    const lineFeed = text.indexOf("\n", start)
    if (lineFeed < 0) {
      lines.push({
        start,
        end: text.length,
        content: text.slice(start),
        newline: ""
      })
      break
    }
    const crlf = lineFeed > start && text[lineFeed - 1] === "\r"
    const contentEnd = crlf ? lineFeed - 1 : lineFeed
    lines.push({
      start,
      end: lineFeed + 1,
      content: text.slice(start, contentEnd),
      newline: crlf ? "\r\n" : "\n"
    })
    start = lineFeed + 1
  }
  return lines
}

function parseMarker(line: string): ParsedMarker | undefined {
  const match = EXACT_MARKER.exec(line)
  if (!match) return undefined
  return {
    closing: match[1] === "/",
    prefix: match[2],
    id: `${match[2]}-${match[3]}`
  }
}

function assertMarkerId(id: string, kind: ManagedMarkdownKind): void {
  if (!new RegExp(`^${kind}-[0-9]{4}$`).test(id) || id.endsWith("-0000")) {
    throw new Error("Managed section marker ID is malformed")
  }
}

function assertSectionId(id: string, kind: ManagedMarkdownKind): void {
  if (typeof id !== "string" || !new RegExp(`^${kind}-[0-9]{4}$`).test(id) || id.endsWith("-0000")) {
    throw new Error("Managed section ID does not match the document kind")
  }
}

function assertKind(kind: string): asserts kind is ManagedMarkdownKind {
  if (kind !== "CTX" && kind !== "PRM") throw new Error("Managed Markdown kind must be CTX or PRM")
}

function parseManagedContent(content: string): { heading: string; markdown: string } {
  const firstBreak = content.search(/\r\n|\n/)
  if (firstBreak < 0) throw new Error("Managed section content is malformed")
  const firstLine = content.slice(0, firstBreak)
  const headingMatch = /^## (.+)$/.exec(firstLine)
  if (!headingMatch) throw new Error("Managed section content is malformed")

  const firstNewline = content.startsWith("\r\n", firstBreak) ? "\r\n" : "\n"
  const afterHeading = content.slice(firstBreak + firstNewline.length)
  const blankLineLength = afterHeading.startsWith("\r\n")
    ? 2
    : afterHeading.startsWith("\n") ? 1 : 0
  if (blankLineLength === 0) throw new Error("Managed section content is malformed")

  return {
    heading: headingMatch[1],
    markdown: removeOneFinalNewline(afterHeading.slice(blankLineLength))
  }
}

function removeOneFinalNewline(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2)
  if (value.endsWith("\n")) return value.slice(0, -1)
  return value
}

function assertManagedContent(heading: string, markdown: string): void {
  if (
    typeof heading !== "string" ||
    heading.trim().length === 0 ||
    /[\r\n]/.test(heading) ||
    DISALLOWED_CONTROL.test(heading) ||
    heading.toLowerCase().includes(MARKER_TOKEN)
  ) {
    throw new Error("Managed section content has an invalid heading")
  }
  if (
    typeof markdown !== "string" ||
    DISALLOWED_CONTROL.test(markdown) ||
    markdown.toLowerCase().includes(MARKER_TOKEN)
  ) {
    throw new Error("Managed section content has an invalid Markdown body")
  }
}

function assertExistingTarget(
  targetSectionId: string,
  kind: ManagedMarkdownKind,
  existing: ReadonlyMap<string, ManagedMarkdownSection>
): void {
  assertSectionId(targetSectionId, kind)
  if (!existing.has(targetSectionId)) throw new Error("Managed section target does not exist")
}

function assertSingleTargetMutation(targetSectionId: string, mutatedTargets: Set<string>): void {
  if (mutatedTargets.has(targetSectionId)) {
    throw new Error("Managed section target cannot be changed more than once")
  }
  mutatedTargets.add(targetSectionId)
}

function renderManagedSection(
  id: string,
  heading: string,
  markdown: string,
  newline: "\n" | "\r\n",
  trailingNewline: "" | "\n" | "\r\n"
): string {
  const normalizedMarkdown = markdown.replace(/\r\n|\r|\n/g, newline)
  const bodyTerminator = normalizedMarkdown.length > 0 && !normalizedMarkdown.endsWith(newline)
    ? newline
    : ""
  return `<!-- bob-managed-section:${id} -->${newline}` +
    `## ${heading}${newline}${newline}` +
    normalizedMarkdown +
    bodyTerminator +
    `<!-- /bob-managed-section:${id} -->${trailingNewline}`
}

function freezeParsedManagedMarkdown(parsed: ParsedManagedMarkdown): ParsedManagedMarkdown {
  for (const section of parsed.sections) Object.freeze(section)
  for (const segment of parsed.segments) Object.freeze(segment)
  Object.freeze(parsed.sections)
  Object.freeze(parsed.segments)
  return Object.freeze(parsed)
}

function isParsedManagedMarkdown(value: unknown): value is ParsedManagedMarkdown {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as Partial<ParsedManagedMarkdown>)[PARSED_MANAGED_MARKDOWN] === true &&
    PARSED_MANAGED_MARKDOWN_IDENTITIES.has(value)
  )
}
