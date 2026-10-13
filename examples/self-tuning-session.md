# A second escalation path: friction observed at runtime, not a documented rule

`Feedback/no-marketing-superlatives.md` shows one escalation pattern: a
documented rule keeps getting violated, so it gets backed by a hard hook
(`style-guard.js`). That pattern only fires for content the hook can scan as
it's written. It doesn't catch a different kind of drift: a skill or agent's
own definition quietly going stale - a tool grant nobody trimmed after the
file it was copied from changed, a reference to something that got renamed.
Nobody scans for that on a schedule, so it usually surfaces mid-task, gets
worked around, and sits there for the next run to trip over again.

`.claude/TUNING-LEDGER.md` plus `procedure-tuner` is the second escalation
path, for that kind of drift specifically: log the friction the moment it's
noticed (`Feedback/procedure-drift-logging.md`), and a `SessionStart` hook
(`.claude/hooks/tuning-ledger-check.js`) flags any unresolved line so the
next session raises it and offers `procedure-tuner` without anyone having
to remember to ask.

## The seeded case

For this demo, one real issue was deliberately introduced into
`.claude/agents/inventory-researcher.md`: its `tools:` line was changed to
add `Edit`, even though the agent's own body says plainly "You do not write
the listing yourself" and never touches a file in any of its steps - the
kind of leftover that happens in practice when a tool grant gets copied from
another agent's frontmatter and never trimmed. A matching line was added to
`.claude/TUNING-LEDGER.md` describing exactly that.

## Proof it runs, not just a description

A fresh agent was given only `.claude/agents/procedure-tuner.md` as its
operating instructions - no other context about why the task existed - and
told to follow it exactly against the seeded ledger entry. No expected
output was written first. The quotes and diffs below are copied from that
run's report and from the files afterwards; the session transcript was not
kept, so this page is the record, not a reproducible log.

That run used the earlier version of `procedure-tuner`, which had `Edit`
and applied mechanical fixes itself. Since 2026-10-13 it has no write
tools and returns proposed diffs that the owner approves one by one (see
"The guard" in the agent file). The same seeded case today would end with
the diff below being proposed, then applied by the main session after a
yes.

**What it found:**

> `.claude/TUNING-LEDGER.md` had one unresolved entry, dated 2026-01-22,
> targeting `.claude/agents/inventory-researcher.md`: the agent was granted
> `Edit` in its `tools:` frontmatter despite its own body explicitly stating
> "You do not write the listing yourself" and containing no step that
> touches a file. I read the full agent file and confirmed the report was
> accurate - nothing in "Before researching," "Sourcing discipline," or
> "What you return" performs a write; the only file interaction described
> is reading `Inventory/inventory-reference.md`.

**What it changed** (the file before and after):

```diff
-tools: Read, Grep, Glob, WebFetch, WebSearch, Edit
+tools: Read, Grep, Glob, WebFetch, WebSearch
```

**Why it fixed rather than flagged:** "a mechanical, reversible, single-file
tool-grant fix," per the fix-vs-report rule `procedure-tuner.md` had then - it also
reported explicitly finding nothing that warranted flagging instead
("No structural issue - merge, rename, scope shift - turned up in this
file").

**Ledger closed out** (the ledger line before and after):

```diff
-- [ ] 2026-01-22: .claude/agents/inventory-researcher.md - noticed while reviewing this agent that it's granted `Edit`, but its own text says "You do not write the listing yourself" and nothing in its steps ever touches a file. Looks like a copy-paste leftover from an earlier draft that also wrote the listing.
+- [x] 2026-01-22: .claude/agents/inventory-researcher.md - noticed while reviewing this agent that it's granted `Edit`, but its own text says "You do not write the listing yourself" and nothing in its steps ever touches a file. Looks like a copy-paste leftover from an earlier draft that also wrote the listing. Fixed: removed `Edit` from the `tools:` list.
```

## Why this is the interesting part, not the seeded bug itself

An unused tool grant on one agent is not, by itself, an interesting finding.
What's worth reusing is the mechanism around it: a place to put "the
definition itself caused this, not the task" the moment it's noticed, a
hook that turns an unresolved line into something the next session actually
raises instead of a note nobody reopens, and a reviewer narrow enough to
tell a one-line fix from a structural decision. An agent that rewrites the
instructions other agents follow is also the riskiest thing in the
workspace, which is why it now proposes and a person approves.
