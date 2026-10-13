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

Save the draft as `Inventory/listings/<item id>.md` (MF-0041 goes to
MF-0041.md in that folder). That folder is customer-facing copy, so
the style-guard hook checks every write to it.

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
tone. It runs the same style check as the hook and compares the draft
with published copy in `Brand/voice-examples.md`.

## After writing

Update `Inventory/inventory-status.md`: move the item from Draft to
**Ready for review** with today's date and the draft's path. Do not mark
it Live. This skill only drafts; posting happens outside this workspace,
by a person. The item moves to Live when the owner says it has been
posted, with the date it went up.

If the item is still missing something it needs before it can be posted
(photos, dimensions), leave it in Draft and say what is missing.
