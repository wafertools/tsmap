#!/usr/bin/env node
// Publishes `@wafertools/testdata-parser` from packages/parsers/pkg, after
// proving the directory is actually publishable.
//
// Why this exists: 0.11.0 shipped without `llms.txt`. `pkg/` is wasm-pack
// output — every build REGENERATES its package.json from scratch, wiping the
// `files` entries that sync-parser-pkg.mjs adds — and npm publishes exactly
// what `files` lists (plus the README, which npm force-includes whatever you
// say, and which is why the omission was invisible). So a bare `wasm-pack
// build` followed by `npm publish` in pkg/ ships a package missing the one
// document that exists because wasm-bindgen types every export as `any`. It
// fails silently: the publish succeeds, the version is burnt, and npm versions
// are immutable, so the only repair is another release.
//
// The guard is therefore about the SHAPE of pkg/, not about the build: it
// re-reads the manifest npm is about to honour and checks each extra is both
// on disk and in `files`, which is the exact pair of facts that went wrong.
// It imports that list from sync-parser-pkg.mjs rather than restating it —
// two copies of the list would be the same class of bug one level up.
//
// Run:  npm run parser:publish -- --otp=123456
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { EXTRAS, pkg, src } from './sync-parser-pkg.mjs';

const fail = (msg) => {
  console.error(`\npublish-parser: ${msg}\n`);
  process.exit(1);
};

if (!existsSync(pkg)) fail('packages/parsers/pkg not found — run `npm run parser:build:release` first.');

const manifestPath = resolve(pkg, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const files = manifest.files ?? [];

// The version npm will publish must be the crate's. They are separate files and
// only the build keeps them in step, so a stale pkg/ is a wrong-version publish.
const cargo = readFileSync(resolve(src, 'Cargo.toml'), 'utf8');
const crateVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo.split(/^\[/m)[1] ?? '')?.[1];
if (!crateVersion) fail('no version found under [package] in packages/parsers/Cargo.toml');
if (manifest.version !== crateVersion) {
  fail(
    `pkg/package.json is version ${manifest.version} but the crate is ${crateVersion}.\n` +
    '  pkg/ is stale — rebuild with `npm run parser:build:release`.',
  );
}

// The failure that produced this script: present in the directory, absent from
// `files`, so npm silently leaves it out of the tarball.
const missing = [];
for (const [, name] of EXTRAS) {
  if (!existsSync(resolve(pkg, name))) missing.push(`${name} (not in pkg/)`);
  else if (!files.includes(name)) missing.push(`${name} (in pkg/, but not in package.json files[])`);
}
if (missing.length) {
  fail(
    `pkg/ is not publishable — ${missing.join('; ')}.\n` +
    '  A bare `wasm-pack build` regenerates pkg/package.json and drops these.\n' +
    '  Rebuild with `npm run parser:build:release`, which runs scripts/sync-parser-pkg.mjs.',
  );
}

// Everything the tarball will contain, so the list is read before the OTP, not
// discovered afterwards on npmjs.com.
console.log(`\npublish-parser: ${manifest.name}@${crateVersion}`);
console.log(`  files: ${[...files].sort().join(', ')}  (+ README.md, added by npm)\n`);

const args = ['publish', '--access', 'public', ...process.argv.slice(2)];
execFileSync('npm', args, { cwd: pkg, stdio: 'inherit' });

console.log(
  `\n  ✓ published ${crateVersion}. Next:\n` +
  `      npm install @wafertools/testdata-parser@^${crateVersion}\n` +
  '      npm run parser:unlink\n' +
  '      npm run tag:parser   (after the pin is committed — it tags HEAD)\n',
);
