import fs from 'node:fs/promises';
import path from 'node:path';
import {LIMITS,snapshotClosedData,portableFold,portablePath,reject} from './primitives.mjs';
import {runGit,captureGitTree} from './gitSnapshot.mjs';
import {captureVsixFile} from './vsixCapture.mjs';
import {makeWorkflowEvidenceSubject} from './subjectState.mjs';

export async function captureWorkflowEvidenceSubject(input){
 const request=snapshotClosedData(input);if(request===null||typeof request!=='object'||Array.isArray(request))reject('evidence.subject.invalid');const keys=Object.keys(request).sort().join(',');
 if(keys!=='collectionsPath,commitSha,providerCatalogPath,vsixSubjects'||typeof request.commitSha!=='string'||!/^[0-9a-f]{40}$/.test(request.commitSha)||!Array.isArray(request.vsixSubjects)||!request.vsixSubjects.length)reject('evidence.subject.invalid');
 if(request.vsixSubjects.length>LIMITS.archiveCount)reject('evidence.limit.exceeded');
 portablePath(request.providerCatalogPath);portablePath(request.collectionsPath);if(request.providerCatalogPath===request.collectionsPath)reject('evidence.subject.invalid');
 const cwd=await fs.realpath(process.cwd()),repositoryRoot=(await runGit(cwd,['rev-parse','--show-toplevel'],{maxBytes:8192})).toString('utf8').trim();
 const git=await captureGitTree({repositoryRoot,commitSha:request.commitSha,controlPaths:[request.providerCatalogPath,request.collectionsPath]});
 const seen=new Set(),vsix=[];let totalArchiveBytes=0,totalZipBytes=0;
 for(const descriptor of request.vsixSubjects){
  if(descriptor===null||typeof descriptor!=='object'||Array.isArray(descriptor)||typeof descriptor.path!=='string')reject('evidence.subject.invalid');
  if(!Number.isSafeInteger(descriptor.expectedBytes)||descriptor.expectedBytes<0)reject('evidence.subject.invalid');totalArchiveBytes+=descriptor.expectedBytes;if(totalArchiveBytes>LIMITS.totalArchiveBytes)reject('evidence.limit.exceeded');
  const key=portableFold(path.resolve(descriptor.path));if(seen.has(key))reject('evidence.subject.invalid');seen.add(key);
  const captured=await captureVsixFile(descriptor);if(seen.has(captured.identity))reject('evidence.subject.invalid');seen.add(captured.identity);
  totalZipBytes+=captured.archive.uncompressedBytes;if(totalZipBytes>LIMITS.totalZipBytes)reject('evidence.limit.exceeded');vsix.push(captured);
 }
 return makeWorkflowEvidenceSubject({git,vsix:Object.freeze(vsix),providerCatalogPath:request.providerCatalogPath,collectionsPath:request.collectionsPath,totalArchiveBytes,totalZipBytes});
}
