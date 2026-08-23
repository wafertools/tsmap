#!/usr/bin/env node
// Propagates package.json's version into the Rust side of the app, so the two
// hand-edited version files CLAUDE.md describes become one edited file and one
// derived file.
//
// Runs from the `version` npm lifecycle hook — i.e. during `npm version patch`,
// after npm has bumped package.json and before it makes the release commit —
// then stages what it changed so the bump lands as a single commit.
//
// Writes:
//   src-tauri/Cargo.toml  — the [package] version
//   Cargo.lock (root)     — refreshed via `cargo metadata`, which rewrites the
//                           workspace member's locked version in well under a
//                           second without compiling anything. `cargo check`
//                           also does it, but pays a full rebuild of the Tauri
//                           crate for a three-character change.
//
// src-tauri/tauri.conf.json is deliberately untouched: it reads
// "../package.json" and must keep doing so (check-version-sync.js enforces it).
//
// Run standalone with:  node scripts/sync-rust-version.mjs
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const version = JSON.parse(read('package.json')).version;
if (!version) {
  console.error('sync-rust-version failed: package.json has no version');
  process.exit(1);
}

// ── src-tauri/Cargo.toml — the first `version = "…"`, which is [package]'s ──

const cargoPath = 'src-tauri/Cargo.toml';
const cargo = read(cargoPath);
const current = /^\s*version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];

if (current === undefined) {
  console.error(`sync-rust-version failed: no version field found in ${cargoPath}`);
  process.exit(1);
}

if (current !== version) {
  writeFileSync(
    resolve(root, cargoPath),
    cargo.replace(/^(\s*version\s*=\s*)"[^"]+"/m, `$1"${version}"`),
    'utf8'
  );
  console.log(`sync-rust-version: ${cargoPath} ${current} → ${version}`);
}

// ── Cargo.lock — let cargo rewrite it rather than editing it by hand ────────

execFileSync('cargo', ['metadata', '--manifest-path', cargoPath, '--format-version', '1', '--offline'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const locked = /name = "tsmap"\r?\nversion = "([^"]+)"/.exec(read('Cargo.lock'))?.[1];
if (locked !== version) {
  console.error(
    `sync-rust-version failed: Cargo.lock still says ${locked ?? '(missing)'} after refresh — ` +
      'run `cargo check` manually and investigate.'
  );
  process.exit(1);
}

// ── Stage, so `npm version`'s commit carries the whole bump ─────────────────
//
// npm stages package.json/package-lock.json itself; anything else a version
// script touches has to be added here or it is left uncommitted.

execFileSync('git', ['add', cargoPath, 'Cargo.lock'], { cwd: root, stdio: 'inherit' });

console.log(`sync-rust-version: Rust side at ${version}, staged`);
