// PROTOTYPE (#6) — same sections, two settling routines. V1 = #12's. V2 = hardened.
import { chromium } from 'playwright';
const SITES = {
  pharos: { url: 'https://www.pharosacademy.net/', secs: [
    { n:'hero', y:0, h:1920 }, { n:'week', y:1920, h:1310 }, { n:'teachers', y:3230, h:530 },
    { n:'costs', y:3262, h:416 }, { n:'faith', y:3635, h:810 }, { n:'inquiry', y:4445, h:834 } ] },
  brobst: { url: 'https://brobstcleaning.com/', secs: [
    { n:'hero', y:80, h:942 }, { n:'services', y:1022, h:1231 }, { n:'about', y:2520, h:873 },
    { n:'reviews', y:3392, h:965 }, { n:'cta', y:4357, h:730 } ] },
};
const NAME = process.argv[2], MODE = process.argv[3];   // v1 | v2
const { url, secs } = SITES[NAME];
const VIDEO_T = 2.0;   // pinned hero-video time

const settleV1 = async (p) => {                       // #12's routine, verbatim
  await p.evaluate(async () => { await document.fonts.ready; });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(1200);
};

const settleV2 = async (p) => {
  await p.evaluate(async () => { await document.fonts.ready; });
  // 1. force every lazy image to load now, then step-scroll so IntersectionObserver loaders fire too
  await p.evaluate(() => { for (const i of document.images) { i.loading = 'eager'; if (i.dataset.src && !i.src) i.src = i.dataset.src; } });
  await p.evaluate(async () => {
    const step = Math.round(innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
  });
  // 2. wait for images to be decoded — serially, never Promise.all (#11: renderer crash)
  await p.evaluate(async () => {
    const t0 = Date.now();
    for (const i of document.images) {
      if (!i.currentSrc) continue;
      while (!i.complete && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 100));
      try { await i.decode(); } catch {}
    }
  }).catch(() => {});
  // 3. pin every video to a fixed frame — deterministic, and frame 0 is the FB thumbnail
  await p.evaluate(async (t) => {
    for (const v of document.querySelectorAll('video')) {
      v.autoplay = false;
      v.play = () => Promise.resolve();   // the site's own script re-plays it otherwise (seen in v4)
      v.pause();
      await new Promise(res => { const ok = () => res(); v.addEventListener('seeked', ok, { once: true });
        v.currentTime = Math.min(t, v.duration || t); setTimeout(res, 3000); });
      v.pause();
    }
  }, VIDEO_T);
};

const freezeAnims = (p) => p.evaluate(() => {          // finish/seek CSS + WAAPI animations
  for (const a of document.getAnimations()) {
    const it = a.effect?.getTiming?.().iterations;
    if (it === Infinity) { a.pause(); a.currentTime = 0; }   // infinite: park at a known phase
    else { try { a.finish(); } catch { a.pause(); } }
  }
});

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: 'load', timeout: 60000 });
const t0 = Date.now();
MODE === 'v1' ? await settleV1(p) : await settleV2(p);
const tSettle = Date.now() - t0;

for (const s of secs) {
  const t1 = Date.now();
  if (MODE === 'v1' || MODE === 'v4') {
    if (MODE === 'v4') await freezeAnims(p);   // infinite anims are live even at scroll 0 (brobst pulse dot)
    // #12: one fullPage shot clipped to the section — page never actually scrolls there
    await p.screenshot({ path: `${NAME}_${MODE}_${s.n}.png`, fullPage: true,
      clip: { x: 0, y: s.y, width: 1080, height: Math.min(1920, s.h) } });
  } else {
    // V2/V3: scroll the page to the section, freeze, shoot the viewport
    await p.evaluate(y => window.scrollTo(0, y), s.y);
    await p.waitForTimeout(500);
    await freezeAnims(p);
    // V3: sticky/fixed chrome is page furniture, not section content. Hide it off the hook.
    if (MODE === 'v3') await p.evaluate(atTop => {
      for (const el of document.querySelectorAll('body *')) {
        const pos = getComputedStyle(el).position;
        if (pos !== 'fixed' && pos !== 'sticky') continue;
        // opacity, not visibility/display: descendants can't override it, and it doesn't reflow
        if (!atTop) el.style.setProperty('opacity', '0', 'important');
        else el.style.removeProperty('opacity');
      }
    }, s.y === 0 || s.y < 200);
    await p.screenshot({ path: `${NAME}_${MODE}_${s.n}.png`,
      clip: { x: 0, y: 0, width: 1080, height: Math.min(1920, s.h) } });
  }
  console.log(NAME, MODE, s.n, Date.now() - t1 + 'ms');
}
console.log(JSON.stringify({ site: NAME, mode: MODE, tSettle,
  emptyImgs: await p.evaluate(() => [...document.images].filter(i => !i.currentSrc).length),
  vid: await p.evaluate(() => [...document.querySelectorAll('video')].map(v => ({ t: v.currentTime, paused: v.paused }))) }));
await b.close(); process.exit(0);
