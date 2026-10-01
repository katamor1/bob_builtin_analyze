import { createHash } from 'node:crypto'
import { buildProgramIndex, canonicalJson, validateProgramIndex } from './featureIntegrationProgramPolicy.mjs'

export const SOURCE_INVENTORY_SHA256 = '98db195404a13029b167f94e7108b5093a21a6e2c2b73fce526d1fc8fffc658d'
export const SOURCE_UNIVERSE_SHA256 = 'c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79'
export const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : canonicalJson(value)).digest('hex')
export function exactKeys(value, keys, label = 'record') {
  canonicalJson(value)
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError(`${label}: exact keys required`)
}
export function same(actual, expected, label) {
  if (!canonicalJson(actual).equals(canonicalJson(expected))) throw new TypeError(`${label}: identity mismatch`)
}
const sha = value => { if (!/^[a-f0-9]{40}$/.test(value)) throw new TypeError('invalid Git SHA'); return value }
const unique = values => [...new Set(values)].sort()
const safePath = value => {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => !part || part === '..' || part === '.') || /[\x00-\x1f]/.test(value)) throw new TypeError('invalid repository path')
  return value
}
export function sourceItemId({ path, family }) {
  safePath(path)
  if (typeof family !== 'string' || !family.trim()) throw new TypeError('semantic family required')
  return `source-${digest({ path, family }).slice(0, 24)}`
}

// Full reachable range, without path-limited history simplification. Merge changes
// are compared with the first parent; rename source and destination both count.
export async function readRangeHistory({ fromSha, toSha }, { readGit }) {
  sha(fromSha); sha(toSha)
  if (typeof readGit !== 'function') throw new TypeError('read-only Git adapter required')
  const rows = String(await readGit(['rev-list', '--parents', '--reverse', '--topo-order', `${fromSha}..${toSha}`])).trim().split('\n').filter(Boolean)
  const commits = []
  for (const row of rows) {
    const [oid, ...parents] = row.trim().split(/\s+/); sha(oid); parents.forEach(sha)
    const fields = String(await readGit(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--first-parent', '--diff-merges=first-parent', '--root', '-M', oid])).split('\0')
    const changes = []
    for (let i = 0; i < fields.length && fields[i];) {
      const status = fields[i++]
      if (!/^[ACDMRTUXB][0-9]*$/.test(status)) throw new TypeError('invalid historical change')
      const path = safePath(fields[i++]); changes.push({ status, path })
      if (/^[RC]/.test(status)) changes.push({ status, path: safePath(fields[i++]) })
    }
    changes.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.status.localeCompare(b.status, 'en'))
    commits.push({ sha: oid, parents, changes })
  }
  const changedPaths = unique(commits.flatMap(row => row.changes.map(change => change.path)))
  return { commits, changedPaths, sourceTests: changedPaths.filter(path => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[^/]+$/.test(path)) }
}

export function buildSourceUniverse(inputs) {
  exactKeys(inputs, ['archiveIdentities', 'carrierRanges', 'historyManifests', 'semanticInventory'], 'source inputs')
  if (digest(inputs) !== SOURCE_INVENTORY_SHA256) throw new TypeError('reviewed source inventory digest mismatch')
  const { archiveIdentities, carrierRanges, historyManifests, semanticInventory } = inputs
  const program = buildProgramIndex()
  same(archiveIdentities, program.immutableArchives, 'archive manifests')
  const commits = new Set(); const items = new Map()
  const tranches = historyManifests.map(row => {
    exactKeys(row, ['id', 'carrierId', 'fromSha', 'toSha', 'history', 'blobs', 'legacyHeads'], 'history tranche')
    sha(row.fromSha); sha(row.toSha)
    exactKeys(row.history, ['commits', 'changedPaths', 'sourceTests'], 'history')
    for (const commit of row.history.commits) {
      if (commits.has(commit.sha)) throw new TypeError('commit assigned to multiple tranches')
      commits.add(sha(commit.sha))
    }
    const rules = semanticInventory.find(value => value.id === row.id)?.rules
    if (!rules || rules.length !== row.history.changedPaths.length || new Set(rules.map(rule => rule.path)).size !== rules.length) throw new TypeError('historical path ownership incomplete')
    same(unique(rules.map(rule => rule.path)), row.history.changedPaths, 'path coverage')
    for (const rule of rules) {
      exactKeys(rule, ['path', 'families'], 'semantic rule')
      if (!rule.families.length) throw new TypeError('unassigned historical path')
      for (const family of rule.families) {
        exactKeys(family, ['name', 'kind', 'symbols', 'primaryOwner', 'consumedBy', 'rationale', 'sourceCommitSha', 'snapshotKind'], 'semantic family')
        const blob = row.blobs.find(value => value.path === rule.path && value.commitSha === family.sourceCommitSha)
        if (!blob) throw new TypeError('missing family-specific historical blob')
        sha(blob.commitSha); sha(blob.blobSha)
        if (!['symbol', 'contract', 'test_family', 'document'].includes(family.kind) || typeof family.primaryOwner !== 'string' || !family.primaryOwner || !family.symbols.length || !family.rationale) throw new TypeError('invalid semantic ownership')
        const id = sourceItemId({ path: rule.path, family: family.name })
        const origin = { trancheId: row.id, path: rule.path, snapshotKind: family.snapshotKind, commitSha: blob.commitSha, blobSha: blob.blobSha }
        const existing = items.get(id)
        if (existing) {
          if (existing.primaryOwner !== family.primaryOwner || existing.kind !== family.kind || existing.origins.some(originRow => originRow.trancheId === row.id)) throw new TypeError('duplicate or conflicting semantic item')
          existing.origins.push(origin)
          existing.symbols = unique([...existing.symbols, ...family.symbols])
          existing.consumedBy = unique([...existing.consumedBy, ...family.consumedBy])
        } else items.set(id, { sourceItemId: id, path: rule.path, family: family.name, kind: family.kind, symbols: unique(family.symbols), primaryOwner: family.primaryOwner, consumedBy: unique(family.consumedBy), rationale: family.rationale, origins: [origin] })
      }
    }
    const manifests = { commitOids: row.history.commits.map(commit => commit.sha).sort(), paths: row.history.changedPaths, tests: row.history.sourceTests }
    return { id: row.id, carrierId: row.carrierId, fromSha: row.fromSha, toSha: row.toSha, history: row.history, historySha256: digest(row.history), manifests, manifestDigests: { commitsSha256: digest(manifests.commitOids), pathsSha256: digest(manifests.paths), testsSha256: digest(manifests.tests) }, legacyHeads: row.legacyHeads }
  })
  return { schemaVersion: 'bob-builtin-analyze/feature-selection-source-universe/v1', planningBaselineMainSha: program.planningBaselineMainSha, archiveIdentities, trustChainIdentities: program.trustChainIdentities, provenanceMetadata: [{ id:'open-prs-rest-before',sha256:'5179b26aa1431b35178c5325d62b87cb00efc06880eafdbe664664bb8b8d48c1',binding:'remote_archive_manifest' }, { id:'pr-close-results',sha256:'47967f86095d770ab6dc6b3e0889bf560d3f423c8636dfa0b9aaf64f5b7aa2bd',binding:'remote_cleanup_execution_result' }], carrierRanges, inputSha256: SOURCE_INVENTORY_SHA256, tranches, items: [...items.values()].sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId, 'en')) }
}

export function validateSourceUniverse(universe, { programIndex, archiveIdentities }) {
  validateProgramIndex(programIndex)
  same(archiveIdentities, programIndex.immutableArchives, 'archive context')
  if (digest(universe) !== SOURCE_UNIVERSE_SHA256) throw new TypeError('reviewed source universe digest mismatch')
  same(universe.archiveIdentities, archiveIdentities, 'archive identities')
}
