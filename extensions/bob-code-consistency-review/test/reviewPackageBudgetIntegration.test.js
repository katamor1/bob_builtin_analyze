"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test, mock } = require("node:test")

const {
  buildReviewPackage,
  computeManagedReviewPackageBytes
} = require("../out/core/reviewPackageBuilder")
const runtime = require("../out/shared-processing-budget-runtime")
const makeOperation = (overrides,signal) => runtime.createProcessingOperation({ profile: runtime.normalizeProcessingBudgetProfile(overrides), signal })

function fixture(workspace, outDir, processingOperation, limits = {}) {
  return {
    workspaceRoot: workspace,
    outDir,
    reviewInput: {
      schema_version: 1,
      review: {
        id: "REVIEW-PACKAGE-BUDGET",
        title: "Package budget",
        change_type: "bugfix",
        purpose: "budget verification",
        base: "base",
        head: "head",
        vcs: "git"
      },
      artifacts: { requirements: [] },
      review_focus: ["requirement-code-consistency"]
    },
    diff: {
      vcs: "git",
      vcsRoot: workspace,
      base: "base",
      head: "head",
      files: [],
      unifiedDiff: "",
      warnings: []
    },
    documents: {
      documents: [],
      excerptsMarkdown: "",
      evidence: [],
      warnings: []
    },
    codeAnalysis: {
      changedSymbols: [],
      functions: [],
      defines: [],
      globals: [],
      callGraph: [],
      rtForbiddenCandidates: [],
      codeSlices: [],
      evidence: [],
      summaryMarkdown: "",
      warnings: []
    },
    traceability: { rows: [], warnings: [], markdown: "" },
    limits,
    processingOperation
  }
}

function category(ledger, name) {
  return ledger.snapshot().categories.find((entry) => entry.category === name)
}

function managedOutputs(outDir) {
  return fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : []
}

test("rejects an undersized mandatory Bob-input budget and removes managed outputs", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-mandatory-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outDir = path.join(workspace, "review-package")
  const ledger = makeOperation({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      raw_diff_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: 700,
      total_operation_input_bytes: 700
    }
  })

  await assert.rejects(
    () => buildReviewPackage(fixture(workspace, outDir, ledger, { maxBobInputBytes: 700 })),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "bob_input_bytes"
      && error.details?.limit === 700
  )
  assert.deepEqual(managedOutputs(outDir), [])
  assert.equal(category(ledger, "bob_input_bytes").committed, 0)
})

test("rolls back Bob-input reservation and cleans files when managed artifacts exceed their cap", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-managed-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outDir = path.join(workspace, "review-package")
  const ledger = makeOperation({
    limits: { managed_artifact_bytes: 1024 }
  })

  await assert.rejects(
    () => buildReviewPackage(fixture(workspace, outDir, ledger)),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "managed_artifact_bytes"
      && error.details?.limit === 1024
  )
  assert.deepEqual(managedOutputs(outDir), [])
  assert.equal(category(ledger, "bob_input_bytes").committed, 0)
  assert.equal(category(ledger, "bob_input_bytes").reserved, 0)
  assert.equal(category(ledger, "managed_artifact_bytes").committed, 0)
})

test("commits exact Bob-input and managed-package bytes after successful generation", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-commit-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outDir = path.join(workspace, "review-package")
  const ledger = makeOperation()

  await buildReviewPackage(fixture(workspace, outDir, ledger))
  const managedBytes = await computeManagedReviewPackageBytes(outDir)
  const bobBytes = fs.statSync(path.join(outDir, "bob-input.md")).size
  assert.equal(category(ledger, "managed_artifact_bytes").committed, managedBytes)
  assert.equal(category(ledger, "bob_input_bytes").committed, bobBytes)
})

// Break: a managed write reaches I/O before reserving its actual UTF-8/JSON output bytes.
test('all_managed_writes_reserve_before_io_and_match_disk',async()=>{
 const {createReviewPackageWriter}=require('../out/core/reviewPackageWriter'),fsp=require('node:fs/promises'),op=makeOperation(),root=fs.mkdtempSync(path.join(os.tmpdir(),'t16-writer-')),writer=createReviewPackageWriter({outDir:root,operation:op}),write=fsp.writeFile;let observed=0;
 const spy=mock.method(fsp,'writeFile',async(...args)=>{observed++;assert.ok(category(op,'managed_artifact_bytes').reserved>=Buffer.byteLength(args[1],'utf8'));return write(...args);});
 try{await writer.writeText('document-excerpts.md','α\n');await writer.writeJson('input-normalized.json',{word:'日本語'});}finally{spy.mock.restore();}
 const expected=3+Buffer.byteLength('{\n  "word": "日本語"\n}\n','utf8');assert.equal(observed,2);assert.equal(await writer.measure(),expected);assert.equal(category(op,'managed_artifact_bytes').committed,0);writer.commit();assert.equal(category(op,'managed_artifact_bytes').committed,expected);assert.equal(category(op,'total_operation_input_bytes').committed,0);
});

// Break: default/absolute artifact overflow is noticed only after writing an oversized file.
test('managed_artifact_default_absolute_exact_plus_one_precedes_write',async()=>{
 const {createReviewPackageWriter}=require('../out/core/reviewPackageWriter');
 for(const limit of [16777216,67108864]){
  const op=makeOperation({limits:{managed_artifact_bytes:limit}}),root=fs.mkdtempSync(path.join(os.tmpdir(),'t16-artifact-exact-')),writer=createReviewPackageWriter({outDir:root,operation:op});await writer.writeText('document-excerpts.md','x'.repeat(limit));assert.equal(await writer.measure(),limit);writer.commit();assert.equal(category(op,'managed_artifact_bytes').committed,limit);
  const over=makeOperation({limits:{managed_artifact_bytes:limit}}),out=fs.mkdtempSync(path.join(os.tmpdir(),'t16-artifact-over-')),rejected=createReviewPackageWriter({outDir:out,operation:over});await assert.rejects(()=>rejected.writeText('document-excerpts.md','x'.repeat(limit+1)),e=>e.code==='processing_budget_exceeded'&&e.details.observed===limit+1);rejected.release();assert.equal(fs.existsSync(path.join(out,'document-excerpts.md')),false);assert.equal(category(over,'managed_artifact_bytes').used,0);
 }
});

// Break: an ordinary write failure or cancellation leaves Bob/artifact reservations and user files behind.
test('package_failure_releases_pending_and_preserves_unmanaged',async()=>{
 const fsp=require('node:fs/promises');
 for(const mode of ['write','cancel','measure','falsey-cleanup']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'t16-package-failure-')),out=path.join(root,'review-package');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'notes.txt'),'user data');const c=new AbortController(),reason=mode==='falsey-cleanup'?undefined:new Error(mode),op=makeOperation(undefined,c.signal),write=fsp.writeFile,rm=fsp.rm,logs=[];let triggered=false;
  const io=mock.method(fsp,'writeFile',async(...args)=>{if(mode==='measure'){if(path.basename(args[0])==='bob-input.md'){triggered=true;await write(args[0],args[1]+'tampered','utf8');return;}return write(...args);}if(path.basename(args[0])==='changed-files.json'){triggered=true;if(mode==='cancel'){await write(...args);c.abort(reason);return;}throw reason;}return write(...args);});
  const cleanup=mock.method(fsp,'rm',async(...args)=>{if(mode==='falsey-cleanup'&&triggered&&path.basename(args[0])==='prompts')throw Error('cleanup failed');return rm(...args);}),log=mock.method(console,'error',message=>logs.push(message));
  let failed=false;try{await buildReviewPackage(fixture(root,out,op));}catch(error){failed=true;if(mode==='measure')assert.match(error.message,/size changed/);else assert.strictEqual(error,reason);}finally{log.mock.restore();cleanup.mock.restore();io.mock.restore();}
  assert.equal(failed,true);assert.equal(triggered,true);assert.equal(op.snapshot().categories.every(row=>row.reserved===0),true);assert.equal(category(op,'bob_input_bytes').committed,0);assert.equal(category(op,'managed_artifact_bytes').committed,0);assert.equal(fs.readFileSync(path.join(out,'notes.txt'),'utf8'),'user data');
  if(mode==='falsey-cleanup'){assert.equal(logs.length,1);assert.match(logs[0],/cleanup failed/i);assert.ok(Buffer.byteLength(logs[0],'utf8')<=512);assert.equal(logs[0].includes(root),false);}else assert.deepEqual(fs.readdirSync(out),['notes.txt']);
 }
});

// Break: clipping warnings differ inside Bob input, deterministic checks and the package manifest.
test('final_bob_warning_is_consistent_in_all_managed_outputs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'t16-package-warning-')),out=path.join(root,'review-package'),op=makeOperation(),data=fixture(root,out,op,{maxBobInputBytes:65536});data.documents.excerptsMarkdown='optional line\n'.repeat(20000);const warnings=await buildReviewPackage(data),warning=warnings.find(w=>w.includes('bob-input.md'));assert.ok(warning);
 for(const name of ['bob-input.md','deterministic-checks.md'])assert.ok(fs.readFileSync(path.join(out,name),'utf8').includes(warning));assert.ok(fs.readFileSync(path.join(out,'manifest.yaml'),'utf8').includes(JSON.stringify(warning)));assert.ok(fs.statSync(path.join(out,'bob-input.md')).size<=65536);
});
