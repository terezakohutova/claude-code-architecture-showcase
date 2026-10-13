# Claude Code workspace architecture

[![CI](https://github.com/terezakohutova/claude-code-architecture-showcase/actions/workflows/ci.yml/badge.svg)](https://github.com/terezakohutova/claude-code-architecture-showcase/actions/workflows/ci.yml)

A sanitized extract of the structure behind a real, multi-domain Claude Code
workspace that has run day-to-day business and personal operations for
months (inventory, content, browser automation, correspondence drafting,
cross-platform sync). Every business detail here is fictional, a made-up
vintage-reselling shop called "Marlowe and Finch". The structure, the hooks
and the design decisions are the real ones.

The five hooks run in Claude Code and are covered by a test suite that CI
runs on Linux with Node 18, 20 and 22, and on macOS and Windows with
Node 22. One example has
a saved session transcript: a headless Claude Code run in which the hooks
blocked and allowed what they should
([`examples/hook-verification.md`](examples/hook-verification.md)). The
other examples are reports from agent runs whose transcripts were not
kept; each one says so.

```
npm test            # hook, style check and settings tests + docs check (Node 18.17+, no dependencies)
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

| Hook | Event / matcher | What it does | On malformed input or internal error |
|---|---|---|---|
| [`scope-guard.js`](.claude/hooks/scope-guard.js) | PreToolUse, `Read|Edit|Write|MultiEdit|NotebookEdit|Glob|Grep` | Denies a file tool call whose target resolves outside the project folder: absolute paths, `../` traversal (resolved against the session's cwd), `~`, symlinks that point out, and Glob patterns and Grep `glob` filters, relative or absolute, including a `..` after a wildcard. Brace alternatives (`{a,{b,c}}`) are expanded and each one is checked. Also denies any write to `.claude/settings.json`, the per-user `settings.local.json` next to it and `.claude/hooks/`, so the agent can't switch its own guardrails off. Claude Code's own working files are allow-listed (below). | Open |
| [`style-guard.js`](.claude/hooks/style-guard.js) | PreToolUse, `Edit|Write|MultiEdit|NotebookEdit` | Denies writing a banned superlative ([`Feedback/banned-phrases.json`](Feedback/banned-phrases.json)) or an em/en dash into customer-facing copy (`Inventory/listings/`, `Copy/`; folder names compared without case on Windows and macOS). In a notebook only markdown cells are checked. The hard half of [a Feedback rule](Feedback/no-marketing-superlatives.md). | Open |
| [`bash-guard.js`](.claude/hooks/bash-guard.js) | PreToolUse, `Bash` | Inside the `brand-voice-reviewer` subagent (identified by the hook input's `agent_type`), allows only `node scripts/style-check.js <file>...` on files in the project and denies every other command. Silent everywhere else. | Open |
| [`version-snapshot.js`](.claude/hooks/version-snapshot.js) | PreToolUse, `Edit|Write|MultiEdit|NotebookEdit` | Copies the current content of a rule, agent, skill, `CLAUDE.md`, a settings file or a hook to `.versions/` before it changes, only when it differs from the last copy, and keeps the newest 20 per file. | Never blocks |
| [`tuning-ledger-check.js`](.claude/hooks/tuning-ledger-check.js) | SessionStart, `startup` | If [the tuning ledger](.claude/TUNING-LEDGER.md) has an open line, tells a new session to raise it and offer `procedure-tuner`. Not on resume, `/clear` or compaction. | No output |

The rules `style-guard` applies live in
[`.claude/hooks/lib/style-rules.js`](.claude/hooks/lib/style-rules.js),
shared with [`scripts/style-check.js`](scripts/style-check.js), the same
check on demand. `brand-voice-reviewer` runs that script instead of
reading for dashes by eye, so the reviewer and the gate can't disagree.

A deny is the documented PreToolUse decision on stdout
(`hookSpecificOutput.permissionDecision: "deny"` plus a reason Claude sees).
Anything allowed gets no output at all, so Claude Code's normal permission
prompts still apply; a guard that answered "allow" would silently approve
every file call. **Fail-open, on purpose, with a switch.** If a guard gets a payload that
is not valid JSON, or fails internally (a bug, a missing
`Feedback/banned-phrases.json`), it writes the error to stderr and exits
0 without output, so the call goes on to the normal permission flow
("Open" in the last column). Claude Code always sends valid JSON, so a
parse failure means the guard is broken, and a broken guard that blocks
every file and shell call also blocks the session that would fix it. Set
`GUARD_FAIL_CLOSED=1` in the environment to turn every such error into a
deny instead. The shared code is in
[`.claude/hooks/lib/hook-io.js`](.claude/hooks/lib/hook-io.js); both
behaviours have tests.

### What scope-guard lets out of the folder, on purpose

Claude Code reads and writes some of its own files outside the project
during normal use: large tool results and memory under
`~/.claude/projects/`, plan files, todo lists, user-level skills, and
screenshots and scratch files in the OS temp folder. A guard that blocks
those breaks the tool it is guarding. The allow-list is explicit and
narrow:

| Where | Allowed |
|---|---|
| `<config>/projects/<this project>/`, `<config>/plans/`, `<config>/todos/` | read and write |
| other projects' folders under `<config>/projects/` | denied |
| `<config>/skills/`, `<config>/agents/`, `<config>/commands/`, `<config>/CLAUDE.md` | read only |
| `<OS temp>/claude` and `<OS temp>/claude-*` | read and write |
| anything else under `<config>` (settings, credentials, history) | denied |

`<config>` is `$CLAUDE_CONFIG_DIR` if set, otherwise `~/.claude`.
`<this project>` is the folder name Claude Code derives from the project
path, every character other than a letter or digit replaced by `-`
(`C:\Users\me\My_Shop` becomes `C--Users-me-My-Shop`; checked against the
folder names Claude Code had created on a Windows machine), plus the folder
that holds the current session's `transcript_path`. Each row has a test in
[`tests/hooks.test.js`](tests/hooks.test.js).

## Hooks and permissions together

The hooks see the file tools and, for one agent, Bash. [`.claude/settings.json`](.claude/settings.json)
also has a `permissions` block (and a `$schema` line, so an editor
validates it):

- **deny**: network tools in Bash (`curl`, `wget`, `ssh`, `scp`, `rsync`,
  `nc`), `git push`, `rm -rf`, `sudo`, and reading `.env` files, `~/.ssh`
  and `~/.aws`; and `Edit`, `Write` and `MultiEdit` on the settings files
  and `.claude/hooks/**`. Together with `scope-guard` denying the same
  writes, the rules that limit the agent can only be changed by a person
  editing the files outside Claude Code.
- **allow** without a prompt: the test and check scripts, the one command
  `brand-voice-reviewer` needs (`node scripts/style-check.js`), and
  read-only git (`status`, `diff`, `log`).

How the two layers split the outside-folder problem: `scope-guard` closes
it for `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Glob` and `Grep`, which is
how Claude touches files nearly all the time. The deny rules take away the
obvious Bash routes out (network, destructive commands, secrets), and
every other Bash command still needs the user's approval, because only
the commands above are pre-allowed. What remains is a Bash command the
user approves, such as `cat ../other/file`: prefix rules can't express
"inside this folder", and Claude Code's docs say Bash argument rules are
easy to get around.

**Permissions are not a sandbox.** A prefix deny such as `Bash(curl:*)`
is matched against the command text, so the same request made another
way (another binary, a script, an interpreter one-liner the user
approves) is not caught. `bash-guard` narrows this for
`brand-voice-reviewer` with an exact allow-list instead of a deny-list,
but the main thread is still limited only by what the user approves. For
an OS-level boundary, use Claude Code's sandbox, which restricts the
files and hosts shell commands can reach while they run (macOS, Linux and
WSL2; on native Windows commands run unsandboxed, so use WSL2 or a
container there). [`examples/settings.sandbox.json`](examples/settings.sandbox.json)
is a starting point: merge it into `.claude/settings.json` or
the per-user `settings.local.json` to turn the sandbox on, block reads in the
home folder except this project, and refuse the unsandboxed fallback. It
is kept out of the active settings because CI and the saved session ran
on Windows without it. The sandbox also write-protects `.claude`
settings and hooks for shell commands, which covers the Bash route the
deny rules above leave open. Together this is a set of guardrails, not a
security boundary.

`bash-guard` depends on the `agent_type` field Claude Code puts in hook
input inside a subagent. A version that does not send it looks like the
main thread, and the hook then lets the normal permission flow decide;
if that happens, move the same check into the agent's own `hooks:`
frontmatter, which only runs while that agent is active.

One thing seen in the session in `examples/`: Claude Code ignores a
project's `permissions.allow` entries until the folder has been trusted
once in an interactive session (it says so on stderr). The deny rules
and the hooks don't wait for that.

## See it run

- [`examples/hook-verification.md`](examples/hook-verification.md) - each
  hook run from a terminal with the sample payloads in
  [`examples/payloads/`](examples/payloads), then all four inside a
  headless Claude Code session (2026-10-13), with the exact command, the
  prompt and the session's tool calls and hook messages saved in
  [`examples/transcripts/`](examples/transcripts).
- [`tests/hooks.test.js`](tests/hooks.test.js) - the same contract as a
  test suite, run in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
  on Ubuntu, macOS and Windows.
- [`examples/sample-listing.md`](examples/sample-listing.md) - the listing
  a fresh agent returned when given only the `product-listing` skill and
  the two inventory files, no expected output written first (report kept,
  transcript not). That run is also how the skill's wrong Draft -> Live
  step was found.

## Self-extension: a skill built from watched inspiration, not a spec

[`examples/skill-generation-session.md`](examples/skill-generation-session.md)
is a different kind of session. Instead of the owner describing an
automation up front, the agent was pointed at a folder of saved short-form
videos and asked what was worth building. Six candidates came out, two more
ideas were turned down with a stated reason, and one
([`commitment-tracker`](.claude/skills/commitment-tracker/SKILL.md)) was
built and tried on [`examples/sample-call-notes.md`](examples/sample-call-notes.md)
by a fresh agent; its report is what's shown.

## A second escalation path: friction observed at runtime

The style-guard path (soft rule -> repeated drift -> hook) only catches what
a hook can scan as content gets written. It does not catch a skill or agent
definition going stale: a tool grant copied from another file and never
trimmed, a reference to something renamed.
[`examples/self-tuning-session.md`](examples/self-tuning-session.md) walks
through the second path. Friction is logged to the tuning ledger the moment
it's noticed ([`Feedback/procedure-drift-logging.md`](Feedback/procedure-drift-logging.md)),
the SessionStart hook flags any open line, and
[`procedure-tuner`](.claude/agents/procedure-tuner.md) proposes a fix. One
issue was seeded for the demo (a dead `Edit` grant on
`inventory-researcher`); a fresh agent given only `procedure-tuner.md`
found it.

**The guard on self-modification.** An agent that edits the instructions
other agents run on is the riskiest piece here, so `procedure-tuner` has
no write tools (`Read`, `Grep`, `Glob`). It returns numbered diffs; the
main session applies one only after the owner explicitly approves it, and
`version-snapshot` copies the file first. A test fails if a write tool
is ever added to its `tools:` line. (The demo run above predates this and
applied the fix itself; the example says so.)

## A safety net for the rules themselves: automatic versions

Rules, agent prompts and skills get edited all the time, by the owner and by
Claude, and an "improvement" can quietly make one worse.
`version-snapshot.js` keeps the previous content of every protected file in
`.versions/<path>/<UTC timestamp>.md` (git-ignored), so going back is a
file copy, not an attempt to remember what the rule used to say. Git only
has what was committed; these copies cover the edits in between. Each
folder has an `index.jsonl` (time, tool, file, reason, SHA-256, size,
session) and keeps the newest 20 versions (`VERSION_SNAPSHOT_KEEP` to
change). Because it runs before Claude Code decides on the call, a
version also appears for an edit that was then blocked; it is a copy of
the content at that moment, not proof an edit happened. In the real
workspace the same pattern protects the files a set of ads agents depends
on, next to a change ledger for the live ad accounts, where no undo button
exists.

## Limitations, stated plainly

- `scope-guard` covers the file tools. A `Bash` command the user approves
  can still read or write outside the folder, or rewrite a hook, (see "Hooks and permissions
  together"). The hook is a guardrail against careless calls, not a
  security boundary.
- `style-guard` sees only what goes through `Write`, `Edit` and
  `MultiEdit` and `NotebookEdit` into the copy folders. It cannot see a Bash command
  writing a file, a browser automation typing into a marketplace form, or
  an integration posting directly; copy that leaves that way is checked
  only if someone runs `scripts/style-check.js` on it (as
  `brand-voice-reviewer` does). Its list is phrase-level regex, not
  language understanding: it skips code spans and known honest uses
  ("Revolutionary War era"), and will still miss a superlative it doesn't
  list.
- The hooks need `node` on `PATH`. They were run in Claude Code 2.1.296 on
  Windows 11 (the version is in the `init` line of
  [the saved transcript](examples/transcripts/2026-10-13-hooks-session.jsonl))
  and are tested on Linux, macOS and Windows in CI. That session predates
  `bash-guard` and the guardrail-file denies; those are covered by the
  test suite only, not yet by a recorded session.

## What's in this repo

- [`CLAUDE.md`](CLAUDE.md) and [`METHODOLOGY.md`](METHODOLOGY.md) - the
  index file, and the method for building this structure on a new project
  (generic on purpose, it doesn't reference this example).
- [`Feedback/`](Feedback/INDEX.md) - two rules: the style rule that got
  escalated to a hook (its banned list is data, in
  [`Feedback/banned-phrases.json`](Feedback/banned-phrases.json)), and the
  rule that feeds the tuning ledger.
- [`.claude/hooks/`](.claude/hooks) - the five hooks above.
- [`.claude/skills/`](.claude/skills) - `product-listing`, a recurring
  procedure as a checklist (Draft -> Ready for review; Live only once a
  person has posted it), with a reference/status split for the data it
  reads ([`Inventory/`](Inventory)); and `commitment-tracker`, from the
  self-extension session, writing to [`TODO.md`](TODO.md).
- [`.claude/agents/`](.claude/agents) - three agent archetypes from the real
  workspace: research (`inventory-researcher`, strict sourcing, returns a
  clean writeup instead of dozens of search calls), review
  (`brand-voice-reviewer`, runs the shared style check and compares a
  draft with the published copy in
  [`Brand/voice-examples.md`](Brand/voice-examples.md)) and self-tuning
  (`procedure-tuner`, compares what the other agents and skills declare
  with what they use, and proposes diffs for approval).
- [`Log/`](Log/2026-01.md) - one month showing the format (dated, newest on
  top, `CLOSED_` prefix only when nothing is left open).
- [`tests/`](tests), [`scripts/check-docs.js`](scripts/check-docs.js) and
  the CI workflow - the hook tests, plus a check that every link and quoted
  path in the docs resolves and that the docs follow their own no-dash rule.

## What's deliberately left out

The real workspace is larger than this extract: more sub-projects, skills
and integrations (mail, notes, browser automation), none of which is
shown here, so no size is claimed for it. It also holds a lot of
business-specific detail (pricing, supplier names, dispute history) that has
no business being public. This repo keeps enough of the shape to be useful
as a reference, not a copy of anything real.

## Using this

Read [`METHODOLOGY.md`](METHODOLOGY.md) first, it's the actual method. Then
[`Feedback/no-marketing-superlatives.md`](Feedback/no-marketing-superlatives.md)
for the soft-rule-to-hook escalation in practice, and
[`.claude/agents/`](.claude/agents) for how an agent written for one
recurring job differs from a generic research subagent. To reuse the hooks,
copy `.claude/hooks/` (including `lib/`), the `hooks` and `permissions`
blocks of `.claude/settings.json` and `tests/`, change `COPY_DIRS` in
`.claude/hooks/lib/style-rules.js` to wherever your customer-facing copy lives, then
run `npm test` against your copy.
