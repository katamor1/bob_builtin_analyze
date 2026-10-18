import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,relative,isAbsolute,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const repository=fileURLToPath(new URL('../../../',import.meta.url));
function observe(t,mode){
 const root=mkdtempSync(join(tmpdir(),'gate-r-workers-'));t.after(()=>{const rel=relative(tmpdir(),root);assert.ok(rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));rmSync(root,{recursive:true,force:true});});
 const families=JSON.parse(readFileSync(new URL('../gate-r-active-suite.json',import.meta.url))).capabilities.flatMap(row=>row.testFamilies).sort((a,b)=>a.sourceItemId<b.sourceItemId?-1:1);
 const config=join(root,'config.json'),record=join(root,'observation.json'),tree=join(root,'tree.json');writeFileSync(config,JSON.stringify({mode,families,record,tree}));
 const env={...process.env,WF2_GATE_R_MOCK_CONFIG:config};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--import',new URL('./fixtures/gate-r-spawn-mock.mjs',import.meta.url).href,'tools/main-consolidation/run-gate-r.mjs','--check'],{cwd:repository,encoding:'utf8',env,timeout:15000,maxBuffer:1048576,windowsHide:true});
 assert.equal(result.error,undefined);const observation=JSON.parse(readFileSync(record));assert.equal(observation.kind,'unit-test-process-double');return{result,observation,families,tree};
}
test('Gate R overlaps exactly three fixed genuine family slots without changing the global limits',t=>{
 const {result,observation,families}=observe(t,'success');assert.equal(result.status,0,result.stderr);assert.equal(observation.maximumActive,3);assert.equal(observation.active,0);assert.equal(observation.started.length,15);assert.equal(observation.closed.length,15);assert.equal(observation.killed.length,0);assert.deepEqual(observation.started.slice().sort(),families.map(row=>row.sourceItemId).sort());
 const value=JSON.parse(result.stdout);assert.equal(value.runtimeSuitesExecuted,15);assert.equal(value.schemaVersion,'workflow-gate-r-result/v3');
 const source=readFileSync(new URL('../gateRPolicy.mjs',import.meta.url),'utf8');assert.match(source,/performance\.now\(\)\+120000/);assert.match(source,/outputBudget\.bytes>1048576/);
});
test('Gate R waits for cancellation of an actual owned child process tree',t=>{
 const {result,observation,tree}=observe(t,'tree-failure');assert.notEqual(result.status,0);assert.equal(observation.started.length,3);assert.equal(observation.closed.length,3);assert.equal(observation.active,0);assert.equal(observation.scheduledAfterFailure,0);
 const owner=JSON.parse(readFileSync(tree));for(const pid of [owner.pid,owner.grandchildPid]){let alive=true;try{process.kill(pid,0);}catch(error){assert.equal(error.code,'ESRCH');alive=false;}assert.equal(alive,false,'owned descendant '+pid+' must be gone before CLI returns');}
});
for(const mode of ['failure','overflow'])test('Gate R cancels and settles all active children before reporting '+mode,t=>{
 const {result,observation}=observe(t,mode);assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/child|output|Gate R/);assert.equal(observation.maximumActive,3);assert.equal(observation.started.length,3);assert.equal(observation.closed.length,3);assert.ok(observation.killed.length>=1);assert.equal(observation.scheduledAfterFailure,0);assert.equal(observation.active,0);
});

test('Gate R admits the late heavy family within the unchanged deadline under a bounded workload',t=>{
 const {result,observation}=observe(t,'weighted');assert.equal(result.status,0,result.stderr);assert.equal(observation.started.length,15);assert.equal(observation.closed.length,15);assert.equal(observation.maximumActive,3);assert.equal(observation.active,0);assert.ok(observation.virtualMs<=120000,'the shared deadline is not extended');
});
