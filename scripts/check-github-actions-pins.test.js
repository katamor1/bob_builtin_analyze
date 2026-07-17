"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  auditRepository,
  auditYamlText,
  collectActionYamlFiles,
  formatViolation,
  main,
} = require("./check-github-actions-pins.js");

const CHECKOUT_SHA = "34e114876b0b11c390a56381ad16ebd13914f8d5";
const SETUP_NODE_SHA = "49933ea5288caeca8642d1e84afbd3f7d6820020";

function audit(text, filePath = "/repo/.github/workflows/test.yml") {
  return auditYamlText({ filePath, text });
}

function makeRepository(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "action-pin-audit-"));
  t.after(() => fs.rmSync(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

function writeFile(repoRoot, relativePath, text) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  return filePath;
}

test("accepts block, quoted, flow, compact, local, and escaped-key uses forms", () => {
  const text = String.raw`steps:
  - uses: actions/checkout@${CHECKOUT_SHA} # v4
  - 'uses': 'actions/setup-node@${SETUP_NODE_SHA}'
  - uses: ./.github/actions/local-check
flow: [{ "uses": "actions/checkout@${CHECKOUT_SHA}" }]
compact: [uses: actions/checkout@${CHECKOUT_SHA}]
key-escapes:
  - "\x75ses": "actions/checkout@${CHECKOUT_SHA}"
  - "\u0075ses": ./.github/actions/local-check
  - "\U00000075ses": owner/repository/sub/path@${CHECKOUT_SHA}
note: 'uses: owner/action@main & * ! ? is ordinary text here'
symbols: "& * ! ? : uses: owner/action@main"
script: |
  echo "uses: owner/action@main & * ! ? <<"
# uses: actions/checkout@main
`;

  const result = audit(text);

  assert.deepEqual(result.violations, []);
  assert.equal(result.references.length, 8);
  assert.equal(result.references.filter(({ local }) => local).length, 2);
  assert.equal(result.references[0].line, 2);
  assert.equal(result.references[0].context, `  - uses: actions/checkout@${CHECKOUT_SHA} # v4`);
  assert.equal(result.references.at(-1).target, `owner/repository/sub/path@${CHECKOUT_SHA}`);
});

test("decodes YAML quoted scalar values without treating scalar punctuation as syntax", () => {
  const text = String.raw`steps:
  - uses: "owner/repo@${CHECKOUT_SHA}"
  - 'uses': 'owner/repo/path@${CHECKOUT_SHA}'
ordinary:
  single: 'it''s not a uses: key & * ! ?'
  double: "escaped colon \x3a and hash \u0023 and question \U0000003f"
`;

  const result = audit(text);

  assert.deepEqual(result.violations, []);
  assert.deepEqual(
    result.references.map(({ target }) => target),
    [`owner/repo@${CHECKOUT_SHA}`, `owner/repo/path@${CHECKOUT_SHA}`],
  );
});

test("accepts punctuation embedded in ordinary plain scalars", () => {
  const result = audit(
    "note: it's ordinary & * ! ? with foo:bar and uses:value and value#fragment\n",
  );

  assert.deepEqual(result, { references: [], violations: [] });
});

test("regression: block scalar content does not hide a mutable sibling uses key", () => {
  const result = audit(
    "steps:\n  - name: |\n      Checkout\n    uses: actions/checkout@main\n",
  );

  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].line, 4);
  assert.equal(result.references[0].target, "actions/checkout@main");
  assert.deepEqual(result.violations.map(({ code }) => code), ["MUTABLE_REF"]);
});

test("regression: modified block scalar skips content but audits a pinned sibling", () => {
  const result = audit(
    `steps:\n  - name: |2-\n      Checkout\n      uses: actions/checkout@main\n    uses: actions/checkout@${CHECKOUT_SHA}\n`,
  );

  assert.deepEqual(result.violations, []);
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].line, 5);
  assert.equal(result.references[0].target, `actions/checkout@${CHECKOUT_SHA}`);
});

test("regression: LF, CRLF, and CR-only documents audit the same logical uses line", () => {
  for (const lineBreak of ["\n", "\r\n", "\r"]) {
    const text = ["name: x", "steps:", "  - uses: actions/checkout@main", ""].join(lineBreak);
    const result = audit(text);

    assert.equal(result.references.length, 1, JSON.stringify(lineBreak));
    assert.equal(result.references[0].line, 3, JSON.stringify(lineBreak));
    assert.deepEqual(
      result.violations.map(({ code, line }) => ({ code, line })),
      [{ code: "MUTABLE_REF", line: 3 }],
      JSON.stringify(lineBreak),
    );
  }
});

test("regression: document-start anchors and tags remain visible to the auditor", () => {
  for (const indicator of ["&root", "!", "!custom"]) {
    const result = audit(`--- ${indicator}\n`);

    assert.deepEqual(
      result.violations.map(({ code, line }) => ({ code, line })),
      [{ code: "AMBIGUOUS_YAML", line: 1 }],
      indicator,
    );
  }
});

test("regression: a normal document start preserves subsequent and same-line uses auditing", () => {
  for (const text of [
    "---\nuses: actions/checkout@main\n",
    "--- uses: actions/checkout@main\n",
  ]) {
    const result = audit(text);

    assert.equal(result.references.length, 1, JSON.stringify(text));
    assert.equal(result.references[0].target, "actions/checkout@main", JSON.stringify(text));
    assert.deepEqual(result.violations.map(({ code }) => code), ["MUTABLE_REF"]);
  }
});

test("second regression: a single leading BOM preserves document-start anchor and tag auditing", () => {
  for (const [indicator, lineBreak] of [
    ["&root", "\n"],
    ["!", "\n"],
    ["!custom", "\n"],
    ["&root", "\r\n"],
    ["&root", "\r"],
  ]) {
    const text = `\uFEFF--- ${indicator}${lineBreak}uses: actions/checkout@${CHECKOUT_SHA}${lineBreak}`;
    const result = audit(text);

    assert.equal(result.references.length, 1, `${indicator} ${JSON.stringify(lineBreak)}`);
    assert.equal(result.references[0].line, 2, `${indicator} ${JSON.stringify(lineBreak)}`);
    assert.deepEqual(
      result.violations.map(({ code, line }) => ({ code, line })),
      [{ code: "AMBIGUOUS_YAML", line: 1 }],
      `${indicator} ${JSON.stringify(lineBreak)}`,
    );
  }
});

test("second regression: nested standalone block scalar content is opaque", () => {
  const result = audit(
    "matrix:\n  values:\n    - |\n      uses: actions/checkout@main\n",
  );

  assert.deepEqual(result, { references: [], violations: [] });
});

test("second regression: root standalone block scalar content is opaque", () => {
  const result = audit("|\n  uses: actions/checkout@main\n");

  assert.deepEqual(result, { references: [], violations: [] });
});

test("second regression: standalone sequence scalar modifiers skip content and resume siblings", () => {
  const sequenceSibling = audit(
    `steps:\n  - |-\n    uses: actions/checkout@main\n  - uses: actions/checkout@${CHECKOUT_SHA}\n`,
  );
  assert.deepEqual(sequenceSibling.violations, []);
  assert.deepEqual(
    sequenceSibling.references.map(({ line, target }) => ({ line, target })),
    [{ line: 4, target: `actions/checkout@${CHECKOUT_SHA}` }],
  );

  const mappingSibling = audit(
    `matrix:\n  values:\n    - >2-\n      uses: actions/checkout@main\n  uses: actions/checkout@${CHECKOUT_SHA}\n`,
  );
  assert.deepEqual(mappingSibling.violations, []);
  assert.deepEqual(
    mappingSibling.references.map(({ line, target }) => ({ line, target })),
    [{ line: 5, target: `actions/checkout@${CHECKOUT_SHA}` }],
  );
});

for (const command of [
  "echo [",
  "echo {",
  "echo ]",
  "echo }",
  "echo [{]}",
  "echo [left] {right}",
]) {
  test(`third regression: block plain scalar treats ${JSON.stringify(command)} as data`, () => {
    const result = audit(`run: ${command}\n`);

    assert.deepEqual(result, { references: [], violations: [] });
  });
}

test("third regression: flow-node starts stay structural and balanced flows audit nested uses", () => {
  const unbalanced = audit("value: [one, two\n");
  assert.deepEqual(
    unbalanced.violations.map(({ code, line }) => ({ code, line })),
    [{ code: "AMBIGUOUS_YAML", line: 1 }],
  );

  const nodeStartCloser = audit("value: ]\n");
  assert.deepEqual(
    nodeStartCloser.violations.map(({ code, line }) => ({ code, line })),
    [{ code: "AMBIGUOUS_YAML", line: 1 }],
  );

  const balanced = audit(
    `steps: [{ uses: actions/checkout@${CHECKOUT_SHA} }, { uses: ./local/action }]\n`,
  );
  assert.deepEqual(balanced.violations, []);
  assert.deepEqual(
    balanced.references.map(({ target, local }) => ({ target, local })),
    [
      { target: `actions/checkout@${CHECKOUT_SHA}`, local: false },
      { target: "./local/action", local: true },
    ],
  );
});

const invalidReferenceCases = [
  ["actions/checkout@v4", "MUTABLE_REF"],
  ["actions/checkout@main", "MUTABLE_REF"],
  ["actions/checkout@34e1148", "INVALID_SHA"],
  ["actions/checkout@34E114876B0B11C390A56381AD16EBD13914F8D5", "INVALID_SHA"],
  ["actions/checkout@${{ github.ref }}", "DYNAMIC_REF"],
  ["actions/checkout", "MISSING_REF"],
  ["docker://node:22", "EXTERNAL_NOT_PINNED"],
];

for (const [target, code] of invalidReferenceCases) {
  test(`rejects ${JSON.stringify(target)} with ${code}`, () => {
    const result = audit(`steps:\n  - uses: ${target}\n`);

    assert.equal(result.references.length, 1);
    assert.equal(result.references[0].target, target);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, code);
    assert.equal(result.violations[0].line, 2);
  });
}

test("only accepts external owner/repository paths and explicit local paths", () => {
  const accepted = audit(
    `steps:\n  - uses: owner/repository/path/to/action@${CHECKOUT_SHA}\n  - uses: ./relative/action\n`,
  );
  assert.deepEqual(accepted.violations, []);
  assert.deepEqual(accepted.references.map(({ local }) => local), [false, true]);

  for (const [target, expectedCode] of [
    [`owner/@${CHECKOUT_SHA}`, "EXTERNAL_NOT_PINNED"],
    [`/repository@${CHECKOUT_SHA}`, "EXTERNAL_NOT_PINNED"],
    [`owner/repository//action@${CHECKOUT_SHA}`, "EXTERNAL_NOT_PINNED"],
    [`"owner/repository@${CHECKOUT_SHA} "`, "EXTERNAL_NOT_PINNED"],
    ["../relative/action", "MISSING_REF"],
    [".github/actions/not-explicitly-local", "MISSING_REF"],
    ["./", "EXTERNAL_NOT_PINNED"],
    ["./relative action", "EXTERNAL_NOT_PINNED"],
  ]) {
    const result = audit(`uses: ${target}\n`);
    assert.equal(result.violations.length, 1, target);
    assert.equal(result.violations[0].code, expectedCode, target);
  }
});

const ambiguousYamlCases = [
  ["literal multiline uses", `uses: |\n  actions/checkout@${CHECKOUT_SHA}\n`, 1],
  ["literal chomping uses", `uses: |2-\n  actions/checkout@${CHECKOUT_SHA}\n`, 1],
  ["folded multiline uses", `uses: >\n  actions/checkout@${CHECKOUT_SHA}\n`, 1],
  ["folded chomping uses", `uses: >+\n  actions/checkout@${CHECKOUT_SHA}\n`, 1],
  ["multiline double quote", `uses: "actions/checkout@\n  ${CHECKOUT_SHA}"\n`, 1],
  ["multiline single quote", `uses: 'actions/checkout@\n  ${CHECKOUT_SHA}'\n`, 1],
  ["multiline plain value", `uses: actions/checkout@\n  ${CHECKOUT_SHA}\n`, 1],
  ["explicit block key", `? uses\n: actions/checkout@${CHECKOUT_SHA}\n`, 1],
  ["complex block key", `? [uses, other]\n: actions/checkout@${CHECKOUT_SHA}\n`, 1],
  ["explicit flow key", `{ ? uses : actions/checkout@${CHECKOUT_SHA} }\n`, 1],
  ["complex flow key", `{ [uses, other]: actions/checkout@${CHECKOUT_SHA} }\n`, 1],
  ["mapping merge", `object:\n  <<: { name: value }\n`, 2],
  ["anchor", `value: &shared ordinary\n`, 1],
  ["alias", `value: *shared\n`, 1],
  ["named tag", `value: !custom ordinary\n`, 1],
  ["bare tag", `value: ! ordinary\n`, 1],
  ["unterminated single quote", `value: 'unterminated\n`, 1],
  ["unterminated double quote", `value: "unterminated\n`, 1],
  ["invalid double-quote escape", String.raw`value: "bad\qescape"` + "\n", 1],
  ["quoted scalar with an adjacent suffix", `value: "closed"suffix\n`, 1],
  ["unbalanced flow sequence", `value: [one, two\n`, 1],
  ["unbalanced flow mapping", `value: { one: two\n`, 1],
  ["unexpected flow closer at a node start", `value: ]\n`, 1],
];

for (const [name, text, expectedLine] of ambiguousYamlCases) {
  test(`fails closed for ${name}`, () => {
    const result = audit(text);

    assert.ok(result.violations.length >= 1);
    const violation = result.violations[0];
    assert.equal(violation.code, "AMBIGUOUS_YAML");
    assert.equal(violation.line, expectedLine);
    assert.ok(violation.context.length <= 240);
    assert.doesNotMatch(violation.context, /[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u);
  });
}

test("diagnostics are one line, control-character sanitized, bounded, and line-local", () => {
  const secret = "SUPER_SECRET_DO_NOT_PRINT";
  const longTarget = `actions/checkout@main${"x".repeat(400)}\u0001`;
  const result = audit(`uses: ${longTarget}\npassword: ${secret}\n`);

  assert.equal(result.violations.length, 1);
  const output = formatViolation(result.violations[0]);
  assert.ok(output.length < 600);
  assert.doesNotMatch(output, /[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u);
  assert.ok(result.violations[0].context.length <= 240);
  assert.equal(output.includes(secret), false);
});

test("collectActionYamlFiles scans both policy roots recursively and never follows symlinks", (t) => {
  const repoRoot = makeRepository(t);
  const expected = [
    writeFile(repoRoot, ".github/actions/nested/action.yml", "name: local\n"),
    writeFile(repoRoot, ".github/workflows/a.yml", "name: a\n"),
    writeFile(repoRoot, ".github/workflows/z.yaml", "name: z\n"),
  ].sort();
  writeFile(repoRoot, ".github/workflows/ignored.txt", "uses: actions/checkout@main\n");
  const outside = writeFile(repoRoot, "outside/hidden.yml", "uses: actions/checkout@main\n");
  fs.symlinkSync(outside, path.join(repoRoot, ".github/workflows/symlink.yml"));
  fs.symlinkSync(
    path.dirname(outside),
    path.join(repoRoot, ".github/actions/symlink-directory"),
    "dir",
  );

  assert.deepEqual(collectActionYamlFiles(repoRoot), expected);
});

test("auditRepository aggregates sorted files, references, violations, and counts", (t) => {
  const repoRoot = makeRepository(t);
  writeFile(
    repoRoot,
    ".github/workflows/a.yml",
    `steps:\n  - uses: owner/repository@${CHECKOUT_SHA}\n  - uses: ./local/action\n`,
  );
  writeFile(repoRoot, ".github/actions/b.yaml", "steps: [{ uses: owner/repository@main }]\n");

  const result = auditRepository({ repoRoot });

  assert.deepEqual(result.files, collectActionYamlFiles(repoRoot));
  assert.equal(result.references.length, 3);
  assert.equal(result.violations.length, 1);
  assert.deepEqual(result.counts, { files: 2, external: 2, local: 1, violations: 1 });
});

test("CLI scans the current repository and reports success counts", (t) => {
  const repoRoot = makeRepository(t);
  writeFile(
    repoRoot,
    ".github/workflows/valid.yml",
    `steps:\n  - uses: owner/repository@${CHECKOUT_SHA}\n  - uses: ./local/action\n`,
  );
  const scriptPath = path.join(__dirname, "check-github-actions-pins.js");

  const run = spawnSync(process.execPath, [scriptPath], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /1 file(?:s)?, 1 external reference(?:s)?, 1 local reference(?:s)?, 0 violations/u);
  assert.equal(run.stderr, "");
});

test("CLI exits nonzero and emits bounded violations for invalid repositories", (t) => {
  const repoRoot = makeRepository(t);
  writeFile(repoRoot, ".github/workflows/invalid.yml", "steps: [{ uses: owner/repository@main }]\n");
  const scriptPath = path.join(__dirname, "check-github-actions-pins.js");

  const run = spawnSync(process.execPath, [scriptPath], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /\.github\/workflows\/invalid\.yml:1 \[MUTABLE_REF\]/u);
  assert.match(run.stdout, /1 violation/u);
});

test("main is exported without running on import", () => {
  assert.equal(typeof main, "function");
});
