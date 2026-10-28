#!/usr/bin/env node
/**
 * Builds the Learn tsmap lessons: every deck docs/learn/NN-slug.md (and each case study, docs/learn/CN-slug.md) becomes a
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
import { composeCourseBook } from './lessons/course-book.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEARN = join(root, 'docs', 'learn');
const CONFIG = join(root, 'scripts', 'lessons', 'marp.config.mjs');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 ? resolve(args[outIdx + 1]) : join(root, 'site', 'learn');

const FULLSCREEN_RESUME = readFileSync(join(root, 'scripts', 'lessons', 'fullscreen-resume.js'), 'utf8');

const problems = [];

// The docs site (zensical) reads each deck's front matter as strict YAML, and a value left unquoted that holds ": " or " #"
// is not valid YAML, so it fails the whole site build with no hint which page. Marp is lenient, so check it here.
function yamlProblems(src, file) {
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  if (!m) return [];
  return m[1].split('\n').flatMap((line) => {
    const kv = /^(\w+):\s*(.+)$/.exec(line);
    if (!kv || /^["'[{|>]/.test(kv[2])) return [];
    return /: | #/.test(kv[2]) ? [`${file}: the front matter value for "${kv[1]}" holds ": " or " #", so it must be in quotes to be valid YAML`] : [];
  });
}

function frontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

// A lesson is NN-slug.md. A case study is CN-slug.md: it teaches no controls, so it has no coverage, no teaser and no
// "Next lesson" chain, and it is listed apart from the lessons.
const DECK_FILE = /^(\d\d|C\d+)-[\w-]+\.md$/;
const allDecks = readdirSync(LEARN).filter((f) => DECK_FILE.test(f)).sort((a, b) => (a[0] === 'C') - (b[0] === 'C') || a.localeCompare(b)).map((file) => {
  const src = readFileSync(join(LEARN, file), 'utf8');
  const fm = frontMatter(src);
  const slug = file.replace(/\.md$/, '');
  const session = file.split('-')[0];
  const isCase = session.startsWith('C');
  problems.push(...yamlProblems(src, file));
  // A "---" straight under a line of text is a heading underline, not a slide break: the two slides merge into one.
  const lines = src.split('\n');
  const closed = lines.indexOf('---', 1);
  lines.forEach((l, i) => { if (i > closed && l === '---' && lines[i - 1].trim() !== '') problems.push(`${file}:${i + 1}: a "---" slide break needs a blank line above it, or it underlines the text above and merges two slides`); });
  if (!fm.title) problems.push(`${file}: no "title:" in the front matter`);
  if (!fm.description) problems.push(`${file}: no "description:" in the front matter (the index page shows it)`);
  if (fm.theme !== 'tsmap') problems.push(`${file}: front matter must say "theme: tsmap"`);
  for (const m of src.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^https?:/.test(m[1])) continue;
    if (!existsSync(join(LEARN, m[1]))) problems.push(`${file}: screenshot ${m[1]} does not exist — run npm run lessons:shots -- --only ${session}`);
  }
  // A screenshot the scenario still captures but no slide shows is dead weight in the repository.
  const imagesDir = join(LEARN, 'images', session);
  if (existsSync(imagesDir)) for (const img of readdirSync(imagesDir)) {
    if (!src.includes(`images/${session}/${img}`)) console.warn(`  warning: ${file} does not use images/${session}/${img} — drop the shot from its scenario`);
  }
  if (!isCase && file !== '00-welcome.md' && !fm.teaser) problems.push(`${file}: no "teaser:" in the front matter (the previous lesson's Next lesson slide shows it)`);
  return { file, slug, session, isCase, title: fm.title, description: fm.description, teaser: fm.teaser, src };
});
const decks = allDecks.filter((d) => !d.isCase);
const cases = allDecks.filter((d) => d.isCase);

// Each lesson's closing "Next lesson" slide must say what the next lesson's own front matter says: its number,
// title, file and teaser. They are written by hand in the deck, so this is where they are kept from drifting.
decks.forEach((d, i) => {
  const next = decks[i + 1];
  const slide = /_class: next -->[\s\S]*?\[(\d\d) · ([^\]]+?) →\]\(([^)]+)\.md\)\n\n([^\n]+)/.exec(d.src);
  if (!next) return;
  if (!slide) { problems.push(`${d.file}: the closing slide has no "[NN · Title →](file.md)" link and teaser`); return; }
  const [, num, title, slug, teaser] = slide;
  if (num !== next.session || `${num} · ${title}` !== next.title || slug !== next.slug) problems.push(`${d.file}: Next lesson says "${num} · ${title}" (${slug}.md), but the next lesson is "${next.title}" (${next.slug}.md)`);
  if (teaser !== next.teaser) problems.push(`${d.file}: Next lesson teaser "${teaser}" differs from ${next.file}'s teaser "${next.teaser}"`);
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
for (const deck of allDecks) {
  const dir = join(OUT, deck.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const code = await marpCli(['--config-file', CONFIG, '--no-stdin', join(LEARN, deck.file), '-o', join(dir, 'index.html')]);
  if (code !== 0) { console.error(`\n✗ Marp failed on ${deck.file}\n`); process.exit(1); }
  // Keep full screen on from one lesson to the next (see the script's own header).
  const page = join(dir, 'index.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', () => `<script>\n${FULLSCREEN_RESUME}</script>\n</body>`));
  const images = join(LEARN, 'images', deck.session);
  if (existsSync(images)) cpSync(images, join(dir, 'images', deck.session), { recursive: true });
  console.log(`  ✓ ${deck.file} → ${join(dir, 'index.html').slice(root.length + 1)}`);
}

// The whole course as one PDF, with bookmarks for each lesson and section and jumps between lessons. It needs a browser
// (Chrome, Chromium or Edge; CHROME_PATH picks one). Without one the rest of the build still goes ahead, and the index
// simply has no PDF link. The browser is given three minutes for each step: the whole course is hundreds of slides with
// screenshots, more than the 30 seconds Marp allows by default.
const PDF_NAME = 'learn-tsmap.pdf';
const PDF_CONFIG = join(root, 'scripts', 'lessons', 'marp.pdf.config.mjs');
let pdfBuilt = false;
{
  // Written inside the output folder, so the theme's icon and each lesson's copied screenshots are found beside it.
  const dir = join(OUT, '_pdf');
  mkdirSync(dir, { recursive: true });
  const book = join(dir, 'course.md');
  writeFileSync(book, composeCourseBook(LEARN, decks).markdown);
  try {
    const code = await marpCli(['--config-file', PDF_CONFIG, '--no-stdin', '--allow-local-files', '--browser-timeout', '180', '--pdf', '--pdf-outlines', '--pdf-outlines.pages=false', book, '-o', join(OUT, PDF_NAME)]);
    pdfBuilt = code === 0 && existsSync(join(OUT, PDF_NAME));
    if (!pdfBuilt) console.warn(`  ! the course PDF was not built (Marp exited with ${code})`);
  } catch (e) {
    console.warn(`  ! the course PDF was skipped: ${String(e.message ?? e).split('\n')[0]}`);
  }
  rmSync(dir, { recursive: true, force: true });
  if (pdfBuilt) console.log(`  ✓ ${PDF_NAME} → ${join(OUT, PDF_NAME).slice(root.length + 1)}`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Lessons up to this number are the core path; the rest are for when you need them.
const CORE_LAST = 6;

const SAMPLES_URL = 'https://wafertools.github.io/tsmap/web/#try-it-with-sample-data';

/** The page every non-deck page shares: the index and the glossary. */
const shell = ({ title, description, main }) => `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
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
    h2 { font-size: 1.15rem; margin: 32px 0 4px; }
    p.lead { color: var(--muted); margin: 0 0 28px; }
    p.group-note { color: var(--muted); margin: 0 0 12px; font-size: .95rem; }
    figure { margin: 0 0 28px; }
    figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 10px; }
    ul.lessons { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    li a { display: flex; gap: 16px; align-items: flex-start; padding: 16px 18px; background: var(--card); border: 1px solid var(--rule); border-radius: 10px; color: inherit; text-decoration: none; }
    li a:hover { border-color: var(--primary); }
    .num { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: #fff; font-weight: 700; display: grid; place-items: center; }
    .text { display: grid; gap: 2px; }
    .text span { color: var(--muted); }
    .text { flex: 1; }
    dl.glossary dt { font-weight: 700; margin-top: 22px; }
    dl.glossary dd { margin: 2px 0 0; }
    dl.glossary dt:target { background: var(--card); outline: 6px solid var(--card); border-radius: 4px; }
    code { font: .9em ui-monospace, 'JetBrains Mono', Menlo, monospace; background: var(--card); padding: 1px 5px; border-radius: 4px; }
    footer { margin-top: 32px; color: var(--muted); font-size: .9rem; }
    a { color: var(--link); }
  </style>
</head>
<body>
  <header><a href="${rewriteHref('../index.md')}"><img src="${shell.root}tsmap-icon.png" alt="" width="24" height="24">tsmap</a> · <a href="${shell.root}index.html">learn</a></header>
  <main>
${main}
  </main>
</body>
</html>
`;

const lessonItem = (d) => `      <li>
        <a href="${d.slug}/index.html">
          <span class="num">${d.session}</span>
          <span class="text"><strong>${esc(d.title.replace(/^(\d\d|C\d+)\s*·\s*/, ''))}</strong><span>${esc(d.description)}</span></span>
        </a>
      </li>`;
const core = decks.filter((d) => Number(d.session) <= CORE_LAST);
const rest = decks.filter((d) => Number(d.session) > CORE_LAST);

// The reading time on a card is the slides alone; the card adds the lab, so the cards and the totals agree.
shell.root = '';
writeFileSync(join(OUT, 'index.html'), shell({
  title: 'Learn tsmap',
  description: 'Learn tsmap: self-paced lessons in short slides, each ending with a lab in the web app.',
  main: `    <h1>Learn tsmap</h1>
    <p class="lead">Short lessons, one idea per slide, each ending with a lab in the
      <a href="https://wafertools.github.io/tsmap/app/">web app</a>. New to tsmap? Start with 00. Use the arrow keys to move through a lesson.</p>
    <figure><img src="tsmap-screen.png" alt="tsmap with a lot of 13 wafers loaded: the bin legend, a map for each wafer and the summary panel" width="1280" height="820"></figure>
    <h2>The core path: 00 to ${String(CORE_LAST).padStart(2, '0')}</h2>
    <p class="group-note">What most people need: getting data in, reading maps and findings, and the Insights charts.</p>
    <ul class="lessons">
${core.map(lessonItem).join('\n')}
    </ul>
    <h2>When you need them: ${String(CORE_LAST + 1).padStart(2, '0')} onwards</h2>
    <p class="group-note">Pick the lesson that matches the job in hand.</p>
    <ul class="lessons">
${rest.map(lessonItem).join('\n')}
    </ul>${cases.length ? `
    <h2>Case studies</h2>
    <p class="group-note">Each one starts from a question an engineer is asked and works to the answer on a lot you have not seen. They use only what the lessons teach, so finish 00 to 06 first.</p>
    <ul class="lessons">
${cases.map(lessonItem).join('\n')}
    </ul>` : ''}
    <footer>${pdfBuilt ? `Prefer to read offline or print? <a href="${PDF_NAME}">Download the whole course as a PDF</a>. ` : ''}Stuck on a word? See the <a href="glossary/index.html">glossary</a>. No data to hand? The <a href="${SAMPLES_URL}">sample files</a> are the ones the labs use.
      For the detail behind any slide, see the <a href="${rewriteHref('../user-guide.md')}">user guide</a>.</footer>`,
}));
console.log(`  ✓ index → ${join(OUT, 'index.html').slice(root.length + 1)}  (${decks.length} lessons, ${cases.length} case studies)`);

// The glossary: docs/learn/glossary.md, one "## Term" heading and one paragraph each, with lesson links. Not a deck.
const inline = (t) => esc(t)
  .replace(/\[([^\]]+)\]\((\d\d-[\w-]+)\.md\)/g, '<a href="../$2/index.html">$1</a>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const glossSrc = readFileSync(join(LEARN, 'glossary.md'), 'utf8');
const gm = frontMatter(glossSrc);
const entries = [...glossSrc.replace(/^---\n[\s\S]*?\n---\n/, '').matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
  .map((m) => ({ term: m[1].trim(), text: m[2].trim() }));
const glossLinks = [...glossSrc.matchAll(/\]\((\d\d-[\w-]+)\.md\)/g)].map((m) => m[1]);
for (const l of glossLinks) if (!decks.some((d) => d.slug === l)) { console.error(`\n✗ glossary.md links to ${l}.md, which is not a lesson\n`); process.exit(1); }
mkdirSync(join(OUT, 'glossary'), { recursive: true });
shell.root = '../';
writeFileSync(join(OUT, 'glossary', 'index.html'), shell({
  title: `${gm.title} · Learn tsmap`,
  description: gm.description,
  main: `    <h1>${esc(gm.title)}</h1>
    <p class="lead">${esc(gm.description)} Each entry names the lesson that teaches it.</p>
    <dl class="glossary">
${entries.map((e) => `      <dt id="${slugify(e.term)}">${esc(e.term)}</dt>\n      <dd>${inline(e.text)}</dd>`).join('\n')}
    </dl>`,
}));
console.log(`  ✓ glossary → site/learn/glossary/index.html  (${entries.length} terms)`);
