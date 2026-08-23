#!/usr/bin/env node
// `npm run help` — the commands you actually type, grouped by task.
//
// This repo has ~40 npm scripts and `npm run` lists them flat, with no
// indication that most are invoked by npm's own lifecycle, by Tauri, by CI, or
// by another script rather than by you. (`build` and `dev`, for instance, are
// Tauri's beforeBuildCommand/beforeDevCommand — you type `npm run tauri dev`.)
// That list is why "which do I run?" became a real question. This is the short
// answer.
//
// `--check` (wired into `npm run check:docs`) enforces two things:
//   1. every command named below still exists as a script
//   2. every script in package.json is classified — listed below, marked
//      INTERNAL, or an npm lifecycle hook
//
// So the list cannot silently rot, and a newly added script forces a one-line
// decision about whether it is something you type. That decision is the whole
// point: the pile grew because nothing ever asked.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts;

const GROUPS = [
  {
    title: 'Every day',
    items: [
      ['npm run tauri dev', 'The real desktop app'],
      ['npm run dev:web', 'The browser build on :5301'],
      ['npm run verify', 'Everything CI runs — types, lint, docs, JS + Rust tests'],
    ],
  },
  {
    title: 'Releasing',
    items: [
      ['npm version patch', 'The whole bump: verify, changelog check, sync Rust, commit, tag'],
      ['npm run tag:parser', 'Tag the parser crate, once its npm publish has succeeded'],
    ],
  },
  {
    title: 'Working on wmap at the same time',
    items: [
      ['npm run wmap:link', 'Point at ../wafermap instead of the published package'],
      ['npm run wmap:unlink', 'Back to the published package — required before a release'],
    ],
  },
  {
    title: 'Working on the Rust parsers',
    items: [
      ['npm run parser:link', 'Build the wasm bundle and link it (web build only)'],
      ['npm run parser:build', 'Rebuild it in place after editing packages/parsers/src'],
      ['npm run parser:unlink', 'Back to the published package — required before a release'],
    ],
  },
  {
    title: 'Docs and assets',
    items: [
      ['npm run preview:site', 'The docs site on :8002 — links and demos clickable'],
      ['npm run screenshots:only', 'Recapture one screenshot after a dialog changes'],
    ],
  },
  {
    title: 'Occasional',
    items: [
      ['npm run release', 'Build and install to ~/.local/bin'],
      ['npm run test:watch', 'Vitest in watch mode'],
      ['npm run demo:test', 'Replay the scripted investigation scenario'],
      ['npm run check:drift', 'Compare agent/tooling config against the config repo'],
    ],
  },
];

// Scripts that exist for npm, Tauri, CI, or another script to call — not for
// you. Adding a name here is a deliberate "no, you don't type this".
const INTERNAL = [
  'build', 'build:guide', 'build:site', 'build:site:dev', 'build:web',
  'check', 'check:docs', 'check:rust', 'demo:build', 'demo:data', 'dev',
  'install-bin', 'lint', 'preview', 'screenshots', 'screenshots:data',
  'test', 'test:rust',
];

// npm runs these itself, around other commands.
const isLifecycle = (name) => /^(pre|post)/.test(name) || name === 'version';

if (!process.argv.includes('--check')) {
  const width = Math.max(...GROUPS.flatMap((g) => g.items.map(([c]) => c.length)));
  console.log('\n  tsmap — the commands you type\n');
  for (const { title, items } of GROUPS) {
    console.log(`  ${title}`);
    for (const [cmd, desc] of items) console.log(`    ${cmd.padEnd(width)}  ${desc}`);
    console.log('');
  }
  console.log('  Everything else in `npm run` is machinery: npm lifecycle hooks, Tauri\'s own');
  console.log('  beforeDev/beforeBuild commands, steps CI calls, or sub-steps of the above.\n');
  process.exit(0);
}

// ── --check ────────────────────────────────────────────────────────────────

const problems = [];
const listed = new Set();

for (const { title, items } of GROUPS) {
  for (const [cmd] of items) {
    const name = /^npm run ([\w:.-]+)/.exec(cmd)?.[1];
    if (!name) continue; // a bare npm command such as `npm version patch`
    listed.add(name);
    if (!scripts[name]) {
      problems.push(`help lists "${cmd}" under ${title}, but there is no "${name}" script`);
    }
  }
}

for (const name of INTERNAL) {
  if (!scripts[name]) problems.push(`INTERNAL names "${name}", which is no longer a script`);
}

for (const name of Object.keys(scripts)) {
  if (listed.has(name) || INTERNAL.includes(name) || isLifecycle(name) || name === 'help') continue;
  problems.push(
    `"${name}" is not classified — add it to a group in scripts/help.mjs if you type it, ` +
      'or to INTERNAL if npm, Tauri, CI, or another script calls it'
  );
}

if (problems.length) {
  console.error(`help check failed (${problems.length}):\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error('');
  process.exit(1);
}

console.log(`help OK — ${listed.size} commands listed, ${Object.keys(scripts).length} scripts classified`);
