// PROTOTYPE (#6 follow-on) — one wide master with headroom on BOTH axes, for pan-direction variants.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1080,height:1920}, deviceScaleFactor:4 });
await p.goto('https://brobstcleaning.com/', { waitUntil:'load', timeout:60000 });
await p.evaluate(async () => { await document.fonts.ready; });
await p.evaluate(() => { for (const i of document.images) i.loading = 'eager'; });
await p.evaluate(async () => { const s = Math.round(innerHeight*0.8);
  for (let y=0; y<document.body.scrollHeight; y+=s) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,250)); }
  window.scrollTo(0,0); await new Promise(r=>setTimeout(r,300)); });
await p.evaluate(async () => { const t0=Date.now();
  for (const i of document.images) { if (!i.currentSrc) continue;
    while (!i.complete && Date.now()-t0<10000) await new Promise(r=>setTimeout(r,100)); try { await i.decode(); } catch {} } });
await p.evaluate(() => { for (const a of document.getAnimations()) {
  const it = a.effect?.getTiming?.().iterations;
  if (it === Infinity) { a.pause(); a.currentTime = 0; } else { try { a.finish(); } catch { a.pause(); } } } });
await p.screenshot({ path:'v_services.png', fullPage:true, clip:{ x:0, y:1022, width:1080, height:1231 } });
await b.close(); process.exit(0);
