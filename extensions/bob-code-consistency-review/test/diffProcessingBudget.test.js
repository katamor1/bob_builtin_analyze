"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  collectGitDiff,
  finalizeDiffProcessingBudget
} = require("../out/core/gitDiffCollector")
const { createProcessingOperation, normalizeProcessingBudgetProfile } = require("../out/sharedProcessingBudgetRuntime")
const { PROCESSING_BUDGET_ABSOLUTE_MAXIMA } = require("../out/shared-processing-budget-runtime")
const makeOperation = overrides => createProcessingOperation({ profile: normalizeProcessingBudgetProfile(overrides) })

function changedFiles(count) {
  return Array.from({ length: count }, (_, index) => ({
    path: `src/file-${index}.c`,
    status: "modified",
    additions: 1,
    deletions: 0
  }))
}

function diff(files, unifiedDiff = "") {
  return {
    vcs: "git",
    vcsRoot: "/workspace",
    base: "base",
    head: "head",
    files,
    unifiedDiff,
    warnings: []
  }
}

function expectExceeded(category, limit, observed) {
  return (error) => error?.code === "processing_budget_exceeded"
    && error.details?.constrainedCategory === category
    && error.details?.limit === limit
    && error.details?.observed === observed
}

test("enforces default changed-file exact and plus-one boundaries", () => {
  const exact = finalizeDiffProcessingBudget(diff(changedFiles(5_000)), makeOperation())
  assert.equal(exact.files.length, 5_000)

  assert.throws(
    () => finalizeDiffProcessingBudget(diff(changedFiles(5_001)), makeOperation()),
    expectExceeded("changed_files", 5_000, 5_001)
  )
})

test("enforces absolute changed-file exact and plus-one boundaries", () => {
  const absoluteLedger = () => makeOperation({ limits: PROCESSING_BUDGET_ABSOLUTE_MAXIMA })
  const exact = finalizeDiffProcessingBudget(diff(changedFiles(20_000)), absoluteLedger())
  assert.equal(exact.files.length, 20_000)

  assert.throws(
    () => finalizeDiffProcessingBudget(diff(changedFiles(20_001)), absoluteLedger()),
    expectExceeded("changed_files", 20_000, 20_001)
  )
})

test("accepts raw diff exactly at the default and absolute byte boundaries", () => {
  const defaultBytes = 1024 * 1024
  const defaultResult = finalizeDiffProcessingBudget(
    diff([], "x".repeat(defaultBytes)),
    makeOperation()
  )
  assert.equal(Buffer.byteLength(defaultResult.unifiedDiff, "utf8"), defaultBytes)
  assert.deepEqual(defaultResult.warnings, [])

  const absoluteBytes = 10 * 1024 * 1024
  const absoluteResult = finalizeDiffProcessingBudget(
    diff([], "x".repeat(absoluteBytes)),
    makeOperation({ limits: PROCESSING_BUDGET_ABSOLUTE_MAXIMA })
  )
  assert.equal(Buffer.byteLength(absoluteResult.unifiedDiff, "utf8"), absoluteBytes)
  assert.deepEqual(absoluteResult.warnings, [])
})

test("truncates over-budget raw diff on UTF-8 and complete-line boundaries", () => {
  const ledger = makeOperation({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: 0,
      raw_diff_bytes: 80,
      total_operation_input_bytes: 80
    }
  })
  const source = [
    "diff --git a/日本語.txt b/日本語.txt",
    "+first complete line",
    "+second complete line",
    "+partial 🚀 line that must not survive"
  ].join("\n")

  const result = finalizeDiffProcessingBudget(diff([], source), ledger, true)
  assert.ok(Buffer.byteLength(result.unifiedDiff, "utf8") <= 80)
  assert.equal(Buffer.from(result.unifiedDiff, "utf8").toString("utf8"), result.unifiedDiff)
  assert.match(result.unifiedDiff, /\[truncated: maxRawDiffBytes\]\n$/)
  const retained = result.unifiedDiff.replace(/\n\n\[truncated: maxRawDiffBytes\]\n$/, "")
  assert.ok(retained === "" || retained.endsWith("\n"))
  assert.doesNotMatch(retained, /partial/)
  assert.ok(result.warnings.some((warning) => warning.includes("maxRawDiffBytes")))
})

test("rolls back changed-file reservation when aggregate input budget rejects raw diff", () => {
  const ledger = makeOperation({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: 10,
      raw_diff_bytes: 10,
      total_operation_input_bytes: 10,
      changed_files: 10
    }
  })
  ledger.reserve("bob_input_bytes", 5).commit()
  const before = ledger.snapshot()

  assert.throws(
    () => finalizeDiffProcessingBudget(diff(changedFiles(1), "123456"), ledger),
    expectExceeded("total_operation_input_bytes", 10, 11)
  )
  assert.deepEqual(ledger.snapshot(), before)
})

test("converts a real Git stdout overflow into a bounded line-safe diff", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-diff-budget-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  runGit(workspace, ["init", "-q"])
  runGit(workspace, ["config", "user.email", "test@example.invalid"])
  runGit(workspace, ["config", "user.name", "Budget Test"])

  const sourcePath = path.join(workspace, "large.txt")
  fs.writeFileSync(sourcePath, "base\n", "utf8")
  runGit(workspace, ["add", "large.txt"])
  runGit(workspace, ["commit", "-qm", "base"])
  const base = runGit(workspace, ["rev-parse", "HEAD"]).trim()

  fs.writeFileSync(sourcePath, `${"x".repeat(2 * 1024 * 1024)}\n`, "utf8")
  runGit(workspace, ["add", "large.txt"])
  runGit(workspace, ["commit", "-qm", "large"])
  const head = runGit(workspace, ["rev-parse", "HEAD"]).trim()

  const result = await collectGitDiff({
    review: { vcs: "git", base, head }
  }, {
    workspaceRoot: workspace,
    limits: { maxRawDiffBytes: 200 }
  })

  assert.equal(result.files.length, 1)
  assert.equal(result.files[0].path, "large.txt")
  assert.ok(Buffer.byteLength(result.unifiedDiff, "utf8") <= 200)
  assert.match(result.unifiedDiff, /\[truncated: maxRawDiffBytes\]\n$/)
  assert.ok(result.warnings.some((warning) => warning.includes("maxRawDiffBytes")))
})

function runGit(cwd, args) {
  return childProcess.execFileSync("git", args, { cwd, encoding: "utf8" })
}

// Break: a zero leaf budget acquires data or a later raw failure commits changed-file count.
test('raw_diff_retained_bytes_reserve_atomically',()=>{
 const op=makeOperation({limits:{single_document_bytes:0,total_document_bytes:0,raw_diff_bytes:0,document_excerpt_bytes:0,bob_input_bytes:0,total_operation_input_bytes:0}});
 const result=finalizeDiffProcessingBudget(diff(changedFiles(1),'nonempty'),op);
 assert.equal(result.unifiedDiff,'');assert.equal(result.files.length,1);assert.ok(result.warnings.length>0);assert.equal(op.snapshot().categories.find(x=>x.category==='raw_diff_bytes').committed,0);
 const constrained=makeOperation({limits:{single_document_bytes:0,total_document_bytes:0,raw_diff_bytes:10,document_excerpt_bytes:0,bob_input_bytes:10,total_operation_input_bytes:10}});constrained.reserve('bob_input_bytes',5).commit();const before=constrained.snapshot();assert.throws(()=>finalizeDiffProcessingBudget(diff(changedFiles(1),'123456'),constrained),expectExceeded('total_operation_input_bytes',10,11));assert.deepEqual(constrained.snapshot(),before);
});

// Break: a diagnostic string turns stderr/timeout/cancel into clipped Git success.
test('git_stdout_overflow_keeps_complete_metadata_but_stderr_is_fatal',async()=>{
 const runner=require('../out/core/externalProcessRunner'),original=runner.runExternalProcess;
 const input={review:{vcs:'git',base:'base',head:'head'}},options={workspaceRoot:process.cwd(),limits:{maxRawDiffBytes:82}};
 let injected;
 runner.runExternalProcess=async opts=>{
  if(opts.args[0]==='rev-parse')return{stdout:Buffer.from('a'.repeat(40)+'\n'),stderr:Buffer.alloc(0),exitCode:0};
  if(opts.args.includes('--name-status'))return{stdout:Buffer.from('M\0src/a.c\0'),stderr:Buffer.alloc(0),exitCode:0};
  if(opts.args.includes('--numstat'))return{stdout:Buffer.from('1\t0\tsrc/a.c\0'),stderr:Buffer.alloc(0),exitCode:0};
  throw injected;
 };
 try{
  for(const [kind,stream]of [['bufferExceeded','stderr'],['timeout',undefined],['cancelled',undefined],['nonZeroExit',undefined]]){injected=new runner.ExternalProcessError('Command stdout exceeded fake bytes',kind,'git',[],process.cwd(),Buffer.from('prefix\n'),Buffer.alloc(0),undefined,stream);await assert.rejects(()=>collectGitDiff(input,options),e=>e===injected);}
  const prefix=Buffer.concat([Buffer.from('日本語\n'+'a'.repeat(70)+'\n'),Buffer.from([0xf0,0x9f])]);
  injected=new runner.ExternalProcessError('diagnostic without stream wording','bufferExceeded','git',[],process.cwd(),prefix,Buffer.alloc(0),undefined,'stdout');
  const result=await collectGitDiff(input,options);assert.equal(result.files.length,1);assert.equal(result.files[0].path,'src/a.c');assert.ok(result.unifiedDiff.startsWith('日本語\n'));assert.ok(!result.unifiedDiff.includes('\ufffd'));assert.ok(Buffer.byteLength(result.unifiedDiff,'utf8')<=82);
  runner.runExternalProcess=async opts=>{if(opts.args[0]==='rev-parse')return{stdout:Buffer.from('a'.repeat(40)),stderr:Buffer.alloc(0),exitCode:0};throw injected;};
  await assert.rejects(()=>collectGitDiff(input,options),e=>e===injected);
 }finally{runner.runExternalProcess=original;}
});

// Break: converted Shift-JIS input exceeds logical UTF-8 cap even when physical capture fits.
test('utf8_boundary_and_bazaar_incomplete_metadata',async()=>{
 const runner=require('../out/core/externalProcessRunner'),original=runner.runExternalProcess;
 const encoded=require('iconv-lite').encode("=== modified file '日本語.c'\n+追加\n",'shift_jis');let calls=0;
 assert.ok(Buffer.byteLength("=== modified file '日本語.c'\n+追加\n",'utf8')>encoded.length);
 runner.runExternalProcess=async options=>{calls++;assert.equal(options.maxStdoutBytes,encoded.length+1);assert.deepEqual(options.allowedExitCodes,[0,1]);assert.equal(options.args[0],'--no-aliases');return{stdout:encoded,stderr:Buffer.alloc(0),exitCode:1};};
 try{await assert.rejects(()=>collectGitDiff({review:{vcs:'bazaar',base:'1',head:'2'}},{workspaceRoot:process.cwd(),textEncoding:'shift_jis',limits:{maxRawDiffBytes:encoded.length}}),/Bazaar diff exceeded.*changed-file metadata/);assert.equal(calls,1);}finally{runner.runExternalProcess=original;}
 const tiny=makeOperation({limits:{single_document_bytes:0,total_document_bytes:0,raw_diff_bytes:5,document_excerpt_bytes:0,bob_input_bytes:0,total_operation_input_bytes:5}}),result=finalizeDiffProcessingBudget(diff([],'日本語\nmore'),tiny);
 assert.ok(Buffer.byteLength(result.unifiedDiff,'utf8')<=5);assert.ok(!result.unifiedDiff.includes('\ufffd'));
});

async function rejectedVcsAwait(vcs, stage, reason) {
  const runner = require('../out/core/externalProcessRunner')
  const factory = require('../out/core/processingBudgetPipeline')
  const limits = require('../out/core/limits').normalizeReviewProcessingLimits()
  const original = runner.runExternalProcess, controller = new AbortController()
  const operation = factory.createPipelineProcessingOperation(limits, undefined, controller.signal)
  operation.reserve('total_operation_input_bytes', 7).commit()
  let targetCalled = false, commandSettled = false
  runner.runExternalProcess = async options => {
    const current = vcs === 'bazaar' ? 'bazaar' : options.args[0] === 'rev-parse' ? 'revision'
      : options.args.includes('--name-status') ? 'metadata' : options.args.includes('--numstat') ? 'numstat' : 'raw'
    if (current === stage) {
      targetCalled = true
      await new Promise(resolve => setImmediate(resolve))
      controller.abort(reason)
      commandSettled = true
      throw new runner.ExternalProcessError('cancelled after settlement', 'cancelled', options.command, options.args, options.cwd)
    }
    const stdout = current === 'revision' ? 'a'.repeat(40) + '\n' : current === 'metadata' ? 'M\0src/a.c\0' : current === 'numstat' ? '1\t0\tsrc/a.c\0' : ''
    return { stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), exitCode: 0 }
  }
  try {
    await assert.rejects(() => collectGitDiff({ review: { vcs, base: '1', head: '2' } }, {
      workspaceRoot: process.cwd(), processingOperation: operation, signal: operation.signal
    }), error => {
      assert.equal(targetCalled, true); assert.equal(commandSettled, true)
      if (reason instanceof Error) assert.strictEqual(error, reason)
      else assert.equal(error.code, 'bounded_document_cancelled')
      return true
    })
    assert.equal(operation.snapshot().categories.find(row => row.category === 'total_operation_input_bytes').committed, 7)
    assert.ok(operation.snapshot().categories.every(row => row.reserved === 0))
  } finally { runner.runExternalProcess = original }
}

// Break: a rejected revision/metadata/raw/Bazaar await bypasses the owner's cancellation reason.
test('active_vcs_await_preserves_error_reason_after_settlement', async () => {
  for (const [vcs, stage] of [['git', 'revision'], ['git', 'metadata'], ['git', 'raw'], ['bazaar', 'bazaar']]) {
    await rejectedVcsAwait(vcs, stage, new Error('owned cancellation ' + stage))
  }
  const runner = require('../out/core/externalProcessRunner')
  const structuredReason = new runner.ExternalProcessError('operator stdout failure', 'bufferExceeded', 'worker', [], process.cwd(), Buffer.from('cause\n'), Buffer.alloc(0), undefined, 'stdout')
  await rejectedVcsAwait('git', 'raw', structuredReason)
  await rejectedVcsAwait('bazaar', 'bazaar', structuredReason)
})

test('active_vcs_await_converts_non_error_reason_to_typed_cancellation', async () => {
  for (const [vcs, stage] of [['git', 'revision'], ['git', 'metadata'], ['git', 'raw'], ['bazaar', 'bazaar']]) {
    await rejectedVcsAwait(vcs, stage, 0)
  }
})

// Break: translating cancellation rejects before the real command process has settled.
test('active_vcs_real_child_settlement_precedes_owned_cancellation', async () => {
  const factory = require('../out/core/processingBudgetPipeline'), limits = require('../out/core/limits').normalizeReviewProcessingLimits()
  const originalSpawn = childProcess.spawn
  for (const vcs of ['git', 'bazaar']) for (const reason of [new Error('real child cancellation'), null]) {
    const controller = new AbortController(), operation = factory.createPipelineProcessingOperation(limits, undefined, controller.signal)
    let child, calls = 0
    childProcess.spawn = (command, args, options) => {
      if (command !== 'git' && command !== 't16-bzr-probe') return originalSpawn(command, args, options)
      calls++
      child = originalSpawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options)
      queueMicrotask(() => controller.abort(reason))
      return child
    }
    try {
      await assert.rejects(() => collectGitDiff({ review: { vcs, base: '1', head: '2' } }, {
        workspaceRoot: process.cwd(), processingOperation: operation, signal: operation.signal, bzrPath: 't16-bzr-probe'
      }), error => { if (reason instanceof Error) assert.strictEqual(error, reason); else assert.equal(error.code, 'bounded_document_cancelled'); return true })
      assert.equal(calls, 1); assert.ok(child.pid)
      assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH')
      assert.ok(operation.snapshot().categories.every(row => row.reserved === 0))
    } finally { childProcess.spawn = originalSpawn }
  }
})

// Break: a later abort replaces a different already-rejected command failure, including a falsey one.
test('unrelated_vcs_rejection_keeps_first_failure_despite_later_abort', async () => {
  const runner = require('../out/core/externalProcessRunner'), original = runner.runExternalProcess
  try {
    for (const first of [undefined, null, false, 0, new runner.ExternalProcessError('original failure', 'spawnFailure', 'bzr', [], process.cwd())]) {
      const controller = new AbortController()
      runner.runExternalProcess = () => new Promise((_resolve, reject) => { reject(first); controller.abort(new Error('later abort')) })
      let rejected = false
      try { await collectGitDiff({ review: { vcs: 'bazaar', base: '1', head: '2' } }, { workspaceRoot: process.cwd(), signal: controller.signal }) }
      catch (error) { rejected = true; assert.strictEqual(error, first) }
      assert.equal(rejected, true)
    }
  } finally { runner.runExternalProcess = original }
})
