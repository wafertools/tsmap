#!/usr/bin/env node
/**
 * Keeps the theme list in the docs matching `THEME_GROUPS` (src/theme.ts).
 *
 * The user guide names every theme, grouped Light and Dark, and CLAUDE.md
 * repeats the list with a count. Adding a theme is a one-line edit to
 * `THEME_GROUPS` and CSS — nothing forces the prose to follow, and the prose is
 * what a user reads to find out what they can pick.
 *
 * Checks NAMES and ORDER, not a count. A count catches "we went from 8 to 16"
 * and misses a rename, a reorder, or a theme moved between groups — all of which
 * make the guide wrong in a way a reader would actually notice, since the guide
 * is what they scan to find the one they want.
 *
 * Run:  node scripts/check-theme-docs.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// Labels per group, straight from the source of truth. Parsed rather than
// imported because theme.ts is TypeScript and this runs as plain node.
const src = readFileSync(resolve(root, 'src/theme.ts'), 'utf8');
const block = src.slice(src.indexOf('export const THEME_GROUPS'), src.indexOf('\n];', src.indexOf('export const THEME_GROUPS')));

const groups = new Map();
for (const m of block.matchAll(/\{\s*group:\s*'([^']+)',\s*themes:\s*\[([\s\S]*?)\]\s*\}/g)) {
  groups.set(m[1], [...m[2].matchAll(/label:\s*'([^']+)'/g)].map(x => x[1]));
}
if (groups.size === 0) {
  console.error('check-theme-docs: could not parse THEME_GROUPS from src/theme.ts — has its shape changed?');
  process.exit(1);
}

const total = [...groups.values()].reduce((n, g) => n + g.length, 0);

/** Every label in `group` must appear, in order, inside the doc's list line. */
function checkList(file, group, lineMatcher) {
  const text = readFileSync(resolve(root, file), 'utf8');
  const expected = groups.get(group);
  if (!expected) { problems.push(`src/theme.ts has no "${group}" group`); return; }

  const m = text.match(lineMatcher);
  if (!m) {
    problems.push(`${file}: could not find the ${group} theme list — has the wording changed? ` +
                  `This check pins it so the docs cannot drift from THEME_GROUPS.`);
    return;
  }
  const listed = m[1].replace(/\s+/g, ' ');
  let cursor = 0;
  for (const label of expected) {
    const at = listed.indexOf(label, cursor);
    if (at === -1) {
      problems.push(`${file}: the ${group} list is missing "${label}" (or has it out of order). ` +
                    `Source order: ${expected.join(', ')}`);
      return;
    }
    cursor = at + label.length;
  }
  // Catch a theme named in the docs that no longer exists in the source.
  for (const stray of listed.split(/,\s*|\.\s*$/).map(s => s.trim()).filter(Boolean)) {
    const bare = stray.replace(/\*\*/g, '').replace(/\.$/, '').trim();
    if (bare && !expected.includes(bare) && !/^—$|^and$/.test(bare)) {
      problems.push(`${file}: the ${group} list names "${bare}", which is not in THEME_GROUPS.`);
    }
  }
}

// The user guide's two bullets: "- **Light** — A, B, C." / "- **Dark** — ..."
checkList('docs/user-guide.md', 'Light', /^- \*\*Light\*\* — ([\s\S]*?)\.$/m);
checkList('docs/user-guide.md', 'Dark',  /^- \*\*Dark\*\* — ([\s\S]*?)\.$/m);

// CLAUDE.md restates the list inline, with a spelled-out count.
const claude = readFileSync(resolve(root, 'CLAUDE.md'), 'utf8');
const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
               'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const countMatch = claude.match(/([A-Z][a-z]+) themes, grouped for the picker/);
if (!countMatch) {
  problems.push('CLAUDE.md: could not find the "<N> themes, grouped for the picker" claim.');
} else if (countMatch[1].toLowerCase() !== (WORDS[total] ?? String(total))) {
  problems.push(`CLAUDE.md: says "${countMatch[1]} themes", THEME_GROUPS has ${total} (${WORDS[total] ?? total}).`);
}

if (problems.length) {
  console.error(`\ntheme docs check failed (${problems.length}):\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error('\nUpdate the lists in docs/user-guide.md and CLAUDE.md to match src/theme.ts.\n');
  process.exit(1);
}
console.log(`theme docs OK — ${total} themes across ${groups.size} groups, names and order match THEME_GROUPS`);
