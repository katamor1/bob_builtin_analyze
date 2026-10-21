import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {canonicalBytes,compareCodeUnits,digestBytes,snapshotClosedData,portablePath,reject,LIMITS} from './primitives.mjs';
import {captureEvidenceInputFile} from './vsixCapture.mjs';
import {runGit,captureGitTree} from './gitSnapshot.mjs';
import {makeWorkflowEvidenceSubject,requireSubjectState} from './subjectState.mjs';
import {validateVsixArchive} from './vsixArchive.mjs';
import {generateEvidenceBytes} from './contractReport.mjs';
import {publishEvidenceDirectory} from './publishEvidence.mjs';
const require=createRequire(import.meta.url),{parseStrictJson}=require('../../../extensions/workflow-register/out/core/contractV2/packageLoaderInput.js');
export const CI_PROVIDER_CATALOG='extensions/workflow-register/test/fixtures/workflow-contract-v2/manifest-provider-catalog.json';
export const CI_COLLECTIONS='tools/workflow-evidence/test/fixtures/ci-collections.json';
const names=['catalog.json','discovery.json','report.json','compiled-plan-manifest.json'],bundles=new WeakMap();
const invalid=()=>reject('evidence.ci.invalid');
function exact(v,keys){if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))invalid();}
function decode(bytes){return snapshotClosedData(parseStrictJson(bytes,'CI evidence'));}
async function readJson(p,canonical=false){const bytes=(await captureEvidenceInputFile(p)).readBytes(),value=decode(bytes);if(canonical&&!canonicalBytes(value).equals(bytes))invalid();return value;}
export async function checkedOutCommit(expected){
 const commit=(await runGit(process.cwd(),['rev-parse','--verify','HEAD'])).toString('ascii').trim();if(!/^[0-9a-f]{40}$/.test(commit)||(expected!==undefined&&commit!==expected))invalid();return commit;
}
export async function captureCiSubjects(input){
 const r=snapshotClosedData(input);exact(r,['commitSha','vsixPaths','providerCatalogPath','collectionsPath']);await checkedOutCommit(r.commitSha);
 if(!Array.isArray(r.vsixPaths)||![1,3].includes(r.vsixPaths.length))invalid();
 const captured=[],seen=new Set();let total=0,uncompressed=0;
 for(const p of r.vsixPaths){const file=await captureEvidenceInputFile(p,LIMITS.archiveBytes);total+=file.bytes;if(total>LIMITS.totalArchiveBytes)reject('evidence.limit.exceeded');if(seen.has(file.identity))invalid();seen.add(file.identity);const bytes=file.readBytes(),archive=validateVsixArchive(bytes);uncompressed+=archive.uncompressedBytes;if(uncompressed>LIMITS.totalZipBytes)reject('evidence.limit.exceeded');captured.push({...file,archive,rawBytes:bytes});}
 portablePath(r.providerCatalogPath);portablePath(r.collectionsPath);if(r.providerCatalogPath===r.collectionsPath)invalid();
 const repositoryRoot=(await runGit(process.cwd(),['rev-parse','--show-toplevel'],{maxBytes:8192})).toString('utf8').trim(),git=await captureGitTree({repositoryRoot,commitSha:r.commitSha,controlPaths:[r.providerCatalogPath,r.collectionsPath]});
 const subject=makeWorkflowEvidenceSubject({git,vsix:Object.freeze(captured),providerCatalogPath:r.providerCatalogPath,collectionsPath:r.collectionsPath,totalArchiveBytes:total,totalZipBytes:uncompressed}),state=requireSubjectState(subject),rows=[];
 for(const archive of state.vsix){const pkg=decode(archive.archive.readEntry('extension/package.json'));if(typeof pkg.publisher!=='string'||typeof pkg.name!=='string'||typeof pkg.version!=='string')invalid();const id=pkg.publisher+'.'+pkg.name,name=portablePath(id+'.vsix');if(name.includes('/')||rows.some(x=>x.owner.id===id))invalid();rows.push({owner:{id,version:pkg.version},path:name,expectedSha256:archive.sha256,expectedBytes:archive.bytes});}
 rows.sort((a,b)=>compareCodeUnits(a.owner.id,b.owner.id));
 const receipt=snapshotClosedData({schemaVersion:'workflow-evidence-ci-subject/v1',commitSha:r.commitSha,sourceTreeSha:state.git.treeSha,providerCatalogPath:r.providerCatalogPath,providerCatalogSha256:digestBytes(state.git.readBlob(r.providerCatalogPath)),collectionsPath:r.collectionsPath,collectionsSha256:digestBytes(state.git.readBlob(r.collectionsPath)),vsix:rows});
 const subjects=snapshotClosedData(rows.map(({path,expectedSha256,expectedBytes})=>({path,expectedSha256,expectedBytes}))),bundle=Object.freeze({receipt,subjects});
 const bytes=new Map();for(const row of rows){const archive=captured.find(x=>x.sha256===row.expectedSha256&&x.bytes===row.expectedBytes);bytes.set(row.path,archive.rawBytes);}bundles.set(bundle,{bytes,subject});return bundle;
}
export async function writeCiSubjectBundle(directory,bundle){
 const bytes=bundles.get(bundle)?.bytes;if(!bytes)invalid();await fs.mkdir(directory,{mode:0o700});
 for(const row of bundle.receipt.vsix)await fs.writeFile(path.join(directory,row.path),bytes.get(row.path),{flag:'wx'});
 await fs.writeFile(path.join(directory,'subjects.json'),canonicalBytes(bundle.subjects),{flag:'wx'});await fs.writeFile(path.join(directory,'subject.json'),canonicalBytes(bundle.receipt),{flag:'wx'});
}
function validateReceipt(input,requireThree){
 const r=snapshotClosedData(input);exact(r,['schemaVersion','commitSha','sourceTreeSha','providerCatalogPath','providerCatalogSha256','collectionsPath','collectionsSha256','vsix']);
 if(r.schemaVersion!=='workflow-evidence-ci-subject/v1'||!/^[0-9a-f]{40}$/.test(r.commitSha)||!/^[0-9a-f]{40}$/.test(r.sourceTreeSha)||!/^[0-9a-f]{64}$/.test(r.providerCatalogSha256)||!/^[0-9a-f]{64}$/.test(r.collectionsSha256)||!Array.isArray(r.vsix)||!(requireThree?r.vsix.length===3:[1,3].includes(r.vsix.length)))invalid();
 portablePath(r.providerCatalogPath);portablePath(r.collectionsPath);let previous='';const hashes=new Set();
 for(const row of r.vsix){exact(row,['owner','path','expectedSha256','expectedBytes']);exact(row.owner,['id','version']);if(typeof row.owner.id!=='string'||typeof row.owner.version!=='string'||row.path!==row.owner.id+'.vsix'||row.path.includes('/')||portablePath(row.path)!==row.path||row.owner.id<=previous||!/^[0-9a-f]{64}$/.test(row.expectedSha256)||hashes.has(row.expectedSha256)||!Number.isSafeInteger(row.expectedBytes)||row.expectedBytes<1||row.expectedBytes>LIMITS.archiveBytes)invalid();previous=row.owner.id;hashes.add(row.expectedSha256);}
 return r;
}
export async function readCiSubjectBundle(directory,expectedCommitSha,requireThree=true){
 const receipt=validateReceipt(await readJson(path.join(directory,'subject.json'),true),requireThree);if(receipt.commitSha!==expectedCommitSha)invalid();
 const descriptor=await readJson(path.join(directory,'subjects.json'),true),expected=receipt.vsix.map(({path,expectedSha256,expectedBytes})=>({path,expectedSha256,expectedBytes}));if(!canonicalBytes(descriptor).equals(canonicalBytes(expected)))invalid();
 if((await fs.readdir(directory)).sort().join(',')!==['subject.json','subjects.json',...receipt.vsix.map(x=>x.path)].sort().join(','))invalid();
 return{receipt,subjects:expected.map(row=>({...row,path:path.join(directory,row.path)}))};
}
export async function generateCiEvidence(input){
 const r=snapshotClosedData(input);exact(r,['subjectDirectory','outputDirectory','expectedCommitSha']);await checkedOutCommit(r.expectedCommitSha);
 const incoming=await readCiSubjectBundle(r.subjectDirectory,r.expectedCommitSha),captured=await captureCiSubjects({commitSha:r.expectedCommitSha,vsixPaths:incoming.subjects.map(x=>x.path),providerCatalogPath:incoming.receipt.providerCatalogPath,collectionsPath:incoming.receipt.collectionsPath});if(!canonicalBytes(captured.receipt).equals(canonicalBytes(incoming.receipt)))invalid();
 const files=await generateEvidenceBytes(bundles.get(captured).subject);
 await fs.mkdir(r.outputDirectory,{mode:0o700});const publication=await publishEvidenceDirectory({outputDirectory:path.join(r.outputDirectory,'evidence'),files,check:false}),receipt={schemaVersion:'workflow-evidence-ci-run/v1',platform:process.platform,subject:incoming.receipt,publication};
 await fs.writeFile(path.join(r.outputDirectory,'run-receipt.json'),JSON.stringify(receipt)+'\n',{flag:'wx'});return receipt;
}
async function comparisonArtifact(directory,platform){
 const run=await readJson(path.join(directory,'run-receipt.json'));exact(run,['schemaVersion','platform','subject','publication']);if(run.schemaVersion!=='workflow-evidence-ci-run/v1'||run.platform!==platform||run.publication?.state!=='published')invalid();
 const nativeName=path.posix.basename(String(run.publication.backend?.buildLocator??'').replaceAll('\\','/'));if(!/^\.workflow-evidence-native-[A-Za-z0-9]+$/.test(nativeName)||(await fs.readdir(directory)).sort().join(',')!==[nativeName,'evidence','run-receipt.json'].sort().join(','))invalid();const subject=validateReceipt(run.subject,true),files={};
 if((await fs.readdir(path.join(directory,'evidence'))).sort().join(',')!==[...names].sort().join(','))invalid();
 for(const name of names){const bytes=(await captureEvidenceInputFile(path.join(directory,'evidence',name))).readBytes();if(digestBytes(bytes)!==run.publication.artifactDigests?.[name])invalid();files[name]=bytes;}
 const catalog=decode(files['catalog.json']),report=decode(files['report.json']),discovery=decode(files['discovery.json']),manifest=decode(files['compiled-plan-manifest.json']);
 if(catalog.sourceTreeSha!==subject.sourceTreeSha||report.sourceTreeSha!==subject.sourceTreeSha||discovery.sourceTreeSha!==subject.sourceTreeSha||report.catalogDigest!==digestBytes(files['catalog.json'])||report.discoveryDigest!==digestBytes(files['discovery.json'])||report.compiledManifestDigest!==digestBytes(files['compiled-plan-manifest.json'])||report.providerSourceDigest!==subject.providerCatalogSha256||report.state!=='verified'||manifest.packages.length<1||run.publication.reportDigest!==digestBytes(files['report.json']))invalid();
 const actual=catalog.owners.map(x=>({owner:x.owner,path:x.owner.id+'.vsix',expectedSha256:x.archive.sha256,expectedBytes:x.archive.bytes}));if(!canonicalBytes(actual).equals(canonicalBytes(subject.vsix)))invalid();return{subject,files};
}
export async function compareCiEvidenceDirectories(ubuntuDirectory,windowsDirectory){
 const a=await comparisonArtifact(ubuntuDirectory,'linux'),b=await comparisonArtifact(windowsDirectory,'win32');if(!canonicalBytes(a.subject).equals(canonicalBytes(b.subject))||names.some(name=>!a.files[name].equals(b.files[name])))invalid();return Object.freeze({state:'identical',commitSha:a.subject.commitSha,sourceTreeSha:a.subject.sourceTreeSha,artifactDigests:Object.fromEntries(names.map(name=>[name,digestBytes(a.files[name])]))});
}
