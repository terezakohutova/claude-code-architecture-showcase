#!/usr/bin/env node
// PreToolUse hook: denies any Read/Edit/Write/MultiEdit/NotebookEdit/Glob/
// Grep call whose target resolves outside this workspace root, and any
// write to the files that hold the guardrails themselves. Prevents a
// careless edit or a subagent from reading or touching files elsewhere on
// disk, or from switching its own limits off.
//
// Registered in .claude/settings.json on the
// "Read|Edit|Write|MultiEdit|NotebookEdit|Glob|Grep" matcher. Reads the
// hook payload as JSON on stdin. To deny, it prints a PreToolUse decision
// on stdout:
//   {"hookSpecificOutput":{"hookEventName":"PreToolUse",
//     "permissionDecision":"deny","permissionDecisionReason":"..."}}
// To let the call through it prints nothing and exits 0, so Claude Code's
// normal permission flow still applies (an explicit "allow" would skip the
// user's permission prompt for every file call, which a guard must not do).
//
// What gets checked, for every tool in the matcher:
//   file_path, notebook_path, path   resolved against the session's cwd
//   Glob pattern, Grep glob          brace alternatives are expanded first
//                                    ({a,{b,c}} is three patterns) and
//                                    each one is checked on its own; for
//                                    each, the literal part up to the first
//                                    wildcard must stay inside, and a ".."
//                                    after a wildcard is denied outright,
//                                    because where it lands can't be known
//                                    before the glob runs
// "~" is expanded to the home folder, symlinks are followed.
//
// Never writable by the agent, even inside the root (hard rules are
// changed by a person, in an editor, outside Claude Code):
//   .claude/settings.json  .claude/settings.local.json  .claude/hooks/**
// settings.json also denies these to Edit/Write/MultiEdit, so the two
// layers back each other up.
//
// Allowed outside the root, on purpose (Claude Code's own working files,
// which it reads and writes during normal use):
//   <config>/projects/<this project>/   plans/  todos/   read and write
//   <config>/skills/  agents/  commands/  CLAUDE.md      read only
//   <OS temp>/claude*/<this project>/                    read and write
// <config> is $CLAUDE_CONFIG_DIR, else ~/.claude. "<this project>" is the
// folder Claude Code keeps this project's transcripts, tool results and
// memory in: the project path with every character other than a letter or
// a digit replaced by "-" (C:\Users\me\shop -> C--Users-me-shop), plus the
// folder holding the current session's transcript_path, which covers a
// session started from a subfolder. The same folder name is what Claude
// Code uses under its temp folder (<OS temp>/claude/<name>/ on Windows,
// <OS temp>/claude-<uid>/<name>/ elsewhere). Other projects' folders, in
// either place, and settings, credentials and history stay denied.
//
// Internal errors and malformed input: see lib/hook-io.js (fail-open by
// default, GUARD_FAIL_CLOSED=1 to deny instead).
//
// Scope: file tools only. A Bash command can still reach outside the root;
// the permissions block in .claude/settings.json narrows that, a sandbox
// closes it. This hook is a guardrail against careless calls.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runGuard } = require("./lib/hook-io");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
// Windows and macOS file systems ignore case by default.
const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const MAX_ALTERNATIVES = 256;

function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Resolve symlinks for the deepest part of the path that exists, so a link
// inside the workspace pointing elsewhere is judged by where it really goes.
function realResolve(base, p) {
  const full = path.resolve(base, expandHome(p));
  let current = full;
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest);
    } catch (e) {
      const parent = path.dirname(current);
      if (parent === current) return full;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

function normalize(p) {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

function isUnder(resolved, root) {
  return resolved === root || resolved.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

const ROOT = normalize(realResolve(WORKSPACE_ROOT, "."));
const GUARDRAIL_FILES = [".claude/settings.json", ".claude/settings.local.json"].map((f) => normalize(path.join(ROOT, f)));
const GUARDRAIL_DIRS = [".claude/hooks"].map((d) => normalize(path.join(ROOT, d)));

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const cfg = (...p) => normalize(realResolve(CONFIG_DIR, path.join(...p)));
const PROJECTS = cfg("projects");
const CLAUDE_READ_WRITE = [cfg("plans"), cfg("todos")];
const CLAUDE_READ_ONLY = [cfg("skills"), cfg("agents"), cfg("commands"), cfg("CLAUDE.md")];
const TEMP = normalize(realResolve(os.tmpdir(), "."));

// Claude Code's folder name for a project path.
const projectFolderName = (p) => p.replace(/[^A-Za-z0-9]/g, "-");

// The folder names Claude Code uses for this project in this call: from the
// workspace path, $CLAUDE_PROJECT_DIR and the session's transcript folder.
function ownProjectNames(payload) {
  const names = new Set([projectFolderName(WORKSPACE_ROOT)]);
  if (process.env.CLAUDE_PROJECT_DIR) names.add(projectFolderName(path.resolve(process.env.CLAUDE_PROJECT_DIR)));
  if (typeof payload.transcript_path === "string" && payload.transcript_path) {
    const t = normalize(realResolve(WORKSPACE_ROOT, payload.transcript_path));
    if (isUnder(t, PROJECTS) && t !== PROJECTS) {
      const first = path.relative(PROJECTS, t).split(path.sep)[0];
      if (first && first !== "..") names.add(first);
    }
  }
  return [...names].map(normalize);
}

// This project's folders under <config>/projects for this call.
const ownProjectFolders = (names) => names.map((n) => path.join(PROJECTS, n));

// Only this project's own folder inside Claude Code's temp folders.
function inOwnClaudeTemp(resolved, names) {
  if (!isUnder(resolved, TEMP) || resolved === TEMP) return false;
  const [first, second] = path.relative(TEMP, resolved).split(path.sep);
  return (first === "claude" || first.startsWith("claude-")) && names.includes(second);
}

// null = allowed, otherwise the reason it is not.
function verdict(resolved, isWrite, names) {
  if (isUnder(resolved, ROOT)) {
    if (isWrite && (GUARDRAIL_FILES.includes(resolved) || GUARDRAIL_DIRS.some((d) => isUnder(resolved, d)))) {
      return "is one of the guardrail files (settings or hooks), which a person changes by hand outside Claude Code, never the agent";
    }
    return null;
  }
  if (ownProjectFolders(names).some((d) => isUnder(resolved, d))) return null;
  if (CLAUDE_READ_WRITE.some((d) => isUnder(resolved, d)) || inOwnClaudeTemp(resolved, names)) return null;
  if (CLAUDE_READ_ONLY.some((d) => isUnder(resolved, d))) {
    return isWrite ? "is one of Claude Code's own files, which this project may read but not change" : null;
  }
  if (isUnder(resolved, PROJECTS)) return "is in another project's folder under Claude Code's projects directory; only this project's own folder there is allowed";
  return "resolves outside this project's folder; reads and writes must stay inside the workspace root";
}

// Brace expansion, nested included: "a{b,c{d,e}}f" -> abf, acdf, acef.
// A group without a top-level comma ("{x}", "{1..3}") is left as written.
// Returns null when the expansion would exceed MAX_ALTERNATIVES.
function expandBraces(pattern) {
  const out = [];
  const queue = [pattern];
  while (queue.length) {
    const s = queue.shift();
    let expanded = false;
    for (let i = 0; i < s.length && !expanded; i++) {
      if (s[i] !== "{") continue;
      let depth = 0;
      const commas = [];
      let close = -1;
      for (let j = i; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") {
          depth--;
          if (depth === 0) {
            close = j;
            break;
          }
        } else if (s[j] === "," && depth === 1) commas.push(j);
      }
      if (close === -1) break; // unbalanced: the rest is literal
      if (commas.length === 0) continue; // not a list, look further in
      const bounds = [i, ...commas, close];
      for (let k = 0; k < bounds.length - 1; k++) {
        queue.push(s.slice(0, i) + s.slice(bounds[k] + 1, bounds[k + 1]) + s.slice(close + 1));
      }
      expanded = true;
    }
    if (!expanded) out.push(s);
    if (out.length + queue.length > MAX_ALTERNATIVES) return null;
  }
  return out;
}

const WILDCARD = /[*?[{]/;

// Splits a glob into the literal directory it starts from and whatever
// follows the first wildcard segment.
function splitGlob(pattern) {
  const segs = pattern.split(/[\\/]/);
  const i = segs.findIndex((s) => WILDCARD.test(s));
  if (i === -1) return { literal: pattern, tail: "" };
  const literal = segs.slice(0, i).join("/") || (pattern.startsWith("/") ? "/" : ".");
  return { literal, tail: segs.slice(i).join("/") };
}

// [what to show, path to check, null] or [what to show, null, reason]
function targets(toolName, toolInput, cwd) {
  const out = [];
  for (const p of [toolInput.file_path, toolInput.notebook_path, toolInput.path]) {
    if (typeof p === "string" && p.length > 0) out.push([p, realResolve(cwd, p), null]);
  }
  const globs = [];
  if (toolName === "Glob" && typeof toolInput.pattern === "string") globs.push(toolInput.pattern);
  if (toolName === "Grep" && typeof toolInput.glob === "string") globs.push(toolInput.glob);
  const searchBase = typeof toolInput.path === "string" && toolInput.path ? realResolve(cwd, toolInput.path) : cwd;
  for (const g of globs) {
    const alternatives = expandBraces(g);
    if (!alternatives) {
      out.push([g, null, `has more than ${MAX_ALTERNATIVES} brace alternatives, too many to check`]);
      continue;
    }
    for (const alt of alternatives) {
      const { literal, tail } = splitGlob(expandHome(alt));
      if (tail.split(/[\\/{},]/).some((part) => part === "..")) {
        out.push([g, null, "climbs with '..' after a wildcard, so where it lands can't be checked before it runs"]);
      } else {
        out.push([g, realResolve(searchBase, literal), null]);
      }
    }
  }
  return out;
}

runGuard("scope-guard", (payload) => {
  // Relative paths are relative to the session's working directory, which
  // Claude Code sends as "cwd". Without one, the project dir, then this
  // workspace root.
  const cwdRaw = payload.cwd || process.env.CLAUDE_PROJECT_DIR || WORKSPACE_ROOT;
  const cwd = path.resolve(WORKSPACE_ROOT, cwdRaw);
  const isWrite = WRITE_TOOLS.has(payload.tool_name);
  const names = ownProjectNames(payload);

  for (const [shown, resolved, early] of targets(payload.tool_name, payload.tool_input || {}, cwd)) {
    const why = early || verdict(normalize(resolved), isWrite, names);
    if (why) return `Scope guard: "${shown}" ${why}.`;
  }
  return null;
});
