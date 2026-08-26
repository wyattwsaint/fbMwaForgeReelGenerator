import { chromium } from 'playwright';
const SITES = { pharos: 'https://www.pharosacademy.net/', brobst: 'https://brobstcleaning.com/' };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto(SITES[process.argv[2]], { waitUntil: 'load', timeout: 60000 });
await p.evaluate(async () => { await document.fonts.ready; });
console.log(JSON.stringify(await p.evaluate(() => {
  const sel = el => el.id ? '#'+CSS.escape(el.id) : el.tagName.toLowerCase()+'.'+[...el.classList].slice(0,2).join('.');
  const secs = [...document.querySelectorAll('section, header, footer, main > div, [id]')]
    .map(el => { const r = el.getBoundingClientRect();
      return { s: sel(el), y: Math.round(r.top+scrollY), h: Math.round(r.height),
               emptyImgs: [...el.querySelectorAll('img')].filter(i => !i.currentSrc).length,
               text: (el.innerText||'').trim().slice(0,50).replace(/\s+/g,' ') }; })
    .filter(o => o.h > 350 && o.h < 3000).sort((a,b)=>a.y-b.y);
  const empties = [...document.images].filter(i => !i.currentSrc).map(i => {
    let el = i, path = []; while (el && el !== document.body) { path.unshift(sel(el)); el = el.parentElement; }
    return { y: Math.round(i.getBoundingClientRect().top + scrollY), path: path.slice(0,3).join(' > '), attrs: [...i.attributes].map(a=>a.name+'='+a.value.slice(0,30)).join(' ') };
  });
  return { secs, empties };
}), null, 1));
await b.close(); process.exit(0);
