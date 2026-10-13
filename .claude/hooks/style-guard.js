#!/usr/bin/env node
// PreToolUse hook: denies any Write/Edit/NotebookEdit call that would put a
// banned marketing superlative or an em/en dash into a prose file. See
// Feedback/no-marketing-superlatives.md for why this exists as a hard gate
// rather than a documented-only rule: the documented rule alone kept getting
// violated across sessions.
//
// Registered in .claude/settings.json on the "Write|Edit|NotebookEdit"
// matcher. Reads the hook payload as JSON on stdin. To deny, it prints a
// PreToolUse decision on stdout (hookSpecificOutput.permissionDecision =
// "deny"); otherwise it prints nothing and exits 0, leaving the normal
// permission flow alone.
//
// Only prose files are checked (PROSE_EXTENSIONS). Code is out of scope: this
// file has to contain the banned words to ban them. The rule file itself is
// exempt for the same reason, it has to quote the list it documents.

const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const BANNED_PHRASES = [
  /best[- ]in[- ]class/i,
  /revolutionary/i,
  /game[- ]chang(er|ing)/i,
  /must[- ]have/i,
  /unparalleled/i,
];

// Built from character codes (8211 = en dash, 8212 = em dash) so this source
// file never contains the glyphs it bans.
const BANNED_DASH_CHARS = [8211, 8212].map((c) => String.fromCharCode(c));

const PROSE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".ipynb"]);
const EXEMPT = new Set(["Feedback/no-marketing-superlatives.md"]);

function relativeTarget(toolInput) {
  const target = toolInput.file_path || toolInput.notebook_path;
  if (typeof target !== "string" || !target) return null;
  return path.relative(ROOT, path.resolve(ROOT, target)).split(path.sep).join("/");
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

function snippet(text, idx, len) {
  return text.slice(Math.max(0, idx - 30), idx + len + 30).replace(/\s+/g, " ");
}

function findViolation(text) {
  for (const ch of BANNED_DASH_CHARS) {
    const idx = text.indexOf(ch);
    if (idx !== -1) {
      const name = ch.charCodeAt(0) === 8212 ? "em dash (U+2014)" : "en dash (U+2013)";
      return `${name} found near: "${snippet(text, idx, 1)}"`;
    }
  }
  for (const re of BANNED_PHRASES) {
    const m = re.exec(text);
    if (m) return `banned superlative "${m[0]}" found near: "${snippet(text, m.index, m[0].length)}"`;
  }
  return null;
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
  const rel = relativeTarget(toolInput);
  if (!rel || EXEMPT.has(rel) || !PROSE_EXTENSIONS.has(path.extname(rel).toLowerCase())) {
    process.exit(0);
  }

  const violation = findViolation(newText(payload.tool_name, toolInput));
  if (violation) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `Style guard: ${violation}. See Feedback/no-marketing-superlatives.md, ` +
            "rewrite before saving.",
        },
      })
    );
  }
  process.exit(0);
});
