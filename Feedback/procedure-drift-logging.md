---
name: procedure-drift-logging
description: When a skill or agent's own definition causes a real problem during a run (dead tool grant, stale file reference, unclear trigger), log it to .claude/TUNING-LEDGER.md instead of only working around it in the moment.
metadata:
  type: feedback
---

A `.claude/skills/*/SKILL.md` or `.claude/agents/*.md` file can go stale the
same way any other document does: a referenced file gets renamed, a tool
grant gets copied from another file and never trimmed, a trigger sentence
that made sense alone starts overlapping a newer sibling. The person running
the workspace usually only notices this the moment it actually breaks
something mid-task, fixes the immediate problem, and moves on - and the same
drift sits there waiting to bite the next run.

**Why:** Fixing the task in front of you and fixing the definition that
caused the problem are two different actions, and only the first one
happens by reflex. Without a place to put the second one, it depends on
someone remembering to come back to it later, which does not reliably
happen.

**How to apply:** The moment you notice a skill or agent's own text (not the
task, not the outside world) caused a wrong tool call, a broken reference,
or a misfire, add a line to `.claude/TUNING-LEDGER.md`
(`- [ ] YYYY-MM-DD path - what happened`) before moving on. `procedure-tuner`
(see `.claude/agents/procedure-tuner.md`) is the one that reads and closes
these out, either automatically (a `SessionStart` hook flags unresolved
lines) or on direct request. Do not log ordinary task failures caused by the
outside world (a site being down, a file being locked) - only problems the
definition itself is responsible for.
