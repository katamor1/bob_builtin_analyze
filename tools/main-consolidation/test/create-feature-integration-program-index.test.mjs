import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, linkSync, symlinkSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseArguments, renderAuthenticated, runGenerator } from '../create-feature-integration-program-index.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url))).replaceAll('\\', '/')
const GENERATOR = `${ROOT}/tools/main-consolidation/create-feature-integration-program-index.mjs`
const GIT = 'C:/Program Files/Git/cmd/git.exe'
const NODE = 'C:/Program Files/nodejs/node.exe'
const PS = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const APPROVAL = 'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-23-feature-integration-approval/wave0a-exact-lease-approval-instruction.json'
const COMPARISON = APPROVAL.replace('instruction.json', 'comparison-exception.json')
const DESIGN_PATH = 'docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md'
const PLAN_PATH = 'docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md'
const BASE_PATH = 'docs/release-evidence/workflow-contract-v2-foundation-status-2026-07-23.md'
const DESIGN_COMMIT = '819d6261d52d8dc7037d7fae8b852ad4b6a52e21'
const PLAN_COMMIT = 'f4a9023990cca2774f0e8ea57792d68b4ae9b1c2'
const BASE_COMMIT = 'c59db06ecb32eb7a57beeb3e932acdd5b4774de5'
const DESIGN_BLOB = 'ccf3f833e32f48e583a6c6fac4796fa30756e1a4'
const PLAN_BLOB = '8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7'
const BASE_BLOB = '2af57db85d10cc23d0581064f7e74f22d79b4cf6'
const args = ['--design-commit', DESIGN_COMMIT, '--plan-commit', PLAN_COMMIT, '--repository-root', ROOT, '--approval-instruction', APPROVAL, '--git-executable', GIT]
const env = { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_ATTR_NOSYSTEM: '1', LC_ALL: 'C' }
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const result = (bytes = '') => ({ status: 0, stdoutBase64: Buffer.from(bytes).toString('base64'), stderrBase64: '' })
function native(file, argv, options = {}) {
  const output = spawnSync(file, argv, { encoding: 'utf8', timeout: 45000, maxBuffer: 10 * 1024 * 1024, env, ...options })
  assert.equal(output.error, undefined, String(output.error)); assert.equal(output.status, 0, output.stderr)
  return output.stdout
}
let cached
function fixture() {
  if (!cached) {
    const blob = (oid) => Buffer.from(native(GIT, ['-C', ROOT, 'cat-file', 'blob', oid], { encoding: 'buffer' }))
    cached = { options: parseArguments(args), approval: { bytesBase64: readFileSync(APPROVAL).toString('base64'), identity: { canonicalPath: APPROVAL, dev: '2248873766', ino: '54887620461830694', size: '2917', mtimeNs: '1787756728314313100', ctimeNs: '1787756728314313100', linkCount: '1', reparseTag: '0' } }, comparison: { bytesBase64: readFileSync(COMPARISON).toString('base64'), identity: { canonicalPath: COMPARISON, dev: '2248873766', ino: '22517998138680662', size: '12226', mtimeNs: '1787756742711789700', ctimeNs: '1787756742711789700', linkCount: '1', reparseTag: '0' } }, results: [result(), result(DESIGN_BLOB + '\n'), result(blob(DESIGN_BLOB)), result(PLAN_BLOB + '\n'), result(blob(PLAN_BLOB)), result(BASE_BLOB + '\n'), result(blob(BASE_BLOB))] }
  }
  return structuredClone(cached)
}
function editRecord(f, which, change) {
  const record = JSON.parse(Buffer.from(f[which].bytesBase64, 'base64')); change(record)
  f[which].bytesBase64 = Buffer.from(JSON.stringify(record)).toString('base64')
}
function strictFixture() {
  const f = fixture(); f.comparison = null
  editRecord(f, 'approval', (record) => {
    for (const key of ['assistantAnnouncement', 'userApproval']) {
      const message = record.trustedTranscript[key]; message.normalizedText = message.normalizedText.slice(0, -1); message.normalizedUtf8Sha256 = sha(message.normalizedText)
    }
  })
  f.approval.identity.canonicalPath = 'C:/strict/approval.json'; f.options.approvalInstruction = 'C:/strict/approval.json'
  f.approval.identity.size = String(Buffer.from(f.approval.bytesBase64, 'base64').length)
  return f
}
const rejected = /invalid|mismatch|dirty|approval|identity|bound|exit|unknown|duplicate|absolute|selector|strict|schema|capture|transcript|native|authority|blob|comparison|closed|reparse|link|process/i

test('all public flags parse, no deferred selector is accepted, and invalid arguments do zero adapter access', () => {
  assert.equal(parseArguments([...args, '--verify-existing']).verifyExisting, true)
  for (const suffix of [['--eligible-capability', 'X'], ['--satisfied-capability', 'X'], ['--deferred-approval', 'C:/x'], ['--unknown'], ['--verify-existing', '--verify-existing'], ['--plan-commit', PLAN_COMMIT], ['--repository-root', 'C:/other']]) {
    let calls = 0
    assert.throws(() => runGenerator([...args, ...suffix], { env: {}, execute() { calls++; throw Error('access') } }), rejected)
    assert.equal(calls, 0)
  }
  for (const bad of [[], args.slice(0, -1), args.map((v) => v === ROOT ? 'relative' : v), args.map((v) => v === GIT ? 'git' : v), args.map((v) => v === APPROVAL ? 'relative.json' : v), args.map((v) => v === PLAN_COMMIT ? 'HEAD' : v), args.map((v) => v === ROOT ? 'C:/repo/../other' : v), args.map((v) => v === GIT ? 'C:/git.exe:stream' : v)]) assert.throws(() => parseArguments(bad), rejected)
})

test('ambient repository, config, path, and runtime selectors reject before process/filesystem access', () => {
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_INDEX_FILE', 'GIT_REPLACE_REF_BASE', 'GIT_EXEC_PATH', 'GIT_CEILING_DIRECTORIES', 'NODE_OPTIONS', 'NODE_PATH']) {
    let calls = 0
    assert.throws(() => runGenerator(args, { env: { [key]: 'redirect' }, execute() { calls++ } }), /selector/i)
    assert.equal(calls, 0)
  }
})

let bridgeScript
test('bridge request has exact fixed Git argv, no CWD/PATH redirection, and closed child environment', () => {
  let count = 0
  const outcome = runGenerator(args, { env: { PATH: 'C:/evil', HOME: 'C:/evil', USERPROFILE: 'C:/evil', TEMP: 'C:/evil', SystemRoot: 'C:/evil' }, execute(executable, argv, options) {
    count++; assert.equal(executable, PS)
    assert.deepEqual(argv.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'])
    const request = JSON.parse(options.input)
    bridgeScript = "$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n" + request.nativeSource + "\n'@\n# BEGIN TRANSACTION"
    const prefix = ['-C', ROOT, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.hooksPath=NUL', '-c', 'core.attributesFile=NUL', '-c', 'core.excludesFile=NUL', '-c', 'core.sparseCheckout=false']
    assert.deepEqual(request.commands, [
      [...prefix, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--', DESIGN_PATH, PLAN_PATH, BASE_PATH],
      [...prefix, 'rev-parse', '--verify', `${DESIGN_COMMIT}:${DESIGN_PATH}`], [...prefix, 'cat-file', 'blob', DESIGN_BLOB],
      [...prefix, 'rev-parse', '--verify', `${PLAN_COMMIT}:${PLAN_PATH}`], [...prefix, 'cat-file', 'blob', PLAN_BLOB],
      [...prefix, 'rev-parse', '--verify', `${BASE_COMMIT}:${BASE_PATH}`], [...prefix, 'cat-file', 'blob', BASE_BLOB]
    ])
    assert.equal(options.cwd, 'C:/Windows/System32'); assert.equal(options.shell, false)
    assert.equal(options.env.PATH, undefined); assert.equal(options.env.HOME, undefined); assert.equal(options.env.USERPROFILE, undefined)
    assert.equal(options.env.SystemRoot, 'C:/Windows'); assert.equal(options.env.GIT_CONFIG_GLOBAL, 'NUL')
    assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1'); assert.equal(options.env.GIT_NO_REPLACE_OBJECTS, '1')
    assert.equal(options.env.TEMP, 'C:/Users/stell/AppData/Local/Temp')
    assert.deepEqual(request.workingAuthorities, [{ path: DESIGN_PATH, sha256: '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5' }, { path: PLAN_PATH, sha256: 'da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372' }])
    assert.equal(request.options.repositoryRoot, ROOT); assert.equal(request.options.gitExecutable, GIT)
    return { status: 0, stdout: Buffer.from('{"mode":"created","sha256":"' + 'a'.repeat(64) + '","bytes":123}\n'), stderr: Buffer.alloc(0) }
  } })
  assert.equal(count, 1); assert.equal(outcome.mode, 'created')
})

test('native bridge errors, timeout, invalid exit, oversized stdout/stderr never parse success output', () => {
  for (const failure of [{ status: 1 }, { status: null }, { error: Error('process failure'), status: 0 }, { status: 0, stdout: Buffer.alloc(65537) }, { status: 0, stderr: Buffer.alloc(65537) }]) assert.throws(() => runGenerator(args, { env: {}, execute: () => ({ status: 0, stdout: Buffer.from('{"mode":"created"}'), stderr: Buffer.alloc(0), ...failure }) }), rejected)
})

test('committed blobs render the reviewed schema, exact prerequisite, and no approval/machine state', () => {
  const bytes = renderAuthenticated(fixture()); const index = JSON.parse(bytes)
  assert.equal(index.authorityDocuments[0].blobSha256, '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5')
  assert.equal(index.authorityDocuments[1].containingCommitSha, PLAN_COMMIT)
  assert.equal(index.authorityDocuments[1].blobSha256, 'da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372')
  assert.deepEqual(index.baselinePrerequisites, [{ id: 'BASE-WF2-F7-BOB-PROFILE', classification: 'planning_baseline_prerequisite', hardDependsOn: [], baselineMainSha: BASE_COMMIT, authorityDocumentKind: 'design_spec', authorityEvidence: { repositoryPath: BASE_PATH, containingCommitSha: BASE_COMMIT, blobOid: BASE_BLOB, blobSha256: '78dcc91a09299d5d8f1b7ebe27457fc920cc280778c7c4c45c343a6e40803f4e' }, requiresLaterEvidence: true }])
  for (const forbidden of ['approvalRecord', 'implementationHeadSha', 'mergeSha', 'runId', 'jobId', 'uatResult', 'observedActivationStatus', 'comparison-exception', '54887620461830694']) assert.equal(bytes.includes(forbidden), false)
  assert.ok(bytes.subarray(-1).equals(Buffer.from('\n')))
})

test('staged, unstaged, untracked, ignored authority paths all reject', () => {
  for (const status of ['M  ', ' M ', '?? ', '!! ', 'A  ', ' D ']) { const f = fixture(); f.results[0] = result(status + PLAN_PATH + '\0'); assert.throws(() => renderAuthenticated(f), /dirty/i) }
})

test('every command checks exit and stream bounds before parsing; missing or extra results reject', () => {
  for (let i = 0; i < 7; i++) {
    for (const change of [(r) => { r.status = 1 }, (r) => { r.status = null }, (r) => { r.stdoutBase64 = Buffer.alloc(4194305).toString('base64') }, (r) => { r.stderrBase64 = Buffer.alloc(65537).toString('base64') }]) { const f = fixture(); change(f.results[i]); assert.throws(() => renderAuthenticated(f), rejected) }
  }
  for (const length of [0, 6, 8]) { const f = fixture(); f.results.length = length; assert.throws(() => renderAuthenticated(f), rejected) }
})

test('design/plan/baseline commit, blob, SHA crossings and working-tree substitution reject', () => {
  for (const i of [1, 3, 5]) { const f = fixture(); f.results[i] = result('a'.repeat(40) + '\n'); assert.throws(() => renderAuthenticated(f), rejected) }
  for (const i of [2, 4, 6]) { const f = fixture(); f.results[i] = result('working tree impostor'); assert.throws(() => renderAuthenticated(f), rejected) }
  for (const key of ['designCommit', 'planCommit']) { const f = fixture(); f.options[key] = 'b'.repeat(40); assert.throws(() => renderAuthenticated(f), rejected) }
  for (const value of [BASE_BLOB + '\nextra', BASE_BLOB + '\r\n\n', ' ' + BASE_BLOB + '\n']) { const f = fixture(); f.results[5] = result(value); assert.throws(() => renderAuthenticated(f), rejected) }
})

test('the fixed two-LF exception requires the original paired native identities and exact byte digests', () => {
  for (const which of ['approval', 'comparison']) {
    for (const field of ['canonicalPath', 'dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'linkCount', 'reparseTag']) { const f = fixture(); f[which].identity[field] += 'x'; assert.throws(() => renderAuthenticated(f), rejected) }
    const f = fixture(); f[which].bytesBase64 = Buffer.from(Buffer.from(f[which].bytesBase64, 'base64').toString() + '\n').toString('base64'); assert.throws(() => renderAuthenticated(f), rejected)
  }
  const f = fixture(); f.comparison = null; assert.throws(() => renderAuthenticated(f), rejected)
})

test('two LFs, changed IDs, pair crossing, sidecar authority or comparison-rule drift cannot extend exception', () => {
  const cases = [
    ['approval', (a) => { a.trustedTranscript.userApproval.normalizedText += '\n' }],
    ['approval', (a) => { a.trustedTranscript.assistantAnnouncement.messageId = 'different' }],
    ['approval', (a) => { a.approvedPlanIdentity.blobOid = DESIGN_BLOB }],
    ['comparison', (a) => { a.subjectMessageIds.reverse() }],
    ['comparison', (a) => { a.operation = 'trim' }],
    ['comparison', (a) => { a.mutationAuthority = true }],
    ['comparison', (a) => { a.exceptionApproval.messageId = a.exceptionRequest.messageId }],
    ['comparison', (a) => { a.instructionFileIdentity.ino = '1' }],
    ['comparison', (a) => { a.originalObservations[2].rawText += '\n' }]
  ]
  for (const [which, change] of cases) { const f = fixture(); editRecord(f, which, change); assert.throws(() => renderAuthenticated(f), rejected) }
})

test('ordinary v4 stays strict with closed keys, normalized hashes, exact text, ordered distinct transcript and approval identity', () => {
  assert.ok(Buffer.isBuffer(renderAuthenticated(strictFixture())))
  const cases = [(a) => { a.extra = true }, (a) => { a.mutationAuthority = true }, (a) => { a.approvedPlanIdentity.containingCommitSha = DESIGN_COMMIT }, (a) => { a.approvedPlanIdentity.blobSha256 = 'a'.repeat(64) }, (a) => { a.trustedTranscript.source = 'self' }, (a) => { a.trustedTranscript.userApproval.role = 'assistant_prompt' }, (a) => { a.trustedTranscript.userApproval.threadId = 'other' }, (a) => { a.trustedTranscript.userApproval.messageId = a.trustedTranscript.assistantPrompt.messageId }, (a) => { a.trustedTranscript.userApproval.ordinal = 1 }, (a) => { a.trustedTranscript.userApproval.normalizedText += '\n'; a.trustedTranscript.userApproval.normalizedUtf8Sha256 = sha(a.trustedTranscript.userApproval.normalizedText) }, (a) => { a.trustedTranscript.assistantAnnouncement.normalizedUtf8Sha256 = 'a'.repeat(64) }, (a) => { a.approvalText = 'prefix' + a.approvalText }, (a) => { a.capturedAt = '2020-01-01T00:00:00.000Z' }]
  for (const change of cases) { const f = strictFixture(); editRecord(f, 'approval', change); f.approval.identity.size = String(Buffer.from(f.approval.bytesBase64, 'base64').length); assert.throws(() => renderAuthenticated(f), rejected) }
})

test('import is inert even when argv looks like a valid create request', () => {
  const script = `process.argv=${JSON.stringify([NODE, GENERATOR, ...args])}; await import(${JSON.stringify(new URL('../create-feature-integration-program-index.mjs', import.meta.url).href)}); process.stdout.write('IMPORTED')`
  assert.equal(native(NODE, ['--input-type=module', '-e', script]), 'IMPORTED')
})

test('unknown flags reject before real filesystem and process APIs are accessed', () => {
  const script = `import fs from 'node:fs'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; const g=await import(${JSON.stringify(new URL('../create-feature-integration-program-index.mjs', import.meta.url).href)}); for(const name of ['openSync','readFileSync','lstatSync','statSync','realpathSync','writeFileSync']) fs[name]=()=>{throw Error('FORBIDDEN_FS')}; cp.spawnSync=()=>{throw Error('FORBIDDEN_PROCESS')}; syncBuiltinESMExports(); for(const flag of ['--unknown','--eligible-capability','--satisfied-capability','--deferred-approval']) {try{g.runGenerator([...${JSON.stringify(args)},flag,'x'],{env:{}});process.exit(2)}catch(e){if(!/unknown/.test(e.message))throw e}} process.stdout.write('ZERO_ACCESS')`
  assert.equal(native(NODE, ['--input-type=module', '-e', script]), 'ZERO_ACCESS')
})

test('Windows held native leases deny replacement/write; reject reparse/type/link/pointer drift; create-new and verify are immutable; child settlement is bounded', { skip: process.platform !== 'win32' }, (t) => {
  if (!bridgeScript) runGenerator(args, { env: {}, execute(_exe, _argv, options) { bridgeScript = "$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n" + JSON.parse(options.input).nativeSource + "\n'@\n# BEGIN TRANSACTION"; return { status: 0, stdout: Buffer.from('{"mode":"created","sha256":"' + 'a'.repeat(64) + '","bytes":123}'), stderr: Buffer.alloc(0) } } })
  const dir = mkdtempSync(path.join(tmpdir(), 'program-index-native-'))
  const leaf = path.join(dir, 'leaf.json'); writeFileSync(leaf, 'original')
  const linked = path.join(dir, 'hard.json'); writeFileSync(linked, 'hard'); linkSync(linked, path.join(dir, 'hard-alias.json'))
  mkdirSync(path.join(dir, 'real')); symlinkSync(path.join(dir, 'real'), path.join(dir, 'junction'), 'junction')
  writeFileSync(path.join(dir, 'real', 'leaf.json'), 'x')
  mkdirSync(path.join(dir, 'fake-repo')); writeFileSync(path.join(dir, 'fake-repo', '.git'), 'gitdir: relative\n')
  const common = path.join(dir, 'metadata'); const admin = path.join(common, 'worktrees', 'unit'); const tree = path.join(dir, 'held-tree')
  mkdirSync(admin, { recursive: true }); mkdirSync(tree); mkdirSync(path.join(common, 'objects')); mkdirSync(path.join(common, 'refs'))
  writeFileSync(path.join(common, 'config'), '[core]\n bare = false\n')
  writeFileSync(path.join(tree, '.git'), `gitdir: ${admin.replaceAll('\\', '/')}\n`)
  writeFileSync(path.join(admin, 'gitdir'), path.join(tree, '.git').replaceAll('\\', '/') + '\n')
  writeFileSync(path.join(admin, 'commondir'), '../..\n')
  const filteredTree = path.join(dir, 'filter-tree'); mkdirSync(path.join(filteredTree, '.git'), { recursive: true })
  mkdirSync(path.join(filteredTree, '.git', 'objects')); mkdirSync(path.join(filteredTree, '.git', 'refs'))
  writeFileSync(path.join(filteredTree, '.git', 'config'), '[core]\n bare = false\n[filter "side-effect"]\n clean = unexpected-process\n')
  const quote = (v) => "'" + v.replaceAll("'", "''") + "'"
  const harness = `
$ErrorActionPreference='Stop'
function Reject([string]$label,[scriptblock]$body) { try { & $body } catch { [Console]::WriteLine('REJECT '+$label); return }; throw ('accepted '+$label) }
$s = New-Object ProgramIndexNative
try {
 $h=$s.HoldFile(${quote(leaf)})
 Reject 'write denied' { [IO.File]::WriteAllText(${quote(leaf)},'changed') }
 Reject 'delete denied' { [IO.File]::Delete(${quote(leaf)}) }
 Reject 'rename denied' { [IO.File]::Move(${quote(leaf)},${quote(leaf + '.moved')}) }
 Reject 'ancestor rename denied' { [IO.Directory]::Move(${quote(dir)},${quote(dir + '.moved')}) }
 Reject 'hard link' { $s.HoldFile(${quote(linked)}) }
 Reject 'directory as file' { $s.HoldFile(${quote(path.join(dir, 'real'))}) }
 Reject 'file as directory' { $s.HoldDirectoryChain(${quote(leaf)}) }
 Reject 'junction leaf' { $s.HoldDirectoryChain(${quote(path.join(dir, 'junction'))}) }
 Reject 'junction ancestor' { $s.HoldFile(${quote(path.join(dir, 'junction', 'leaf.json'))}) }
 Reject 'relative git pointer' { $s.HoldRepository(${quote(path.join(dir, 'fake-repo'))}) }
 Reject 'local executable filter config' { $s.HoldRepository(${quote(filteredTree)}) }
 $s.RequireHash(${quote(leaf)},'0682c5f2076f099c34cfdd15a9e063849ed437a49677e6fcc5b4198c76575be5')
 Reject 'dirty authority hidden by index flags' { $s.RequireHash(${quote(leaf)},'0000000000000000000000000000000000000000000000000000000000000000') }
 $s.HoldRepository(${quote(tree)})
 Reject 'git pointer replacement denied' { [IO.File]::WriteAllText(${quote(path.join(tree, '.git'))},'gitdir: other') }
 Reject 'common pointer replacement denied' { [IO.File]::WriteAllText(${quote(path.join(admin, 'commondir'))},'other') }
 Reject 'backlink replacement denied' { [IO.File]::WriteAllText(${quote(path.join(admin, 'gitdir'))},'other') }
 $output=${quote(path.join(dir, 'output.json'))}; $bytes=[Text.Encoding]::UTF8.GetBytes('immutable')
 $s.Publish($output,$bytes,$false)
 Reject 'wx collision' { $s.Publish($output,$bytes,$false) }
 $before=[IO.File]::GetLastWriteTimeUtc($output); $s.Publish($output,$bytes,$true)
 if ([IO.File]::GetLastWriteTimeUtc($output) -ne $before) { throw 'verify wrote' }
 Reject 'output drift' { $s.Publish($output,[Text.Encoding]::UTF8.GetBytes('drift'),$true) }
 Reject 'verify missing' { $s.Publish(${quote(path.join(dir, 'missing.json'))},$bytes,$true) }
 Reject 'child nonzero' { $s.Run(${quote(NODE)},@('-e','process.stdout.write("valid");process.exit(4)'),'',1024,3000) }
 Reject 'child stdout bound' { $s.Run(${quote(NODE)},@('-e','process.stdout.write("x".repeat(2048))'),'',1024,3000) }
 Reject 'child stderr bound' { $s.Run(${quote(NODE)},@('-e','process.stderr.write("x".repeat(70000))'),'',1024,3000) }
 Reject 'child timeout' { $s.Run(${quote(NODE)},@('-e','setTimeout(()=>{},10000)'),'',1024,150) }
 $r=$s.Run(${quote(NODE)},@('-e','process.stdout.write(JSON.stringify([process.env.PATH??null,process.env.GIT_CONFIG_NOSYSTEM,process.cwd()]))'),'',1024,3000)
 if ([Text.Encoding]::UTF8.GetString($r) -ne '[null,"1","C:\\\\Windows\\\\System32"]') { throw 'child env/cwd drift' }
 [Console]::WriteLine('NATIVE_PASS')
} finally { $s.Dispose() }
`
  const source = bridgeScript.split('# BEGIN TRANSACTION')[0] + harness
  const stdout = native(PS, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '& ([ScriptBlock]::Create([Console]::In.ReadToEnd()))'], { input: source })
  t.diagnostic(stdout.trim()); t.diagnostic(`Retained native fixture: ${dir}`)
  assert.match(stdout, /NATIVE_PASS/); assert.equal((stdout.match(/REJECT /g) || []).length, 22)
  assert.equal(readFileSync(leaf, 'utf8'), 'original'); assert.equal(readFileSync(path.join(dir, 'output.json'), 'utf8'), 'immutable')
  assert.equal(existsSync(path.join(dir, 'missing.json')), false)
  assert.equal(statSync(path.join(dir, 'output.json')).size, 9)
  // Retain the bounded native fixture for independent inspection; never delete user paths.
})
