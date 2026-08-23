#!/usr/bin/env node
// Tags the current `testdata-parser` version, reading it from
// packages/parsers/Cargo.toml rather than package.json — the crate has its own
// release lifecycle, independent of the app's version.
//
// The `parser-` prefix keeps the two namespaces apart in one repo: an app tag
// is `v0.1.28`, a parser tag is `parser-v0.8.0`. Without the prefix the two
// sequences would collide the moment the parser reached 0.1.x.
//
// No GitHub Release is created for the parser, deliberately — it has no
// artefact to attach (npm is the distribution channel), and a parser Release
// would appear in the same list people browse to download the tsmap
// installers.
//
// Run:  npm run tag:parser
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readFileSync(resolve(root, 'packages/parsers/Cargo.toml'), 'utf8');

// The first `version = "…"` under [package] — later sections have their own.
const pkgSection = manifest.split(/^\[/m)[1] ?? '';
const version = /^version\s*=\s*"([^"]+)"/m.exec(pkgSection)?.[1];

if (!version) {
  console.error('tag:parser failed: no version found under [package] in packages/parsers/Cargo.toml');
  process.exit(1);
}

const tag = `parser-v${version}`;

const existing = execFileSync('git', ['tag', '--list', tag], { cwd: root, encoding: 'utf8' }).trim();
if (existing) {
  console.error(`tag:parser failed: ${tag} already exists. Bump the crate version first.`);
  process.exit(1);
}

execFileSync('git', ['tag', '-a', tag, '-m', `testdata-parser ${version}`], { cwd: root, stdio: 'inherit' });
console.log(`created ${tag}\n\nPush it with:\n  git push origin ${tag}`);
