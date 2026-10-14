# Tuning ledger

Friction observed during a real run of a skill or agent, logged here
instead of only patched around in the moment - see
[Feedback/procedure-drift-logging.md](../Feedback/procedure-drift-logging.md).
Format: `- [ ] YYYY-MM-DD: path - what happened`. A `SessionStart` hook
flags any unresolved line. `procedure-tuner` (see
`.claude/agents/procedure-tuner.md`) reviews it and proposes a diff; it
has no write tools. The main session applies a diff only after the owner
approves it, then marks the line `- [x]` with what changed. Resolved
lines stay in the file as history, never deleted.

## Entries

- [x] 2026-01-22: .claude/agents/inventory-researcher.md - noticed while reviewing this agent that it's granted `Edit`, but its own text says "You do not write the listing yourself" and nothing in its steps ever touches a file. Looks like a copy-paste leftover from an earlier draft that also wrote the listing. Fixed: removed `Edit` from the `tools:` list. (Applied by the tuner itself in this first run, before it became propose-only; see `examples/self-tuning-session.md`.)
