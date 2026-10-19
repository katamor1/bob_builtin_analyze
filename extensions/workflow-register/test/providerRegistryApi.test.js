const assert=require('node:assert/strict'),{test}=require('node:test')
const {hostApi,harness,register,manifest,handlers,installed,errorCode}=require('./contributionRegistryTestSupport')
test('negotiation selects the supported version using exact bounded integer ranges',()=>{
 const {negotiateProviderRegistry:n}=hostApi()
 for(const max of ['provider-registry/v1','provider-registry/v'+'9'.repeat(45)])assert.equal(n({min:'provider-registry/v1',max}),'provider-registry/v1')
 assert.throws(()=>n({min:'provider-registry/v2',max:'provider-registry/v999'}),errorCode('provider.registry.version_incompatible'))
})
for(const [name,value]of[
 ['zero',{min:'provider-registry/v0',max:'provider-registry/v1'}],['leading zero',{min:'provider-registry/v01',max:'provider-registry/v1'}],
 ['suffix',{min:'provider-registry/v1extra',max:'provider-registry/v1'}],['inverted',{min:'provider-registry/v2',max:'provider-registry/v1'}],
 ['extra',{min:'provider-registry/v1',max:'provider-registry/v1',extra:true}],['missing',{min:'provider-registry/v1'}],
 ['overlong',{min:'provider-registry/v1',max:'provider-registry/v'+'9'.repeat(46)}]
])test('negotiation rejects '+name,()=>assert.throws(()=>hostApi().negotiateProviderRegistry(value),errorCode('provider.registry.range_malformed')))
test('unsupported manifest range is rejected before handlers or a commit seam are read',()=>{
 let reads=0,commits=0;const x=harness({beforeContributionCommit(){commits++}}),m=manifest(),h=handlers()
 m.registry_api={min:'provider-registry/v2',max:'provider-registry/v3'};Object.defineProperty(h,'actionProviders',{enumerable:true,get(){reads++;throw Error('SECRET')}})
 assert.throws(()=>register(x,m,h),errorCode('provider.registry.version_incompatible'));assert.equal(reads,0);assert.equal(commits,0)
})
test('host-resolved installed metadata defeats caller supplied owner and root claims',()=>{
 const x=harness(),m=manifest(),h=handlers()
 for(const provenance of [installed({version:'9.0.0'}),installed({extensionRoot:installed().extensionRoot+'-other'}),installed({id:'local.other'})])assert.throws(()=>x.host.api.registerContributionSet(m,provenance,h),errorCode('contribution.provenance.invalid'))
 x.current.value=undefined;assert.throws(()=>x.host.api.registerContributionSet(m,installed(),h),errorCode('contribution.provenance.invalid'))
 assert.equal(x.host.trackedRegistrationCount(),0)
})
test('host rejects hostile installed metadata and range getters without invoking them',()=>{
 let calls=0;const x=harness(),p=installed();Object.defineProperty(p,'id',{enumerable:true,get(){calls++;throw Error('SECRET')}})
 x.current.value=p;assert.throws(()=>register(x),errorCode('contribution.provenance.invalid'))
 const range={max:'provider-registry/v1'};Object.defineProperty(range,'min',{enumerable:true,get(){calls++;throw Error('SECRET')}})
 assert.throws(()=>hostApi().negotiateProviderRegistry(range),errorCode('provider.registry.range_malformed'));assert.equal(calls,0)
 const proxy=new Proxy({min:'provider-registry/v1',max:'provider-registry/v1'},{ownKeys(){calls++;throw Error('SECRET')}})
 assert.throws(()=>hostApi().negotiateProviderRegistry(proxy),errorCode('provider.registry.range_malformed'));assert.equal(calls,0)
})

test('host shutdown cannot interleave with pending registration publication',()=>{
 let x
 x=harness({beforeContributionCommit:()=>assert.throws(()=>x.host.dispose(),errorCode('contribution.registry.reentrant_mutation'))})
 const r=register(x);assert.equal(x.host.snapshot().ownedSetCount,1);assert.equal(x.host.trackedRegistrationCount(),1)
 r.dispose();x.host.dispose();assert.equal(x.host.snapshot().ownedSetCount,0)
})

test('trusted installed resolver cannot recursively register or close a pending host',()=>{
 const {ActionRegistry}=require('../out/core/actionRegistry.js'),{ProviderRegistryHost}=hostApi();let host,calls=0
 host=new ProviderRegistryHost({actionRegistry:new ActionRegistry(),resolveInstalledExtension:()=>{
  calls++;assert.throws(()=>host.api.registerContributionSet(manifest(),installed(),handlers()),errorCode('contribution.registry.reentrant_mutation'))
  assert.throws(()=>host.dispose(),errorCode('contribution.registry.reentrant_mutation'));return installed()
 }})
 host.api.registerContributionSet(manifest(),installed(),handlers()).dispose();assert.equal(calls,1);assert.equal(host.trackedRegistrationCount(),0)
})
