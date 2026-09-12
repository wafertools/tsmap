#!/usr/bin/env node
// Asserts the built service worker actually precaches what the offline app
// needs — run against dist/ AFTER a web build.
//
// This exists because every way this can break is silent. Workbox skips any
// file over `maximumFileSizeToCacheInBytes` (default 2 MiB, against a 2.2 MB
// parser) without failing the build; a `globPatterns` list that loses its
// `wasm` entry does the same. In both cases the build succeeds, the app
// installs, and the failure surfaces only offline, in a browser, at the moment
// someone opens a file — an app-shaped shell with its one job missing.
//
// It also guards the other direction: the guide's 6.1 MB of screenshots are
// deliberately NOT precached (they are runtime-cached on first open), and a
// `globIgnores` that stops matching would quietly triple what every first-time
// visitor downloads.
//
// Not part of `npm run verify` — there is nothing to check until something is
// built. Run: npm run check:pwa   (after npm run build:web)
import { readFileSync, existsSync } from 'node:fs';

const SW = 'dist/sw.js';
if (!existsSync(SW)) {
  console.error(`pwa check failed: ${SW} not found — run \`npm run build:web\` first.`);
  console.error('(If this is a Tauri build, that is correct: the plugin is disabled there and emits no worker.)');
  process.exit(1);
}

const sw = readFileSync(SW, 'utf8');

// The precache manifest is injected as an array of `{url:"…",revision:…}`
// object literals — not JSON (unquoted keys), so it is read with a regex
// rather than parsed.
const urls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map(m => m[1]);
if (urls.length === 0) {
  console.error('pwa check failed: no precache entries found in dist/sw.js at all.');
  process.exit(1);
}

const problems = [];

const wasm = urls.filter(u => u.endsWith('.wasm'));
if (wasm.length === 0) {
  problems.push(
    'the parser WASM is NOT precached — an offline tsmap would open and then fail to parse anything.\n'
    + '    Most likely cause: workbox.maximumFileSizeToCacheInBytes is below the wasm size,\n'
    + '    or "wasm" was dropped from workbox.globPatterns (both in vite.config.ts).');
}

const guideImages = urls.filter(u => /guide\/images\//.test(u));
if (guideImages.length > 0) {
  problems.push(
    `${guideImages.length} guide screenshot(s) are precached — they are meant to be runtime-cached on first\n`
    + '    open, not pushed to every first-time visitor. Check workbox.globIgnores in vite.config.ts.');
}

for (const required of ['index.html', 'manifest.webmanifest']) {
  if (!urls.includes(required)) problems.push(`${required} is not precached.`);
}

if (!/manifest\.webmanifest/.test(readFileSync('dist/index.html', 'utf8'))) {
  problems.push('dist/index.html carries no <link rel="manifest"> — the app is not installable.');
}

if (problems.length > 0) {
  console.error('pwa check failed:');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(`pwa OK — ${urls.length} precache entries, parser wasm included, `
  + 'guide screenshots left to runtime cache');
