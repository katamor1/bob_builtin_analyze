const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { fallbackWorkspaceRootCandidates, findMarkerRoots, workspaceRootFromFile } = require("../out/core/workspaceRoots.js")

function folder(name, fsPath) {
  return { name, uri: { fsPath } }
}

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "workflow-roots-"))
}

test("workflow root resolver prefers direct .bob folders over immediate child candidates", async () => {
  const root = await tempRoot()
  const workflowTop = path.join(root, "workspace")
  const nestedTop = path.join(root, "container")
  await fs.mkdir(path.join(workflowTop, ".bob"), { recursive: true })
  await fs.mkdir(path.join(nestedTop, "child", ".bob"), { recursive: true })

  const candidates = await findMarkerRoots([folder("workspace", workflowTop), folder("container", nestedTop)], ".bob")

  assert.deepEqual(candidates.map((candidate) => candidate.root), [workflowTop])
  assert.equal(candidates[0].depth, "direct")
})

test("workflow root resolver finds immediate child .bob folders when no direct marker exists", async () => {
  const root = await tempRoot()
  const top = path.join(root, "workspace")
  const child = path.join(top, "project")
  await fs.mkdir(path.join(child, ".bob"), { recursive: true })

  const candidates = await findMarkerRoots([folder("workspace", top)], ".bob")

  assert.deepEqual(candidates.map((candidate) => candidate.root), [child])
  assert.equal(candidates[0].depth, "child")
})

test("workflow root resolver exposes top folder fallbacks when no .bob marker exists", async () => {
  const root = await tempRoot()
  const first = path.join(root, "first")
  const second = path.join(root, "second")
  await fs.mkdir(first, { recursive: true })
  await fs.mkdir(second, { recursive: true })

  const markerCandidates = await findMarkerRoots([folder("first", first), folder("second", second)], ".bob")
  const fallbackCandidates = fallbackWorkspaceRootCandidates([folder("first", first), folder("second", second)])

  assert.deepEqual(markerCandidates, [])
  assert.deepEqual(fallbackCandidates.map((candidate) => candidate.root), [first, second])
})

test("workflow root picker prompts when multiple .bob candidates exist", async () => {
  const root = await tempRoot()
  const first = path.join(root, "first")
  const second = path.join(root, "second")
  await fs.mkdir(path.join(first, ".bob"), { recursive: true })
  await fs.mkdir(path.join(second, ".bob"), { recursive: true })
  let pickedItems = []

  const { pickWorkflowRoot } = loadWorkspaceRootPicker({
    workspaceFolders: [folder("first", first), folder("second", second)],
    showQuickPick: async (items) => {
      pickedItems = items
      return items[1]
    }
  })

  assert.equal(await pickWorkflowRoot("Select workflow root"), second)
  assert.deepEqual(pickedItems.map((item) => item.candidate.root), [first, second])
})

test("workflowRootFromFile resolves the owning .bob root for a workflow file", async () => {
  const root = await tempRoot()
  const workflowRoot = path.join(root, "workspace")
  const workflowFile = path.join(workflowRoot, ".bob", "workflows", "sample", "WORKFLOW.md")
  await fs.mkdir(path.dirname(workflowFile), { recursive: true })
  await fs.writeFile(workflowFile, "---\nname: sample\n---\n")

  assert.equal(workspaceRootFromFile(workflowFile, ".bob"), workflowRoot)
})

function loadWorkspaceRootPicker({ workspaceFolders, showQuickPick }) {
  const modulePath = require.resolve("../out/commands/workspaceRootPicker.js")
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") {
      return {
        workspace: { workspaceFolders },
        window: { showQuickPick },
        Uri: { file: (fsPath) => ({ scheme: "file", fsPath }) }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

const pathPolicyFs=require('node:fs');
function pathPolicyFixture(){const base=pathPolicyFs.mkdtempSync(path.join(os.tmpdir(),'t17path-wroots-')),root=path.join(base,'日本語 space');pathPolicyFs.mkdirSync(root);return{base,root};}
function pathPolicyAlias(target,name){pathPolicyFs.symlinkSync(target,name,process.platform==='win32'?'junction':'dir');}
test('physical_marker_roots_reject_linked_root_marker_and_child',async()=>{
 const f=pathPolicyFixture();pathPolicyFs.mkdirSync(path.join(f.root,'.bob'));const linked=path.join(f.base,'linked');pathPolicyAlias(f.root,linked);assert.deepEqual(await findMarkerRoots([folder('linked',linked)],'.bob'),[]);
 const other=path.join(f.base,'other');pathPolicyFs.mkdirSync(other);pathPolicyAlias(path.join(f.root,'.bob'),path.join(other,'.bob'));assert.deepEqual(await findMarkerRoots([folder('other',other)],'.bob'),[]);
 const container=path.join(f.base,'container');pathPolicyFs.mkdirSync(container);pathPolicyAlias(f.root,path.join(container,'child'));assert.deepEqual(await findMarkerRoots([folder('container',container)],'.bob'),[]);
 assert.deepEqual(await findMarkerRoots([folder('raw',f.root+path.sep+'.')],'.bob'),[]);
 assert.deepEqual((await findMarkerRoots([folder('first',f.root),folder('duplicate',f.root)],'.bob')).map(row=>row.root),[f.root]);
});
test('fallbacks_are_physical_and_deduplicated',()=>{
 const f=pathPolicyFixture(),linked=path.join(f.base,'linked');pathPolicyAlias(f.root,linked);
 assert.deepEqual(fallbackWorkspaceRootCandidates([folder('linked',linked),folder('first',f.root),folder('duplicate',f.root),folder('missing',path.join(f.base,'missing'))]).map(row=>row.root),[f.root]);
});
test('workflow_file_marker_is_exact_and_validated',()=>{
 const f=pathPolicyFixture(),marker=path.join(f.root,'.bob');pathPolicyFs.mkdirSync(marker);const file=path.join(marker,'workflows','missing','WORKFLOW.md');
 assert.equal(workspaceRootFromFile(file,'.bob'),f.root);assert.equal(workspaceRootFromFile(f.root+path.sep+'.'+path.sep+'.bob'+path.sep+'file.md','.bob'),undefined);
 assert.equal(workspaceRootFromFile(path.join(f.root,'.bob-extra','file.md'),'.bob'),undefined);
 assert.equal(workspaceRootFromFile(file,'.'+path.sep+'.bob'),undefined);
 const other=path.join(f.base,'other');pathPolicyFs.mkdirSync(other);pathPolicyAlias(marker,path.join(other,'.bob'));assert.equal(workspaceRootFromFile(path.join(other,'.bob','file.md'),'.bob'),undefined);
 const nonDirectory=path.join(f.base,'non-directory');pathPolicyFs.mkdirSync(nonDirectory);pathPolicyFs.writeFileSync(path.join(nonDirectory,'.bob'),'marker is a file');assert.equal(workspaceRootFromFile(path.join(nonDirectory,'.bob','file.md'),'.bob'),undefined);
 const {relativePathFromRoot}=require('../out/core/workspaceRoots.js');assert.equal(relativePathFromRoot(f.root,file),'.bob/workflows/missing/WORKFLOW.md');assert.equal(relativePathFromRoot(f.root,f.root),'');assert.throws(()=>relativePathFromRoot(f.root,path.join(f.base,'outside.md')));
});
