# ADR-0009: The page is surveyed once, and everything downstream is pure

## Status

Proposed (2026-08-30, from an architecture review). Generalises the amendment on
[ADR-0008](0008-a-live-shot-is-only-as-live-as-its-crop.md), which it does not reverse.

## Context

Five issues in a fortnight have landed on the same boundary: the one between what a
settled page said and what the pipeline does about it.

- **#62** — a beat with no `label` takes its section's **heading**. The heading is read
  off the settled page by `check`; `planReel` grew a `headings` parameter.
- **#66** — a **fit** beat past the legibility floor falls back to a vertical pan. The
  section's height is read off the settled page by `check`; `planReel` grew a `heights`
  parameter.
- **#64** — a `scroll` hook whose reveals cannot re-fire degrades to `ambient`.
- **#88 / ADR-0008** — an `ambient` hook that does not move in frame degrades to
  `still`, and that changes the *plan*, so `check` had to carry the verdict forward;
  `planReel` grew a `motion` parameter.
- **#78** — a fit beat's measurement load is charged to a `measure` phase line, because
  it is a page load `check` had already paid for once.

Each was decided well on its own terms, and ADR-0008's amendment states the doctrine
that resolves all of them: *the preflight decides and the render plans it.* But the
doctrine is only written in one ADR about one probe, and it is implemented by passing
each fact separately. The consequences show:

1. `planReel(config, headings, heights, motion)` takes four parameters, three of which
   are "something a browser said, absent means what the config asked for". The next
   page fact is a fifth.
2. `check.ts` drives Playwright *and* judges what it found. To learn what one beat was
   planned as, `plannedBeat` re-plans the whole reel once per beat — the planner called
   n times to answer n questions it could answer once.
3. The judgment is only reachable through a browser. `test/check.test.ts` is 669 lines
   driving the CLI against a fixture site over HTTP, which is the only way to say "the
   page had a 4400px section here". The rules being tested — the fit cap, the
   degradation chain, the copy budget against a heading — contain no browser at all.

The friction is not that any one of those is wrong. It is that the boundary has no
name, so every issue crosses it a new way.

## Decision

**Name the value that crosses the boundary, and let nothing below it open a browser.**

A **survey** is what one settled page load gives up about a config: every beat's rect,
height and heading, the page's own height, the hero's rect, and the two readings a live
shot turns on — whether the page's scroll effects re-fire, and the motion probe's
number.

Three rules follow.

- **A survey carries facts, never verdicts.** The probe's *reading* is in the survey;
  the `scroll → ambient → still` chain that reads it is not. The section's *height* is
  in the survey; the fit cap that refuses it is not. So the notes those degradations
  produce are written by code with no browser under it, and are assertable as such.
- **One survey per run, read by both the plan and the check.** `planReel(config,
  survey)` and `verdict(config, survey)`. A page fact that reached only one of them
  would be a plan and a preflight free to disagree about the same page — which is
  exactly the failure ADR-0008's amendment was written to close, generalised.
- **`check` becomes the judgment and `survey` becomes the browser.** The CLI command,
  the glossary term and the report are unchanged; what moves out of `check.ts` is
  Playwright.

An absent survey is what the config asked for, exactly as an absent height is uncapped
today: the plan only knows what it is handed, and a survey nobody took is a survey with
nothing in it.

## Consequences

- `planReel`'s interface shrinks from four parameters to two, and stops growing one per
  page fact. A sixth fact is a field on the survey.
- `plannedBeat` is deleted. The judgment already holds the whole timeline, planned once
  from the whole survey, and reads beat `i` out of it.
- The judgment gains a second adapter that is real rather than hypothetical: a `Survey`
  literal in a test. The fixture-server tests stay, thinned to the ones that prove the
  survey itself is measured correctly — which is the one thing a literal cannot prove.
- `Checked` loses its carrier fields and becomes `{ problems, notes }`. `render` holds
  the survey and hands it to both callers.
- `sections` does **not** go through the survey. It measures a page with no config, so
  it has no beats to survey; what it shares is the page-loading below the seam, not the
  value above it.
- The `measure` phase (#78) stays. A fit beat's first measurement is the same
  base-viewport height the survey already holds, so it *could* be dropped — but that
  changes what a render costs and removes a line #78 added deliberately, so it is a
  decision of its own rather than a consequence of this one.

## Alternatives considered

**Keep passing facts as parameters and stop worrying about it.** The parameters are
individually cheap, and TypeScript catches a mis-ordered pair. Rejected because the
cost is not in writing them: it is that the judgment cannot be exercised without a
browser, and that is where every one of the five issues above actually needed testing.

**Let `check` and the render each survey their own page.** This is what #64 and #88
tried and had to undo. Two loads of the same page are free to disagree, and the
disagreement is silent — ADR-0008's amendment records the exact shape of it.

**Move the judgment out and leave `check.ts` as the browser pass.** Rejected on the
name: `check` is what the glossary and the CLI call the judgment, and moving the word
away from the thing it names to make room for a refactor is a rename the domain did not
ask for.
