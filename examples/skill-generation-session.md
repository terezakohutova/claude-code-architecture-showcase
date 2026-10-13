# A session that built a new skill from watched, not written, inspiration

The shop owner had a folder of saved short-form videos from a few
productivity and small-business creators, and wanted to try something
different from the usual "describe the automation you want" flow: hand
the agent the videos directly and see what it could turn into working
parts of this workspace on its own, with approval at each step rather
than a spec written up front.

## What the agent could actually work with

Browser automation can open a saved video and read what's on screen, not
watch or listen to it. That means captions, on-screen text baked into the
clip, and the caption/comment text under the post. A tip that only exists
in someone's spoken voiceover with no caption or on-screen text is
invisible to this approach, so a few videos in the folder were skipped
outright and flagged rather than guessed at.

## From six ideas to one shipped skill

Working through the folder produced six candidate skills, each tied to an
actual gap in how the shop owner already worked rather than a video's
premise on its own:

- **decision-review** - before committing to a pricing or sourcing call,
  get pushback from a few angles instead of a single answer.
- **session-notes** - capture a tangent or half-formed idea mid-session
  without turning it into a task that has to be finished.
- **commitment-tracker** - pull self-made commitments out of call notes so
  a verbal promise on a supplier call doesn't quietly disappear once the
  call ends.
- **downloads-tidy** - sort a cluttered local downloads folder into
  subfolders by filename pattern, nothing moved without a look first.
- **source-lookup** - answer "where's the paperwork for X" by checking
  two places (local files and notes) at once instead of one at a time.
- **evening-review** - a short end-of-day reflection logged with a date,
  same few questions each time.

Two other ideas from the same videos were turned down rather than built.
A "watch competitors automatically" idea had no actual list of competitors
to track, so it would have been automation with nothing to point it at.
A standalone "always-on advisory panel" idea was dropped once it became
clear it would just be decision-review running in the background with
nothing new in it.

**commitment-tracker** is the one built out in full for this repo (see
`.claude/skills/commitment-tracker/SKILL.md`), because it maps to a real,
recurring, and easy-to-verify gap: a shop owner running consignment and
supplier calls makes small commitments constantly, and a missed one costs
trust with someone whose stock the business depends on.

## Proof it runs, not just a description

A fresh agent was given only `.claude/skills/commitment-tracker/SKILL.md`,
`TODO.md`, and `examples/sample-call-notes.md`, told today's date was
2026-01-21, and asked to follow the skill exactly. No expected output was
written first. The judgments and the TODO.md lines below are copied from
that run's report and from the file afterwards; the session transcript
was not kept, so this page is the record, not a reproducible log. To check
it yourself, run the skill on the same notes file and compare.

**Input** (`examples/sample-call-notes.md`), a call with a consignor about
a sideboard, deliberately mixing in a promise that belongs to the other
person and a piece of undecided discussion that isn't a commitment at
all:

```
- Sideboard consignment (walnut, mid-century). Told him I'd get it
  photographed and up for approval by Thursday.
- He said he'd send the original receipt if he can find it in his files.
- Still owe Priya the commission split from December, need to send that
  over.
- Talked about whether to run a joint listing for his other pieces too,
  no decision made either way.
- Said I'd check the pricing band for mid-century case furniture before
  quoting him back.
```

**What the agent judged as a commitment vs. not**, from its report: the receipt line was excluded because it's the caller's own
promise, not the shop owner's; the joint-listing line was excluded
because it's undecided discussion, not a commitment. Both exclusions
follow the skill's rule directly, neither was prompted for separately.

**What it appended to TODO.md** (the lines are still in the file):

```diff
 Format: `- [ ] YYYY-MM-DD: item`. New dated blocks go at the bottom, oldest
 stays on top so already-confirmed items never get reordered.
+
+- [ ] 2026-01-21: Photograph the walnut mid-century sideboard consignment (R. Danforth) and get it up for approval by Thursday (2026-01-22).
+- [ ] 2026-01-21: Send Priya the commission split from December.
+- [ ] 2026-01-21: Check the pricing band for mid-century case furniture before quoting R. Danforth back.
```

No deadline was invented for the second and third items since none was
stated in the notes, matching the skill's "don't invent a deadline" rule.
The first item resolved "by Thursday" to an actual date rather than
leaving it vague, which the skill doesn't spell out step by step but
follows from reading the notes plainly.

## Why this is the interesting part of the architecture, not the video part

The video-watching step was a one-off input source, useful for this
session and not something this workspace runs on a schedule. The part
worth reusing is the loop around it: read a source of raw ideas, filter
hard for what maps to an actual recurring gap instead of what sounds
impressive, say no to the rest out loud, and prove the one that gets built
actually runs before calling it done. That loop works the same whether
the raw input is a folder of videos, a stack of notes, or a person just
describing what's annoying them.

To be direct about it: "pull commitments out of notes and surface them" is
not a novel idea on its own, a public search turns up several other
`commitment-tracker` skills doing versions of it (auditing sent email and
chat for unanswered messages, tracking vendor promises, and so on). What's
shown here isn't the concept, it's the loop that produced it and the
verification standard it had to clear before being called done, which is
also why five of the six candidates from this session aren't in this repo.
