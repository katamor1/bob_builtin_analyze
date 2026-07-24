const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { test } = require('node:test')

function digest(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

function rawPackage() {
  const sources = {
    'workflow.yaml': Buffer.from('description: identity\n', 'utf8'),
    'workflow.lock.json': Buffer.from('{}', 'utf8')
  }
  const files = Object.keys(sources).sort().map((path) => {
    const bytes = Uint8Array.from(sources[path])
    return { path, bytes, byteLength: bytes.byteLength, digest: digest(bytes) }
  })
  const manifest = Buffer.from(JSON.stringify({
    files: files.map(({ path, digest: fileDigest }) => ({ path, digest: fileDigest }))
  }), 'utf8')
  const packageDigest = digest(manifest)
  return {
    publication: 'published',
    workflowId: 'minimal',
    generation: packageDigest,
    packageDigest,
    files
  }
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
  const compiler = require('../out/core/contractV2/compiler.js')
  const plan = require('../out/core/contractV2/compiledPlan.js')
  const storePath = require.resolve('../out/core/contractV2/planStore.js')
  const original = compiler.compileWorkflowPackage
  let calls = 0
  compiler.compileWorkflowPackage = ({ rawPackage: raw, environment: requested }) => {
    calls += 1
    const handle = plan.createCompiledWorkflowPlanHandle({
      environment: overrides.environment ?? requested,
      publication: overrides.publication ?? raw.publication,
      generation: overrides.generation ?? raw.generation,
      plan: {
        schemaVersion: 'workflow-compiled-plan/v2',
        compilerContractVersion: 'workflow-register-compiler/v2',
        policyVersions: {},
        workflowId: raw.workflowId,
        packageDigest: raw.packageDigest,
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
    return { ok: true, handle, diagnostics: Object.freeze([]) }
  }
  delete require.cache[storePath]
  const subject = require(storePath)
  return {
    subject,
    calls: () => calls,
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
    ['generation', { generation: '.staging-wrong-generation' }]
  ]
  for (const [name, overrides] of cases) await t.test(name, async () => {
    const counted = subjectWithCompilerIdentity(overrides)
    try {
      const store = new counted.subject.WorkflowPlanStore()
      await assert.rejects(store.getOrCompile({
        collectionId: `compiler-${name}`,
        workflowId: 'minimal',
        rawPackage: raw,
        environment: requested
      }), /compilation|identity|environment/i)
      assert.equal(counted.calls(), 1)
    } finally {
      counted.restore()
    }
  })
})
