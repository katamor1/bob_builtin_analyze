import { JSON_SCHEMA, load } from "js-yaml"

function frontMatter(text: string): Record<string, unknown> | undefined {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return undefined
  const value: unknown = load(match[1], { schema: JSON_SCHEMA })
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function hasLegacyAgentResultLimit(text: string): boolean {
  const document = frontMatter(text)
  return Boolean(document && Array.isArray(document.steps) && document.steps.some(step =>
    step && typeof step === "object" && step.type === "agent" && Object.hasOwn(step, "maxResultBytes")
  ))
}

// Migrate the known block-style managed template without reserializing user text.
// Unusual YAML layouts use the existing full-template diff/confirmation instead.
export function migrateLegacyAgentResultLimits(current: string, template: string): string {
  try {
    if (!hasLegacyAgentResultLimit(current)) return template
    const lines = current.split(/(?<=\n)/)
    const start = lines.findIndex(line => /^steps:\s*(?:\r?\n)?$/.test(line))
    if (start < 0) return template
    let end = start + 1
    while (end < lines.length && !/^(?:---\s*$|[A-Za-z]\w*:)/.test(lines[end])) end += 1
    const first = lines.slice(start + 1, end).find(line => /^( *)-\s+/.test(line))
    if (!first) return template
    const indent = /^( *)-\s+/.exec(first)![1].length
    const stepStart = new RegExp(`^ {${indent}}-\\s+`)
    const property = new RegExp(`^ {${indent + 2}}maxResultBytes\\s*:`)
    const removed = new Set<number>()
    for (let index = start + 1; index < end;) {
      if (!stepStart.test(lines[index])) { index += 1; continue }
      let next = index + 1
      while (next < end && !stepStart.test(lines[next])) next += 1
      const parsed: unknown = load(lines.slice(index, next).join(""), { schema: JSON_SCHEMA })
      const step = Array.isArray(parsed) ? parsed[0] : undefined
      if (step && step.type === "agent" && Object.hasOwn(step, "maxResultBytes")) {
        for (let line = index; line < next; line += 1) if (property.test(lines[line])) removed.add(line)
      }
      index = next
    }
    if (!removed.size) return template
    const migrated = lines.filter((_, index) => !removed.has(index)).join("")
    const expected = frontMatter(current)!
    for (const step of expected.steps as Record<string, unknown>[]) {
      if (step.type === "agent") delete step.maxResultBytes
    }
    if (JSON.stringify(frontMatter(migrated)) !== JSON.stringify(expected)) return template
    return migrated
  } catch {
    return template
  }
}
