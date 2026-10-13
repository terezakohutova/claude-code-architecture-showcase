#!/usr/bin/env node
// The style-guard rules on demand: checks one or more files (or stdin) for
// banned superlatives and em/en dashes, with the same rules and the same
// quote handling as .claude/hooks/style-guard.js (both use
// .claude/hooks/lib/style-rules.js).
//
// Unlike the hook, it checks every file it is given, whatever its folder:
// a draft under review may not be saved in a copy folder yet.
//
// Usage:
//   node scripts/style-check.js Inventory/listings/MF-0041.md
//   echo "some draft text" | node scripts/style-check.js -
// Exit 0 = clean, 1 = findings (one per line, file:line: problem),
// 2 = a file could not be read.

const fs = require("fs");
const rules = require("../.claude/hooks/lib/style-rules");

function check(name, text) {
  return rules.findViolations(text).map((v) => `${name}:${v.line}: ${rules.describe(v)}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/style-check.js <file>... | -   (reads stdin)");
  process.exit(2);
}

const findings = [];
for (const arg of args) {
  let text;
  try {
    text = fs.readFileSync(arg === "-" ? 0 : arg, "utf8");
  } catch (e) {
    console.error(`cannot read ${arg}: ${e.code || e.message}`);
    process.exit(2);
  }
  findings.push(...check(arg === "-" ? "stdin" : arg, text));
}

if (findings.length) {
  console.log(findings.join("\n"));
  process.exit(1);
}
console.log(`clean: ${args.length} input(s), no banned superlative, no em/en dash`);
