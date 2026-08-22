const assert = require("node:assert/strict")
const { test } = require("node:test")
const { generationInput, sourceFiles, subject } = require("./workflowContractV2LockTestSupport")

test("lock generation rejects proxy and accessor inputs without invoking behavior", () => { const lockModule=subject(); let traps=0; const outer=new Proxy(generationInput(),{get(){traps++;throw new Error("trap")},ownKeys(){traps++;throw new Error("trap")}}); assert.throws(()=>lockModule.generateWorkflowPackageLock(outer),TypeError); assert.equal(traps,0); let getterCalls=0; const provider={...generationInput().providers[0]}; Object.defineProperty(provider,"exactVersion",{enumerable:true,get(){getterCalls++;return"1.2.3"}}); assert.throws(()=>lockModule.generateWorkflowPackageLock(generationInput({providers:[provider]})),TypeError); assert.equal(getterCalls,0) })

test("lock generation rejects sparse arrays, duplicate ids, and invalid Bob subsets", () => { const lockModule=subject(); const sparse=[]; sparse.length=1; assert.throws(()=>lockModule.generateWorkflowPackageLock(generationInput({providers:sparse})),/sparse|dense|array/i); const duplicate=generationInput().providers.map(p=>({...p})); duplicate[1].id=duplicate[0].id; assert.throws(()=>lockModule.generateWorkflowPackageLock(generationInput({providers:duplicate})),/duplicate|provider/i); const invalidBob={profile:"bob/2.0.1",requiredCapabilities:["source.log"],taskCapabilities:["task.sendMessage"]}; assert.throws(()=>lockModule.generateWorkflowPackageLock(generationInput({bob:invalidBob})),/taskCapabilities|required/i) })

test("raw package bytes and evidence are recomputed before lock generation", () => { const lockModule=subject(); const input=generationInput(); input.rawPackage.files.find(f=>f.path==="workflow.yaml").digest=`sha256:${"0".repeat(64)}`; assert.throws(()=>lockModule.generateWorkflowPackageLock(input),/digest|evidence|raw package/i); const stale=generationInput(); stale.rawPackage.files.find(f=>f.path==="workflow.yaml").byteLength+=1; assert.throws(()=>lockModule.generateWorkflowPackageLock(stale),/byte|length|evidence/i) })

test("lock generation snapshots caller bytes and invokes no write capability", () => { const lockModule=subject(); const files=sourceFiles(); const input=generationInput({files}); let writeCalls=0; Object.defineProperty(input,"writeFile",{enumerable:true,value(){writeCalls++}}); assert.throws(()=>lockModule.generateWorkflowPackageLock(input),/unknown field|exact|input/i); assert.equal(writeCalls,0); const accepted=generationInput({files}); const workflow=accepted.rawPackage.files.find(f=>f.path==="workflow.yaml"); const original=workflow.bytes[0]; const lock=lockModule.generateWorkflowPackageLock(accepted); workflow.bytes[0]^=0xff; assert.equal(lock.workflow.digest,accepted.rawPackage.files.find(f=>f.path==="workflow.yaml").digest); workflow.bytes[0]=original })


test("duplicate raw logical paths are rejected before lock generation", () => {
  const lockModule = subject()
  const input = generationInput()
  const duplicate = input.rawPackage.files.find((file) => file.path === "workflow.yaml")
  input.rawPackage.files.push({
    path: duplicate.path,
    bytes: Uint8Array.from(duplicate.bytes),
    byteLength: duplicate.byteLength,
    digest: duplicate.digest
  })

  assert.throws(
    () => lockModule.generateWorkflowPackageLock(input),
    /raw evidence|inconsistent|duplicate/i
  )
})

test("lock verification accepts no write capability", () => {
  const lockModule = subject()
  const input = generationInput()
  let writeCalls = 0
  Object.defineProperty(input, "writeFile", {
    enumerable: true,
    value() { writeCalls += 1 }
  })

  assert.throws(() => lockModule.verifyWorkflowPackageLock(input), /unknown field|exact|input/i)
  assert.equal(writeCalls, 0)
})
