#!/usr/bin/env node
// "One value, many places" — the check that finds the class of defect a diff
// review structurally cannot.
//
// It does not ask "is this value on the scale?" (that is a per-site question).
// It asks: HOW MANY distinct literal values of this kind exist, and should
// there be that many? Every styling defect found on 2026-09-01 had that shape —
// four definitions of the secondary button, two tooltip looks, two card frames,
// three font stacks, eight radii. Each is defensible in isolation; the defect
// exists only in the comparison, which is why reading one file never finds it.
//
// Budgets are ceilings on DISTINCT literals, not on usage. Raising one is a
// deliberate act: add the value to a scale instead, or record here why a new
// role genuinely exists.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGETS = {
  'box-shadow':     { max: 3, why: 'SHADOW / --shadow-*: panel, menu, modal' },
  'transition':     { max: 3, why: 'MOTION / --motion-*: fast, base' },
  'line-height':    { max: 4, why: 'LEADING / --leading-*: none, tight, base' },
  'letter-spacing': { max: 2, why: 'TRACKING / --tracking' },
  'font-family':    { max: 3, why: 'FONT.family (inherits) + ui-monospace' },
};
const PATTERNS = {
  // Both quote styles. A template literal is matched whole so the token-skip
  // below can see the `${MOTION.…}` inside it — an earlier version only matched
  // single quotes, so a correctly-tokenised `\`transform ${MOTION.base}\`` was
  // counted as yet another distinct literal and the check failed on its own fix.
  'box-shadow':     [/boxShadow:\s*(?:'([^']+)'|`([^`]+)`)/g, /box-shadow:\s*([^;'"}]+)/g],
  'transition':     [/transition:\s*(?:'([^']+)'|`([^`]+)`)/g, /transition:\s*([^;'"}]+)/g],
  'line-height':    [/lineHeight:\s*(?:'([^']+)'|`([^`]+)`)/g, /line-height:\s*([^;'"}]+)/g],
  'letter-spacing': [/letterSpacing:\s*(?:'([^']+)'|`([^`]+)`)/g, /letter-spacing:\s*([^;'"}]+)/g],
  'font-family':    [/fontFamily:\s*(?:'([^']+)'|`([^`]+)`)/g, /font-family:\s*([^;'"}]+)/g],
};
const SKIP = ['guideExtension.ts', 'icons.ts', 'version.ts', 'userGuideHtml.ts'];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out); }
    else if (/\.(ts|html|css)$/.test(e) && !SKIP.some(s => e.endsWith(s))) out.push(p);
  }
  return out;
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'index.html'];
const files = roots.flatMap(r => (statSync(r).isDirectory() ? walk(r) : [r]));
const failures = [];

for (const [prop, { max, why }] of Object.entries(BUDGETS)) {
  const seen = new Map();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const re of PATTERNS[prop]) {
      for (const m of text.matchAll(re)) {
        const v = (m[1] ?? m[2] ?? '').trim().replace(/,$/, '');
        // Token references are the point — only literals count against budget.
        // `includes`, not a prefix test: a template literal wraps the token.
        if (!v) continue;
        if (/(var\(--|SHADOW\.|MOTION\.|LEADING\.|TRACKING|ALPHA\.|FONT\.)/.test(v)) continue;
        if (/^(inherit|none|unset|initial)$/.test(v)) continue;
        if (!seen.has(v)) seen.set(v, f);
      }
    }
  }
  if (seen.size > max) {
    failures.push({ prop, max, why, values: [...seen.entries()] });
  }
}

// ── Font-size floor ────────────────────────────────────────────────────────
//
// A distinct-value budget is the wrong shape for font-size: the problem there
// isn't "how many sizes" but "is any of them too small". CLAUDE.md's rule is a
// flat 12px minimum, because smaller text renders poorly on Windows WebView2 —
// a platform none of us develops on, so nothing catches a regression by eye.
// Five sites had drifted to 10–11px (two of them the limits/type columns in the
// test selector, on screen in every STDF load) with no check to notice.
const FONT_FLOOR_PX = 12;
const FONT_SIZE_RES = [
  /font-size:\s*([0-9.]+)px/g,          // CSS text and cssText strings
  /fontSize:\s*'([0-9.]+)px'/g,         // the `el()` / Object.assign style-object form
];
const tooSmall = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const re of FONT_SIZE_RES) {
    for (const m of text.matchAll(re)) {
      const px = parseFloat(m[1]);
      if (px >= FONT_FLOOR_PX) continue;
      const line = text.slice(0, m.index).split('\n').length;
      tooSmall.push(`${f}:${line}  ${px}px`);
    }
  }
}

if (tooSmall.length) {
  console.error(`\nstyle scales: ${tooSmall.length} font-size(s) below the ${FONT_FLOOR_PX}px minimum`);
  console.error('(CLAUDE.md, "Cross-platform CSS rules" — smaller text renders poorly on Windows WebView2):\n');
  for (const t of tooSmall) console.error(`  ${t}`);
  console.error('');
  process.exit(1);
}

if (failures.length) {
  console.error('\nstyle scales: a property has more distinct literal values than its budget.\n');
  for (const { prop, max, why, values } of failures) {
    console.error(`  ${prop}: ${values.length} distinct (budget ${max}) — use ${why}`);
    for (const [v, f] of values.slice(0, 8)) console.error(`      ${v.slice(0, 52).padEnd(54)} ${f}`);
    console.error('');
  }
  process.exit(1);
}
console.log(`style scales OK — no property exceeds its distinct-value budget, no font-size below ${FONT_FLOOR_PX}px`);
