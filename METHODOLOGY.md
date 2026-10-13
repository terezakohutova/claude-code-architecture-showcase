# How to organize a CLAUDE.md knowledge structure

A generic methodology for giving Claude Code a durable memory structure for
a personal or small-business project - not tied to any specific domain.
Copy this file into the root of a new project and let the structure grow
organically as real work happens, rather than building it all up front.

## 0. What Claude Code actually loads, and when

The structure below is built around this, so it is worth being exact:

- **`CLAUDE.md` loads in full at the start of every session**: the one in
  the project root (and in parent folders above it), plus the user-level
  `~/.claude/CLAUDE.md`. A `CLAUDE.md` in a subfolder loads only when
  Claude reads files in that subfolder. An `@path/to/file` import inside
  `CLAUDE.md` pulls that file in at startup too.
- **A plain Markdown link does not load anything.** `Feedback/INDEX.md`,
  topic files and the log are read only when a session follows a link to
  them (because a trigger in `CLAUDE.md` told it to) or someone asks.
  They cost nothing until then, and they are also not guaranteed to be
  seen. That is the trade-off this whole method manages.
- **Skills: the name and `description` from each `SKILL.md` frontmatter
  load every session; the body loads only when the skill is used.** A
  skill is cheap to have around, and its description is what decides
  whether it gets used, so it needs to say when.
- **Agents: the name and `description` are visible to the main session;
  the body is the agent's own system prompt** and only runs inside that
  agent, with the tools its `tools:` line grants.
- **Hooks and permissions are not context at all.** They are enforced by
  Claude Code whether or not anything was read, which is why a rule that
  keeps being ignored moves from text into a hook (section 6).

## 1. CLAUDE.md is an index, not a warehouse

`CLAUDE.md` loads into every session automatically (section 0). Because of
that:

- Keep it short - roughly under 200 lines / 20 KB.
- Don't write long raw content into it (history, fact lists, detailed
  rules).
- Sections should mostly be **links** to topic files (a "Context" section
  is a short table of contents, not one long block of prose).
- When a section starts growing, that's the signal to split it into its
  own file and replace it with a link - not to let it keep growing.
- The organizing rules themselves (how logging works, what lives where,
  size caps) do belong directly in `CLAUDE.md` - that needs to be visible
  at the start of every session, not one click away.

## 2. Split by TOPIC, not by chronology

Create folders around the areas the project actually talks about, not one
flat pile of notes. Typical layout:

```
CLAUDE.md                 index + rules + a pointer to the current log
Feedback/                 rules about HOW Claude should work (see section 3)
  INDEX.md
  <category>/<rule>.md    (flat <rule>.md until there are enough to group)
Log/                      chronological diary, one file per month (section 5)
  2026-01.md
<Topic-A>/
  <topic>-reference.md    stable facts, rarely rewritten
  <topic>-status.md       current state, dated, expected to age
<Topic-B>/...
```

Inside topic folders (not `Feedback`, not `Log`) separate **facts that
rarely change** (`-reference.md`) from **current state that ages and needs
revisiting** (`-status.md`). This split saves context, because the
reference half never needs to be rewritten and can be trusted for longer.

## 3. Feedback (rules about how to work): one file, one rule

Any time a correction happens, or an unconventional approach gets
explicitly confirmed as right ("yes, exactly that"), it's a candidate for a
written rule - not just corrections, confirmations too, otherwise the
record drifts away from what's actually been validated over time.

Format for each file:

```markdown
---
name: short-kebab-name
description: one sentence - when this file is relevant
metadata:
  type: feedback   # or: user / project / reference
---

<The rule itself, one or two sentences.>

**Why:** <the reason given - often a specific incident or a strong preference>

**How to apply:** <when/where the rule kicks in, so edge cases can be judged>
```

The frontmatter here is a convention for people and for search (`grep
"type: feedback"`), not something Claude Code reads: it parses frontmatter
only in `SKILL.md` files and agent files. A Feedback file is plain text
that is read when a trigger sends a session to it, so the rule and its
"How to apply" have to make sense on their own.

Cross-link related rules with a normal relative Markdown link. A link to a
file that doesn't exist yet is fine as a note to self (it marks something
worth writing later), but it resolves to nothing, so don't rely on it.

## 4. An index needs a TRIGGER, not just a description

The most common mistake: an index line like "this rule says X" - that line
never actually gets opened in practice, because it doesn't say WHEN to open
it. Instead:

```markdown
- Before sending a message/email or making a bulk edit -> [Confirm before sending](Communication/confirm-before-sending.md)
- When writing about person X -> [Formal address rule](Communication/addressing-x.md)
```

Every index line reads as "**When situation A happens -> open file B**",
never "file B describes A".

## 5. Log: chronological diary, newest entries on top, split by month

- New entries go on top (reverse chronological), dated `YYYY-MM-DD`.
- Keep it brief: what got done, what's finished, what's still open for
  next time.
- Entry heading: `### YYYY-MM-DD - [CLOSED_]short descriptive title`. The
  title should name what the conversation actually dealt with (not a
  generic "worked on X") - the `CLOSED_` prefix goes before the title, and
  only when everything from that conversation is wrapped up with nothing
  left open for later; when unsure, ask rather than guess the prefix.
- Once one log file grows without bound, split by month
  (`Log/2026-01.md`, `Log/2026-02.md`...) and leave only a pointer to the
  current month in `CLAUDE.md`. Older months don't get deleted, they just
  stop being "current".

## 6. A recurring procedure becomes a skill, not a repeatedly-read rule

If there are 3+ rules that always apply together for the same recurring
task (e.g. "how to write a new listing"), combine them into
`.claude/skills/<name>/SKILL.md` as a checklist and **remove their lines
from `Feedback/INDEX.md`**. `INDEX.md` is not auto-loaded (section 0), but
it is the file every session is pointed at for gray areas, so each line in
it is something a session has to scan and judge. As a skill, the procedure
costs one description line per session and its body loads only when the
task comes up.

If a rule still gets broken after it is written down, re-read and
acknowledged, more emphasis does not help. Move it into a hook (a
`PreToolUse` check that denies the tool call) and test the hook inside a
real Claude Code session, not only from a terminal.

## 7. Sensitive material gets its own, prominent file

Things like "never write passwords/credentials, even on request" belong in
their own rule in a Security category, always high-visibility in the
index - this is one of the few categories where strictness beats
convenience.

## 8. "Trust" and standing permission

If the project owner says "yes, trust me in folder/topic X, stop asking
every time," write that down as its own rule (Decision-Making/Process
category) with the exact scope the trust covers - authorization applies
only to that scope, not generally to everything forever.

## 9. Record every larger reorganization - but in the Log, not permanently in CLAUDE.md

When the structure gets rearranged (a file split, renamed, merged), record
briefly: what changed, who asked for it and why, and what replaced the old
link/file. A future session then understands the history of decisions, not
just the current state - and won't propose reverting something that was
already deliberately retired.

**Where to write it:** once a given area has its own `Log/` (section 5),
the entry belongs there, not in `CLAUDE.md` - an unbounded changelog
section directly in `CLAUDE.md` breaks section 1 (it loads into every
session). Only while an area doesn't have a `Log/` yet (a brand-new
project, day one) is it temporarily fine to write a short entry directly
in `CLAUDE.md` - move it once `Log/` exists.

## 10. What does NOT belong in a written record (Feedback or otherwise)

- Anything derivable from the current code/file state (re-read it instead).
- Change history that version control already has: what was committed,
  when, by whom. Don't copy it into a Log entry or a rule.
- Ephemeral detail about work in progress (that's what in-session task
  tracking is for).

This does not rule out automatic snapshots of rule, agent and skill files
(a `PreToolUse` hook copying the old content before an edit). Version
control only has what was committed; in a working session most edits to
these files happen between commits, and a snapshot is the only copy of
the previous wording. Keep snapshots git-ignored and pruned to the last
few per file: they are a short-term undo, not a second history.

---

### Quick start for a new instance

1. Create `CLAUDE.md` with three sections: "How to log" (where the log
   lives, newest on top), "Rules" (empty, fills in over time) and
   "Context" (a table of contents: one line per topic file, skill and
   agent, each saying when to open it).
2. Don't rush to build out `Feedback/` in advance - create the first file
   once the first concrete rule actually shows up (a correction or
   confirmation happens).
3. Create `Log/` on day one, one file per month.
4. Only once a topic grows past a few lines in "Context" does it earn its
   own folder with the reference/status split.
