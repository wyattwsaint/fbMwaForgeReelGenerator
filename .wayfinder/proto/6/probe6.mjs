// PROTOTYPE (#6) — what threatens a static master on the two real sites?
import { chromium } from 'playwright';
const SITES = { pharos: 'https://www.pharosacademy.net/', brobst: 'https://brobstcleaning.com/' };
const NAME = process.argv[2];
const URL = SITES[NAME];

const snap = () => ({
  anims: [...document.getAnimations()].map(a => ({
    id: a.animationName || a.transitionProperty || a.id || '?',
    st: a.playState,
    dur: (a.effect?.getTiming?.().duration) ?? null,
    it: (a.effect?.getTiming?.().iterations) ?? null,
    tgt: a.effect?.target ? (a.effect.target.tagName + (a.effect.target.id ? '#'+a.effect.target.id : '') + '.' + [...a.effect.target.classList].slice(0,2).join('.')) : '?',
  })),
  // anything visually hidden that has layout size = candidate un-revealed content
  hidden: [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 20) return false;
    const cs = getComputedStyle(el);
    return (+cs.opacity < 0.9) || cs.visibility === 'hidden' || /translate|scale/.test(cs.transform) && cs.transform !== 'none';
  }).map(el => el.tagName + (el.id?'#'+el.id:'') + '.' + [...el.classList].slice(0,2).join('.') + ' op=' + getComputedStyle(el).opacity + ' tf=' + getComputedStyle(el).transform.slice(0,40)).slice(0, 30),
  imgs: [...document.images].map(i => ({ src: i.currentSrc.slice(-40), loading: i.loading, complete: i.complete, nw: i.naturalWidth })),
  vids: [...document.querySelectorAll('video')].map(v => ({ src: (v.currentSrc||'').slice(-40), preload: v.preload, poster: (v.poster||'').slice(-30), rs: v.readyState, paused: v.paused, t: v.currentTime, w: v.videoWidth })),
});

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const t0 = Date.now();
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
const tLoad = Date.now() - t0;
await p.evaluate(async () => { await document.fonts.ready; });
const tFonts = Date.now() - t0;

const A = await p.evaluate(snap);                                      // right after load
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(1500);
const B = await p.evaluate(snap);                                      // at bottom
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(1200);
const C = await p.evaluate(snap);                                      // back at top (capsections.mjs state)

const meta = await p.evaluate(() => ({ h: document.body.scrollHeight, ua: navigator.userAgent.includes('Headless') }));
console.log(JSON.stringify({ site: NAME, tLoad, tFonts, meta, atLoad: A, atBottom: B, backAtTop: C }, null, 1));
await b.close(); process.exit(0);
