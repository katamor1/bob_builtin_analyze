// Unit-test-only process double. It never launches an OS child or archive code.
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const config=JSON.parse(readFileSync(process.env.WF2_GATE_R_MOCK_CONFIG));
const nativeSpawn=cp.spawn;
const state={kind:'unit-test-process-double',started:[],closed:[],killed:[],active:0,maximumActive:0,scheduledAfterFailure:0,failureSeen:false};
const save=()=>writeFileSync(config.record,JSON.stringify(state));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function tap(family){
 const name=family.requiredCaseNames[0];let marker='';
 const version=family.sourceItemId==='source-75c07aaa99be8455bdc3285f'?1:family.sourceItemId==='source-5ec92ed8eb7c664752c179f6'?2:undefined;
 if(version){const observation={schemaVersion:'workflow-r'+version+'-product-wiring/v1',counterScope:'contract_v2_product_paths',observedProductSurfaces:['validation','registration','operation_hub','authoring','legacy_v1'],v2ProductLeaseAcquisitions:0,providerDispatches:0,bobDispatches:0,v2ProductRunDirectoryCreations:0,v2ProductArtifactStages:0};marker='R'+version+'_PRODUCT_WIRING_BASE64='+Buffer.from(JSON.stringify(canonical(observation))+'\n').toString('base64')+'\n';}
 return 'TAP version 13\n'+marker+'# Subtest: '+name+'\nok 1 - '+name+'\n  ---\n  duration_ms: 1\n  type: test\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';
}
cp.spawn=function(executable,args,options){
 if(config.mode==='tree-failure'&&args?.[0]==='/PID'){
  const owner=JSON.parse(readFileSync(config.tree));
  if(args.length!==4||args[1]!==String(owner.pid)||args[2]!=='/T'||args[3]!=='/F'||options?.shell!==false)throw Error('unit fixture refused unrelated process cancellation');
  state.killed.push(owner.pid);save();return nativeSpawn(executable,args,options);
 }
 const family=config.families.find(row=>row.testPath.slice('extensions/workflow-register/'.length)===args?.[0]);
 if(executable!==process.execPath||args?.length!==1||!family||options?.shell!==false)throw Error('unit fixture refused an unselected command');
 const index=state.started.length;if(state.failureSeen)state.scheduledAfterFailure++;state.started.push(family.sourceItemId);state.active++;state.maximumActive=Math.max(state.maximumActive,state.active);save();
 if(config.mode==='tree-failure'&&index===1){
  const child=nativeSpawn(process.execPath,[fileURLToPath(new URL('./gate-r-process-tree-child.mjs',import.meta.url)),config.tree],options);
  child.on('close',()=>{state.active--;state.closed.push(family.sourceItemId);save();});return child;
 }
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let settled=false,timer;
 const close=(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);state.active--;state.closed.push(family.sourceItemId);child.stdout.end();child.stderr.end();save();queueMicrotask(()=>child.emit('close',code,signal));};
 child.kill=()=>{if(!settled)state.killed.push(family.sourceItemId);close(null,'SIGTERM');return true;};
 const complete=()=>{
  if(index===0&&config.mode==='tree-failure'){
   if(!existsSync(config.tree)){timer=setTimeout(complete,10);return;}
   state.failureSeen=true;save();close(1,null);return;
  }
  if(index===0&&config.mode==='failure'){state.failureSeen=true;save();close(1,null);return;}
  if(index===0&&config.mode==='overflow'){state.failureSeen=true;save();child.stdout.write(Buffer.alloc(1048577,88));return;}
  child.stdout.write(tap(family));close(0,null);
 };timer=setTimeout(complete,index===0&&config.mode!=='success'?1:30);
 return child;
};
syncBuiltinESMExports();
