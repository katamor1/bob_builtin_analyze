import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BOUNDED_DOCUMENT_HISTORICAL_BINDINGS,validateBoundedDocumentSourceAdmission} from '../../boundedDocumentAdmissionPolicy.mjs';
import {AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS,validateAggregateDocumentSourceAdmission} from '../../aggregateDocumentAdmissionPolicy.mjs';
import {readGateRContainedFile,validateGateRPath} from '../../gateRData.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),base='a826dc20c0e71f472401adf644ca8cc777b74c58';
const t13='tools/main-consolidation/processing-budget-source-admission.json',t14='tools/main-consolidation/bounded-document-source-admission.json',t15='tools/main-consolidation/aggregate-document-source-admission.json';
function gitAt(root,...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim();}
const historicalBytes=new Map();
function historical(relative){
 // These paths and the M2 commit are fixed by the literal historical admissions.
 // Every fixture still hashes/stages its own bytes; never expose the cached Buffer.
 if(!historicalBytes.has(relative))historicalBytes.set(relative,execFileSync('git',['show',base+':'+relative],{cwd:sourceRoot,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}));
 return Buffer.from(historicalBytes.get(relative));
}
function selected(...admissions){return admissions.flatMap(a=>[...a.sourceRows,...a.controlRows].map(row=>row.path));}
export function stageAdmissionFixtureIndex(stage){
 try{return stage();}catch(error){
  const stderr=typeof error?.stderr==='string'?error.stderr:Buffer.isBuffer(error?.stderr)?error.stderr.toString('utf8'):'';
  if(process.platform!=='win32'||error?.status!==128||!/^error: unable to write file \.git\/objects\/[a-f0-9]{2}\/[a-f0-9]{38}: Permission denied$/m.test(stderr))throw error;
  // A new owned object can briefly be shared by Windows filesystem services.
  // Only this measured native failure gets one retry; validation never retries.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);
  return stage();
 }
}
function materialize(parent,label,paths,read){
 if(typeof parent!=='string'||!path.isAbsolute(parent)||!fs.statSync(parent).isDirectory())throw new TypeError('absolute existing fixture parent required');
 const root=fs.mkdtempSync(path.join(parent,label));
 for(const relative of [...new Set(paths)].sort()){
  validateGateRPath(relative);
  if(relative.startsWith('.integration-xlsx-on-prereq/')||relative.startsWith('docs/analysis/')||relative==='docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md')throw new TypeError('protected fixture source');
  const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw new TypeError('fixture escape');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,read(relative));
 }
 const git=(...args)=>gitAt(root,...args);git('init','--quiet','--template=');git('config','core.autocrlf','false');git('config','core.longpaths','true');stageAdmissionFixtureIndex(()=>git('add','--all'));return{root,git};
}
export function createT14AdmissionFixture(parent){
 const old=JSON.parse(historical(t13)),admission=JSON.parse(historical(t14));validateBoundedDocumentSourceAdmission(admission);
 return materialize(parent,'t14-admission-', [...selected(old,admission),...Object.keys(BOUNDED_DOCUMENT_HISTORICAL_BINDINGS),t14,'tools/main-consolidation/boundedDocumentAdmissionPolicy.mjs'],historical);
}
export function createAggregateAdmissionFixture(parent){
 const read=relative=>readGateRContainedFile(sourceRoot,relative),old=JSON.parse(read(t13)),bounded=JSON.parse(read(t14)),admission=JSON.parse(read(t15));validateAggregateDocumentSourceAdmission(admission);
 return materialize(parent,'t15-admission-', [...selected(old,bounded,admission),...Object.keys(AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS),t15,'tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs'],read);
}
