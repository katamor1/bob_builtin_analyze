const assert = require('node:assert/strict')
const { test } = require('node:test')

function rawPackage() {
  return require('./workflowContractV2LockTestSupport').rawPackageFromFiles({
    'workflow.yaml': Buffer.from('description: identity\n', 'utf8'),
    'workflow.lock.json': Buffer.from('{}', 'utf8')
  })
}

function environment() {
  const { WorkflowProviderRegistry } = require('../out/core/contractV2/providerRegistry.js')
  const { snapshotBobContractProfile } = require('../out/core/contractV2/bobProfile.js')
  return require('../out/core/contractV2/compilerEnvironment.js').createAuditedWorkflowCompilerEnvironment({
    purpose: 'runtime',
    providerCatalog: new WorkflowProviderRegistry().snapshot(),
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })
}

function subjectWithCompilerIdentity(overrides) {
  let corrupt = true
  const compiler = require('../out/core/contractV2/compiler.js')
  const plan = require('../out/core/contractV2/compiledPlan.js')
  const storePath = require('node:path').resolve(__dirname, '../out/core/contractV2/planStore.js')
  assert.ok(require('node:fs').existsSync(storePath), 'P5 plan store API is not implemented')
  const original = compiler.compileWorkflowPackage
  let calls = 0
  compiler.compileWorkflowPackage = ({ rawPackage: raw, environment: requested }) => {
    calls += 1
    const handle = plan.createCompiledWorkflowPlanHandle({
      environment: corrupt ? overrides.environment ?? requested : requested,
      publication: corrupt ? overrides.publication ?? raw.publication : raw.publication,
      generation: corrupt ? overrides.generation ?? raw.generation : raw.generation,
      plan: {
        schemaVersion: 'workflow-compiled-plan/v2',
        compilerContractVersion: 'workflow-register-compiler/v2',
        policyVersions: {},
        workflowId: corrupt ? overrides.workflowId ?? raw.workflowId : raw.workflowId,
        packageDigest: corrupt ? overrides.packageDigest ?? raw.packageDigest : raw.packageDigest,
        lockfileDigest: raw.files.find((file) => file.path === 'workflow.lock.json').digest,
        environmentDigest: `sha256:${'e'.repeat(64)}`,
        workflow: {
          schemaVersion: 'workflow-compiled-workflow/v2',
          id: raw.workflowId,
          name: 'Minimal',
          description: 'Identity test',
          inputs: [],
          steps: [],
          resumePolicy: {}
        },
        prompts: [],
        schemas: [],
        schemaCatalogDigest: `sha256:${'s'.repeat(64)}`,
        predicates: [],
        providerBindings: [],
        bobProfileBinding: {},
        requiredArtifacts: []
      },
      prompts: [],
      schemas: [],
      providers: []
    })
    return { ok: true, handle: corrupt && overrides.unbranded ? Object.freeze({ plan: handle.plan, planDigest: handle.planDigest }) : handle, diagnostics: Object.freeze([]) }
  }
  delete require.cache[storePath]
  const subject = require(storePath)
  return {
    subject,
    calls: () => calls,
    allowValid() { corrupt = false },
    restore() {
      compiler.compileWorkflowPackage = original
      delete require.cache[storePath]
    }
  }
}

test('plan store rejects compiler handles with mismatched private identity', async (t) => {
  const requested = environment()
  const raw = rawPackage()
  const cases = [
    ['environment', { environment: environment() }],
    ['publication', { publication: 'staging' }],
    ['generation', { generation: '.staging-wrong-generation' }],
    ['packageDigest', { packageDigest: 'sha256:' + 'a'.repeat(64) }],
    ['workflowId', { workflowId: 'different' }],
    ['unbranded', { unbranded: true }]
  ]
  for (const [name, overrides] of cases) await t.test(name, async () => {
    const counted = subjectWithCompilerIdentity(overrides)
    try {
      const store = new counted.subject.WorkflowPlanStore()
      const request = {
        collectionId: `compiler-${name}`,
        workflowId: 'minimal',
        rawPackage: raw,
        environment: requested
      }
      await assert.rejects(store.getOrCompile(request))
      assert.equal(counted.calls(), 1)
      counted.allowValid()
      const valid = await store.getOrCompile(request)
      assert.equal(valid.plan.workflowId, 'minimal')
      assert.equal(counted.calls(), 2)
    } finally {
      counted.restore()
    }
  })
})
