"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const root = path.resolve(__dirname, "..")
const workflows = {
  "extensions-quality": ["workflow-register", "bob-bazaar-review", "bob-code-consistency-review", "windows-smoke", "real-machine-environment-contracts", "extension-metrics", "evidence-subject", "evidence-portability", "evidence-byte-parity"],
  "workflow-contracts": ["validate"],
  "code-consistency-review-scaffold": ["validate-scaffold", "validate-extension"],
  "three-extension-ui-contracts": ["contracts"]
}
const headExpression = "${{ github.event_name == 'workflow_dispatch' && inputs.expectedHeadSha || github.event.pull_request.head.sha || github.sha }}"

for (const [workflowName, jobIds] of Object.entries(workflows)) {
  const source = fs.readFileSync(path.join(root, ".github/workflows", `${workflowName}.yml`), "utf8").replace(/\r\n/g, "\n")
  test(`${workflowName} requires dispatch identity and gives discovery a correlated run name`, () => {
    const dispatch = source.slice(source.indexOf("  workflow_dispatch:"), source.indexOf("\nconcurrency:"))
    for (const input of ["expectedHeadSha", "dispatchNonce"]) {
      assert.match(dispatch, new RegExp(`      ${input}:\\n        description: [^\\n]+\\n        required: true\\n        type: string`))
    }
    assert.ok(source.includes("format('wave0a-{0}-{1}', inputs.expectedHeadSha, inputs.dispatchNonce)"))
  })
  for (const jobId of jobIds) {
    test(`${workflowName}/${jobId} verifies identity before any build or dependency installation`, () => {
      const start = source.indexOf(`\n  ${jobId}:`)
      assert.notEqual(start, -1)
      const remainder = source.slice(start + 1)
      const next = remainder.slice(1).search(/\n  [a-z][a-z0-9-]*:/)
      const job = next < 0 ? remainder : remainder.slice(0, next + 1)
      const checkout = job.indexOf("      - name: Checkout")
      const guard = job.indexOf("      - name: Verify checked-out commit")
      const setup = job.indexOf("      - name: Setup Node.js")
      assert.ok(checkout >= 0 && guard > checkout && setup > guard)
      const checkoutStep = job.slice(checkout, guard)
      assert.ok(checkoutStep.includes(`          ref: ${headExpression}`))
      const guardStep = job.slice(guard, setup)
      assert.ok(guardStep.includes(`          EXPECTED_HEAD_SHA: ${headExpression}`))
      assert.ok(guardStep.includes("          DISPATCH_HEAD_SHA: ${{ inputs.expectedHeadSha }}"))
      assert.ok(guardStep.includes("          DISPATCH_NONCE: ${{ inputs.dispatchNonce }}"))
      assert.ok(guardStep.includes("        working-directory: ${{ github.workspace }}"))
      assert.ok(guardStep.includes("        run: node scripts/verify-ci-head.js"))
      assert.doesNotMatch(guardStep, /continue-on-error|\|\|\s*true|^\s+if:/m)
    })
  }
}

test("CI evidence contract preserves the 12 original and four evidence PR jobs and only the one expected dispatch skip", () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, "tools/main-consolidation/exact-head-ci-contract.json"), "utf8"))
  assert.equal(contract.schemaVersion, "bob-builtin-analyze/exact-head-ci-contract/v1")
  assert.equal(contract.repository, "katamor1/bob_builtin_analyze")
  assert.equal(contract.verificationStep, "Verify checked-out commit")
  assert.deepEqual(contract.workflows.map(row => row.id), Object.keys(workflows))
  const jobs = contract.workflows.flatMap(row => row.jobs)
  assert.equal(jobs.length, 16)
  assert.equal(new Set(jobs.map(job => job.name)).size, 16)
  assert.ok(jobs.every(job => job.pullRequest === "success"))
  assert.deepEqual(jobs.filter(job => job.workflowDispatch === "skipped").map(job => job.name), ["Extension source metrics"])
  assert.equal(jobs.filter(job => job.workflowDispatch === "success").length, 15)
})

const originalJobs = [{"name":"workflow-register","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"bob-bazaar-review","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"bob-code-consistency-review","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Windows / workflow-register","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Windows / bob-bazaar-review","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Windows / bob-code-consistency-review","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Real-machine environment contracts","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Extension source metrics","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"skipped"},{"name":"Strict workflow validation","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Validate scaffold","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Validate VS Code extension","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"UI and documentation contracts","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"}]
test('exact_head_adds_four_required_evidence_jobs_without_relaxation',()=>{
 const c=JSON.parse(fs.readFileSync(path.join(root,'tools/main-consolidation/exact-head-ci-contract.json'),'utf8')),jobs=c.workflows.flatMap(x=>x.jobs);
 const added=['Workflow evidence subject','Workflow evidence / ubuntu-latest','Workflow evidence / windows-latest','Workflow evidence byte parity'];
 assert.deepEqual(jobs.filter(x=>!added.includes(x.name)),originalJobs);
 assert.equal(jobs.length,16);assert.equal(jobs.filter(x=>x.pullRequest==='success').length,16);assert.equal(jobs.filter(x=>x.workflowDispatch==='success').length,15);
 assert.deepEqual(jobs.filter(x=>x.workflowDispatch==='skipped').map(x=>x.name),['Extension source metrics']);
 const source=fs.readFileSync(path.join(root,'.github/workflows/extensions-quality.yml'),'utf8');
 for(const id of ['evidence-subject','evidence-portability','evidence-byte-parity']){const start=source.indexOf(`\n  ${id}:`);assert.ok(start>=0);const remainder=source.slice(start+1),end=remainder.slice(1).search(/\n  [a-z][a-z0-9-]*:/),job=end<0?remainder:remainder.slice(0,end+1),guard=job.indexOf('- name: Verify checked-out commit');assert.ok(guard>0);for(const marker of ['- name: Setup Node.js','uses: actions/download-artifact','uses: actions/upload-artifact']){const index=job.indexOf(marker);if(index>=0)assert.ok(index>guard);}assert.doesNotMatch(job,/continue-on-error/);}
});

test('common subject artifact includes the explicitly bounded hidden source directory',()=>{
 const source=fs.readFileSync(path.join(root,'.github/workflows/extensions-quality.yml'),'utf8'),start=source.indexOf('- name: Upload common immutable subject'),step=source.slice(start,source.indexOf('\n  evidence-portability:',start));
 assert.ok(start>0);assert.match(step,/include-hidden-files: true/);assert.match(step,/if-no-files-found: error/);
});
