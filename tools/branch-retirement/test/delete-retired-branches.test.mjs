import test from 'node:test'
import assert from 'node:assert/strict'
import { repositoryFromRemoteUrl, renderExecutionMarkdown } from '../delete-retired-branches.mjs'

test('normalizes HTTPS, authenticated HTTPS, and SSH remotes without exposing credentials', () => {
  assert.equal(repositoryFromRemoteUrl('https://github.com/katamor1/bob_builtin_analyze.git'), 'katamor1/bob_builtin_analyze')
  assert.equal(repositoryFromRemoteUrl('https://x-access-token:secret@github.com/katamor1/bob_builtin_analyze.git'), 'katamor1/bob_builtin_analyze')
  assert.equal(repositoryFromRemoteUrl('git@github.com:katamor1/bob_builtin_analyze.git'), 'katamor1/bob_builtin_analyze')
  assert.throws(() => repositoryFromRemoteUrl('not-a-remote'))
})

test('renders deletion evidence with explicit leftovers', () => {
  const markdown = renderExecutionMarkdown({
    repository: 'katamor1/bob_builtin_analyze',
    mode: 'apply',
    status: 'verification_failed',
    mainShaBefore: '1'.repeat(40),
    mainShaAfter: '1'.repeat(40),
    mainProtected: false,
    planned: ['agent/a'],
    deleted: [],
    alreadyAbsent: ['agent/b'],
    remaining: ['agent/a']
  })
  assert.match(markdown, /verification_failed/)
  assert.match(markdown, /agent\/a.*remains present/)
  assert.match(markdown, /Main protected: \*\*no\*\*/)
})
