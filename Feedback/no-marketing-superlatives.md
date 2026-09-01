---
name: no-marketing-superlatives
description: Never use hollow marketing superlatives (best-in-class, revolutionary, game-changing, must-have) or an em/en dash in customer-facing copy - plain claims, plain hyphen.
metadata:
  type: feedback
---

Two rules that ended up bundled into one hook because they were both
"house style" violations caught in the same review passes: (1) no hollow
superlatives in listings, replies, or posts - describe the actual item
(maker, material, era, condition), don't editorialize about how amazing it
is; (2) no em dash or en dash anywhere in written content - plain hyphen
only.

**Why:** The shop owner said early on that superlative-heavy listings read
as generic dropshipping copy and hurt trust with collectors who know the
category - a specific flaw beats a vague compliment. The em dash rule
started separately (a stylistic preference, "it reads as AI-written") but
kept getting violated in exactly the same review passes as the
superlatives rule, so both got folded into one style check.

**How to apply:** Applies to every piece of customer-facing text - listing
titles and descriptions, buyer message replies, social posts - no
exception for "just a short reply" or "just a title." If a draft is being
reviewed by `brand-voice-reviewer` (see `.claude/agents/`), both checks are
part of that review. If you catch either violation in your own output
before it's sent anywhere, fix it before it goes further.

**Escalation to a hook:** documented rules on their own didn't hold -
violations kept recurring across sessions even after being corrected
repeatedly (the classic failure mode: a rule gets re-read, acknowledged,
and then quietly drifts a few tasks later once attention is on something
else). `.claude/hooks/style-guard.js` now hard-blocks any `Write`/`Edit`
call whose content matches the banned phrase list or contains an em/en
dash character, before the write happens - not a reminder, a rejection.
This is the pattern worth copying: a rule that keeps failing as a soft
instruction is a signal to build a technical gate, not to keep repeating
the instruction more emphatically.
