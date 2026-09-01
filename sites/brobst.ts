import { defineSite } from 'reel'

/**
 * Brobst Cleaning — the plain site, and the proof that the defaults are defaults.
 *
 * Sections, punch, two labels and a credit line. Every move, direction, cue and the
 * bed itself are still the plan's, not this file's: the reel drifts in on the hero,
 * pans up #services, drifts #about, pans across #reviews and lands on MWA Forge's
 * card, cut to the signature track. Nothing here says any of that, which is the point.
 *
 * The punch factors are the first thing a real page forced. Every section is shorter
 * than the 1920px frame — 730 to 1231px — so each one is punched to at least the
 * height a frame needs, and the pans past that.
 *
 * The labels are the second (#62). This file used to name no copy at all, because a
 * beat with no label drew nothing; now a beat with no label draws its section's own
 * heading, and two of Brobst's run 40 and 55 characters. Silence is no longer the
 * absence of a decision here, so the two lines are written rather than shrunk to fit —
 * and #services, whose heading already fits, still says nothing.
 */
export default defineSite({
  url: 'https://brobstcleaning.com',
  hook: { text: 'Spotless, every time.' },
  beats: [
    // 1231px, and a vertical pan wants 210px of travel on top of a frame.
    // The section's own heading is 'What we do, each one well.', which #62 defaulted
    // this beat until ADR-0012 set a label at the hook's size — at 76px it draws 994px
    // across a 950px box. The label is the heading's own claim, broken at its comma.
    { selector: '#services', punchFactor: 1.8, label: 'What we do,\neach one well.' },
    // 873px, so a drift is punched to the frame's height and nothing more.
    // The section's own heading is 55 characters, so #62 defaults this beat a line it
    // cannot draw: the label is what the heading was saying, at a length type does not
    // have to shrink for.
    // Two lines since ADR-0012 set a label at the hook's size: 27 characters is well
    // inside the count, and at 76px it draws 969px across a 950px box. The break is
    // where the line's own comma is.
    { selector: '#about', punchFactor: 2.3, label: 'One person,\nstart to finish' },
    // 965px, which is what asks for the 2.1: a punched frame is 1920/2.1 = 915px of
    // section. The lateral travel then comes free — it is bought with the punch, not
    // with the height, and 1.19 would have been enough for the move alone.
    // 40 characters of heading, and the half worth keeping is the second visit: what
    // the section is really claiming is repeat business, not first impressions.
    { selector: '#reviews', punchFactor: 2.1, label: 'After the second visit' },
  ],
  cta: { credit: 'brobstcleaning.com' },
})
