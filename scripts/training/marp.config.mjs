/**
 * Marp configuration for the training decks, used by scripts/build-training.mjs.
 *
 * Deck sources link the way the rest of docs/ does, so scripts/check-doc-links.mjs
 * can check them: another session as `01-getting-data-in.md`, a docs page as
 * `../user-guide.md#column-mapping-csv-json-and-parquet`. A built deck lives at
 * site/training/NN-slug/index.html, where neither form works, so this plugin
 * rewrites them as the deck is rendered: a session link to that deck's folder,
 * and a docs link to the page on the published docs site (which also works
 * when a deck is opened straight from disk).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE_URL = /site_url\s*=\s*"([^"]+)"/.exec(readFileSync(resolve(root, 'zensical.toml'), 'utf8'))[1].replace(/\/?$/, '/');

export function rewriteHref(href) {
  let m;
  if ((m = /^(\d\d-[\w-]+)\.md(#.*)?$/.exec(href))) return `../${m[1]}/index.html${m[2] ?? ''}`;
  if ((m = /^\.\.\/([\w/-]+)\.md(#.*)?$/.exec(href))) {
    const page = m[1] === 'index' ? '' : `${m[1].replace(/\/index$/, '')}/`;
    return `${SITE_URL}${page}${m[2] ?? ''}`;
  }
  return href;
}

function linkRewriter(md) {
  md.core.ruler.push('tsmap_training_links', (state) => {
    const visit = (tokens) => {
      for (const t of tokens) {
        if (t.type === 'link_open') {
          const href = t.attrGet('href');
          if (href) t.attrSet('href', rewriteHref(href));
        }
        if (t.children) visit(t.children);
      }
    };
    visit(state.tokens);
  });
}

export default {
  html: true,
  lang: 'en-GB',
  themeSet: [resolve(root, 'docs', 'training', 'theme')],
  engine: ({ marp }) => marp.use(linkRewriter),
};
