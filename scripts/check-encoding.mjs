#!/usr/bin/env node
/**
 * Encoding guard: fails the build if UTF-8 mojibake is found in source files.
 *
 * Mojibake happens when a UTF-8 file is saved as Windows-1252 (cp1252): a
 * multi-byte UTF-8 character gets re-interpreted as several Latin-1 glyphs.
 * Examples (intended char -> corrupted code-point sequence):
 *   U+2026 ellipsis -> U+00E2 U+20AC U+00A6
 *   U+2013 en-dash  -> U+00E2 U+20AC U+201C
 *   U+2192 arrow    -> U+00E2 U+2020 U+2019
 *   U+00E9 e-acute  -> U+00C3 U+00A9
 *   U+00A0 nbsp     -> U+00C2 U+00A0
 *
 * Detection is by NUMERIC code point (charCodeAt), so this file is pure ASCII
 * and never trips its own check. A two-char signature (lead + follower) keeps
 * legitimate accented source text (e.g. a lone French a-circumflex) from
 * false-positiving.
 *
 * Run directly:  node scripts/check-encoding.mjs
 * Wired into:    npm run lint  (root)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["apps/web", "apps/api", "packages"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  "generated",
  ".cache",
]);

// Lead code point + exact follower code point.
const EXACT = [
  { a: 0x00e2, b: 0x20ac, hint: "smart quote / dash / ellipsis (00E2 20AC)" },
  { a: 0x00e2, b: 0x2020, hint: "arrow (00E2 2020)" },
];
// Lead code point + follower in an inclusive range.
const RANGE = [
  { a: 0x00c3, lo: 0x0080, hi: 0x00bf, hint: "accented letter (00C3 + Latin-1 supplement)" },
  { a: 0x00c2, lo: 0x00a0, hi: 0x00bf, hint: "nbsp / symbol (00C2 + symbol)" },
];

const SELF = "check-encoding.mjs";

function detect(line) {
  for (let i = 0; i < line.length - 1; i++) {
    const c = line.charCodeAt(i);
    const n = line.charCodeAt(i + 1);
    for (const p of EXACT) if (c === p.a && n === p.b) return p.hint;
    for (const r of RANGE) if (c === r.a && n >= r.lo && n <= r.hi) return r.hint;
  }
  return null;
}

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if (EXTS.has(extname(e.name)) && e.name !== SELF) {
      acc.push(full);
    }
  }
  return acc;
}

const files = [];
for (const root of ROOTS) {
  try {
    statSync(root);
    walk(root, files);
  } catch {
    /* root absent in some workspaces - skip */
  }
}

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const hint = detect(lines[i]);
    if (hint) problems.push({ file, line: i + 1, hint, sample: lines[i].trim().slice(0, 100) });
  }
}

if (problems.length > 0) {
  console.error(`\nx Encoding guard: found ${problems.length} mojibake occurrence(s):\n`);
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  [${p.hint}]`);
    console.error(`    ${p.sample}`);
  }
  console.error(
    "\nFix: re-save the file(s) as UTF-8 and replace the corrupted characters with the intended Unicode glyphs.\n",
  );
  process.exit(1);
}

console.log(`OK Encoding guard: scanned ${files.length} files, no mojibake found.`);
