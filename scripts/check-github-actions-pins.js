#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const State = Object.freeze({
  PLAIN: "plain",
  SINGLE_QUOTED: "single-quoted",
  DOUBLE_QUOTED: "double-quoted",
  COMMENT: "comment",
});

const PINNED_EXTERNAL = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/;
const EXTERNAL_PATH = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const LOCAL_ACTION = /^\.\/[A-Za-z0-9._/-]+$/;
const YAML_FILE = /\.ya?ml$/i;
const MAX_CONTEXT = 240;

const MESSAGES = Object.freeze({
  AMBIGUOUS_YAML: "YAML syntax is ambiguous for action-pin auditing",
  DYNAMIC_REF: "action reference must not contain an expression",
  EXTERNAL_NOT_PINNED:
    "action must be local ./... or external owner/repository[/path]@<commit-sha>",
  INVALID_SHA: "external action ref must be a lowercase 40-character commit SHA",
  MISSING_REF: "external action reference is missing @<commit-sha>",
  MUTABLE_REF: "external action reference uses a mutable ref",
});

function sanitizeOneLine(value, limit = MAX_CONTEXT) {
  const sanitized = String(value).replace(/[\u0000-\u001f\u007f]/gu, " ");
  if (sanitized.length <= limit) return sanitized;
  return `${sanitized.slice(0, Math.max(0, limit - 3))}...`;
}

function contextForLine(line) {
  return sanitizeOneLine(line, MAX_CONTEXT);
}

function parseSingleQuoted(text, start) {
  let decoded = "";
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] !== "'") {
      decoded += text[index];
      continue;
    }
    if (text[index + 1] === "'") {
      decoded += "'";
      index += 1;
      continue;
    }
    return { decoded, end: index };
  }
  return { error: "unterminated single-quoted scalar" };
}

const SIMPLE_DOUBLE_ESCAPES = Object.freeze({
  "0": "\0",
  a: "\u0007",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\u000b",
  f: "\f",
  r: "\r",
  e: "\u001b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: "\u00a0",
  L: "\u2028",
  P: "\u2029",
});

function parseDoubleQuoted(text, start) {
  let decoded = "";
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') return { decoded, end: index };
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const escape = text[index + 1];
    if (Object.hasOwn(SIMPLE_DOUBLE_ESCAPES, escape)) {
      decoded += SIMPLE_DOUBLE_ESCAPES[escape];
      index += 1;
      continue;
    }

    const widths = { x: 2, u: 4, U: 8 };
    const width = widths[escape];
    if (width === undefined) return { error: "invalid double-quoted escape" };
    const digits = text.slice(index + 2, index + 2 + width);
    if (digits.length !== width || !/^[0-9a-fA-F]+$/.test(digits)) {
      return { error: "invalid double-quoted escape" };
    }
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return { error: "invalid Unicode escape" };
    }
    decoded += String.fromCodePoint(codePoint);
    index += width + 1;
  }
  return { error: "unterminated double-quoted scalar" };
}

function parseQuoted(text, start) {
  return text[start] === "'" ? parseSingleQuoted(text, start) : parseDoubleQuoted(text, start);
}

function decodeScalar(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
    const parsed = parseQuoted(trimmed, 0);
    if (parsed.error || parsed.end !== trimmed.length - 1) return null;
    return parsed.decoded;
  }
  if (!trimmed || /[\[\]{},]/u.test(trimmed)) return null;
  return trimmed;
}

function skipSpaces(text, start) {
  let index = start;
  while (text[index] === " " || text[index] === "\t") index += 1;
  return index;
}

function isCommentStart(text, index) {
  return text[index] === "#" && (index === 0 || /[ \t]/u.test(text[index - 1]));
}

function isQuotedScalarStart(text, index) {
  let previous = index - 1;
  while (previous >= 0 && /[ \t]/u.test(text[previous])) previous -= 1;
  if (previous < 0) return true;
  if (/[:\[\]{},?]/u.test(text[previous])) return true;
  return text[previous] === "-" && (previous === 0 || /[ \t\[\{,]/u.test(text[previous - 1]));
}

function buildLineMask(line) {
  const mask = [...line];
  const quotes = new Map();
  let state = State.PLAIN;
  let commentIndex = line.length;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if ((character === "'" || character === '"') && isQuotedScalarStart(line, index)) {
      state = character === "'" ? State.SINGLE_QUOTED : State.DOUBLE_QUOTED;
      const parsed = parseQuoted(line, index);
      if (parsed.error) return { error: parsed.error, errorColumn: index };
      const next = skipSpaces(line, parsed.end + 1);
      if (
        next < line.length &&
        !/[:,\]}]/u.test(line[next]) &&
        !isCommentStart(line, next)
      ) {
        return { error: "quoted scalar has an adjacent token", errorColumn: next };
      }
      quotes.set(index, parsed);
      for (let cursor = index; cursor <= parsed.end; cursor += 1) mask[cursor] = " ";
      index = parsed.end;
      state = State.PLAIN;
      continue;
    }

    if (line.startsWith("${{", index)) {
      const end = line.indexOf("}}", index + 3);
      if (end === -1) return { error: "unterminated expression", errorColumn: index };
      for (let cursor = index; cursor <= end + 1; cursor += 1) mask[cursor] = " ";
      index = end + 1;
      continue;
    }

    if (isCommentStart(line, index)) {
      state = State.COMMENT;
      commentIndex = index;
      for (let cursor = index; cursor < line.length; cursor += 1) mask[cursor] = " ";
      break;
    }
  }

  return { commentIndex, mask: mask.join(""), quotes, state };
}

function validateReference(target) {
  if (/\$\{\{|\$\{/u.test(target)) return "DYNAMIC_REF";
  if (target.startsWith("./")) return LOCAL_ACTION.test(target) ? null : "EXTERNAL_NOT_PINNED";
  if (PINNED_EXTERNAL.test(target)) return null;
  if (/\s|[\u0000-\u001f\u007f]/u.test(target)) return "EXTERNAL_NOT_PINNED";
  if (target.startsWith("docker://")) return "EXTERNAL_NOT_PINNED";

  const at = target.lastIndexOf("@");
  if (at === -1) return EXTERNAL_PATH.test(target) ? "MISSING_REF" : "EXTERNAL_NOT_PINNED";
  const actionPath = target.slice(0, at);
  const ref = target.slice(at + 1);
  if (!EXTERNAL_PATH.test(actionPath)) return "EXTERNAL_NOT_PINNED";
  if (!ref) return "MISSING_REF";
  if (/^[0-9a-fA-F]+$/u.test(ref) || ref.length === 40) return "INVALID_SHA";
  return "MUTABLE_REF";
}

function isBlockScalarHeader(value) {
  return /^[|>](?:(?:[+-][1-9]?)|(?:[1-9][+-]?)|)[ ]*$/u.test(value);
}

function looksLikeBlockMappingEntry(line, indentation) {
  let start = skipSpaces(line, indentation);
  while (line[start] === "-" && /[ \t]/u.test(line[start + 1] ?? "")) {
    start = skipSpaces(line, start + 1);
  }
  if (line[start] === "'" || line[start] === '"') {
    const parsed = parseQuoted(line, start);
    if (parsed.error) return false;
    return line[skipSpaces(line, parsed.end + 1)] === ":";
  }
  for (let index = start; index < line.length; index += 1) {
    const next = line[index + 1];
    if (line[index] !== ":" || (next !== undefined && !/[ \t]/u.test(next))) continue;
    return decodeScalar(line.slice(start, index)) !== null;
  }
  return false;
}

function hasIndentedPlainContinuation(lines, lineIndex, indentation) {
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indentationText = line.match(/^[ \t]*/u)[0];
    const nextIndentation = indentationText.replace(/\t/gu, "    ").length;
    if (nextIndentation <= indentation) return false;
    return !looksLikeBlockMappingEntry(line, indentationText.length);
  }
  return false;
}

function isMappingColon(mask, index, candidate) {
  const next = mask[index + 1];
  return (
    next === undefined ||
    /[ \t,\]}]/u.test(next) ||
    candidate.trim().startsWith("'") ||
    candidate.trim().startsWith('"')
  );
}

function classifyTokenIndicator(line, start) {
  const character = line[start];
  if (character === "&") return "anchor";
  if (character === "*") return "alias";
  if (character === "!") return "tag";
  if (character === "?" && (line[start + 1] === undefined || /[ \t\[\{]/u.test(line[start + 1]))) {
    return "explicit key";
  }
  return null;
}

function extractUsesValue({ analysis, colon, flowDepth, line }) {
  const start = skipSpaces(line, colon + 1);
  if (start >= analysis.commentIndex) return { ambiguous: true };
  const first = line[start];
  if (first === "|" || first === ">") return { ambiguous: true, blockScalar: true };
  if (classifyTokenIndicator(line, start)) return { ambiguous: true };
  if (first === "[" || first === "{") return { ambiguous: true };

  const quoted = analysis.quotes.get(start);
  if (quoted) {
    let cursor = skipSpaces(line, quoted.end + 1);
    if (
      cursor < analysis.commentIndex &&
      !(flowDepth > 0 && /[,\]}]/u.test(analysis.mask[cursor]))
    ) {
      return { ambiguous: true };
    }
    return { target: quoted.decoded };
  }

  let end = analysis.commentIndex;
  if (flowDepth > 0) {
    for (let index = start; index < end; index += 1) {
      if (/[,\]}]/u.test(analysis.mask[index])) {
        end = index;
        break;
      }
    }
  }
  const target = line.slice(start, end).trimEnd();
  return target ? { target } : { ambiguous: true };
}

function auditYamlText({ filePath, text }) {
  if (typeof filePath !== "string" || typeof text !== "string") {
    throw new TypeError("auditYamlText requires string filePath and text values");
  }

  const references = [];
  const violations = [];
  const ambiguousLines = new Set();
  const flowStack = [];
  const normalizedText = text.startsWith("\ufeff") ? text.slice(1) : text;
  const lines = normalizedText.split(/\r\n|[\n\r]/u);
  let blockScalar = null;

  function addViolation(lineIndex, code) {
    if (code === "AMBIGUOUS_YAML") {
      if (ambiguousLines.has(lineIndex)) return;
      ambiguousLines.add(lineIndex);
    }
    violations.push({
      filePath,
      line: lineIndex + 1,
      code,
      message: MESSAGES[code],
      context: contextForLine(lines[lineIndex] ?? ""),
    });
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const indentationText = line.match(/^[ \t]*/u)[0];
    const indentation = indentationText.replace(/\t/gu, "    ").length;

    if (blockScalar) {
      if (!line.trim() || indentation > blockScalar.indentation) continue;
      blockScalar = null;
    }

    if (indentationText.includes("\t")) {
      addViolation(lineIndex, "AMBIGUOUS_YAML");
      continue;
    }
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const analysis = buildLineMask(line);
    if (analysis.error) {
      addViolation(lineIndex, "AMBIGUOUS_YAML");
      continue;
    }

    let segmentStart = skipSpaces(line, indentationText.length);
    let standaloneBlockIndentation = indentation;
    if (
      segmentStart === 0 &&
      line.startsWith("---", segmentStart) &&
      (line[segmentStart + 3] === undefined || /[ \t]/u.test(line[segmentStart + 3]))
    ) {
      segmentStart = skipSpaces(line, segmentStart + 3);
    }
    while (line[segmentStart] === "-" && /[ \t]/u.test(line[segmentStart + 1] ?? "")) {
      standaloneBlockIndentation = segmentStart;
      segmentStart = skipSpaces(line, segmentStart + 1);
    }
    const tokenStarts = new Set([segmentStart]);
    let detectedBlockScalar = null;
    const standaloneValue = line.slice(segmentStart, analysis.commentIndex).trimEnd();
    if (standaloneValue.startsWith("|") || standaloneValue.startsWith(">")) {
      if (!isBlockScalarHeader(standaloneValue) || flowStack.length > 0) {
        addViolation(lineIndex, "AMBIGUOUS_YAML");
      } else {
        detectedBlockScalar = { indentation: standaloneBlockIndentation };
      }
    }

    for (let index = indentationText.length; index < analysis.commentIndex; index += 1) {
      const character = analysis.mask[index];
      if (character === " " || character === "\t") continue;

      if (character === "-" && index === segmentStart && /[ \t]/u.test(line[index + 1] ?? "")) {
        segmentStart = skipSpaces(line, index + 1);
        tokenStarts.add(segmentStart);
        continue;
      }

      if (character === "[" || character === "{") {
        if (flowStack.length === 0 && !tokenStarts.has(index)) continue;
        flowStack.push({ character, lineIndex, column: index, segmentStart });
        segmentStart = skipSpaces(line, index + 1);
        tokenStarts.add(segmentStart);
        continue;
      }

      if (character === "]" || character === "}") {
        if (flowStack.length === 0) {
          if (tokenStarts.has(index)) addViolation(lineIndex, "AMBIGUOUS_YAML");
          continue;
        }
        const opener = flowStack.at(-1);
        const expected = character === "]" ? "[" : "{";
        if (!opener || opener.character !== expected) {
          addViolation(lineIndex, "AMBIGUOUS_YAML");
        } else {
          flowStack.pop();
          const next = skipSpaces(line, index + 1);
          if (analysis.mask[next] === ":") addViolation(opener.lineIndex, "AMBIGUOUS_YAML");
        }
        continue;
      }

      if (character === "," && flowStack.length > 0) {
        segmentStart = skipSpaces(line, index + 1);
        tokenStarts.add(segmentStart);
        continue;
      }

      if (character !== ":") continue;
      const candidate = line.slice(segmentStart, index);
      if (!isMappingColon(analysis.mask, index, candidate)) continue;
      const key = decodeScalar(candidate);
      if (key === null) {
        if (!candidate.trim()) addViolation(lineIndex, "AMBIGUOUS_YAML");
        continue;
      }

      const valueStart = skipSpaces(line, index + 1);
      tokenStarts.add(valueStart);
      if (key === "<<") {
        addViolation(lineIndex, "AMBIGUOUS_YAML");
        continue;
      }

      const rawValue = line.slice(valueStart, analysis.commentIndex).trimEnd();
      if (rawValue.startsWith("|") || rawValue.startsWith(">")) {
        if (!isBlockScalarHeader(rawValue) || flowStack.length > 0 || key === "uses") {
          addViolation(lineIndex, "AMBIGUOUS_YAML");
        } else {
          detectedBlockScalar = { indentation: segmentStart };
        }
        continue;
      }

      if (key !== "uses") continue;
      const extracted = extractUsesValue({
        analysis,
        colon: index,
        flowDepth: flowStack.length,
        line,
      });
      if (extracted.ambiguous) {
        addViolation(lineIndex, "AMBIGUOUS_YAML");
        continue;
      }
      if (hasIndentedPlainContinuation(lines, lineIndex, indentation)) {
        addViolation(lineIndex, "AMBIGUOUS_YAML");
        continue;
      }

      const target = extracted.target;
      references.push({
        filePath,
        line: lineIndex + 1,
        target,
        local: target.startsWith("./"),
        context: contextForLine(line),
      });
      const code = validateReference(target);
      if (code) addViolation(lineIndex, code);
    }

    for (const start of tokenStarts) {
      if (start >= analysis.commentIndex) continue;
      if (classifyTokenIndicator(line, start)) addViolation(lineIndex, "AMBIGUOUS_YAML");
    }
    if (detectedBlockScalar) blockScalar = detectedBlockScalar;
  }

  for (const opener of flowStack) addViolation(opener.lineIndex, "AMBIGUOUS_YAML");
  violations.sort((left, right) => left.line - right.line || left.code.localeCompare(right.code));
  return { references, violations };
}

function collectActionYamlFiles(repoRoot) {
  const root = path.resolve(repoRoot);
  const files = [];
  const policyRoots = [
    path.join(root, ".github", "workflows"),
    path.join(root, ".github", "actions"),
  ];

  function walk(candidate) {
    let stat;
    try {
      stat = fs.lstatSync(candidate);
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      if (YAML_FILE.test(candidate)) files.push(path.resolve(candidate));
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(candidate).sort()) walk(path.join(candidate, entry));
  }

  for (const policyRoot of policyRoots) walk(policyRoot);
  return files.sort();
}

function auditRepository({ repoRoot }) {
  const files = collectActionYamlFiles(repoRoot);
  const references = [];
  const violations = [];
  for (const filePath of files) {
    const result = auditYamlText({ filePath, text: fs.readFileSync(filePath, "utf8") });
    references.push(...result.references);
    violations.push(...result.violations);
  }
  const external = references.filter(({ local }) => !local).length;
  const local = references.length - external;
  return {
    files,
    references,
    violations,
    counts: { files: files.length, external, local, violations: violations.length },
  };
}

function formatViolation(violation) {
  const relative = path.isAbsolute(violation.filePath)
    ? path.relative(process.cwd(), violation.filePath)
    : violation.filePath;
  const file = sanitizeOneLine(relative.replaceAll(path.sep, "/"), MAX_CONTEXT);
  const message = sanitizeOneLine(violation.message, MAX_CONTEXT);
  const context = sanitizeOneLine(violation.context, MAX_CONTEXT);
  return `${file}:${violation.line} [${violation.code}] ${message} | ${context}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function main(argv = process.argv.slice(2)) {
  void argv;
  const result = auditRepository({ repoRoot: process.cwd() });
  for (const violation of result.violations) console.error(formatViolation(violation));
  console.log(
    `GitHub Actions pin audit: ${plural(result.counts.files, "file")}, ${plural(
      result.counts.external,
      "external reference",
    )}, ${plural(result.counts.local, "local reference")}, ${plural(
      result.counts.violations,
      "violation",
    )}.`,
  );
  return result.violations.length === 0 ? 0 : 1;
}

module.exports = {
  State,
  auditRepository,
  auditYamlText,
  collectActionYamlFiles,
  formatViolation,
  main,
};

if (require.main === module) process.exitCode = main();
