const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { createLockedRawPackage, createBobProfile } = require("./workflowContractV2CompilerTestSupport")
const { canonicalJsonBytes } = require("../out/core/contractV2/canonicalJson.js")

function subject() {
  let value = {}
  try { value = require("../scripts/lib/workflow-contract-v2-environment.js") }
  catch (error) { if (error.code !== "MODULE_NOT_FOUND" || !error.message.includes("workflow-contract-v2-environment.js")) throw error }
  assert.equal(typeof value.createWorkflowContractV2EvidenceEnvironment, "function", "P7 evidence environment is not implemented")
  return value
}
function canonical(value) { return Buffer.concat([canonicalJsonBytes(value), Buffer.from("\n")]) }
function declaration(id = "sample.collect") {
  const schema = { id: "schemas/io.json", bytes: 2, digest: `sha256:${"a".repeat(64)}` }
  return { id, version: "1.2.3", inputSchema: schema, output: { kind: "unit" }, errorSchema: schema,
    sideEffect: "none", idempotency: "idempotent", requiredCapabilities: [] }
}
function repository(t, providers = []) {
  const base = path.resolve(os.tmpdir()), root = fs.mkdtempSync(path.join(base, "p7-catalog-"))
  t.after(() => { assert.ok(path.resolve(root).startsWith(base + path.sep)); assert.equal(fs.lstatSync(root).isSymbolicLink(), false); fs.rmSync(root, { recursive: true, force: true }) })
  fs.writeFileSync(path.join(root, "providers.json"), canonical({ schemaVersion: "workflow-provider-catalog-source/v1", providers }))
  return root
}
function environment(s, root, file = "providers.json") {
  return s.createWorkflowContractV2EvidenceEnvironment({ repositoryRoot: root, providerCatalogPath: file })
}
function compile(environment) {
  const api = require("../out/core/contractV2/index.js")
  const result = api.compileWorkflowPackage({ rawPackage: createLockedRawPackage().rawPackage, environment })
  assert.equal(result.ok, true)
  return result.handle
}

test("owned catalog declarations produce detached non-leaseable evidence independent of registration order", async (t) => {
  const s = subject(), root = repository(t, [declaration("z.collect"), declaration("a.collect")])
  const first = await environment(s, root)
  fs.writeFileSync(path.join(root, "providers.json"), canonical({ schemaVersion: "workflow-provider-catalog-source/v1", providers: [declaration("a.collect"), declaration("z.collect")] }))
  const second = await environment(s, root)
  const a = compile(first), b = compile(second)
  assert.equal(a.planDigest, b.planDigest)
  assert.deepEqual(a.plan, b.plan)
  assert.equal(require("../out/core/contractV2/compiledPlan.js").isCompiledWorkflowPlanLeasable(a), false)
  const empty = await environment(s, repository(t))
  assert.equal(compile(empty).planDigest, a.planDigest, "unused declarations must not alter package evidence")
})

test("owned catalog rejects JSON evidence hydration and malformed declaration fields", async (t) => {
  const s = subject(), root = repository(t)
  for (const document of [
    { schemaVersion: "workflow-provider-catalog/v2", providers: [] },
    { schemaVersion: "workflow-provider-catalog-source/v1", providers: [], brand: true },
    { schemaVersion: "workflow-provider-catalog-source/v1", providers: [{ ...declaration(), contractDigest: `sha256:${"b".repeat(64)}` }] },
    { schemaVersion: "workflow-provider-catalog-source/v1", providers: [{ ...declaration(), dispatch: "external" }] },
    { schemaVersion: "workflow-provider-catalog-source/v1", providers: [declaration(), declaration()] }
  ]) {
    fs.writeFileSync(path.join(root, "providers.json"), canonical(document))
    await assert.rejects(() => environment(s, root))
  }
})

test("evidence environment retains trusted owned registry delegates after prototype replacement", async (t) => {
  const s = subject(), root = repository(t, [declaration()])
  const { ActionRegistry } = require("../out/core/actionRegistry.js")
  const { WorkflowProviderRegistry } = require("../out/core/contractV2/providerRegistry.js")
  const replacements = [
    [ActionRegistry.prototype, "registerWorkflowProviderContract"],
    [ActionRegistry.prototype, "snapshotWorkflowProviderCatalog"],
    [WorkflowProviderRegistry.prototype, "register"],
    [WorkflowProviderRegistry.prototype, "snapshot"]
  ].map(([object, key]) => ({ object, key, original: object[key] }))
  let redirected = 0
  for (const item of replacements) item.object[item.key] = () => { redirected += 1; throw new Error("untrusted replacement") }
  let result
  try { result = await environment(s, root) }
  finally { for (const item of replacements) item.object[item.key] = item.original }
  assert.equal(compile(result).plan.workflowId, "minimal")
  assert.equal(redirected, 0)
})

test("control files reject noncanonical bytes, escaping paths and one-over size", async (t) => {
  const s = subject(), root = repository(t)
  fs.writeFileSync(path.join(root, "bad.json"), "{\"schemaVersion\":\"workflow-provider-catalog-source/v1\",\"providers\":[]}\r\n")
  await assert.rejects(() => environment(s, root, "bad.json"), /canonical/i)
  await assert.rejects(() => environment(s, root, "../escape.json"), /segment|relative/i)
  fs.writeFileSync(path.join(root, "large.json"), Buffer.alloc(8 * 1024 * 1024 + 1, 32))
  await assert.rejects(() => environment(s, root, "large.json"), /large/i)
})

test("control declarations reject one-over provider and collection counts", async (t) => {
  const s = subject(), root = repository(t, Array.from({ length: 257 }, (_, i) => declaration(`provider.a${i}`)))
  await assert.rejects(() => environment(s, root))
  fs.writeFileSync(path.join(root, "collections.json"), canonical({ schemaVersion: "workflow-contract-v2-collections/v1", collections: Array.from({ length: 257 }, (_, i) => `collections/a${i}`) }))
  await assert.rejects(() => s.readWorkflowContractV2Collections({ repositoryRoot: root, collectionsPath: "collections.json" }))
})

test("control file growth during read is rejected within the byte bound", async (t) => {
  const helper = path.resolve(__dirname, "../scripts/lib/workflow-contract-v2-environment.js")
  const fsp = require("node:fs/promises"), originalOpen = fsp.open
  const root = repository(t), file = path.join(root, "providers.json")
  const allowed = fs.statSync(file).size + 1
  let observedBytes = 0, grown = false
  fsp.open = async (...args) => {
    const handle = await originalOpen(...args)
    const grow = () => { if (!grown) { grown = true; fs.appendFileSync(file, Buffer.alloc(9 * 1024 * 1024, 32)) } }
    const originalReadFile = handle.readFile.bind(handle), originalRead = handle.read.bind(handle)
    handle.readFile = async (...values) => { grow(); const bytes = await originalReadFile(...values); observedBytes += bytes.length; return bytes }
    handle.read = async (...values) => { grow(); const result = await originalRead(...values); observedBytes += result.bytesRead; return result }
    return handle
  }
  delete require.cache[helper]
  try {
    const s = subject()
    await assert.rejects(() => environment(s, root), /changed|large/i)
    assert.ok(observedBytes <= allowed, `read ${observedBytes} bytes after file identity changed; maximum ${allowed}`)
  } finally { fsp.open = originalOpen; delete require.cache[helper] }
})
test("control file read rejects a different opened inode before reading", async (t) => {
  const helper = path.resolve(__dirname, "../scripts/lib/workflow-contract-v2-environment.js")
  const fsp = require("node:fs/promises"), originalOpen = fsp.open
  const root = repository(t), provider = path.join(root, "providers.json"), alternate = path.join(root, "alternate.json")
  const collections = path.join(root, "collections.json"), alternateCollections = path.join(root, "alternate-collections.json")
  fs.writeFileSync(alternate, canonical({ schemaVersion: "workflow-provider-catalog-source/v1", providers: [declaration()] }))
  fs.writeFileSync(collections, canonical({ schemaVersion: "workflow-contract-v2-collections/v1", collections: [] }))
  fs.writeFileSync(alternateCollections, canonical({ schemaVersion: "workflow-contract-v2-collections/v1", collections: ["collections/other"] }))
  const redirects = new Map([[await fsp.realpath(provider), alternate], [await fsp.realpath(collections), alternateCollections]])
  for (const [before, opened] of redirects) assert.notEqual(fs.statSync(before, { bigint: true }).ino, fs.statSync(opened, { bigint: true }).ino)
  let reads = 0, closes = 0, opens = 0
  fsp.open = async (file, ...args) => {
    const redirected = redirects.get(file)
    const handle = await originalOpen(redirected || file, ...args)
    if (redirected) {
      opens += 1
      const read = handle.read.bind(handle), close = handle.close.bind(handle)
      handle.read = async (...values) => { reads += 1; return read(...values) }
      handle.close = async () => { closes += 1; return close() }
    }
    return handle
  }
  delete require.cache[helper]
  try {
    const s = subject()
    await assert.rejects(() => environment(s, root), /changed|identity/i)
    await assert.rejects(() => s.readWorkflowContractV2Collections({ repositoryRoot: root, collectionsPath: "collections.json" }), /changed|identity/i)
    assert.equal(opens, 2)
    assert.equal(reads, 0, "identity mismatch must reject before allocating/reading control bytes")
    assert.equal(closes, 2, "both mismatched descriptors must close")
  } finally { fsp.open = originalOpen; delete require.cache[helper] }
})
test('bytes environment and collection factories share the existing owned canonical boundary',async t=>{
 const s=subject();assert.equal(typeof s.createWorkflowContractV2EvidenceEnvironmentFromBytes,'function','captured provider bytes factory is missing');assert.equal(typeof s.readWorkflowContractV2CollectionsFromBytes,'function','captured collection bytes factory is missing');
 const document={schemaVersion:'workflow-provider-catalog-source/v1',providers:[declaration('unused.collect')]},bytes=canonical(document),root=repository(t,document.providers),fromBytes=s.createWorkflowContractV2EvidenceEnvironmentFromBytes({providerCatalogBytes:bytes}),fromFile=await environment(s,root);bytes.fill(0);assert.deepEqual(compile(fromBytes).plan,compile(fromFile).plan);assert.equal(require('../out/core/contractV2/compiledPlan.js').isCompiledWorkflowPlanLeasable(compile(fromBytes)),false);const collections=s.readWorkflowContractV2CollectionsFromBytes({collectionsBytes:canonical({schemaVersion:'workflow-contract-v2-collections/v1',collections:['collections/a']})});assert.deepEqual(collections,['collections/a']);assert.equal(Object.isFrozen(collections),true);
});

test('bytes controls reject hostile inputs and preserve canonical LF and count limits',()=>{
 const s=subject();assert.equal(typeof s.createWorkflowContractV2EvidenceEnvironmentFromBytes,'function','captured provider bytes factory is missing');const valid=canonical({schemaVersion:'workflow-provider-catalog-source/v1',providers:[]});
 for(const bytes of [valid.subarray(0,valid.length-1),Buffer.from(valid.toString().replace(/\n/g,'\r\n')),Buffer.concat([Buffer.from([239,187,191]),valid]),canonical({schemaVersion:'workflow-provider-catalog/v2',providers:[]}),canonical({schemaVersion:'workflow-provider-catalog-source/v1',providers:[declaration(),declaration()]}),Buffer.alloc(8*1024*1024+1,32)])assert.throws(()=>s.createWorkflowContractV2EvidenceEnvironmentFromBytes({providerCatalogBytes:bytes}));
 let getters=0;const request={};Object.defineProperty(request,'providerCatalogBytes',{enumerable:true,get(){getters++;return valid;}});assert.throws(()=>s.createWorkflowContractV2EvidenceEnvironmentFromBytes(request));assert.equal(getters,0);assert.throws(()=>s.createWorkflowContractV2EvidenceEnvironmentFromBytes(new Proxy({providerCatalogBytes:valid},{})));assert.throws(()=>s.createWorkflowContractV2EvidenceEnvironmentFromBytes({providerCatalogBytes:valid,lookup(){}}));
 const hostile=Buffer.from(valid);Object.defineProperty(hostile,'length',{get(){getters++;return 1;}});s.createWorkflowContractV2EvidenceEnvironmentFromBytes({providerCatalogBytes:hostile});assert.equal(getters,0);
 assert.throws(()=>s.readWorkflowContractV2CollectionsFromBytes({collectionsBytes:canonical({schemaVersion:'workflow-contract-v2-collections/v1',collections:Array.from({length:257},(_,i)=>'collections/a'+i)})}));
});
