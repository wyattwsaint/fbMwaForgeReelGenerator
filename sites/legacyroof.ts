import { defineSite } from 'reel'

/**
 * Legacy Roofing — a plain, id'd page, so this is close to `brobst.ts`: three
 * sections, their measured punches, and nothing else.
 *
 * The hook is the page's own hero, which already says 'BUILT TO OUTLAST THE
 * WEATHER.' — so the overlay says the other half of the pitch, the where and the
 * who, rather than reading the hero back at itself.
 *
 * The sections run 832–1010px, all short of the 1920px frame, so every punch here
 * is the height a frame needs plus what the move travels.
 *
 * `#faq` was the fourth beat and is not one now. It is the page's tallest section
 * and its best copy, but it is a two-column wall of question-and-answer text: at
 * the punch its own height asks for, the questions lose their first word off the
 * left edge, and unpunching it far enough to read (1.2, over an 1800px window)
 * only widened the wall. Dense prose is not reel material. Three beats it is.
 *
 * Labels are left to #62: each section's own heading runs 10–25 characters,
 * under #9's 28.
 */
export default defineSite({
  url: 'https://legacyroofpa.com',
  hook: { text: 'Central PA roofers.\nStraight answers.' },
  beats: [
    // 832px, and 2.57 is what that height alone asks for — but the section opens on
    // ~200px of padding, so a vertical pan at that punch spends its first second on
    // empty ground. The window drops the padding and the punch comes down with it.
    { selector: '#services', y: 2060, height: 1000, punchFactor: 2.2 },
    // 1010px, the proof shots. 'RECEIPTS.'
    { selector: '#showcase', punchFactor: 2.11 },
    // 897px on its own, which punches to 2.38 — and at that crop the section's
    // heading loses its first word off the left edge. The window runs on into the
    // top of #faq instead, which buys the punch down to 1.5 and puts the whole
    // line back in frame.
    { selector: '#why', height: 1400, punchFactor: 1.5 },
  ],
  cta: { credit: 'legacyroofpa.com' },
})
