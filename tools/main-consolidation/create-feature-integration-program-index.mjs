import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildProgramIndex, validateProgramIndex, canonicalJson } from './featureIntegrationProgramPolicy.mjs'

// Implementation-time only. This generator is not campaign/bootstrap authority.
const DESIGN = { kind: 'design_spec', repositoryPath: 'docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md', containingCommitSha: '819d6261d52d8dc7037d7fae8b852ad4b6a52e21', blobOid: 'ccf3f833e32f48e583a6c6fac4796fa30756e1a4', blobSha256: '709872ba8fa3188c666473248bf5196d1131672cfdec388929ecdb8c4c0292f5' }
const PLAN = { kind: 'implementation_plan', repositoryPath: 'docs/superpowers/plans/2026-08-23-feature-integration-program-index-and-wave-0a.md', containingCommitSha: 'f4a9023990cca2774f0e8ea57792d68b4ae9b1c2', blobOid: '8822828c49c94e3aa4d6d3a5ea69527da0f7b8a7', blobSha256: 'da634d96eafe938d730ba2ab7f93fdeced1adb63c0f2bf2b7913330cda91d372' }
const BASE = { repositoryPath: 'docs/release-evidence/workflow-contract-v2-foundation-status-2026-07-23.md', containingCommitSha: 'c59db06ecb32eb7a57beeb3e932acdd5b4774de5', blobOid: '2af57db85d10cc23d0581064f7e74f22d79b4cf6', blobSha256: '78dcc91a09299d5d8f1b7ebe27457fc920cc280778c7c4c45c343a6e40803f4e' }
const OUTPUT = 'tools/main-consolidation/feature-integration-program-index.json'
const INSTRUCTION = 'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-23-feature-integration-approval/wave0a-exact-lease-approval-instruction.json'
const SIDECAR = INSTRUCTION.replace('instruction.json', 'comparison-exception.json')
const PAIR = [
  { canonicalPath: INSTRUCTION, dev: '2248873766', ino: '54887620461830694', size: '2917', mtimeNs: '1787756728314313100', ctimeNs: '1787756728314313100', linkCount: '1', reparseTag: '0', sha256: '77cf045c06029c150cbdc7b5057b2492f81a260e7a7e45dede460f2850a5f497' },
  { canonicalPath: SIDECAR, dev: '2248873766', ino: '22517998138680662', size: '12226', mtimeNs: '1787756742711789700', ctimeNs: '1787756742711789700', linkCount: '1', reparseTag: '0', sha256: '6c630574d1caa966fc8d413327f91d3ab9a2cf0ac08b612b7b33812bf132039b' }
]
const SOURCE = 'codex_trusted_transcript_v1'
const THREAD = '019f89ad-da0a-7103-9224-c5dbb2c320ba'
const IDS = ['msg_05f07830af5cd031016a8ef5b4cc3887d0897fb0269372062f', 'msg_05f07830af5cd031016a8ef5f5313887d094a813f0f828b8df', 'msg_01a03e7c-4ca4-7791-962e-d4947fbedf97', 'msg_05f07830af5cd031016a8efa78ed4487d0b4d2b0208092a365', 'msg_01a03e88-24de-7490-a80a-98c74d1c86a9']
const SUFFIX = `planCommit=${PLAN.containingCommitSha} planBlob=${PLAN.blobOid} planSha256=${PLAN.blobSha256}`
const ANNOUNCEMENT = `Wave 0A plan committed ${SUFFIX}`
const APPROVAL_TEXT = `WAVE0A-EXACT-LEASE-MERGE-V1 を承認 ${SUFFIX}`
const NODE = 'C:/Program Files/nodejs/node.exe'
const POWERSHELL = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
function requireThat(ok, label) { if (!ok) throw new Error(label) }
function keys(value, expected, label) { requireThat(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key)), `${label} closed schema mismatch`) }
function exact(value, expected, label) { requireThat(JSON.stringify(value) === JSON.stringify(expected), `${label} mismatch`) }
function absolute(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z]:[\\/]/u.test(value) && !/[\x00-\x1f"<>|?*]/u.test(value) && !value.slice(2).includes(':'), 'invalid absolute path')
  const normalized = value.replaceAll('\\', '/')
  requireThat(normalized.slice(3).split('/').every((part) => part && part !== '.' && part !== '..' && !/[. ]$/u.test(part)), 'invalid absolute path components')
  return normalized
}
export function parseArguments(argv) {
  const names = new Map([['--design-commit', 'designCommit'], ['--plan-commit', 'planCommit'], ['--repository-root', 'repositoryRoot'], ['--approval-instruction', 'approvalInstruction'], ['--git-executable', 'gitExecutable'], ['--verify-existing', 'verifyExisting']])
  const options = { verifyExisting: false }; const seen = new Set()
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]; requireThat(names.has(name), `unknown flag ${name}`); requireThat(!seen.has(name), `duplicate flag ${name}`); seen.add(name)
    if (name === '--verify-existing') options.verifyExisting = true
    else { requireThat(typeof argv[i + 1] === 'string' && !argv[i + 1].startsWith('--'), `invalid value for ${name}`); options[names.get(name)] = argv[++i] }
  }
  for (const key of ['designCommit', 'planCommit']) requireThat(/^[0-9a-f]{40}$/u.test(options[key]), `invalid ${key}`)
  for (const key of ['repositoryRoot', 'approvalInstruction', 'gitExecutable']) options[key] = absolute(options[key])
  return options
}
function closedEnvironment(ambient) {
  for (const name of Object.keys(ambient)) requireThat(!/^(?:GIT_|NODE_OPTIONS$|NODE_PATH$)/iu.test(name), `ambient selector ${name} rejected`)
  const environment = Object.create(null)
  Object.assign(environment, { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', TEMP: 'C:/Users/stell/AppData/Local/Temp', TMP: 'C:/Users/stell/AppData/Local/Temp', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_ATTR_NOSYSTEM: '1', LC_ALL: 'C' })
  return environment
}
function decode(text, limit, label) {
  requireThat(typeof text === 'string' && text.length <= Math.ceil(limit / 3) * 4, `${label} invalid/bound`)
  const bytes = Buffer.from(text, 'base64'); requireThat(bytes.length <= limit && bytes.toString('base64') === text, `${label} invalid/bound`); return bytes
}
function jsonBytes(bytes, label) { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new Error(`${label} invalid JSON`) } }
function messageCheck(message, role, transcript) {
  keys(message, ['source', 'threadId', 'messageId', 'role', 'normalizedText', 'normalizedUtf8Sha256', 'observedAt', 'ordinal'], 'transcript message')
  requireThat(message.source === SOURCE && message.threadId === transcript.threadId && message.role === role && typeof message.messageId === 'string' && message.messageId.length > 0, 'transcript identity mismatch')
  requireThat(typeof message.normalizedText === 'string' && message.normalizedText.length < 32768 && message.normalizedText === message.normalizedText.normalize('NFC').replaceAll('\r\n', '\n') && !message.normalizedText.includes('\r') && hash(message.normalizedText) === message.normalizedUtf8Sha256, 'transcript normalized hash mismatch')
  requireThat(Number.isSafeInteger(message.ordinal) && message.ordinal >= 0 && typeof message.observedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(message.observedAt) && Number.isFinite(Date.parse(message.observedAt)), 'transcript ordering invalid')
}
function verifyApproval(input) {
  const bytes = decode(input.approval?.bytesBase64, 65536, 'approval'); const a = jsonBytes(bytes, 'approval')
  keys(a, ['schemaVersion', 'purpose', 'mutationAuthority', 'approvedPlanIdentity', 'trustedTranscript', 'approvalText', 'capturedAt'], 'approval')
  requireThat(a.schemaVersion === 'bob-builtin-analyze/feature-integration-approval-instruction/v4' && a.purpose === 'implement_committed_wave0a_plan_and_exact_lease_addendum' && a.mutationAuthority === false, 'approval schema mismatch')
  keys(a.approvedPlanIdentity, ['repositoryPath', 'containingCommitSha', 'blobOid', 'blobSha256'], 'approval identity')
  for (const key of ['repositoryPath', 'containingCommitSha', 'blobOid', 'blobSha256']) requireThat(a.approvedPlanIdentity[key] === PLAN[key], 'approval plan identity mismatch')
  requireThat(input.options.planCommit === a.approvedPlanIdentity.containingCommitSha, 'approval supplied commit mismatch')
  const t = a.trustedTranscript; keys(t, ['source', 'threadId', 'assistantAnnouncement', 'assistantPrompt', 'userApproval'], 'transcript')
  requireThat(t.source === SOURCE && typeof t.threadId === 'string' && t.threadId.length > 0, 'transcript source mismatch')
  const messages = [t.assistantAnnouncement, t.assistantPrompt, t.userApproval]
  messages.forEach((m, i) => messageCheck(m, ['assistant_announcement', 'assistant_prompt', 'user_approval'][i], t))
  requireThat(new Set(messages.map((m) => m.messageId)).size === 3 && messages[0].ordinal < messages[1].ordinal && messages[1].ordinal < messages[2].ordinal && messages[0].observedAt <= messages[1].observedAt && messages[1].observedAt <= messages[2].observedAt, 'transcript ordering mismatch')
  requireThat(typeof a.capturedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(a.capturedAt) && Number.isFinite(Date.parse(a.capturedAt)) && a.capturedAt >= messages[2].observedAt, 'approval capture invalid')
  const identity = input.approval.identity
  requireThat(identity?.canonicalPath === input.options.approvalInstruction && identity.linkCount === '1' && identity.reparseTag === '0' && identity.size === String(bytes.length), 'approval native identity mismatch')
  let expected = [ANNOUNCEMENT, APPROVAL_TEXT, APPROVAL_TEXT]
  if (input.comparison !== null && input.comparison !== undefined) {
    // Trust origin: the already manually captured and independently verified exact pair.
    // These byte pins are not provider authentication; they cannot authorize another pair.
    const sideBytes = decode(input.comparison.bytesBase64, 65536, 'comparison')
    for (const [i, item] of [input.approval, input.comparison].entries()) {
      for (const key of ['canonicalPath', 'dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'linkCount', 'reparseTag']) requireThat(item.identity?.[key] === PAIR[i][key], 'comparison native identity mismatch')
      requireThat(hash(i === 0 ? bytes : sideBytes) === PAIR[i].sha256, 'comparison original byte hash mismatch')
    }
    const side = jsonBytes(sideBytes, 'comparison')
    keys(side, ['schemaVersion', 'purpose', 'mutationAuthority', 'scope', 'approvedPlanIdentity', 'planFileIdentity', 'instructionFileIdentity', 'providerLogObservation', 'operation', 'subjectMessageIds', 'originalObservations', 'exceptionRequest', 'exceptionApproval', 'capturedAt'], 'comparison')
    requireThat(side.schemaVersion === 'local-only-wave0a-exact-observation-terminal-lf-comparison-exception/v1' && side.purpose === 'retain_raw_provider_evidence_for_explicit_local_comparison_exception' && side.mutationAuthority === false && side.scope === 'one_time_local_only_task1a_manual_boundary_no_campaign_or_remote_mutation' && side.operation === 'remove_exactly_one_terminal_LF_for_comparison_only', 'comparison scope mismatch')
    exact(side.approvedPlanIdentity, a.approvedPlanIdentity, 'comparison plan')
    exact(side.subjectMessageIds, [IDS[0], IDS[2]], 'comparison subjects')
    requireThat(t.threadId === THREAD && messages.every((m, i) => m.messageId === IDS[i] && m.ordinal === [1086, 1090, 1095][i]), 'comparison message identity mismatch')
    const observations = [...side.originalObservations, side.exceptionRequest, side.exceptionApproval]
    requireThat(observations.length === 5, 'comparison observations mismatch')
    observations.forEach((o, i) => {
      requireThat(o.messageId === IDS[i] && o.threadId === THREAD && o.source === SOURCE && hash(o.rawText) === o.rawUtf8Sha256 && hash(o.normalizedText) === o.normalizedUtf8Sha256 && hash(o.rawRecord) === o.rawRecordUtf8Sha256 && o.rawText.normalize('NFC').replaceAll('\r\n', '\n') === o.normalizedText, 'comparison observation hash/identity mismatch')
      if (i < 3) for (const key of Object.keys(messages[i])) requireThat(o[key] === messages[i][key], 'comparison paired transcript mismatch')
    })
    for (const key of ['canonicalPath', 'dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'sha256']) requireThat(side.instructionFileIdentity[key] === PAIR[0][key], 'comparison instruction identity mismatch')
    expected = [ANNOUNCEMENT + '\n', APPROVAL_TEXT, APPROVAL_TEXT + '\n']
  }
  messages.forEach((m, i) => requireThat(m.normalizedText === expected[i], 'strict approval text mismatch'))
  requireThat(a.approvalText === APPROVAL_TEXT, 'approval text mismatch')
}

// Pure renderer used by the exited child. No filesystem/process calls or live protocol.
export function renderAuthenticated(input) {
  requireThat(input?.options?.designCommit === DESIGN.containingCommitSha && input.options.planCommit === PLAN.containingCommitSha, 'authority commit mismatch')
  requireThat(Array.isArray(input.results) && input.results.length === 7, 'invalid command results')
  const outputs = input.results.map((result, i) => {
    requireThat(result?.status === 0, 'native command exit failure')
    decode(result.stderrBase64, 65536, 'native stderr')
    return decode(result.stdoutBase64, i === 0 ? 65536 : i % 2 === 1 ? 64 : 4194304, 'native stdout')
  })
  requireThat(outputs[0].length === 0, 'dirty authority path')
  verifyApproval(input)
  for (const [i, authority] of [DESIGN, PLAN, BASE].entries()) {
    requireThat(outputs[i * 2 + 1].toString('ascii') === authority.blobOid + '\n', 'authority resolved blob mismatch')
    requireThat(hash(outputs[i * 2 + 2]) === authority.blobSha256, 'authority blob SHA mismatch')
    const oid = createHash('sha1').update(`blob ${outputs[i * 2 + 2].length}\0`).update(outputs[i * 2 + 2]).digest('hex')
    requireThat(oid === authority.blobOid, 'authority blob OID mismatch')
  }
  const index = buildProgramIndex({ designAuthority: { ...DESIGN }, planAuthority: { ...PLAN } })
  validateProgramIndex(index)
  return canonicalJson(index)
}

// Private native bridge: every component is opened no-follow with share READ only.
// The owning process retains all handles through Git, renderer exit and publication.
const nativeSource = String.raw`
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;
public sealed class ProgramIndexNative : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attr, CreateLo, CreateHi, AccessLo, AccessHi, WriteLo, WriteHi, Volume, SizeHi, SizeLo, Links, IndexHi, IndexLo; }
 [StructLayout(LayoutKind.Sequential)] struct Basic { public long Creation, Access, Write, Change; public uint Attr; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sa,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int cls,out Basic b,uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder b,uint n,uint f);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFilePointerEx(SafeFileHandle h,long d,out long p,uint m);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(SafeFileHandle h,byte[] b,uint n,out uint r,IntPtr o);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(SafeFileHandle h,byte[] b,uint n,out uint r,IntPtr o);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool FlushFileBuffers(SafeFileHandle h);
 readonly Dictionary<string,SafeFileHandle> held = new Dictionary<string,SafeFileHandle>(StringComparer.OrdinalIgnoreCase);
 static Exception Error(string s) { return new IOException(s+" native error "+Marshal.GetLastWin32Error()); }
 static string Full(string p) { string f=Path.GetFullPath(p); if(!Path.IsPathRooted(p)||!String.Equals(f.Replace('\\','/'),p.Replace('\\','/'),StringComparison.OrdinalIgnoreCase)) throw Error("noncanonical absolute path"); return f; }
 static string Final(SafeFileHandle h) { var b=new StringBuilder(32768); uint n=GetFinalPathNameByHandleW(h,b,(uint)b.Capacity,0); if(n==0||n>=b.Capacity) throw Error("final path"); string s=b.ToString(); if(!s.StartsWith(@"\\?\")) throw Error("nonlocal final path"); return s.Substring(4); }
 static Info Check(SafeFileHandle h,string p,bool directory) { Info i; if(!GetFileInformationByHandle(h,out i)) throw Error("identity"); if((i.Attr&0x400)!=0 || ((i.Attr&0x10)!=0)!=directory || (!directory&&i.Links!=1)) throw Error("reparse/type/link rejected"); if(!String.Equals(Final(h),p,StringComparison.OrdinalIgnoreCase)) throw Error("final path mismatch"); return i; }
 SafeFileHandle Open(string p,bool directory) { p=Full(p); SafeFileHandle existing; if(held.TryGetValue(p,out existing)) { Check(existing,p,directory); return existing; } var h=CreateFileW(p,directory?0x80u:0x80000000u,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero); if(h.IsInvalid){h.Dispose();throw Error("no-follow open "+p);} try {Check(h,p,directory);held.Add(p,h);return h;}catch{h.Dispose();throw;} }
 public void HoldDirectoryChain(string p) { p=Full(p); string root=Path.GetPathRoot(p); Open(root,true); string current=root; foreach(string component in p.Substring(root.Length).Split(new[]{'\\'},StringSplitOptions.RemoveEmptyEntries)) { current=Path.Combine(current,component);Open(current,true); } }
 public SafeFileHandle HoldFile(string p) { p=Full(p); HoldDirectoryChain(Path.GetDirectoryName(p));return Open(p,false); }
 static bool Present(string p) { uint a=GetFileAttributesW(p); if(a!=0xffffffff)return true; int e=Marshal.GetLastWin32Error();if(e==2||e==3)return false;throw Error("attributes"); }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFileAttributesW(string p);
 public void HoldOptionalFile(string p) { if(Present(p))HoldFile(p); }
 public byte[] Read(string p,int limit) { p=Full(p); var h=HoldFile(p); var before=Identity(p); Info i=Check(h,p,false); ulong size=((ulong)i.SizeHi<<32)|i.SizeLo;if(size>(ulong)limit)throw Error("read bound");long pos;if(!SetFilePointerEx(h,0,out pos,0))throw Error("seek");byte[] b=new byte[(int)size];uint n;if(!ReadFile(h,b,(uint)b.Length,out n,IntPtr.Zero)||n!=b.Length)throw Error("read");var after=Identity(p);foreach(var kv in before)if(after[kv.Key]!=kv.Value)throw Error("identity drift");return b; }
 public Dictionary<string,string> Identity(string p) { p=Full(p);var h=HoldFile(p);Info i=Check(h,p,false);Basic b;if(!GetFileInformationByHandleEx(h,0,out b,(uint)Marshal.SizeOf(typeof(Basic))))throw Error("basic identity");return new Dictionary<string,string>{{"canonicalPath",p.Replace('\\','/')},{"dev",i.Volume.ToString()},{"ino",(((ulong)i.IndexHi<<32)|i.IndexLo).ToString()},{"size",(((ulong)i.SizeHi<<32)|i.SizeLo).ToString()},{"mtimeNs",((b.Write-116444736000000000L)*100).ToString()},{"ctimeNs",((b.Change-116444736000000000L)*100).ToString()},{"linkCount",i.Links.ToString()},{"reparseTag","0"}}; }
 static string Text(byte[] b) { return new UTF8Encoding(false,true).GetString(b); }
 public void RequireHash(string p,string expected) { byte[] bytes=Read(p,4194304);using(var sha=System.Security.Cryptography.SHA256.Create()){string actual=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();if(actual!=expected)throw Error("dirty authority hash mismatch");} }
 void Refuse(string p) { if(Present(p))throw Error("repository selector/pointer rejected "+p); }
 void FreezeTree(string p,int depth,ref int count) { if(!Present(p))return;if(depth>8||++count>4096)throw Error("repository metadata bound");HoldDirectoryChain(p);foreach(string f in Directory.GetFiles(p))HoldFile(f);foreach(string d in Directory.GetDirectories(p))FreezeTree(d,depth+1,ref count); }
 public void HoldRepository(string root) {
  root=Full(root);HoldDirectoryChain(root);string dot=Path.Combine(root,".git");string admin,common;
  if((GetFileAttributesW(dot)&0x10)!=0){HoldDirectoryChain(dot);admin=dot;common=dot;}
  else {string pointer=Text(Read(dot,4096));if(!pointer.StartsWith("gitdir: ")||!pointer.EndsWith("\n")||pointer.IndexOf('\n')!=pointer.Length-1)throw Error("git pointer format");admin=Full(pointer.Substring(8,pointer.Length-9).TrimEnd('\r'));HoldDirectoryChain(admin);
   string back=Text(Read(Path.Combine(admin,"gitdir"),4096)).TrimEnd('\r','\n');if(!String.Equals(Full(back),dot,StringComparison.OrdinalIgnoreCase))throw Error("git backlink mismatch");
   string cd=Text(Read(Path.Combine(admin,"commondir"),4096));if(cd!="../..\n"&&cd!="../..\r\n")throw Error("common pointer mismatch");common=Path.GetFullPath(Path.Combine(admin,"../.."));HoldDirectoryChain(common);
   if(!String.Equals(Path.GetDirectoryName(admin),Path.Combine(common,"worktrees"),StringComparison.OrdinalIgnoreCase))throw Error("admin pointer mismatch");
  }
  foreach(string folder in new[]{admin,common}) {foreach(string f in new[]{"HEAD","index","packed-refs","config","config.worktree","shallow"})HoldOptionalFile(Path.Combine(folder,f));Refuse(Path.Combine(folder,"objects","info","alternates"));Refuse(Path.Combine(folder,"objects","info","http-alternates"));Refuse(Path.Combine(folder,"info","grafts"));Refuse(Path.Combine(folder,"refs","replace"));}
  string config=Text(Read(Path.Combine(common,"config"),65536));if(System.Text.RegularExpressions.Regex.IsMatch(config,@"(?im)^\s*\[\s*(include|includeIf|extensions|filter)\b|^\s*(worktree|fsmonitor)\s*="))throw Error("local config selector rejected");
  if(Present(Path.Combine(admin,"config.worktree")))throw Error("worktree config selector rejected");
  int count=0;FreezeTree(Path.Combine(common,"refs"),0,ref count);
  HoldDirectoryChain(Path.Combine(common,"objects"));
 }
 static string Quote(string s) { var b=new StringBuilder("\"");int slashes=0;foreach(char c in s){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);return b.Append('"').ToString(); }
 static void Environment(ProcessStartInfo p) { p.EnvironmentVariables.Clear();foreach(var kv in new Dictionary<string,string>{{"SystemRoot","C:/Windows"},{"WINDIR","C:/Windows"},{"TEMP","C:/Users/stell/AppData/Local/Temp"},{"TMP","C:/Users/stell/AppData/Local/Temp"},{"GIT_CONFIG_NOSYSTEM","1"},{"GIT_CONFIG_GLOBAL","NUL"},{"GIT_TERMINAL_PROMPT","0"},{"GIT_OPTIONAL_LOCKS","0"},{"GIT_NO_REPLACE_OBJECTS","1"},{"GIT_ATTR_NOSYSTEM","1"},{"LC_ALL","C"}})p.EnvironmentVariables.Add(kv.Key,kv.Value); }
 static byte[] Bounded(Stream stream,int limit) {using(var m=new MemoryStream()){byte[] b=new byte[8192];int n;while((n=stream.Read(b,0,b.Length))>0){if(m.Length+n>limit)throw Error("child stream bound");m.Write(b,0,n);}return m.ToArray();} }
 public byte[] Run(string executable,string[] args,string input,int limit,int timeout) {
  HoldFile(executable);var start=new ProcessStartInfo();start.FileName=Full(executable);start.Arguments=String.Join(" ",Array.ConvertAll(args,Quote));start.WorkingDirectory=@"C:\Windows\System32";start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardInput=true;start.RedirectStandardOutput=true;start.RedirectStandardError=true;Environment(start);
  using(var p=new Process()){p.StartInfo=start;if(!p.Start())throw Error("child start");var stdout=Task.Run(()=>Bounded(p.StandardOutput.BaseStream,limit));var stderr=Task.Run(()=>Bounded(p.StandardError.BaseStream,65536));var stdin=Task.Run(()=>{byte[] b=Encoding.UTF8.GetBytes(input);p.StandardInput.BaseStream.Write(b,0,b.Length);p.StandardInput.Close();});var clock=Stopwatch.StartNew();
   try {while(!p.WaitForExit(10)||!stdout.IsCompleted||!stderr.IsCompleted||!stdin.IsCompleted){if(clock.ElapsedMilliseconds>timeout||stdout.IsFaulted||stderr.IsFaulted||stdin.IsFaulted)throw Error("child timeout/stream failure");}if(p.ExitCode!=0)throw Error("child exit "+p.ExitCode);Task.WaitAll(stdout,stderr,stdin);return stdout.Result;}
   catch {try{if(!p.HasExited)p.Kill();p.WaitForExit(3000);}catch{}throw;}
  }
 }
 public void Publish(string p,byte[] bytes,bool verify) {
  p=Full(p);HoldDirectoryChain(Path.GetDirectoryName(p));if(verify){byte[] old=Read(p,4194304);if(old.Length!=bytes.Length)throw Error("output drift");for(int i=0;i<old.Length;i++)if(old[i]!=bytes[i])throw Error("output drift");return;}
  var h=CreateFileW(p,0xc0000000,1,IntPtr.Zero,1,0x02200000,IntPtr.Zero);if(h.IsInvalid){h.Dispose();throw Error("wx create collision");}try{Check(h,p,false);uint n;if(!WriteFile(h,bytes,(uint)bytes.Length,out n,IntPtr.Zero)||n!=bytes.Length||!FlushFileBuffers(h))throw Error("publish write/flush");held.Add(p,h);}catch{h.Dispose();throw;}
  byte[] actual=Read(p,4194304);if(actual.Length!=bytes.Length)throw Error("published identity drift");for(int i=0;i<bytes.Length;i++)if(actual[i]!=bytes[i])throw Error("published byte drift");
 }
 public void Dispose(){foreach(var h in held.Values)h.Dispose();held.Clear();}
}
`
const bridge = String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$session=$null
try {
 $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
 Add-Type -TypeDefinition $request.nativeSource
 $session=New-Object ProgramIndexNative
 $o=$request.options
 $session.HoldRepository($o.repositoryRoot)
 $null=$session.HoldFile($o.gitExecutable)
 $null=$session.HoldFile($request.nodeExecutable)
 $null=$session.HoldFile($request.modulePath)
 $null=$session.HoldFile($request.policyPath)
 foreach($p in $request.authorityPaths) { $null=$session.HoldFile(($o.repositoryRoot+'/'+$p)) }
 foreach($a in $request.workingAuthorities) { $session.RequireHash(($o.repositoryRoot+'/'+$a.path),$a.sha256) }
 $session.HoldDirectoryChain(($o.repositoryRoot+'/tools/main-consolidation'))
 $approvalBytes=$session.Read($o.approvalInstruction,65536)
 $approval=@{bytesBase64=[Convert]::ToBase64String($approvalBytes);identity=$session.Identity($o.approvalInstruction)}
 $comparison=$null
 if($o.approvalInstruction -ceq $request.fixedInstruction) {
  $comparisonBytes=$session.Read($request.fixedSidecar,65536)
  $comparison=@{bytesBase64=[Convert]::ToBase64String($comparisonBytes);identity=$session.Identity($request.fixedSidecar)}
 }
 $results=New-Object System.Collections.Generic.List[object]
 for($i=0;$i -lt $request.commands.Count;$i++) {
  $bound=4194304;if($i -eq 0){$bound=65536}elseif(($i % 2) -eq 1){$bound=64}
  $bytes=$session.Run($o.gitExecutable,[string[]]$request.commands[$i],'',$bound,30000)
  $results.Add(@{status=0;stdoutBase64=[Convert]::ToBase64String($bytes);stderrBase64=''})
 }
 $evidence=@{options=$o;approval=$approval;comparison=$comparison;results=$results.ToArray()} | ConvertTo-Json -Depth 30 -Compress
 $rendered=$session.Run($request.nodeExecutable,[string[]]@('--input-type=module','-e',$request.rendererSource),$evidence,4194304,30000)
 $session.Publish(($o.repositoryRoot+'/'+$request.outputPath),$rendered,[bool]$o.verifyExisting)
 $sha=[Security.Cryptography.SHA256]::Create();try{$digest=([BitConverter]::ToString($sha.ComputeHash($rendered))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $mode='created';if($o.verifyExisting){$mode='verified'}
 [Console]::Out.WriteLine((@{mode=$mode;sha256=$digest;bytes=$rendered.Length} | ConvertTo-Json -Compress))
} catch { [Console]::Error.WriteLine($_.Exception.ToString());exit 1 } finally { if($session){$session.Dispose()} }
`

export function runGenerator(argv, { env = process.env, execute = spawnSync } = {}) {
  // Deliberately before environment inspection, script construction or any adapter access.
  const options = parseArguments(argv)
  const environment = closedEnvironment(env)
  requireThat(process.platform === 'win32', 'native Windows leases required')
  const prefix = ['-C', options.repositoryRoot, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.hooksPath=NUL', '-c', 'core.attributesFile=NUL', '-c', 'core.excludesFile=NUL', '-c', 'core.sparseCheckout=false']
  const authorities = [DESIGN, PLAN, BASE]
  const commands = [[...prefix, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--', ...authorities.map((a) => a.repositoryPath)]]
  for (const [i, a] of authorities.entries()) { const commit = i === 0 ? options.designCommit : i === 1 ? options.planCommit : a.containingCommitSha; commands.push([...prefix, 'rev-parse', '--verify', `${commit}:${a.repositoryPath}`], [...prefix, 'cat-file', 'blob', a.blobOid]) }
  const rendererSource = `import {renderAuthenticated} from ${JSON.stringify(import.meta.url)};const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>8388608)throw Error('renderer input bound');chunks.push(chunk)}process.stdout.write(renderAuthenticated(JSON.parse(Buffer.concat(chunks).toString('utf8'))));`
  const request = { options, commands, nativeSource, nodeExecutable: NODE, modulePath: fileURLToPath(import.meta.url).replaceAll('\\', '/'), policyPath: fileURLToPath(new URL('./featureIntegrationProgramPolicy.mjs', import.meta.url)).replaceAll('\\', '/'), authorityPaths: authorities.map((a) => a.repositoryPath), workingAuthorities: [DESIGN, PLAN].map((a) => ({ path: a.repositoryPath, sha256: a.blobSha256 })), outputPath: OUTPUT, fixedInstruction: INSTRUCTION, fixedSidecar: SIDECAR, rendererSource }
  const result = execute(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', bridge], { input: JSON.stringify(request), env: environment, cwd: 'C:/Windows/System32', shell: false, windowsHide: true, timeout: 240000, maxBuffer: 65536 })
  requireThat(!result.error && result.status === 0, `native bridge exit failure: ${result.error?.message ?? Buffer.from(result.stderr ?? '').toString('utf8').slice(0, 2000)}`)
  requireThat(Buffer.isBuffer(result.stdout) && result.stdout.length <= 65536 && Buffer.isBuffer(result.stderr) && result.stderr.length <= 65536, 'native bridge output bound')
  const summary = jsonBytes(result.stdout, 'native summary'); keys(summary, ['mode', 'sha256', 'bytes'], 'native summary')
  requireThat(summary.mode === (options.verifyExisting ? 'verified' : 'created') && /^[0-9a-f]{64}$/u.test(summary.sha256) && Number.isSafeInteger(summary.bytes) && summary.bytes > 0 && summary.bytes <= 4194304, 'native summary mismatch')
  return summary
}

const direct = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url && !process.execArgv.some((arg) => ['-e', '--eval', '--input-type=module', '--test'].includes(arg))
if (direct) {
  try { process.stdout.write(JSON.stringify(runGenerator(process.argv.slice(2))) + '\n') }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1 }
}
