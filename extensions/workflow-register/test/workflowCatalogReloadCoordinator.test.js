const assert = require('node:assert/strict')
const { test } = require('node:test')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('catalog reload operations run FIFO and a failure does not block the next provider epoch', async () => {
  const subject = require('../out/workflowCatalogReloadCoordinator.js')
  const coordinator = new subject.WorkflowCatalogReloadCoordinator()
  const firstGate = deferred()
  const events = []

  const first = coordinator.run(async () => {
    events.push('first-start')
    await firstGate.promise
    events.push('first-end')
    throw new Error('first failed')
  })
  const second = coordinator.run(async () => {
    events.push('second-start')
    events.push('second-end')
    return 2
  })

  await Promise.resolve()
  assert.deepEqual(events, ['first-start'])
  firstGate.resolve()
  await assert.rejects(first, /first failed/)
  assert.equal(await second, 2)
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start', 'second-end'])
})

test('coordinator rejects new work after disposal without cancelling the current owner', async () => {
  const subject = require('../out/workflowCatalogReloadCoordinator.js')
  const coordinator = new subject.WorkflowCatalogReloadCoordinator()
  const gate = deferred()
  const current = coordinator.run(async () => {
    await gate.promise
    return 'done'
  })
  coordinator.dispose()
  await assert.rejects(coordinator.run(async () => 'late'), /disposed/i)
  gate.resolve()
  assert.equal(await current, 'done')
  coordinator.dispose()
})
