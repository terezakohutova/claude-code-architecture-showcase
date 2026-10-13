# CLAUDE.md - Marlowe and Finch workspace index

> Example workspace for a solo vintage-reselling business (fictional). This
> file is an index only - see [METHODOLOGY.md](METHODOLOGY.md) for the
> methodology it follows.

## How to log

- One file per month in `Log/`, newest entry on top, heading
  `### YYYY-MM-DD - [CLOSED_]title`. Current month:
  [Log/2026-01.md](Log/2026-01.md).
- Keep it brief: what got done, what's finished, what's still open.

## Rules

- Customer-facing copy (drafts under `Inventory/listings/` and `Copy/`)
  has no marketing superlatives and no em or en dash. Enforced by
  `.claude/hooks/style-guard.js`; the rule and its history are in
  [Feedback/no-marketing-superlatives.md](Feedback/no-marketing-superlatives.md).
- Reads and writes stay inside this workspace folder, except Claude Code's
  own working files - enforced by `.claude/hooks/scope-guard.js`. Network
  and destructive shell commands are denied in `.claude/settings.json`.
- Before any edit to `CLAUDE.md`, `Feedback/`, an agent or a skill, the
  current content is copied to `.versions/` by
  `.claude/hooks/version-snapshot.js`; restore by copying a version back.
- A skill or agent's own definition causing a real problem mid-run gets
  logged to [.claude/TUNING-LEDGER.md](.claude/TUNING-LEDGER.md), not just
  worked around - see [Feedback/procedure-drift-logging.md](Feedback/procedure-drift-logging.md).
  Fixes to agents and skills are applied only after the owner approves
  the proposed diff.

## Context

- **Before any gray-area decision** (tone, copy, what to log) -> start at
  [Feedback/INDEX.md](Feedback/INDEX.md).
- **Inventory facts** (pricing bands, condition grading, known makers) ->
  [Inventory/inventory-reference.md](Inventory/inventory-reference.md).
  **Where an item stands** (Draft, Ready for review, Live, Sold) ->
  [Inventory/inventory-status.md](Inventory/inventory-status.md).
- **How the shop sounds in published copy** ->
  [Brand/voice-examples.md](Brand/voice-examples.md).
- **Open follow-ups** -> [TODO.md](TODO.md).

Skills (loaded on use):

- `product-listing` - drafting a listing for a logged item. See
  `.claude/skills/product-listing/SKILL.md`.
- `commitment-tracker` - pulling the owner's own follow-ups out of
  call/meeting notes into `TODO.md`. See
  `.claude/skills/commitment-tracker/SKILL.md`.

Agents:

- `inventory-researcher` - a maker, era or provenance claim needs sourcing
  before it goes into a listing.
- `brand-voice-reviewer` - a draft is about to be posted or sent; runs
  `scripts/style-check.js` and compares against published copy.
- `procedure-tuner` - the tuning ledger has an open line, or the owner asks
  for an audit of skills and agents; returns diffs, changes nothing.
