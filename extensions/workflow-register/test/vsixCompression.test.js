
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {test}=require('node:test');const yazl=require('yazl'),yauzl=require('yauzl');
const script=path.resolve(__dirname,'../scripts/recompress-vsix.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function archive(root){
 const zip=new yazl.ZipFile();zip.addBuffer(Buffer.from('runtime payload '.repeat(10000)),'extension/out/main.js',{compress:false,mtime:new Date('2026-01-01'),mode:0o100644});
 zip.addBuffer(Buffer.from('日本語のmetadata'),'extension/readme.md',{compressionLevel:1,mtime:new Date('2026-01-01'),mode:0o100600});
 zip.addBuffer(Buffer.from('{}'),'extension/package.json',{compress:false,mtime:new Date('2026-01-01')});zip.end();
 const parts=[];await new Promise((resolve,reject)=>zip.outputStream.on('data',b=>parts.push(b)).on('end',resolve).on('error',reject));
 const file=path.join(root,'test-extension-1.0.0.vsix');fs.writeFileSync(file,Buffer.concat(parts));return file;
}
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'p6-compression-'));t.after(()=>{assert.equal(path.basename(root).startsWith('p6-compression-'),true);fs.rmSync(root,{recursive:true,force:true});});fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'test-extension',version:'1.0.0'}));return root;}
function run(root){return cp.spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',windowsHide:true});}
function read(file){return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{
 if(error)return reject(error);const rows=[];zip.on('error',reject);zip.on('end',()=>resolve(rows));zip.on('entry',entry=>zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const data=[];stream.on('error',reject);stream.on('data',b=>data.push(b));stream.on('end',()=>{rows.push({name:entry.fileName,crc:entry.crc32,mode:entry.externalFileAttributes,mtime:entry.lastModFileTime,date:entry.lastModFileDate,sha256:hash(Buffer.concat(data))});zip.readEntry();});}));zip.readEntry();}));}
test('compression preserves every entry and attribute through independent ZIP reader and is stable',async t=>{
 const root=setup(t),file=await archive(root),before=fs.readFileSync(file),rows=await read(file);const result=run(root);assert.equal(result.status,0,result.stderr);const after=fs.readFileSync(file);assert.ok(after.length<before.length);assert.deepEqual(await read(file),rows);assert.equal(run(root).status,0);assert.deepEqual(fs.readFileSync(file),after);assert.equal(fs.readdirSync(root).some(x=>x.endsWith('.tmp')),false);
});
test('invalid archive and corrupt payload never replace the original',async t=>{
 for(const mutation of [b=>Buffer.from('not a ZIP'),b=>{const c=Buffer.from(b);c[c.readUInt16LE(26)+c.readUInt16LE(28)+30]^=0xff;return c;},b=>{const c=Buffer.from(b);const i=c.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));c.writeUInt16LE(1,i+8);return c;},b=>{const c=Buffer.from(b);const i=c.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));c.writeUInt32LE(0xffffffff,i+20);return c;}]){
 const root=setup(t),file=await archive(root),bad=mutation(fs.readFileSync(file));fs.writeFileSync(file,bad);const r=run(root);assert.notEqual(r.status,0);assert.deepEqual(fs.readFileSync(file),bad);assert.equal(fs.readdirSync(root).some(x=>x.endsWith('.tmp')),false);
 }
});


test('R2 compaction changes exactly nine literal modules and preserves lookalike payloads',async t=>{
 const {compactManifestModule}=require('../scripts/lib/compact-manifest-module');
 const targets=['providerEnvelopeSnapshot','providerAttemptStaging','providerInvocation','providerRegistry','compiledPlan','jsonSchemaCatalog','jsonSchema','jsonValue','canonicalJson'].map(n=>'extension/out/core/contractV2/'+n+'.js');
 const root=setup(t),code=['// retained semantics','"use strict";','const identity = (value) => { return value + 1; };','module.exports = { identity };',''].join(String.fromCharCode(10));
 const zip=new yazl.ZipFile();for(const name of [...targets,...targets.map(n=>n+'.backup')])zip.addBuffer(Buffer.from(code),name,{compressionLevel:1,mtime:new Date('2026-01-01'),mode:0o100644});zip.addBuffer(Buffer.from('{}'),'extension/package.json',{mtime:new Date('2026-01-01')});zip.end();
 const parts=[];await new Promise((resolve,reject)=>zip.outputStream.on('data',b=>parts.push(b)).on('end',resolve).on('error',reject));const file=path.join(root,'test-extension-1.0.0.vsix');fs.writeFileSync(file,Buffer.concat(parts));
 const before=await read(file);assert.equal(run(root).status,0);const after=await read(file),expected=hash(Buffer.from(compactManifestModule(code),'utf8'));
 for(const name of targets){const b=before.find(r=>r.name===name),a=after.find(r=>r.name===name);assert.notEqual(a.sha256,b.sha256,name+' must compact');assert.equal(a.sha256,expected,name);for(const key of ['mode','mtime','date'])assert.equal(a[key],b[key]);}
 for(const row of before.filter(r=>!targets.includes(r.name)))assert.deepEqual(after.find(r=>r.name===row.name),row);
});

test('approved R2 amendment compacts exactly fourteen additional literal modules and preserves lookalike payloads',async t=>{
 const {compactManifestModule}=require('../scripts/lib/compact-manifest-module');
 const targets=["packageShape","predicate","diagnostics","bobProfile","compilerWorkflow","packageLoaderInput","jsonSchemaRole","yamlDocument","compiler","compilerFiles","packageLoaderSnapshot","packageFileSystemNode","packageLoaderIo","workflowLockSnapshotUtilities"].map(n=>'extension/out/core/contractV2/'+n+'.js');
 const root=setup(t),code=['// retained semantics','"use strict";','const identity = (value) => { return value + 1; };','module.exports = { identity };',''].join(String.fromCharCode(10));
 const zip=new yazl.ZipFile();for(const name of [...targets,...targets.map(n=>n+'.backup')])zip.addBuffer(Buffer.from(code),name,{compressionLevel:1,mtime:new Date('2026-01-01'),mode:0o100644});zip.addBuffer(Buffer.from('{}'),'extension/package.json',{mtime:new Date('2026-01-01')});zip.end();
 const parts=[];await new Promise((resolve,reject)=>zip.outputStream.on('data',b=>parts.push(b)).on('end',resolve).on('error',reject));const file=path.join(root,'test-extension-1.0.0.vsix');fs.writeFileSync(file,Buffer.concat(parts));
 const before=await read(file);assert.equal(run(root).status,0);const after=await read(file),expected=hash(Buffer.from(compactManifestModule(code),'utf8'));
 for(const name of targets){const b=before.find(r=>r.name===name),a=after.find(r=>r.name===name);assert.notEqual(a.sha256,b.sha256,name+' must compact');assert.equal(a.sha256,expected,name);for(const key of ['mode','mtime','date'])assert.equal(a[key],b[key]);}
 for(const row of before.filter(r=>!targets.includes(r.name)))assert.deepEqual(after.find(r=>r.name===row.name),row);
});

test('approved registry amendment compacts exactly forty-six additional literal modules and preserves lookalikes',async t=>{
 const {compactManifestModule}=require('../scripts/lib/compact-manifest-module');
 const targets=["extension/out/bobStepRuntime.js","extension/out/bobWorkflowRunner.js","extension/out/commands/runRetention.js","extension/out/commands/stepReview.js","extension/out/core/approvalGuardrails.js","extension/out/core/artifacts/artifactManifest.js","extension/out/core/artifacts/taskSnapshotImportPreview.js","extension/out/core/authoring/workflowAuthoringFileTransaction.js","extension/out/core/engine.js","extension/out/core/engine/resultWriters.js","extension/out/core/engine/stepExecutor.js","extension/out/core/heldRunRecovery.js","extension/out/core/mechanicalChecks/config.js","extension/out/core/mechanicalChecks/parser.js","extension/out/core/mechanicalChecks/runner.js","extension/out/core/runDiagnostics.js","extension/out/core/runProvenance.js","extension/out/core/runtime/resultSinkRegistry.js","extension/out/core/runtime/runCleanupLease.js","extension/out/core/runtime/runCleanupTransaction.js","extension/out/core/runtime/runDurabilityPath.js","extension/out/core/runtime/runEventCodecRegistry.js","extension/out/core/runtime/runLock.js","extension/out/core/runtime/runRetentionInventory.js","extension/out/core/runtime/runStateMigrationBackup.js","extension/out/core/runtime/runStatePath.js","extension/out/core/runtime/runStateV2.js","extension/out/core/runtime/workspaceFileTransaction.js","extension/out/core/schema/workflowSchema.js","extension/out/core/snapshots/taskSnapshots.js","extension/out/core/workflowCompiler.js","extension/out/core/workspaceRoots.js","extension/out/gui/operationHubModel.js","extension/out/gui/operationHubProvider.js","extension/out/parse.js","extension/out/reviewTaskRegistry.js","extension/out/template/templateGenerator.js","extension/out/template/templateReadiness.js","extension/out/template/templateStudioModel.js","extension/out/webview/workflowBuilderPanel.js","extension/out/workflowContractV2ProviderLifecycle.js","extension/out/workflowDefinitionLoader.js","extension/out/workflowDiscovery.js","extension/out/workflowRegisterService.js","extension/out/workflowRunCommands.js","extension/out/workflowRuntimeFactory.js"];
 const root=setup(t),code=['// retained semantics','"use strict";','const identity = (value) => { return value + 1; };','module.exports = { identity };',''].join(String.fromCharCode(10));
 const zip=new yazl.ZipFile();for(const name of [...targets,...targets.map(n=>n+'.backup')])zip.addBuffer(Buffer.from(code),name,{compressionLevel:1,mtime:new Date('2026-01-01'),mode:0o100644});zip.addBuffer(Buffer.from('{}'),'extension/package.json',{mtime:new Date('2026-01-01')});zip.end();
 const parts=[];await new Promise((resolve,reject)=>zip.outputStream.on('data',b=>parts.push(b)).on('end',resolve).on('error',reject));const file=path.join(root,'test-extension-1.0.0.vsix');fs.writeFileSync(file,Buffer.concat(parts));
 const before=await read(file);const result=run(root);assert.equal(result.status,0,result.stderr);const after=await read(file),expected=hash(Buffer.from(compactManifestModule(code),'utf8'));
 for(const name of targets){const b=before.find(r=>r.name===name),a=after.find(r=>r.name===name);assert.notEqual(a.sha256,b.sha256,name+' must compact');assert.equal(a.sha256,expected,name);for(const key of ['mode','mtime','date'])assert.equal(a[key],b[key]);}
 for(const row of before.filter(r=>!targets.includes(r.name)))assert.deepEqual(after.find(r=>r.name===row.name),row);
});
