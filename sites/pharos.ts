import { defineSite } from 'reel'

/**
 * Pharos Academy — the busy site, and every override earning its place. Each one
 * below traces to something the page does that the fixture did not.

 */
export default defineSite({
  url: 'https://pharosacademy.net',
  hook: {
    // Not the site's own 'Mornings here. Afternoons yours.' — that headline is the
    // first thing beats[0] pans across, and a hook that repeats it 3.5s early reads as
    // a stutter rather than as a theme.
    text: 'Classical school.\nMornings only.',
    // #hero carries a <video> whose poster is a blurred LQIP and whose own fade-in is
    // still running at t=0, so frame 0 — the thumbnail Facebook shows — has to seek
    // past both. 2.0 is also the default, and it is written out anyway: #6 made this
    // a per-site value because it is the one settle knob a page can break, and the
    // page that the default was measured on is this one.
    videoTime: 2.0,
  },
  beats: [
    {
      // A weekly schedule laid out in columns — Monday, Wednesday, Thursday across the
      // full width. Lateral reads as scanning the week; vertical reads as a table
      // being scrolled. The punch is the travel: 1080 * (1.8 - 1) = 864px of it.
      selector: '#week',
      punchFactor: 1.8,
      direction: 'lateral',
      // #week's own heading is 'Mornings here. Afternoons yours.' — the line the hook
      // above deliberately does not use, because hearing it twice in the first 6.5s
      // reads as a stutter. #62 would default this beat that exact line, so the label
      // is what keeps the hook's decision from being undone by the page. It is also
      // over budget at 32 characters, which is the smaller of the two reasons.
      label: 'Monday, Wednesday, Thursday',
    },
    {
      // #teachers is 530px on its own, #costs 416 — either alone is short enough that
      // the punch needed to fill a frame crops a full-width layout to under half its
      // width, which cuts headings mid-word. The subject is the teachers *and* what a
      // family pays for them; no element wraps the pair, so the beat takes #teachers'
      // top and runs 1310px down through #costs. This is #7's escape hatch used for
      // what it is for, and the taller window is what keeps the punch at 1.5.
      selector: '#teachers',
      height: 1310,
      punchFactor: 1.5,
      // The window spans both sections, so the heading #62 finds inside it is
      // #teachers' alone — 'Alongside Homeschool Families', one character over budget
      // and only half of what the shot shows. The label names the pair the window was
      // opened for.
      label: 'Teachers and tuition',
    },
    {
      // 810px, so the frame's height is what the punch buys — and then some. The
      // rotation's next direction here is lateral, and beats[0] is the only other pan
      // in the reel and already took it: this override is the first one's cost, not a
      // second finding. A vertical pan wants 2130px of section, which at 810px is 2.7.
      selector: '#faith',
      punchFactor: 2.7,
      direction: 'vertical',
    },
    {
      // 834px, which is another beat that would have to crop to half-width to fill a
      // frame — the form it is showing is the widest thing on the page. Run it 1200px
      // down instead and the punch drops to 1.6.
      selector: '#inquiry',
      height: 1200,
      punchFactor: 1.6,
      label: 'Enrolling for Fall',
    },
  ],
  cta: { credit: 'pharosacademy.net' },
  // The signature track, named only so the bed can be slid: the schema wants a `file`
  // whenever a `music` block is written at all, and this is the file it would have
  // used anyway. Quiet Confidence, since #87 — the name changed under this line, the
  // decision did not.
  music: { file: 'audio/quiet-confidence.mp3', offset: 1.1 },
})
