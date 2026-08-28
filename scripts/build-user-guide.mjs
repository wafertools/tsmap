// FORKED BY DESIGN — ../wafermap/scripts/build-user-guide.mjs shares this name
// but is a different program and must not be reconciled with it: that one emits
// a TS module embedded in wmap's published bundle, and so does this one now —
// same shape, still deliberately different content. Do not "sync" them.
//
// Compiles docs/user-guide.md → src/guideExtension.ts (a generated
// `TSMAP_GUIDE_HTML` fragment) + public/guide/images/*.
//
// This fragment is passed as `userGuideExtension.html` to every
// renderWaferMap/renderWaferGallery call (see src/main.ts) and to wmap's
// controller-free `openWaferMapGuide` (see src/main.ts's openHelpMenu) — wmap
// prepends it before its own built-in guide content in ONE combined guide
// window, so tsmap has a single Help entry point instead of two separate
// guide systems. See WMAP_ISSUES.md #37 (2026-08-28 decision) — this reverses
// #32's 2026-07-12 cutover, which stopped using this option for the opposite
// reason (see CLAUDE.md's "User guide maintenance" section for the history).
//
// Unlike the old standalone page this replaces, this fragment is injected
// into the SAME running app document (Tauri webview / web app), never opened
// as a separate document — so it has no <!doctype>/<head>/<body> of its own,
// and its images use app-absolute paths (/guide/images/...), not relative
// ones, since there is no longer a real public/guide/index.html sitting next
// to them.
//
// Run manually with: npm run build:guide
// Runs automatically via predev / prebuild hooks.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'fs';
import { marked, Renderer } from 'marked';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// Images only now — no index.html lands here any more (see header comment).
// Still served the same way for both consumers: Vite's static-asset
// passthrough exposes it at /guide/images/... for the web build, and
// tauri.conf.json's bundle output includes the same dist/ tree for Tauri
// (the app's own webview, not a separately bundled resource — there is no
// standalone guide page left to bundle as one).
const IMAGES_OUT_DIR = join(ROOT, 'public/guide/images');
const OUT_MODULE = join(ROOT, 'src/guideExtension.ts');

// ── Slugify heading text to stable anchor IDs (same algorithm as wmap) ────────
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── PNG intrinsic size (just enough of the format to read IHDR) ───────────────
// scripts/capture-screenshots.mjs always captures at deviceScaleFactor: 2 (for
// crisp text in the doc images), so every PNG's pixel dimensions are 2x its
// true captured CSS size. Without an explicit width/height, a browser renders
// an <img> at its raw pixel size — i.e. every screenshot in the guide would
// display at literally double its real size. Most obvious on small dialogs
// (e.g. the append-confirm modal), since large full-viewport captures already
// get clamped down by .tsmap-guide img's max-width:100% regardless. Reading
// each PNG's real dimensions and halving them for the emitted width/height
// fixes this once, for every image, rather than hand-tuning CSS per image.
function pngDimensions(filePath) {
  const buf = readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ── Custom renderer: heading IDs, app-absolute images ─────────────────────────
// No TOC built here any more — wmap's own guide window builds ONE combined
// "Contents" nav covering every `<h2 id>` in the merged document (this
// fragment's headings AND wmap's own), not a second one scoped to just this
// fragment. See WMAP_ISSUES.md #37 and wmap's `buildGuideToc`
// (packages/canvas-adapter/toolbar.ts) — real `id`s on every heading are all
// this fragment needs to supply for that nav to pick its sections up.
const renderer = new Renderer();

renderer.heading = ({ text, depth }) => {
  const id = slugify(text.replace(/<[^>]+>/g, ''));
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};

// This fragment lives inside the app's own document (see header comment), so
// every image resolves against the app's own served assets, not a path
// relative to some standalone page that no longer exists.
renderer.image = ({ href, text }) => {
  const rel = /^https?:\/\//.test(href) ? href : `/guide/images/${href.replace(/^images\//, '')}`;
  const alt = text ? ` alt="${text}"` : '';
  let sizeAttrs = '';
  if (!/^https?:\/\//.test(href)) {
    const srcPath = join(ROOT, 'docs/images', href.replace(/^images\//, ''));
    try {
      const { width, height } = pngDimensions(srcPath);
      sizeAttrs = ` width="${Math.round(width / 2)}" height="${Math.round(height / 2)}"`;
    } catch { /* non-PNG or unreadable — fall back to natural (2x) size */ }
  }
  return `<img src="${rel}"${sizeAttrs}${alt}>`;
};

marked.setOptions({ renderer });

// ── Read and pre-process markdown ─────────────────────────────────────────────
let md = readFileSync(join(ROOT, 'docs/user-guide.md'), 'utf8');

// Strip YAML frontmatter
md = md.replace(/^---\n[\s\S]*?\n---\n/, '');

// ── Render to HTML ────────────────────────────────────────────────────────────
let html = await marked(md);

// ── Rewrite internal anchor links to scrollIntoView (smooth-scrolls within
// the guide window rather than a hash-navigation reload) ──────────────────────
html = html.replace(
  /href="#([^"]+)"/g,
  (_, id) =>
    `href="#${id}" onclick="(function(e){e.preventDefault();var t=document.querySelector('.tsmap-guide [id=\\'${id}\\']');if(t)t.scrollIntoView({behavior:'smooth'});})(event)"`
);

// ── Light theme tokens ─────────────────────────────────────────────────────────
// This fragment is injected into wmap's guide window, which carries its own
// (light-only) chrome and has no host tokens for these to inherit from — so,
// same as the old standalone page, it carries its own fixed light-theme
// values, sourced from index.html's light block. Deliberately a plain
// literal: this script runs under plain Node, not the app's TS build, so it
// can't import from src/.
//
// Scoped to .tsmap-guide-scope, NOT :root: wmap's "in-page floating window"
// fallback (the path Tauri/WebKitGTK always takes — window.open is blocked
// there) injects this fragment as a DOM subtree inside the SAME document as
// the running tsmap app, not a separate page. A bare :root rule would then
// override tsmap's own theme tokens for the entire app for as long as the
// guide stayed open. A real popup window (plain browser hosts) gets its own
// document, where scoping would be unnecessary but is still harmless —
// CSS custom properties cascade from any ancestor, not just :root.
const LIGHT_TOKENS = `
  --accent: #1a6bbf;
  --bg-input: #fff;
  --bg-modal: #fff;
  --bg-overlay: #fff;
  --bg-toolbar: #f0f0f0;
  --bg-row-border: #e8e8e8;
  --border-strong: #ccc;
  --border-mid: #bbb;
  --border-muted: #bbb;
  --border-dim: #aaa;
  --border-subtle: #d8d8d8;
  --text-primary: #111;
  --text-secondary: #222;
  --text-tertiary: #333;
  --text-muted: #555;
  --text-dim: #666;
  --text-light: #1a1a1a;
  --text-subdued: #444;
  --error-text: #b91c1c;
  --warn-text: #92400e;
`;

// ── Guide typography ───────────────────────────────────────────────────────────
// Matches wmap's own `.wmap-guide` box model exactly (padding, max-width,
// centering) — see WMAP_ISSUES.md #37 — so the two sections of the combined
// guide read as one continuous document with no visible seam, not two blocks
// with different margins stacked on top of each other. `max-width` reads the
// SAME `--wmap-guide-reading-width` custom property wmap's own guide content
// does (wmap sets it on maximise/restore; see UserGuideExtension's own doc
// comment in wmap for the convention), so this section's line length widens
// in step with wmap's rather than staying capped while wmap's grows.
const guideCss = `
.tsmap-guide { font-size: 14px; color: var(--text-light); line-height: 1.65; padding: 24px 32px; max-width: var(--wmap-guide-reading-width, 720px); margin: 0 auto; box-sizing: border-box; }
.tsmap-guide h1 { font-size: 1.35em; font-weight: 700; margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid var(--border-mid); color: var(--text-primary); }
.tsmap-guide h2 { font-size: 1.1em; font-weight: 700; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); }
.tsmap-guide h3 { font-size: 1em; font-weight: 700; margin: 20px 0 6px; color: var(--text-tertiary); }
.tsmap-guide h4 { font-size: 0.9em; font-weight: 600; margin: 14px 0 5px; color: var(--text-muted); }
.tsmap-guide p  { margin: 0 0 12px; color: var(--text-subdued); }
.tsmap-guide ul, .tsmap-guide ol { padding-left: 22px; margin: 0 0 12px; color: var(--text-subdued); }
.tsmap-guide li { margin-bottom: 4px; }
.tsmap-guide a  { color: var(--accent); text-decoration: none; }
.tsmap-guide a:hover { text-decoration: underline; }
.tsmap-guide strong { font-weight: 600; }
.tsmap-guide code {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  font-size: 12px; background: var(--bg-input); border: 1px solid var(--border-subtle);
  border-radius: 3px; padding: 1px 5px; color: var(--text-tertiary);
}
.tsmap-guide pre {
  background: var(--bg-input); border: 1px solid var(--border-subtle);
  border-radius: 4px; padding: 10px 12px; overflow-x: auto; margin: 0 0 12px;
}
.tsmap-guide pre code { background: none; border: none; padding: 0; font-size: 12px; }
.tsmap-guide table { border-collapse: collapse; width: 100%; max-width: 900px; margin: 0 0 16px; font-size: 13px; }
.tsmap-guide th { text-align: left; padding: 7px 10px; color: var(--text-tertiary); font-weight: 600; background: var(--bg-toolbar); border: 1px solid var(--border-mid); }
.tsmap-guide td { padding: 6px 10px; color: var(--text-subdued); border: 1px solid var(--border-subtle); vertical-align: top; }
.tsmap-guide tr:nth-child(even) td { background: var(--bg-row-border); }
.tsmap-guide img { max-width: 100%; height: auto; }
.tsmap-guide .tsmap-mockup { max-width: 760px; }
.tsmap-guide hr { border: none; border-top: 1px solid var(--border-subtle); margin: 24px 0; }
.tsmap-guide blockquote { border-left: 3px solid var(--border-mid); margin: 0 0 12px; padding: 4px 12px; color: var(--text-muted); }
@media print {
  .tsmap-guide h1, .tsmap-guide h2, .tsmap-guide h3, .tsmap-guide h4 { break-after: avoid; }
  .tsmap-guide pre, .tsmap-guide table, .tsmap-guide img { break-inside: avoid; }
  .tsmap-guide a { color: #000; }
}
`;

// ── Copy images ─────────────────────────────────────────────────────────────────
rmSync(IMAGES_OUT_DIR, { recursive: true, force: true });
mkdirSync(IMAGES_OUT_DIR, { recursive: true });
for (const f of readdirSync(join(ROOT, 'docs/images'))) {
  copyFileSync(join(ROOT, 'docs/images', f), join(IMAGES_OUT_DIR, f));
}

// ── Assemble the fragment (no <!doctype>/<head>/<body> — see header comment) ──
const fragment = `<style>.tsmap-guide-scope{${LIGHT_TOKENS}}${guideCss}</style><div class="tsmap-guide-scope"><div class="tsmap-guide">${html}</div></div>`;

// ── Emit as a generated TS module (mirrors wmap's own userGuideHtml.ts) ───────
const moduleSrc = `// GENERATED by scripts/build-user-guide.mjs from docs/user-guide.md — do not edit by hand.
export const TSMAP_GUIDE_HTML = ${JSON.stringify(fragment)};
`;
writeFileSync(OUT_MODULE, moduleSrc, 'utf8');
console.log(`build:guide — src/guideExtension.ts written (+ ${readdirSync(IMAGES_OUT_DIR).length} images)`);
