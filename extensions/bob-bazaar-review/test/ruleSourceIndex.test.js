const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const { test } = require("node:test")

const {
  buildRuleSourceIndex,
  serializeRuleSourceIndex
} = require("../out/ruleAuthoring/sourceIndex")

const ONE_MIB = 1024 * 1024

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function source(sourceByte, logicalName) {
  const digest = sourceByte.repeat(64)
  return {
    source_id: `src-${digest.slice(0, 12)}`,
    logical_name: logicalName,
    media_type: logicalName.endsWith(".pdf") ? "pdf" : "docx",
    sha256: digest,
    byte_size: 4096,
    extraction_status: "success",
    extractor: { id: "fixture", version: "1.0" },
    warnings: []
  }
}

function chunk(sourceId, label, text, locator = { page: 1 }) {
  return {
    schema_version: "bob-bazaar-review/document-chunk/v1",
    chunk_id: `chunk-${sha256(label)}`,
    source_id: sourceId,
    kind: "paragraph",
    locator,
    title: `Title ${label}`,
    text,
    text_sha256: sha256(text),
    flags: []
  }
}

function manifest(sources) {
  return {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: "2026-07-14T12:34:56.000Z",
    sources
  }
}

test("buildRuleSourceIndex has deterministic source and chunk ordering", () => {
  const firstSource = source("1", "engineering.docx")
  const secondSource = source("2", "quality.pdf")
  const firstChunk = chunk(firstSource.source_id, "z-last", "Engineering policy", {
    heading_path: ["Engineering"],
    block_index: 2
  })
  const secondChunk = chunk(secondSource.source_id, "a-first", "Quality policy", { page: 3 })
  const thirdChunk = chunk(firstSource.source_id, "m-middle", "Review policy", {
    heading_path: ["Review"],
    block_index: 1
  })

  const forward = buildRuleSourceIndex(
    manifest([secondSource, firstSource]),
    [firstChunk, secondChunk, thirdChunk],
    ONE_MIB
  )
  const reversed = buildRuleSourceIndex(
    manifest([firstSource, secondSource]),
    [thirdChunk, secondChunk, firstChunk],
    ONE_MIB
  )

  assert.deepEqual(forward, reversed)
  assert.deepEqual(forward.sources.map((entry) => entry.source_id), [
    firstSource.source_id,
    secondSource.source_id
  ])
  for (const entry of forward.sources) {
    assert.deepEqual(
      entry.chunks.map((item) => item.chunk_id),
      entry.chunks.map((item) => item.chunk_id).toSorted()
    )
  }
})

test("buildRuleSourceIndex emits bounded metadata instead of full source text", () => {
  const manifestSource = source("3", "rules.pdf")
  const privatePath = "/Users/alice/private/customer/rules.pdf"
  const secret = "super-secret-bearer-token"
  const privateText = `Read ${privatePath}. Authorization: Bearer ${secret}. ${"confidential ".repeat(80)}`
  const inputChunk = chunk(manifestSource.source_id, "private", privateText, {
    heading_path: [`Policy stored at ${privatePath}`],
    page: 7
  })
  inputChunk.title = `Rules from ${privatePath}`

  const index = buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], ONE_MIB)
  const indexed = index.sources[0].chunks[0]
  const serialized = JSON.stringify(index)

  assert.deepEqual(Object.keys(index), ["schema_version", "generated_at", "sources"])
  assert.equal(index.schema_version, "bob-bazaar-review/rule-source-index/v1")
  assert.equal(indexed.text_byte_size, Buffer.byteLength(privateText, "utf8"))
  assert.equal(indexed.text_sha256, sha256(privateText))
  assert.ok(Buffer.byteLength(indexed.preview, "utf8") <= 240)
  assert.equal(Object.hasOwn(indexed, "text"), false)
  assert.doesNotMatch(serialized, /\/Users\/alice\/private/)
  assert.doesNotMatch(serialized, /super-secret-bearer-token/)
  assert.doesNotMatch(serialized, new RegExp(privateText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(indexed.preview, /\[REDACTED_(?:PATH|SECRET)\]/)
})

test("buildRuleSourceIndex redacts Windows slash paths, UNC forms, and root files", () => {
  const manifestSource = source("8", "rules.pdf")
  const sensitivePaths = [
    "C:/Users/alice/private/rules.pdf",
    "D:\\Users\\alice\\private\\rules.pdf",
    "//server/share/private/rules.pdf",
    "\\\\server\\share\\private\\rules.pdf",
    "path://server/share/alice/rules.pdf",
    "UNC://server/share/alice/rules.pdf",
    "path:\\\\server\\share\\alice\\rules.pdf",
    "UNC:\\\\server\\share\\alice\\rules.pdf",
    "📁/home/alice/private.pdf",
    "📁//server/share/alice/private.pdf",
    "📁/✓",
    "📁\\🔒",
    "✈️/home/alice/private.pdf",
    "❤️/home/alice/private.pdf",
    "✅/home/alice/private.pdf",
    "✅\\❌",
    "○/home/alice/private.pdf",
    "✅/❌/home/alice/private.pdf",
    "1️⃣/home",
    "1️⃣\\home",
    "https://[bad]/home/alice/private.pdf",
    "https:///home/alice/private.pdf",
    "https:////server/share/alice/private.pdf",
    "http:///C:/Users/alice/private.pdf",
    "HTTPS:///秘密/規約.pdf",
    "https://./home/alice/private.pdf",
    "https://../home/alice/private.pdf",
    "https://\\server\\share\\alice\\private.pdf",
    "https://example.com\\Users\\alice\\private.pdf",
    "https://example.com/C:\\Users\\alice\\private.pdf",
    "file:/home/alice/private/rules.pdf",
    "file:///C:/Users/alice/private/rules.pdf",
    "file:///private/rules.pdf",
    "[/home/alice/bracket/rules.pdf]",
    "path:/home/alice/labeled/rules.pdf",
    "{/home/alice/braced/rules.pdf}",
    "\\Users\\alice\\rooted\\rules.pdf",
    "/private-rule.pdf"
  ]
  const privateText = sensitivePaths.join(" ")
  const inputChunk = chunk(manifestSource.source_id, "portable-paths", privateText, {
    heading_path: sensitivePaths,
    page: 7
  })
  inputChunk.title = privateText

  const serialized = JSON.stringify(buildRuleSourceIndex(
    manifest([manifestSource]),
    [inputChunk],
    ONE_MIB
  ))

  for (const sensitivePath of sensitivePaths) {
    assert.equal(serialized.includes(sensitivePath), false, `leaked ${sensitivePath}`)
  }
  assert.match(serialized, /\[REDACTED_PATH\]/)
})

test("buildRuleSourceIndex preserves public web URLs while redacting labeled local paths", () => {
  const manifestSource = source("a", "rules.pdf")
  const publicUrl = "https://example.com/public/rules"
  const privatePath = "path:/home/alice/private/rules.pdf"
  const text = "See " + publicUrl + " and " + privatePath
  const inputChunk = chunk(manifestSource.source_id, "url-boundary", text)

  const serialized = JSON.stringify(buildRuleSourceIndex(
    manifest([manifestSource]),
    [inputChunk],
    ONE_MIB
  ))

  assert.match(serialized, /https:\/\/example\.com\/public\/rules/)
  assert.equal(serialized.includes(privatePath), false)
  assert.match(serialized, /\[REDACTED_PATH\]/)
})

test("buildRuleSourceIndex preserves Unicode slash prose and internationalized web URLs", () => {
  const manifestSource = source("b", "rules.pdf")
  const preservedText = [
    "設計/実装ルール",
    "入力/出力の検証",
    "café/menu",
    "cafe\u0301/menu",
    "a\u0301\u0327/menu",
    "a\u0301/menu/item",
    "правила/проверки",
    "✅/❌",
    "○/×",
    "◯/×",
    "〇/×",
    "△/○",
    "✓/✕",
    "×/÷",
    "→/←",
    "★/☆",
    "https://例え.テスト/規約",
    "https://пример.рф/правила",
    "https://[2001:db8::1]/public/rules",
    "https://[::1]/規約"
  ]
  const privatePath = "パス:/home/alice/private/rules.pdf"
  const inputChunk = chunk(
    manifestSource.source_id,
    "unicode-slash-boundary",
    `${preservedText.join(" ")} ${privatePath}`,
    { heading_path: preservedText, page: 1 }
  )
  inputChunk.title = privatePath

  const serialized = JSON.stringify(buildRuleSourceIndex(
    manifest([manifestSource]),
    [inputChunk],
    ONE_MIB
  ))

  for (const value of preservedText) {
    assert.equal(serialized.includes(value), true, `altered ${value}`)
  }
  assert.equal(serialized.includes(privatePath), false)
  assert.match(serialized, /\[REDACTED_PATH\]/)
})

test("buildRuleSourceIndex redacts local paths embedded in public URL queries", () => {
  const manifestSource = source("c", "rules.pdf")
  const urls = [
    "https://例え.テスト/規約?source=/home/alice/private/rules.pdf&lang=ja",
    "https://example.com/rules?source=file:///home/alice/private/rules.pdf&mode=full",
    "https://example.com/rules?source=C:\\Users\\alice\\private\\rules.pdf&lang=ja",
    "https://example.com/rules#source=/home/alice/private/rules.pdf",
    "https://example.com/rules?source=/✓&later=ok",
    "https://example.com/rules#source=/📁&later=ok"
  ]
  const inputChunk = chunk(
    manifestSource.source_id,
    "url-query-path",
    urls.join(" "),
    { heading_path: urls, page: 1 }
  )

  const index = buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], ONE_MIB)
  const indexed = index.sources[0].chunks[0]

  assert.deepEqual(indexed.locator.heading_path, [
    "https://例え.テスト/規約?source=[REDACTED_PATH]&lang=ja",
    "https://example.com/rules?source=[REDACTED_PATH]&mode=full",
    "https://example.com/rules?source=[REDACTED_PATH]&lang=ja",
    "https://example.com/rules#source=[REDACTED_PATH]",
    "https://example.com/rules?source=[REDACTED_PATH]&later=ok",
    "https://example.com/rules#source=[REDACTED_PATH]&later=ok"
  ])
  assert.equal(JSON.stringify(indexed).includes("/home/alice/private"), false)
  assert.equal(JSON.stringify(indexed).includes("file:///"), false)
  assert.equal(JSON.stringify(indexed).includes("C:\\Users\\alice"), false)
})

test("buildRuleSourceIndex redacts UNC paths embedded in public URL queries", () => {
  const manifestSource = source("d", "rules.pdf")
  const sensitivePaths = [
    "//server/share/alice/private.pdf",
    "\\\\server\\share\\alice\\private.pdf",
    "path://server/share/alice/private.pdf"
  ]
  const urls = sensitivePaths.map((privatePath, index) => (
    `https://example.com/rules/${index}?source=${privatePath}&lang=ja`
  ))
  const inputChunk = chunk(manifestSource.source_id, "url-query-unc", urls.join(" "), {
    heading_path: urls,
    page: 1
  })

  const index = buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], ONE_MIB)
  const indexed = index.sources[0].chunks[0]
  const serialized = JSON.stringify(indexed)

  for (const privatePath of sensitivePaths) {
    assert.equal(serialized.includes(privatePath), false, `leaked ${privatePath}`)
  }
  for (const heading of indexed.locator.heading_path) {
    assert.match(heading, /\[REDACTED_PATH\]&lang=ja$/)
  }
})

test("buildRuleSourceIndex preserves nested public URLs while redacting their local query paths", () => {
  const manifestSource = source("e", "rules.pdf")
  const nestedPublicUrl = "https://[::1]/規約"
  const privatePath = "/home/alice/private/rules.pdf"
  const text = `https://example.com/redirect?next=${nestedPublicUrl}?source=${privatePath}&lang=ja`
  const inputChunk = chunk(manifestSource.source_id, "nested-url-query", text)

  const index = buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], ONE_MIB)
  const preview = index.sources[0].chunks[0].preview

  assert.equal(preview.includes(nestedPublicUrl), true)
  assert.equal(preview.includes(privatePath), false)
  assert.match(preview, /\[REDACTED_PATH\]/)
  assert.match(preview, /&lang=ja$/)
})

test("buildRuleSourceIndex fails closed beyond the nested public URL depth limit", () => {
  const manifestSource = source("0", "rules.pdf")
  const privatePath = "/home/alice/private/rules.pdf"
  let text = privatePath
  for (let depth = 0; depth < 6; depth += 1) {
    text = `https://nested-${depth}.example/rules?next=${text}`
  }
  const inputChunk = chunk(manifestSource.source_id, "nested-url-depth", text)

  const index = buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], ONE_MIB)
  const preview = index.sources[0].chunks[0].preview

  assert.equal(preview.includes(privatePath), false)
  assert.match(preview, /\[REDACTED_PATH\]/)
})

test("buildRuleSourceIndex validates source membership and chunk hashes without leaking input", () => {
  const manifestSource = source("4", "rules.pdf")
  const leakedPath = "/private/source/rules.pdf"
  const leakedText = `do not print ${leakedPath}`
  const unknownSourceChunk = chunk(leakedPath, "unknown-source", leakedText)
  const badHashChunk = {
    ...chunk(manifestSource.source_id, "bad-hash", leakedText),
    text_sha256: "0".repeat(64)
  }

  for (const invalidChunk of [unknownSourceChunk, badHashChunk]) {
    assert.throws(
      () => buildRuleSourceIndex(manifest([manifestSource]), [invalidChunk], ONE_MIB),
      (error) => {
        assert.match(error.message, /chunk/i)
        assert.doesNotMatch(error.message, /\/private\/source/)
        assert.doesNotMatch(error.message, /do not print/)
        return true
      }
    )
  }
})

test("buildRuleSourceIndex rejects a non-v1 manifest schema without echoing it", () => {
  const manifestSource = source("6", "rules.pdf")
  const inputChunk = chunk(manifestSource.source_id, "wrong-schema", "Policy")
  const injectedVersion = "bob-bazaar-review/rule-sources/v2-/private/customer"

  assert.throws(
    () => buildRuleSourceIndex({
      ...manifest([manifestSource]),
      schema_version: injectedVersion
    }, [inputChunk], ONE_MIB),
    (error) => {
      assert.match(error.message, /manifest.*schema/i)
      assert.doesNotMatch(error.message, /private\/customer/)
      return true
    }
  )
})

test("source index byte limit uses its canonical persisted serialization", () => {
  const manifestSource = source("7", "rules.pdf")
  const inputChunk = chunk(manifestSource.source_id, "canonical-size", "Policy 🙂")
  const index = buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], ONE_MIB)
  const canonical = serializeRuleSourceIndex(index)
  const compactBytes = Buffer.byteLength(JSON.stringify(index), "utf8")
  const canonicalBytes = Buffer.byteLength(canonical, "utf8")

  assert.equal(canonical, `${JSON.stringify(index, null, 2)}\n`)
  assert.ok(canonicalBytes > compactBytes)
  assert.deepEqual(
    buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], canonicalBytes),
    index
  )
  assert.throws(
    () => buildRuleSourceIndex(manifest([manifestSource]), [inputChunk], canonicalBytes - 1),
    /source index.*byte limit/i
  )
})

test("buildRuleSourceIndex hard-fails above one MiB instead of adapting previews", () => {
  const manifestSource = source("5", "rules.pdf")
  const chunks = Array.from({ length: 3_000 }, (_, index) => chunk(
    manifestSource.source_id,
    `large-${index.toString().padStart(4, "0")}`,
    `${index.toString().padStart(4, "0")}:${"x".repeat(400)}`,
    { page: index + 1 }
  ))
  assert.throws(
    () => buildRuleSourceIndex(manifest([manifestSource]), chunks, ONE_MIB),
    /source index.*byte limit/i
  )
  assert.throws(
    () => buildRuleSourceIndex(manifest([manifestSource]), chunks, 8 * ONE_MIB),
    /source index.*byte limit/i,
    "a caller must not raise the approved one MiB ceiling"
  )
})

test("buildRuleSourceIndex rejects impossible source/chunk counts before processing entries", () => {
  const manifestSource = source("9", "rules.pdf")
  const repeatedChunk = chunk(manifestSource.source_id, "bounded-count", "Policy")
  const tooManyChunks = Array(8_193).fill(repeatedChunk)
  const tooManySources = Array.from({ length: 21 }, (_, index) => source(
    (index + 10).toString(16),
    `rules-${index}.pdf`
  ))

  assert.throws(
    () => buildRuleSourceIndex(manifest([manifestSource]), tooManyChunks, ONE_MIB),
    /chunk count.*limit/i
  )
  assert.throws(
    () => buildRuleSourceIndex(manifest(tooManySources), [], ONE_MIB),
    /source count.*limit/i
  )
})

test("buildRuleSourceIndex bounds raw display fields before redaction", () => {
  const manifestSource = source("f", "rules.pdf")
  const exactText = "x".repeat(32 * 1024)
  const exactChunk = chunk(manifestSource.source_id, "exact-display-bound", exactText)

  assert.doesNotThrow(() => buildRuleSourceIndex(
    manifest([manifestSource]),
    [exactChunk],
    ONE_MIB
  ))

  const oversizedText = chunk(
    manifestSource.source_id,
    "oversized-display-text",
    "x".repeat((32 * 1024) + 1)
  )
  const oversizedMultibyteTitle = {
    ...chunk(manifestSource.source_id, "oversized-display-title", "Policy"),
    title: "é".repeat((16 * 1024) + 1)
  }
  const tooManyHeadings = chunk(manifestSource.source_id, "too-many-headings", "Policy", {
    heading_path: Array(65).fill("Heading"),
    page: 1
  })
  const oversizedHeading = chunk(manifestSource.source_id, "oversized-heading", "Policy", {
    heading_path: ["x".repeat((32 * 1024) + 1)],
    page: 1
  })

  for (const invalid of [oversizedText, oversizedMultibyteTitle, tooManyHeadings, oversizedHeading]) {
    assert.throws(
      () => buildRuleSourceIndex(manifest([manifestSource]), [invalid], ONE_MIB),
      /chunk|display field|heading/i
    )
  }
})
