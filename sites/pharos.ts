import { defineSite } from 'reel'

/**
 * Pharos Academy — the busy site, and every override earning its place. Each one
 * below traces to something the page does that the fixture did not.
 *
 * The copy is written for MWA Forge and not for the school. Every line names what the
 * page *does* — an immersive homepage, content laid out to be read, a form that is a
 * pleasure to fill — rather than what the school offers. This reel is shown to someone
 * deciding who builds their site, and the school's own pitch is one click away on the
 * site the card credits.

 */
export default defineSite({
  url: 'https://pharosacademy.net',
  hook: {
    // Neither the school's pitch nor the site's own 'Mornings here. Afternoons yours.'.
    // The hook names the thing the hero spends the next three seconds proving: a
    // painting that moves under the page's own lockup is what an immersive homepage
    // looks like, and the shot is the evidence for the line. Staying off #week's
    // heading is the second reason and used to be the only one — beats[0] pans across
    // that line at 3.5s, and a hook that says it first reads as a stutter.
    text: 'Immersive homepages',
    // #hero carries a <video> whose poster is a blurred LQIP and whose own fade-in is
    // still running at t=0, so frame 0 — the thumbnail Facebook shows — has to seek
    // past both. 2.0 is also the default, and it is written out anyway: #6 made this
    // a per-site value because it is the one settle knob a page can break, and the
    // page that the default was measured on is this one.
    videoTime: 2.0,
    // The hero is a painting that moves — hope-1920.mp4, 16:9, water and a sunlit sky
    // under `object-fit: cover`. Covering a 1080x1920 frame renders it 3413px wide, so
    // the frame holds 31.6% of the source and the browser throws the rest away before
    // this pipeline sees a pixel. *Which* 31.6% is the site's `object-position: 22%`,
    // and profiled column by column this painting's motion is all on its right: framed
    // at the site's own crop the hero reads 1.97 against a floor of 5. That is
    // ADR-0008's dead hook, and this page is where it was measured. (1.97 today where
    // that ADR wrote 1.46: the probe takes the highest of three pairs across a 2s window
    // and this painting's loop is longer than that, so a dead reading wanders. Both are
    // dead, which is the only thing either number is load-bearing for.)
    //
    // So the reel asks for a different column. Swept at the frame the shot is cut in:
    // 22% reads 1.97, 50% 6.31, 70% 13.71, 85% 18.61, and the right edge 21.64. 0.85 is
    // where the water and the sun's glitter fill the lower half while the shore and the
    // meadow still hold the bottom corner: the painting reads as a coast at 85% and as
    // open water at 100%, and the school is on a coast. What that composition costs is
    // 14% of a reading — 3.7x the floor rather than 4.3x, both far enough into open
    // ground that the choice is by eye and not by measurement. Against the site's own
    // crop it is 9.4x, which is the difference between a hook and a dead one.
    //
    // What it costs is the lighthouse, on the left, which is what the school is named
    // for. That is a real loss and it is the trade ADR-0011 makes: no 9:16 window of
    // this painting holds both the namesake and the water, the site is right to keep the
    // namesake for a visitor reading the page, and a 3-second silent shot whose whole
    // job is to move is not that visitor. The lockup survives either crop — it is the
    // page's own text drawn over the video, so no `object-position` moves it.
    //
    // `ambient` rather than `scroll`: the water moves on its own clock, and nothing here
    // is keyed to the page being scrolled.
    motion: 'ambient',
    heroPosition: 0.85,
  },
  beats: [
    {
      // A weekly schedule laid out in columns — Monday, Wednesday, Thursday across the
      // full width. Lateral reads as scanning the week; vertical reads as a table
      // being scrolled. The punch is the travel: 1080 * (1.8 - 1) = 864px of it.
      selector: '#week',
      punchFactor: 1.8,
      direction: 'lateral',
      // #week's own heading is 'Mornings here. Afternoons yours.', which is what #62
      // would default this beat to: the school's line, in a reel that is not selling
      // the school, and 32 characters against a budget of 28. The label keeps both out
      // and names what the shot shows a builder instead — a week laid out in columns
      // that can be read at a glance, which is the argument the lateral pan is making.
      label: 'Organized content',
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
      // and only half of what the shot shows. The label names what the pair has in
      // common instead: two unlike kinds of content, faces and figures, set so that
      // either one reads without hunting for it.
      //
      // Two lines, which a label may have now that it is set at the hook's size: at
      // 76px 'Clear and engaging design' draws 979px against a 950px box, and the
      // break is where the sense breaks anyway.
      label: 'Clear and engaging\ndesign',
    },
    {
      // 810px, so the frame's height is what the punch buys — and then some. The
      // rotation's next direction here is lateral, and beats[0] is the only other pan
      // in the reel and already took it: this override is the first one's cost, not a
      // second finding. A vertical pan wants 2130px of section, which at 810px is 2.7.
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
      // The last thing a visitor touches, so this is the beat that answers what the
      // page is like to *use* rather than to look at. #62 would default to #inquiry's
      // own heading, which is the school's ask; the label names the craft under it.
      label: 'Smooth, fillable forms',
    },
  ],
  cta: { credit: 'pharosacademy.net' },
  // The signature track, named only so the bed can be slid: the schema wants a `file`
  // whenever a `music` block is written at all, and this is the file it would have
  // used anyway. Quiet Confidence, since #87 — the name changed under this line, the
  // decision did not.
  music: { file: 'audio/quiet-confidence.mp3', offset: 1.1 },
})
