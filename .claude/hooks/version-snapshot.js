#!/usr/bin/env node
// PreToolUse hook: before an Edit/Write touches one of the files the
// workspace's behaviour depends on (agent definitions, skills, Feedback
// rules and the banned-phrase list, CLAUDE.md, the tuning ledger, the
// settings files and the hooks themselves), copy the current content to
// .versions/<path>/<UTC timestamp><ext>. A rule or an agent prompt that got
// "improved" into something worse can then be put back exactly, instead of
// being reconstructed from memory.
//
// Why this exists next to git: git only has what was committed. These
// snapshots cover the edits between commits, which in a working session is
// most of them. .versions/ is git-ignored and pruned; it is a short-term
// undo, not history.
//
// Registered in .claude/settings.json on the
// "Edit|Write|MultiEdit|NotebookEdit" matcher. It never blocks: whatever
// happens, it writes nothing to stdout and exits 0, so a versioning
// problem can't stop real work (GUARD_FAIL_CLOSED does not apply here;
// this hook is not a guard).
//
// Behaviour:
//   - A new version is written only when the content differs from the
//     newest kept version, so repeated edits don't pile up copies.
//   - File names are UTC, ISO 8601 with ":" replaced by "-" (Windows can't
//     have ":" in a name), e.g. 2026-10-13T18-20-19.331Z.md, so they sort in
//     time order on any machine and in any time zone.
//   - index.jsonl next to the versions gets one line per event:
//       {"event":"snapshot","version":..., "at":..., "tool":"Edit",
//        "file":"Feedback/INDEX.md","reason":"content before Edit",
//        "sha256":..., "bytes":..., "session":...}
//       {"event":"pruned","version":..., "at":...}
//   - Retention: only the newest N versions per file are kept (default 20,
//     set VERSION_SNAPSHOT_KEEP to change it, 0 = keep everything).
//
// Known limit: a PreToolUse hook runs before Claude Code decides whether
// the call goes ahead, and hooks on the same matcher run in parallel. If
// style-guard or the user then blocks the edit, the snapshot exists anyway,
// for an edit that never happened. That is harmless (it is a copy of the
// current content, and the next real edit is deduplicated against it), but
// it means a version is "content at that moment", not proof of an edit.
//
// Restore by hand: copy .versions/<path>/<version> back over the file
// (it gets versioned itself on the way, if you might want it back too).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const VERSIONS = path.join(ROOT, ".versions");
const DEFAULT_KEEP = 20;

// Paths relative to ROOT, forward slashes.
const PROTECTED = [
  /^CLAUDE\.md$/,
  /^\.claude\/agents\/[^/]+\.md$/,
  /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
  /^\.claude\/TUNING-LEDGER\.md$/,
  /^Feedback\/.+\.(md|json)$/,
  // The guardrails. scope-guard and the settings deny rules stop the agent
  // from writing these, but this hook still runs before that decision, and
  // a copy of the last good version costs nothing.
  /^\.claude\/settings(\.local)?\.json$/,
  /^\.claude\/hooks\/.+$/,
];

function keepLimit() {
  const n = Number.parseInt(process.env.VERSION_SNAPSHOT_KEEP ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_KEEP;
}

function sha(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// A name that does not exist yet. Two snapshots of one file in the same
// millisecond would collide; waiting for the next millisecond keeps every
// name in the same sortable format (a suffix like "-1" would sort first).
function freshStamp(ext, dir) {
  for (;;) {
    const now = new Date();
    const name = now.toISOString().replace(/:/g, "-") + ext;
    if (!fs.existsSync(path.join(dir, name))) return { now, name };
    const t = now.getTime();
    while (Date.now() === t) {} // at most one millisecond
  }
}

function snapshot(file, toolName, sessionId) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return;
  if (!PROTECTED.some((re) => re.test(rel))) return;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return; // new file, nothing to keep

  const content = fs.readFileSync(file);
  const hash = sha(content);
  const dir = path.join(VERSIONS, ...rel.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).filter((x) => x !== "index.jsonl").sort();
  if (existing.length && sha(fs.readFileSync(path.join(dir, existing[existing.length - 1]))) === hash) return;

  const { now, name } = freshStamp(path.extname(file), dir);
  fs.writeFileSync(path.join(dir, name), content);
  const index = path.join(dir, "index.jsonl");
  const log = (entry) => fs.appendFileSync(index, JSON.stringify(entry) + "\n");
  log({
    event: "snapshot",
    version: name,
    at: now.toISOString(),
    tool: toolName || null,
    file: rel,
    reason: `content before ${toolName || "a file tool call"}`,
    sha256: hash,
    bytes: content.length,
    session: sessionId || null,
  });

  const keep = keepLimit();
  if (keep > 0) {
    const all = [...existing, name].sort();
    for (const old of all.slice(0, Math.max(0, all.length - keep))) {
      fs.rmSync(path.join(dir, old), { force: true });
      log({ event: "pruned", version: old, at: now.toISOString() });
    }
  }
}

let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(data || "{}");
    const input = payload.tool_input || {};
    const target = input.file_path || input.notebook_path;
    const base = typeof payload.cwd === "string" && payload.cwd ? path.resolve(ROOT, payload.cwd) : ROOT;
    if (target) snapshot(path.resolve(base, target), payload.tool_name, payload.session_id);
  } catch (e) {
    // never block an edit because versioning failed
  }
  process.exit(0);
});
