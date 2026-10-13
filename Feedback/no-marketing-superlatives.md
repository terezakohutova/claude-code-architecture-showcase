---
name: no-marketing-superlatives
description: Never use hollow marketing superlatives (best-in-class, revolutionary, game-changing, must-have) or an em/en dash in customer-facing copy - plain claims, plain hyphen.
metadata:
  type: feedback
---

Two house-style rules for customer-facing copy (listings, buyer replies,
social posts): (1) no hollow superlatives - describe the actual item
(maker, material, era, condition), don't editorialize about how amazing it
is; (2) no em dash or en dash - plain hyphen only.

**Why:** The shop owner said early on that superlative-heavy listings read
as generic dropshipping copy and hurt trust with collectors who know the
category - a specific flaw beats a vague compliment. The em dash rule
started separately (a stylistic preference, "it reads as AI-written") but
kept getting violated in the same review passes as the superlatives rule,
so both ended up in one check.

**How to apply:** Every piece of customer-facing text, no exception for
"just a short reply" or "just a title." Drafts are saved under
`Inventory/listings/` or `Copy/`, which is where the hook looks. Before a
draft goes out, `brand-voice-reviewer` runs the same check
(`node scripts/style-check.js <file>`). If you catch either violation in
your own output before it's sent anywhere, fix it before it goes further.

## How this became a hook, and what actually happened

1. **Rule only.** The rule lived in this file and was re-read at the
   start of the `product-listing` skill. It was still broken repeatedly:
   by 2026-01-14 a listing draft had gone out with a banned superlative
   or an em dash three times in two weeks (see `Log/2026-01.md`). The
   pattern was the usual one: the rule gets read, acknowledged, and then
   drifts a few tasks later once attention is elsewhere.
2. **Hook added (2026-01-14), but not working.** `style-guard.js` was
   written as a `PreToolUse` hook to deny the write. Run by hand from a
   terminal it printed a deny and looked fine. It did not block anything
   inside Claude Code: it printed `{"permissionDecision":"deny"}` at the
   top level of its output, a shape Claude Code ignores. From 2026-01-14
   to 2026-10-13 the rule was, in practice, still a documented-only rule.
3. **Found by testing in a real session (2026-10-13).** A headless Claude
   Code session was asked to write "A revolutionary vase." into a listing
   file. The write went through. The output was moved inside
   `hookSpecificOutput` (the documented shape), and the same test in a
   new session then got the write denied. Both runs are described in
   [`examples/hook-verification.md`](../examples/hook-verification.md).
4. **Regression test.** `tests/hooks.test.js`, suite "deny output
   format", asserts that a deny is exactly
   `{"hookSpecificOutput":{"hookEventName","permissionDecision","permissionDecisionReason"}}`
   and nothing else, so the same mistake fails CI instead of failing
   silently.

The hook has been effective since 2026-10-13. There is no before/after
count of violations, so no claim is made that it reduced them; what it
does is make the next violation through the file tools impossible rather
than unlikely.

**Scope of the hook (and its blind spots):** it checks writes to
customer-facing copy only (`Inventory/listings/`, `Copy/`, text formats),
ignores quoted material (code spans, fenced blocks, blockquotes), and
bans phrases rather than bare words where the word has an honest use
("Revolutionary War era" passes). It cannot see copy that never goes
through the file tools: a Bash command writing a file, a browser
automation typing into a marketplace form, an integration posting
directly. This file is outside its scope by design, since it has to quote
the list.

The pattern worth copying: a rule that keeps failing as a soft
instruction is a signal to build a technical gate, and the gate is not
done until it has been seen to block in the real tool, not only in a
terminal.
