const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  applyManagedMarkdownOperations,
  parseManagedMarkdown
} = require("../out/ruleAuthoring/managedMarkdownSections")

function marker(kind, id, closing = false) {
  return `<!-- ${closing ? "/" : ""}bob-managed-section:${kind}-${id} -->`
}

function section(kind, id, heading, markdown, newline = "\n", finalNewline = true) {
  return [
    marker(kind, id),
    `## ${heading}`,
    "",
    markdown,
    marker(kind, id, true)
  ].join(newline) + (finalNewline ? newline : "")
}

test("parses ordered CTX sections while preserving every input byte in raw segments", () => {
  const first = section("CTX", "0001", "State ownership", "Only services mutate state.")
  const second = section("CTX", "0007", "Failure handling", "Retry only idempotent work.", "\n", false)
  const text = `Manual preface.\n\n${first}Manual between sections.\n${second}`

  const parsed = parseManagedMarkdown(text, "CTX")

  assert.equal(parsed.kind, "CTX")
  assert.equal(parsed.newline, "\n")
  assert.equal(parsed.hasFinalNewline, false)
  assert.deepEqual(
    parsed.sections.map(({ id, kind, heading, markdown, raw, newline, trailingNewline }) => ({
      id,
      kind,
      heading,
      markdown,
      raw,
      newline,
      trailingNewline
    })),
    [
      {
        id: "CTX-0001",
        kind: "CTX",
        heading: "State ownership",
        markdown: "Only services mutate state.",
        raw: first,
        newline: "\n",
        trailingNewline: "\n"
      },
      {
        id: "CTX-0007",
        kind: "CTX",
        heading: "Failure handling",
        markdown: "Retry only idempotent work.",
        raw: second,
        newline: "\n",
        trailingNewline: ""
      }
    ]
  )
  assert.deepEqual(parsed.segments.map((segment) => segment.type), [
    "manual",
    "managed",
    "manual",
    "managed"
  ])
  assert.equal(parsed.segments[0].text, "Manual preface.\n\n")
  assert.equal(parsed.segments[1].section.raw, first)
  assert.equal(parsed.segments[2].text, "Manual between sections.\n")
  assert.equal(parsed.segments[3].section.raw, second)
  assert.equal(
    parsed.segments.map((segment) => segment.type === "manual" ? segment.text : segment.section.raw).join(""),
    text
  )
  assert.equal(applyManagedMarkdownOperations(parsed, []), text)
})

test("preserves CRLF and a final newline through retained, updated, and added sections", () => {
  const existing = section("PRM", "0002", "Old heading", "Old body", "\r\n")
  const text = `Manual prefix\r\n${existing}Manual suffix\r\n`
  const parsed = parseManagedMarkdown(text, "PRM")

  const output = applyManagedMarkdownOperations(parsed, [
    {
      operation: "update",
      targetSectionId: "PRM-0002",
      heading: "New heading",
      markdown: "First line\nSecond line"
    },
    {
      operation: "add",
      assignedSectionId: "PRM-0003",
      heading: "Added heading",
      markdown: "Added body"
    }
  ])

  assert.equal(
    output,
    "Manual prefix\r\n" +
      section("PRM", "0002", "New heading", "First line\r\nSecond line", "\r\n") +
      "Manual suffix\r\n" +
      section("PRM", "0003", "Added heading", "Added body", "\r\n")
  )
  assert.equal(output.includes("\n") && !output.replaceAll("\r\n", "").includes("\n"), true)
  assert.equal(output.endsWith("\r\n"), true)
})

test("preserves no-final-newline documents and appends adds deterministically in decision order", () => {
  const text = "Manual text without a final newline"
  const parsed = parseManagedMarkdown(text, "CTX")
  const decisions = [
    {
      operation: "add",
      assignedSectionId: "CTX-0004",
      heading: "First",
      markdown: "First body"
    },
    {
      operation: "add",
      assignedSectionId: "CTX-0005",
      heading: "Second",
      markdown: "Second body"
    }
  ]

  const first = applyManagedMarkdownOperations(parsed, decisions)
  const second = applyManagedMarkdownOperations(parsed, decisions)
  const expected = text + "\n" +
    section("CTX", "0004", "First", "First body", "\n") +
    section("CTX", "0005", "Second", "Second body", "\n", false)

  assert.equal(first, expected)
  assert.equal(second, expected)
  assert.equal(first.endsWith("\n"), false)
  assert.equal(parsed.segments[0].text, text)
})

test("updates and retires only managed spans while preserving manual prefix, suffix, and gaps", () => {
  const first = section("CTX", "0001", "Keep", "Before")
  const second = section("CTX", "0002", "Retire", "Remove me", "\n", false)
  const prefix = "# Manual title\n\n"
  const gap = "Manual gap that must survive.\n\n"
  const suffix = "Manual suffix without a final newline"
  const parsed = parseManagedMarkdown(prefix + first + gap + second + "\n" + suffix, "CTX")

  const output = applyManagedMarkdownOperations(parsed, [
    {
      operation: "update",
      targetSectionId: "CTX-0001",
      heading: "Updated",
      markdown: "After"
    },
    { operation: "retire", targetSectionId: "CTX-0002" }
  ])

  assert.equal(output, prefix + section("CTX", "0001", "Updated", "After") + gap + suffix)
  assert.equal(output.startsWith(prefix), true)
  assert.equal(output.includes(gap), true)
  assert.equal(output.endsWith(suffix), true)
})

test("rejects malformed, wrong-prefix, mismatched, orphaned, missing, nested, and duplicate markers", () => {
  const validOpen = marker("CTX", "0001")
  const validClose = marker("CTX", "0001", true)
  const cases = [
    ["wrong prefix", section("PRM", "0001", "Heading", "Body", "\n", false)],
    ["malformed ID", "<!-- bob-managed-section:CTX-1 -->\n## Heading\n\nBody\n<!-- /bob-managed-section:CTX-1 -->"],
    ["leading whitespace", ` ${validOpen}\n## Heading\n\nBody\n${validClose}`],
    ["trailing whitespace", `${validOpen} \n## Heading\n\nBody\n${validClose}`],
    ["mismatched close", `${validOpen}\n## Heading\n\nBody\n${marker("CTX", "0002", true)}`],
    ["orphan close", validClose],
    ["missing close", `${validOpen}\n## Heading\n\nBody`],
    ["nested marker", `${validOpen}\n${marker("CTX", "0002")}\n${validClose}\n${marker("CTX", "0002", true)}`],
    ["inline malformed marker", `Manual ${validOpen}\n`],
    ["zero ID", "<!-- bob-managed-section:CTX-0000 -->\n## Heading\n\nBody\n<!-- /bob-managed-section:CTX-0000 -->"]
  ]

  for (const [label, text] of cases) {
    assert.throws(() => parseManagedMarkdown(text, "CTX"), /managed section marker/i, label)
  }

  const duplicate = section("CTX", "0001", "First", "Body") +
    section("CTX", "0001", "Second", "Body", "\n", false)
  assert.throws(() => parseManagedMarkdown(duplicate, "CTX"), /duplicate managed section/i)
})

test("rejects malformed or unsafe content inside otherwise exact markers", () => {
  const open = marker("CTX", "0001")
  const close = marker("CTX", "0001", true)
  const malformedContent = [
    `${open}\nnot a level-two heading\n${close}`,
    `${open}\n## Heading\nBody without the required blank separator\n${close}`,
    `${open}\n## \n\nBody\n${close}`,
    `${open}\n## Heading\n\nunsafe\u0085body\n${close}`,
    `${open}\n## unsafe\u009fheading\n\nBody\n${close}`
  ]

  for (const text of malformedContent) {
    assert.throws(() => parseManagedMarkdown(text, "CTX"), /managed section content/i)
  }
})

test("rejects marker text inside managed content but permits ordinary manual discussion", () => {
  const manual = "The phrase bob-managed-section is documented here.\n"
  assert.equal(parseManagedMarkdown(manual, "CTX").segments[0].text, manual)

  const collision = `${marker("CTX", "0001")}\n## Heading\n\nDo not emit bob-managed-section here.\n${marker("CTX", "0001", true)}`
  assert.throws(() => parseManagedMarkdown(collision, "CTX"), /managed section marker/i)
})

test("rejects add ID collisions, wrong-kind targets, missing targets, and repeated decisions", () => {
  const parsed = parseManagedMarkdown(section("CTX", "0001", "Existing", "Body", "\n", false), "CTX")

  assert.throws(
    () => applyManagedMarkdownOperations(parsed, [{
      operation: "add",
      assignedSectionId: "CTX-0001",
      heading: "Collision",
      markdown: "Body"
    }]),
    /already exists/i
  )
  assert.throws(
    () => applyManagedMarkdownOperations(parsed, [{
      operation: "add",
      assignedSectionId: "PRM-0002",
      heading: "Wrong kind",
      markdown: "Body"
    }]),
    /section id/i
  )
  assert.throws(
    () => applyManagedMarkdownOperations(parsed, [{
      operation: "update",
      targetSectionId: "CTX-0009",
      heading: "Missing",
      markdown: "Body"
    }]),
    /does not exist/i
  )
  assert.throws(
    () => applyManagedMarkdownOperations(parsed, [
      {
        operation: "update",
        targetSectionId: "CTX-0001",
        heading: "One",
        markdown: "Body"
      },
      { operation: "retire", targetSectionId: "CTX-0001" }
    ]),
    /more than once/i
  )
})

test("rejects marker collisions and unsafe controls in add or update content", () => {
  const parsed = parseManagedMarkdown("Manual", "PRM")
  const unsafe = [
    { heading: "bad\nheading", markdown: "Body" },
    { heading: "Heading", markdown: "bad\u0000body" },
    { heading: "Heading", markdown: "bad\u0085body" },
    { heading: "bad\u009fheading", markdown: "Body" },
    { heading: "Heading", markdown: "<!-- bob-managed-section:PRM-0009 -->" },
    { heading: "BOB-MANAGED-SECTION", markdown: "Body" }
  ]

  for (const content of unsafe) {
    assert.throws(
      () => applyManagedMarkdownOperations(parsed, [{
        operation: "add",
        assignedSectionId: "PRM-0001",
        ...content
      }]),
      /managed section content/i
    )
  }
})

test("returns a deeply frozen parser result and rejects forged parsed documents", () => {
  const parsed = parseManagedMarkdown(section("CTX", "0001", "Existing", "Body"), "CTX")

  assert.equal(Object.isFrozen(parsed), true)
  assert.equal(Object.isFrozen(parsed.sections), true)
  assert.equal(Object.isFrozen(parsed.sections[0]), true)
  assert.equal(Object.isFrozen(parsed.segments), true)
  assert.equal(Object.isFrozen(parsed.segments[0]), true)
  assert.throws(() => parsed.sections.push({}), TypeError)

  const forgedSection = {
    id: "CTX-0001",
    kind: "CTX",
    heading: "Forged",
    markdown: "Manual text",
    raw: "Manual text",
    newline: "\n",
    trailingNewline: ""
  }
  const forged = Object.freeze({
    [Object.getOwnPropertySymbols(parsed)[0]]: true,
    kind: "CTX",
    newline: "\n",
    hasFinalNewline: false,
    sections: Object.freeze([Object.freeze(forgedSection)]),
    segments: Object.freeze([Object.freeze({ type: "managed", section: forgedSection })])
  })

  assert.throws(
    () => applyManagedMarkdownOperations(forged, [{ operation: "retire", targetSectionId: "CTX-0001" }]),
    /parsed managed markdown document/i
  )
})

test("rejects invalid parser kinds without touching the input", () => {
  const text = "Manual"
  assert.throws(() => parseManagedMarkdown(text, "PRJ"), /managed markdown kind/i)
  assert.equal(text, "Manual")
})
