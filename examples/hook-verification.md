# Hook verification

Two levels of proof for the hooks in `.claude/hooks/`: run from a plain
terminal with a sample payload (anyone can reproduce this in seconds), and
run by Claude Code itself in a real session (the only test that shows the
output format is one Claude Code actually acts on). The automated version of
the first level is `tests/hooks.test.js`.

## 1. From a terminal

Each hook reads the PreToolUse or SessionStart payload as JSON on stdin,
exactly as Claude Code sends it. The payloads used here are in
[`payloads/`](payloads). From the repo root:

```
node .claude/hooks/style-guard.js < examples/payloads/write-superlative.json
```

Every output below is what the hooks print today: a test in
`tests/hooks.test.js` runs each payload and fails if this page and the
hook disagree. A deny is a JSON
decision on stdout, exit code 0. An allow is no output at all, exit code 0,
which leaves Claude Code's normal permission prompt in place.

### style-guard.js

`write-superlative.json` (Write to Inventory/listings/draft.md, content
"This is a truly best-in-class vase, a real must-have for any collector."):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Style guard: banned superlative \"best-in-class\" found near: \"This is a truly best-in-class vase, a real must-have for an\" (and 1 more). See Feedback/no-marketing-superlatives.md, rewrite before saving."}}
```

`write-em-dash.json` (the payload carries the em dash as the JSON escape
`\u2014`, so no file in this repo contains the character itself; the hook
quotes the literal character back, shown here as `[U+2014]`):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Style guard: em dash (U+2014) found near: \"Hollowbrook Pottery vase [U+2014] excellent condition, no repai\". See Feedback/no-marketing-superlatives.md, rewrite before saving."}}
```

`write-clean.json`: no output, exit 0.

`write-log-out-of-scope.json` (Write to `Log/2026-01.md` quoting a buyer
who said "revolutionary"): no output, exit 0. `Log/` is internal, not
customer-facing copy.

### scope-guard.js

`read-inside.json` (`Inventory/inventory-status.md`): no output, exit 0.

`read-outside.json` (`../outside-file.md`):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"../outside-file.md\" resolves outside this project's folder; reads and writes must stay inside the workspace root."}}
```

`glob-outside.json` (Glob with the absolute pattern `/etc/**/*.conf`):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"/etc/**/*.conf\" resolves outside this project's folder; reads and writes must stay inside the workspace root."}}
```

`glob-relative-outside.json` (Glob with the relative pattern
`../../../**/*.md`, which the first version of this hook let through):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"../../../**/*.md\" resolves outside this project's folder; reads and writes must stay inside the workspace root."}}
```

`grep-glob-outside.json` (Grep with the file filter `glob: "../../**"`,
also let through by the first version):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"../../**\" resolves outside this project's folder; reads and writes must stay inside the workspace root."}}
```

## 2. Inside a real Claude Code session

Run on 2026-10-13 with Claude Code 2.1.296 on Windows 11, in a fresh copy of
this repo in the OS temp folder (no `.git`), with the hooks exactly as they
are in this repo. One open line was added to `.claude/TUNING-LEDGER.md` first so
the SessionStart hook had something to report. The exact command, run from
the copy's root:

```
claude -p "$(cat ../prompt.txt)" --permission-mode acceptEdits \
  --output-format stream-json --verbose --max-turns 25 > ../stream.jsonl
```

- The prompt, verbatim:
  [`transcripts/2026-10-13-hooks-session.prompt.txt`](transcripts/2026-10-13-hooks-session.prompt.txt).
- The session's events:
  [`transcripts/2026-10-13-hooks-session.jsonl`](transcripts/2026-10-13-hooks-session.jsonl).
  This is a filtered copy of `stream.jsonl`: it keeps the hook events, the
  init line (version, model, permission mode, cwd), every tool call with
  its input, every tool result and the final report, and drops streaming,
  thinking-token and rate-limit events and the init line's tool list.
  Two substitutions, nothing else: the temp folder's absolute path is
  replaced with `<temp>`, and the em dash in Claude Code's own "file state
  is current" message is written as the JSON escape `\u2014`.

What the events show, step by step:

| Step | Tool call | Result in the transcript |
|---|---|---|
| Session start | SessionStart hook (`startup`) | exit 0, context added: "TUNING-LEDGER.md has unresolved entries..." |
| 2 | Write Inventory/listings/probe.md, "A revolutionary vase." | error: `PreToolUse:Write hook error: Style guard: banned superlative "revolutionary" found near: "A revolutionary vase."...`; file not created |
| 3 | Write Inventory/listings/probe-clean.md, clean copy | created |
| 4 | Write Log/probe-note.md, quotes "revolutionary" | created (Log/ is out of the style guard's scope, as intended) |
| 5 | Glob `../../../**/*.md` | error: `PreToolUse:Glob hook error: Scope guard: "../../../**/*.md" resolves outside this project's folder...` |
| 6 | Grep `password`, glob `../../**` | error: `PreToolUse:Grep hook error: Scope guard: "../../**" resolves outside this project's folder...` |
| 7 | Read, then Edit `Feedback/INDEX.md` | applied |
| 8 | Glob `.versions/**` | `.versions\Feedback\INDEX.md\2026-10-13T18-55-03.003Z.md` and `index.jsonl` |

Checked by hand after the run, in the temp copy: `Inventory/listings/`
held no `probe.md` (only `probe-clean.md` and `.gitkeep`), and the snapshot file held the pre-edit
content of `Feedback/INDEX.md` (without "- probe line"). Its index line:

```
{"event":"snapshot","version":"2026-10-13T18-55-03.003Z.md","at":"2026-10-13T18:55:03.003Z","tool":"Edit","file":"Feedback/INDEX.md","reason":"content before Edit","sha256":"4d6f94acabbc854dbdb89b86aee1aa36f2d8b50aae23b928e4e6bca31c43549a","bytes":469,"session":"51c2e7be-5890-47ce-bbea-71a861853a72"}
```

Claude Code also printed this on stderr, because the temp copy had never
been opened interactively:

```
Ignoring 7 permissions.allow entries from .claude/settings.json: this workspace has not been trusted. [...]
```

So `permissions.allow` from a project's settings only applies once the
folder is trusted; the hooks ran regardless.

### The earlier failure this level exists for

An earlier version of these hooks printed `{"permissionDecision":"deny"}`
at the top level instead of inside `hookSpecificOutput`. Run from a
terminal (level 1) it looked like a working deny. In a headless session
like the one above it did not block: "A revolutionary vase." was written.
That run was before transcripts were kept, so only this description of it
exists. The fix and the regression test are described in
[`Feedback/no-marketing-superlatives.md`](../Feedback/no-marketing-superlatives.md).
