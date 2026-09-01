# Claude Code workspace architecture

A sanitized extract of the architecture behind a real, multi-domain Claude Code workspace that has been running production business and personal operations for months (inventory management, content generation, browser automation, correspondence drafting, cross-platform sync). All business data, names, and IDs in this repo are fictional (a made-up vintage-reselling shop called "Marlowe and Finch") - the structure and the design decisions are real.

## The problem this solves

Claude Code gets genuinely useful for recurring, high-stakes personal or business work once a few things are in place: it stops forgetting corrections between sessions, it stops flooding your context with noisy tool-call output, and it stops treating every task as a fresh generic problem when the same procedure runs weekly. None of that comes for free - it has to be built, and it decays if you don't keep it honest against what the code/config actually says.

## The five layers

```
CLAUDE.md                    index only - short, links out, never grows
  |
  +-- <Topic>/
  |     <topic>-reference.md   stable facts, rarely rewritten
  |     <topic>-status.md      current state, dated, expected to age
  |
  +-- Feedback/                 soft rules - one file per corrected/confirmed behavior
  |     INDEX.md                 trigger -> file, never "file X describes Y"
  |     <rule>.md                 rule + Why (the actual incident) + How to apply
  |
  +-- .claude/hooks/            hard rules - promoted from Feedback once soft
  |     *.js                     enforcement repeatedly failed to hold on its own
  |
  +-- .claude/skills/           repeated procedures (3+ recurring steps)
  |     <skill>/SKILL.md          become a checklist, drop out of the always-scanned index
  |
  +-- .claude/agents/           scoped delegates for recurring heavy/noisy work
  |     <agent>.md                minimal tools, single responsibility, own system prompt
  |
  +-- Log/                      chronological, newest on top, one file per month
        2026-01.md
```

**Why this order matters:** a correction starts as a one-off note in `Feedback/`. If it gets violated repeatedly despite being documented and re-read, that's the signal to promote it to a `.claude/hooks/` technical gate - a hook does not get tired of being polite about a rule. A procedure that needs the same 3+ steps every time it recurs stops being something to re-explain in every conversation and becomes a `SKILL.md`. A piece of work that's either heavy on tool calls (dozens of browser clicks, a long research fan-out) or needs a distinct kind of judgment (matching a brand's real voice vs. a formal style guide, holding a dispute's history) gets pulled out into its own `.claude/agents/*.md` - narrow tools, one job, returns a finished result instead of leaking hundreds of intermediate tool calls into the main conversation.

## See it run

Everything in `.claude/hooks/` and `.claude/skills/` here is real, working
code, not illustration. [`examples/hook-verification.md`](examples/hook-verification.md)
runs both hooks from a plain terminal, no Claude Code session required,
and shows the actual allow/deny output. [`examples/sample-listing.md`](examples/sample-listing.md)
is the unedited result of handing a fresh agent only the `product-listing`
skill and the two inventory files, no expected output written first.

## Self-extension: a skill built from watched inspiration, not a spec

[`examples/skill-generation-session.md`](examples/skill-generation-session.md)
is a case study of a different kind of session: instead of the owner
describing an automation up front, the agent was pointed at a folder of
saved short-form videos and asked to find what was actually worth
building. Six candidates came out of it, two were turned down with a
stated reason, and one (`.claude/skills/commitment-tracker/`) was built
and proven end to end, same blind-verification standard as the rest of
this repo, a fresh agent ran the skill for real on
[`examples/sample-call-notes.md`](examples/sample-call-notes.md) and the
unedited result is what's shown.

## What's in this repo

- `CLAUDE.md`, `ORGANIZACE.md` - the index file and the methodology doc that explains how to build this structure on a new project (deliberately written to be copy-pasted elsewhere, it doesn't reference this specific example).
- `Feedback/` - one real-shaped example: a style rule that started as a documented preference, kept getting violated, and was eventually backed by a hard hook. That escalation (soft rule -> repeated drift -> technical gate) is the most useful pattern in here to steal.
- `.claude/hooks/` - the two hooks referenced above, in working form: `scope-guard.js` (a subagent or a careless edit should never be able to touch files outside the project root) and `style-guard.js` (the technical enforcement for the Feedback rule).
- `.claude/skills/product-listing/` - one example of a recurring procedure written as a checklist skill, with a reference/status split for the data it depends on (`Inventory/`).
- `.claude/skills/commitment-tracker/` - a second skill, this one produced by the self-extension session described above rather than written from a spec, plus `TODO.md` as the plain file it writes to.
- `.claude/agents/` - two of the four custom agent archetypes that came out of the real workspace: a research agent (`inventory-researcher`, fans out web/data lookups with strict sourcing discipline and returns a clean writeup instead of dozens of search calls) and a review agent (`brand-voice-reviewer`, checks a draft against what's actually published, not the aspirational brand doc).
- `Log/` - one example entry showing the format (dated, newest on top, `CLOSED_` prefix only when nothing is left open).

## What's deliberately left out

The real workspace has four independent sub-projects, ~40 skills, several Gmail/Notion/browser-automation integrations, and a lot of business-specific detail (pricing, supplier names, dispute history, health data) that has no business being public. This repo keeps exactly enough of the shape to be useful as a reference, not a copy of anything real.

## Using this

Read `ORGANIZACE.md` first - it's the actual methodology, written generically. Then look at `Feedback/no-marketing-superlatives.md` to see the soft-rule-to-hook escalation in practice, and `.claude/agents/` to see how a "generic" default subagent (search, general research) differs from one written for a specific recurring job.
