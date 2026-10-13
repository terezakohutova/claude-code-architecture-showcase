#!/usr/bin/env node
// PreToolUse hook: denies any Write/Edit/NotebookEdit call that would put a
// banned marketing superlative or an em/en dash into customer-facing copy.
// See Feedback/no-marketing-superlatives.md for why this exists as a hard
// gate rather than a documented-only rule.
//
// Registered in .claude/settings.json on the "Write|Edit|NotebookEdit"
// matcher. Reads the hook payload as JSON on stdin. To deny, it prints a
// PreToolUse decision on stdout (hookSpecificOutput.permissionDecision =
// "deny"); otherwise it prints nothing and exits 0, leaving the normal
// permission flow alone.
//
// What counts as copy, and what is banned, lives in lib/style-rules.js,
// shared with scripts/style-check.js so the on-demand check and this gate
// can't disagree. In short: only files under Inventory/listings/ and Copy/
// with a text extension are checked; Log/, Feedback/, TODO.md and other
// internal notes are not. Text in code spans, fenced blocks and blockquotes
// counts as quoted, not as the shop speaking.
//
// What it cannot see: anything that does not go through the file tools.
// A Bash `echo ... > file`, a browser automation typing into a marketplace
// form, or an MCP tool posting directly are all invisible to this hook.

const path = require("path");
const rules = require("./lib/style-rules");

const ROOT = path.resolve(__dirname, "..", "..");

function relativeTarget(toolInput, cwd) {
  const target = toolInput.file_path || toolInput.notebook_path;
  if (typeof target !== "string" || !target) return null;
  const base = typeof cwd === "string" && cwd ? path.resolve(ROOT, cwd) : ROOT;
  return rules.toPosix(path.relative(ROOT, path.resolve(base, target)));
}

function newText(toolName, toolInput) {
  switch (toolName) {
    case "Write":
      return toolInput.content || "";
    case "Edit":
      return toolInput.new_string || "";
    case "NotebookEdit":
      return toolInput.new_source || "";
    default:
      return "";
  }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    process.exit(0); // never block on a malformed payload
  }

  const toolInput = payload.tool_input || {};
  const rel = relativeTarget(toolInput, payload.cwd);
  if (!rules.isCustomerCopy(rel)) process.exit(0);

  const found = rules.findViolations(newText(payload.tool_name, toolInput));
  if (found.length) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `Style guard: ${rules.describe(found[0])}` +
            (found.length > 1 ? ` (and ${found.length - 1} more)` : "") +
            ". See Feedback/no-marketing-superlatives.md, rewrite before saving.",
        },
      })
    );
  }
  process.exit(0);
});
