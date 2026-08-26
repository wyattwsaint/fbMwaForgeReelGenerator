// PROTOTYPE (#12) — capture one master per beat, framed on its own section.
import { chromium } from 'playwright';
const OUT = process.env.OUT;
const SHOTS = [
  { n: 'm_hero',  dsf: 2, clip: { x: 0,   y: 0,    width: 1080, height: 1920 } }, // #hero
  { n: 'm_week',  dsf: 4, clip: { x: 270, y: 1920, width: 540,  height: 1310 } }, // #week, punched 2x
  { n: 'm_faith', dsf: 2, clip: { x: 0,   y: 3635, width: 1080, height: 1920 } }, // #faith
  { n: 'm_costs', dsf: 3, clip: { x: 135, y: 3262, width: 810,  height: 1440 } }, // #costs, punched 1.33x
];
for (const s of SHOTS) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: s.dsf });
  await p.goto('https://www.pharosacademy.net/', { waitUntil: 'load', timeout: 60000 });
  await p.evaluate(async () => { await document.fonts.ready; });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));   // settle lazy images
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${s.n}.png`, fullPage: true, clip: s.clip }); // fullPage REQUIRED with clip (#11)
  console.log(s.n, 'ok');
  await b.close();
}
process.exit(0);
