# Claude Code workspace architecture

[![CI](https://github.com/terezakohutova/claude-code-architecture-showcase/actions/workflows/ci.yml/badge.svg)](https://github.com/terezakohutova/claude-code-architecture-showcase/actions/workflows/ci.yml)

A sanitized extract of the structure behind a real, multi-domain Claude Code
workspace that has run day-to-day business and personal operations for
months (inventory, content, browser automation, correspondence drafting,
cross-platform sync). Every business detail here is fictional, a made-up
vintage-reselling shop called "Marlowe and Finch". The structure, the hooks
and the design decisions are the real ones.

Nothing here is illustration only. The four hooks run in Claude Code and are
covered by a test suite, CI runs it on Linux, macOS and Windows, and each
example in `examples/` is the unedited output of a real run.

```
npm test            # 36 hook tests + docs check (Node 18+, no dependencies)
```

## The problem this solves

Claude Code gets useful for recurring, high-stakes work once a few things
are in place: it stops forgetting corrections between sessions, it stops
flooding the conversation with noisy tool output, and it stops treating a
procedure that runs every week as a fresh, generic problem. None of that
comes for free. It has to be built, and it decays unless it is kept honest
against what the files actually say.

## The layers

```
CLAUDE.md                    index only - short, links out, never grows
  |
  +-- <Topic>/
  |     <topic>-reference.md   stable facts, rarely rewritten
  |     <topic>-status.md      current state, dated, expected to age
  |
  +-- Feedback/                 soft rules - one file per corrected/confirmed behavior
  |     INDEX.md                 trigger -> file, never "file X describes Y"
  |     <rule>.md                rule + Why (the actual incident) + How to apply
  |
  +-- .claude/hooks/            hard rules - promoted from Feedback once soft
  |     *.js                     enforcement repeatedly failed to hold on its own
  |
  +-- .claude/skills/           repeated procedures (3+ recurring steps)
  |     <skill>/SKILL.md         a checklist, out of the always-scanned index
  |
  +-- .claude/agents/           scoped delegates for recurring heavy/noisy work
  |     <agent>.md               minimal tools, single responsibility, own prompt
  |
  +-- Log/                      chronological, newest on top, one file per month
        2026-01.md
```

**Why this order matters:** a correction starts as a one-off note in
`Feedback/`. If it keeps getting violated even though it is documented and
re-read, that is the signal to promote it to a hook: a hook does not get
tired of a rule. A procedure that needs the same 3+ steps every time becomes
a `SKILL.md` instead of being re-explained in every conversation. Work that
is heavy on tool calls (dozens of browser clicks, a long research fan-out)
or needs a distinct kind of judgment (the brand's real voice vs. its style
guide) becomes its own agent: narrow tools, one job, and a finished result
back instead of hundreds of intermediate tool calls in the main thread.

## The hooks

Registered in [`.claude/settings.json`](.claude/settings.json), plain Node,
no dependencies.

| Hook | Event / matcher | What it does |
|---|---|---|
| [`scope-guard.js`](.claude/hooks/scope-guard.js) | PreToolUse, `Read\|Edit\|Write\|NotebookEdit\|Glob\|Grep` | Denies a file tool call whose target resolves outside the project folder (absolute paths, `../` traversal, absolute Glob patterns, symlinks that point out). |
| [`style-guard.js`](.claude/hooks/style-guard.js) | PreToolUse, `Edit\|Write\|NotebookEdit` | Denies writing a banned superlative or an em/en dash into a prose file. The hard half of [a Feedback rule](Feedback/no-marketing-superlatives.md). |
| [`version-snapshot.js`](.claude/hooks/version-snapshot.js) | PreToolUse, `Edit\|Write\|NotebookEdit` | Copies the current content of a rule, agent, skill or `CLAUDE.md` to `.versions/` before it changes, only when it differs from the last copy. Never blocks. |
| [`tuning-ledger-check.js`](.claude/hooks/tuning-ledger-check.js) | SessionStart | If [the tuning ledger](.claude/TUNING-LEDGER.md) has an open line, tells the new session to run `procedure-tuner` first. |

A deny is the documented PreToolUse decision on stdout
(`hookSpecificOutput.permissionDecision: "deny"` plus a reason Claude sees).
Anything allowed gets no output at all, so Claude Code's normal permission
prompts still apply; a guard that answered "allow" would silently approve
every file call. A malformed payload makes a hook exit 0 without output: a
broken guard should not stop all work.

## See it run

- [`examples/hook-verification.md`](examples/hook-verification.md) - each
  hook run from a terminal with the sample payloads in
  [`examples/payloads/`](examples/payloads), then all four inside a real
  Claude Code session, with the verbatim hook messages.
- [`tests/hooks.test.js`](tests/hooks.test.js) - the same contract as a
  test suite, run in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
  on Ubuntu, macOS and Windows.
- [`examples/sample-listing.md`](examples/sample-listing.md) - the unedited
  result of handing a fresh agent only the `product-listing` skill and the
  two inventory files, no expected output written first.

## Self-extension: a skill built from watched inspiration, not a spec

[`examples/skill-generation-session.md`](examples/skill-generation-session.md)
is a different kind of session. Instead of the owner describing an
automation up front, the agent was pointed at a folder of saved short-form
videos and asked what was worth building. Six candidates came out, two more
ideas were turned down with a stated reason, and one
([`commitment-tracker`](.claude/skills/commitment-tracker/SKILL.md)) was
built and verified the same way as the rest of this repo: a fresh agent ran
it on [`examples/sample-call-notes.md`](examples/sample-call-notes.md) and
the unedited result is what's shown.

## A second escalation path: friction observed at runtime

The style-guard path (soft rule -> repeated drift -> hook) only catches what
a hook can scan as content gets written. It does not catch a skill or agent
definition going stale: a tool grant copied from another file and never
trimmed, a reference to something renamed.
[`examples/self-tuning-session.md`](examples/self-tuning-session.md) walks
through the second path. Friction is logged to the tuning ledger the moment
it's noticed ([`Feedback/procedure-drift-logging.md`](Feedback/procedure-drift-logging.md)),
the SessionStart hook flags any open line, and
[`procedure-tuner`](.claude/agents/procedure-tuner.md) fixes it. One issue
was seeded for the demo (a dead `Edit` grant on `inventory-researcher`); a
fresh agent given only `procedure-tuner.md` found it, fixed it and closed
the ledger line.

## A safety net for the rules themselves: automatic versions

Rules, agent prompts and skills get edited all the time, by the owner and by
Claude, and an "improvement" can quietly make one worse.
`version-snapshot.js` keeps the previous content of every protected file in
`.versions/<path>/<timestamp>.md` (git-ignored), so going back is a file
copy, not an attempt to remember what the rule used to say. In the real
workspace the same pattern protects the files a set of ads agents depends
on, next to a change ledger for the live ad accounts, where no undo button
exists.

## Limitations, stated plainly

- `scope-guard` covers the file tools. A `Bash` command can still read or
  write outside the folder; for that use permission rules or Claude Code's
  sandbox. The hook is a guardrail against careless calls, not a security
  boundary.
- `style-guard` is a fixed regex list and checks prose files only (`.md`,
  `.txt`, notebooks). The hook source has to contain the words it bans, and
  the rule file has to quote them, so both are out of its scope.
- The hooks need `node` on `PATH`. They were run in Claude Code 2.1 on
  Windows 11 and are tested on Linux and macOS in CI.

## What's in this repo

- [`CLAUDE.md`](CLAUDE.md) and [`METHODOLOGY.md`](METHODOLOGY.md) - the
  index file, and the method for building this structure on a new project
  (generic on purpose, it doesn't reference this example).
- [`Feedback/`](Feedback/INDEX.md) - two rules: the style rule that got
  escalated to a hook, and the rule that feeds the tuning ledger.
- [`.claude/hooks/`](.claude/hooks) - the four hooks above.
- [`.claude/skills/`](.claude/skills) - `product-listing`, a recurring
  procedure as a checklist, with a reference/status split for the data it
  reads ([`Inventory/`](Inventory)); and `commitment-tracker`, from the
  self-extension session, writing to [`TODO.md`](TODO.md).
- [`.claude/agents/`](.claude/agents) - three agent archetypes from the real
  workspace: research (`inventory-researcher`, strict sourcing, returns a
  clean writeup instead of dozens of search calls), review
  (`brand-voice-reviewer`, checks a draft against what is actually
  published, not the aspirational brand doc) and self-tuning
  (`procedure-tuner`, compares what the other agents and skills declare
  with what they use).
- [`Log/`](Log/2026-01.md) - one month showing the format (dated, newest on
  top, `CLOSED_` prefix only when nothing is left open).
- [`tests/`](tests), [`scripts/check-docs.js`](scripts/check-docs.js) and
  the CI workflow - the hook tests, plus a check that every link and quoted
  path in the docs resolves and that the docs follow their own no-dash rule.

## What's deliberately left out

The real workspace has four independent sub-projects, about 40 skills,
several mail/notes/browser-automation integrations, and a lot of
business-specific detail (pricing, supplier names, dispute history) that has
no business being public. This repo keeps enough of the shape to be useful
as a reference, not a copy of anything real.

## Using this

Read [`METHODOLOGY.md`](METHODOLOGY.md) first, it's the actual method. Then
[`Feedback/no-marketing-superlatives.md`](Feedback/no-marketing-superlatives.md)
for the soft-rule-to-hook escalation in practice, and
[`.claude/agents/`](.claude/agents) for how an agent written for one
recurring job differs from a generic research subagent. To reuse the hooks,
copy `.claude/hooks/` and the `hooks` block of `.claude/settings.json`, then
run `npm test` against your copy.
