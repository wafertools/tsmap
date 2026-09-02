#!/usr/bin/env node
// Every button gets its appearance from ONE place: a shared CSS class in
// index.html (.btn-primary, .btn-secondary, .btn-icon, .btn-chip, .tb-btn).
//
// This exists because "the secondary button" had four independent definitions
// that disagreed on border, colour, padding and size, and only one had a hover
// state — so half the app's buttons reacted to the pointer and half looked like
// labels.
//
// NOTE ON THE SCANNER: an earlier version of this check used
// `\.style\.cssText\s*=\s*[^;]+;` to grab the assignment. That stops at the
// first semicolon — which is INSIDE the CSS string (`margin-top:4px;...`) — so
// it only ever inspected the first declaration and passed everything. Read the
// assignment with a quote-aware scan instead; a regex cannot do this correctly.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// CSS-text form (`background:`) and the object form `el()` takes (`background:`,
// `fontSize:`, `borderRadius:`). The object form is why an earlier version of
// this check passed while filterTable.ts and fileFilterUI.ts styled their
// buttons inline: it only ever looked at `.style.cssText`.
const APPEARANCE = /\b(background|border|color|padding|font-size|border-radius|fontSize|borderRadius|borderColor)\s*:/;

/** Text of the statement starting at `from`, to the first `;` outside quotes. */
function statementAt(text, from) {
  let quote = null;
  for (let i = from; i < text.length && i < from + 4000; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === ';') return text.slice(from, i + 1);
  }
  return text.slice(from, from + 4000);
}

const offenders = [];
for (const file of readdirSync('src').filter(f => f.endsWith('.ts'))) {
  const text = readFileSync(join('src', file), 'utf8');
  // Both construction styles: `document.createElement('button')` AND the `el(...)`
  // helper (`el('button', {...})` / `el(doc, 'button', {...})`). Only the first
  // was matched before, so filterTable.ts and fileFilterUI.ts kept inline
  // appearance styles while this check reported OK — the check itself was the
  // reason the inconsistency survived three attempts to fix it.
  const re = /(?:const|let)\s+(\w+)\s*=\s*(?:document\.createElement\('button'\)|el\((?:\w+,\s*)?'button')/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const varName = m[1];
    const scope = text.slice(m.index, m.index + 2500);
    if (new RegExp(`${varName}\\.className\\s*=|${varName}\\.classList\\.add`).test(scope)) continue;
    // Three ways a button gets styled: `.style.cssText =`, `Object.assign(x.style,
    // {...})`, and the style object passed straight to `el('button', {...})`.
    let stmt = null;
    const styleAt = scope.search(new RegExp(`${varName}\\.style\\.cssText\\s*=|Object\\.assign\\(${varName}\\.style`));
    if (styleAt !== -1) stmt = statementAt(scope, styleAt);
    else {
      const elAt = scope.search(/el\((?:\w+,\s*)?'button'/);
      if (elAt !== -1) stmt = statementAt(scope, elAt);
    }
    if (!stmt || !APPEARANCE.test(stmt)) continue;   // layout-only, or unstyled
    offenders.push(`${file}:${text.slice(0, m.index).split('\n').length}  (${varName})`);
  }
}

// ── Second check: does the class a button names actually REACH it? ──────────
//
// The check above only asks whether a button HAS a shared class. That is not
// the same as being styled, and the difference shipped: `.tool-btn` was defined
// only as `.mapping-tools .tool-btn`, and the one `.tool-btn` outside that row
// (the mapping footer's "Load bin definitions…") therefore matched no rule at
// all — it rendered with the browser's own 2px outset bevel and hardcoded
// #efefef/#000, ignoring every theme. This check passed it the whole time.
//
// The rule: a class used on a button must have at least one rule that stands on
// its own, so it cannot silently depend on where the button happens to sit.
// A descendant-scoped rule on TOP of an unscoped base is fine — that's a local
// tweak (e.g. `.mapping-tools .btn-secondary { white-space: nowrap }`).
const html = readFileSync('index.html', 'utf8');
// Comments are stripped FIRST. Without that, prose inside a `/* … */` — which
// routinely names the very classes it is explaining — is swept into the text
// preceding the next `{` and parsed as part of a selector. That is not
// hypothetical: this check's own first version passed the defect it was written
// to catch, because the comment left where `.tool-btn` had been still mentioned
// `.tool-btn`, which registered it as having a base rule.
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map(m => m[1]).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

const unscoped = new Set();
for (const [, selector] of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
  for (const part of selector.split(',')) {
    const p = part.trim();
    const classes = [...p.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(x => x[1]);
    if (classes.length !== 1) continue;             // compound/descendant — not a base rule
    if (/\.[\w-]+\s+[.\w[]/.test(p)) continue;      // has a descendant combinator
    unscoped.add(classes[classes.length - 1]);
  }
}

// Classes actually placed on buttons, from both TS and the markup.
const onButtons = new Map();   // class -> first "file:line" that used it
const note = (cls, where) => { if (!onButtons.has(cls)) onButtons.set(cls, where); };
for (const file of readdirSync('src').filter(f => f.endsWith('.ts'))) {
  const text = readFileSync(join('src', file), 'utf8');
  for (const m of text.matchAll(/\.className\s*=\s*'([^'$]+)'/g)) {
    const line = text.slice(0, m.index).split('\n').length;
    for (const c of m[1].trim().split(/\s+/)) note(c, `src/${file}:${line}`);
  }
  for (const m of text.matchAll(/<button[^>]*class="([^"$]+)"/g)) {
    const line = text.slice(0, m.index).split('\n').length;
    for (const c of m[1].trim().split(/\s+/)) note(c, `src/${file}:${line}`);
  }
}
for (const m of html.matchAll(/<button[^>]*class="([^"$]+)"/g)) {
  const line = html.slice(0, m.index).split('\n').length;
  for (const c of m[1].trim().split(/\s+/)) note(c, `index.html:${line}`);
}

// Layout-only helpers carry no appearance and legitimately have no base rule.
const LAYOUT_ONLY = new Set(['tool-sep']);
const unreachable = [];
for (const [cls, where] of onButtons) {
  if (LAYOUT_ONLY.has(cls) || unscoped.has(cls)) continue;
  const scopedRules = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map(m => m[1]).filter(sel => new RegExp(`\\.${cls}\\b`).test(sel));
  if (scopedRules.length === 0) continue;   // no rule anywhere — not this check's job
  unreachable.push(`${where}  .${cls}  — styled only via: ${scopedRules.map(r => r.trim()).join(' | ')}`);
}

if (unreachable.length) {
  console.error(`\nbutton styles: ${unreachable.length} button class(es) have no rule that stands alone,`);
  console.error(`so the styling silently depends on an ancestor and is lost wherever that ancestor isn't:\n`);
  for (const u of unreachable) console.error(`  ${u}`);
  console.error(`\nGive the class a base rule, or use one of the shared classes.`);
  console.error(`A descendant-scoped rule layered on top of a base rule is fine.\n`);
  process.exit(1);
}

if (offenders.length) {
  console.error(`\nbutton styles: ${offenders.length} button(s) style their own appearance instead of using a shared class:\n`);
  for (const o of offenders) console.error(`  ${o}`);
  console.error(`\nUse .btn-primary, .btn-secondary, .btn-icon, .btn-chip or .tb-btn (index.html).`);
  console.error(`Inline styles are for LAYOUT only — margin, flex, width.\n`);
  process.exit(1);
}
console.log(`button styles OK — every styled button uses a shared class, and all ${onButtons.size} classes resolve without an ancestor`);
