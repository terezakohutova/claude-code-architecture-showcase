---
name: product-listing
description: Writes a new listing (title, description, price) for a logged inventory item, following house style and current pricing bands. Use when the user asks to write/draft a listing for a specific item.
---

# Product listing

Turns a logged inventory item into a ready-to-post listing (title,
description, price with a one-line rationale).

## Before writing

1. Read [Inventory/inventory-reference.md](../../../Inventory/inventory-reference.md)
   for pricing bands and condition grading, and check whether the item's
   maker/mark is already logged there.
2. Read [Inventory/inventory-status.md](../../../Inventory/inventory-status.md)
   to confirm the item isn't already listed or sold.
3. If the maker/condition/provenance needs actual research (not already
   in the reference file), use the `inventory-researcher` agent rather
   than guessing - see `.claude/agents/inventory-researcher.md`.

## Writing the listing

- Title: item, maker/mark if known, material, era if known. No
  superlatives (see `Feedback/no-marketing-superlatives.md`).
- Description: lead with the concrete facts (maker, material, dimensions,
  era), then condition using the house grading terms, then a short note on
  provenance/history if there is one worth telling honestly. Never invent
  a maker or provenance detail that isn't sourced.
- Price: pick from the pricing band for the category and condition in
  `inventory-reference.md`, adjusted per its notes. State the one-line
  rationale (e.g. "documented maker mark, excellent condition - upper
  half of band").

## Before it goes out

Run the draft past `brand-voice-reviewer` (see
`.claude/agents/brand-voice-reviewer.md`) if there's any doubt about
tone - it checks against what's actually been published, not just this
file's rules.

## After writing

Update `Inventory/inventory-status.md`: move the item from Draft to Live
with today's date.
