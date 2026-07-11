const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  DEFAULT_TRACEABILITY_CATALOG_PATH,
  DEFAULT_TRACEABILITY_GATE_REPORT_PATH,
  readTraceabilityCatalog,
  validateAndWriteTraceabilityGateReport,
  writeTraceabilityCatalog
} = require("../out/core/traceabilityCatalogStore")

async function makeWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "bob-trace-store-"))
}

test("readTraceabilityCatalog returns an empty sidecar catalog when missing", async () => {
  const workspaceRoot = await makeWorkspace()

  const result = await readTraceabilityCatalog({ workspaceRoot })

  assert.equal(result.status, "ok")
  assert.equal(result.created, true)
  assert.equal(result.catalogPath, path.join(workspaceRoot, DEFAULT_TRACEABILITY_CATALOG_PATH))
  assert.equal(result.revision, null)
  assert.deepEqual(result.catalog, {
    schema_version: 1,
    documents: [],
    domains: [],
    items: [],
    links: [],
    decisions: []
  })
})

test("readTraceabilityCatalog returns an opaque raw-content revision for an existing catalog", async () => {
  const workspaceRoot = await makeWorkspace()
  const written = await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDocument("initial") })

  const read = await readTraceabilityCatalog({ workspaceRoot })

  assert.equal(read.status, "ok")
  assert.match(read.revision, /^sha256:[a-f0-9]{64}$/)
  assert.equal(read.revision, written.revision)
  assert.equal(Object.hasOwn(read.catalog, "revision"), false)
})

test("writeTraceabilityCatalog backs up an existing sidecar before overwrite", async () => {
  const workspaceRoot = await makeWorkspace()
  const first = {
    schema_version: 1,
    documents: [],
    domains: [],
    items: [],
    links: [],
    decisions: []
  }
  const second = {
    ...first,
    documents: [{ document_id: "RS001", source_path: "docs/requirements.md", id_source: "extracted" }]
  }

  await writeTraceabilityCatalog({ workspaceRoot, catalog: first })
  const result = await writeTraceabilityCatalog({ workspaceRoot, catalog: second, backupExisting: true })

  assert.equal(result.status, "ok")
  assert.ok(result.backupPath)
  assert.equal(JSON.parse(await fs.readFile(result.backupPath, "utf8")).documents.length, 0)
  assert.equal(JSON.parse(await fs.readFile(result.catalogPath, "utf8")).documents.length, 1)
})

test("validateAndWriteTraceabilityGateReport writes the markdown gate report", async () => {
  const workspaceRoot = await makeWorkspace()
  await writeTraceabilityCatalog({
    workspaceRoot,
    catalog: {
      schema_version: 1,
      documents: [],
      domains: [],
      items: [],
      links: [],
      decisions: []
    }
  })

  const result = await validateAndWriteTraceabilityGateReport({ workspaceRoot })

  assert.equal(result.status, "ok")
  assert.equal(result.reportPath, path.join(workspaceRoot, DEFAULT_TRACEABILITY_GATE_REPORT_PATH))
  assert.match(await fs.readFile(result.reportPath, "utf8"), /# Traceability Gate Report/)
})

test("catalog compare-and-set allows one A/B writer and rejects the stale writer without another backup", async () => {
  const workspaceRoot = await makeWorkspace()
  await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDocument("initial") })
  const readerA = await readTraceabilityCatalog({ workspaceRoot })
  const readerB = await readTraceabilityCatalog({ workspaceRoot })
  assert.equal(readerA.status, "ok")
  assert.equal(readerB.status, "ok")
  assert.equal(readerA.revision, readerB.revision)

  const [writeA, writeB] = await Promise.all([
    writeTraceabilityCatalog({
      workspaceRoot,
      catalog: catalogWithDocument("writer-a"),
      backupExisting: true,
      expectedRevision: readerA.revision
    }),
    writeTraceabilityCatalog({
      workspaceRoot,
      catalog: catalogWithDocument("writer-b"),
      backupExisting: true,
      expectedRevision: readerB.revision
    })
  ])

  const winner = writeA.status === "ok" ? { result: writeA, label: "writer-a" } : { result: writeB, label: "writer-b" }
  const loser = writeA.status === "error" ? writeA : writeB
  assert.equal(winner.result.status, "ok")
  assert.match(winner.result.revision, /^sha256:[a-f0-9]{64}$/)
  assert.equal(loser.status, "error")
  assert.equal(loser.code, "stale_revision")
  assert.ok(loser.errors.some((error) => /stale|refresh|再読込|更新/i.test(error)))

  const final = JSON.parse(await fs.readFile(path.join(workspaceRoot, DEFAULT_TRACEABILITY_CATALOG_PATH), "utf8"))
  assert.equal(final.documents[0].document_id, winner.label)
  const backupNames = (await fs.readdir(path.join(workspaceRoot, ".bob-trace")))
    .filter((name) => name.includes("traceability-catalog.json.bak-"))
  assert.equal(backupNames.length, 1)
  const backup = JSON.parse(await fs.readFile(path.join(workspaceRoot, ".bob-trace", backupNames[0]), "utf8"))
  assert.equal(backup.documents[0].document_id, "initial")
})

test("catalog backups remain unique across same-second successful writes", async () => {
  const workspaceRoot = await makeWorkspace()
  const initial = await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDocument("initial") })
  const first = await writeTraceabilityCatalog({
    workspaceRoot,
    catalog: catalogWithDocument("first"),
    backupExisting: true,
    expectedRevision: initial.revision
  })
  assert.equal(first.status, "ok")
  const second = await writeTraceabilityCatalog({
    workspaceRoot,
    catalog: catalogWithDocument("second"),
    backupExisting: true,
    expectedRevision: first.revision
  })
  assert.equal(second.status, "ok")

  assert.notEqual(first.backupPath, second.backupPath)
  assert.equal(JSON.parse(await fs.readFile(first.backupPath, "utf8")).documents[0].document_id, "initial")
  assert.equal(JSON.parse(await fs.readFile(second.backupPath, "utf8")).documents[0].document_id, "first")
})

test("gate report expected revision rejects a changed catalog without writing a stale report", async () => {
  const workspaceRoot = await makeWorkspace()
  const initial = await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDocument("initial") })
  await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDocument("winner") })

  const result = await validateAndWriteTraceabilityGateReport({
    workspaceRoot,
    expectedRevision: initial.revision
  })

  assert.equal(result.status, "error")
  assert.equal(result.code, "stale_revision")
  await assert.rejects(fs.readFile(path.join(workspaceRoot, DEFAULT_TRACEABILITY_GATE_REPORT_PATH), "utf8"), /ENOENT/)
})

test("physical catalog aliases share one CAS queue for an existing target", async (t) => {
  const workspaceRoot = await makeWorkspace()
  const initial = await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDocument("initial") })
  const aliasPath = await createCatalogDirectoryAlias(t, workspaceRoot)
  if (!aliasPath) return
  const directRead = await readTraceabilityCatalog({ workspaceRoot })
  const aliasRead = await readTraceabilityCatalog({ workspaceRoot, catalogPath: aliasPath })
  assert.equal(directRead.status, "ok")
  assert.equal(aliasRead.status, "ok")
  assert.equal(directRead.revision, initial.revision)
  assert.equal(aliasRead.revision, initial.revision)

  const results = await Promise.all([
    writeTraceabilityCatalog({
      workspaceRoot,
      catalog: catalogWithDocument("direct-winner-candidate"),
      expectedRevision: directRead.revision
    }),
    writeTraceabilityCatalog({
      workspaceRoot,
      catalogPath: aliasPath,
      catalog: catalogWithDocument("alias-winner-candidate"),
      expectedRevision: aliasRead.revision
    })
  ])

  assert.deepEqual(results.map((result) => result.status).sort(), ["error", "ok"])
  assert.equal(results.find((result) => result.status === "error").code, "stale_revision")
})

test("physical catalog aliases share one CAS queue while the target is missing", async (t) => {
  const workspaceRoot = await makeWorkspace()
  await fs.mkdir(path.join(workspaceRoot, ".bob-trace"), { recursive: true })
  const aliasPath = await createCatalogDirectoryAlias(t, workspaceRoot)
  if (!aliasPath) return
  const directRead = await readTraceabilityCatalog({ workspaceRoot })
  const aliasRead = await readTraceabilityCatalog({ workspaceRoot, catalogPath: aliasPath })
  assert.equal(directRead.status, "ok")
  assert.equal(aliasRead.status, "ok")
  assert.equal(directRead.revision, null)
  assert.equal(aliasRead.revision, null)

  const results = await Promise.all([
    writeTraceabilityCatalog({
      workspaceRoot,
      catalog: catalogWithDocument("direct-create-candidate"),
      expectedRevision: directRead.revision
    }),
    writeTraceabilityCatalog({
      workspaceRoot,
      catalogPath: aliasPath,
      catalog: catalogWithDocument("alias-create-candidate"),
      expectedRevision: aliasRead.revision
    })
  ])

  assert.deepEqual(results.map((result) => result.status).sort(), ["error", "ok"])
  assert.equal(results.find((result) => result.status === "error").code, "stale_revision")
})

function catalogWithDocument(documentId) {
  return {
    schema_version: 1,
    documents: [{ document_id: documentId, source_path: `docs/${documentId}.md`, id_source: "extracted" }],
    domains: [],
    items: [],
    links: [],
    decisions: []
  }
}

async function createCatalogDirectoryAlias(t, workspaceRoot) {
  const customRoot = path.join(workspaceRoot, ".custom")
  const aliasDirectory = path.join(customRoot, "catalog-alias")
  await fs.mkdir(customRoot, { recursive: true })
  try {
    await fs.symlink(
      path.join(workspaceRoot, ".bob-trace"),
      aliasDirectory,
      process.platform === "win32" ? "junction" : "dir"
    )
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`directory alias unavailable: ${error.code}`)
      return undefined
    }
    throw error
  }
  return ".custom/catalog-alias/traceability-catalog.json"
}
