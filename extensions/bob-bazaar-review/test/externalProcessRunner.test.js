const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test, mock } = require("node:test")

const {
  ExternalProcessError,
  normalizeExternalProcessTimeoutMs,
  runExternalProcess
} = require("../out/bazaar/externalProcessRunner")

const cwd = process.cwd()

function runNode(script, options = {}) {
  return runExternalProcess({
    command: process.execPath,
    args: ["-e", script],
    cwd,
    maxStdoutBytes: 1024 * 1024,
    timeoutMs: 10000,
    allowedExitCodes: [0],
    ...options
  })
}

async function rejectsWithKind(promise, kind) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ExternalProcessError)
    assert.equal(error.kind, kind)
    return true
  })
}

test("external process runner terminates commands that exceed the hard timeout", async () => {
  const startedAt = Date.now()
  await rejectsWithKind(
    runNode("setInterval(() => {}, 1000)", { timeoutMs: 50 }),
    "timeout"
  )
  const elapsedMs = Date.now() - startedAt
  assert.ok(elapsedMs < 5000, `timeout and bounded process-tree cleanup took ${elapsedMs}ms`)
})

test("external process runner clamps timeouts to the safety range", () => {
  assert.equal(normalizeExternalProcessTimeoutMs(1), 1000)
  assert.equal(normalizeExternalProcessTimeoutMs(1000), 1000)
  assert.equal(normalizeExternalProcessTimeoutMs(600000), 600000)
  assert.equal(normalizeExternalProcessTimeoutMs(Number.MAX_SAFE_INTEGER), 600000)
})

test("external process runner propagates AbortSignal cancellation", async () => {
  const controller = new AbortController()
  const running = runNode("setInterval(() => {}, 1000)", { signal: controller.signal })
  setTimeout(() => controller.abort(), 50)
  await rejectsWithKind(running, "cancelled")
})

test("external process runner closes the preflight-to-listener cancellation race", async () => {
  let abortedReads = 0
  const signal = {
    get aborted() {
      abortedReads += 1
      return abortedReads >= 2
    },
    addEventListener() {},
    removeEventListener() {}
  }

  await rejectsWithKind(
    runNode("setInterval(() => {}, 1000)", { signal, timeoutMs: 100 }),
    "cancelled"
  )
  assert.ok(abortedReads >= 2)
})

// Break: stderr consumes stdout allowance, or an overflowing slice retains the giant input chunk.
test('independent_exact_streams_and_owned_prefix',async()=>{
 const result=await runNode("process.stdout.write(Buffer.alloc(1024,97));process.stderr.write(Buffer.alloc(256*1024,98))",{maxStdoutBytes:1024});
 assert.deepEqual([result.stdout.length,result.stderr.length],[1024,262144]);
 const {EventEmitter}=require('node:events'),cp=require('node:child_process');
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.signalCode=null;
 child.kill=()=>{child.exitCode=0;child.emit('exit',0);child.emit('close',0);return true;};
 const spawn=mock.method(cp,'spawn',()=>child),concat=Buffer.concat,giant=Buffer.alloc(4*1024*1024,97);let backingBytes=0;
 const spy=mock.method(Buffer,'concat',(list,...args)=>{if(list.length===1&&list[0].length===1024)backingBytes=list[0].buffer.byteLength;return concat(list,...args);});
 try{const running=runNode('unused',{maxStdoutBytes:1024});child.stdout.emit('data',giant);await assert.rejects(running,e=>e.kind==='bufferExceeded'&&e.outputStream==='stdout');assert.ok(backingBytes>0&&backingBytes<giant.byteLength,'retained prefix must own bounded storage');}finally{spy.mock.restore();spawn.mock.restore();}
});

// Break: capture succeeds with cap+1 or rejects while its writer child still runs.
test('stdout_and_stderr_plus_one_reject_after_settlement',async()=>{
 const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t16-process-'));
 for(const [stream,limit]of [['stdout',1024],['stderr',262144]]){
  const pidFile=path.join(root,stream+'.pid');
  const script=`require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.${stream}.write(Buffer.alloc(${limit+1},120));setInterval(()=>{},1000)`;
  await assert.rejects(runNode(script,{maxStdoutBytes:1024}),e=>{assert.ok(e instanceof ExternalProcessError);assert.equal(e.kind,'bufferExceeded');assert.equal(e.outputStream,stream);assert.ok(e.stdout.length<=1024);assert.ok(e.stderr.length<=262144);assert.equal(e[stream].length,limit);return true;});
  assert.equal(isProcessAlive(Number(fs.readFileSync(pidFile,'utf8'))),false);
 }
});

// Break: error consumers must distinguish streams even when prose claims the opposite.
test('stream_identity_cannot_be_inferred_from_message',()=>{
 const error=new ExternalProcessError('Command stdout exceeded 1 bytes','bufferExceeded','node',[],cwd,Buffer.alloc(0),Buffer.alloc(0),undefined,'stderr');
 assert.equal(error.outputStream,'stderr');
 const ordinary=new ExternalProcessError('Command stderr exceeded 1 bytes','nonZeroExit','node',[],cwd);
 assert.equal(ordinary.outputStream,undefined);
});

// Break: invalid caps reach spawn or are silently floored into a zero-byte collector.
test('invalid_stdout_option_never_spawns',()=>{
 const cp=require('node:child_process');let calls=0;const spy=mock.method(cp,'spawn',()=>{calls++;throw Error('must not spawn');});
 try{for(const value of [0,-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>runNode('',{maxStdoutBytes:value}),/maxStdoutBytes/);assert.equal(calls,0);}finally{spy.mock.restore();}
});

test("process runner settles only after a buffer-exceeded child exits", async () => {
  const pidFile = path.join(os.tmpdir(), `external-runner-${process.pid}-${Date.now()}.pid`)
  try {
    await assert.rejects(
      runNode(
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ` +
          "process.stdout.write('x'.repeat(65536)); setInterval(() => {}, 1000)",
        { maxStdoutBytes: 1024 }
      ),
      (error) => error instanceof ExternalProcessError && error.kind === "bufferExceeded"
    )
    const pid = Number(fs.readFileSync(pidFile, "utf8"))
    assert.equal(isProcessAlive(pid), false, `child ${pid} was still alive after rejection`)
  } finally {
    fs.rmSync(pidFile, { force: true })
  }
})

test("external process runner accepts explicitly allowed non-zero exit codes", async () => {
  const result = await runNode("process.exit(1)", { allowedExitCodes: [0, 1] })
  assert.equal(result.exitCode, 1)
})

test("external process runner classifies disallowed exit codes", async () => {
  await assert.rejects(
    runNode("process.stderr.write('failed'); process.exit(7)"),
    (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "nonZeroExit")
      assert.equal(error.exitCode, 7)
      assert.match(error.stderr.toString("utf8"), /failed/)
      return true
    }
  )
})

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
