const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { collectGitDiff } = require("../out/core/gitDiffCollector")

async function writeFixture(files) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bob-diff-fixture-path-"))
  const fixturePath = path.join(workspaceRoot, "diff.json")
  await fs.writeFile(fixturePath, JSON.stringify({
    vcs: "git",
    base: "main",
    head: "feature",
    files,
    unifiedDiff: "",
    warnings: []
  }), "utf8")
  return { workspaceRoot, fixturePath }
}

test("diff fixtures normalize safe Windows separators without stripping real prefixes", async () => {
  const { workspaceRoot, fixturePath } = await writeFixture([
    { path: "a\\example.ts", status: "modified" },
    { path: "b/example.ts", status: "added" }
  ])

  const diff = await collectGitDiff({ review: { vcs: "git", base: "main", head: "feature" } }, {
    workspaceRoot,
    diffFixturePath: fixturePath
  })

  assert.deepEqual(diff.files.map((file) => file.path), ["a/example.ts", "b/example.ts"])
  assert.deepEqual(diff.files.map((file) => file.language), ["typescript", "typescript"])
})

test("diff fixtures reject unsafe or silently normalized changed paths", async () => {
  for (const changedPath of [
    "../outside.ts",
    " src/example.ts",
    "src/example.ts ",
    "src/./example.ts",
    "src//example.ts",
    "src/tab\tname.ts"
  ]) {
    const { workspaceRoot, fixturePath } = await writeFixture([
      { path: changedPath, status: "modified" }
    ])

    await assert.rejects(
      () => collectGitDiff({ review: { vcs: "git", base: "main", head: "feature" } }, {
        workspaceRoot,
        diffFixturePath: fixturePath
      }),
      /diff fixture\.files\[0\]\.path/
    )
  }
})

// Break: an expired operation reaches fixture resolution/open before cancellation.
test('pre_expired_diff_fixture_has_no_read',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'t17-expired-fixture-'));await fs.writeFile(path.join(root,'diff.json'),'{}');let opens=0;
 const open=fs.open,spy=require('node:test').mock.method(fs,'open',(...args)=>{opens++;return open(...args);});
 try{await assert.rejects(()=>collectGitDiff({review:{vcs:'git',base:'main',head:'HEAD'}},{workspaceRoot:root,diffFixturePath:'diff.json',deadline:{expires_at_monotonic_ms:0}}),e=>e.code==='processing_cancelled'&&e.kind==='deadline');assert.equal(opens,0);}finally{spy.mock.restore();}
});
