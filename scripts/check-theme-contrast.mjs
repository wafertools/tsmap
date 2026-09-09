#!/usr/bin/env node
/**
 * Every theme's `--accent` must clear WCAG AA (4.5:1) as TEXT on every ground it
 * is actually painted on.
 *
 * `--accent` is a text colour before it is anything else — `.tb-btn:hover`,
 * `.btn-row:hover`, `.btn-chip:hover`, `.btn-secondary:hover`, `.btn-caret.is-on`
 * and `#help-btn:hover` all set `color: var(--accent)`, most of them over
 * `--bg-hover-row`, one over `--bg-accent-hover`. But it is *chosen* per theme
 * for how it looks against the page, which is why five theme blocks shipped an
 * accent that fails as text on their own surfaces: Solarized Light (3.00:1),
 * Solarized Dark (3.09:1 — under AA against every one of its own grounds),
 * Light and Auto's light half (4.24:1) and Catppuccin Latte (4.45:1).
 *
 * A script rather than a Vitest case because these values exist only in
 * `index.html`'s CSS — there is no TS copy to assert against, and the frontend
 * tsconfig has no Node types to read a file with. Same shape as
 * check-theme-docs.mjs / check-button-styles.mjs, and runs beside them.
 *
 * **A checker that cannot fire reports clean forever**, so everything here fails
 * loudly rather than skipping: an unparseable colour, a theme with no accent, a
 * theme with no grounds, and — the one that matters most — a theme block this
 * file failed to FIND. The expected set of themes is derived from
 * `src/theme.ts`'s `THEME_GROUPS` (the picker's own list, already the source of
 * truth for check-theme-docs.mjs) rather than counted here, so a block lost to a
 * reformat is a failure and a new theme is checked from the day it is added.
 *
 * Run:  node scripts/check-theme-contrast.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawCss = readFileSync(resolve(root, 'index.html'), 'utf8');
const themeTs = readFileSync(resolve(root, 'src/theme.ts'), 'utf8');

/** The grounds `--accent` is used as text on. Not every theme defines every one. */
const GROUNDS = ['--bg-app', '--bg-toolbar', '--bg-overlay', '--bg-input', '--bg-hover-row', '--bg-accent-hover'];
const AA_TEXT = 4.5;
/** Auto's two halves, which are not `[data-theme]` blocks. */
const AUTO_DARK = 'auto (dark half)';
const AUTO_LIGHT = 'auto (light half)';

const problems = [];

// ── Colour ───────────────────────────────────────────────────────────────────

/** #rgb / #rrggbb / #rrggbbaa → [r,g,b] in 0..1, or null if not one of those.
 *  Alpha is rejected rather than ignored: a translucent ground's real contrast
 *  depends on what is behind it, which this file cannot know. */
function channels(hex) {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  if (full.length === 8 && full.slice(6) !== 'ff') return null;   // genuinely translucent
  if (full.length !== 6 && full.length !== 8) return null;
  const out = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  return out.some(Number.isNaN) ? null : out;
}
const linearize = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(rgb) {
  const [r, g, b] = rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2.1 relative-contrast ratio between two opaque colours. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ── CSS ──────────────────────────────────────────────────────────────────────

/** Comments out, so a `}` inside one cannot end a block early. */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the rule whose selector starts at `from` in `text`, brace-matched
 *  — not read to the first `}`, which a nested rule or a comment would cut
 *  short. Takes the text so it works inside a media query's body too. */
function blockIn(text, from) {
  const open = text.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;   // unbalanced — caller reports it as a missing block
}
const blockAt = from => blockIn(css, from);

/** A declared value, verbatim (`#abc`, `rgba(...)`, `var(--x)`), or undefined. */
function declared(body, token) {
  const m = body.match(new RegExp(token.replace(/-/g, '\\-') + ':\\s*([^;]+);'));
  return m?.[1].trim();
}

/** Resolve a declared value to RGB, recording WHY if it cannot be resolved —
 *  never returning undefined silently. */
function colorOf(body, token, where) {
  const raw = declared(body, token);
  if (raw === undefined) return undefined;              // not declared here: legitimate
  if (!raw.startsWith('#')) {
    problems.push(`${where}: ${token} is \`${raw}\` — this check only understands hex, so it cannot measure it. Use a hex literal, or teach this script that syntax.`);
    return null;
  }
  const rgb = channels(raw);
  if (!rgb) {
    problems.push(`${where}: ${token} is \`${raw}\` — not an opaque #rgb/#rrggbb/#rrggbbff colour.`);
    return null;
  }
  return rgb;
}

// ── The blocks that must exist ───────────────────────────────────────────────

const themeValues = [...themeTs.matchAll(/\{\s*value:\s*'([a-z-]+)'/g)].map(m => m[1]);
if (themeValues.length === 0) {
  problems.push('src/theme.ts: could not read THEME_GROUPS — this script has lost its list of themes to check.');
}
// `auto` is not a [data-theme] block; it is the bare `:root` default plus a
// prefers-color-scheme override, so it is expanded into its two halves.
const expected = themeValues.flatMap(v => (v === 'auto' ? [AUTO_DARK, AUTO_LIGHT] : [v]));

const found = new Map();
// The dark default, written as `:root, :root[data-theme="dark"]` and shared with Auto.
const darkStart = css.indexOf(':root,');
if (darkStart !== -1) {
  const body = blockAt(darkStart);
  if (body) { found.set(AUTO_DARK, body); found.set('dark', body); }
}
for (const m of css.matchAll(/:root\[data-theme="([a-z-]+)"\]/g)) {
  const body = blockAt(m.index);
  if (body) found.set(m[1], body);
}
// Auto's light half lives in a media query, so a `[data-theme]` sweep cannot see
// it — and it carried the same failing accent as `light`, which is exactly how
// it went unnoticed. `blockAt` on the @media returns the media body; the `:root`
// rule inside it is what holds the tokens.
const mediaStart = css.indexOf('@media (prefers-color-scheme: light)');
if (mediaStart !== -1) {
  const mediaBody = blockAt(mediaStart);
  const rootIn = mediaBody?.indexOf(':root') ?? -1;
  const inner = rootIn === -1 ? null : blockIn(mediaBody, rootIn);
  if (inner) found.set(AUTO_LIGHT, inner);
}

for (const name of expected) {
  if (!found.has(name)) {
    problems.push(`${name}: no token block found in index.html — either the theme was removed without updating THEME_GROUPS, or the selector this script looks for has changed. Nothing was measured for it.`);
  }
}

// ── The measurement ──────────────────────────────────────────────────────────

for (const name of expected) {
  const body = found.get(name);
  if (!body) continue;
  const accent = colorOf(body, '--accent', name);
  if (accent === undefined) {
    // Not "no opinion": a theme block with no --accent inherits the previous
    // one's, which is how a dark accent lands on light grounds unmeasured.
    problems.push(`${name}: defines no --accent of its own, so it inherits one chosen for a different set of grounds. Declare it explicitly.`);
    continue;
  }
  if (accent === null) continue;   // already reported by colorOf

  let measured = 0;
  for (const ground of GROUNDS) {
    const rgb = colorOf(body, ground, name);
    if (rgb === undefined || rgb === null) continue;
    measured++;
    const r = contrast(accent, rgb);
    if (r < AA_TEXT) {
      problems.push(`${name}: --accent ${declared(body, '--accent')} on ${ground} ${declared(body, ground)} measures ${r.toFixed(2)}:1, under AA's ${AA_TEXT}:1`);
    }
  }
  if (measured === 0) {
    problems.push(`${name}: declares --accent but none of ${GROUNDS.join('/')} — nothing to measure it against.`);
  }
}

if (problems.length) {
  console.error(`theme contrast FAILED (${problems.length}):\n  ` + problems.join('\n  '));
  console.error('\nFix by adjusting that theme\'s --accent (darker on light grounds, lighter on dark),');
  console.error('not by changing the ground — the accent is the token chosen for looks, the ground is shared.');
  process.exit(1);
}
console.log(`theme contrast OK — --accent clears AA as text on every ground in all ${expected.length} theme blocks (from THEME_GROUPS)`);
