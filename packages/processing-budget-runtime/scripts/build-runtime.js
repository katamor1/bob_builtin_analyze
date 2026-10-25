'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {MODULES,COMPILED_FILES}=require('./runtime-payload');
const packageRoot=path.resolve(__dirname,'..'),repositoryRoot=path.resolve(packageRoot,'../..');
const cache=path.join(packageRoot,'node_modules/.cache/bob-processing-runtime'),output=path.join(packageRoot,'out');
const receiptFile=path.join(cache,'last-build.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(reason){throw Error('processing runtime build: '+reason);}
function noFollow(file){
 const absolute=path.resolve(file),parsed=path.parse(absolute);let current=parsed.root;
 for(const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())fail('symbolic link or alias');}
 return absolute;
}
function ensureDir(file){
 const absolute=path.resolve(file);if(absolute!==repositoryRoot&&!absolute.startsWith(repositoryRoot+path.sep))fail('directory outside workspace');
 if(!fs.existsSync(absolute)){ensureDir(path.dirname(absolute));fs.mkdirSync(absolute);}
 noFollow(absolute);if(!fs.statSync(absolute).isDirectory())fail('directory required');return absolute;
}
function binding(file,name=path.basename(file)){noFollow(file);if(!fs.statSync(file).isFile())fail('regular payload file required');const bytes=fs.readFileSync(file);if(bytes.length===0)fail('empty payload');return{path:name,bytes:bytes.length,sha256:sha(bytes)};}
function inventory(directory,allowed,exact=true){
 noFollow(directory);if(!fs.statSync(directory).isDirectory())fail('output directory required');const entries=fs.readdirSync(directory).sort();
 if(entries.some(name=>!allowed.includes(name))||(exact&&JSON.stringify(entries)!==JSON.stringify([...allowed].sort())))fail('unknown or incomplete compiled payload');
 return entries.map(name=>binding(path.join(directory,name),name));
}
function sourceInputs(){
 const sourceDir=path.join(packageRoot,'src');noFollow(sourceDir);
 if(JSON.stringify(fs.readdirSync(sourceDir).sort())!==JSON.stringify(MODULES.map(name=>name+'.ts').sort()))fail('unknown source inventory');
 const names=['package.json','package-lock.json','README.md','tsconfig.json','scripts/generate-processing-budget-contracts.js','scripts/runtime-payload.js','scripts/build-runtime.js','scripts/copy-extension-runtime.js','contracts/processing-budget-definition.v1.json','schema/processing-budget-profile.v1.schema.json',...MODULES.map(name=>'src/'+name+'.ts')].sort();
 const rows=names.map(name=>binding(path.join(packageRoot,name),name));return{rows,digest:sha(JSON.stringify(rows))};
}
function withBuildLock(operation){
 ensureDir(cache);const lock=path.join(cache,'build.lock');const started=Date.now();let fd;
 while(fd===undefined){try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code!=='EEXIST')throw e;noFollow(lock);if(Date.now()-started>30000)fail('build is locked; retained lock requires inspection');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,40);}}
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));return operation();}finally{fs.closeSync(fd);noFollow(lock);fs.unlinkSync(lock);}
}
function freshStaging(prefix){
 if(!/^[a-z]+-$/.test(prefix))fail('invalid staging prefix');
 const created=fs.mkdtempSync(path.toNamespacedPath(path.join(cache,prefix)));
 return path.join(cache,path.basename(created));
}
function publish(staging,target,allowed){
 const resolved=path.resolve(target),permitted=[output,...['bob-bazaar-review','bob-code-consistency-review'].map(name=>path.join(repositoryRoot,'extensions',name,'out/shared-processing-budget-runtime'))];
 if(!permitted.includes(resolved))fail('output is not owned');
 if(!path.resolve(staging).startsWith(cache+path.sep))fail('staging is not owned');
 inventory(staging,allowed);ensureDir(path.dirname(resolved));let previous;
 if(fs.statSync(staging).dev!==fs.statSync(path.dirname(resolved)).dev)fail('cross-volume publish');
 if(fs.existsSync(resolved)){inventory(resolved,allowed,false);const retained=freshStaging('retained-');previous=path.join(retained,'payload');noFollow(path.dirname(previous));fs.renameSync(noFollow(resolved),previous);}
 try{fs.renameSync(noFollow(staging),resolved);}catch(error){if(previous&&!fs.existsSync(resolved))fs.renameSync(previous,resolved);throw error;}
 return previous??null;
}
function run(args){const result=cp.spawnSync(process.execPath,args,{cwd:packageRoot,encoding:'utf8',maxBuffer:4*1024*1024});if(result.error||result.status!==0)fail((result.stderr||result.stdout||result.error?.message||'compiler failed').slice(0,4096));}
function buildRuntime(){return withBuildLock(()=>{
 const compiler=path.join(packageRoot,'node_modules/typescript/bin/tsc');noFollow(compiler);
 if(JSON.parse(fs.readFileSync(path.join(packageRoot,'node_modules/typescript/package.json'))).version!=='5.9.3')fail('TypeScript5.9.3 required');
 const input=sourceInputs();run([path.join(packageRoot,'scripts/generate-processing-budget-contracts.js'),'--check']);
 const stage=freshStaging('compile-');run([compiler,'-p',packageRoot,'--outDir',stage,'--newLine','lf','--sourceRoot','../src']);
 const payload=inventory(stage,COMPILED_FILES);if(sourceInputs().digest!==input.digest)fail('source changed during build');
 const previous=publish(stage,output,COMPILED_FILES);const receipt={schemaVersion:'bob-builtin-analyze/processing-runtime-build/v1',sourceInputDigest:input.digest,sourceInputs:input.rows,payload,node:process.version,typescript:'5.9.3'};
 const temporary=path.join(freshStaging('receipt-'),'build.json');fs.writeFileSync(temporary,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});if(fs.existsSync(receiptFile))noFollow(receiptFile);fs.renameSync(temporary,receiptFile);return{...receipt,destination:output,retainedPrevious:previous};
});}
function verifiedBuild(){
 noFollow(receiptFile);const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
 if(receipt.schemaVersion!=='bob-builtin-analyze/processing-runtime-build/v1'||receipt.sourceInputDigest!==sourceInputs().digest)fail('stale build source');
 const actual=inventory(output,COMPILED_FILES);if(JSON.stringify(receipt.payload)!==JSON.stringify(actual))fail('stale compiled payload');return receipt;
}
if(require.main===module){try{if(process.argv.length!==2)fail('unexpected arguments');const r=buildRuntime();process.stdout.write(JSON.stringify({state:'passed',sourceInputDigest:r.sourceInputDigest,files:r.payload.length})+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
module.exports={packageRoot,repositoryRoot,cache,output,receiptFile,noFollow,ensureDir,binding,inventory,sourceInputs,withBuildLock,freshStaging,publish,buildRuntime,verifiedBuild};
