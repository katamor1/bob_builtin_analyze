const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const repository = path.resolve(__dirname, '../../..');
test('Gate R hosted bootstrap is inventory-only and executes no runtime suites', () => {
  const result = spawnSync(process.execPath, ['tools/main-consolidation/run-gate-r.mjs', '--check'], { cwd:repository, encoding:'utf8', timeout:120000 });
  assert.equal(result.status,0,result.stderr);
  const observation=JSON.parse(result.stdout);
  assert.equal(observation.state,'INVENTORY_ONLY');
  assert.equal(observation.runtimeSuiteState,'NOT_RUN_EMPTY');
  for(const key of ['runtimeSuitesExecuted','archiveTestsExecuted','providerDispatches','bobDispatches']) assert.equal(observation[key],0);
  assert.equal(observation.runtimeActivation,false);
  console.log('GATE_R_BOOTSTRAP_BASE64=' + Buffer.from(result.stdout).toString('base64'));
});
test('Gate R hosted inventory and active-manifest tamper checks reject invalid admission', async () => {
  const { readFileSync } = require('node:fs');
  const { pathToFileURL } = require('node:url');
  const policy=await import(pathToFileURL(path.join(repository,'tools/main-consolidation/gateRPolicy.mjs')));
  const inventory=JSON.parse(readFileSync(path.join(repository,'tools/main-consolidation/gate-r-archive-inventory.json')));
  inventory.paths.pop(); assert.throws(()=>policy.validateGateRInventory(inventory),/inventory/);
  const active=JSON.parse(readFileSync(path.join(repository,'tools/main-consolidation/gate-r-active-suite.json')));
  active.capabilities=[{capabilityId:'WF2-R6-ARCHIVED',testPaths:['archive-runtime.test.js']}];
  assert.throws(()=>policy.validateGateRActiveSuite(active),/active suite/);
});
