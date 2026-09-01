---
name: commitment-tracker
description: Reads a set of call or meeting notes and pulls out things the shop owner committed to doing themself ("I'll follow up with...", "I'll send..."), then adds them to TODO.md after confirmation. Use when the user has notes from a supplier or consignor call and wants their own follow-ups captured, or asks to check what they promised on a call.
---

# Commitment tracker

Turns a page of raw call or meeting notes into confirmed follow-up items in
TODO.md, so a verbal commitment made mid-conversation doesn't get lost once
the call ends.

## Reading the notes

1. Read the notes file the user points at, or the text pasted into the
   conversation.
2. Look only for commitments the shop owner made about themself, not
   things they asked someone else to do. "I'll send the invoice Friday" is
   a commitment. "She said she'd ship by Friday" is someone else's promise,
   not this skill's job to track.
3. Keep each one short and concrete: what, and by when if a date or
   relative time was actually said.

## Confirming before writing

List what was found and ask the user to confirm before writing anything. A
commitment pulled from loose notes is a guess at intent until the person
who made it confirms it's real and still current, so nothing goes straight
into TODO.md unconfirmed.

## Writing

Append confirmed items to TODO.md under today's date, one line each,
unchecked. Don't remove or reorder anything already in the file, and don't
rewrite items already logged under an earlier date.

## What NOT to do

- Don't invent a deadline that wasn't stated, log the commitment as
  open-ended if no date came up.
- Don't add anything the user didn't confirm, even if it looks obvious
  from context.
