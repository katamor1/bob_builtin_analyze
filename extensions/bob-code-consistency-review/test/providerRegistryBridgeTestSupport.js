const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const extensionRoot = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json')))
const kind = pkg.name === 'bob-bazaar-review' ? 'bazaar' : 'consistency'
const id = pkg.publisher + '.' + pkg.name
const installed = { id, extensionPath: extensionRoot, packageJSON: pkg }
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'contracts/workflow-contributions.json')))
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)) }
const ownContext = () => ({ extension: installed, extensionPath: extensionRoot, subscriptions: [] })
function load(relative, vscode, calls) {
  const original = Module._load, target = path.join(extensionRoot, 'out', relative), out = path.join(extensionRoot, 'out') + path.sep
  for (const key of Object.keys(require.cache)) if (key.startsWith(out)) delete require.cache[key]
  const call = name => (...args) => { calls.push({ name, args }); return { value: name } }
  const leaves = {
    '../projectRules/resultCapture': { captureReviewResult: call('captureReviewResult') },
    '../ui/reviewGui': { openBazaarReviewGui: call('openBazaarReviewGui') },
    '../ui/ruleAuthoringGui': { openRuleAuthoringGui: call('openRuleAuthoringGui') },
    '../ui/ruleProposalTriageGui': { openRuleProposalTriageGui: call('openRuleProposalTriageGui') },
    '../workspace/workspaceCommands': { getRuleAuthoringHostConfiguration: () => ({ limits: {} }) },
    './workflowActions': { collectReviewContext: call('collectReviewContext'), loadReviewRules: call('loadReviewRules') },
    './ruleAuthoringWorkflowActions': { createRuleAuthoringWorkflowActions: () => ({}), resolveRuleAuthoringWorkflowTarget: call('resolveRuleAuthoringWorkflowTarget') },
    './workflowStepCompletion': { completeCurrentWorkflowStepAfterGuiAction: () => true }
  }
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return vscode
    if (kind === 'bazaar' && parent?.filename.endsWith(path.join('workflow', 'workflowProviders.js')) && Object.hasOwn(leaves, request)) return leaves[request]
    if (kind === 'consistency' && parent?.filename === path.join(extensionRoot, 'out', 'extension.js') && request.startsWith('./') && !['./workflowProviderRegistration', './retryRegistrationController'].includes(request)) return {}
    return original.call(this, request, parent, isMain)
  }
  try { return require(target) } finally { Module._load = original }
}
function completeApi(register) {
  const calls = []
  const api = {
    apiVersion: 'provider-registry/v1',
    negotiateProviderRegistry(range) { assert.deepEqual(range, { min: api.apiVersion, max: api.apiVersion }); return api.apiVersion },
    registerContributionSet(...args) { calls.push(args); return register ? register(...args) : { dispose() {} } },
    registerActionProvider() { throw Error('sequential legacy registration is forbidden') }
  }
  return { api, calls }
}
function environment(api, shared) {
  const context = ownContext(), calls = [], listeners = new Set()
  let current = { id: 'local.workflow-register', isActive: true, exports: api }
  const vscode = shared ?? { extensions: {
    getExtension: requested => requested === 'local.workflow-register' ? current : requested === id ? installed : undefined,
    onDidChange: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) } }
  } }
  const module = load(kind === 'bazaar' ? 'workflow/workflowProviders.js' : 'extension.js', vscode, calls)
  const handlers = Object.fromEntries(manifest.action_providers.map(row => [row.id.split('.').at(-1), options => { calls.push({ name: row.id, args: [options] }); return { value: row.id } }]))
  return {
    context, calls, handlers, module, vscode,
    setHost: value => { current = value },
    notify: () => { for (const listener of [...listeners]) listener() },
    start: () => module.registerWorkflowProvidersWithRetry(context, handlers),
    stop: () => { for (const disposable of [...context.subscriptions].reverse()) disposable.dispose() },
    async register() {
      if (kind === 'bazaar') { module.registerWorkflowProvidersWithRetry(context); await tick(); return undefined }
      const registration = load('workflowProviderRegistration.js', vscode, calls)
      return registration.registerWorkflowProviders(handlers, context)
    }
  }
}
module.exports = { kind, id, installed, manifest, extensionRoot, ownContext, load, completeApi, environment, tick }
