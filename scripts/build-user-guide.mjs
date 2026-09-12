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
// and its images are paths relative to that document (guide/images/...), since
// there is no longer a real public/guide/index.html sitting next to them. See
// the `renderer.image` override below for why relative and not app-absolute.
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
const GUIDE_OUT_DIR = join(ROOT, 'public/guide');
const IMAGES_OUT_DIR = join(GUIDE_OUT_DIR, 'images');
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
//
// RELATIVE, not app-absolute. These used to be `/guide/images/...`, which is
// correct only when the app is served from an origin root — true for Tauri and
// for `npm run dev`, and false for the deployed browser build, which lives at
// /tsmap/app/. Every screenshot in the in-app guide was therefore a 404 on the
// published web version, while working perfectly everywhere we look at it.
// A relative path resolves against the app document's own URL and so is right
// in all three: /guide/images/... on desktop, /tsmap/app/guide/images/... on
// the deployed site, and whatever subdirectory a self-hosted copy sits in.
renderer.image = ({ href, text }) => {
  const rel = /^https?:\/\//.test(href) ? href : `guide/images/${href.replace(/^images\//, '')}`;
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

// ── Guide typography ───────────────────────────────────────────────────────────
// Matches wmap's own `.wmap-guide` box model exactly (padding, max-width,
// centering) — see WMAP_ISSUES.md #37 — so the two sections of the combined
// guide read as one continuous document with no visible seam, not two blocks
// with different margins stacked on top of each other. `max-width` reads the
// SAME `--wmap-guide-reading-width` custom property wmap's own guide content
// does (wmap sets it on maximise/restore; see UserGuideExtension's own doc
// comment in wmap for the convention), so this section's line length widens
// in step with wmap's rather than staying capped while wmap's grows.
//
// Every colour below is `var(--token, <light fallback>)` — the SAME token
// names index.html's own theme blocks define (--text-light, --bg-input,
// etc.), deliberately NOT redefined or scoped anywhere in this fragment.
// This used to hardcode a fixed light-theme block (`LIGHT_TOKENS`, removed
// 2026-08-28) on the reasoning that the guide had no host tokens to inherit
// from — true when the guide was a standalone page, but wrong once it was
// folded back into the SAME document as the running app (see WMAP_ISSUES.md
// #37): in that state (the in-page floating-window fallback, which is what
// Tauri/WebKitGTK always uses — window.open is blocked there), tsmap's real,
// live theme tokens are already sitting one ancestor away on
// `<html data-theme="…">`, and the hardcoded block was silently shadowing
// them, forcing every theme to render as light regardless of what was
// active — the Nord/Dark/Solarized Dark themes were reading pale text
// against no matching background because the SAME symptom exists in wmap's
// own guide chrome, not just here (fixed the same day in wmap's own
// `build-user-guide.mjs`). Letting these fall through to a real ancestor
// value is exactly what a normal themed element in `index.html` already
// does — the guide fragment has no special reason to opt out of that.
// The `<light fallback>` on each `var()` only matters for the rare case
// where the guide opens as a genuinely separate document with no ancestor
// at all (a real popup window, plain browser hosts only, when window.open
// isn't blocked) — falls back to a plain readable light rendering there,
// same as wmap's own guide's fallback convention.
const guideCss = `
.tsmap-guide { font-size: 14px; color: var(--text-light, #1a1a1a); line-height: 1.65; padding: 24px 32px; max-width: var(--wmap-guide-reading-width, 720px); margin: 0 auto; box-sizing: border-box; }
.tsmap-guide h1 { font-size: 1.35em; font-weight: 700; margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid var(--border-mid, #bbb); color: var(--text-primary, #111); }
.tsmap-guide h2 { font-size: 1.1em; font-weight: 700; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle, #d8d8d8); color: var(--text-secondary, #222); }
.tsmap-guide h3 { font-size: 1em; font-weight: 700; margin: 20px 0 6px; color: var(--text-tertiary, #333); }
.tsmap-guide h4 { font-size: 0.9em; font-weight: 600; margin: 14px 0 5px; color: var(--text-muted, #555); }
.tsmap-guide p  { margin: 0 0 12px; color: var(--text-subdued, #444); }
.tsmap-guide ul, .tsmap-guide ol { padding-left: 22px; margin: 0 0 12px; color: var(--text-subdued, #444); }
.tsmap-guide li { margin-bottom: 4px; }
.tsmap-guide a  { color: var(--accent, #1a6bbf); text-decoration: none; }
.tsmap-guide a:hover { text-decoration: underline; }
.tsmap-guide strong { font-weight: 600; }
.tsmap-guide code {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  font-size: 12px; background: var(--bg-input, #fff); border: 1px solid var(--border-subtle, #d8d8d8);
  border-radius: 3px; padding: 1px 5px; color: var(--text-tertiary, #333);
}
.tsmap-guide pre {
  background: var(--bg-input, #fff); border: 1px solid var(--border-subtle, #d8d8d8);
  border-radius: 4px; padding: 10px 12px; overflow-x: auto; margin: 0 0 12px;
}
.tsmap-guide pre code { background: none; border: none; padding: 0; font-size: 12px; }
.tsmap-guide table { border-collapse: collapse; width: 100%; max-width: 900px; margin: 0 0 16px; font-size: 13px; }
.tsmap-guide th { text-align: left; padding: 7px 10px; color: var(--text-tertiary, #333); font-weight: 600; background: var(--bg-toolbar, #f0f0f0); border: 1px solid var(--border-mid, #bbb); }
.tsmap-guide td { padding: 6px 10px; color: var(--text-subdued, #444); border: 1px solid var(--border-subtle, #d8d8d8); vertical-align: top; }
.tsmap-guide tr:nth-child(even) td { background: var(--bg-row-border, #e8e8e8); }
.tsmap-guide img { max-width: 100%; height: auto; }
.tsmap-guide .tsmap-mockup { max-width: 760px; }
.tsmap-guide hr { border: none; border-top: 1px solid var(--border-subtle, #d8d8d8); margin: 24px 0; }
.tsmap-guide blockquote { border-left: 3px solid var(--border-mid, #bbb); margin: 0 0 12px; padding: 4px 12px; color: var(--text-muted, #555); }
@media print {
  .tsmap-guide h1, .tsmap-guide h2, .tsmap-guide h3, .tsmap-guide h4 { break-after: avoid; }
  .tsmap-guide pre, .tsmap-guide table, .tsmap-guide img { break-inside: avoid; }
  .tsmap-guide a { color: #000; }
}
`;

// ── Copy images ─────────────────────────────────────────────────────────────────
// Clear the WHOLE of public/guide/, not just its images/ subdirectory. This
// script owns that directory and is the only thing that writes to it, so
// anything else in there is output from a version of this script that no
// longer exists — and Vite copies public/ into dist/ verbatim, so it ships.
// That is not hypothetical: the standalone `public/guide/index.html` page this
// architecture replaced went on sitting in dist/ (and, once there was a service
// worker, in the offline precache) on every machine that had ever built the old
// version, because only images/ was being cleaned. The directory is gitignored
// generated output, so a clean checkout never saw it and nothing failed.
rmSync(GUIDE_OUT_DIR, { recursive: true, force: true });
mkdirSync(IMAGES_OUT_DIR, { recursive: true });
for (const f of readdirSync(join(ROOT, 'docs/images'))) {
  copyFileSync(join(ROOT, 'docs/images', f), join(IMAGES_OUT_DIR, f));
}

// ── Assemble the fragment (no <!doctype>/<head>/<body> — see header comment) ──
const fragment = `<style>${guideCss}</style><div class="tsmap-guide">${html}</div>`;

// ── Emit as a generated TS module (mirrors wmap's own userGuideHtml.ts) ───────
const moduleSrc = `// GENERATED by scripts/build-user-guide.mjs from docs/user-guide.md — do not edit by hand.
export const TSMAP_GUIDE_HTML = ${JSON.stringify(fragment)};
`;
writeFileSync(OUT_MODULE, moduleSrc, 'utf8');
console.log(`build:guide — src/guideExtension.ts written (+ ${readdirSync(IMAGES_OUT_DIR).length} images)`);
