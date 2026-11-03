import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {INPUT_PROCESS_HISTORICAL_BINDINGS} from '../../inputProcessAdmissionPolicy.mjs';
import {DEADLINE_HISTORICAL_BINDINGS,validateDeadlineCoverage,validateDeadlineSourceAdmission} from '../../deadlineAdmissionPolicy.mjs';
import {stageAdmissionFixtureIndex} from './aggregateAdmissionFixture.mjs';
import {readGateRContainedFile,validateGateRPath} from '../../gateRData.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),BASE='6ce384313c1072e34ced342260304c9c7dd07e9e',OWNER='7ea786afd5715d841526000a402c831d6c2a203c';
const t13='tools/main-consolidation/processing-budget-source-admission.json',t14='tools/main-consolidation/bounded-document-source-admission.json',t15='tools/main-consolidation/aggregate-document-source-admission.json',t16='tools/main-consolidation/input-process-source-admission.json',t17='tools/main-consolidation/deadline-source-admission.json',coverage='docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json';
const cache=new Map(),objects=new Map(),options={cwd:sourceRoot,maxBuffer:32*1048576,stdio:['pipe','pipe','pipe']};
function historical(relative){validateGateRPath(relative);const key=BASE+':'+relative;if(!cache.has(key))cache.set(key,execFileSync('git',['show',key],options));return Buffer.from(cache.get(key));}
function selected(admissions){return admissions.flatMap(a=>[...a.sourceRows,...a.controlRows].map(row=>row.path));}
function materialize(parent,label,paths,read){
 if(typeof parent!=='string'||!path.isAbsolute(parent)||!fs.lstatSync(parent).isDirectory()||fs.lstatSync(parent).isSymbolicLink())throw new TypeError('absolute existing fixture parent required');const root=fs.mkdtempSync(path.join(parent,label));
 for(const relative of [...new Set(paths)].sort()){validateGateRPath(relative);if(relative.startsWith('.integration-xlsx-on-prereq/')||relative.startsWith('docs/analysis/')||relative==='docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md')throw new TypeError('protected fixture source');const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new TypeError('fixture escape');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,read(relative),{flag:'wx'});}
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1048576,stdio:['pipe','pipe','pipe']}).trim();git('init','--quiet','--template=');git('config','core.autocrlf','false');git('config','core.longpaths','true');stageAdmissionFixtureIndex(()=>git('add','--all'));return{root,git};
}
function authorityObjects(fixture,coverageValue,admission){
 validateDeadlineCoverage(coverageValue);validateDeadlineSourceAdmission(admission);
 const key=JSON.stringify([coverageValue.items.map(item=>item.origin),[...admission.sourceRows,...admission.controlRows].map(row=>[row.path,row.beforeBlobSha]),Object.keys(DEADLINE_HISTORICAL_BINDINGS)]);let pack=objects.get(key);
 if(!pack){const specs=new Set([BASE,BASE+'^{tree}',OWNER,OWNER+'^{tree}']);function file(subject,relative){validateGateRPath(relative);const parts=relative.split('/');for(let i=1;i<parts.length;i++)specs.add(subject+':'+parts.slice(0,i).join('/'));specs.add(subject+':'+relative);}
  for(const item of coverageValue.items)file(OWNER,item.origin.path);for(const row of [...admission.sourceRows,...admission.controlRows])if(row.beforeBlobSha!==null)file(BASE,row.path);for(const relative of Object.keys(DEADLINE_HISTORICAL_BINDINGS))file(BASE,relative);
  const rows=readPinnedGitBatch(sourceRoot,[...specs]),unique=new Map();for(const object of rows.values()){const actual=createHash('sha1').update(Buffer.from(object.type+' '+object.bytes.length+'\0')).update(object.bytes).digest('hex');if(actual!==object.oid)throw new TypeError('immutable authority object hash');unique.set(object.type+':'+object.oid,object);}
  const header=Buffer.alloc(12);header.write('PACK');header.writeUInt32BE(2,4);header.writeUInt32BE(unique.size,8);const chunks=[header],types={commit:1,tree:2,blob:3};for(const object of unique.values()){let size=object.bytes.length,first=(types[object.type]<<4)|(size&15);size=Math.floor(size/16);const encoded=[];if(size)first|=128;encoded.push(first);while(size){let byte=size&127;size=Math.floor(size/128);if(size)byte|=128;encoded.push(byte);}chunks.push(Buffer.from(encoded),deflateSync(object.bytes));}const body=Buffer.concat(chunks);pack=Buffer.concat([body,createHash('sha1').update(body).digest()]);objects.set(key,pack);
 }
 const repository=execFileSync('git',['rev-parse','--absolute-git-dir'],{cwd:fixture.root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();if(path.resolve(repository)!==path.resolve(fixture.root,'.git')||fs.lstatSync(repository).isSymbolicLink())throw new TypeError('owned fixture Git database required');execFileSync('git',['index-pack','--stdin'],{cwd:fixture.root,input:pack,maxBuffer:64*1048576,stdio:['pipe','pipe','pipe']});
}
export function createT16AdmissionFixture(parent){
 const admissions=[t13,t14,t15,t16].map(relative=>JSON.parse(historical(relative))),testPaths=JSON.parse(historical('docs/release-evidence/proc-t16-input-process-source-coverage-2026-10-31.json')).items.flatMap(item=>item.testPaths);return materialize(parent,'t16-history-', [...selected(admissions),...testPaths,...Object.keys(INPUT_PROCESS_HISTORICAL_BINDINGS),...Object.keys(DEADLINE_HISTORICAL_BINDINGS),t16,'tools/main-consolidation/inputProcessAdmissionPolicy.mjs'],historical);
}
export function createDeadlineAdmissionFixture(parent){
 const read=relative=>readGateRContainedFile(sourceRoot,relative),admissions=[t13,t14,t15,t16,t17].map(relative=>JSON.parse(read(relative))),current=admissions.at(-1),priorPackage=selected(admissions.slice(0,4)).filter(relative=>relative.startsWith('packages/processing-budget-runtime/')),f=materialize(parent,'t17-current-', [...priorPackage,...selected([current]),...Object.keys(DEADLINE_HISTORICAL_BINDINGS),t17,'tools/main-consolidation/deadlineAdmissionPolicy.mjs'],read);authorityObjects(f,JSON.parse(read(coverage)),current);return f;
}

function readPinnedGitBatch(root,specs){
 const raw=execFileSync('git',['cat-file','--batch'],{cwd:root,input:specs.join('\n')+'\n',maxBuffer:64*1048576,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}),rows=new Map();let offset=0;
 for(const spec of specs){const end=raw.indexOf(10,offset);if(end<offset)throw new TypeError('deadline Git batch header');const match=/^([a-f0-9]{40}) (commit|tree|blob) ([0-9]+)$/.exec(raw.subarray(offset,end).toString('ascii'));if(!match)throw new TypeError('deadline immutable Git object missing');const size=Number(match[3]);if(!Number.isSafeInteger(size)||size<0||end+1+size>=raw.length||raw[end+1+size]!==10)throw new TypeError('deadline Git batch size');rows.set(spec,{oid:match[1],type:match[2],bytes:raw.subarray(end+1,end+1+size)});offset=end+2+size;}
 if(offset!==raw.length)throw new TypeError('deadline Git batch trailing data');return rows;
}
