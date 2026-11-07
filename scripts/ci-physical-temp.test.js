'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('CI test fixtures use a fresh physical directory even when RUNNER_TEMP is an alias',()=>{
 const file=path.join(__dirname,'prepare-ci-physical-temp.js');
 assert.ok(fs.existsSync(file),'physical CI temp bootstrap must exist');
 const {prepareCiPhysicalTemp}=require(file),parent=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'ci-temp-contract-'));
 const target=path.join(parent,'target'),alias=path.join(parent,'alias'),environmentFile=path.join(parent,'environment');
 fs.mkdirSync(target);fs.symlinkSync(target,alias,process.platform==='win32'?'junction':'dir');fs.writeFileSync(environmentFile,'');
 const result=prepareCiPhysicalTemp({GITHUB_ACTIONS:'true',RUNNER_TEMP:alias,GITHUB_ENV:environmentFile});
 assert.equal(fs.realpathSync.native(result),result);assert.equal(path.dirname(result),fs.realpathSync.native(target));
 assert.notEqual(result,target);assert.equal(fs.statSync(result).isDirectory(),true);
 const entries=Object.fromEntries(fs.readFileSync(environmentFile,'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
 assert.deepEqual(entries,{TMP:result,TEMP:result,TMPDIR:result});
 assert.throws(()=>prepareCiPhysicalTemp({GITHUB_ACTIONS:'false',RUNNER_TEMP:alias,GITHUB_ENV:environmentFile}),/CI/);
});
