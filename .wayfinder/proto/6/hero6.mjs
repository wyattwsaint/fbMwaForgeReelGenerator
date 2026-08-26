// PROTOTYPE (#6) — frame 0 is the FB thumbnail. Three candidates for the Pharos hero.
import { chromium } from 'playwright';
const MODE = process.argv[2];   // t0 | t2 | poster
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1080,height:1920}, deviceScaleFactor:2 });
await p.goto('https://www.pharosacademy.net/', { waitUntil:'load', timeout:60000 });
await p.evaluate(async () => { await document.fonts.ready; });
await p.evaluate(async (mode) => {
  for (const v of document.querySelectorAll('video')) {
    v.autoplay = false; v.play = () => Promise.resolve(); v.pause();
    if (mode === 'poster') { v.style.setProperty('opacity','0','important'); continue; }
    await new Promise(res => { v.addEventListener('seeked', () => res(), { once:true });
      v.currentTime = mode === 't2' ? 2.0 : 0.04; setTimeout(res, 3000); });
    v.pause();
  }
  if (mode === 'poster') for (const i of document.querySelectorAll('img.hero-still'))
    { i.style.setProperty('opacity','1','important'); i.style.filter = 'none'; }
}, MODE);
await p.waitForTimeout(600);
await p.screenshot({ path:`hero_${MODE}.png`, clip:{ x:0, y:0, width:1080, height:1920 } });
await b.close(); process.exit(0);
