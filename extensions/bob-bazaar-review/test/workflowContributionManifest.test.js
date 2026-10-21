const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
test('owned templates schemas and scoped discovery claims name real immutable assets',()=>{
 assert.ok(fs.existsSync(path.join(__dirname,'../contracts/workflow-discovery-claims.json')),'owned discovery claims are missing');
 const root=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'contracts/workflow-contributions.json'))),claims=JSON.parse(fs.readFileSync(path.join(root,'contracts/workflow-discovery-claims.json'))),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 assert.deepEqual(claims.owner,{id:pkg.publisher+'.'+pkg.name,version:pkg.version});assert.equal(claims.schemaVersion,'workflow-discovery-claims/v1');
 assert.equal(manifest.action_providers.length,11);assert.equal(manifest.workflow_templates.length,2);assert.equal(manifest.schemas.length,1);
 for(const asset of [...manifest.workflow_templates,...manifest.schemas])assert.ok(fs.statSync(path.join(root,asset.path)).isFile());
 for(const mirror of claims.mirrors)assert.deepEqual(fs.readFileSync(path.join(root,mirror.source)),fs.readFileSync(path.join(root,'../..',mirror.destination)));
 assert.equal(claims.mirrors.length,2);
});
