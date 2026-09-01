#!/usr/bin/env node
// PreToolUse hook: refuses any Read/Edit/Write/Glob/Grep call whose target
// path resolves outside this workspace root. Prevents a careless edit or a
// subagent from touching files elsewhere on disk.
//
// Registered in .claude/settings.json on the "Read|Edit|Write|NotebookEdit|Glob|Grep"
// matcher. Reads the tool call as JSON on stdin, writes a permission
// decision as JSON on stdout.

const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function extractPaths(toolInput) {
  if (!toolInput) return [];
  const candidates = [
    toolInput.file_path,
    toolInput.path,
    toolInput.notebook_path,
  ].filter(Boolean);
  return candidates;
}

(async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch (err) {
    // If the payload can't be parsed, fail open rather than blocking
    // legitimate work on a hook bug - but this should never happen in
    // practice given the harness controls the input format.
    process.stdout.write(JSON.stringify({ permissionDecision: "allow" }));
    return;
  }

  const toolInput = payload.tool_input || {};
  const paths = extractPaths(toolInput);

  for (const p of paths) {
    const resolved = path.resolve(WORKSPACE_ROOT, p);
    if (!resolved.startsWith(WORKSPACE_ROOT + path.sep) && resolved !== WORKSPACE_ROOT) {
      process.stdout.write(
        JSON.stringify({
          permissionDecision: "deny",
          permissionDecisionReason: `Scope guard: "${p}" resolves outside the workspace root (${WORKSPACE_ROOT}). Reads and writes must stay inside this project.`,
        })
      );
      return;
    }
  }

  process.stdout.write(JSON.stringify({ permissionDecision: "allow" }));
})();
