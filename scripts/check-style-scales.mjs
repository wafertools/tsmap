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

/**
 * Blanks comments, preserving every newline and the file's length, so line
 * numbers stay exact and offsets still index the original.
 *
 * Necessary, not tidy: `chartShell.ts` carries a comment that *quotes*
 * `outline: none` while explaining why it was removed. A scanner without this
 * reads the explanation as the offence — the same shape of bug as the old
 * `check-button-styles.mjs`, whose regex stopped at the first `;` because that
 * `;` was inside a CSS string, so it inspected one declaration and pronounced
 * everything clean while the user kept finding bad buttons.
 *
 * Quote-aware for the same reason: `'https://…'` and a CSS string holding `//`
 * must not start a comment, and an apostrophe inside a comment must not open a
 * string. Tracks ' " ` and escapes.
 */
function stripComments(src) {
  let out = '', i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    if (quote) {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += c; i++;
  }
  return out;
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'index.html'];
const files = roots.flatMap(r => (statSync(r).isDirectory() ? walk(r) : [r]));
const failures = [];

for (const [prop, { max, why }] of Object.entries(BUDGETS)) {
  const seen = new Map();
  for (const f of files) {
    const text = stripComments(readFileSync(f, 'utf8'));
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
// A distinct-value budget is the wrong instrument for font-size: the question is
// not how many sizes exist but whether any is too small. So this is a separate
// flat check, ported from tsmap's copy of this script — the two repos share the
// mechanism and differ only in the constant, because the rules genuinely differ.
// UI_STANDARDS.md sets 11px here ("Nothing in the DOM goes below 11px", with an
// 11px tier for uppercase micro-labels and ornaments); tsmap sets 12px, because
// smaller text renders poorly on the Windows WebView2 it ships in and it has no
// equivalent ornament tier.
const FONT_FLOOR_PX = 12;
const FONT_SIZE_RES = [
  /font-size:\s*([0-9.]+)px/g,          // CSS text and cssText strings
  /fontSize:\s*'([0-9.]+)px'/g,         // the style-object form
];
const tooSmall = [];
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'));
  for (const re of FONT_SIZE_RES) {
    for (const m of text.matchAll(re)) {
      const px = parseFloat(m[1]);
      if (px >= FONT_FLOOR_PX) continue;
      tooSmall.push(`${f}:${text.slice(0, m.index).split('\n').length}  ${px}px`);
    }
  }
}

if (tooSmall.length) {
  console.error(`\nstyle scales: ${tooSmall.length} font-size(s) below the ${FONT_FLOOR_PX}px minimum`);
  console.error('(UI_STANDARDS.md, "Type scale" — nothing in the DOM goes below 11px):\n');
  for (const t of tooSmall) console.error(`  ${t}`);
  console.error('');
  process.exit(1);
}

// ── Focus ring never silently suppressed ───────────────────────────────────
//
// UI_STANDARDS.md: the browser's focus ring is the focus indicator, and
// suppressing it is permitted only where it cannot render AND a replacement is
// drawn. The rule this check actually enforces is the second half — that the
// reason is WRITTEN DOWN next to the suppression. An unexplained `outline:none`
// is indistinguishable from an accident, which is how option rows in the long
// test combo ended up with keyboard focus and mouse hover looking identical:
// each site was locally plausible, and nothing marked which were deliberate.
//
// A justification is any mention of the ring/focus/UI_STANDARDS in the comments
// immediately AROUND it — checked against the ORIGINAL text, since the scan
// itself runs on the comment-stripped copy.
//
// Both directions, not just above: `buildGuideSearch` sets the suppression
// inside a long `cssText` string and explains it on the following line
// ("suppressed above and replaced with a border-colour swap"), which is a
// perfectly good place for it. An above-only window reported that as a
// violation on this check's first run — a false positive that would have had
// me "fix" correct code had I not read the site before believing the tool.
const FOCUS_JUSTIFY_LINES = 6;
const FOCUS_RE = /outline:\s*'?none'?/g;
const unexplained = [];
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const text = stripComments(raw);
  const rawLines = raw.split('\n');
  for (const m of text.matchAll(FOCUS_RE)) {
    const line = text.slice(0, m.index).split('\n').length;
    // COMMENT lines around it, and never the offending line itself. Both
    // exclusions are load-bearing, and both were found by the negative test
    // rather than by reasoning:
    //   - include the offending line and it always excuses itself, since it
    //     necessarily contains the word "outline". The rule could not fire at
    //     all, and reported a clean pass on a deliberately planted violation.
    //   - match code as well as comments and any nearby `outline:` declaration
    //     silently vouches for its neighbour.
    const near = rawLines
      .slice(Math.max(0, line - 1 - FOCUS_JUSTIFY_LINES), line + FOCUS_JUSTIFY_LINES)
      .filter((_, k) => k !== Math.min(line - 1, FOCUS_JUSTIFY_LINES))
      .filter(l => /^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    // Deliberately NOT a bare `UI_STANDARDS` match. The first version accepted
    // that alone, and the negative test for this rule then passed when it
    // should have failed: the probe happened to sit under an unrelated comment
    // citing the standard, which was enough to excuse it. The justification has
    // to be about the FOCUS INDICATOR specifically, or "near a doc reference"
    // becomes a blanket exemption.
    if (/focus|outline|\bring\b|cannot render/i.test(near)) continue;
    unexplained.push(`${f}:${line}`);
  }
}

// ── Spacing: off-scale literals, budgeted ──────────────────────────────────
//
// Deliberately a BUDGET on distinct off-scale values, not a ban. UI_STANDARDS.md
// allows an off-scale value that aligns to another element rather than carrying
// rhythm ("snap deliberately and leave a comment where a value is optical"), so
// a ban would be wrong and would be worked around. What must not happen is
// off-scale values quietly multiplying.
//
// Only LITERALS at a style site count. A named constant — `TOOLBAR_BAND_CSS`,
// `EDGE_GUTTER` — is invisible here, which is the intended incentive: the way
// to spend an off-scale value is to name it once and say why, exactly what the
// 44px-at-four-call-sites defect needed and did not have.
const SPACE_SCALE = new Set([0, 1, 2, 4, 6, 8, 10, 12, 16, 24]);
// Two forms, because both repos write spacing both ways: the style-object
// (`paddingTop: '8px'`) and CSS text (`padding: 6px 12px` in a stylesheet or a
// cssText string). The CSS form is shorthand-aware — every px token in the
// declaration counts, since `padding: 6px 13px` hides an off-scale value behind
// an on-scale one.
const SPACING_RES = [
  // The whole quoted value, not a single length: a style object routinely
  // holds shorthand (`padding: '2px 7px'`), and a pattern anchored on one
  // number skipped every one of them. That is how a 7px chip padding sat
  // unnoticed while the check reported zero off-scale values — the rule was
  // right and its reach was not.
  /(?:padding|margin|gap|inset|top|right|bottom|left)[A-Za-z]*:\s*[`']([^`']+)[`']/g,
  /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*:\s*([^;'"`}]+)/g,
];
// 4, a RATCHET pointing down. The 14 sites this rule originally found were all
// snapped; widening the style-object pattern to cover shorthand
// (`padding: '2px 7px'`, which a single-length pattern skipped) then exposed 7
// more across 4 values — 3, 7, 11 and 14px. Left as a budget rather than
// snapped blind, for the same reason as wmap's copy: each is a small change to
// a surface someone has to look at. Lower as they are cleared.
const OFF_SCALE_BUDGET = 4;
const offScale = new Map();
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const rawLines = raw.split('\n');
  const text = stripComments(raw);
  for (const re of SPACING_RES) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      // UI_STANDARDS.md's own escape hatch: "snap deliberately and leave a
      // comment where a value is optical". A text indent aligning under an
      // icon, or padding clearing a chevron, is measured against another
      // element and has no business on the rhythm scale. Say `optical` in a
      // comment on the same line and this rule stands aside — deliberately
      // narrow, deliberately visible in review, and deliberately requiring the
      // author to have written down why.
      if (/optical/i.test(rawLines[line - 1] ?? '')) continue;
      for (const tok of String(m[1]).matchAll(/(-?[0-9.]+)px/g)) {
        const px = Math.abs(parseFloat(tok[1]));
        if (SPACE_SCALE.has(px)) continue;
        if (!offScale.has(px)) offScale.set(px, `${f}:${line}`);
      }
    }
  }
}

// ── Radius: literals, budgeted ─────────────────────────────────────────────
//
// UI_STANDARDS.md gives radius three ROLES (control / container / pill), so a
// numeric literal at a style site is a fourth role invented in place. Budgeted
// rather than banned for the same reason spacing is: some are genuinely
// deliberate (a 2px rounding on a 9px legend swatch is not "control"), and a
// ban would just be worked around.
//
// Values that ARE a role were converted to the token instead of being admitted
// here — `4px` → `RADIUS.control`, `50%` → `RADIUS.pill` (identical rendering on
// a square) — so what remains is only the genuinely off-role.
// ZERO. The last literal was a `50%` on a 13px status dot, which is exactly
// `--radius-pill` on a square element — a role written the long way, not a
// fourth role.
const RADIUS_BUDGET = 0;
const RADIUS_RES = [
  /borderRadius:\s*'([0-9]+(?:px|%))'/g,
  /border-radius:\s*([0-9]+(?:px|%))/g,
];
const radiusLits = new Map();
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'));
  for (const re of RADIUS_RES) {
    for (const m of text.matchAll(re)) {
      const v = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      if (!radiusLits.has(v)) radiusLits.set(v, `${f}:${line}`);
    }
  }
}

// ── Every interactive element reacts to hover ──────────────────────────────
//
// UI_STANDARDS.md: a `cursor: pointer` promises the thing is interactive, and
// an element that offers the promise without visibly reacting reads as dead.
// The defect this catches is real and was found by hand: hover was wired on
// icon buttons and absent on text buttons, so the two classes of control
// behaved differently for no stated reason.
//
// Satisfied by any hover affordance in the same declaration or nearby: a
// `:hover` rule, `wireControlHover`, `controlStyle`, or a shared class that
// carries it. Deliberately generous — the goal is to catch a control with NO
// hover story, not to dictate which one.
// Resolved by ELEMENT, not by proximity. A line-window is the obvious
// implementation and the wrong one: the Insights option rows wire their hover
// nine lines below the `cursor: pointer`, so a ±8 window called them dead while
// they were fine, and widening it to ±40 only traded those false positives for
// false negatives elsewhere. Instead, find the variable the pointer is being
// set on, then ask whether ANYWHERE in the file wires hover for that variable.
const SCOPE_LINES = 60;   // generous enough for construct-then-wire, short enough to stay inside one function
const POINTER_RE = /cursor:\s*'?pointer'?/g;
// Does the scanned CSS carry a blanket hover rule for buttons?
const GLOBAL_BUTTON_HOVER = files.some(f =>
  /(?:^|[\s,{}])button[^{,;]*:hover/.test(stripComments(readFileSync(f, 'utf8'))));
const HOVER_OK = /:hover|wireControlHover|controlStyle|classList\.add|className|class=/;
const noHover = [];
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'));
  for (const m of text.matchAll(POINTER_RE)) {
    const line = text.slice(0, m.index).split('\n').length;
    // The nearest `X.style` / `Object.assign(X.style` at or before the pointer
    // names the element being styled.
    const before = text.slice(Math.max(0, m.index - 600), m.index);
    const owners = [...before.matchAll(/(\w+)\.style/g)];
    let owner = owners.length ? owners[owners.length - 1][1] : null;

    // A shared style OBJECT (`const btnStyle: Partial<CSSStyleDeclaration> = {
    // … cursor: 'pointer' … }`) has no element of its own — the hover belongs
    // to whoever applies it. Resolve forward to the elements it is assigned to
    // and require each of those to be wired, rather than reporting the literal
    // as a dead control it can never be.
    // A WIDER lookback than `before`: a style object can be long, and a 600-char
    // window can start mid-declaration — `const btnStyle` truncated to `Style`,
    // which no `const \w+` pattern can match. Found by the rule still firing on
    // a site it should have resolved.
    const declWindow = text.slice(Math.max(0, m.index - 2000), m.index);
    // NOT `\{[^}]*$`: a style object's own values contain braces —
    // `` `1px solid ${CLR.menuBorder}` `` — so "no closing brace since the
    // opening one" is never true for a realistic declaration. Match the opening
    // and then check the object has not been CLOSED (`};`) before the pointer.
    const objDecl = [...declWindow.matchAll(/const\s+(\w+)\s*(?::[^=]+)?=\s*\{/g)]
      .filter(d => !declWindow.slice(d.index).includes('};'));
    // If the pointer sits inside an object literal that has not been closed, it
    // belongs to THAT object — no distance comparison needed, and the two
    // earlier attempts at one (nearest-wins across two differently sized
    // windows, with the indices normalised between them) were both wrong in a
    // way that silently kept reporting a site the checker had correctly
    // resolved. Containment is the actual relationship; proximity was a proxy.
    if (objDecl.length) {
      const styleObj = objDecl[objDecl.length - 1][1];
      const consumers = [...text.matchAll(new RegExp(`Object\\.assign\\(\\s*(\\w+)\\.style,\\s*${styleObj}\\b`, 'g'))]
        .map(c => c[1]);
      // A consumer counts as wired by EITHER idiom: wmap's `wireControlHover`
      // helper, or a plain mouseenter listener, which is how tsmap's modal
      // header buttons do it. Accepting only the helper reported a correctly
      // wired button as dead.
      const consumerWired = (c) =>
        new RegExp(`wireControlHover\\(\\s*${c}\\b`).test(text) ||
        new RegExp(`${c}\\.addEventListener\\(\\s*['"]mouse(enter|over)`).test(text);
      if (consumers.length && consumers.every(consumerWired)) continue;
      owner = null;
    }
    // A global `button…:hover` rule in the scanned CSS covers every button in
    // the app, and no per-element wiring will ever show up for them. Read from
    // the stylesheet rather than assumed, so this exempts buttons only in a
    // repo that actually has such a rule (tsmap does, wmap does not).
    if (GLOBAL_BUTTON_HOVER && owner &&
        new RegExp(`${owner}\\s*=\\s*\\w+\\.createElement\\(\\s*['"]button['"]|${owner}\\.type\\s*=\\s*['"]button['"]`).test(text)) continue;

    // Native form controls draw their own hover/active states — a checkbox or
    // radio is never the "looks dead" defect this rule is about, and wiring a
    // background swap onto one would fight the platform rather than help.
    if (owner && new RegExp(`${owner}\\.type\\s*=\\s*['"](checkbox|radio)['"]`).test(text)) continue;

    if (owner) {
      // Scoped to ±SCOPE_LINES, NOT the whole file. Variable names repeat
      // across functions: `summaryPanel.ts` builds a `toggle` at line 188 with
      // no hover at all, and an unrelated `toggle` 350 lines later that is
      // correctly wired. A file-wide search let the second vouch for the first
      // and silently dropped a real defect — a false negative, the expensive
      // direction for a checker to fail in.
      const allLines = text.split('\n');
      const scope = allLines
        .slice(Math.max(0, line - 1 - SCOPE_LINES), line + SCOPE_LINES)
        .join('\n');
      const wired = new RegExp(
        `${owner}\\.addEventListener\\(\\s*['\"]mouse(enter|over)|` +
        `${owner}\\.onmouse(enter|over)|` +
        `wireControlHover\\(\\s*${owner}\\b`);
      if (wired.test(scope)) continue;
    }
    // Fall back to a small window for the styles that carry hover in CSS text
    // or a shared class rather than in a listener.
    const near = text.split('\n').slice(Math.max(0, line - 9), line + 9).join('\n');
    if (HOVER_OK.test(near)) continue;
    noHover.push(`${f}:${line}`);
  }
}

// Zero, and it should stay zero — every site this found has been wired. It was
// briefly a ratchet at 18 while the fixes were pending; that number is gone
// rather than left as headroom, because a budget above zero on a rule with no
// known exceptions is just permission to add one.
const HOVER_BUDGET = 0;

if (unexplained.length) {
  console.error(`\nstyle scales: ${unexplained.length} unexplained \`outline: none\``);
  console.error('(UI_STANDARDS.md — suppressing the focus ring needs a replacement AND a stated reason):\n');
  for (const u of unexplained) console.error(`  ${u}`);
  console.error('');
  process.exit(1);
}

if (radiusLits.size > RADIUS_BUDGET) {
  console.error(`\nstyle scales: ${radiusLits.size} distinct border-radius literals (budget ${RADIUS_BUDGET}).`);
  console.error('(UI_STANDARDS.md — radius has three ROLES: RADIUS.control / .container / .pill.');
  console.error(' A literal at a style site invents a fourth. If the value IS a role, use the token.)\n');
  for (const [v, where] of radiusLits) console.error(`  ${v.padEnd(8)} ${where}`);
  console.error('');
  process.exit(1);
}

if (noHover.length > HOVER_BUDGET) {
  console.error(`\nstyle scales: ${noHover.length} \`cursor: pointer\` with no hover affordance nearby (budget ${HOVER_BUDGET})`);
  console.error('(UI_STANDARDS.md — a pointer cursor promises interactivity; an element that');
  console.error(' does not visibly react to hover reads as dead):\n');
  for (const n of noHover) console.error(`  ${n}`);
  console.error('');
  process.exit(1);
}

if (offScale.size > OFF_SCALE_BUDGET) {
  console.error(`\nstyle scales: ${offScale.size} distinct off-scale spacing literals (budget ${OFF_SCALE_BUDGET}).`);
  console.error('(UI_STANDARDS.md "Spacing" — 2·4·6·8·10·12·16·24. An off-scale value that');
  console.error(' aligns to something is allowed, but name it once and say why; a literal');
  console.error(' repeated at call sites is the defect this budget exists to stop.)\n');
  for (const [px, where] of [...offScale].sort((a, b) => a[0] - b[0])) {
    console.error(`  ${String(px + 'px').padEnd(8)} ${where}`);
  }
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
console.log(`style scales OK — no property over its distinct-value budget, no font-size below ${FONT_FLOOR_PX}px, ${offScale.size}/${OFF_SCALE_BUDGET} off-scale spacing literals, no unexplained outline:none, ${radiusLits.size}/${RADIUS_BUDGET} radius literals, ${noHover.length}/${HOVER_BUDGET} pointers without hover`);
