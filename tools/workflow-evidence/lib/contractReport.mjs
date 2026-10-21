import {createRequire} from 'node:module';
import {LIMITS,canonicalBytes,digestBytes,snapshotClosedData,reject} from './primitives.mjs';
import {requireSubjectState,requireSubjectResult,bindSubjectResult} from './subjectState.mjs';
import {buildWorkflowContributionCatalog,contributionCatalogDigests} from './contributionCatalog.mjs';
import {discoverTrackedWorkflows} from './trackedDiscovery.mjs';
import {compileWorkflowEvidence,assertCompiledWorkflowEvidence} from './compileEvidence.mjs';
const require=createRequire(import.meta.url),{encodeCompiledWorkflowPlanManifest}=require('../../../extensions/workflow-register/out/core/contractV2/compiledPlanManifest.js');
const reports=new WeakMap();

export function createWorkflowContractReport(subject,catalog,discovery,compiled){
 const state=requireSubjectState(subject);requireSubjectResult(subject,'catalog',catalog);requireSubjectResult(subject,'discovery',discovery);assertCompiledWorkflowEvidence(subject,compiled);
 if(discovery.coverage.unclassified||discovery.coverage.ambiguous)reject('evidence.report.invalid');if(reports.has(subject))return reports.get(subject);
 const digests=contributionCatalogDigests(subject,catalog),packages=new Map(compiled.packages.map(row=>[row.collection+'/'+row.slot+'/current.json',row])),seen=new Set();
 const workflows=discovery.candidates.map(row=>{let compilation=null;if(row.classification==='published_v2'){compilation=packages.get(row.path);if(!compilation||seen.has(row.path))reject('evidence.report.invalid');seen.add(row.path);}return{...row,compilation};});
 if(seen.size!==packages.size)reject('evidence.report.invalid');
 const result=snapshotClosedData({schemaVersion:'workflow-discovery-report/v1',sourceTreeSha:state.git.treeSha,...digests,discoveryDigest:digestBytes(canonicalBytes(discovery)),compiledManifestDigest:compiled.manifestDigest,providerSourceDigest:compiled.providerSourceDigest,environmentDigest:compiled.environmentDigest,coverage:{owners:catalog.owners.length,assets:catalog.owners.reduce((n,row)=>n+row.assets.length,0),commands:catalog.owners.reduce((n,row)=>n+row.commands.length,0),workflows:{...discovery.coverage}},owners:catalog.owners.map(row=>({owner:{...row.owner},assetCount:row.assets.length,commandCount:row.commands.length})),workflows,diagnostics:[],state:'verified'});
 canonicalBytes(result);bindSubjectResult(subject,'report',result);reports.set(subject,result);return result;
}

export async function generateEvidenceBytes(subject){
 const catalog=buildWorkflowContributionCatalog(subject),discovery=discoverTrackedWorkflows(subject,catalog),compiled=await compileWorkflowEvidence(subject,discovery),report=createWorkflowContractReport(subject,catalog,discovery,compiled),manifest=encodeCompiledWorkflowPlanManifest(compiled.manifest);
 if(manifest.length>LIMITS.outputBytes)reject('evidence.limit.exceeded');
 return Object.freeze({'catalog.json':canonicalBytes(catalog),'discovery.json':canonicalBytes(discovery),'report.json':canonicalBytes(report),'compiled-plan-manifest.json':Buffer.from(manifest)});
}
