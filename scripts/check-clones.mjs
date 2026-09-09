#!/usr/bin/env node
// Structural clone detection — the check that finds code copied and RENAMED.
//
// Why not a name-based one. The obvious check is to inventory what each module
// declares (handle methods, option callbacks) and flag names implemented in
// several places. That does work, and it is how `setTest` (4 panels) and
// `setAxisPrefs` (3) were found. But run it against `binCluster.ts` and
// `testPassRate.ts` as they were before extraction — the same chart written
// twice, ~200 lines of shared structure — and it reports one row:
// `onSaveImage`. Every other identifier differed: `bin` vs `row`,
// `MAX_VISIBLE_BINS` vs `MAX_VISIBLE_TESTS`, `BinClusterPanelOptions` vs
// `TestPassRatePanelOptions`. A name-based check cannot see a clone whose
// author renamed things, which is what a copy-paste-and-adapt always is.
//
// So this compares SHAPE. Identifiers and literals are normalised away, leaving
// keywords, punctuation and structure; equal-length windows of that stream are
// hashed and matched across files. Two functions doing the same thing with
// different names hash identically; two unrelated functions do not.
//
// This is deliberately a blunt instrument. It reports candidates for a human to
// judge, not defects: some repetition is honest (a switch over a wide enum, a
// long options literal), and the budget below is what keeps that from being
// noise. Raising the budget to admit a genuine new clone is the thing this
// check exists to make someone argue for out loud.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Tokens in a window. Long enough to skip boilerplate, short enough to catch a
 *  duplicated function rather than only a duplicated file. */
const WINDOW = 60;
/** Report a run only once it exceeds this many tokens — roughly 25-40 lines. */
const MIN_RUN = 150;
/** Distinct cross-file clone runs allowed. A ratchet: lower it, never raise it
 *  to admit a new one. */
const BUDGET = 0;

const SKIP = /(\.test\.ts|userGuideHtml\.ts|icons\.ts|version\.ts|guideExtension\.ts)$/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out); }
    else if (e.endsWith('.ts') && !SKIP.test(e)) out.push(p);
  }
  return out;
}

/**
 * Normalise source into a stream of shape tokens, each carrying its line.
 *
 * Comments and string bodies are dropped (a clone with reworded comments is
 * still a clone), identifiers collapse to `I`, and numbers to `0` — so
 * `bins.length` and `rows.length` become the same token sequence. Keywords stay
 * as themselves: `if`/`for`/`return` are structure, not naming.
 */
const KEYWORDS = new Set(['if','else','for','while','return','const','let','function','of','in',
  'new','class','interface','type','export','import','from','await','async','switch','case','break',
  'continue','typeof','instanceof','null','undefined','true','false','this','void']);

function tokenize(src) {
  const tokens = [];
  let i = 0, line = 1;
  const push = (t) => tokens.push({ t, line });
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) if (src[i] === '\n') line++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n') line++;
        i++;
      }
      i++; push('S'); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      push(KEYWORDS.has(word) ? word : 'I');
      i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < src.length && /[0-9.eE_]/.test(src[i])) i++;
      push('0'); continue;
    }
    push(c); i++;
  }
  return tokens;
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['packages'];
const files = roots.flatMap(r => (statSync(r).isDirectory() ? walk(r) : [r]));
const root = process.cwd();

// hash of a WINDOW-token slice -> where it occurs
const seen = new Map();
const streams = new Map();
for (const f of files) {
  const toks = tokenize(readFileSync(f, 'utf8'));
  streams.set(f, toks);
  for (let i = 0; i + WINDOW <= toks.length; i++) {
    let h = 0;
    for (let k = i; k < i + WINDOW; k++) {
      // djb2 over the token text — collisions are possible and harmless: a run
      // is only reported after the tokens themselves are compared below.
      const s = toks[k].t;
      for (let c = 0; c < s.length; c++) h = ((h << 5) + h + s.charCodeAt(c)) | 0;
    }
    if (!seen.has(h)) seen.set(h, []);
    seen.get(h).push({ f, i });
  }
}

/** Grow a matching pair as far as it runs, then record it once. */
const runs = [];
const claimed = new Set();
for (const spots of seen.values()) {
  if (spots.length < 2) continue;
  for (let a = 0; a < spots.length; a++) {
    for (let b = a + 1; b < spots.length; b++) {
      const A = spots[a], B = spots[b];
      if (A.f === B.f) continue;             // in-file repetition is a different question
      const key = `${A.f}:${A.i}|${B.f}:${B.i}`;
      if (claimed.has(key)) continue;
      const ta = streams.get(A.f), tb = streams.get(B.f);
      let n = 0;
      while (A.i + n < ta.length && B.i + n < tb.length && ta[A.i + n].t === tb[B.i + n].t) n++;
      if (n < MIN_RUN) continue;
      for (let k = 0; k < n; k++) claimed.add(`${A.f}:${A.i + k}|${B.f}:${B.i + k}`);
      runs.push({ a: A, b: B, n, aLine: ta[A.i].line, bLine: tb[B.i].line });
    }
  }
}

runs.sort((x, y) => y.n - x.n);
if (runs.length > BUDGET) {
  console.error(`\nclones: ${runs.length} cross-file duplicated block(s) over ${MIN_RUN} tokens (budget ${BUDGET}).`);
  console.error('(CLAUDE.md — "No unnecessary duplication — library-wide." Same shape, different');
  console.error(' names, is still a copy: extract the shared part or say here why it stays.)\n');
  for (const r of runs.slice(0, 12)) {
    console.error(`  ~${r.n} tokens`);
    console.error(`      ${relative(root, r.a.f)}:${r.aLine}`);
    console.error(`      ${relative(root, r.b.f)}:${r.bLine}`);
  }
  console.error('');
  process.exit(1);
}
console.log(`clones OK — no cross-file block over ${MIN_RUN} tokens repeated (checked ${files.length} files)`);
