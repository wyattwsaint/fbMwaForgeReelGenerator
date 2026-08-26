// PROTOTYPE (#6) — reel masters for brobstcleaning.com using the V4 settle. Punch-in per beat.
import { chromium } from 'playwright';
const URL = 'https://brobstcleaning.com/';
const SHOTS = [                                  // x,y,w,h in CSS px within the page; punched for 9:16 + pan travel
  { n:'b_hook',     dsf:4, clip:{ x:275, y:110,  width:530, height:942  } }, // hero, drift
  { n:'b_services', dsf:4, clip:{ x:270, y:1022, width:540, height:1231 } }, // pan travel 271px
  { n:'b_about',    dsf:4, clip:{ x:295, y:2520, width:491, height:873  } }, // drift
  { n:'b_reviews',  dsf:4, clip:{ x:340, y:3400, width:400, height:955  } }, // pan travel 244px
];
const b = await chromium.launch();
for (const s of SHOTS) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: s.dsf });
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.evaluate(async () => { await document.fonts.ready; });
  await p.evaluate(() => { for (const i of document.images) i.loading = 'eager'; });
  await p.evaluate(async () => { const step = Math.round(innerHeight*0.8);
    for (let y=0; y<document.body.scrollHeight; y+=step) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,250)); }
    window.scrollTo(0,0); await new Promise(r=>setTimeout(r,300)); });
  await p.evaluate(async () => { const t0=Date.now();
    for (const i of document.images) { if (!i.currentSrc) continue;
      while (!i.complete && Date.now()-t0 < 10000) await new Promise(r=>setTimeout(r,100)); try { await i.decode(); } catch {} } });
  await p.evaluate(() => { for (const a of document.getAnimations()) {
    const it = a.effect?.getTiming?.().iterations;
    if (it === Infinity) { a.pause(); a.currentTime = 0; } else { try { a.finish(); } catch { a.pause(); } } } });
  await p.screenshot({ path: `${s.n}.png`, fullPage: true, clip: s.clip });
  const d = await p.evaluate(() => [document.images.length, [...document.images].filter(i=>!i.currentSrc).length]);
  console.log(s.n, 'ok imgs', d.join('/'));
  await p.close();
}
await b.close(); process.exit(0);
