import { defineSite } from 'reel'

/**
 * MWA Forge — the house's own reel, and the first one cut with #57's whole vocabulary:
 * a live hook, a fit beat, labels at the bottom of the frame and the signed card.
 *
 * Written from `reel sections https://mwaforge.com`, like every other config. What the
 * report said about this page, and what each row cost:
 *
 * ```
 *         main    y 90      727px   punchFactor 2.93  "Websites that win you more customers."
 *   hook  main    y 858     233px                     "LAUNCH"
 *         #how    y 1090    666px   punchFactor 3.20  "Four steps. No agency runaround."
 *         #work   y 1757   5312px   punchFactor 1.20  "Real sites. Real businesses."
 *         main    y 7069    623px   punchFactor 3.42  "You don't pay until it's live and you love it."
 *         #about  y 7691    687px   punchFactor 3.11  "A small shop that picks up the phone."
 *         main    y 8378    576px   punchFactor 3.70  "Ready to win more customers?"
 * ```
 *
 * Four of those became beats. The tier strip is left out — it is 233px, which is a
 * punch of 8 to fill a frame, and prices are the one thing a 3.5s shot cannot make a
 * viewer read. The closing "Ready to win more customers?" is left out too: MWA Forge's
 * card already asks that, and a reel that asks twice asks once too often.
 */
export default defineSite({
  url: 'https://mwaforge.com',
  hook: {
    // The report marked the *tier strip* as the hook, because the hero of this page is
    // a `<header class="hero">` and the default hero is the first `<section>` in
    // `<main>` — which here is the strip below it. Naming the hero is the fix; it is
    // the one selector on this page that a shape cannot find.
    selector: 'header.hero',
    // Not the hero's own 'Websites that win you more customers.' — those words are on
    // screen underneath for the whole hook, and burning them over themselves is an
    // overlay arguing with its own shot. This says the audience and the speed, which
    // are the two things the h1 leaves for the small print.
    // No full stop on the first line: with one it drew 952px, and the safe box is
    // 950px. The line break carries the pause the punctuation would have.
    text: 'Websites for contractors\nLive in days.',
    // #63. The hero is entrance-animated and carries an 8s sheen across the headline
    // gradient; a still of it is a still of a page that is visibly moving in life.
    // `scroll` rather than `ambient` because the sheen alone is a slow shimmer, and
    // this page's motion is mostly keyed to the viewport moving. If the reveals turn
    // out not to re-fire, `check` says so and the shot degrades to `ambient` (#64) —
    // which is still the live hook this reel wants.
    motion: 'scroll',
  },
  beats: [
    {
      // 666px, and the report's 3.20 is what a pan needs at that height. That crops
      // to a 337px column, and this page lays its copy out 1024px wide inside the
      // 1080px viewport — so the first render of this beat came back as word
      // fragments. The window is opened instead of the punch being paid: 960px is what
      // a 2.0 fills a frame from, and 2.0 shows half that column rather than a third
      // of it. The 293px of #work the window then runs into is the section boundary,
      // and it sits under the scrim.
      //
      // The subject is four numbered steps laid out across the full width, so the
      // punch is spent travelling across them rather than down them: lateral reads as
      // reading the steps, vertical reads as scrolling a page.
      selector: '#how',
      height: 960,
      punchFactor: 2.0,
      direction: 'lateral',
      // The section's own heading is 32 characters, four over the label budget. The
      // half worth keeping is the promise, not the count.
      label: 'No agency runaround',
    },
    {
      // The fit beat (#65), and the reason this page is worth fitting. `#work` is a
      // 5312px column of five project cards at the 1080 viewport — punched into a
      // frame it is one card's corner, and panned it spends 3.5s travelling past four
      // of them. It is also past the fit cap at its own height, so `fit: true` alone
      // would fall back to a pan (#66).
      //
      // The `height` hatch is what makes it fittable: 2134px is the window fit widens
      // the viewport to 1200 for, and at 1200 this page's grid is three cards across
      // rather than one — so the whole portfolio, all five builds, lands inside one
      // frame at 90% of its own scale. This is #7's escape hatch used for what it is
      // for: no element wraps "the gallery as it lays out when there is room for it".
      //
      // No `y`: the window is anchored on the section's own top, which is the one
      // number that survives the reflow the fit is asking for.
      selector: '#work',
      height: 2134,
      fit: true,
      // #62 would default this beat's label to 'Real sites. Real businesses.' — 28
      // characters, exactly the budget, and it would draw. It is written over because
      // *fit* is what makes it the wrong line: the section arrives whole, so its own
      // heading is on screen at the top of the frame for the whole shot, and the
      // overlay would be the same six words again 900px lower. The default is right
      // for a punched beat whose heading is cropped away; a fit beat is the case where
      // it doubles.
      label: 'Five builds, all live',
    },
    {
      // The guarantee, 623px, and the report's 3.42 to fill a frame from it. The
      // rotation's next direction here is lateral, and beats[0] already took it — a
      // vertical pan over 623px of section wants 3.42 as well, so the override costs
      // this beat nothing but the naming.
      selector: 'main',
      y: 7069,
      height: 623,
      punchFactor: 3.42,
      direction: 'vertical',
      // 46 characters of heading, and the clause that matters is the second one: the
      // offer is not the price, it is who carries the risk until launch.
      label: "You don't pay till it's live",
    },
    {
      // 687px and a drift, so the punch is the frame's height and nothing more —
      // 1920/687 = 2.80, and the report's 3.11 is the pan headroom this beat does not
      // spend. The photograph is a face, which is what the drift is for.
      selector: '#about',
      punchFactor: 2.8,
      // 36 characters of heading; what it is claiming is the phone, not the shop.
      label: 'A shop that picks up',
    },
  ],
  cta: { credit: 'mwaforge.com' },
  // #67's second checked-in track, named because a config that names nothing gets the
  // signature track — which is the right fallback for a client's reel and the wrong
  // bed for the house's own. Quiet Confidence is 60s against the signature track's
  // 5:24, so an offset has to stay near its front; 0.8s is past the first attack and
  // still inside the opening.
  music: { file: 'audio/quiet-confidence.mp3', offset: 0.8 },
})
