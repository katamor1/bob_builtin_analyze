import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateGateRPath} from '../../gateRData.mjs';
import {stageAdmissionFixtureIndex} from './aggregateAdmissionFixture.mjs';
import {createDeadlineAdmissionFixture} from './deadlineAdmissionFixture.mjs';

const source=fileURLToPath(new URL('../../../../',import.meta.url));
const subject='cf96788dbdd6836b449b7a31ecd3bae4ee4302a4';
const cache=new Map();

function readMissing(paths){
 const missing=[...new Set(paths)].filter(relative=>!cache.has(relative));
 for(const relative of missing){
  validateGateRPath(relative);
  if(relative.startsWith('.integration-xlsx-on-prereq/')||relative.startsWith('docs/analysis/')
   ||relative==='docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md')
   throw new TypeError('protected fixture source');
 }
 if(!missing.length)return;
 const output=execFileSync('git',['cat-file','--batch'],{
  cwd:source,input:missing.map(relative=>subject+':'+relative).join('\n')+'\n',
  maxBuffer:16*1048576,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}
 });
 let offset=0;
 for(const relative of missing){
  const end=output.indexOf(10,offset);
  const header=/^[a-f0-9]{40} blob (\d+)$/.exec(output.subarray(offset,end).toString('ascii'));
  if(end<0||!header)throw new TypeError('literal M0 blob missing: '+relative);
  const size=Number(header[1]),start=end+1;
  if(!Number.isSafeInteger(size)||output[start+size]!==10)throw new TypeError('literal M0 blob size: '+relative);
  cache.set(relative,output.subarray(start,start+size));
  offset=start+size+1;
 }
 if(offset!==output.length)throw new TypeError('literal M0 blob inventory');
}

export function readDeadlineReplayFile(relative){
 readMissing([relative]);
 return Buffer.from(cache.get(relative));
}

export function createDeadlineReplay(parent=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'t17-history-'))){
 // Reuse the owned fixture and its selected Git authority pack. Replay each
 // tracked input at the literal accepted T17-DEADLINE metadata subject.
 const fixture=createDeadlineAdmissionFixture(parent);
 const paths=fixture.git('ls-files','-z').split('\0').filter(Boolean);
 readMissing(paths);
 for(const relative of paths){
  const file=path.join(fixture.root,relative);
  fs.writeFileSync(file,readDeadlineReplayFile(relative));
 }
 stageAdmissionFixtureIndex(()=>fixture.git('add','--all'));
 return {...fixture,read:readDeadlineReplayFile};
}
