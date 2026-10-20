// Read-only reproduction. Starts only Node processes, never the Bob GUI.
// Requests initialize/tools/list and a tool call rejected before Bazaar runs.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const repo = path.resolve(__dirname, '../../..');
const home = os.homedir();
const installed = path.join(home, '.bobide/extensions');
const app = path.join(home, 'AppData/Local/Programs/IBM Bob/resources/app');
const workspace = path.join(home, 'source/repos/bazaar_test/trunk');
const configPath = path.join(workspace, '.bob/mcp.json');
const workflowPath = path.join(workspace, '.bob/workflows/bazaar-project-rule-review/WORKFLOW.md');
const workflowInstalled = path.join(installed, 'local.workflow-register-0.1.0');
const bazaarInstalled = path.join(installed, 'local.bob-bazaar-review-0.3.0');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const server = readJson(configPath).mcpServers.bazaar;
const { McpStdioReader } = require(path.join(bazaarInstalled, 'out/mcp/jsonRpc.js'));

async function probe(label, command, extraEnv, framing) {
  const expectedServer = path.join(bazaarInstalled, 'out/mcp/server.js');
  if (server.args.length !== 1 || path.resolve(server.args[0]).toLowerCase() !== expectedServer.toLowerCase()) {
    throw new Error('Unexpected server path; inspect before executing.');
  }
  return new Promise(resolve => {
    const replies = [];
    let stderr = '';
    let finished = false;
    const child = spawn(command, [expectedServer], {
      env: { ...process.env, ...server.env, ...extraEnv },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    function finish(reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      resolve({ label, framing, reason, responseIds: replies.map(m => m.id),
        serverInfo: replies.find(m => m.id === 1)?.result?.serverInfo,
        toolCount: replies.find(m => m.id === 2)?.result?.tools?.length,
        toolCall: replies.find(m => m.id === 3)?.result,
        stderr: stderr.slice(0, 300) });
    }
    const timer = setTimeout(() => finish('timeout'), 1800);
    const reader = new McpStdioReader(message => {
      replies.push(message);
      if (replies.some(m => m.id === 1) && replies.some(m => m.id === 2) && replies.some(m => m.id === 3)) {
        finish('responses-received');
      }
    }, 1048576);
    child.stdout.on('data', data => reader.push(data));
    child.stderr.on('data', data => { stderr += data.toString(); });
    child.on('error', error => finish(error.message));
    child.on('exit', (code, signal) => finish(`exit:${code}:${signal}`));
    child.stdin.on('error', () => {});
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'read-only-diagnostic', version: '1.0' }
      } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
        name: 'bazaar_status', arguments: { cwd: workspace }
      } }
    ];
    for (const message of messages) {
      const payload = JSON.stringify(message);
      child.stdin.write(framing === 'ndjson' ? payload + '\n'
        : `Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`);
    }
  });
}

function compileChecks() {
  const original = fs.readFileSync(workflowPath, 'utf8');
  const lines = original.split(/\r?\n/);
  if (lines[170].trim() !== 'maxResultBytes: 20000') throw new Error('Workflow changed; inspect line 171.');
  const corrected = lines.filter((_, index) => index !== 170).join('\n');
  return [workflowInstalled, path.join(repo, 'extensions/workflow-register')].map(base => {
    const { compileWorkflowDocument } = require(path.join(base, 'out/core/workflowCompiler.js'));
    function check(text) {
      const result = compileWorkflowDocument({ sourceId: 'workflow-register', filePath: workflowPath, text, strict: true });
      return { ok: result.ok, stepCount: result.workflow?.steps?.length,
        diagnostics: result.diagnostics.map(d => ({ severity: d.severity, message: d.message })) };
    }
    return { base, original: check(original), memoryOnlyLine171Removed: check(corrected) };
  });
}

function extensionInventory() {
  return ['workflow-register', 'bob-bazaar-review', 'bob-code-consistency-review'].map(name => {
    const directory = fs.readdirSync(installed).find(dir => dir.startsWith(`local.${name}-`));
    const packageJson = readJson(path.join(installed, directory, 'package.json'));
    const sourceJson = readJson(path.join(repo, 'extensions', name, 'package.json'));
    const palette = packageJson.contributes.menus.commandPalette;
    const keys = Object.keys({ ...packageJson, ...sourceJson });
    const vsix = path.join(repo, 'extensions', name, `${name}-${packageJson.version}.vsix`);
    return { id: `local.${name}`, version: packageJson.version,
      engine: packageJson.engines.vscode, mainExists: fs.existsSync(path.join(installed, directory, packageJson.main)),
      commandCount: packageJson.contributes.commands.length,
      visibleCommands: palette.filter(item => item.when !== 'false').map(item => item.command),
      hiddenCommandCount: palette.filter(item => item.when === 'false').length,
      manifestDifferentKeys: keys.filter(key => JSON.stringify(packageJson[key]) !== JSON.stringify(sourceJson[key])),
      vsixSha256: hash(vsix) };
  });
}

(async () => {
  // This probe deliberately verifies rejection, so never run it with allowed roots.
  if (process.env.BOB_BAZAAR_ALLOWED_ROOTS || server.env?.BOB_BAZAAR_ALLOWED_ROOTS
      || process.env.BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD === '1'
      || server.env?.BOB_BAZAAR_ALLOW_UNRESTRICTED_CWD === '1') {
    throw new Error('Allowed roots changed; inspect before running tool-call probe.');
  }
  const bobExe = path.join(home, 'AppData/Local/Programs/IBM Bob/IBM Bob.exe');
  if (path.resolve(server.command).toLowerCase() !== bobExe.toLowerCase()) throw new Error('Unexpected command.');
  const before = { config: hash(configPath), workflow: hash(workflowPath) };
  const bobBundle = fs.readFileSync(path.join(app, 'extensions/bob-code/dist/extension.js'), 'utf8');
  const readMessageIndex = bobBundle.indexOf('readMessage(){');
  const bobManifest = readJson(path.join(app, 'extensions/bob-code/package.json'));
  const result = {
    capturedAt: new Date().toISOString(), nodeVersion: process.version,
    bob: { ideVersion: readJson(path.join(app, 'product.json')).bobideVersion,
      platformVersion: readJson(path.join(app, 'package.json')).version,
      builtinExtensionVersion: bobManifest.version,
      stdioReaderExcerpt: bobBundle.slice(readMessageIndex, readMessageIndex + 330),
      workflowButton: bobManifest.contributes.menus['view/title'].find(item => item.command === 'bob-code.task.workflow') },
    workspace, extensions: extensionInventory(),
    mcpConfig: { configPath, command: server.command, args: server.args,
      envNames: Object.keys(server.env || {}), commandExists: fs.existsSync(server.command),
      scriptExists: fs.existsSync(server.args[0]),
      inheritedAllowedRootsPresent: Boolean(process.env.BOB_BAZAAR_ALLOWED_ROOTS) },
    workflow: { file: workflowPath, invalidLine: 171, checks: compileChecks() },
    mcpProbes: [
      await probe('external-node-framed', process.execPath, {}, 'content-length'),
      await probe('bob-run-as-node-framed', bobExe, { ELECTRON_RUN_AS_NODE: '1' }, 'content-length'),
      await probe('external-node-standard-stdio', process.execPath, {}, 'ndjson')
    ],
    originalFilesUnchanged: { config: before.config === hash(configPath), workflow: before.workflow === hash(workflowPath) }
  };
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
