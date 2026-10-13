#!/usr/bin/env node
// PreToolUse hook: denies any Read/Edit/Write/NotebookEdit/Glob/Grep call
// whose target resolves outside this workspace root. Prevents a careless
// edit or a subagent from reading or touching files elsewhere on disk.
//
// Registered in .claude/settings.json on the
// "Read|Edit|Write|NotebookEdit|Glob|Grep" matcher. Reads the hook payload
// as JSON on stdin. To deny, it prints a PreToolUse decision on stdout:
//   {"hookSpecificOutput":{"hookEventName":"PreToolUse",
//     "permissionDecision":"deny","permissionDecisionReason":"..."}}
// To let the call through it prints nothing and exits 0, so Claude Code's
// normal permission flow still applies (an explicit "allow" would skip the
// user's permission prompt for every file call, which a guard must not do).
//
// What gets checked, for every tool in the matcher:
//   file_path, notebook_path, path   resolved against the session's cwd
//   Glob pattern, Grep glob          resolved against `path` (or cwd); the
//                                    literal part up to the first wildcard
//                                    must stay inside, and a ".." anywhere
//                                    after a wildcard is denied outright,
//                                    because where it lands can't be known
//                                    before the glob runs
// "~" is expanded to the home folder, symlinks are followed.
//
// Allowed outside the root, on purpose (Claude Code's own working files,
// which it reads and writes during normal use):
//   <config>/projects/  plans/  todos/           read and write
//   <config>/skills/  agents/  commands/  CLAUDE.md   read only
//   <OS temp>/claude*                              read and write
// <config> is $CLAUDE_CONFIG_DIR, else ~/.claude. Everything else under it
// (settings.json, credentials, history) stays denied.
//
// Scope: file tools only. A Bash command can still reach outside the root;
// the permissions block in .claude/settings.json narrows that, a sandbox
// closes it. This hook is a guardrail against careless calls.

const fs = require("fs");
const os = require("os");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const IS_WINDOWS = process.platform === "win32";
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

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

// Windows paths are case-insensitive ("c:\" and "C:\" are the same drive).
function normalize(p) {
  return IS_WINDOWS ? p.toLowerCase() : p;
}

function isUnder(resolved, root) {
  return resolved === root || resolved.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

const ROOT = normalize(realResolve(WORKSPACE_ROOT, "."));

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const cfg = (...p) => normalize(realResolve(CONFIG_DIR, path.join(...p)));
const CLAUDE_READ_WRITE = [cfg("projects"), cfg("plans"), cfg("todos")];
const CLAUDE_READ_ONLY = [cfg("skills"), cfg("agents"), cfg("commands"), cfg("CLAUDE.md")];
const TEMP = normalize(realResolve(os.tmpdir(), "."));

function inClaudeTemp(resolved) {
  if (!isUnder(resolved, TEMP) || resolved === TEMP) return false;
  const first = path.relative(TEMP, resolved).split(path.sep)[0];
  return first === "claude" || first.startsWith("claude-");
}

// null = allowed, otherwise the reason it is not.
function verdict(resolved, isWrite) {
  if (isUnder(resolved, ROOT)) return null;
  if (CLAUDE_READ_WRITE.some((d) => isUnder(resolved, d)) || inClaudeTemp(resolved)) return null;
  if (CLAUDE_READ_ONLY.some((d) => isUnder(resolved, d))) {
    return isWrite ? "is one of Claude Code's own files, which this project may read but not change" : null;
  }
  return "resolves outside this project's folder";
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
    const { literal, tail } = splitGlob(expandHome(g));
    if (tail.split(/[\\/{},]/).some((part) => part === "..")) {
      out.push([g, null, "climbs with '..' after a wildcard, so where it lands can't be checked before it runs"]);
    } else {
      out.push([g, realResolve(searchBase, literal), null]);
    }
  }
  return out;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    // Claude Code always sends valid JSON. If it somehow doesn't, stay out
    // of the way (no output, exit 0) rather than block all file access.
    process.exit(0);
  }

  // Relative paths are relative to the session's working directory, which
  // Claude Code sends as "cwd". Without one, the project dir, then this
  // workspace root.
  const cwdRaw = payload.cwd || process.env.CLAUDE_PROJECT_DIR || WORKSPACE_ROOT;
  const cwd = path.resolve(WORKSPACE_ROOT, cwdRaw);
  const isWrite = WRITE_TOOLS.has(payload.tool_name);

  for (const [shown, resolved, early] of targets(payload.tool_name, payload.tool_input || {}, cwd)) {
    const why = early || verdict(normalize(resolved), isWrite);
    if (why) {
      deny(`Scope guard: "${shown}" ${why}. Reads and writes must stay inside the workspace root.`);
      break;
    }
  }
  process.exit(0);
});
