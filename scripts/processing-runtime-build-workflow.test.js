"use strict"
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs"), path = require("node:path"), os = require("node:os")
const root = path.resolve(__dirname, "..")
function workflow(name) { return fs.readFileSync(path.join(root, ".github/workflows", name + ".yml"), "utf8").replaceAll("\r\n", "\n") }
function job(source, name) { const start = source.indexOf("\n  " + name + ":\n"); assert.ok(start >= 0); const rest = source.slice(start + 1), end = rest.slice(1).search(/\n  [a-z][a-z0-9-]*:/); return end < 0 ? rest : rest.slice(0, end + 1) }
test("every_companion_build_prepares_shared_dependencies_first", () => {
  for (const [name, jobs] of [["extensions-quality", ["workflow-register", "bob-bazaar-review", "bob-code-consistency-review", "windows-smoke"]], ["code-consistency-review-scaffold", ["validate-extension"]]]) {
    for (const id of jobs) {
      const block = job(workflow(name), id), prep = block.indexOf("npm ci --ignore-scripts --no-audit --no-fund --prefix packages/processing-budget-runtime")
      const affected = id === "workflow-register" ? block.indexOf("npm run compile --prefix extensions/bob-bazaar-review") : block.search(/npm (?:test|run (?:compile|typecheck))/)
      assert.ok(prep > block.indexOf("run: node scripts/verify-ci-head.js"), name + "/" + id + " shared preparation after guard")
      assert.ok(affected > prep, name + "/" + id + " shared preparation before compile")
      if (id === "windows-smoke") assert.doesNotMatch(block.slice(Math.max(0, prep - 160), prep), /if: matrix.extension/)
    }
  }
  const runtime = workflow("processing-budget-runtime")
  assert.match(runtime, /timeout-minutes: 20/)
  for (const extension of ["bob-bazaar-review", "bob-code-consistency-review"]) assert.ok(runtime.includes("npm run package --prefix extensions/" + extension))
  assert.match(runtime, /xvfb-run -a node scripts\/t17-path-installed-smoke.mjs/)
  assert.match(runtime, /node scripts\/t17-path-installed-smoke.mjs --artifacts/)
  const contract = JSON.parse(fs.readFileSync(path.join(root, "tools/main-consolidation/exact-head-ci-contract.json")))
  assert.equal(contract.workflows.flatMap(x => x.jobs).length, 18)
})
test("shared_source_changes_trigger_all_dependent_quality_workflows", () => {
  for (const name of ["extensions-quality", "code-consistency-review-scaffold", "processing-budget-runtime"]) {
    const source = workflow(name), pull = source.slice(source.indexOf("  pull_request:"), source.indexOf("  push:")), push = source.slice(source.indexOf("  push:"), source.indexOf("  workflow_dispatch:"))
    for (const event of [pull, push]) assert.ok(event.includes('"packages/processing-budget-runtime/**"'), name)
  }
})
test("boundary_policy_rejects_path_parser_deep_import_and_unawaited_callback", t => {
  const checker = require(path.join(root, "packages/processing-budget-runtime/scripts/check-document-boundary.js"))
  checker.checkDocumentBoundaries(root)
  const mutations = [
    ["bob-code-consistency-review", "analyzers/documentDocxExtractor.ts", source => source.replace("{ buffer: documentBuffer }", '{ path: "source.docx" }')],
    ["bob-code-consistency-review", "analyzers/documentExtractor.ts", source => source + '\nimport { prepare } from "../../../packages/processing-budget-runtime/out/ooxmlParserInput"\n'],
    ["bob-code-consistency-review", "analyzers/documentExtractor.ts", source => source.replace("return operation.withValidatedOoxml(", "operation.withValidatedOoxml(")],
    ["bob-bazaar-review", "ruleAuthoring/extraction/documentExtractor.ts", source => source.replace("extractDocx(parserInput,", 'extractDocx(Buffer.from("unverified"),')],
    ["bob-code-consistency-review", "core/reviewInputDiscovery.ts", source => source + '\nconst extraParser = () => require("mammoth")\n']
  ]
  for (const [extension, relative, mutate] of mutations) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bob-boundary-policy-")); t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
    for (const name of ["bob-bazaar-review", "bob-code-consistency-review"]) fs.cpSync(path.join(root, "extensions", name, "src"), path.join(fixture, "extensions", name, "src"), { recursive: true })
    const file = path.join(fixture, "extensions", extension, "src", relative), original = fs.readFileSync(file, "utf8"), changed = mutate(original)
    assert.notEqual(changed, original, relative); fs.writeFileSync(file, changed)
    assert.throws(() => checker.checkDocumentBoundaries(fixture), /document boundary/)
  }
})

test("clean_parser_contracts_and_artifact_inputs_precede_mutating_host_tooling",()=>{
 const source=workflow("processing-budget-runtime"),pack=source.indexOf("- name: Build and package companion runtime artifacts"),contracts=source.indexOf("- name: Verify document build and artifact contracts"),prepare=source.indexOf("- name: Prepare installed document artifacts"),tooling=source.indexOf("- name: Install pinned document host tooling after packaging"),host=source.indexOf("- name: Verify installed document runtime on Ubuntu");
 assert.ok(pack<contracts&&contracts<prepare&&prepare<tooling&&tooling<host,"clean npm-ci parser bytes must be tested/captured before no-save tooling mutates their layout");
});

test('workflow_retains_T15_admission_and_runs_current_host_on_both_os',()=>{
 const source=workflow('processing-budget-runtime');for(const event of ['pull_request','push']){const start=source.indexOf('  '+event+':'),end=source.indexOf(event==='pull_request'?'  push:':'  workflow_dispatch:');const block=source.slice(start,end);for(const entry of ['scripts/t15-aggregate-installed*','tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs','tools/main-consolidation/aggregate-document-source-admission.json','tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs','docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json'])assert.ok(block.includes('"'+entry+'"'),entry);}
 assert.match(source,/xvfb-run -a node scripts\/t17-path-installed-smoke\.mjs/);assert.match(source,/name: t17-path-\$\{\{ matrix\.os \}\}/);assert.ok(source.indexOf('createArtifactManifest')<source.indexOf('npm install --no-save'));assert.match(source,/scripts\/t14-bounded-document-installed-smoke\.test\.mjs/);assert.match(source,/scripts\/t16-input-process-installed-smoke\.test\.mjs/);
});
test('companion_vsix_excludes_development_payload_before_manifest',()=>{
 for(const name of ['bob-bazaar-review','bob-code-consistency-review']){const source=fs.readFileSync(path.join(root,'extensions',name,'.vscodeignore'),'utf8');assert.ok(source.split(/\r?\n/).includes('out/shared-processing-budget-runtime/*.d.ts'),name);assert.ok(source.split(/\r?\n/).includes('out/**/*.map'),name);}
});

test('real_pinned_parser_regression_has_locked_consumers_before_standalone_test',()=>{
 const source=workflow('processing-budget-runtime'),guard=source.indexOf('run: node scripts/verify-ci-head.js'),standalone=source.indexOf('run: npm test --prefix packages/processing-budget-runtime');
 for(const extension of ['bob-bazaar-review','bob-code-consistency-review']){const command='npm ci --prefix extensions/'+extension,install=source.indexOf(command);assert.ok(guard<install&&install<standalone,extension+' pinned parser dependencies must precede the real-parser regression');assert.equal(source.split(command).length-1,1);}
 assert.ok(standalone<source.indexOf('createArtifactManifest'));assert.ok(source.indexOf('createArtifactManifest')<source.indexOf('npm install --no-save'));
});

test('runtime_installs_workflow_schema_owner_before_admission',()=>{
 const source=workflow('processing-budget-runtime'),guard=source.indexOf('run: node scripts/verify-ci-head.js'),command='npm ci --ignore-scripts --no-audit --no-fund --prefix extensions/workflow-register',install=source.indexOf(command),admission=source.indexOf('- name: Verify literal admission and current product limits');
 assert.ok(guard<install&&install<admission,'the gate R schema test resolves Ajv from the Workflow owner');assert.equal(source.split(command).length-1,1);
});

test('workflow_retains_T16_admission_and_runs_current_host_on_both_os',()=>{
 const source=workflow('processing-budget-runtime');for(const token of ['scripts/t16-input-process-installed*','t16-input-process-installed-smoke.test.mjs','xvfb-run -a node scripts/t17-path-installed-smoke.mjs','name: t17-path-','b3d18e2d9c3aa272f861a28c69e8e963572186c8','49f39e1a6ec35e5db98e9ef698d4ce43369c9760'])assert.ok(source.includes(token),token);assert.ok(source.indexOf('createArtifactManifest')<source.indexOf('npm install --no-save'));
});

test('T17_runtime_flow_uses_same_real_artifacts_and_both_native_OS_jobs',()=>{const source=workflow('processing-budget-runtime'),block=job(source,'test');assert.match(block,/os: \[ubuntu-latest, windows-latest\]/);assert.match(block,/t17-path-installed-smoke\.mjs/);assert.match(block,/xvfb-run -a node scripts\/t17-path-installed-smoke\.mjs/);for(const extension of ['workflow-register','bob-bazaar-review','bob-code-consistency-review'])assert.ok(block.includes('npm run package --prefix extensions/'+extension));const guard=block.indexOf('run: node scripts/verify-ci-head.js'),fetch=block.indexOf('6ce384313c1072e34ced342260304c9c7dd07e9e');assert.ok(guard>=0&&fetch>guard);assert.ok(block.includes('t17-deadline-installed-smoke.test.mjs'));assert.equal((source.match(/^  test:$/gm)||[]).length,1);});

test('T17_quality_GateR_jobs_fetch_exact_immutable_subjects_after_guard',()=>{
 const source=workflow('extensions-quality');for(const id of ['workflow-register','windows-smoke']){const block=job(source,id),guard=block.indexOf('run: node scripts/verify-ci-head.js'),start=block.indexOf('- name: Fetch immutable deadline admission subjects'),tests=block.indexOf('- name: Unit tests');assert.ok(guard>=0&&start>guard&&tests>start,id+' guard/fetch/test order');const next=block.indexOf('\n      - name:',start+8),fetch=block.slice(start,next<0?block.length:next);assert.ok(fetch.includes('shell: bash'));assert.ok(fetch.includes('working-directory: '+String.fromCharCode(36)+'{{ github.workspace }}'));assert.ok(fetch.includes('set -euo pipefail'));for(const sha of ['6ce384313c1072e34ced342260304c9c7dd07e9e','7ea786afd5715d841526000a402c831d6c2a203c']){assert.ok(fetch.includes('git fetch --no-tags --depth=1 --no-write-fetch-head origin '+sha));assert.ok(fetch.includes('git cat-file -e '+sha+'^{commit}'));}if(id==='windows-smoke')assert.ok(fetch.includes("if: matrix.extension == 'workflow-register'"));}
});

test('path_workflow_requires_native_unc_and_preserves_failure_evidence',()=>{
 const source=workflow('processing-budget-runtime'),block=job(source,'test');
 for(const event of ['pull_request','push']){
  const end=event==='pull_request'?'  push:':'  workflow_dispatch:';
  const paths=source.slice(source.indexOf('  '+event+':'),source.indexOf(end));
  for(const item of ['extensions/workflow-register/**','scripts/t17-path-installed*','scripts/t17-path-native-unc-fixture.*',
   'tools/main-consolidation/pathAdmissionPolicy.mjs','tools/main-consolidation/path-source-admission.json',
   'tools/main-consolidation/test/pathAdmissionPolicy.test.mjs','tools/main-consolidation/test/helpers/pathAdmissionFixture.mjs',
   'docs/release-evidence/proc-t17-path-source-coverage-2026-11-04.json']) assert.ok(paths.includes('"'+item+'"'),event+' '+item);
 }
 const order=['run: node scripts/verify-ci-head.js','git cat-file -e cf96788dbdd6836b449b7a31ecd3bae4ee4302a4^{commit}',
  '- name: Prepare owned native UNC fixture','- name: Prepare installed document artifacts',
  '- name: Install pinned document host tooling after packaging','- name: Verify installed document runtime on Windows',
  '- name: Dispose owned native UNC fixture if needed','- name: Upload installed document runtime proof'];
 for(let i=0;i<order.length;i++){
  assert.ok(block.includes(order[i]),order[i]);
  if(i>0)assert.ok(block.indexOf(order[i-1])<block.indexOf(order[i]),order[i]);
 }
 assert.match(block,/Prepare owned native UNC fixture\r?\n\s+if: runner\.os == 'Windows'/);
 assert.match(block,/t17-path-native-unc-fixture\.mjs\x27,\s*\x27--prepare/);
 assert.match(block,/T17_PATH_NATIVE_UNC_MANIFEST/);
 assert.match(block,/xvfb-run -a node scripts\/t17-path-installed-smoke\.mjs/);
 assert.match(block,/Dispose owned native UNC fixture if needed\r?\n\s+if: always\(\) && runner\.os == 'Windows'/);
 assert.match(block,/t17-path-native-unc-fixture\.mjs\x27,\s*\x27--dispose/);
 assert.match(block,/Upload installed document runtime proof\r?\n\s+if: always\(\)/);
 assert.match(block,/name: t17-path-\$\{\{ matrix\.os \}\}/);
 assert.match(block,/if-no-files-found: error/);
 assert.doesNotMatch(block,/continue-on-error: true/);
});

test('path_workflow_builds_its_own_processing_runtime_before_workflow_compile',()=>{
 const prep='npm ci --ignore-scripts --no-audit --no-fund --prefix packages/processing-budget-runtime';
 for(const name of ['extensions-quality','workflow-contracts','three-extension-ui-contracts']){
  const source=workflow(name),jobs=source.split(/\r?\n(?=  [\w-]+:\r?\n)/);
  for(const block of jobs.filter(row=>row.includes('npm run compile --prefix extensions/workflow-register'))){
   const guard=block.indexOf('run: node scripts/verify-ci-head.js'),install=block.indexOf(prep);
   const compile=block.indexOf('npm run compile --prefix extensions/workflow-register');
   assert.ok(guard>=0&&guard<install&&install<compile,name+' '+block.split(/\r?\n/)[0]);
  }
 }
});

test('workflow_contracts_prepares_processing_owner_after_guard_and_before_compile',()=>{
 const block=workflow('workflow-contracts');
 const guard=block.indexOf('run: node scripts/verify-ci-head.js');
 const install=block.indexOf('npm ci --ignore-scripts --no-audit --no-fund --prefix packages/processing-budget-runtime');
 const compile=block.indexOf('run: npm run compile --silent');
 assert.ok(guard>=0&&guard<install&&install<compile);
});

test('PATH CI prepares physical test roots before tests on both Windows entry points',()=>{
 for(const [name,id]of [['extensions-quality','windows-smoke'],['processing-budget-runtime','test']]){
  const block=job(workflow(name),id),guard=block.indexOf('run: node scripts/verify-ci-head.js'),prepare=block.indexOf('scripts/prepare-ci-physical-temp.js');
  const tests=block.indexOf(name==='extensions-quality'?'- name: Unit tests':'- name: Test standalone package');
  assert.ok(guard>=0&&guard<prepare&&prepare<tests,name+' guard / physical fixture preparation / tests');
  assert.match(block,/working-directory: \$\{\{ github\.workspace \}\}\n\s+run: node scripts\/prepare-ci-physical-temp\.js/);
 }
});
test('PATH failure uploads retain absolute evidence paths before document step outputs exist',()=>{
 const block=job(workflow('processing-budget-runtime'),'test'),start=block.indexOf('- name: Upload installed document runtime proof'),end=block.indexOf('- name: Verify literal admission',start),upload=block.slice(start,end);
 assert.doesNotMatch(upload,/steps\.document-artifacts\.outputs/);
 for(const suffix of ['/installed-host-*/receipt.json','/installed-host-*/logs','/installed-host-*/user-data/logs'])assert.ok(upload.includes('env.PROCESSING_BUDGET_ARTIFACT_ROOT }}'+suffix),suffix);
});

test('owned_UNC_host_settings_are_captured_with_the_same_host_proof',()=>{
 const source=workflow('processing-budget-runtime'),block=job(source,'test'),start=block.indexOf('- name: Upload installed document runtime proof'),upload=block.slice(start,block.indexOf('- name: Verify literal admission',start));
 assert.ok(upload.includes('env.PROCESSING_BUDGET_ARTIFACT_ROOT }}/installed-host-*/user-data/User/settings.json'));
 const probe=fs.readFileSync(path.join(root,'scripts/t17-path-installed-extension-host.test.js'),'utf8');
 assert.match(probe,/getConfiguration\('security'\)\.get\('allowedUNCHosts'\)/);
});
