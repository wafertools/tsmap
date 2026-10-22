#!/usr/bin/env node
/**
 * Training course coverage: does every control a user can reach appear in some
 * deck of the course (docs/training/NN-slug.md), or is it deliberately left out?
 *
 * Controls come from the recorded interactive surfaces: docs/ui-surface.txt
 * (tsmap) and ../wafermap/docs/ui-surface.txt (the wafer-map engine tsmap
 * embeds; skipped with a warning when that checkout is absent). A control's
 * id is its accessible name, prefixed by its menu or dialog when it lives in
 * one: "Open files", "Setup ▾ › Tests…", "Splits… › Done".
 *
 * A deck declares what it covers with HTML comments, one per slide, names
 * separated by semicolons:
 *
 *     <!-- covers: Open files; Choose how to pick files to open › Scan a folder… -->
 *
 * A name matches a control's whole id, so an item in a menu or dialog is named
 * with its parent ("Setup ▾ › Tests…"; "* › Done" for every dialog's Done);
 * `*` is a wildcard. A name that matches no control is an error, so a renamed
 * control cannot leave a stale claim behind.
 *
 * docs/training/coverage-exclusions.txt says what is not taught, one line each:
 *
 *     <pattern> | <reason>                    leave the control out of coverage
 *     fold <Name> = <pattern> | <reason>      count every matching row as one control
 *
 * Folds exist because much of the surface is data, not controls: one finding
 * row, bin chip or wafer chip per item in the loaded lot. Patterns are `*`
 * globs over the id, or `re:<regex>` for the raw id. An exclusion or fold that
 * matches nothing is an error too.
 *
 * Output: coverage per session, then every uncovered control grouped by the
 * ui-surface section it first appears in — the list the next sessions take
 * their content from. Exits 1 while anything is uncovered or a pattern is stale.
 *
 * Run:  npm run training:check
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRAINING = join(root, 'docs', 'training');
const SURFACES = [
  { origin: 'tsmap', file: join(root, 'docs', 'ui-surface.txt') },
  { origin: 'wafermap', file: resolve(root, '..', 'wafermap', 'docs', 'ui-surface.txt') },
];

// ── Matching ────────────────────────────────────────────────────────────────

// Glob matching ignores case, runs of spaces and the state glyphs the surface
// records in front of a name (✓ for a toggle, ▶ for a collapsible heading).
const norm = (s) => s.replace(/[✓▶▸▼]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function compile(pattern) {
  if (pattern.startsWith('re:')) {
    const re = new RegExp(pattern.slice(3));
    return (id) => re.test(id);
  }
  const re = new RegExp('^' + norm(pattern).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return (id) => re.test(norm(id));
}

// ── Surfaces ────────────────────────────────────────────────────────────────

function parseSurface({ origin, file }) {
  const out = [];
  let section = null, block = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let m;
    if ((m = /^## (.*)$/.exec(line))) { section = m[1]; block = null; continue; }
    if (/^Controls:/.test(line)) { block = null; continue; }
    if ((m = /^(?:Menu|Dialog) — (.*?):?$/.exec(line))) { block = m[1]; continue; }
    if (!(m = /^\s+· (.*)$/.exec(line))) continue;
    let text = m[1].replace(/\s+\(×\d+\)\s*$/, '');
    let attrs = '';
    const a = /^(.*?)\s{2}\[(.*)\]$/.exec(text);
    if (a) { text = a[1]; attrs = a[2]; }
    // An icon-only control is named by its aria-label, not its glyph.
    const name = (/aria="([^"]*)"/.exec(attrs)?.[1] ?? text).trim();
    if (!name || name === '(no rows captured)') continue;
    out.push({ origin, section, id: block ? `${block} › ${name}` : name });
  }
  return out;
}

// ── Exclusions and folds ────────────────────────────────────────────────────

const problems = [];

function parseExclusions() {
  const file = join(TRAINING, 'coverage-exclusions.txt');
  const folds = [], excludes = [];
  if (!existsSync(file)) return { folds, excludes };
  readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const where = `coverage-exclusions.txt:${i + 1}`;
    const bar = line.lastIndexOf(' | ');
    const reason = bar === -1 ? '' : line.slice(bar + 3).trim();
    const body = bar === -1 ? line : line.slice(0, bar).trim();
    if (!reason) { problems.push(`${where}: no reason given — write "<pattern> | <reason>"`); return; }
    const f = /^fold\s+(.+?)\s+=\s+(.+)$/.exec(body);
    if (f) folds.push({ name: f[1], pattern: f[2], match: compile(f[2]), where, used: 0 });
    else excludes.push({ pattern: body, match: compile(body), reason, where, used: 0 });
  });
  return { folds, excludes };
}

// ── Decks ───────────────────────────────────────────────────────────────────

function parseDecks() {
  const decks = [];
  for (const f of readdirSync(TRAINING).filter((n) => /^\d\d-[\w-]+\.md$/.test(n)).sort()) {
    const src = readFileSync(join(TRAINING, f), 'utf8');
    const entries = [];
    for (const m of src.matchAll(/<!--\s*covers:([\s\S]*?)-->/g)) {
      for (const e of m[1].split(';').map((s) => s.trim()).filter(Boolean)) entries.push(e);
    }
    decks.push({ session: f.slice(0, 2), file: f, entries });
  }
  return decks;
}

// ── Main ────────────────────────────────────────────────────────────────────

const raw = [];
for (const s of SURFACES) {
  if (!existsSync(s.file)) {
    console.warn(`warning: ${s.file} not found — ${s.origin} controls are not checked (clone wafermap beside tsmap)`);
    continue;
  }
  raw.push(...parseSurface(s));
}

const { folds, excludes } = parseExclusions();
const controls = new Map(); // id → { id, origin, section }
for (const c of raw) {
  const fold = folds.find((f) => f.match(c.id));
  if (fold) fold.used++;
  const id = fold ? fold.name : c.id;
  if (!controls.has(id)) controls.set(id, { id, origin: c.origin, section: c.section });
}

for (const c of controls.values()) {
  const ex = excludes.find((e) => e.match(c.id));
  if (ex) { ex.used++; c.excluded = ex; }
}

const decks = parseDecks();
for (const deck of decks) {
  deck.covered = new Set();
  for (const entry of deck.entries) {
    const match = compile(entry);
    const hits = [...controls.values()].filter((c) => match(c.id));
    if (hits.length === 0) problems.push(`${deck.file}: "covers: ${entry}" matches no control in the ui-surface files`);
    for (const c of hits) { deck.covered.add(c.id); (c.coveredBy ??= new Set()).add(deck.session); }
  }
}

for (const p of [...folds, ...excludes]) {
  if (p.used === 0) problems.push(`${p.where}: "${p.pattern}" matches no control — remove it, or fix the pattern`);
}

const all = [...controls.values()];
const excluded = all.filter((c) => c.excluded && !c.coveredBy);
const teachable = all.filter((c) => !c.excluded || c.coveredBy);
const covered = teachable.filter((c) => c.coveredBy);
const uncovered = teachable.filter((c) => !c.coveredBy);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');

console.log(`\nTraining coverage — ${all.length} controls (${raw.length} surface rows, ${folds.length} folds), ${excluded.length} excluded\n`);
console.log('  Session  Controls  Deck');
for (const d of decks) console.log(`  ${d.session}       ${String(d.covered.size).padStart(8)}  docs/training/${d.file}`);
console.log(`\n  Covered: ${covered.length} of ${teachable.length} (${pct(covered.length, teachable.length)})   Uncovered: ${uncovered.length}\n`);

if (uncovered.length) {
  console.log('Uncovered controls, by ui-surface section:\n');
  const bySection = new Map();
  for (const c of uncovered) {
    const key = `${c.origin === 'tsmap' ? '' : `${c.origin}: `}${c.section}`;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(c.id);
  }
  for (const [section, ids] of bySection) {
    console.log(`  ## ${section} (${ids.length})`);
    for (const id of ids) console.log(`     ${id}`);
    console.log('');
  }
}

if (problems.length) {
  console.error(`Problems (${problems.length}):\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error('');
}

process.exit(problems.length || uncovered.length ? 1 : 0);
