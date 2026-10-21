import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {createRequire} from 'node:module';
const exec=promisify(execFile);
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const line=value=>Buffer.from(JSON.stringify(value,Object.keys(value).sort())+'\n');
export function fixtureCrc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}

/** Independent ZIP fixture encoder; mutate receives offsets into the final buffer. */
export function makeZip({entries=[{name:'extension/package.json',data:'{}'}],mutate}={}){
 const chunks=[],central=[],locals=[],centrals=[];let offset=0;
 for(const entry of entries){
  const data=Buffer.from(entry.data??''),name=Buffer.isBuffer(entry.name)?entry.name:Buffer.from(entry.name);
  const method=entry.method??0,flags=entry.flags??(0x800|(entry.descriptor?8:0));
  const compressed=entry.compressed??(method===8?deflateRawSync(data):data);
  const crc=fixtureCrc32(data),rawSize=entry.rawSize??data.length;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);
  if(!(flags&8)){local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(rawSize,22);}
  local.writeUInt16LE(name.length,26);
  locals.push(offset);chunks.push(local,name,compressed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(0x314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);
  c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(rawSize,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE((entry.mode??0x81a4)*65536>>>0,38);c.writeUInt32LE(offset,42);
  central.push(c,name);offset+=30+name.length+compressed.length;
  if(flags&8){const d=Buffer.alloc(entry.unsignedDescriptor?12:16),start=entry.unsignedDescriptor?0:4;if(start)d.writeUInt32LE(0x08074b50);d.writeUInt32LE(crc,start);d.writeUInt32LE(compressed.length,start+4);d.writeUInt32LE(rawSize,start+8);chunks.push(d);offset+=d.length;}
 }
 const centralOffset=offset;for(let i=0;i<central.length;i+=2){centrals.push(offset);offset+=central[i].length+central[i+1].length;}
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(offset-centralOffset,12);end.writeUInt32LE(centralOffset,16);
 const bytes=Buffer.concat([...chunks,...central,end]);return mutate?.({bytes,locals,centrals,eocdOffset:offset})??bytes;
}

export async function runInRepository(root,modulePath,args=[]){
 try{const r=await exec(process.execPath,[modulePath,...args],{cwd:root,windowsHide:true,maxBuffer:1024*1024});return{code:0,stdout:r.stdout,stderr:r.stderr};}
 catch(e){return{code:e.code??1,stdout:e.stdout??'',stderr:e.stderr??''};}
}

export async function temporaryDirectory(prefix){return fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),prefix));}

export async function makeEvidenceRepository({v2Packages=1}={}){
 const root=await temporaryDirectory('workflow-evidence-');
 const write=async(relative,bytes)=>{const p=path.join(root,relative);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);};
 const canonical=value=>Buffer.from(JSON.stringify(value)+'\n');
 const archives=[];
 for(const name of ['alpha','beta','gamma']){
  const owner={id:`fixture.${name}`,version:'1.0.0'},dir=`extensions/${name}`;
  const pkg={publisher:'fixture',name,version:'1.0.0',contributes:{commands:[{command:`${name}.run`,title:'Run'}]}};
  const asset=`templates/.bob/workflows/${name}/WORKFLOW.md`,text=Buffer.from(`---\nschemaVersion: workflow-register/v1\nname: ${name}\n---\nFixture\n`);
  const manifest={schema_version:'workflow-contributions/v1',owner,registry_api:{min:'provider-registry/v1',max:'provider-registry/v1'},action_providers:[{id:`${name}.run`,contract_version:`${name}.run/v1`}],preflight_checks:[],result_sinks:[],workflow_templates:[{id:`${name}.template`,path:asset}],schemas:[]};
  const claims={schemaVersion:'workflow-discovery-claims/v1',owner,scopes:[{prefix:'templates/',role:'template'},...(name==='alpha'&&v2Packages>0?[{prefix:'fixtures/',role:'fixture'}]:[])],exclusions:[],externalCommands:[],mirrors:[{source:asset,destination:`.bob/workflows/${name}/WORKFLOW.md`}]};
  const files={'package.json':canonical(pkg),'contracts/workflow-contributions.json':canonical(manifest),'contracts/workflow-discovery-claims.json':canonical(claims),[asset]:text};
  for(const [relative,bytes]of Object.entries(files))await write(`${dir}/${relative}`,bytes);
  await write(`.bob/workflows/${name}/WORKFLOW.md`,text);
  archives.push({name,bytes:makeZip({entries:Object.entries(files).map(([p,data])=>({name:`extension/${p}`,data,method:8}))})});
 }
 if(v2Packages){
  const require=createRequire(new URL('../../../extensions/workflow-register/test/workflowContractV2CompilerTestSupport.js',import.meta.url));
  const {createLockedRawPackage}=require('../../../extensions/workflow-register/test/workflowContractV2CompilerTestSupport.js');
  const {workflowPackageGenerationDirectoryName}=require('../../../extensions/workflow-register/out/core/contractV2/packageGenerationPath.js');
  for(let i=0;i<v2Packages;i++){const f=createLockedRawPackage(),slot=i?'minimal'+i:'minimal',collection='extensions/alpha/fixtures/published',generation=workflowPackageGenerationDirectoryName(f.rawPackage.generation);for(const [p,b]of Object.entries(f.files))await write(`${collection}/${slot}/versions/${generation}/${p}`,b);await write(`${collection}/${slot}/current.json`,canonical({schemaVersion:'workflow-package-pointer/v1',workflowId:slot,generation:f.rawPackage.generation,packageDigest:f.rawPackage.packageDigest}));}
 }
 const providerCatalogPath='providers.json',collectionsPath='collections.json';
 await write(providerCatalogPath,Buffer.from('{"providers":[],"schemaVersion":"workflow-provider-catalog-source/v1"}\n'));
 await write(collectionsPath,Buffer.from(`{"collections":${JSON.stringify(v2Packages?['extensions/alpha/fixtures/published']:[])},"schemaVersion":"workflow-contract-v2-collections/v1"}\n`));
 await exec('git',['init','--quiet'],{cwd:root,windowsHide:true});
 await exec('git',['-c','core.autocrlf=false','add','--','.'],{cwd:root,windowsHide:true});
 await exec('git',['-c','user.name=Evidence fixture','-c','user.email=evidence@example.invalid','commit','--quiet','-m','fixture'],{cwd:root,windowsHide:true});
 const {stdout}=await exec('git',['rev-parse','HEAD'],{cwd:root,windowsHide:true});
 const vsixSubjects=[];for(const a of archives){const p=path.join(root,`${a.name}.vsix`);await fs.writeFile(p,a.bytes);vsixSubjects.push({path:p,expectedSha256:hash(a.bytes),expectedBytes:a.bytes.length});}
 return{root,commitSha:stdout.trim(),vsixSubjects,providerCatalogPath,collectionsPath};
}
