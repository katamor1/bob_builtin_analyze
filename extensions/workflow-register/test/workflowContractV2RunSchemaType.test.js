const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const ts = require('typescript')

function diagnostics(text) {
  const file = path.resolve(__dirname, 'r1-run-schema-virtual.ts')
  const options = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, types: ['node'] }
  const host = ts.createCompilerHost(options), source = host.getSourceFile.bind(host)
  host.getSourceFile = (name, language, ...rest) => path.resolve(name) === file ? ts.createSourceFile(name, text, language, true) : source(name, language, ...rest)
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host)).map(d => ({ code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }))
}
test('R1_run_only_discriminator_preserves_public_schema', () => {
  const run = diagnostics('import type { WorkflowRunState, WorkflowRunStateV2 } from "../src/core/modelRuntime";\nconst a: Pick<WorkflowRunState,"workflowSchemaVersion"> = {workflowSchemaVersion:"workflow-register/v2"};\nconst b: Pick<WorkflowRunStateV2,"workflowSchemaVersion"> = a;')
  assert.deepEqual(run, [], 'V2 run discriminator must be accepted without widening executable workflows')
  const executable = diagnostics('import type { WorkflowSchemaVersion } from "../src/core/modelSchema";\nconst x: WorkflowSchemaVersion = "workflow-register/v2";')
  assert.equal(executable.length, 1); assert.match(executable[0].message, /not assignable to type 'WorkflowSchemaVersion'/)
  const legacy = diagnostics('import type { WorkflowSchemaVersion } from "../src/core/modelSchema";\nconst x: WorkflowSchemaVersion = "legacy";const y: WorkflowSchemaVersion = "workflow-register/v1";')
  assert.deepEqual(legacy, [])
})
