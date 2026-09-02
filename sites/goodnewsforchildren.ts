import { defineSite } from 'reel'

/**
 * Good News for Children — a one-page site whose whole structure is a scroll, and the
 * first config whose captions are about the *site* rather than about what the site is
 * selling. This reel is MWA Forge's marketing (CONTEXT.md, CTA), and this client's
 * product is a children's book: a reel that sold the book would be a reel doing the
 * client's job. So every line names something the build does — the full-bleed video
 * hero, the scroll-keyed reveals, the layout that stays readable at any width — and
 * the card at the end says who to call for one.
 *
 * The page forced two things. First, the hero is named: `#heroTrack` is a 4224px
 * scroll track with a sticky `.stage` inside it, so the default hero rule — first
 * <section> in <main> — walks 4224px down the page and opens the reel on the book
 * section instead of on the meadow. `.stage` rather than `#heroTrack` because the
 * stage is the frame the visitor actually sees: 1080x1920 exactly, one frame, with the
 * video in it.
 *
 * Second, every beat is a `y`/`height` window, for mwaforge.ts's reason. The four
 * sections under `main` run 341–746px and none carries an id, so `selector: 'main'`
 * resolves an element and the window pins the subject. That makes this a config to
 * re-run `reel sections` against after any client edit: the hero track alone is 62% of
 * the page's height, so anything added above `main` slides all three beats at once.
 *
 * Every beat stands at ADR-0013's distance — its punch divided by 1.3 — and every
 * window here is what that distance costs: a punched frame is taller the further back
 * it stands, so all three windows grew, and the last one grew upward because the page
 * ends. None of the three hits the 1.0 floor, so none of them stops short.
 */
export default defineSite({
  url: 'https://www.goodnewsforchildren.com',
  hook: {
    // The real hero, and not the one the default rule finds — see the note above.
    selector: '.stage',
    // Not the page's own verse: the hook is drawn over the hero already saying it.
    // This line is what the reel is arguing, said once at the top.
    text: 'Sites that open\nlike a film.',
    // `.meadow > video` is a looping meadow, playing on its own clock rather than on
    // the scroll — a still here is one frozen frame of grass, which is the shot the
    // whole hero exists to not be. `check` measures it in the 9:16 frame before
    // anything is recorded (ADR-0008) and degrades this to `still` if it reads dead.
    motion: 'ambient',
  },
  beats: [
    {
      // The book section — 746px on its own, which is a punch of 2.6 before the frame
      // is full. The window runs from its top down through the tagline band, so the
      // shot travels from the cover art into the line under it.
      //
      // Every beat here stands at ADR-0013's distance: the punch the beat would have
      // had, divided by 1.3, so a shot shows the page rather than a detail of it.
      // 1.9 / 1.3 = 1.462.
      //
      // The window is sized for the move rather than for the frame. A full frame needs
      // 1314px at this punch, but beat 1 is the reel's vertical pan (#6's rotation) and
      // a vertical pan travels across `height * punch - 1920`: the 210px it needs wants
      // 1457px of window. 1460 leaves 215px, and reaches y 5684 — 16px short of the
      // closing section, so the pan still ends inside the pair the window was opened
      // for. That is this beat's whole vertical margin spent: a further pull-out here
      // is a drift, whatever the config calls it.
      selector: 'main',
      y: 4224,
      height: 1460,
      punchFactor: 1.462,
      label: 'Personalized,\nfor you',
    },
    {
      // The invite, plus the band above it — 404px and 610px, neither enough for a
      // frame alone and no element wrapping the pair, so the window spans both through
      // `main`. This is the beat that shows the reveals arriving.
      //
      // Standing back 30% (1.8 / 1.3 = 1.385) needs 1387px of section to keep the frame
      // full, so the window grows with the punch rather than instead of it. Nothing but
      // the frame is asking for the height — this beat drifts — so 1390 is the whole
      // bill, and it reaches y 6360: inside the closing section, 401px short of the
      // foot of the page.
      selector: 'main',
      y: 4970,
      height: 1390,
      punchFactor: 1.385,
      label: 'Customized details',
    },
    {
      // The closing section and the footer under it, down to the foot of the page. The
      // subject is the navigation and the sitemap — the part of a build a visitor uses
      // rather than reads.
      //
      // 1.9 / 1.3 = 1.462, and the page is what pays for it. A full frame at 1.462 is
      // 1314px and only 1061px of page exists below 5700, so the window cannot grow
      // downward: `check` refuses a window off the foot rather than sliding it quietly.
      // It grows *upward* instead — 6761 - 1314 = 5447, the last frame this page has.
      // This is the reel's lateral pan and a lateral pan centres itself in its window
      // (`camera.ts`), so the 253px it opens early is not a slide off the top; it is the
      // closing section arriving with the invite's foot still above it, which is what
      // standing back looks like on a page whose last section is short.
      selector: 'main',
      y: 5447,
      height: 1314,
      punchFactor: 1.462,
      label: 'We create websites\nin days, not months.',
    },
  ],
  cta: { credit: 'goodnewsforchildren.com' },
})
