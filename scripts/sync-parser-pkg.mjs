#!/usr/bin/env node
// Copies the hand-written files that belong in the published
// `@wafertools/testdata-parser` package into `packages/parsers/pkg/`, and
// registers them in that package's `files` list.
//
// Why this exists: `pkg/` is wasm-pack output. It is regenerated on every build
// and gitignored in full (`packages/parsers/pkg/.gitignore` is a bare `*`), so
// anything dropped in there by hand is erased by the next build. Its
// package.json is generated too, with an explicit `files` array listing only the
// three wasm-bindgen artefacts — and npm publishes exactly that list plus the
// README, so a file that is not in it does not ship even if it is sitting in the
// directory.
//
// llms.txt is written for an AI coding agent working against this package: the
// wasm-bindgen .d.ts types every return value as `any`, so an agent gets no
// shape information from the types at all and will otherwise guess field names.
// It is only useful if it reaches the installed package, next to the README.
//
// `EXTRAS`, `src` and `pkg` are exported because `publish-parser.mjs` asserts
// this sync actually happened before it publishes. One list, so the guard can
// never check for a different set of files than the one that gets copied.
//
// Run:  npm run parser:sync   (wired into parser:build and parser:build:release)
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const src = resolve(root, 'packages/parsers');
export const pkg = resolve(src, 'pkg');

// Extra files to publish alongside the wasm-bindgen output, source -> published name.
export const EXTRAS = [['llms.txt', 'llms.txt']];

// Importing this module must not sync anything — publish-parser.mjs imports it
// only for the list above.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) sync();

function sync() {
if (!existsSync(pkg)) {
  console.error('sync-parser-pkg: packages/parsers/pkg not found — run `npm run parser:build` first.');
  process.exit(1);
}

const manifestPath = resolve(pkg, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.files ??= [];

const copied = [];
for (const [from, to] of EXTRAS) {
  const fromPath = resolve(src, from);
  if (!existsSync(fromPath)) {
    console.error(`sync-parser-pkg: packages/parsers/${from} is missing — it is meant to ship with the package.`);
    process.exit(1);
  }
  copyFileSync(fromPath, resolve(pkg, to));
  if (!manifest.files.includes(to)) manifest.files.push(to);
  copied.push(to);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`sync-parser-pkg: ${copied.join(', ')} → pkg/, listed in files[]`);
}
