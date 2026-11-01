import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS} from '../../aggregateDocumentAdmissionPolicy.mjs';
import {INPUT_PROCESS_HISTORICAL_BINDINGS} from '../../inputProcessAdmissionPolicy.mjs';
import {stageAdmissionFixtureIndex} from './aggregateAdmissionFixture.mjs';
import {readGateRContainedFile,validateGateRPath} from '../../gateRData.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),base='b3d18e2d9c3aa272f861a28c69e8e963572186c8';
const t13='tools/main-consolidation/processing-budget-source-admission.json',t14='tools/main-consolidation/bounded-document-source-admission.json',t15='tools/main-consolidation/aggregate-document-source-admission.json',t16='tools/main-consolidation/input-process-source-admission.json';
const cache=new Map();
function historical(relative){if(!cache.has(relative))cache.set(relative,execFileSync('git',['show',base+':'+relative],{cwd:sourceRoot,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}));return Buffer.from(cache.get(relative));}
const paths=a=>[...a.sourceRows,...a.controlRows].map(row=>row.path);
function materialize(parent,label,selected,read){
 if(typeof parent!=='string'||!path.isAbsolute(parent)||!fs.statSync(parent).isDirectory())throw new TypeError('absolute existing fixture parent required');const root=fs.mkdtempSync(path.join(parent,label));
 for(const relative of [...new Set(selected)].sort()){validateGateRPath(relative);if(relative.startsWith('.integration-xlsx-on-prereq/')||relative.startsWith('docs/analysis/')||relative==='docs/superpowers/plans/2026-09-28-premium-informed-three-extension-improvements.md')throw new TypeError('protected fixture source');const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new TypeError('fixture escape');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,read(relative));}
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim();git('init','--quiet','--template=');git('config','core.autocrlf','false');git('config','core.longpaths','true');stageAdmissionFixtureIndex(()=>git('add','--all'));return{root,git};
}
export function createT15AdmissionFixture(parent){
 const admissions=[t13,t14,t15].map(file=>JSON.parse(historical(file)));return materialize(parent,'t15-history-', [...admissions.flatMap(paths),...Object.keys(AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS),t15,'tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs'],historical);
}
export function createInputProcessAdmissionFixture(parent){
 const read=relative=>readGateRContainedFile(sourceRoot,relative),admissions=[t13,t14,t15,t16].map(file=>JSON.parse(read(file))),priorPackage=admissions.slice(0,3).flatMap(paths).filter(file=>file.startsWith('packages/processing-budget-runtime/'));
 return materialize(parent,'t16-current-', [...priorPackage,...paths(admissions[3]),...Object.keys(INPUT_PROCESS_HISTORICAL_BINDINGS),t16,'tools/main-consolidation/inputProcessAdmissionPolicy.mjs'],read);
}
