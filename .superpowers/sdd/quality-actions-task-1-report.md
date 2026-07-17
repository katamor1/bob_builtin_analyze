# Task 1 evidence — immutable GitHub Action pin scanner

Date: 2026-07-17  
Branch: `codex/three-extension-quality-improvements-20260717`  
Base commit verified before work: `e6edfe1d17ac0ef34438eb6c2f7fb0c35548a61b`

## Scope

- Added only `scripts/check-github-actions-pins.js` and `scripts/check-github-actions-pins.test.js` as product/test changes.
- Did not edit any workflow or action YAML.
- Used only Node built-ins (`node:assert`, `node:child_process`, `node:fs`, `node:os`, `node:path`, `node:test`).

## RED evidence

The complete acceptance/rejection/traversal/CLI test file was created before the production module.

Command:

```text
node --test scripts/check-github-actions-pins.test.js
```

Observed result: exit 1, 0 passing / 1 failing file-level test. The expected failure was:

```text
Error: Cannot find module './check-github-actions-pins.js'
code: 'MODULE_NOT_FOUND'
```

Two adversarial self-review cases were then developed as additional RED→GREEN cycles:

1. A valid plain scalar containing an apostrophe and embedded `&`, `*`, `!`, `?`, `:`, `uses:`, and `#` initially produced `AMBIGUOUS_YAML`. The focused test exited 1; scalar-start recognition was tightened, after which it passed.
2. A malformed quoted scalar with an adjacent suffix (`"closed"suffix`) initially produced no violation. The focused test exited 1; quoted-token boundary validation was added, after which it passed.
3. A line-spanning plain `uses` value initially produced `MISSING_REF`. The focused test exited 1; indented plain-continuation detection was added so it fails closed with `AMBIGUOUS_YAML`.

One test fixture was corrected during GREEN iteration: an unquoted trailing YAML space is presentation whitespace rather than scalar content, so the whitespace-rejection case was changed to a quoted scalar that actually contains the trailing space. No production behavior was weakened for this correction.

## GREEN implementation and coverage

The scanner now exports the required interfaces:

- `collectActionYamlFiles(repoRoot)`
- `auditYamlText({ filePath, text })`
- `auditRepository({ repoRoot })`
- `formatViolation(violation)`
- `main(argv)`

Implemented behavior includes:

- explicit plain/single-quoted/double-quoted/comment tokenizer states;
- single-quote doubling and the YAML double-quote escape set, including `\\x`, `\\u`, and `\\U` key escapes;
- block, quoted, flow, sequence, and compact-mapping `uses` discovery;
- exact local and lowercase 40-character external pin validation;
- stable mutable, invalid-SHA, dynamic, missing-ref, external-not-pinned, and ambiguous-YAML codes;
- fail-closed handling of multiline values, explicit/complex keys, merge keys, anchors, aliases, tags, malformed quotes/escapes, and malformed flow collections;
- sorted recursive scans of `.github/workflows` and `.github/actions` with `lstat`-based symlink exclusion;
- sanitized line-local context capped at 240 characters and bounded one-line diagnostics.

Final focused command:

```text
node --test scripts/check-github-actions-pins.test.js
```

Observed result: exit 0, 40 tests / 40 passing / 0 failing.

Syntax check:

```text
node --check scripts/check-github-actions-pins.js
```

Observed result: exit 0.

## Real repository and preservation checks

Real scan:

```text
node scripts/check-github-actions-pins.js
```

Observed result: exit 0.

```text
GitHub Actions pin audit: 3 files, 18 external references, 0 local references, 0 violations.
```

Reference/comment cross-check:

```text
rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github
rg --count-matches --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github
```

Observed counts were 11 in `extensions-quality.yml`, 4 in `code-consistency-review-scaffold.yml`, and 3 in `workflow-contracts.yml` (18 total). The output retained every original lowercase SHA and its version comment.

Preservation check:

```text
git diff e6edfe1d17ac0ef34438eb6c2f7fb0c35548a61b -- .github
```

Observed result: exit 0 with no output; all three workflows, all 18 references, and all 18 comments are unchanged.

Whitespace check:

```text
git diff --check
```

Observed result: exit 0 with no output.

## Self-review

- Confirmed the production module is guarded by `if (require.main === module)` and importing it has no CLI side effects.
- Confirmed valid punctuation inside comments, quoted scalars, plain scalars, and non-`uses` block scalars does not create false references.
- Confirmed expressions embedded in ordinary workflow values do not perturb flow tracking, while expressions in `uses` produce `DYNAMIC_REF`.
- Confirmed invalid references are still returned in `references` for auditable aggregate counts.
- Confirmed diagnostics use only the offending line and cannot disclose a secret placed on another line.
- Confirmed file and directory symlinks under both policy roots are excluded rather than followed.
- Confirmed no dependency, workflow, package manifest, or unrelated repository file was changed.

Concerns: none.

## Review-finding follow-up — 2026-07-17

Follow-up base commit: `ffc8a9471dae05b7863d55c9605df8f2451f4d73`

### Systematic root-cause analysis

All three reports were reproduced directly through `auditYamlText` before changing tests or production code:

- The valid block-scalar fixture with a mutable sibling returned `{ references: [], violations: [] }`; the pinned-sibling variant did the same.
- The CR-only fixture returned `{ references: [], violations: [] }`.
- `--- &root`, `--- !`, and `--- !custom` returned no ambiguity violation, while a standalone `---` followed by a mutable `uses` on the next line was still audited.

Tracing those inputs through the tokenizer isolated three independent causes:

1. **Block-scalar sibling bypass:** the block-scalar skip boundary stored the physical line indentation. For `  - name: |`, that was column 2, although sibling mapping keys begin at column 4 after the sequence marker. Consequently both six-space scalar content and the valid four-space `uses` sibling satisfied `indentation > 2` and were skipped. The existing `segmentStart` value already represented the mapping-key/sequence-item parent boundary.
2. **CR-only lines:** logical lines were formed with `text.replace(/\r\n/g, "\n").split("\n")`. A document containing only `\r` separators therefore remained one physical string; later colons were not considered from a fresh mapping-key start and `uses` was never classified.
3. **Document-start indicators:** token starts were initialized at column 0. For `--- &root` and `--- !`, the scanner ignored the three marker dashes but never advanced the token start past `---`, leaving the anchor/tag indicator invisible to `classifyTokenIndicator`. The same cause hid a same-line `uses` mapping after a document marker.

### RED evidence

Five regressions were added before any production edit: mutable and pinned block-scalar siblings (including `|2-` and a fake `uses` inside scalar content), LF/CRLF/CR parity, same-line document anchors/bare/named tags, and normal/same-line document content.

Command:

```text
node --test --test-name-pattern='^regression:' scripts/check-github-actions-pins.test.js
```

Observed result: exit 1, 5 tests / 0 passing / 5 failing.

- Both block-scalar tests reported `0 !== 1` references.
- The line-ending test failed specifically for `"\r"` with `0 !== 1` references; its LF and CRLF iterations had passed before reaching that assertion.
- The document-indicator test received `[]` instead of line-1 `AMBIGUOUS_YAML` for `&root`.
- The normal-document test reported `0 !== 1` references for `--- uses: actions/checkout@main`.

### Minimal fixes and GREEN evidence

The causes were fixed independently:

1. Store `segmentStart` as the block-scalar skip boundary rather than physical leading indentation.
2. Split logical lines with `/\r\n|[\n\r]/`, handling CRLF as one separator and LF/CR as individual separators.
3. For a column-zero `---` followed by legal separation, advance `segmentStart` to the same-line document node before sequence and mapping analysis.

Focused GREEN commands and observations:

```text
node --test --test-name-pattern='^regression: .*block scalar' scripts/check-github-actions-pins.test.js
```

Exit 0; 2/2 passed. The `|2-` content `uses` remained skipped and only the pinned sibling was returned.

```text
node --test --test-name-pattern='^regression: LF, CRLF, and CR-only' scripts/check-github-actions-pins.test.js
```

Exit 0; 1/1 passed with identical line-3 `MUTABLE_REF` results for LF, CRLF, and CR.

```text
node --test --test-name-pattern='^regression: (document-start|a normal document start)' scripts/check-github-actions-pins.test.js
```

Exit 0; 2/2 passed. Anchors, bare tags, and named tags fail closed; standalone and same-line document content remains auditable.

Combined regression command:

```text
node --test --test-name-pattern='^regression:' scripts/check-github-actions-pins.test.js
```

Observed result: exit 0, 5 tests / 5 passing / 0 failing.

### Final verification

```text
node --check scripts/check-github-actions-pins.js
node --test scripts/check-github-actions-pins.test.js
node scripts/check-github-actions-pins.js
test "$(rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github | wc -l)" -eq 18
test -z "$(git diff ffc8a9471dae05b7863d55c9605df8f2451f4d73 -- .github)"
git diff --check
```

Observed result: every command exited 0. The focused suite passed 45/45; the real scan reported 3 files, 18 external references, 0 local references, and 0 violations. The exact pin count remained 18, workflow diffs remained empty (preserving every SHA/comment), and the whitespace check produced no output.

Follow-up concerns: none.

## Second review-finding follow-up — 2026-07-17

Follow-up base commit: `789dc9ee304c6762d6442e2e12ed5c4283ddabca`

### Systematic root-cause analysis

Both reports were reproduced through `auditYamlText` before any new test or production change:

- A BOM-prefixed `--- &root` and BOM-prefixed `--- !` each returned the pinned line-2 reference but no violation.
- The exact nested standalone scalar fixture returned the apparent line-4 `uses` as a reference plus `MUTABLE_REF`.
- Root `|` content and a standalone sequence `>2-` produced the same false reference/violation behavior.

Tracing the tokenizer state isolated two independent gaps:

1. **BOM document-marker bypass:** U+FEFF remained at string/line column 0. The document-marker branch requires `line.startsWith("---", 0)`, so it did not advance `segmentStart`; the token-start set contained the BOM rather than the same-line anchor/tag. A BOM has no line-break semantics, so removing one U+FEFF only when it is the first code point preserves all existing line numbers and LF/CRLF/CR splitting.
2. **Standalone scalar false positive:** block-scalar state was created only inside the mapping-colon branch. Root and sequence scalar nodes have no mapping colon, so their indented content was tokenized as YAML structure. For a standalone sequence scalar, the correct state boundary is the last sequence-marker column: content is more indented than that boundary, while a sibling sequence item is not. For a root/nested standalone scalar without a sequence marker, physical node indentation is the correct parent boundary. Mapping-value block scalars continue to use their mapping-key boundary.

### RED evidence

Four new test groups were added before production edits. They cover BOM + anchor/bare tag/named tag across LF, CRLF, and CR; the exact nested fixture; root `|`; `|-` and `>2-` sequence scalars; fake mutable `uses` text in scalar content; and pinned sequence/mapping siblings that prove scanning resumes.

Command:

```text
node --test --test-name-pattern='^second regression:' scripts/check-github-actions-pins.test.js
```

Observed result: exit 1, 4 tests / 0 passing / 4 failing.

- The BOM test received no line-1 ambiguity violation for `&root`.
- The nested and root standalone tests each returned the scalar-content `uses` reference plus `MUTABLE_REF` instead of empty results.
- The modifier/sibling test retained the scalar-content `MUTABLE_REF` instead of only the pinned sibling.

### Minimal fixes and GREEN evidence

The fixes were applied independently:

1. Create `normalizedText` by slicing exactly one leading U+FEFF when present, then retain the existing `/\r\n|[\n\r]/` logical-line split.
2. Recognize a valid `|`/`>` header at the current standalone node start. Track the last leading sequence-marker column as its parent boundary, or use node indentation when there is no sequence marker. Invalid standalone block headers still emit `AMBIGUOUS_YAML`; mapping-value headers retain their existing validation and `uses: |` remains fail-closed.

Focused GREEN commands:

```text
node --test --test-name-pattern='^second regression: a single leading BOM' scripts/check-github-actions-pins.test.js
```

Observed result: exit 0, 1/1 passed.

```text
node --test --test-name-pattern='^second regression: (nested|root|standalone)' scripts/check-github-actions-pins.test.js
```

Observed result: exit 0, 3/3 passed.

Mapping-scalar/fail-closed guard command:

```text
node --test --test-name-pattern='^(second regression:|regression: .*block scalar|fails closed for (literal|folded))' scripts/check-github-actions-pins.test.js
```

Observed result: exit 0, 10/10 passed. This includes the prior mapping-value sibling tests and all four `uses: |`/`>` fail-closed cases.

### Final verification

```text
node --check scripts/check-github-actions-pins.js
node --test scripts/check-github-actions-pins.test.js
node scripts/check-github-actions-pins.js
test "$(rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github | wc -l)" -eq 18
git diff 789dc9ee304c6762d6442e2e12ed5c4283ddabca -- .github
git diff --check
```

Observed result: every command exited 0. The focused suite passed 49/49; the real scan reported 3 files, 18 external references, 0 local references, and 0 violations. Reference counts remained 11 + 4 + 3, the workflow diff was empty (preserving all pins/comments), and the whitespace check produced no output.

Second follow-up concerns: none.

## Third and final review-finding follow-up — 2026-07-17

Follow-up base commit: `ba20526302a046511a8df3bccb42223348a0db77`

### Systematic root-cause analysis

The reported Actions-shaped block plain scalars were reproduced before test or production changes:

- `run: echo [`, `run: echo {`, `run: echo ]`, `run: echo }`, and `run: echo [{]}` each returned line-1 `AMBIGUOUS_YAML` despite containing no action reference.
- `value: [one, two` correctly returned line-1 `AMBIGUOUS_YAML`.
- A balanced flow sequence of maps still returned its pinned external and local nested `uses` references with no violations.

Tracing the loop showed that every unquoted `[`/`{` pushed `flowStack` and every `]`/`}` attempted a pop, regardless of its YAML position. The tokenizer already maintained the missing discriminator: `tokenStarts` contains the current root/sequence node start, mapping-value start, and flow-entry start before each relevant character is visited. In `run: echo [`, the value node starts at `e`, not at `[`, so the bracket is block plain-scalar data. In `value: [one`, `[` is exactly the mapping-value token start and must open a flow node. Inside an already active flow, indicators remain structural regardless of the outer block position.

This supported a bounded position gate rather than a parser redesign; the full focused suite exposed no third-order architectural failure.

### RED evidence

Before production edits, six Actions-shaped block plain cases were added for `[`, `{`, `]`, `}`, mismatched embedded combinations, and balanced embedded combinations. A paired guard covers unbalanced flow at a value-node start, a closer at a value-node start, and balanced nested flow maps with both external and local `uses`. The older “unexpected closer” fixture was corrected from valid embedded block data (`value: one ]`) to an actual node-start closer (`value: ]`).

Command:

```text
node --test --test-name-pattern='^third regression:' scripts/check-github-actions-pins.test.js
```

Observed result: exit 1, 7 tests / 2 passing / 5 failing.

- The four single-indicator commands and mismatched embedded combination each returned `AMBIGUOUS_YAML` instead of an empty audit.
- The already-balanced embedded combination passed, confirming the old behavior depended on accidental stack balance.
- The structural guard passed before the fix: node-start unbalanced/closing forms were ambiguous and balanced nested `uses` references were found.

### Minimal fix and GREEN evidence

Flow handling now uses existing tokenizer state:

- Outside an active flow, `[`/`{` starts a collection only when its column is in `tokenStarts`; otherwise it is ordinary block plain-scalar data.
- Inside an active flow, open and close indicators retain their structural behavior.
- Outside an active flow, `]`/`}` emits `AMBIGUOUS_YAML` only at a token/node start; an embedded closer remains block plain-scalar data.
- Quoted/expression masking, flow maps/sequences, compact mappings, mismatch handling, and EOF unbalanced-flow handling were not changed.

Focused GREEN command:

```text
node --test --test-name-pattern='^third regression:' scripts/check-github-actions-pins.test.js
```

Observed result: exit 0, 7/7 passed.

### Final verification

```text
node --check scripts/check-github-actions-pins.js
node --test scripts/check-github-actions-pins.test.js
node scripts/check-github-actions-pins.js
test "$(rg -n --glob '*.yml' --glob '*.yaml' '^\s*(?:-\s*)?uses\s*:' .github | wc -l)" -eq 18
git diff ba20526302a046511a8df3bccb42223348a0db77 -- .github
git diff --check
```

Observed result: every command exited 0. The focused suite passed 56/56; the real scan reported 3 files, 18 external references, 0 local references, and 0 violations. Reference counts remained 11 + 4 + 3, the workflow diff was empty (preserving every SHA/comment), and the whitespace check produced no output.

Third follow-up concerns: none.
