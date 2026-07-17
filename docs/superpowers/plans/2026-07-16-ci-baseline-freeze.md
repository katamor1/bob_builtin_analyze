# CI Executability and Baseline Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing GitHub Actions workflows emit bounded environment evidence, prove that Ubuntu and Windows jobs execute real steps on the latest-main baseline, and freeze the observed commit, environment, and results in `docs/review-findings-tracking.md`.

**Architecture:** Keep the three existing workflows authoritative and add one dependency-free CommonJS evidence writer shared by every job. Test its allowlisted output and workflow wiring with Node's built-in test runner, then use a pull-request run to collect exact GitHub-hosted runner evidence before closing the tracking rows.

**Tech Stack:** Node.js 22, CommonJS, Node built-in test runner, GitHub Actions, GitHub Actions job/log APIs, Markdown.

## Global Constraints

- Base all implementation commits on `f4f9d3308361333e02ab1af732706b7a9e5fc952` through branch `codex/ci-baseline-freeze-20260716`.
- Do not add a diagnostic-only workflow, duplicate probe job, self-hosted runner, or CI write-back commit.
- Keep all external GitHub Action references pinned to their existing full commit SHA.
- Record only `GITHUB_SHA`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `RUNNER_OS`, `RUNNER_ARCH`, `ImageOS`, `ImageVersion`, and `process.version`.
- Never emit secrets, tokens, the complete environment, or workspace absolute paths.
- Missing evidence values render as `unavailable`; they are never inferred.
- Run production-script changes through a failing test before implementation.
- Do not mark IBM Bob, real Bazaar, multi-root, signing, distribution, or product UAT complete.
- If a job again has `steps: null` or no log, classify it as a runner-allocation blocker rather than a repository-code failure.

---

### Task 1: Add the bounded CI baseline evidence writer

**Files:**
- Create: `scripts/ci-baseline-summary.test.js`
- Create: `scripts/ci-baseline-summary.js`

**Interfaces:**
- Consumes: an allowlisted environment object, an explicit Node version string, an optional stdout writer, and an optional `appendFileSync` function.
- Produces: `collectBaseline(env, nodeVersion)`, `renderMarkdown(record)`, and `emitBaseline(options)`; the CLI writes one JSON line and optionally appends a Markdown table to `GITHUB_STEP_SUMMARY`.

- [ ] **Step 1: Create the behavior test before the production script exists**

Create `scripts/ci-baseline-summary.test.js` with the following initial content:

```js
#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  collectBaseline,
  emitBaseline,
  renderMarkdown
} = require("./ci-baseline-summary")

const completeEnv = {
  GITHUB_SHA: "abc123",
  GITHUB_RUN_ID: "42",
  GITHUB_RUN_ATTEMPT: "2",
  RUNNER_OS: "Linux",
  RUNNER_ARCH: "X64",
  ImageOS: "ubuntu24",
  ImageVersion: "20260714.240.1",
  GITHUB_STEP_SUMMARY: "summary.md",
  SECRET_TOKEN: "must-not-appear"
}

test("collectBaseline returns only the fixed evidence allowlist", () => {
  assert.deepEqual(collectBaseline(completeEnv, "v22.23.1"), {
    commit: "abc123",
    runId: "42",
    runAttempt: "2",
    runnerOs: "Linux",
    runnerArch: "X64",
    imageOs: "ubuntu24",
    imageVersion: "20260714.240.1",
    nodeVersion: "v22.23.1"
  })
})

test("collectBaseline marks missing values unavailable", () => {
  assert.deepEqual(collectBaseline({}, ""), {
    commit: "unavailable",
    runId: "unavailable",
    runAttempt: "unavailable",
    runnerOs: "unavailable",
    runnerArch: "unavailable",
    imageOs: "unavailable",
    imageVersion: "unavailable",
    nodeVersion: "unavailable"
  })
})

test("renderMarkdown keeps fixed order and escapes table control text", () => {
  const markdown = renderMarkdown({
    ...collectBaseline(completeEnv, "v22.23.1"),
    runId: "42|43\n<script>"
  })

  assert.match(markdown, /^## CI Baseline Environment\n/m)
  assert.match(markdown, /\| Run ID \| 42\\\|43 &lt;script&gt; \|/)
  assert.doesNotMatch(markdown, /must-not-appear/)
})

test("emitBaseline writes allowlisted JSON and appends the summary", () => {
  let stdout = ""
  const appends = []

  const record = emitBaseline({
    env: completeEnv,
    nodeVersion: "v22.23.1",
    stdout: { write: (chunk) => { stdout += chunk } },
    appendFileSync: (...args) => { appends.push(args) }
  })

  assert.deepEqual(JSON.parse(stdout), record)
  assert.doesNotMatch(stdout, /must-not-appear/)
  assert.equal(appends.length, 1)
  assert.equal(appends[0][0], "summary.md")
  assert.equal(appends[0][2], "utf8")
  assert.match(appends[0][1], /ubuntu24/)
})

test("emitBaseline succeeds without a step summary file", () => {
  let appendCalls = 0
  emitBaseline({
    env: { GITHUB_SHA: "abc123" },
    nodeVersion: "v22.23.1",
    stdout: { write: () => {} },
    appendFileSync: () => { appendCalls += 1 }
  })
  assert.equal(appendCalls, 0)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run from the repository root:

```bash
node --test scripts/ci-baseline-summary.test.js
```

Expected: exit code `1` with `MODULE_NOT_FOUND` for `./ci-baseline-summary`.

- [ ] **Step 3: Add the minimal evidence writer**

Create `scripts/ci-baseline-summary.js`:

```js
#!/usr/bin/env node
"use strict"

const fs = require("node:fs")

function normalizeEvidenceValue(value) {
  if (typeof value !== "string" || value.trim() === "") return "unavailable"
  return value.replace(/\r\n?|\n/g, " ").trim()
}

function collectBaseline(env = process.env, nodeVersion = process.version) {
  return {
    commit: normalizeEvidenceValue(env.GITHUB_SHA),
    runId: normalizeEvidenceValue(env.GITHUB_RUN_ID),
    runAttempt: normalizeEvidenceValue(env.GITHUB_RUN_ATTEMPT),
    runnerOs: normalizeEvidenceValue(env.RUNNER_OS),
    runnerArch: normalizeEvidenceValue(env.RUNNER_ARCH),
    imageOs: normalizeEvidenceValue(env.ImageOS),
    imageVersion: normalizeEvidenceValue(env.ImageVersion),
    nodeVersion: normalizeEvidenceValue(nodeVersion)
  }
}

function escapeMarkdownTableValue(value) {
  return normalizeEvidenceValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
}

function renderMarkdown(record) {
  const rows = [
    ["Commit", record.commit],
    ["Run ID", record.runId],
    ["Run attempt", record.runAttempt],
    ["Runner OS", record.runnerOs],
    ["Runner architecture", record.runnerArch],
    ["Runner image OS", record.imageOs],
    ["Runner image version", record.imageVersion],
    ["Node.js", record.nodeVersion]
  ]
  return [
    "## CI Baseline Environment",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${label} | ${escapeMarkdownTableValue(value)} |`),
    ""
  ].join("\n")
}

function emitBaseline({
  env = process.env,
  nodeVersion = process.version,
  stdout = process.stdout,
  appendFileSync = fs.appendFileSync
} = {}) {
  const record = collectBaseline(env, nodeVersion)
  stdout.write(`${JSON.stringify(record)}\n`)
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, renderMarkdown(record), "utf8")
  }
  return record
}

if (require.main === module) {
  try {
    emitBaseline()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

module.exports = {
  collectBaseline,
  emitBaseline,
  renderMarkdown
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
node --test scripts/ci-baseline-summary.test.js
```

Expected: `5` tests, `5` pass, `0` fail.

- [ ] **Step 5: Commit the behavior and implementation together**

```bash
git add scripts/ci-baseline-summary.js scripts/ci-baseline-summary.test.js
git commit -m "ci: record bounded runner baseline evidence"
```

Expected: one commit containing only the writer and its tests.

---

### Task 2: Wire baseline evidence into the authoritative workflows

**Files:**
- Modify: `scripts/ci-baseline-summary.test.js`
- Modify: `.github/workflows/extensions-quality.yml`
- Modify: `.github/workflows/workflow-contracts.yml`
- Modify: `.github/workflows/code-consistency-review-scaffold.yml`

**Interfaces:**
- Consumes: `node <relative-path>/scripts/ci-baseline-summary.js` after `actions/setup-node` in every job definition.
- Produces: five invocation sites in `extensions-quality`, one in `workflow-contracts`, two in `code-consistency-review-scaffold`, and explicit path-filter dependencies where no generic `scripts/*.js` filter exists.

- [ ] **Step 1: Add the workflow-wiring regression test before editing YAML**

Append to `scripts/ci-baseline-summary.test.js`:

```js
const fs = require("node:fs")
const path = require("node:path")

const repoRoot = path.resolve(__dirname, "..")

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8")
}

function occurrenceCount(text, pattern) {
  return (text.match(pattern) ?? []).length
}

test("authoritative workflows record the CI baseline in every job definition", () => {
  const quality = readRepoFile(".github", "workflows", "extensions-quality.yml")
  const contracts = readRepoFile(".github", "workflows", "workflow-contracts.yml")
  const scaffold = readRepoFile(".github", "workflows", "code-consistency-review-scaffold.yml")

  assert.equal(occurrenceCount(quality, /run: node \.\.\/\.\.\/scripts\/ci-baseline-summary\.js/g), 4)
  assert.equal(occurrenceCount(quality, /run: node scripts\/ci-baseline-summary\.js/g), 1)
  assert.equal(occurrenceCount(contracts, /run: node \.\.\/\.\.\/scripts\/ci-baseline-summary\.js/g), 1)
  assert.equal(occurrenceCount(scaffold, /run: node \.\.\/\.\.\/\.\.\/\.\.\/scripts\/ci-baseline-summary\.js/g), 1)
  assert.equal(occurrenceCount(scaffold, /run: node \.\.\/\.\.\/scripts\/ci-baseline-summary\.js/g), 1)
  assert.equal(occurrenceCount(contracts, /"scripts\/ci-baseline-summary\.js"/g), 2)
  assert.equal(occurrenceCount(scaffold, /"scripts\/ci-baseline-summary\.js"/g), 2)
})
```

- [ ] **Step 2: Run the test and verify the wiring assertion is RED**

```bash
node --test scripts/ci-baseline-summary.test.js
```

Expected: the first five behavior tests pass and `authoritative workflows record the CI baseline in every job definition` fails because the invocation counts are `0`.

- [ ] **Step 3: Add the evidence step to `extensions-quality`**

In `.github/workflows/extensions-quality.yml`, add this step immediately after each `Setup Node.js` block in the three Ubuntu extension jobs and the Windows matrix job:

```yaml
      - name: Record CI baseline
        run: node ../../scripts/ci-baseline-summary.js
```

Add this root-relative variant immediately after `Setup Node.js` in `extension-metrics`:

```yaml
      - name: Record CI baseline
        run: node scripts/ci-baseline-summary.js
```

Add the focused test before `Verify Extension Host smoke contract` in `workflow-register`:

```yaml
      - name: Verify CI baseline summary
        run: node --test ../../scripts/ci-baseline-summary.test.js
```

- [ ] **Step 4: Add the evidence step and dependency paths to `workflow-contracts`**

Add `"scripts/ci-baseline-summary.js"` to both `pull_request.paths` and `push.paths`. After `Setup Node.js`, add:

```yaml
      - name: Record CI baseline
        run: node ../../scripts/ci-baseline-summary.js
```

- [ ] **Step 5: Add the evidence steps and dependency paths to the scaffold workflow**

Add `"scripts/ci-baseline-summary.js"` to both `pull_request.paths` and `push.paths`. After `Setup Node.js` in `validate-scaffold`, add:

```yaml
      - name: Record CI baseline
        run: node ../../../../scripts/ci-baseline-summary.js
```

After `Setup Node.js` in `validate-extension`, add:

```yaml
      - name: Record CI baseline
        run: node ../../scripts/ci-baseline-summary.js
```

- [ ] **Step 6: Run the focused contract tests and verify GREEN**

```bash
node --test scripts/ci-baseline-summary.test.js scripts/extension-host-smoke-contract.test.js
```

Expected: `10` tests, `10` pass, `0` fail.

- [ ] **Step 7: Verify changed workflow invariants**

Run:

```bash
git diff --check
rg -n "Record CI baseline|ci-baseline-summary" .github/workflows scripts/ci-baseline-summary.test.js
rg -n "uses: [^@]+@(v[0-9]+|main|master)$" .github/workflows
```

Expected: `git diff --check` exits `0`; the second command shows exactly eight workflow step definitions plus the test/path-filter references; the final command has no output.

- [ ] **Step 8: Commit the workflow wiring**

```bash
git add scripts/ci-baseline-summary.test.js .github/workflows/extensions-quality.yml .github/workflows/workflow-contracts.yml .github/workflows/code-consistency-review-scaffold.yml
git commit -m "ci: wire baseline evidence into quality gates"
```

Expected: one commit containing the wiring test and three authoritative workflow changes.

---

### Task 3: Run the current-main baseline and capture exact evidence

**Files:**
- No repository file changes before the baseline run.

**Interfaces:**
- Consumes: branch `codex/ci-baseline-freeze-20260716` after Tasks 1 and 2.
- Produces: one draft PR and exact run/job/log observations for `extensions-quality`, `workflow-contracts`, and `code-consistency-review-scaffold` at the implementation head commit.

- [ ] **Step 1: Open a draft PR against `main`**

Use title `ci: freeze executable Ubuntu and Windows baseline`. The body must state the base commit, historical `steps: null` classification, allowlisted evidence fields, and that product UAT remains out of scope.

Expected: all three workflow files are in the PR diff, so all three workflows are selected by their `pull_request.paths` filters.

- [ ] **Step 2: Wait for workflow runs associated with the implementation commit**

Query workflow runs by the exact implementation commit until all three named workflows reach `completed`. Do not substitute a run from a different SHA.

Expected workflow/job shape:

- `extensions-quality`: 7 jobs total; Ubuntu extension jobs `3`, Windows extension jobs `3`, extension metrics job `1`.
- `workflow-contracts`: 1 Ubuntu job.
- `code-consistency-review-scaffold`: 2 Ubuntu jobs.

- [ ] **Step 3: Verify every job has real steps**

For every job, fetch job steps and confirm `steps` is a non-empty array containing `Set up job`, `Checkout`, `Setup Node.js`, `Record CI baseline`, and `Complete job`, plus the workflow-specific validation steps.

Expected: no job has `steps: null`, no job lacks a log, and all conclusions are `success`. If this expectation is not met, stop and diagnose the first failing or unallocated job before editing tracking.

- [ ] **Step 4: Extract representative Ubuntu and Windows environments**

Fetch logs for `workflow-register` on Ubuntu and `Windows / workflow-register`. Record the exact values printed by `Current runner version`, `Operating System`, `Runner Image`, and the `Record CI baseline` JSON line.

Expected: the Ubuntu job reports `RUNNER_OS=Linux`; the Windows job reports `RUNNER_OS=Windows`; both report the same implementation commit and non-empty run metadata.

- [ ] **Step 5: Record the baseline evidence bundle outside the repository mutation**

Keep the exact implementation commit, PR number, three run IDs and URLs, ten job IDs/conclusions, two representative environment records, and step counts available for Task 4. Do not invent values that are absent from the APIs or logs.

---

### Task 4: Freeze the baseline in review tracking

**Files:**
- Modify: `docs/review-findings-tracking.md`

**Interfaces:**
- Consumes: the exact observed evidence bundle from Task 3.
- Produces: `CI-BASELINE-01`, closed `REM-M03`, CI-closed `REM-M04`, and an indexed evidence commit without closing product UAT.

- [ ] **Step 1: Add the verification tracking row**

Under `## Additional verification checks`, add `CI-BASELINE-01` with status `done`. The `done commits / next action` cell must contain the Task 2 implementation commit. The verification cell must contain the three exact run IDs, `extensions-quality` job total `7/7`, contracts `1/1`, scaffold `2/2`, and representative Ubuntu/Windows job IDs.

- [ ] **Step 2: Close only the automated portions of the remediation rows**

Change `REM-M03` from `in_progress` to `done` and cite the strict workflow validation run. Change `REM-M04` from `in_progress` to `ci_done / product_uat_pending`; cite the Ubuntu/Windows matrix and all three Extension Host smoke results, while explicitly retaining IBM Bob, real Bazaar, and multi-root as pending external UAT.

- [ ] **Step 3: Add a bounded evidence subsection**

After the remediation table, add `### CI baseline freeze (2026-07-16)` with:

- historical classification: runner allocation blocker because `steps: null` and logs were absent, not a test failure;
- base and implementation commits;
- PR and exact workflow run links;
- a compact Ubuntu/Windows environment table containing runner version, OS/image, Node version, representative job, and conclusion;
- a run-result table containing expected/observed job counts and `steps` presence;
- an explicit note that the exact admin setting that cleared the historical blocker is not observable and is not inferred;
- an explicit list of product UAT gates that remain open.

All IDs and versions in this section must be copied from Task 3 observations. Do not use placeholders.

- [ ] **Step 4: Add the completed commit index entry**

Add the Task 2 implementation commit to `## Completed commit index` with tracked ID `CI-BASELINE-01` and note `record bounded Ubuntu/Windows runner evidence and prove real CI steps`.

- [ ] **Step 5: Review the documentation-only tail**

Verify that the diff from the Task 2 implementation commit to the current head changes only `docs/review-findings-tracking.md`.

Expected: no production script or workflow logic changed after the baseline run.

- [ ] **Step 6: Commit the tracking evidence**

```bash
git add docs/review-findings-tracking.md
git commit -m "docs: freeze executable CI baseline evidence"
```

Expected: one documentation-only evidence commit.

---

### Task 5: Reverify the final PR head and prepare integration

**Files:**
- No further file changes unless verification exposes an evidence transcription error.

**Interfaces:**
- Consumes: final PR head containing the documentation-only tail.
- Produces: final CI status, clean diff review, and an integration-ready PR without automatically closing external UAT.

- [ ] **Step 1: Wait for final-head workflows**

Because the PR still contains all three workflow files, the documentation commit triggers the same three workflows on the final head. Wait until they complete.

Expected: `extensions-quality` 7/7, `workflow-contracts` 1/1, and scaffold 2/2 succeed with non-empty steps.

- [ ] **Step 2: Verify the branch diff and commits**

Compare `f4f9d3308361333e02ab1af732706b7a9e5fc952...codex/ci-baseline-freeze-20260716`.

Expected changed paths:

- `docs/superpowers/specs/2026-07-16-ci-baseline-freeze-design.md`
- `docs/superpowers/plans/2026-07-16-ci-baseline-freeze.md`
- `scripts/ci-baseline-summary.js`
- `scripts/ci-baseline-summary.test.js`
- `.github/workflows/extensions-quality.yml`
- `.github/workflows/workflow-contracts.yml`
- `.github/workflows/code-consistency-review-scaffold.yml`
- `docs/review-findings-tracking.md`

- [ ] **Step 3: Run completion checks against fresh evidence**

Confirm all of the following from current API responses, not cached notes:

- three workflow runs are associated with the final head and all are successful;
- all ten jobs have non-empty steps;
- the baseline evidence recorded in tracking matches the Task 2 implementation commit runs;
- Task 2 to final head is documentation-only;
- no product UAT is marked complete.

- [ ] **Step 4: Hand off through the development-branch completion workflow**

Invoke `superpowers:finishing-a-development-branch`. Present merge, keep/open PR, or discard options without merging automatically. Recommend merge only when the fresh final-head checks are green.
