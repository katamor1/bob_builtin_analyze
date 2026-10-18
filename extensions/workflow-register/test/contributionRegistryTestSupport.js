const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const base=require('./contributionTestSupport')
function hostApi(){const file=path.join(__dirname,'../out/api/providerRegistryApi.js');assert.ok(fs.existsSync(file),'atomic provider registry API is missing');return require(file)}
function harness(options={}){
 const {ActionRegistry}=require('../out/core/actionRegistry.js'),{ProviderRegistryHost}=hostApi()
 const current={value:base.installed()};const registry=new ActionRegistry(options)
 const host=new ProviderRegistryHost({actionRegistry:registry,resolveInstalledExtension:()=>current.value})
 return{host,registry,current,runtime:registry.contributionRuntimeResolver()}
}
function register(x,m=base.manifest(),h=base.handlers()){return x.host.api.registerContributionSet(m,x.current.value,h)}
module.exports={...base,hostApi,harness,register}
