const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
function api(name) {
  const file = path.join(__dirname, '../out/core', name + '.js')
  assert.ok(fs.existsSync(file), name + ' boundary is not implemented')
  return require(file)
}
function installed(overrides = {}) { return { id: 'local.fixture', version: '1.2.3', extensionRoot: path.join(os.tmpdir(), 'installed-fixture'), ...overrides } }
function manifest() {
  return {
    schema_version: 'workflow-contributions/v1', owner: { id: 'local.fixture', version: '1.2.3' },
    registry_api: { min: 'provider-registry/v1', max: 'provider-registry/v1' },
    action_providers: [{ id: 'fixture.action', contract_version: 'fixture.action/v1' }],
    preflight_checks: [{ id: 'fixture.ready', contract_version: 'fixture.ready/v1' }],
    result_sinks: [{ type: 'fixture.sink', contract_version: 'fixture.sink/v1' }],
    agent_provider: { id: 'fixture.agent', contract_version: 'fixture.agent/v1' },
    workflow_templates: [{ id: 'fixture.template', path: 'templates/workflow/WORKFLOW.md' }],
    schemas: [{ id: 'fixture.schema', path: 'schemas/value.json' }]
  }
}
function handlers(calls = []) {
  return {
    actionProviders: new Map([['fixture.action', { id: 'fixture.action', execute: () => { calls.push('action'); return 'action-value' } }]]),
    preflightChecks: new Map([['fixture.ready', () => { calls.push('preflight'); return true }]]),
    resultSinks: new Map([['fixture.sink', async () => { calls.push('sink'); return { ok: true } }]]),
    agentProvider: { run: () => { calls.push('agent'); return 'agent-value' } }
  }
}
const errorCode = code => e => e instanceof Error && e.code === code && !e.message.includes('SECRET')
module.exports = { api, installed, manifest, handlers, errorCode }
