#!/usr/bin/env node
// PreToolUse hook on Bash: inside the brand-voice-reviewer subagent, the
// only shell command allowed is the style check on one or more files in
// this project:
//   node scripts/style-check.js <file> [<file>...]
// Anything else from that agent is denied: other commands, chaining (; &&
// || |), redirection, command substitution, environment prefixes, a path
// with ".." or an absolute path. The agent's prompt says the same thing in
// prose; this makes it a rule the agent can't talk itself past.
//
// Which agent made the call comes from the hook input's agent_type field,
// which Claude Code sets when a hook fires inside a subagent (and for the
// agent chosen with --agent). A plugin-scoped name ending in
// ":brand-voice-reviewer" counts too. In the main thread and in every
// other agent the hook prints nothing, so the normal permission flow
// (settings.json allow and deny rules, the user's prompt) decides.
//
// Known limit: a Claude Code version that does not send agent_type cannot
// be told apart from the main thread, and the hook then does nothing.
// The tests pin the field name; the README says what to do if it changes.
//
// Registered in .claude/settings.json on the "Bash" matcher. Malformed
// input and internal errors: see lib/hook-io.js (fail-open by default,
// GUARD_FAIL_CLOSED=1 to deny instead).

const { runGuard } = require("./lib/hook-io");

const RESTRICTED_AGENT = "brand-voice-reviewer";
// One or more relative paths made of plain characters (no spaces, quotes,
// shell metacharacters, leading "/" or "-"), and no ".." segment.
const ALLOWED = /^node scripts\/style-check\.js((?: [A-Za-z0-9_][A-Za-z0-9_./-]*)+)$/;

function allowed(command) {
  const m = command.match(ALLOWED);
  return !!m && m[1].trim().split(" ").every((arg) => !arg.split("/").includes(".."));
}

function isRestricted(agentType) {
  return typeof agentType === "string" && (agentType === RESTRICTED_AGENT || agentType.endsWith(":" + RESTRICTED_AGENT));
}

runGuard("bash-guard", (payload) => {
  if (payload.tool_name !== "Bash" || !isRestricted(payload.agent_type)) return null;
  const command = String((payload.tool_input || {}).command || "").trim();
  if (allowed(command)) return null;
  return (
    `Bash guard: ${RESTRICTED_AGENT} may only run "node scripts/style-check.js <file>..." ` +
    "on files inside this project, with no other command, chaining, redirection or substitution. " +
    "Ask the calling thread to save the draft to a file first."
  );
});
