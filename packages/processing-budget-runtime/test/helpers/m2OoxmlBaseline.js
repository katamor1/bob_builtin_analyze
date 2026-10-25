'use strict';
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=path.resolve(__dirname,'../baseline');
const fixed={
 'm2-ruleOoxmlPreflight.test.js':'161a95d543ad1efb011bdfb4b3212f1d8c08f1dcbd18665a652eafa856365e44',
 'm2-storedZipFixture.js':'e2c0be1660464a36fbb29265def46b2ac5b9561354f52d2e59969398e53c998d',
 'm2-ooxmlArchive.ts':'2225f70089962925cb358c6a1bfe012127e719d36f0e9f7536a534e743686743',
 'm2-ooxmlPreflight.ts':'0d998bcc44b5b8b260308d6cb5338c22720cdc1d4804265d277595f9460927d3',
 'm2-ruleSourceHash.ts':'b94cedbfdd57d40d58ec659953be55425c6bd72d94bd21e45178823a3782a477',
 'm2-ruleAuthoringLimits.ts':'bb9e2910c4c97351e732ff2499396ce349e116528497253927dacc538d8a6b30'
};
function source(name){const bytes=fs.readFileSync(path.join(directory,name));if(fixed[name])assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixed[name]);return bytes.toString('utf8');}
function execute(code,imports){const mod={exports:{}};new Function('require','module','exports','Buffer',code)(id=>{if(Object.hasOwn(imports,id))return imports[id];if(['node:crypto','node:fs/promises','node:zlib','node:assert/strict'].includes(id))return require(id);throw Error('unknown baseline import '+id);},mod,mod.exports,Buffer);return mod.exports;}
function baseline(codec=require('./boundedDocumentFixtures').codec()){
 const transpile=name=>ts.transpileModule(source(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const limits=execute(transpile('m2-ruleAuthoringLimits.ts'),{}),hash=execute(transpile('m2-ruleSourceHash.ts'),{}),preflight=execute(transpile('m2-ooxmlPreflight.ts'),{});
 const archive=execute(transpile('m2-ooxmlArchive.ts'),{'../ruleAuthoringLimits':limits,'../ruleSourceHash':hash,'./ooxmlPreflight':preflight,fflate:codec});
 return{...archive,...preflight,limits:limits.DEFAULT_RULE_AUTHORING_LIMITS};
}
function adversarialCases(preflight){
 const fixture=execute(source('m2-storedZipFixture.js'),{}),cases=[];
 execute(source('m2-ruleOoxmlPreflight.test.js'),{'node:test':{test:(name,fn)=>cases.push({name,fn})},'../out/ruleAuthoring/extraction/ooxmlPreflight':{preflightOoxmlArchive:preflight},'./helpers/storedZipFixture':fixture});
 return cases;
}
module.exports={baseline,adversarialCases};
