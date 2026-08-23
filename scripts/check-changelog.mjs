#!/usr/bin/env node
// Enforces that CHANGELOG.md is internally consistent and agrees with
// package.json. CLAUDE.md has described this file as drifting "silently unless
// done by hand every time — this has happened before (five releases' worth,
// 0.1.13–0.1.17, went unrecorded until caught)", and noted that it was not
// auto-checked. This is that check. It runs from `prebuild`, alongside
// check-version-sync.js, so a version bump cannot reach a build without its
// changelog entry.
//
// Sibling of wafermap/scripts/check-changelog.mjs, which additionally enforces
// that repo's published breaking-change policy. The two are deliberately
// separate files rather than a shared package: neither repo depends on the
// other, and a release guard that can be broken by a sibling repo's release is
// worse than a little duplication.
//
// Checks:
//   1. the newest heading matches package.json's version
//   2. every heading is `## [x.y.z] — YYYY-MM-DD`
//   3. versions are strictly descending, with no duplicates
//   4. no version is skipped — a gap means an entry was lost or never written
//   5. dates do not go backwards as versions ascend
//   6. every entry has at least one `###` section of content
//
// Run:  node scripts/check-changelog.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const pkgVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

// Every entry in this file postdates the convention, so all of it is enforced.
const STRICT_FROM = '0.0.0';

const problems = [];
const fail = (msg) => problems.push(msg);

// ── Parse every version heading, and the body that follows it ───────────────

const lines = text.split('\n');
const entries = [];

lines.forEach((line, i) => {
  const m = /^## \[(\d+\.\d+\.\d+)\](?: — (.+))?\s*$/.exec(line);
  if (m) entries.push({ version: m[1], date: m[2] ?? null, line: i + 1, bodyStart: i + 1 });
});

if (!entries.length) {
  console.error('changelog check failed: no `## [x.y.z]` version headings found at all');
  process.exit(1);
}

for (let i = 0; i < entries.length; i++) {
  entries[i].body = lines
    .slice(entries[i].bodyStart, entries[i + 1]?.line ? entries[i + 1].line - 1 : lines.length)
    .join('\n');
}

const parse = (v) => v.split('.').map(Number);
const cmp = (a, b) => {
  const [A, B] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i];
  return 0;
};

const strict = (v) => cmp(v, STRICT_FROM) >= 0;

// ── 1. Newest heading matches package.json ─────────────────────────────────

if (entries[0].version !== pkgVersion) {
  fail(
    `package.json is at ${pkgVersion} but the newest CHANGELOG heading is ` +
      `[${entries[0].version}] (line ${entries[0].line}) — add the entry for ${pkgVersion} ` +
      `above it, do not edit the existing heading`
  );
}

// ── 2. Heading shape ───────────────────────────────────────────────────────

for (const e of entries) {
  if (!strict(e.version)) continue;
  if (!e.date) {
    fail(`[${e.version}] (line ${e.line}) has no date — expected \`## [${e.version}] — YYYY-MM-DD\``);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
    fail(`[${e.version}] (line ${e.line}) has date '${e.date}' — expected YYYY-MM-DD`);
  }
}

// ── 3 & 4. Strictly descending, and no skipped versions ────────────────────

for (let i = 0; i < entries.length - 1; i++) {
  const [cur, next] = [entries[i], entries[i + 1]];
  if (!strict(next.version)) break;
  const d = cmp(cur.version, next.version);
  if (d === 0) {
    fail(`[${cur.version}] appears twice (lines ${next.line} and ${cur.line})`);
    continue;
  }
  if (d < 0) {
    fail(
      `versions are out of order: [${cur.version}] (line ${cur.line}) is older than ` +
        `[${next.version}] (line ${next.line}) below it`
    );
    continue;
  }

  // A skipped version is the signature of a lost entry. Only meaningful within
  // a minor series — a minor bump legitimately resets the patch number.
  const [curMaj, curMin, curPatch] = parse(cur.version);
  const [nextMaj, nextMin, nextPatch] = parse(next.version);
  if (curMaj === nextMaj && curMin === nextMin && curPatch !== nextPatch + 1) {
    const missing = [];
    for (let p = nextPatch + 1; p < curPatch; p++) missing.push(`${curMaj}.${curMin}.${p}`);
    fail(
      `no entry for ${missing.join(', ')} — [${cur.version}] (line ${cur.line}) follows ` +
        `[${next.version}] directly. If a version was never published, say so in a stub entry`
    );
  }
  if (curMaj === nextMaj && curMin > nextMin + 1) {
    const missing = [];
    for (let m = nextMin + 1; m < curMin; m++) missing.push(`${curMaj}.${m}.0`);
    fail(
      `no entry for ${missing.join(', ')} — [${cur.version}] (line ${cur.line}) follows ` +
        `[${next.version}] directly`
    );
  }
}

// ── 5. Dates move forward with versions ────────────────────────────────────

for (let i = 0; i < entries.length - 1; i++) {
  const [cur, next] = [entries[i], entries[i + 1]];
  if (!strict(next.version)) break;
  if (!cur.date || !next.date) continue;
  if (cur.date < next.date) {
    fail(
      `[${cur.version}] is dated ${cur.date}, earlier than [${next.version}] (${next.date}) ` +
        `below it (line ${cur.line})`
    );
  }
}

// ── 6. No empty entries ────────────────────────────────────────────────────

for (const e of entries) {
  if (!strict(e.version)) continue;
  if (!/^### /m.test(e.body)) {
    fail(`[${e.version}] (line ${e.line}) has no \`###\` section — an entry with no content`);
  }
}

if (problems.length) {
  console.error(`changelog check failed (${problems.length}):\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error('\nCHANGELOG.md must be updated in the same pass as the version bump — see');
  console.error("CLAUDE.md's \"Versioning the app\". Add a new heading above the previous one;");
  console.error('never edit an existing heading in place.\n');
  process.exit(1);
}

console.log(
  `changelog OK — ${entries.length} entries, newest [${entries[0].version}] matches package.json`
);
