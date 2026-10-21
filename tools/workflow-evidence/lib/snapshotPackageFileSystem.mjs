import {LIMITS,portablePath,snapshotClosedData,compareCodeUnits,reject} from './primitives.mjs';
import {requireSubjectState} from './subjectState.mjs';

/** P1 read adapter over captured explicit collections. It owns no host filesystem operations. */
export function createSnapshotPackageFileSystem(subject){
 const state=requireSubjectState(subject),git=state.git,metadata=new Map(git.metadata.map(row=>[row.path,row])),roots=new Map();let directories=0;
 for(const collection of git.readJson(state.collectionsPath).collections){
  portablePath(collection);const files=new Map(),children=new Map([['',new Set()]]);directories++;
  for(const fullPath of git.selectedPaths){
   if(!fullPath.startsWith(collection+'/'))continue;const relative=fullPath.slice(collection.length+1),row=metadata.get(fullPath);if(!row||!['100644','100755'].includes(row.mode))reject('evidence.path.invalid');
   const bytes=git.readBlob(fullPath).length;files.set(relative,Object.freeze({fullPath,stat:Object.freeze({kind:'file',size:bytes,identity:`${git.treeSha}:file:${row.blobSha}:${fullPath}`})}));
   const segments=relative.split('/');let prefix='';for(let i=0;i<segments.length;i++){
    children.get(prefix).add(segments[i]);if(i===segments.length-1)break;prefix=prefix?prefix+'/'+segments[i]:segments[i];
    if(!children.has(prefix)){if(++directories>LIMITS.gitRows)reject('evidence.limit.exceeded');children.set(prefix,new Set());}
   }
  }
  if(!files.size)reject('evidence.package.invalid');roots.set(collection,{files,children});
 }
 function resolve(root,segments){
  if(typeof root!=='string'||!roots.has(root))reject('evidence.package.invalid');const values=snapshotClosedData(segments);if(!Array.isArray(values))reject('evidence.package.invalid');
  for(const segment of values){if(typeof segment!=='string'||segment.includes('/')||segment.includes('\\'))reject('evidence.path.invalid');portablePath(segment);}
  return{root,relative:values.join('/'),data:roots.get(root)};
 }
 function statAt(location){const file=location.data.files.get(location.relative);if(file)return file.stat;if(location.data.children.has(location.relative))return Object.freeze({kind:'directory',size:0,identity:`${git.treeSha}:directory:${location.root}/${location.relative}`});reject('evidence.package.missing');}
 function readAt(location){const file=location.data.files.get(location.relative);if(!file)reject('evidence.package.missing');return git.readBlob(file.fullPath);}
 return Object.freeze({
  async lstat(root,segments){return statAt(resolve(root,segments));},
  async openFile(root,segments){const location=resolve(root,segments),initialStat=statAt(location);if(initialStat.kind!=='file')reject('evidence.package.invalid');let closed=false;const active=()=>{if(closed)reject('evidence.package.closed');};return Object.freeze({initialStat,async read(){active();return readAt(location);},async stat(){active();return statAt(location);},async close(){closed=true;}});},
  async readDirectory(root,segments){const location=resolve(root,segments),names=location.data.children.get(location.relative);if(!names)reject('evidence.package.missing');return Object.freeze([...names].sort(compareCodeUnits));},
  async readFile(root,segments){return readAt(resolve(root,segments));},
  async realpath(root,segments){const location=resolve(root,segments);statAt(location);return `/workflow-evidence/${git.treeSha}/${root}`+(location.relative?'/'+location.relative:'');},
  isWithin(root,candidate){if(typeof root!=='string'||typeof candidate!=='string'||[root,candidate].some(value=>value.split('/').some(p=>p==='.'||p==='..')))return false;return candidate===root||candidate.startsWith(root+'/');}
 });
}
