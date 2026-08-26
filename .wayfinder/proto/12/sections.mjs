import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto('https://www.pharosacademy.net/', { waitUntil: 'load', timeout: 60000 });
await p.evaluate(async () => { await document.fonts.ready; });
const out = await p.evaluate(() => {
  const sel = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const c = [...el.classList].filter(x => !/^(is-|has-|css-)/.test(x)).slice(0,2);
    return el.tagName.toLowerCase() + (c.length ? '.' + c.join('.') : '');
  };
  return [...document.querySelectorAll('section, header, footer, main > div, [id]')]
    .map(el => { const r = el.getBoundingClientRect();
      return { s: sel(el), y: Math.round(r.top + scrollY), h: Math.round(r.height), text: (el.innerText||'').trim().slice(0,60).replace(/\s+/g,' ') }; })
    .filter(o => o.h > 400 && o.h < 3000)
    .sort((a,b) => a.y - b.y);
});
console.log(JSON.stringify(out, null, 1));
await b.close(); process.exit(0);
