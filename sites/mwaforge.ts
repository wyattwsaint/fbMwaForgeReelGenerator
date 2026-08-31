import { defineSite } from 'reel'

/**
 * MWA Forge's own reel (#67) — the shop's site cut with the shop's tools, and the
 * first config to reach for a live hook, a fit beat and a bed of its own at once.
 *
 * Every beat here reaches for #7's `y`/`height` hatch, which on the two client sites
 * was the exception. The page is why: its sections run 576–687px, and a punch that
 * fills a 1920px frame out of one of those crops the layout to a 300px column, which
 * cuts every heading to a syllable. So each beat takes a *window* instead — pharos'
 * `#teachers`-through-`#costs` move, run four times because this page is short
 * sections the whole way down — and the punch drops into the 1.5–1.9 the other two
 * reels mostly sit in.
 *
 * It goes further than pharos did, and the extra step is the fragile one: pharos only
 * ever writes `height`, letting the selector supply the top. Two beats below write `y`
 * as well, which is an **absolute page coordinate** (`src/check.ts`) — so their
 * `selector: 'main'` picks nothing but a resolving element, and the subject is pinned
 * to a pixel. Anything the client adds above them slides the whole page and those two
 * beats frame the wrong thing, quietly: `check` measures a window against the page's
 * height and the punch's, and a window that still fits is a window it passes. The
 * review stills are what catch it. So this is the config to re-run `reel sections`
 * against after a site edit, and the pixels are the price of a page whose two best
 * closing sections carry no ids.
 */
export default defineSite({
  url: 'https://mwaforge.com',
  hook: {
    // The hero is a <header class="wrap hero">, not a <section>, so the default hero
    // rule — first <section> in <main> — walks straight past it and lands on the
    // pricing strip below. Naming it is what keeps the reel from opening on prices.
    selector: 'header.hero',
    // Not the page's own 'Websites that win you more customers.' — the hook is drawn
    // over the hero that is already saying it, and the line read twice at once reads
    // as a rendering fault rather than as a theme.
    text: 'Built for contractors.\nLive in days.',
    // The hero is five absolutely-positioned .hero-shape blocks that drift on their
    // own clock and parallax against scroll, and every one of them is at opacity 0 on
    // the frame a still would freeze — so `still` here is a hook of empty background.
    // `scroll` over `ambient` because their entrance is keyed to the page moving
    // rather than to time passing; #64 degrades this to ambient and says so if the
    // reveals turn out not to re-fire.
    motion: 'scroll',
  },
  beats: [
    {
      // How it works. #how is 666px on its own, which is a punch of 2.9 before the
      // frame is even full. The window runs from its top down through the four step
      // cards and out into #work's own heading, which is 1300px.
      //
      // This beat is a *lateral* pan, because the hook scrolls: a scroll hook spends
      // the rotation's vertical step (`src/plan.ts`), so the height buys framing here
      // and nothing else — lateral travel comes from the punch alone, and 1.8 leaves
      // 864px of it, which is more than the 728 a pan asks for.
      selector: '#how',
      y: 1090,
      height: 1300,
      punchFactor: 1.8,
      // The window's first heading is 'Four steps. No agency runaround.' — 32
      // characters, over #9's 28. The shorter line is the same promise.
      label: 'Four steps, no runaround.',
    },
    {
      // The portfolio, and the beat that is fit (#65): the grid is cards, and a punch
      // into cards shows one card cropped down its middle. #work is 5312px whole,
      // which is past #66's legibility cap, so the beat takes the top 2400px of the
      // grid — from below the section head, which the beat above already ran through.
      // 2400px asks for a 1350px capture viewport, a pull-out to 80% and well clear of
      // the 50% floor; the width is an estimate, since widening reflows the grid and
      // `capture` re-measures (`src/frame.ts`), and the render is where it was checked
      // that the reflowed grid still lands its first builds whole.
      selector: '#work',
      y: 2046,
      height: 2400,
      fit: true,
      // The section's own heading, written out because the window starts below it —
      // there is none inside to inherit, and an unlabelled beat is one with no text on
      // it rather than a problem. This is the line the shot is showing.
      label: 'Real sites. Real businesses.',
    },
    {
      // The guarantee and the person behind it — 623px and 687px, neither enough for
      // a frame on its own and no element wrapping the pair, so the window spans both
      // through `main`. The rotation draws this one lateral, which travels on the
      // punch alone; the 1550px is what fills the frame at 1.5, with 270px over, so
      // the beat survives the vertical it might have drawn instead. This is the one
      // beat that is two subjects, and they are two halves of the same promise: nobody
      // pays up front, and there is one name on the other end of the phone.
      selector: 'main',
      y: 7069,
      height: 1550,
      punchFactor: 1.5,
      label: 'The guarantee, and the guy.',
    },
    {
      // The closing ask. 576px of section, run down to the foot of the page — 1030px,
      // which is the room the drift needs at 1.9. A drift rather than a pan because
      // the rotation puts one here, and this is the beat that hands over to the card.
      selector: 'main',
      y: 8378,
      height: 1030,
      punchFactor: 1.9,
      // 'Ready to win more customers?' is on budget, and is also the hook's own claim
      // said a third time. This line is the step instead.
      label: 'Ready when you are.',
    },
  ],
  // The card already sets `mwaforge.com` in large type, so this reel is the one that
  // says it twice. The credit line answers 'whose site was that', and here the honest
  // answer is the same domain — a blank credit would be the card declining to answer.
  // CONTEXT.md's CTA entry records the duplication rather than the card special-casing
  // itself out of it.
  cta: { credit: 'mwaforge.com' },
  // The reel's own bed, and the first config to name a track for the sound of it
  // rather than to slide the default (`audio/PROVENANCE.md`). No offset: nothing in
  // this reel is timed to the music, so the bed starts where the track does and is
  // trimmed and faded to the reel's length like every other bed (#8).
  music: { file: 'audio/quiet-confidence.mp3' },
})
