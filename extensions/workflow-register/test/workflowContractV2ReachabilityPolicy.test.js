const assert = require('node:assert/strict')
const { test } = require('node:test')
function subject() {
  try { return require('../scripts/check-contract-v2-runtime-reachability') } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.startsWith("Cannot find module '../scripts/check-contract-v2-runtime-reachability'")) return {}
    throw error
  }
}
function validate(rows, roots = ['src/product.ts']) {
  const fn = subject().validateContractV2ProductReachability
  assert.equal(typeof fn, 'function')
  return fn(rows, roots)
}
const evidence = { path: 'src/core/contractV2/runPlanProvenance.ts', text: 'export function decode(value: unknown) { return value }' }
test('R1 reachability admits only evidence without executing fixture source', () => {
  const rows = [{ path: 'src/product.ts', text: 'import { decode } from "./core/contractV2/runPlanProvenance"; export const view = () => decode({});' }, evidence]
  assert.equal(validate(rows), undefined)
  assert.equal(validate([{ path: 'src/product.ts', text: 'globalThis.__R1FixtureMustNotExecute = true; export const x = 1;' }]), undefined)
  assert.equal(globalThis.__R1FixtureMustNotExecute, undefined)
})
for (const target of ['core/contractV2/runPlanLeaseContext', 'core/contractV2/runPlanState', 'core/contractV2/runLeaseExecutionCoordinator', 'workflowContractV2LeasedRunStateStore', 'workflowContractV2RuntimeBoundary', 'core/contractV2/providerInvocation', 'core/contractV2/artifactTransaction']) {
  for (const statement of ['import { x } from "./' + target + '";', 'export * from "./' + target + '";', 'const x = require("./' + target + '");']) {
    test('R1 reachability rejects runtime source ' + statement, () => assert.throws(() => validate([{ path: 'src/product.ts', text: statement }, { path: 'src/' + target + '.ts', text: 'export const x = 1;' }]), /runtime|private|conditional|reachability/i))
  }
}
test('R1 reachability follows transitive value imports', () => {
  assert.throws(() => validate([{ path: 'src/product.ts', text: 'import { x } from "./helper";' }, { path: 'src/helper.ts', text: 'export { x } from "./workflowContractV2RuntimeBoundary";' }, { path: 'src/workflowContractV2RuntimeBoundary.ts', text: 'export const x = 1;' }]), /runtime|private|reachability/i)
})
for (const statement of ['planStore.acquire({});', 'facade.acquireCurrent({});', 'executeWorkflowContractV2RuntimeBoundary({});', 'const x = require(variable);']) {
  test('R1 reachability rejects product shortcut ' + statement, () => assert.throws(() => validate([{ path: 'src/product.ts', text: statement }]), /acqui|runtime|authority|reachability/i))
}
test('R1 reachability rejects ambiguous source paths and duplicates', () => {
  for (const bad of ['../product.ts', 'C:/product.ts', '//server/product.ts', 'src\\product.ts']) assert.throws(() => validate([{ path: bad, text: '' }], [bad]), /path|reachability/i)
  assert.throws(() => validate([{ path: 'src/product.ts', text: '' }, { path: 'src/PRODUCT.ts', text: '' }]), /duplicate|alias|reachability/i)
})

test('R1 reachability rejects value provenance barrel exports',()=>{
 assert.throws(()=>validate([{path:'src/core/contractV2/index.ts',text:'export * from "./runPlanProvenance";'},evidence],['src/core/contractV2/index.ts']),/barrel|reachability/);
 assert.equal(validate([{path:'src/core/contractV2/index.ts',text:'export type { Evidence } from "./runPlanProvenance";'},evidence],['src/core/contractV2/index.ts']),undefined);
});
test('R1 reachability rejects TypeScript import-equals private authority',()=>{
 assert.throws(()=>validate([{path:'src/product.ts',text:'import runtime = require("./workflowContractV2RuntimeBoundary");'},{path:'src/workflowContractV2RuntimeBoundary.ts',text:'export const x=1;'}]),/runtime|reachability/);
});
test('R1 reachability rejects getters/proxies before inspecting source data',()=>{
 let reads=0;const row={path:'src/product.ts'};Object.defineProperty(row,'text',{enumerable:true,get(){reads++;throw Error('getter');}});
 assert.throws(()=>validate([row]),TypeError);assert.equal(reads,0);
 const proxy=new Proxy([],{getPrototypeOf(){reads++;throw Error('trap');}});assert.throws(()=>validate(proxy),TypeError);assert.equal(reads,0);
});
