#!/usr/bin/env node
// Enforces that the architecture descriptions in README.md and CLAUDE.md still
// describe the code that exists. This exists because of a real failure: the
// README tree listed 8 files under src/ when there were 24, and named neither
// parse_parquet.rs nor test_identity.rs, months after both shipped; CLAUDE.md's
// own tables were missing ten files from the same three releases. Nothing
// catches that — a stale prose block type-checks and tests green forever — so
// a reader's first impression of the codebase, and the file Claude reads every
// session, were both two releases out of date.
//
// Both documents are checked because both describe the same thing. Two copies
// of a description is already a smell; two copies where only one is enforced
// is how the unenforced one rots.
//
// Checks, in both directions:
//   • every source file on disk is named somewhere in the tree
//   • every filename in the tree still exists on disk
//
// The tree may name files individually (`parse_csv.rs`), in brace groups
// (`parse_{stdf,atdf}_filtered.rs`), or by wildcard (`generate_*.py`) — all
// three are expanded before comparing, so the tree can stay readable rather
// than becoming a generated file listing.
//
// Run:  node scripts/check-architecture-docs.mjs
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Directories the tree is expected to account for, and what counts as a source
// file in each. Tests, generated output, and assets are deliberately excluded:
// the tree describes the shape of the app, not every file in the repo.
const TRACKED = [
  { dir: 'src', ext: ['.ts'], skip: (f) => f.endsWith('.test.ts') },
  { dir: 'packages/parsers/src', ext: ['.rs'], skip: (f) => f === 'lib.rs' },
  // main.rs is the three-line Tauri entry point and carries no architecture.
  { dir: 'src-tauri/src', ext: ['.rs'], skip: (f) => f === 'main.rs' },
  { dir: 'src-tauri/src/commands', ext: ['.rs'], skip: (f) => f === 'mod.rs' },
];

// ── Pull the architecture description out of each document ─────────────────
//
// README.md keeps a single ```text tree under "## Architecture"; CLAUDE.md
// spreads the same ground across several Markdown tables, so the whole file is
// scanned rather than one block of it.

const readArchitecture = (file) => {
  // CLAUDE.md is gitignored and local-only (snapshotted in ~/projects/wafertools/config),
  // so a clean CI checkout does not have it. Absent means "not checkable here",
  // never a failure — otherwise this guard would fail every CI run.
  const path = resolve(root, file);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  if (file !== 'README.md') return text;

  const section = /^## Architecture\s*$/m.exec(text);
  if (!section) {
    console.error(`architecture check failed: no "## Architecture" heading in ${file}`);
    process.exit(1);
  }
  const fence = /```text\n([\s\S]*?)```/.exec(text.slice(section.index));
  if (!fence) {
    console.error(`architecture check failed: no \`\`\`text block under "## Architecture" in ${file}`);
    process.exit(1);
  }
  return fence[1];
};

// `reverse` = also check that everything the document names still exists.
// Only the README's ```text block is a literal file tree; CLAUDE.md is prose
// that legitimately names files which are deliberately absent — wmap's
// insightsTab.ts, or src/charts/perf.bench.ts in the passage explaining that
// the charts were deleted. Naming a file in order to say it isn't here is not
// drift, so CLAUDE.md gets the forward check only.
const DOCS = [
  { file: 'README.md', reverse: true },
  { file: 'CLAUDE.md', reverse: false },
];

// ── Expand every filename form the tree is allowed to use ──────────────────

// `parse_{stdf,atdf,csv}.rs` → parse_stdf.rs, parse_atdf.rs, parse_csv.rs
const expandBraces = (token) => {
  const m = /^(.*)\{([^}]+)\}(.*)$/.exec(token);
  if (!m) return [token];
  return m[2].split(',').flatMap((part) => expandBraces(`${m[1]}${part.trim()}${m[3]}`));
};

// A token is anything that looks like a filename with one of the tracked
// extensions, brace groups included.
const TOKEN = /[A-Za-z0-9_{},.*-]+\.(?:ts|rs|py|mjs|js)\b/g;

const indexDoc = (text) => {
  const named = new Set();
  const wildcards = [];
  for (const raw of text.match(TOKEN) ?? []) {
    for (const token of expandBraces(raw)) {
      // CLAUDE.md names files with a path prefix (`src/parse_csv.rs`); compare
      // on the basename, as the README tree does.
      const base = token.split('/').pop();
      if (base.includes('*')) {
        wildcards.push(new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
      } else {
        named.add(base);
      }
    }
  }
  return { named, has: (f) => named.has(f) || wildcards.some((re) => re.test(f)) };
};

const docs = [];
const skipped = [];
for (const { file, reverse } of DOCS) {
  const text = readArchitecture(file);
  if (text === null) {
    skipped.push(file);
    continue;
  }
  docs.push({ file, reverse, ...indexDoc(text) });
}

// README.md is tracked, so its absence is a real failure rather than a checkout
// that simply doesn't carry the file.
if (!docs.some((d) => d.file === 'README.md')) {
  console.error('architecture check failed: README.md not found');
  process.exit(1);
}

// ── Compare, both directions ───────────────────────────────────────────────

const problems = [];
const onDisk = new Set();

for (const { dir, ext, skip } of TRACKED) {
  const abs = resolve(root, dir);
  if (!existsSync(abs)) {
    problems.push(`tracked directory ${dir}/ does not exist — update TRACKED in this script`);
    continue;
  }
  for (const file of readdirSync(abs)) {
    if (!ext.some((e) => file.endsWith(e))) continue;
    if (skip?.(file)) continue;
    onDisk.add(file);
    for (const doc of docs) {
      if (!doc.has(file)) {
        problems.push(`${dir}/${file} exists but is not described in ${doc.file}`);
      }
    }
  }
}

for (const doc of docs.filter((d) => d.reverse)) {
  for (const file of doc.named) {
  // Only judge files in the directories this script tracks; the tree also names
  // things like vite.config.ts in passing, which is fine.
  if (!onDisk.has(file)) {
    const looksTracked = TRACKED.some(({ dir, ext }) =>
      ext.some((e) => file.endsWith(e)) && existsSync(resolve(root, dir))
    );
    if (!looksTracked) continue;
    const anywhere = TRACKED.some(({ dir }) => existsSync(resolve(root, dir, file)));
    if (!anywhere) {
      problems.push(`${doc.file} describes ${file}, which no longer exists`);
    }
  }
}
}

if (problems.length) {
  console.error(`architecture check failed (${problems.length}):\n`);
  for (const p of [...new Set(problems)].sort()) console.error('  • ' + p);
  console.error('\nUpdate the ```text block under "## Architecture" in README.md, and the');
  console.error('architecture tables in CLAUDE.md. A file may be named individually, in a');
  console.error('brace group (parse_{stdf,atdf}.rs), or by wildcard (generate_*.py) —');
  console.error('whichever keeps the description readable.\n');
  process.exit(1);
}

const note = skipped.length ? ` (${skipped.join(', ')} not present — skipped)` : '';
console.log(
  `architecture OK — ${onDisk.size} source files accounted for in ` +
    docs.map((d) => d.file).join(' and ') +
    note
);
