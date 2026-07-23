"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const extractorModulePath = require.resolve("../out/analyzers/documentExtractor")
const sharedRuntimeModulePath = require.resolve("../out/sharedProcessingBudgetRuntime")
const markdownExtractorModulePath = require.resolve("../out/analyzers/documentMarkdownExtractor")
const xlsxExtractorModulePath = require.resolve("../out/analyzers/documentXlsxExtractor")
const { extractDocuments } = require(extractorModulePath)

function loadExtractorWithPatches(patches) {
  const originals = []
  for (const [modulePath, overrides] of patches) {
    const moduleValue = require(modulePath)
    for (const [name, replacement] of Object.entries(overrides)) {
      originals.push([moduleValue, name, moduleValue[name]])
      moduleValue[name] = replacement
    }
  }
  delete require.cache[extractorModulePath]
  const loaded = require(extractorModulePath)
  return {
    extractDocuments: loaded.extractDocuments,
    restore() {
      delete require.cache[extractorModulePath]
      for (const [moduleValue, name, original] of originals.reverse()) moduleValue[name] = original
    }
  }
}

function inMemorySnapshot(filePath, bytes = Buffer.from("snapshot")) {
  return {
    path: filePath,
    byteLength: bytes.length,
    sha256: "0".repeat(64),
    identity: Object.freeze({ device: "1", inode: "1", size: String(bytes.length), modified_ns: "1", changed_ns: "1" }),
    copyBytes: () => Uint8Array.from(bytes),
    assertCurrent: async () => {}
  }
}

async function workspace(t, sizes) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-consistency-aggregate-budget-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, "docs"), { recursive: true })
  const paths = []
  for (const [index, size] of sizes.entries()) {
    const relative = `docs/source-${index}.md`
    await fs.writeFile(path.join(root, relative), `# REQ-${index}\n\n${"x".repeat(size)}`)
    paths.push(relative)
  }
  return { root, paths }
}

function input(paths) {
  return {
    schema_version: 1,
    review: { id: "REVIEW-BUDGET", title: "Budget", change_type: "bugfix", purpose: "budget", base: "base", head: "head", vcs: "git" },
    artifacts: { requirements: paths.map((documentPath, index) => ({ path: documentPath, sections: [`REQ-${index}`] })) },
    review_focus: ["requirement-code-consistency"]
  }
}

test("propagates a typed document-count failure instead of producing a partial warning", async (t) => {
  const fixture = await workspace(t, [1, 1])
  await assert.rejects(
    () => extractDocuments(input(fixture.paths), {
      workspaceRoot: fixture.root,
      limits: { maxDocumentBytes: 1024 },
      processingBudgetLimits: { document_count: 1 }
    }),
    (error) => error.code === "processing_budget_exceeded"
      && error.details.constrainedCategory === "document_count"
      && error.details.limit === 1
      && error.details.observed === 2
  )
})

test("aggregates source bytes across documents in one extraction operation", async (t) => {
  const fixture = await workspace(t, [32, 32])
  const firstSize = (await fs.stat(path.join(fixture.root, fixture.paths[0]))).size
  const secondSize = (await fs.stat(path.join(fixture.root, fixture.paths[1]))).size
  const limit = firstSize + secondSize - 1

  await assert.rejects(
    () => extractDocuments(input(fixture.paths), {
      workspaceRoot: fixture.root,
      limits: { maxDocumentBytes: 1024 },
      processingBudgetLimits: {
        total_document_bytes: limit,
        total_operation_input_bytes: limit
      }
    }),
    (error) => error.code === "processing_budget_exceeded"
      && error.details.constrainedCategory === "total_document_bytes"
      && error.details.limit === limit
      && error.details.observed === firstSize + secondSize
  )
})

test("reserves the complete document count before any bounded read or parser materialization", async (t) => {
  const fixture = await workspace(t, [1, 1])
  let reads = 0
  let parses = 0
  const patched = loadExtractorWithPatches([
    [sharedRuntimeModulePath, {
      readBoundedDocumentFile: async ({ filePath }) => {
        reads += 1
        return inMemorySnapshot(filePath)
      }
    }],
    [markdownExtractorModulePath, {
      extractMarkdownChunks: () => {
        parses += 1
        return []
      }
    }]
  ])
  try {
    await assert.rejects(
      () => patched.extractDocuments(input(fixture.paths), {
        workspaceRoot: fixture.root,
        limits: { maxDocumentBytes: 1024 },
        processingBudgetLimits: { document_count: 1 }
      }),
      (error) => error.code === "processing_budget_exceeded"
        && error.details.constrainedCategory === "document_count"
        && error.details.observed === 2
    )
  } finally {
    patched.restore()
  }
  assert.equal(reads, 0)
  assert.equal(parses, 0)
})

test("pre-aborted cancellation fails before any document path is read", async () => {
  const controller = new AbortController()
  const reason = new Error("operator cancelled")
  controller.abort(reason)
  await assert.rejects(
    () => extractDocuments(input(["docs/never-read.md"]), {
      workspaceRoot: path.join(os.tmpdir(), "missing-cancelled-workspace"),
      signal: controller.signal
    }),
    (error) => error === reason
  )
})

test("propagates XLSX safety failures instead of downgrading them to warnings", async (t) => {
  const fixture = await workspace(t, [1])
  const xlsxPath = fixture.paths[0].replace(/\.md$/, ".xlsx")
  await fs.rename(path.join(fixture.root, fixture.paths[0]), path.join(fixture.root, xlsxPath))
  const safety = Object.assign(new Error("unsafe workbook XML"), { code: "xlsx_xml_unsafe" })
  const patched = loadExtractorWithPatches([
    [sharedRuntimeModulePath, {
      readBoundedDocumentFile: async ({ filePath }) => inMemorySnapshot(filePath, Buffer.from("xlsx")),
      preflightOoxmlArchive: () => ({
        documentKind: "xlsx",
        entryCount: 0,
        expandedBytes: 0,
        entries: Object.freeze([]),
        copyEntry: () => undefined
      })
    }],
    [xlsxExtractorModulePath, {
      extractXlsxChunks: async () => { throw safety }
    }]
  ])
  try {
    await assert.rejects(
      () => patched.extractDocuments(input([xlsxPath]), { workspaceRoot: fixture.root }),
      (error) => error === safety
    )
  } finally {
    patched.restore()
  }
})

test("derives local sheet and row caps from lower aggregate overrides", async () => {
  const result = await extractDocuments(input([]), {
    workspaceRoot: os.tmpdir(),
    processingBudgetLimits: { total_sheets: 1, total_rows: 1 }
  })
  assert.deepEqual(result.documents, [])
})

test("allows the same workspace file to be selected as distinct document references", async (t) => {
  const fixture = await workspace(t, [1])
  const fileSize = (await fs.stat(path.join(fixture.root, fixture.paths[0]))).size
  const reviewInput = input([])
  reviewInput.artifacts = {
    requirements: [{ path: fixture.paths[0], sections: ["REQ-0"] }],
    detailed_design: [{ path: fixture.paths[0], sections: ["REQ-0"] }]
  }

  const result = await extractDocuments(reviewInput, {
    workspaceRoot: fixture.root,
    limits: { maxDocumentBytes: fileSize },
    processingBudgetLimits: {
      total_document_bytes: fileSize * 2,
      total_operation_input_bytes: fileSize * 2
    }
  })

  assert.equal(result.documents.length, 2)
  assert.equal(result.warnings.some((warning) => warning.includes("failed to extract")), false, JSON.stringify(result.warnings))
})
