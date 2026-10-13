# CLAUDE.md - Marlowe and Finch workspace index

> Example workspace for a solo vintage-reselling business (fictional). This
> file is an index only - see [ORGANIZACE.md](ORGANIZACE.md) for the
> methodology it follows.

## How this workspace is organized

- **Inventory** - stock, listings, pricing. Reference (stable facts) vs.
  status (current state) split: [Inventory/inventory-reference.md](Inventory/inventory-reference.md),
  [Inventory/inventory-status.md](Inventory/inventory-status.md).
- **Feedback/** - rules about how Claude should work here, one file per
  rule. Start at [Feedback/INDEX.md](Feedback/INDEX.md).
- **Log/** - chronological record of what happened each month, newest on
  top. Current month: [Log/2026-01.md](Log/2026-01.md).

## Rules

- No em dash or en dash in any written content (product listings, replies,
  notes) - plain hyphen only. Enforced by `.claude/hooks/style-guard.js`,
  documented in [Feedback/no-marketing-superlatives.md](Feedback/no-marketing-superlatives.md)
  (the hook covers a second banned pattern too - see that file).
- Reads and writes stay inside this workspace folder - enforced by
  `.claude/hooks/scope-guard.js`.
- Before any edit to `CLAUDE.md`, `Feedback/`, an agent or a skill, the
  current content is copied to `.versions/` by
  `.claude/hooks/version-snapshot.js`; restore by copying a version back.
- A skill or agent's own definition causing a real problem mid-run gets
  logged to [.claude/TUNING-LEDGER.md](.claude/TUNING-LEDGER.md), not just
  worked around - see [Feedback/procedure-drift-logging.md](Feedback/procedure-drift-logging.md).

## Skills

- `product-listing` - writes a new listing (title, description, price
  rationale) for an inventory item, following the house style and the
  current reference pricing bands. See `.claude/skills/product-listing/SKILL.md`.
- `commitment-tracker` - pulls the owner's own follow-up commitments out
  of call/meeting notes and logs confirmed ones to `TODO.md`. See
  `.claude/skills/commitment-tracker/SKILL.md`.

## Custom agents

- `inventory-researcher` - sourced research for provenance/condition
  questions on a specific item, before it goes into a listing.
- `brand-voice-reviewer` - checks a draft against the real, currently
  published voice (not the aspirational style guide).
- `procedure-tuner` - reviews the skills and agents in this repo against
  what they actually declare vs. use, triggered automatically off
  `.claude/TUNING-LEDGER.md`.
