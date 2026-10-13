#!/usr/bin/env node
// PreToolUse hook: denies any Write/Edit/MultiEdit/NotebookEdit call that
// would put a banned marketing superlative or an em/en dash into
// customer-facing copy.
// See Feedback/no-marketing-superlatives.md for why this exists as a hard
// gate rather than a documented-only rule.
//
// Registered in .claude/settings.json on the
// "Edit|Write|MultiEdit|NotebookEdit" matcher. Reads the hook payload as
// JSON on stdin. To deny, it prints a PreToolUse decision on stdout
// (hookSpecificOutput.permissionDecision = "deny"); otherwise it prints
// nothing and exits 0, leaving the normal permission flow alone.
//
// What counts as copy, and what is banned, lives in lib/style-rules.js,
// shared with scripts/style-check.js so the on-demand check and this gate
// can't disagree. In short: only files under Inventory/listings/ and Copy/
// with a text extension are checked; Log/, Feedback/, TODO.md and other
// internal notes are not. Text in code spans and fenced blocks counts as
// quoted, not as the shop speaking; a blockquote does not, because in a
// listing the buyer sees it as part of the shop's text. In a notebook
// (.ipynb) only markdown cells are copy; code cells are skipped.
//
// On a malformed payload or an internal error (for example a missing
// Feedback/banned-phrases.json) it stays out of the way unless
// GUARD_FAIL_CLOSED=1 is set; see lib/hook-io.js for why.
//
// What it cannot see: anything that does not go through the file tools.
// A Bash `echo ... > file`, a browser automation typing into a marketplace
// form, or an MCP tool posting directly are all invisible to this hook.

const path = require("path");
const rules = require("./lib/style-rules");
const { runGuard } = require("./lib/hook-io");

const ROOT = path.resolve(__dirname, "..", "..");

function relativeTarget(toolInput, cwd) {
  const target = toolInput.file_path || toolInput.notebook_path;
  if (typeof target !== "string" || !target) return null;
  const base = typeof cwd === "string" && cwd ? path.resolve(ROOT, cwd) : ROOT;
  return rules.toPosix(path.relative(ROOT, path.resolve(base, target)));
}

// The text a call would put into the file, or null if nothing to check.
function newText(toolName, toolInput, rel) {
  const isNotebook = path.extname(rel).toLowerCase() === ".ipynb";
  switch (toolName) {
    case "Write":
      return isNotebook ? rules.notebookMarkdown(toolInput.content || "") : toolInput.content || "";
    case "Edit":
      return toolInput.new_string || "";
    case "MultiEdit":
      return (Array.isArray(toolInput.edits) ? toolInput.edits : []).map((e) => (e && e.new_string) || "").join("\n");
    case "NotebookEdit":
      // A code cell is code, a deleted cell adds nothing. Without a
      // cell_type (a replace keeps the cell's type) the text is checked.
      if (toolInput.edit_mode === "delete" || toolInput.cell_type === "code") return null;
      return toolInput.new_source || "";
    default:
      return null;
  }
}

runGuard("style-guard", (payload) => {
  const toolInput = payload.tool_input || {};
  const rel = relativeTarget(toolInput, payload.cwd);
  if (!rules.isCustomerCopy(rel)) return null;
  const text = newText(payload.tool_name, toolInput, rel);
  if (text === null) return null;
  const found = rules.findViolations(text);
  if (!found.length) return null;
  return (
    `Style guard: ${rules.describe(found[0])}` +
    (found.length > 1 ? ` (and ${found.length - 1} more)` : "") +
    ". See Feedback/no-marketing-superlatives.md, rewrite before saving."
  );
});
