#!/usr/bin/env node
// Verifies docs/user-guide.md's "Auto-detected column names" table against
// EXACT_ROLES in src/mappingUI.ts.
//
// detectRole() is what decides whether a file's own column header (e.g.
// `t_num`) gets pre-filled as a role in the mapping overlay — the source of
// the exact-match list is the only place that behaviour is described in full,
// and it drifted from the docs once already (see the `test_val` bug in
// CHANGELOG.md's 0.1.x entries: an exact-string list that didn't scale to a
// real header spelling silently collapsed 30 tests to 1). This check is the
// same shape as check-parser-docs.mjs: read the source, read the doc, and
// fail if a pattern exists in one but not the other.
//
// Run:  node scripts/check-mapping-docs.mjs      (wired into check:docs)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FILE = resolve(root, 'src/mappingUI.ts');
const DOC_FILE = resolve(root, 'docs/user-guide.md');

const errors = [];
const src = readFileSync(SRC_FILE, 'utf8');
const doc = readFileSync(DOC_FILE, 'utf8');

// ── Extract EXACT_ROLES from the source ─────────────────────────────────────

const exactRolesBlock = src.match(/const EXACT_ROLES:[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
if (!exactRolesBlock) {
  console.error('check-mapping-docs.mjs: could not find EXACT_ROLES in src/mappingUI.ts — has it moved or been renamed?');
  process.exit(1);
}
const entryRe = /role:\s*'(\w+)'[\s\S]*?patterns:\s*\[([\s\S]*?)\]/g;
const roles = [];
for (const m of exactRolesBlock[1].matchAll(entryRe)) {
  const [, role, patternsBody] = m;
  const patterns = [...patternsBody.matchAll(/'([^']+)'/g)].map((p) => p[1]);
  roles.push({ role, patterns });
}
if (roles.length < 10) {
  errors.push(`only found ${roles.length} EXACT_ROLES entries in src/mappingUI.ts — has the array's shape changed?`);
}

// ── Extract ROLE_OPTIONS (role -> display label) ────────────────────────────

const roleOptionsBlock = src.match(/const ROLE_OPTIONS:[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
if (!roleOptionsBlock) {
  console.error('check-mapping-docs.mjs: could not find ROLE_OPTIONS in src/mappingUI.ts — has it moved or been renamed?');
  process.exit(1);
}
const labelByRole = new Map();
for (const m of roleOptionsBlock[1].matchAll(/value:\s*'(\w+)',\s*label:\s*'([^']+)'/g)) {
  labelByRole.set(m[1], m[2]);
}

// ── Extract the doc's table between the sync markers ────────────────────────

const docBlock = doc.match(/<!-- BEGIN AUTO-DETECTED-PATTERNS[\s\S]*?-->([\s\S]*?)<!-- END AUTO-DETECTED-PATTERNS -->/);
if (!docBlock) {
  errors.push('docs/user-guide.md has no "BEGIN/END AUTO-DETECTED-PATTERNS" block — the reference table was removed or its markers were');
}
const docTable = docBlock ? docBlock[1] : '';

// ── Cross-check: every pattern for every role appears in the doc's row ──────

for (const { role, patterns } of roles) {
  const label = labelByRole.get(role);
  if (!label) {
    errors.push(`EXACT_ROLES has role '${role}' but ROLE_OPTIONS has no label for it — the doc table has nothing to key off`);
    continue;
  }
  const rowMatch = docTable.match(new RegExp(`^\\|\\s*\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*\\|(.*)\\|\\s*$`, 'm'));
  if (!rowMatch) {
    errors.push(`docs/user-guide.md's auto-detected-patterns table has no row for '${label}' (role '${role}') — a reader has no way to know which headers it matches`);
    continue;
  }
  const rowText = rowMatch[1];
  for (const pattern of patterns) {
    if (!new RegExp('`' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`').test(rowText)) {
      errors.push(`src/mappingUI.ts's EXACT_ROLES matches '${pattern}' for role '${role}' ('${label}'), but docs/user-guide.md's table row for it does not list \`${pattern}\` — a reader checking whether their column name auto-detects gets a wrong answer`);
    }
  }
}

if (errors.length) {
  console.error(`mapping docs check failed (${errors.length}):\n`);
  for (const e of errors) console.error('  • ' + e);
  console.error('');
  process.exit(1);
}

const patternCount = roles.reduce((n, r) => n + r.patterns.length, 0);
console.log(`mapping docs OK — ${roles.length} roles and ${patternCount} exact-match column-name patterns agree between src/mappingUI.ts and docs/user-guide.md`);
