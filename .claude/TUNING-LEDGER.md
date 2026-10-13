# Tuning ledger

Friction observed during a real run of a skill or agent, logged here
instead of only patched around in the moment - see
[Feedback/procedure-drift-logging.md](../Feedback/procedure-drift-logging.md).
Format: `- [ ] YYYY-MM-DD: path - what happened`. `procedure-tuner` (see
`.claude/agents/procedure-tuner.md`) reviews unresolved lines - a
`SessionStart` hook flags this automatically whenever one exists - and
marks each `- [x]` once handled. Resolved lines stay in the file as
history, never deleted.

## Entries

- [x] 2026-01-22: .claude/agents/inventory-researcher.md - noticed while reviewing this agent that it's granted `Edit`, but its own text says "You do not write the listing yourself" and nothing in its steps ever touches a file. Looks like a copy-paste leftover from an earlier draft that also wrote the listing. Fixed: removed `Edit` from the `tools:` list.
