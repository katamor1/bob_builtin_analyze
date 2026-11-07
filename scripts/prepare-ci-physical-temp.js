'use strict';
const fs=require('node:fs'),path=require('node:path');
function prepareCiPhysicalTemp(environment=process.env){
 if(environment.GITHUB_ACTIONS!=='true')throw Error('physical fixture preparation requires CI');
 for(const key of ['RUNNER_TEMP','GITHUB_ENV'])if(typeof environment[key]!=='string'||!path.isAbsolute(environment[key])||/[\r\n]/.test(environment[key]))throw Error('invalid CI '+key);
 const parent=fs.realpathSync.native(environment.RUNNER_TEMP);
 if(!fs.statSync(parent).isDirectory())throw Error('CI temp parent must be a directory');
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(parent,'bob-physical-temp-')));
 fs.appendFileSync(environment.GITHUB_ENV,['TMP','TEMP','TMPDIR'].map(key=>key+'='+root+'\n').join(''),'utf8');
 return root;
}
module.exports={prepareCiPhysicalTemp};
if(require.main===module)prepareCiPhysicalTemp();
