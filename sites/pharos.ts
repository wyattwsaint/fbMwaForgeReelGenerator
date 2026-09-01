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
      // being scrolled.
      //
      // Out again: this reel stands 30% further back than it did, on top of the 30% it
      // already took, so that a shot shows the page rather than a detail of it. A punch
      // is the only thing pulling the frame in, so 1.385 / 1.3 = 1.065 — and that is
      // where this beat stops short of the ask. A punch is also the only thing a
      // lateral pan travels across, and 1080 * (1.065 - 1) is 70px: 0.67px a frame
      // across 3.5s, a third of MIN_PAN_PX_PER_FRAME. That is not a slow pan, it is a
      // still frame that drifts a hair and is filed under 'lateral'.
      //
      // So the punch clamps at 1.194, which is exactly the pan's own floor: 1080 *
      // 0.194 = 210px, and panTravelNeeded(3500) is 210. This beat stands 14% further
      // out rather than 30%, and what the other 16% buys is the only lateral pan in the
      // reel. beats[2] is the reel's other pan and it is vertical, so a #week that
      // drifts is a reel with no lateral travel anywhere in it.
      //
      // The height is the cost of standing back, and it is a steeper one at 1.194 than
      // at 1.385. A frame is only full while the section is at least 1920 / punch tall
      // — 1609px against #week's own 1310 — so the window runs to y 3529 and takes the
      // first 292px of #teachers with it, where it used to take 73.
      //
      // At 73px that was white. At 292 it is not: the contact sheet for this render
      // ends beats[0] on 'Alongside Homeschool Families' and opens beats[1] on the same
      // line, so the cut repeats a heading rather than crossing a margin. That is the
      // real price of the pan, and it is charged at the cut rather than inside the
      // shot — beats[2] pays the same one at its own cut, 523px into #inquiry. Two of
      // this reel's three cuts now repeat a line of type, which is the thing to look at
      // first if a third ÷1.3 is ever asked for (ADR-0013).
      selector: '#week',
      height: 1609,
      punchFactor: 1.194,
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
      // Standing back 30% (1.5 / 1.3 = 1.154) needs 1920 / 1.154 = 1664px of section
      // to keep the frame full, so the window grows with the punch rather than instead
      // of it. From #teachers' top that reaches y 4907, which is inside #faith's white
      // margin and short of anything #faith draws — the pair the window was opened for
      // is still the whole of what the shot shows.
      //
      // This beat does not take the second 30%, and it is one of the two that ADR-0013
      // was written around. 1.154 / 1.3 is 0.888, and 1.0 is 'no punch': config refuses
      // anything under it, because a punch below 1.0 asks for page pixels the browser
      // never rasterised. `fit` is the sanctioned way past 1.0 (ADR-0007) and it is no
      // help here — fitViewportWidth clamps at the base width until a section is taller
      // than one frame, so a fit under 1920px is a no-op and `check` then refuses the
      // beat as too short for a frame. To fit *and* stand 30% back, this window would
      // have to be 2496px: from y 3237 that reaches y 5733, through #costs, through the
      // whole of #faith, and 733px into #inquiry. That is not the teachers and what a
      // family pays for them, it is half the page. The beat keeps the distance it has.
      selector: '#teachers',
      height: 1670,
      punchFactor: 1.154,
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
      // 810px on its own, so this beat has always been the one the punch is holding
      // up — and having the deepest punch in the reel is what lets it take the full 30%
      // a second time where the others cannot. 2.7 / 1.3 / 1.3 = 1.598, still well
      // clear of the 1.0 floor.
      //
      // The window is sized for the *move* rather than for the frame, as it was at
      // 2.077. A full frame wants 1920 / 1.598 = 1202px; the pan wants more, because
      // travel here is `section * punch - 1920` and the 210px panTravelNeeded asks of a
      // 3.5s shot needs 1333px of section. So 1333, and the pan now runs at the 2px a
      // frame floor rather than the 2.5 it has always had — that is the last of the
      // margin this move was carrying.
      //
      // It reaches y 5523, so the pan spends its final stretch inside #inquiry instead
      // of arriving at its top: 523px in, where 2.077 reached 243. The trade is the one
      // the first 30% already made and it is still soft — the pan travels downward and
      // the form is where the reel goes next — but it is more than twice as much of it,
      // and this beat is where that cost has become something to look at.
      selector: '#faith',
      height: 1333,
      punchFactor: 1.598,
      direction: 'vertical',
    },
    {
      // 945px, which is another beat that would have to crop to half-width to fill a
      // frame — the form it is showing is the widest thing on the page. A taller
      // window is what drops the punch instead, and standing back 30% (1.6 / 1.3 =
      // 1.231) asks for 1560px of it.
      //
      // #inquiry is the last section on the page — it starts at y 5000 and the page
      // ends at 6452 — so there is no 1560px below its top to take, and `check`
      // refuses a window that runs off the foot rather than sliding it quietly. So the
      // window is placed by hand and it opens 120px above the section, in the white
      // under #faith: this is the one beat whose `y` is written, and standing back is
      // why.
      //
      // The second 30% has nowhere at all to go here, and this is the beat that makes
      // ADR-0013's escape an escape rather than a caution. 1.231 / 1.3 is 0.947, under
      // the 1.0 floor; and a `fit` standing 30% back wants a 2496px window, which on a
      // 6452px page cannot open below y 3956 — and y 3956 is inside #teachers. So there
      // is no `y` this beat could be given: measured from either end, the page runs out
      // before the window does. #inquiry keeps 1.231, and being the last section on the
      // page is the whole reason.
      selector: '#inquiry',
      y: 4880,
      height: 1570,
      punchFactor: 1.231,
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
