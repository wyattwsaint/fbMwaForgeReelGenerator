import { defineSite } from 'reel'

/**
 * Brobst Cleaning — the plain site, and the proof that the defaults are defaults.
 *
 * Sections, punch and a credit line. Every move, direction, cue and the bed itself
 * are the plan's, not this file's: the reel drifts in on the hero, pans up #services,
 * drifts #about, pans across #reviews and lands on MWA Forge's card, cut to the
 * signature track. Nothing here says any of that, which is the point.
 *
 * The punch factors are the one thing a real page forced. Every section is shorter
 * than the 1920px frame — 730 to 1231px — so each one is punched to at least the
 * height a frame needs, and the pans past that.
 */
export default defineSite({
  url: 'https://brobstcleaning.com',
  hook: { text: 'Spotless, every time.' },
  beats: [
    // 1231px, and a vertical pan wants 210px of travel on top of a frame.
    { selector: '#services', punchFactor: 1.8 },
    // 873px, so a drift is punched to the frame's height and nothing more.
    { selector: '#about', punchFactor: 2.3 },
    // 965px, which is what asks for the 2.1: a punched frame is 1920/2.1 = 915px of
    // section. The lateral travel then comes free — it is bought with the punch, not
    // with the height, and 1.19 would have been enough for the move alone.
    { selector: '#reviews', punchFactor: 2.1 },
  ],
  cta: { credit: 'brobstcleaning.com' },
})
