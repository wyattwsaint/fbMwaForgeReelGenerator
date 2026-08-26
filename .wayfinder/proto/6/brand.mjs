import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(process.argv[2], { waitUntil:'load' });
console.log(JSON.stringify(await p.evaluate(() => {
  const out = {};
  const walk = rules => { for (const r of rules) {
    if (r.style) for (const n of r.style) if (n.startsWith('--')) out[n] = r.style.getPropertyValue(n).trim();
    if (r.cssRules) walk(r.cssRules);
  } };
  for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (e) { out['__err_'+ss.href] = e.message; } }
  const h1 = document.querySelector('h1');
  return { tokens: out, bodyFont: getComputedStyle(document.body).fontFamily, h1Font: h1 && getComputedStyle(h1).fontFamily };
}), null, 1));
await b.close(); process.exit(0);
