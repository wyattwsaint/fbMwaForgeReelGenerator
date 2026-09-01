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
      // Every beat in this reel stands 30% further out than it used to, so that a shot
      // shows the page rather than a detail of it. A punch is the only thing pulling
      // the frame in, so 1.8 / 1.3 = 1.385 — and a punch is also the only thing a
      // lateral pan travels across, so the travel falls with it: 1080 * (1.385 - 1) =
      // 416px where it was 864. Across 3.5s that is 4.0px a frame, twice
      // MIN_PAN_PX_PER_FRAME, so the pan is still a pan and not a drift with a name.
      //
      // The height is the cost of standing back. A frame is only full while the
      // section is at least 1920 / punch tall, which at 1.385 is 1386px against
      // #week's own 1310 — so the window runs 80px past the table's foot to keep the
      // frame fed. What that 80px holds is the white above #teachers, which is the
      // page breathing and not another section arriving.
      selector: '#week',
      height: 1390,
      punchFactor: 1.385,
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
      // up. Out 30% is 2.7 / 1.3 = 2.077, which needs 925px before the frame is even
      // full and leaves a vertical pan nothing at all to travel across — travel here
      // is `section * punch - 1920`, and at 925px that is one pixel.
      //
      // So the window is sized for the *move* rather than for the frame: 1053px is
      // what keeps the 267px of travel this pan has today, which is the 2.5px a frame
      // it has always run at. It reaches y 5243, so the last stretch of the pan brings
      // the top of #inquiry into shot. That is the trade this beat pays for standing
      // back, and it is a soft one — the pan is travelling downward and arriving at
      // the form is where the reel goes next anyway.
      selector: '#faith',
      height: 1053,
      punchFactor: 2.077,
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
