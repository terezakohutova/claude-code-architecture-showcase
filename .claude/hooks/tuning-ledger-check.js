#!/usr/bin/env node
// SessionStart hook: flags unresolved lines in .claude/TUNING-LEDGER.md so
// procedure-tuner gets run at the start of the next session instead of
// waiting for someone to notice and ask. See
// Feedback/procedure-drift-logging.md for why the ledger exists.
//
// Registered in .claude/settings.json under "SessionStart". Writes a
// hookSpecificOutput.additionalContext block to stdout when there's
// unresolved work, writes nothing otherwise.

const fs = require("fs");
const path = require("path");

const LEDGER_FILE = path.resolve(__dirname, "..", "TUNING-LEDGER.md");

function hasUnresolvedEntries() {
  let content;
  try {
    content = fs.readFileSync(LEDGER_FILE, "utf8");
  } catch (e) {
    return false; // no ledger file yet - nothing to do
  }
  return /^- \[ \]/m.test(content);
}

if (hasUnresolvedEntries()) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "TUNING-LEDGER.md has unresolved entries ('- [ ]'). Before " +
          "anything else this session, run procedure-tuner " +
          "(.claude/agents/procedure-tuner.md) against each one, apply or " +
          "report fixes per its own checklist, and mark handled lines " +
          "'- [x]' in the ledger.",
      },
    })
  );
}
