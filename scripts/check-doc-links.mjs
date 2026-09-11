#!/usr/bin/env node
/**
 * Verifies every internal link in the docs actually resolves.
 *
 * Zensical has no redirect map and no link validation, and a heading anchor that
 * does not exist is not an error — the browser simply lands at the top of the
 * page and the reader concludes the docs are wrong about their own contents.
 * Nothing in the build says a word. That silence is the whole problem: docs/user-guide.md
 * alone is ~1000 lines of headings that other pages deep-link into, and it is the
 * page most likely to be reorganised. A moved heading breaks every link to it
 * invisibly, in both the site and the GitHub render.
 *
 * That is also why this has to exist BEFORE the docs are restructured, not
 * after: it is the only way to tell a finished move from a move that quietly
 * dropped a dozen references.
 *
 * Checks, for docs/**\/*.md plus the root Markdown that links into them:
 *   1. every relative link target (file, image, example page) exists on disk
 *   2. every `#anchor` names a heading that the Markdown really produces,
 *      using Python-Markdown's slug algorithm — the one Zensical actually runs
 *   3. no two headings in a page slugify the same (silent `_1` suffixing, so
 *      one of the two is unreachable by its obvious anchor)
 *   4. every zensical.toml nav entry points at a file that exists
 *
 * External (http/https/mailto) links are listed but never fetched — this check
 * must stay offline and instant.
 *
 * Run:  node scripts/check-doc-links.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join, relative, posix, isAbsolute } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// Build artefacts that legitimately do not exist in a clean tree.
const GENERATED = new Set([
  // The browser build of the app, copied into docs/ at site-build time.
  'docs/app',
]);

// ── Slugs ───────────────────────────────────────────────────────────────────
//
// Python-Markdown's toc extension default, which is what Zensical 0.0.51 uses
// (zensical/config.py sets `toc: {permalink: True}` and no custom slugify):
//
//   value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore')...
//   value = re.sub(r'[^\w\s-]', '', value).strip().lower()
//   return re.sub(r'[-\s]+', '-', value)
//
// The final collapse of runs is the part that differs from GitHub's algorithm,
// so an anchor can work on github.com and 404 on the site, or vice versa.
function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '-');
}

// Heading text is slugified AFTER inline Markdown is rendered, so the markup
// characters are gone by then — strip the ones our headings actually use.
function headingText(raw) {
  return raw
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// ── Markdown scanning ───────────────────────────────────────────────────────
//
// Fenced code blocks are stripped first: a `# comment` line inside a bash fence
// is not a heading, and a link inside a fence is sample code, not a reference.
function stripFences(src) {
  const out = [];
  let fence = null;
  for (const line of src.split('\n')) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (line.trimStart().startsWith(fence.repeat(3))) fence = null;
      out.push('');
      continue;
    }
    out.push(fence ? '' : line);
  }
  return out.join('\n');
}

function anchorsOf(file) {
  const src = stripFences(readFileSync(file, 'utf8'));
  const seen = new Map();
  const anchors = new Set();
  for (const raw of src.split('\n')) {
    // Blockquoted headings ('> ### ...') are real headings and get real ids —
    // api.md's "How much of this do I need?" callout is one.
    const line = raw.replace(/^\s*(?:>\s?)+/, '');
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!m) continue;
    // attr_list is listed in Zensical 0.0.51's default extensions but is NOT
    // applied to headings — a verified `{#custom-id}` came back slugified into
    // the heading text ('...-probe-custom-stable-anchor'). So there is no way to
    // pin a stable anchor across a rename, and writing one produces an id that
    // matches neither what the author intended nor what any link says.
    if (/\{#[^}]+\}\s*$/.test(m[2])) {
      problems.push(
        `${rel(file)}: heading '${m[2]}' uses an explicit {#id}, which Zensical ignores — ` +
        `the id is derived from the heading text including the braces`,
      );
    }
    const slug = slugify(headingText(m[2]));
    if (!slug) continue;
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    anchors.add(n === 1 ? slug : `${slug}_${n - 1}`);
    if (n === 2) {
      problems.push(
        `${rel(file)}: two headings both slugify to '#${slug}' — the second is only ` +
        `reachable as '#${slug}_1', so the obvious anchor silently lands on the first`,
      );
    }
  }
  return anchors;
}

function linksIn(file) {
  const src = stripFences(readFileSync(file, 'utf8'));
  const links = [];
  const lines = src.split('\n');
  lines.forEach((rawLine, i) => {
    // Inline code spans are prose ABOUT markup, not markup: WMAP_ISSUES.md
    // discusses `<a download href="blob:…">`, which is not a link to check.
    const line = rawLine.replace(/`[^`]*`/g, '');
    // Markdown inline links and images, plus raw href/src in embedded HTML.
    for (const m of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ target: m[1], line: i + 1 });
    }
    for (const m of line.matchAll(/(?:href|src)="([^"]+)"/g)) {
      links.push({ target: m[1], line: i + 1 });
    }
  });
  return links;
}

const rel = (p) => relative(root, p);

// ── Gather the files to check ───────────────────────────────────────────────

// Example pages are scanned too: their links are hand-written HTML that no
// Markdown tooling ever looks at, which is how `../api.html#...` sat broken in
// theming.html (the site serves it as `api/`, and there is no api.html anywhere).
// Their '#fragments' are NOT anchors — statistics.html uses location.hash as a
// scene selector — so only the path half of an example link is checked.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'dist' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md') || name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = [
  ...walk(resolve(root, 'docs')),
  ...['README.md', 'WMAP_ISSUES.md']
    .map((f) => resolve(root, f))
    .filter(existsSync),
];

// Anchors are read once per file and reused across every link that targets it.
//
// Computed eagerly for EVERY file, not lazily per link target: the duplicate-slug
// check lives in anchorsOf, and a page that nothing happens to deep-link into is
// exactly the page whose colliding headings would otherwise go unexamined.
const anchorCache = new Map(files.filter((f) => f.endsWith('.md')).map((f) => [f, anchorsOf(f)]));
const anchorsFor = (file) => {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(file));
  return anchorCache.get(file);
};

// ── Check ───────────────────────────────────────────────────────────────────

let checked = 0;
let external = 0;
let localOnly = 0;

// Links a clean checkout cannot resolve: a target in another checkout
// (UI_STANDARDS.md links to ../tsmap) or a gitignored, local-only file
// (CLAUDE.md). Testing those for existence passed on a developer machine,
// where both exist, and failed CI's clean checkout of this repo alone — the
// wafermap 0.28.0 release commit went red on exactly that. They are counted
// and skipped like external links, so the check means the same thing
// everywhere; `git check-ignore` judges the ignore rules, not presence.
// Kept identical in wafermap's and tsmap's copy of this script.
const localOnlyCache = new Map();
function isLocalOnly(relTarget) {
  if (relTarget === '..' || relTarget.startsWith('../') || isAbsolute(relTarget)) return true;
  if (!localOnlyCache.has(relTarget)) {
    let ignored = false;
    try {
      execFileSync('git', ['check-ignore', '-q', relTarget], { cwd: root, stdio: 'ignore' });
      ignored = true;
    } catch { /* exit 1: not ignored (or not a git checkout) */ }
    localOnlyCache.set(relTarget, ignored);
  }
  return localOnlyCache.get(relTarget);
}

for (const file of files) {
  for (const { target, line } of linksIn(file)) {
    if (/^(https?:|mailto:|tel:|data:|blob:|javascript:)/.test(target)) { external++; continue; }

    const [path, hash] = target.split('#');
    const where = `${rel(file)}:${line}`;

    // A bare '#anchor' refers to this same file.
    let targetFile = path === '' ? file : resolve(dirname(file), path);

    // Zensical serves 'foo.md' at the pretty URL 'foo/', and the hand-written
    // example/demo pages link that way because that is what works in a browser.
    // Resolve those back to the Markdown source so they can be checked at all.
    if (path !== '' && !existsSync(targetFile)) {
      const asMd = targetFile.replace(/\/$/, '') + '.md';
      if (existsSync(asMd)) targetFile = asMd;
    }

    if (path !== '') {
      const relTarget = posix.normalize(rel(targetFile).split('\\').join('/'));
      if (isLocalOnly(relTarget)) { localOnly++; continue; }
      if (GENERATED.has(relTarget) || [...GENERATED].some((g) => relTarget.startsWith(g + '/'))) {
        checked++;
        continue;
      }
      if (!existsSync(targetFile)) {
        problems.push(`${where}: link target does not exist — '${target}'`);
        continue;
      }
    }

    checked++;
    if (!hash) continue;

    // Anchors are only verifiable in Markdown; skip fragments into HTML examples.
    if (!targetFile.endsWith('.md') || !file.endsWith('.md')) continue;

    if (!anchorsFor(targetFile).has(hash)) {
      problems.push(
        `${where}: '#${hash}' is not a heading in ${rel(targetFile)} — link is '${target}'`,
      );
    }
  }
}

// ── zensical.toml nav ───────────────────────────────────────────────────────
//
// Parsed by pattern rather than with a TOML library: the nav is a nested array
// of single-key tables, and every leaf we care about is a quoted docs-relative
// path. A dependency to read six dozen strings is not worth it.
const navSrc = readFileSync(resolve(root, 'zensical.toml'), 'utf8');
const navBlock = /\nnav\s*=\s*\[([\s\S]*?)\n\]/.exec(navSrc);
if (!navBlock) {
  problems.push('zensical.toml: could not locate the nav array');
} else {
  for (const m of navBlock[1].matchAll(/=\s*"([^"]+)"/g)) {
    const t = m[1];
    if (/^https?:/.test(t)) { external++; continue; }
    checked++;
    if (!existsSync(resolve(root, 'docs', t))) {
      problems.push(`zensical.toml: nav entry points at a missing file — 'docs/${t}'`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error(`doc links check failed (${problems.length}):\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error(
    '\nAnchors are derived with Python-Markdown\'s slug algorithm, the one Zensical\n' +
    'runs — so a heading that changes text (or a §-number) changes its anchor.\n' +
    'Fix the link, or give the heading a stable `{#id}` if it is widely linked.\n',
  );
  process.exit(1);
}

console.log(
  `doc links OK — ${checked} internal links across ${files.length} files ` +
  `(${external} external links not fetched, ${localOnly} into another checkout or a local-only file not checked)`,
);
