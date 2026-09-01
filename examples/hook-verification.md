# Hook verification

The two hooks in `.claude/hooks/` are plain Node scripts with no side
effects beyond reading stdin and writing a decision to stdout, so they can
be run directly from a terminal, no Claude Code session required. Every
command and output below is real, run against the files in this repo as
they exist right now. Reproduce it yourself from the repo root:

```
node .claude/hooks/style-guard.js < payload.json
```

## style-guard.js

**Banned superlative, should deny**

Input content: `"This is a truly best-in-class vase, a real must-have for
any collector - shipped with care."`

Actual output:
```json
{"permissionDecision":"deny","permissionDecisionReason":"Style guard: banned superlative \"best-in-class\" found near: \"This is a truly best-in-class vase, a real mus\". See Feedback/no-marketing-superlatives.md - rewrite before saving."}
```

**Em dash character (U+2014), should deny**

Input content: `"Hollowbrook Pottery vase &mdash; excellent condition, no
repairs."`, where `&mdash;` stands in here for a literal U+2014 em dash
character (this file can't contain that character directly, see
`Feedback/no-marketing-superlatives.md` in the root workspace this
example lives in).

Actual output (the hook echoes the literal character back in its
message; `&mdash;` below stands in for it the same way):
```json
{"permissionDecision":"deny","permissionDecisionReason":"Style guard: banned dash character found near: \"Hollowbrook Pottery vase &mdash; excellent condition, no repa\". See Feedback/no-marketing-superlatives.md - rewrite before saving."}
```

**Clean copy, should allow**

Input content: `"Hollowbrook Pottery vase, excellent condition, no
repairs, documented maker mark."`

Actual output:
```json
{"permissionDecision":"allow"}
```

## scope-guard.js

**Path inside the workspace, should allow**

Input path: `Inventory/test-listing.md`

Actual output:
```json
{"permissionDecision":"allow"}
```

**Path outside the workspace, should deny**

Input path: `../../outside-file.md`

Actual output:
```json
{"permissionDecision":"deny","permissionDecisionReason":"Scope guard: \"../../outside-file.md\" resolves outside the workspace root (.../claude-code-architecture-showcase). Reads and writes must stay inside this project."}
```

The workspace root path in that message is resolved from `__dirname` at
run time, so it will show your own local path if you reproduce this
rather than the one above.
