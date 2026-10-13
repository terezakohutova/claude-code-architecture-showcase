# Sample run: product-listing skill on MF-0041

A fresh agent was given only `.claude/skills/product-listing/SKILL.md`,
`Inventory/inventory-reference.md`, and `Inventory/inventory-status.md`,
and asked to write the listing for MF-0041 (Hollowbrook Pottery vase,
logged as Draft, waiting on photos). No expected output was written
first. What follows is the listing that run returned, copied from its
report; the session transcript was not kept, so this page is the record,
not a reproducible log. A transcript-backed run of the hooks is in
[`hook-verification.md`](hook-verification.md).

## What governed the listing

- Pricing band (Ceramics, Excellent): 40 to 90, adjusted up for a
  documented maker's mark.
- Maker on file: Hollowbrook Pottery (stamped "HB" on base), active
  1920s to 1950s, mid-range collector demand.
- Condition grading (Excellent): light wear only, no repairs, all
  original parts.
- No dimensions or provenance story are logged anywhere for this item, so
  neither was invented.

## Listing produced

**Title:** Hollowbrook Pottery Vase, Stamped HB Mark, Ceramic,
1920s-1950s

**Description:** Vase by Hollowbrook Pottery, stamped HB on the base.
Hollowbrook operated from the 1920s through the 1950s, with marked pieces
seeing steady mid-range collector demand. Ceramic construction.
Dimensions have not yet been logged for this piece.

Condition: excellent, light wear only, no repairs, all original parts.

No provenance history is recorded for this piece beyond the maker's mark
itself, none is claimed here.

**Price: $70**

Rationale: ceramics, excellent-condition band is $40 to 90. The
documented HB maker's mark justifies pricing above the band midpoint, but
it's held short of the top of the band since Hollowbrook carries
mid-range, not high, collector demand per the reference file, upper-
middle of band.

## What the run exposed in the skill

At the time, the skill's "After writing" step said to move the item from
Draft to Live in `inventory-status.md`. The agent did not do that, and
said why: the item is waiting on photos, so it isn't ready to post. The
agent was right and the skill was wrong: a drafted listing is not live
until a person has posted it. The skill now moves a finished draft to
**Ready for review** and leaves Live to the owner, and leaves an item that
is still missing something (like these photos) in Draft. Good judgment in
one run is not a substitute for a correct checklist.
