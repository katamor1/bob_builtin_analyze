import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSelectionLedger, validateSelectionLedger, renderSelectionLedgerMarkdown, checkSelectionLedgerArtifacts } from '../featureSelectionLedgerPolicy.mjs'
import { buildProgramIndex, canonicalJson } from '../featureIntegrationProgramPolicy.mjs'
const context = () => ({programIndex:buildProgramIndex(), universe:JSON.parse(readFileSync(new URL('../feature-selection-source-universe.json',import.meta.url)))})
const ledger = () => buildSelectionLedger(context())
test('rejects_missing_duplicate_capability_and_dependency', () => {
  validateSelectionLedger(ledger(), context())
  for (const mutate of [l=>l.capabilities.pop(), l=>l.capabilities.push(l.capabilities[0]), l=>l.capabilities.find(c=>c.id==='PROC-T18-REPORT').hardDependsOn.pop(), l=>l.capabilities.find(c=>c.sourceOrigin.kind==='archive').sourceOrigin.sourceItemIds.pop()]) {
    const value=ledger(); mutate(value); assert.throws(()=>validateSelectionLedger(value,context()))
  }
})
test('preserves_conditional_and_rejected_runtime_limits', () => {
  const value=ledger()
  assert.equal(value.capabilities.find(c=>c.id==='WF2-P6-ENTRYPOINT').maxAuthorizedActivation,'shadow')
  assert.equal(value.capabilities.find(c=>c.id==='WF2-R2-INVOKE').productReachability,'zero')
  for(const id of ['WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB']) {
    const cap=value.capabilities.find(c=>c.id===id); assert.equal(cap.disposition,'conditional'); assert.ok(cap.goConditionRequirement.length)
  }
  assert.equal(value.capabilities.find(c=>c.id==='WF2-R6-ARCHIVED').disposition,'rejected_current_snapshot')
  value.capabilities.find(c=>c.id==='WF2-R4-EXECUTOR').disposition='selected'
  assert.throws(()=>validateSelectionLedger(value,context()))
})
test('accepts_explicit_prerequisite_without_fake_pr', () => {
  const value=ledger(); const cap=value.capabilities.find(c=>c.id==='REG-BRIDGE-OWNER-VERSION-LIFECYCLE')
  const heads=cap.sourceOrigin.tranches.find(t=>t.id==='contribution-prerequisite').legacyHeads
  assert.equal(heads[0].kind,'prerequisite_branch'); assert.ok(!Object.hasOwn(heads[0],'pullRequestNumber'))
  heads[0].pullRequestNumber=0; assert.throws(()=>validateSelectionLedger(value,context()))
})
test('rejects_dynamic_keys_and_markdown_drift', () => {
  for(const key of ['mergeSha','status','uatResult','approvalRecord','observedActivationStatus']) {
    const value=ledger(); value.capabilities[0][key]=null; assert.throws(()=>validateSelectionLedger(value,context()))
  }
  const value=ledger(); const args={ledgerBytes:canonicalJson(value),markdownBytes:renderSelectionLedgerMarkdown(value),...context()}
  checkSelectionLedgerArtifacts(args)
  assert.throws(()=>checkSelectionLedgerArtifacts({...args,markdownBytes:Buffer.concat([args.markdownBytes,Buffer.from('edited\n')])}))
})
