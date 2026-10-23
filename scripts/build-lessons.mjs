#!/usr/bin/env node
/**
 * Builds the Learn tsmap lessons: every deck docs/learn/NN-slug.md becomes a
 * standalone HTML page, site/learn/NN-slug/index.html, with its screenshots
 * copied beside it, plus site/learn/index.html listing the sessions.
 *
 * Run it after `zensical build`, which renders the deck sources as ordinary
 * pages at those same paths: the decks replace them, so the course is served
 * at /tsmap/learn/ while the docs search still indexes each deck's text.
 * It needs no browser and no web build — only the committed screenshots, which
 * `npm run lessons:shots` regenerates.
 *
 * Fails, naming the deck, when a deck has no title or description, or refers
 * to a screenshot that does not exist.
 *
 * Usage:
 *   npm run lessons:build                 # → site/learn/
 *   npm run lessons:build -- --out dir    # somewhere else
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { marpCli } from '@marp-team/marp-cli';
import { rewriteHref } from './lessons/marp.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEARN = join(root, 'docs', 'learn');
const CONFIG = join(root, 'scripts', 'lessons', 'marp.config.mjs');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 ? resolve(args[outIdx + 1]) : join(root, 'site', 'learn');

const problems = [];

function frontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

// Reading time shown on the index, worked out from the lesson itself so it stays true as the lesson changes. It errs
// short: a brisk 250 words a minute and 3 seconds a screenshot, rounded to the nearest minute, with the lab extra.
// A long estimate puts readers off as surely as a long lesson.
function readingMinutes(src) {
  let text = src.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->/g, '');
  const images = (text.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, '');
  const words = (text.match(/[A-Za-z0-9][\w’'.-]*/g) ?? []).length;
  return Math.max(1, Math.round(words / 250 + images * 3 / 60));
}

const decks = readdirSync(LEARN).filter((f) => /^\d\d-[\w-]+\.md$/.test(f)).sort().map((file) => {
  const src = readFileSync(join(LEARN, file), 'utf8');
  const fm = frontMatter(src);
  const slug = file.replace(/\.md$/, '');
  if (!fm.title) problems.push(`${file}: no "title:" in the front matter`);
  if (!fm.description) problems.push(`${file}: no "description:" in the front matter (the index page shows it)`);
  if (fm.theme !== 'tsmap') problems.push(`${file}: front matter must say "theme: tsmap"`);
  for (const m of src.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^https?:/.test(m[1])) continue;
    if (!existsSync(join(LEARN, m[1]))) problems.push(`${file}: screenshot ${m[1]} does not exist — run npm run lessons:shots -- --only ${file.slice(0, 2)}`);
  }
  // A screenshot the scenario still captures but no slide shows is dead weight in the repository.
  const imagesDir = join(LEARN, 'images', file.slice(0, 2));
  if (existsSync(imagesDir)) for (const img of readdirSync(imagesDir)) {
    if (!src.includes(`images/${file.slice(0, 2)}/${img}`)) console.warn(`  warning: ${file} does not use images/${file.slice(0, 2)}/${img} — drop the shot from its scenario`);
  }
  return { file, slug, session: file.slice(0, 2), title: fm.title, description: fm.description, minutes: readingMinutes(src) };
});

if (problems.length) {
  console.error(`\n✗ lesson build failed (${problems.length}):\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error('');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
// The icon the theme shows on title and closing slides and beside every footer.
cpSync(join(root, 'docs', 'images', 'tsmap-readme-header-256.png'), join(OUT, 'tsmap-icon.png'));
// The picture above the lesson list: the screen lesson 00 introduces.
cpSync(join(LEARN, 'images', '00', 'layout.png'), join(OUT, 'tsmap-screen.png'));
for (const deck of decks) {
  const dir = join(OUT, deck.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const code = await marpCli(['--config-file', CONFIG, '--no-stdin', join(LEARN, deck.file), '-o', join(dir, 'index.html')]);
  if (code !== 0) { console.error(`\n✗ Marp failed on ${deck.file}\n`); process.exit(1); }
  const images = join(LEARN, 'images', deck.session);
  if (existsSync(images)) cpSync(images, join(dir, 'images', deck.session), { recursive: true });
  console.log(`  ✓ ${deck.file} → ${join(dir, 'index.html').slice(root.length + 1)}`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const items = decks.map((d) => `      <li>
        <a href="${d.slug}/index.html">
          <span class="num">${d.session}</span>
          <span class="text"><strong>${esc(d.title.replace(/^\d\d\s*·\s*/, ''))}</strong><span>${esc(d.description)}</span></span>
          <span class="time">about ${d.minutes} min<br>+ lab</span>
        </a>
      </li>`).join('\n');

writeFileSync(join(OUT, 'index.html'), `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Learn tsmap</title>
  <meta name="description" content="Learn tsmap: self-paced training in short lessons, each ending with a lab in the web app.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap">
  <style>
    :root { --bg: #fff; --fg: rgba(0,0,0,.87); --muted: rgba(0,0,0,.56); --rule: rgba(0,0,0,.08); --primary: #4051b5; --card: #f7f8fc; --link: #3f5bd9; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: hsl(225,15%,9%); --fg: hsla(225,15%,90%,.88); --muted: hsla(225,15%,90%,.58); --rule: hsla(225,15%,90%,.12); --primary: #5d6cc0; --card: hsl(225,15%,13%); --link: #8ea2f2; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 Inter, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    header { background: var(--primary); color: #fff; padding: 14px 16px; }
    header a { color: #fff; text-decoration: none; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; vertical-align: middle; }
    main { max-width: 820px; margin: 0 auto; padding: 32px 16px 64px; }
    h1 { font-size: 2rem; margin: 0 0 8px; letter-spacing: -.01em; }
    p.lead { color: var(--muted); margin: 0 0 28px; }
    figure { margin: 0 0 28px; }
    figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 10px; }
    ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    li a { display: flex; gap: 16px; align-items: flex-start; padding: 16px 18px; background: var(--card); border: 1px solid var(--rule); border-radius: 10px; color: inherit; text-decoration: none; }
    li a:hover { border-color: var(--primary); }
    .num { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: #fff; font-weight: 700; display: grid; place-items: center; }
    .text { display: grid; gap: 2px; }
    .text span { color: var(--muted); }
    .text { flex: 1; }
    .time { flex: none; color: var(--muted); font-size: .85rem; text-align: right; white-space: nowrap; }
    footer { margin-top: 32px; color: var(--muted); font-size: .9rem; }
    a { color: var(--link); }
  </style>
</head>
<body>
  <header><a href="${rewriteHref('../index.md')}"><img src="tsmap-icon.png" alt="" width="24" height="24">tsmap</a> · learn</header>
  <main>
    <h1>Learn tsmap</h1>
    <p class="lead">Short lessons, one idea per slide, each ending with a lab in the
      <a href="https://wafertools.github.io/tsmap/app/">web app</a>. New to tsmap? Start with 00. Otherwise pick the lesson
      you need. Use the arrow keys to move through a lesson.</p>
    <figure><img src="tsmap-screen.png" alt="tsmap with a lot of 13 wafers loaded: the bin legend, a map for each wafer and the summary panel" width="1280" height="820"></figure>
    <ol>
${items}
    </ol>
    <footer>For the detail behind any slide, see the <a href="${rewriteHref('../user-guide.md')}">user guide</a>.</footer>
  </main>
</body>
</html>
`);
console.log(`  ✓ index → ${join(OUT, 'index.html').slice(root.length + 1)}  (${decks.length} lessons)`);
