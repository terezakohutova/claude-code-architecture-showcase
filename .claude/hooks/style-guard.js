#!/usr/bin/env node
// PreToolUse hook: denies any Write/Edit call whose new content contains a
// banned marketing superlative or an em/en dash character. See
// Feedback/no-marketing-superlatives.md for why this exists as a hard
// gate rather than a documented-only rule - the short version is that the
// documented rule alone kept getting violated across sessions.
//
// Registered in .claude/settings.json on the "Write|Edit" matcher. Reads
// the tool call as JSON on stdin, writes a permission decision as JSON on
// stdout.

const BANNED_PHRASES = [
  /best[- ]in[- ]class/i,
  /revolutionary/i,
  /game[- ]chang(er|ing)/i,
  /must[- ]have/i,
  /unparalleled/i,
];

// Banned punctuation built from character codes (8211 = en dash,
// 8212 = em dash) rather than from a literal glyph in this source file.
const BANNED_DASH_CODES = [8211, 8212];
const BANNED_DASH_CHARS = BANNED_DASH_CODES.map((c) => String.fromCharCode(c));

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function contentToCheck(toolName, toolInput) {
  if (toolName === "Write") return toolInput.content || "";
  if (toolName === "Edit") return toolInput.new_string || "";
  return "";
}

function findViolation(text) {
  for (const ch of BANNED_DASH_CHARS) {
    const idx = text.indexOf(ch);
    if (idx !== -1) {
      return `banned dash character found near: "${text.slice(Math.max(0, idx - 30), idx + 30)}"`;
    }
  }
  for (const re of BANNED_PHRASES) {
    const m = text.match(re);
    if (m) {
      const idx = text.indexOf(m[0]);
      return `banned superlative "${m[0]}" found near: "${text.slice(Math.max(0, idx - 30), idx + 30)}"`;
    }
  }
  return null;
}

(async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch (err) {
    process.stdout.write(JSON.stringify({ permissionDecision: "allow" }));
    return;
  }

  const toolName = payload.tool_name;
  const toolInput = payload.tool_input || {};
  const text = contentToCheck(toolName, toolInput);
  const violation = findViolation(text);

  if (violation) {
    process.stdout.write(
      JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: `Style guard: ${violation}. See Feedback/no-marketing-superlatives.md - rewrite before saving.`,
      })
    );
    return;
  }

  process.stdout.write(JSON.stringify({ permissionDecision: "allow" }));
})();
