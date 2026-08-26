import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:1080,height:1920} });
await p.goto(process.argv[2], { waitUntil:'load' });
console.log(process.argv[2], JSON.stringify(await p.evaluate(() => {
  const px = (el,prop) => el ? getComputedStyle(el)[prop] : null;
  const btn = [...document.querySelectorAll('a,button')].find(e => { const c = getComputedStyle(e).backgroundColor;
    return c !== 'rgba(0, 0, 0, 0)' && e.getBoundingClientRect().width > 80; });
  // most-used non-transparent background across the page = the site's dominant surface
  const tally = {};
  for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width*r.height < 5000) continue;
    const c = getComputedStyle(el).backgroundColor; if (c === 'rgba(0, 0, 0, 0)') continue; tally[c] = (tally[c]||0) + r.width*r.height; }
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([c,a])=>c+' '+Math.round(a/1e6)+'Mpx');
  return { h1Color: px(document.querySelector('h1'),'color'), btnBg: btn && getComputedStyle(btn).backgroundColor, btnText: btn && btn.innerText.slice(0,24), surfaces: top };
}), null, 1));
await b.close(); process.exit(0);
