#!/usr/bin/env node
// PreToolUse hook: before an Edit/Write touches one of the files the
// workspace's behaviour depends on (agent definitions, skills, Feedback
// rules, CLAUDE.md, the tuning ledger), copy the current content to
// .versions/<path>/<timestamp><ext>. A rule or an agent prompt that got
// "improved" into something worse can then be put back exactly, instead of
// being reconstructed from memory. Only writes a new version when the
// content differs from the latest one, so repeated edits don't pile up
// identical copies.
//
// Registered in .claude/settings.json on the "Edit|Write|NotebookEdit"
// matcher. It never blocks: whatever happens, it writes nothing to stdout
// and exits 0, so a versioning problem can't stop real work.
//
// Restore by hand: copy .versions/<path>/<timestamp><ext> back over the
// file (version the current one first if you might want it back too).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const VERSIONS = path.join(ROOT, ".versions");

// Paths relative to ROOT, forward slashes.
const PROTECTED = [
  /^CLAUDE\.md$/,
  /^\.claude\/agents\/[^/]+\.md$/,
  /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
  /^\.claude\/TUNING-LEDGER\.md$/,
  /^Feedback\/.+\.md$/,
];

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function snapshot(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return;
  if (!PROTECTED.some((re) => re.test(rel))) return;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return; // new file, nothing to keep

  const dir = path.join(VERSIONS, ...rel.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).filter((x) => x !== "index.jsonl").sort();
  if (existing.length && sha(path.join(dir, existing[existing.length - 1])) === sha(file)) return;

  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  // Fixed-width local timestamp down to milliseconds, so names sort in time
  // order and two quick edits in the same second don't overwrite each other.
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}`;
  fs.copyFileSync(file, path.join(dir, stamp + path.extname(file)));
  fs.appendFileSync(path.join(dir, "index.jsonl"), JSON.stringify({ version: stamp }) + "\n");
}

let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data || "{}").tool_input || {};
    const target = input.file_path || input.notebook_path;
    if (target) snapshot(path.resolve(ROOT, target));
  } catch (e) {
    // never block an edit because versioning failed
  }
  process.exit(0);
});
