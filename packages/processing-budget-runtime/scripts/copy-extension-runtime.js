'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {COMPILED_FILES}=require('./runtime-payload'),build=require('./build-runtime');
function copyExtensionRuntime(extensionRoot){return build.withBuildLock(()=>{
 if(typeof extensionRoot!=='string'||!path.isAbsolute(extensionRoot))throw Error('absolute extension root required');
 const destinationRoot=path.resolve(extensionRoot),allowed=['bob-bazaar-review','bob-code-consistency-review'].map(name=>path.join(build.repositoryRoot,'extensions',name));
 if(!allowed.includes(destinationRoot))throw Error('extension output escape rejected');build.noFollow(destinationRoot);
 const config=JSON.parse(fs.readFileSync(path.join(destinationRoot,'package.json'),'utf8'));if(config.name!==path.basename(destinationRoot))throw Error('extension identity mismatch');
 const receipt=build.verifiedBuild();const stage=build.freshStaging('copy-');
 for(const name of COMPILED_FILES)fs.copyFileSync(path.join(build.output,name),path.join(stage,name),fs.constants.COPYFILE_EXCL);
 const payload=build.inventory(stage,COMPILED_FILES);if(JSON.stringify(payload)!==JSON.stringify(receipt.payload))throw Error('copy payload mismatch');
 const manifest={schemaVersion:'bob-builtin-analyze/processing-runtime-copy/v1',sourceInputDigest:receipt.sourceInputDigest,payload};
 const data=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(stage,'manifest.json'),data,{flag:'wx'});
 if(build.sourceInputs().digest!==receipt.sourceInputDigest)throw Error('source changed during copy');
 const destination=path.join(destinationRoot,'out/shared-processing-budget-runtime'),previous=build.publish(stage,destination,[...COMPILED_FILES,'manifest.json']);
 return{...manifest,destination,manifestSha256:crypto.createHash('sha256').update(data).digest('hex'),retainedPrevious:previous};
});}
if(require.main===module){try{if(process.argv.length!==4||process.argv[2]!=='--extension-root')throw Error('expected --extension-root only');process.stdout.write(JSON.stringify(copyExtensionRuntime(process.argv[3]))+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
module.exports={copyExtensionRuntime};
