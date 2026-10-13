#!/usr/bin/env node
// SessionStart hook: flags unresolved lines in .claude/TUNING-LEDGER.md so
// procedure-tuner gets run at the start of the next session instead of
// waiting for someone to notice and ask. See
// Feedback/procedure-drift-logging.md for why the ledger exists.
//
// Registered in .claude/settings.json under "SessionStart" with the matcher
// "startup", so it fires on a new session only: not on --resume/--continue
// (the resumed session already saw it), not after /clear or a compaction.
// Writes a hookSpecificOutput.additionalContext block to stdout when there's
// unresolved work, writes nothing otherwise.
//
// The context it adds asks for proposals, not changes: procedure-tuner has
// no write tools and every fix waits for the person running the workspace
// to approve it (see .claude/agents/procedure-tuner.md).

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
          "TUNING-LEDGER.md has unresolved entries ('- [ ]'). Tell the " +
          "user, and offer to run procedure-tuner " +
          "(.claude/agents/procedure-tuner.md) on them. It returns proposed " +
          "diffs only. Apply a diff, and mark its ledger line '- [x]', only " +
          "after the user explicitly approves that diff.",
      },
    })
  );
}
