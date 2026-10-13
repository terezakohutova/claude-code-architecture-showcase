// Shared plumbing for the PreToolUse guards (scope-guard, style-guard,
// bash-guard): read the payload, run the check, print a deny in the
// documented shape, and decide what an internal error means.
//
// Fail-open by default. If the payload is not valid JSON, or the check
// itself throws (a bug, a missing data file), the guard prints nothing and
// exits 0, so the call goes on to Claude Code's normal permission flow.
// Why: Claude Code always sends valid JSON, so a parse failure means the
// guard is broken, not that the call is hostile, and a broken guard that
// blocks every file and shell call stops all work, including the work of
// fixing the guard. The error is written to stderr so it is not silent.
//
// Set GUARD_FAIL_CLOSED=1 to flip that: any internal error becomes a deny
// that names the error. Use it where a missed check costs more than a
// stalled session.

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

function failClosed() {
  return process.env.GUARD_FAIL_CLOSED === "1";
}

// check(payload) returns a deny reason, or null to stay out of the way.
function runGuard(name, check) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    let reason = null;
    try {
      reason = check(JSON.parse(raw));
    } catch (e) {
      process.stderr.write(`${name}: internal error, ${e && e.message ? e.message : e}\n`);
      if (failClosed()) reason = `${name}: internal error (${e && e.message ? e.message : e}); GUARD_FAIL_CLOSED=1 is set, so the call is denied.`;
    }
    if (reason) deny(reason);
    process.exit(0);
  });
}

module.exports = { deny, runGuard, failClosed };
