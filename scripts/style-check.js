#!/usr/bin/env node
// The style-guard rules on demand: checks one or more files (or stdin) for
// banned superlatives and em/en dashes, with the same rules as
// .claude/hooks/style-guard.js (both use .claude/hooks/lib/style-rules.js,
// which reads the banned list from Feedback/banned-phrases.json).
//
// Unlike the hook, it checks every file it is given, whatever its folder:
// a draft under review may not be saved in a copy folder yet. Quote
// handling follows the hook: code spans and fenced blocks are skipped
// everywhere; a blockquote is skipped only in a file outside the copy
// folders (an internal note quoting a buyer). Stdin is treated as copy.
//
// Usage:
//   node scripts/style-check.js Inventory/listings/MF-0041.md
//   echo "some draft text" | node scripts/style-check.js -
// Exit 0 = clean, 1 = findings (one per line, file:line: problem),
// 2 = a file, or the banned list, could not be read.

const fs = require("fs");
const path = require("path");
const rules = require("../.claude/hooks/lib/style-rules");

const ROOT = path.resolve(__dirname, "..");

function isCopyFile(arg) {
  const rel = rules.toPosix(path.relative(ROOT, path.resolve(arg)));
  return rules.isCustomerCopy(rel);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/style-check.js <file>... | -   (reads stdin)");
  process.exit(2);
}

try {
  rules.bannedPhrases();
} catch (e) {
  console.error(`cannot load the banned list ${rules.PHRASES_FILE}: ${e.code || e.message}`);
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
  const name = arg === "-" ? "stdin" : arg;
  const blockquotesAreQuotes = arg !== "-" && !isCopyFile(arg);
  if (arg !== "-" && path.extname(arg).toLowerCase() === ".ipynb") text = rules.notebookMarkdown(text);
  for (const v of rules.findViolations(text, { blockquotesAreQuotes })) findings.push(`${name}:${v.line}: ${rules.describe(v)}`);
}

if (findings.length) {
  console.log(findings.join("\n"));
  process.exit(1);
}
console.log(`clean: ${args.length} input(s), no banned superlative, no em/en dash`);
