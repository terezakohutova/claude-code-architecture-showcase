#!/usr/bin/env node
// Checks the Markdown in this repo the way a reader would trip over it:
//   1. every relative [link](target) resolves to a file or folder,
//   2. every repo path quoted in `inline code` (e.g. `.claude/agents/x.md`)
//      exists, read from the repo root (not in METHODOLOGY.md, which is
//      written for a hypothetical new project and names example paths),
//   3. no em dash or en dash anywhere, the house rule the style-guard hook
//      enforces for the workspace applies to this repo's own docs too.
// Exits 1 and lists every problem if anything fails.
//
// Run: node scripts/check-docs.js   (no dependencies)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules", ".versions"]);
const DASHES = [8211, 8212].map((c) => String.fromCharCode(c));

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// Fenced code blocks hold sample payloads and diagrams, not references.
function stripFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, " "));
}

const problems = [];
const files = markdownFiles(ROOT);

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const raw = fs.readFileSync(file, "utf8");
  const text = stripFences(raw);
  const lineOf = (idx) => text.slice(0, idx).split("\n").length;

  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(target.split("#")[0]));
    if (!fs.existsSync(resolved)) problems.push(`${rel}:${lineOf(m.index)} broken link -> ${target}`);
  }

  for (const m of rel === "METHODOLOGY.md" ? [] : text.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1];
    const looksLikeRepoPath = /^\.?[\w-]+(\/[\w.-]+)*\.(md|js|json|ya?ml)$/.test(p) || /^\.?[\w-]+(\/[\w.-]+)+\/$/.test(p);
    // A bare filename ("SKILL.md") is a generic name, not a path claim.
    if (!looksLikeRepoPath || !p.includes("/") || p.startsWith(".versions")) continue;
    if (!fs.existsSync(path.join(ROOT, p))) problems.push(`${rel}:${lineOf(m.index)} path in code does not exist -> ${p}`);
  }

  raw.split("\n").forEach((line, i) => {
    if (DASHES.some((d) => line.includes(d))) problems.push(`${rel}:${i + 1} em/en dash`);
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in ${files.length} Markdown files.`);
  process.exit(1);
}
console.log(`OK: ${files.length} Markdown files, all links and quoted paths resolve, no em/en dashes.`);
