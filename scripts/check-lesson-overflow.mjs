#!/usr/bin/env node
// Finds Learn tsmap slides whose content runs past the slide: a slide is a fixed 1280 × 720 box, so a long bullet list or
// an oversized image is cut off at the bottom and the build says nothing. Run it after `npm run lessons:build`.
//
//   npm run lessons:check:overflow
//
// Each lesson in site/learn is opened in Chrome ($CHROME_PATH, else the system Chrome); every slide's content is
// measured against its box. Exits 1 and lists lesson, slide number and heading for each slide that overflows.
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

const root = resolve('site/learn');
if (!existsSync(root)) { console.error('site/learn is missing — run `npm run lessons:build` first.'); process.exit(2); }
const lessons = readdirSync(root, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d\d-/.test(d.name) && existsSync(join(root, d.name, 'index.html')))
  .map(d => d.name).sort();

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let bad = 0;
for (const lesson of lessons) {
  await page.goto(pathToFileURL(join(root, lesson, 'index.html')).href);
  await page.waitForLoadState('load');
  const found = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('section').forEach((s, i) => {
      // A slide is clipped at its own box: anything whose bottom lies beyond it, or content taller than the box, is lost.
      const box = s.getBoundingClientRect();
      let lowest = 0;
      for (const el of s.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) lowest = Math.max(lowest, r.bottom - box.top);
      }
      const over = Math.max(s.scrollHeight - s.clientHeight, lowest - box.height);
      if (over > 2) out.push({ n: i + 1, over: Math.round(over), title: (s.querySelector('h1,h2')?.textContent ?? '').trim().slice(0, 50) });
    });
    return out;
  });
  for (const f of found) { bad++; console.log(`${lesson}  slide ${f.n}  runs ${f.over}px past the bottom  “${f.title}”`); }
}
await browser.close();
if (bad) { console.error(`\n${bad} slide${bad > 1 ? 's' : ''} overflow.`); process.exit(1); }
console.log(`overflow OK — ${lessons.length} lessons, no slide runs past its box`);
