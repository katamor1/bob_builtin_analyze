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
  assert.match(runtime, /xvfb-run -a node scripts\/t15-aggregate-installed-smoke.mjs/)
  assert.match(runtime, /node scripts\/t15-aggregate-installed-smoke.mjs --artifacts/)
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

test('workflow_builds_before_host_tooling_and_runs_t15_on_both_os',()=>{
 const source=workflow('processing-budget-runtime');for(const event of ['pull_request','push']){const start=source.indexOf('  '+event+':'),end=source.indexOf(event==='pull_request'?'  push:':'  workflow_dispatch:');const block=source.slice(start,end);for(const entry of ['scripts/t15-aggregate-installed*','tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs','tools/main-consolidation/aggregate-document-source-admission.json','tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs','docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json'])assert.ok(block.includes('"'+entry+'"'),entry);}
 assert.match(source,/xvfb-run -a node scripts\/t15-aggregate-installed-smoke\.mjs/);assert.match(source,/name: t15-aggregate-\$\{\{ matrix\.os \}\}/);assert.ok(source.indexOf('createArtifactManifest')<source.indexOf('npm install --no-save'));assert.match(source,/scripts\/t14-bounded-document-installed-smoke\.test\.mjs/);assert.match(source,/scripts\/t15-aggregate-installed-smoke\.test\.mjs/);
});
test('companion_vsix_excludes_development_payload_before_manifest',()=>{
 for(const name of ['bob-bazaar-review','bob-code-consistency-review']){const source=fs.readFileSync(path.join(root,'extensions',name,'.vscodeignore'),'utf8');assert.ok(source.split(/\r?\n/).includes('out/shared-processing-budget-runtime/*.d.ts'),name);assert.ok(source.split(/\r?\n/).includes('out/**/*.map'),name);}
});

test('real_pinned_parser_regression_has_locked_consumers_before_standalone_test',()=>{
 const source=workflow('processing-budget-runtime'),guard=source.indexOf('run: node scripts/verify-ci-head.js'),standalone=source.indexOf('run: npm test --prefix packages/processing-budget-runtime');
 for(const extension of ['bob-bazaar-review','bob-code-consistency-review']){const command='npm ci --prefix extensions/'+extension,install=source.indexOf(command);assert.ok(guard<install&&install<standalone,extension+' pinned parser dependencies must precede the real-parser regression');assert.equal(source.split(command).length-1,1);}
 assert.ok(standalone<source.indexOf('createArtifactManifest'));assert.ok(source.indexOf('createArtifactManifest')<source.indexOf('npm install --no-save'));
});
