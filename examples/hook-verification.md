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

Every output below is copied from a real run. A deny is a JSON decision on
stdout, exit code 0. An allow is no output at all, exit code 0, which leaves
Claude Code's normal permission prompt in place.

### style-guard.js

`write-superlative.json` (Write to Inventory/draft-listing.md, content
"This is a truly best-in-class vase, a real must-have for any collector."):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Style guard: banned superlative \"best-in-class\" found near: \"This is a truly best-in-class vase, a real must-have for an\". See Feedback/no-marketing-superlatives.md, rewrite before saving."}}
```

`write-em-dash.json` (the payload carries the em dash as the JSON escape
`\u2014`, so no file in this repo contains the character itself; the hook
quotes the literal character back, shown here as `[U+2014]`):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Style guard: em dash (U+2014) found near: \"Hollowbrook Pottery vase [U+2014] excellent condition, no repai\". See Feedback/no-marketing-superlatives.md, rewrite before saving."}}
```

`write-clean.json`: no output, exit 0.

### scope-guard.js

`read-inside.json` (`Inventory/inventory-status.md`): no output, exit 0.

`read-outside.json` (`../outside-file.md`):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"../outside-file.md\" resolves outside this project's folder. Reads and writes must stay inside the workspace root."}}
```

`glob-outside.json` (Glob with the absolute pattern `/etc/**/*.conf`):

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"/etc/**/*.conf\" resolves outside this project's folder. Reads and writes must stay inside the workspace root."}}
```

## 2. Inside a real Claude Code session

Run on 2026-10-13 with Claude Code 2.1.296 on Windows 11, in a fresh copy of
this repo, headless (`claude -p ... --permission-mode acceptEdits`). One
open line was added to `.claude/TUNING-LEDGER.md` first so the SessionStart
hook had something to report. The session was told to do five steps, quote
every hook message verbatim and never retry a blocked call. The quotes
below are from its report; the only edit is the absolute temp path in step
4, shortened to `<temp>`.

1. **SessionStart** context received:
   > TUNING-LEDGER.md has unresolved entries ('- [ ]'). Before anything
   > else this session, run procedure-tuner (.claude/agents/procedure-tuner.md)
   > against each one, apply or report fixes per its own checklist, and
   > mark handled lines '- [x]' in the ledger.
2. **Write** Inventory/probe-listing.md with "A revolutionary vase.":
   blocked, file not created.
   > PreToolUse:Write hook error: Style guard: banned superlative
   > "revolutionary" found near: "A revolutionary vase.". See
   > Feedback/no-marketing-superlatives.md, rewrite before saving.
3. **Write** Inventory/probe-clean.md with clean copy: created, no hook
   message.
4. **Read** a file in a sibling folder outside the project: blocked.
   > PreToolUse:Read hook error: Scope guard: "<temp>\outside\notes.md"
   > resolves outside this project's folder. Reads and writes must stay
   > inside the workspace root.
5. **Edit** `Feedback/INDEX.md`: applied, and `version-snapshot.js` kept
   the content from before the edit:
   ```
   .versions/Feedback/INDEX.md/20261013-202019-331.md
   .versions/Feedback/INDEX.md/index.jsonl
   ```

The same session on the version of these hooks before the 2026-10-13 fix,
which printed `{"permissionDecision":"deny"}` at the top level instead of
inside `hookSpecificOutput`, wrote "A revolutionary vase." without any
block. That is why level 2 exists: level 1 alone passed for that version
too.
