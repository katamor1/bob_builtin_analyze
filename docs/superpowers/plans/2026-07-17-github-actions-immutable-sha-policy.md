# GitHub Actions Immutable SHA Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that every external GitHub Actions `uses:` reference in current and future repository workflows/actions is pinned to a lowercase 40-character commit SHA, with fail-closed YAML auditing and a pre-install CI gate.

**Architecture:** Add a dependency-free Node.js tokenizer/auditor that recognizes directly auditable YAML `uses` mappings and rejects syntax that can obscure a key or value. Reuse the permanent `extensions-quality` workflow's existing metrics job as the repository policy gate so the 18-reference baseline does not gain another checkout action, then make every dependency-installing job wait for that gate.

**Tech Stack:** Node.js built-ins (`fs`, `path`, `node:test`, `assert`), GitHub Actions YAML, no added dependency.

## Global Constraints

- Baseline: 18 external `uses:` references across 3 workflow files, all lowercase 40-character SHAs.
- Preserve all 18 references and comments; no upstream SHA update is expected.
- Permit repository-local `uses: ./...` only.
- Reject tags, branches, abbreviated/uppercase SHAs, expressions/dynamic refs, missing refs, and audit-ambiguous YAML.
- Recursively inspect `.github/workflows` and `.github/actions` for `.yml` and `.yaml`.
- Parsing is dependency-free and fail-closed; a line-only regular expression is not a parser.
- Diagnostics contain file, line, rule code, and bounded sanitized context only.
- CI tests the scanner and scans the real repository before dependency installation.
- Push and pull-request paths cover scanner source/tests and every workflow/action YAML.
- Each task ends with focused verification, `git diff --check`, and a commit.

---

## Repository baseline and file map

Confirm before editing:

```bash
rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github
```

Expected: 18 references in:

- `.github/workflows/extensions-quality.yml`
- `.github/workflows/workflow-contracts.yml`
- `.github/workflows/code-consistency-review-scaffold.yml`

Planned files:

- Create: `scripts/check-github-actions-pins.js`
- Create: `scripts/check-github-actions-pins.test.js`
- Create: `scripts/check-github-actions-pins-ci-contract.test.js`
- Modify: `.github/workflows/extensions-quality.yml`

## Task 1: Build the dependency-free scanner with TDD

**Files:**

- Create: `scripts/check-github-actions-pins.js`
- Create: `scripts/check-github-actions-pins.test.js`

**Interfaces:**

```js
collectActionYamlFiles(repoRoot) // sorted absolute YAML paths
auditYamlText({ filePath, text }) // { references, violations }
auditRepository({ repoRoot }) // aggregate result
formatViolation(violation) // bounded one-line output
main(argv) // numeric exit code
```

A reference is `{ filePath, line, target, local, context }`; a violation is `{ filePath, line, code, message, context }`. `main([])` scans both policy roots relative to `process.cwd()`.

- [ ] **Step 1: Write RED accepted-form tests**

Use `node:test`, temporary repository roots, and fixture strings. Accept:

The accepted regression set explicitly covers normal block style, quoted keys/values, flow maps and sequences, compact mappings, and key escapes (`\\x`, `\\u`, `\\U`).

```yaml
steps:
  - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
  - 'uses': 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'
  - uses: ./.github/actions/local-check
flow: [{ "uses": "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5" }]
compact: [uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5]
note: 'uses: owner/action@main & * ! ? is ordinary text here'
```

Also accept quoted keys that decode to `uses` through `\\x`, `\\u`, and `\\U` escapes. Assert comments and ordinary scalar values containing `&`, `*`, `!`, `?`, `:`, or `uses:` do not become false positives.

- [ ] **Step 2: Write RED mutable/invalid-reference tests**

Table-drive these exact categories:

```js
[
  ["actions/checkout@v4", "MUTABLE_REF"],
  ["actions/checkout@main", "MUTABLE_REF"],
  ["actions/checkout@34e1148", "INVALID_SHA"],
  ["actions/checkout@34E114876B0B11C390A56381AD16EBD13914F8D5", "INVALID_SHA"],
  ["actions/checkout@${{ github.ref }}", "DYNAMIC_REF"],
  ["actions/checkout", "MISSING_REF"],
  ["docker://node:22", "EXTERNAL_NOT_PINNED"]
]
```

Assert external values must be `owner/repository@<sha>` or `owner/repository/path@<sha>`, while local values must start with `./`.

- [ ] **Step 3: Write RED fail-closed YAML tests**

Cover:

- literal/folded multiline `uses` values (`|`, `>`, chomping/indent modifiers);
- multiline quoted values;
- explicit keys (`? uses` followed by `:`);
- indirect/complex keys in block and flow form;
- mapping merge/key indirection (`<<`);
- anchors and aliases;
- named tags and bare `!`;
- unterminated quotes, invalid escapes, and unbalanced flow collections.

For every rejection assert 1-based line, stable code, and bounded context. Put a secret on a different line and assert `formatViolation()` never includes it.

- [ ] **Step 4: Run RED**

```bash
node --test scripts/check-github-actions-pins.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND` for `scripts/check-github-actions-pins.js`.

- [ ] **Step 5: Implement scalar decoding and tokenizer state**

Use explicit states:

```js
const State = Object.freeze({
  PLAIN: "plain",
  SINGLE_QUOTED: "single-quoted",
  DOUBLE_QUOTED: "double-quoted",
  COMMENT: "comment"
})
```

Track line/column, indentation, flow depth, mapping-key expectation, and sequence-item starts. Decode doubled single quotes and YAML double-quoted escapes, including `\xNN`, `\uNNNN`, and `\UNNNNNNNN`, before comparing a key with `uses`.

The tokenizer must recognize block mappings/sequences, quoted equivalents, flow maps/sequences, and compact mappings. Treat `#` as a comment only outside quotes at a legal scalar boundary and `:` as a key delimiter only in mapping position. Reject line-spanning `uses`, explicit/complex keys, merge keys, anchors, aliases, and tags that can decorate/construct mappings. Any unclassified or malformed state emits `AMBIGUOUS_YAML`; never silently skip it.

- [ ] **Step 6: Implement immutable-reference validation**

After scalar decoding, use exact validation:

```js
const PINNED_EXTERNAL = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/
const LOCAL_ACTION = /^\.\/[A-Za-z0-9._/-]+$/
```

Reject whitespace/control characters, expressions, missing repository/ref segments, and non-local values that fail `PINNED_EXTERNAL`. Keep the rule codes from the RED matrix stable.

- [ ] **Step 7: Implement recursive scanning and bounded CLI output**

Walk only these roots when present, never following symbolic links:

```js
[
  path.join(repoRoot, ".github", "workflows"),
  path.join(repoRoot, ".github", "actions")
]
```

Sort entries/paths, ignore non-YAML files, sanitize control characters, and cap context at 240 characters. Export functions and invoke `main()` only under `if (require.main === module)`.

Success output records file/external/local counts. Violations use:

```text
<relative-file>:<line> [<code>] <message> | <bounded-context>
```

Exit `0` only if parsing and reference validation both succeed; otherwise exit `1`.

- [ ] **Step 8: Verify GREEN and the real baseline**

```bash
node --test scripts/check-github-actions-pins.test.js
node scripts/check-github-actions-pins.js
rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github
git diff --check
```

Expected: tests PASS; real scan reports 3 files / 18 external references / 0 violations; `rg` shows the same SHAs/comments; diff check exits 0.

- [ ] **Step 9: Commit Task 1**

```bash
git add scripts/check-github-actions-pins.js scripts/check-github-actions-pins.test.js
git commit -m "test: enforce immutable GitHub Action pins"
```

## Task 2: Integrate the permanent CI gate and mutation contracts

**Files:**

- Create: `scripts/check-github-actions-pins-ci-contract.test.js`
- Modify: `.github/workflows/extensions-quality.yml`

**Interfaces:**

- Consumes: Task 1's scanner API/CLI.
- Produces: a `repository-policy` job that succeeds before any `npm ci` or `npm install` job begins.
- Preserves: all 18 external `uses:` lines and comments.

- [ ] **Step 1: Write RED trigger-path mutation tests**

The test reads `.github/workflows/extensions-quality.yml` and requires these entries under both `pull_request.paths` and `push.paths`:

```js
const requiredPaths = [
  "scripts/check-github-actions-pins.js",
  "scripts/check-github-actions-pins.test.js",
  "scripts/check-github-actions-pins-ci-contract.test.js",
  ".github/workflows/**",
  ".github/actions/**"
]
```

Remove each path from each trigger in memory, one mutation at a time, and assert the same contract helper throws. The unchanged workflow must pass.

- [ ] **Step 2: Write RED gate-order mutation tests**

Require both commands in `repository-policy`, in this order and before any install:

```yaml
- run: node --test scripts/check-github-actions-pins.test.js scripts/check-github-actions-pins-ci-contract.test.js
- run: node scripts/check-github-actions-pins.js
```

Require `needs: repository-policy` on every job containing `npm ci` or `npm install`. Mutation-test removal of each `needs`, insertion of install before either gate command, swapping the real scan after install, and deletion of either policy command. Every mutation must fail.

Also call `auditRepository({ repoRoot })` and assert zero violations, exactly 18 external references, and exactly 3 distinct files.

Run:

```bash
node --test scripts/check-github-actions-pins-ci-contract.test.js
```

Expected: FAIL before workflow integration.

- [ ] **Step 3: Convert the existing metrics job into `repository-policy`**

Rename `extension-metrics` to `repository-policy` and remove its job-level pull-request-only `if`. Keep its existing checkout pin so no nineteenth `uses:` is added. Immediately after checkout, before Setup Node.js/install, add:

```yaml
      - name: Test immutable Action SHA policy
        run: node --test scripts/check-github-actions-pins.test.js scripts/check-github-actions-pins-ci-contract.test.js

      - name: Scan repository Action references
        run: node scripts/check-github-actions-pins.js
```

Retain metrics only for pull requests by adding `if: github.event_name == 'pull_request'` to Setup Node.js and every metrics-only step. Keep the existing setup-node/github-script pins unchanged.

Add `needs: repository-policy` to `workflow-register`, `bob-bazaar-review`, `bob-code-consistency-review`, and `windows-smoke`; these jobs install dependencies. Do not add installation to `repository-policy`.

- [ ] **Step 4: Expand both path filters**

Add the five exact `requiredPaths` entries to both triggers. Keep extension paths. Replace the single workflow path with `.github/workflows/**` and add `.github/actions/**` so future workflows/composite actions cannot bypass the policy.

- [ ] **Step 5: Verify GREEN, mutations, ordering, and baseline**

```bash
node --test \
  scripts/check-github-actions-pins.test.js \
  scripts/check-github-actions-pins-ci-contract.test.js
node scripts/check-github-actions-pins.js
rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github
git diff --check
```

Expected: both suites PASS including trigger/order mutations; real scan PASS; exactly 18 refs remain in 3 files; diff check exits 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add .github/workflows/extensions-quality.yml scripts/check-github-actions-pins-ci-contract.test.js
git commit -m "ci: gate mutable GitHub Action references"
```

## Final acceptance

```bash
node --test \
  scripts/check-github-actions-pins.test.js \
  scripts/check-github-actions-pins-ci-contract.test.js
node scripts/check-github-actions-pins.js
git diff --check
git status --short
```

Acceptance requires both suites and real scan to pass, an 18-reference/3-file result, unchanged pin/comments, clean diff check, and only planned files in status.
