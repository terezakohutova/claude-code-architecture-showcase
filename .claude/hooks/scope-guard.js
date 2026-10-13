#!/usr/bin/env node
// PreToolUse hook: denies any Read/Edit/Write/NotebookEdit/Glob/Grep call
// whose target path resolves outside this workspace root. Prevents a careless
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
// Scope: file tools only. A Bash command can still reach outside the root;
// that needs a permission rule or a sandbox, not this hook.

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const IS_WINDOWS = process.platform === "win32";

// Resolve symlinks for the deepest part of the path that exists, so a link
// inside the workspace pointing elsewhere is judged by where it really goes.
function realResolve(p) {
  let current = path.resolve(WORKSPACE_ROOT, p);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest);
    } catch (e) {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(WORKSPACE_ROOT, p);
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

// Windows paths are case-insensitive ("c:\" and "C:\" are the same drive).
function normalize(p) {
  return IS_WINDOWS ? p.toLowerCase() : p;
}

const ROOT = normalize(realResolve(WORKSPACE_ROOT));

function isInside(p) {
  const resolved = normalize(realResolve(p));
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep);
}

// Glob takes the target as a pattern. An absolute pattern ("/etc/**",
// "C:/other/*.md") is checked by its literal prefix up to the first wildcard.
function globBase(pattern) {
  const idx = pattern.search(/[*?[{]/);
  const literal = idx === -1 ? pattern : pattern.slice(0, idx);
  return literal || ".";
}

// Returns [what to show in the message, the path to check] pairs.
function targets(toolName, toolInput) {
  const out = [toolInput.file_path, toolInput.notebook_path, toolInput.path]
    .filter((p) => typeof p === "string" && p.length > 0)
    .map((p) => [p, p]);
  const pattern = toolInput.pattern;
  if (toolName === "Glob" && typeof pattern === "string" && path.isAbsolute(pattern)) {
    out.push([pattern, globBase(pattern)]);
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

  for (const [shown, p] of targets(payload.tool_name, payload.tool_input || {})) {
    if (!isInside(p)) {
      deny(
        `Scope guard: "${shown}" resolves outside this project's folder. ` +
          "Reads and writes must stay inside the workspace root."
      );
      break;
    }
  }
  process.exit(0);
});
